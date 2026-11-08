from decimal import Decimal

from django.contrib.auth import get_user_model
from django.db.models import Count, Q, Sum
from django.http import HttpResponse
from django.shortcuts import get_object_or_404
from django.utils import timezone
from rest_framework import permissions, status, viewsets
from rest_framework.decorators import action, api_view, authentication_classes, permission_classes, throttle_classes
from rest_framework.exceptions import PermissionDenied
from rest_framework.response import Response
from core import verification

from .ledger import (
    MONEY_ZERO,
    credit_payment_to_school_fees,
    fee_payment_state,
    sync_class_fee_assignment_records,
)
from .models import (
    FeeStructure,
    Payment,
    Invoice,
    SchoolFeeAssignment,
    StudentSchoolFeeRecord,
)
from .pdf import build_school_fee_report_pdf
from .serializers import (
    FeeStructureSerializer,
    InvoiceSerializer,
    PaymentListSerializer,
    PaymentDetailSerializer,
    PaymentCreateSerializer,
    PaymentConfirmSerializer,
    RevenueReportSerializer,
    SchoolFeeAssignmentSerializer,
    StudentSchoolFeeRecordSerializer,
    StudentSchoolFeeRecordUpdateSerializer,
)
from .utils import (
    generate_reference_number,
    generate_receipt_number,
    generate_invoice_number,
    receipt_verification,
    resolve_receipt_token,
)
from apps.platform.access import (
    filter_student_related_by_platform_access,
    user_platform_charge_is_paid,
)
from apps.registry.permissions import RequiresApp


User = get_user_model()


class FeeStructureViewSet(viewsets.ModelViewSet):
    queryset = FeeStructure.objects.all()
    serializer_class = FeeStructureSerializer
    permission_classes = [permissions.IsAuthenticated, RequiresApp('fees')]

    def get_queryset(self):
        user = self.request.user
        queryset = FeeStructure.objects.select_related('school', 'sub_school', 'school_class', 'school_class__sub_school')

        if user.role in ['SCHOOL_ADMIN', 'SUB_ADMIN', 'BURSAR']:
            queryset = queryset.filter(school=user.school)
        else:
            queryset = queryset.none()

        sub_school_id = self.request.query_params.get('sub_school')
        if sub_school_id:
            queryset = queryset.filter(Q(sub_school_id=sub_school_id) | Q(sub_school__isnull=True))

        school_class_id = self.request.query_params.get('school_class')
        if school_class_id:
            queryset = queryset.filter(Q(school_class_id=school_class_id) | Q(school_class__isnull=True))

        return queryset.order_by('-academic_year', 'role', 'school_class__name', 'name')

    def create(self, request, *args, **kwargs):
        if request.user.role not in ['SCHOOL_ADMIN', 'SUB_ADMIN', 'BURSAR']:
            raise PermissionDenied("Only bursars and school administrators can create fee structures.")

        data = request.data.copy()
        data['school'] = request.user.school.id
        # academic_year is part of the (school, name, academic_year) uniqueness
        # rule, so DRF's UniqueTogetherValidator requires it *present* before our
        # serializer.validate() can fill it. Inject the school's current year here.
        if not str(data.get('academic_year') or '').strip():
            try:
                data['academic_year'] = request.user.school.settings.academic_year or str(timezone.now().year)
            except Exception:  # noqa: BLE001
                data['academic_year'] = str(timezone.now().year)
        serializer = self.get_serializer(data=data)
        serializer.is_valid(raise_exception=True)
        fee = serializer.save(school=request.user.school)
        self._notify_fee_type(fee, request.user)
        headers = self.get_success_headers(serializer.data)
        return Response(serializer.data, status=status.HTTP_201_CREATED, headers=headers)

    # ------------------------------------------------------------------
    # Student / parent visibility of bursar-defined fee types
    # ------------------------------------------------------------------
    @staticmethod
    def _students_for_fee(fee):
        """Every student a fee type applies to (sub-school AND class match)."""
        from apps.students import api as students_api

        students = (
            students_api.list_students(school=fee.school_id)
            .select_related('school_class__sub_school')
            .filter(user__role='STUDENT')
        )
        if fee.school_class_id:
            students = students.filter(school_class_id=fee.school_class_id)
        elif fee.sub_school_id:
            students = students.filter(school_class__sub_school_id=fee.sub_school_id)
        return students

    def _notify_fee_type(self, fee, actor):
        try:
            from apps.notifications.utils import notify_users

            currency = fee.currency or 'XAF'
            amount = f"{float(fee.amount or 0):,.0f} {currency}"
            students = list(self._students_for_fee(fee))
            student_users = [s.user for s in students if s.user_id]
            if student_users:
                notify_users(
                    student_users,
                    'New fee published',
                    f'A new fee "{fee.name}" ({amount}) has been added to your fee list.',
                    notification_type='fee_payment',
                    sender=actor,
                )
            # Parents, named per child.
            for student in students:
                child_name = student.display_name or 'your child'
                parent_users = [link.parent for link in student.parent_links.select_related('parent').all() if link.parent_id]
                if parent_users:
                    notify_users(
                        parent_users,
                        'New fee published',
                        f'A new fee "{fee.name}" ({amount}) has been added for {child_name}.',
                        notification_type='fee_payment',
                        sender=actor,
                    )
        except Exception:  # noqa: BLE001 — notifications must never block fee creation
            pass

    def _fee_items_for_student(self, student):
        """Applicable fee types for a single student, with paid status."""
        user = student.user
        klass = student.school_class
        class_id = klass.id if klass else None
        sub_id = klass.sub_school_id if klass else None

        fees = FeeStructure.objects.filter(
            school_id=student.school_id, role='STUDENT'
        ).select_related('school_class__sub_school', 'sub_school')

        class_q = Q(school_class__isnull=True)
        if class_id:
            class_q |= Q(school_class_id=class_id)
        sub_q = Q(sub_school__isnull=True)
        if sub_id:
            sub_q |= Q(sub_school_id=sub_id)
        fees = fees.filter(class_q & sub_q).order_by('name')

        paid = {}
        # A learner without a login has no payer account, so nothing is paid
        # through one (filtering payer=None would match unrelated rows).
        for payment in (
            Payment.objects.filter(payer=user, status='confirmed', fee_structure__in=fees).order_by('payment_date')
            if user is not None else []
        ):
            paid[str(payment.fee_structure_id)] = payment

        items = []
        for fee in fees:
            payment = paid.get(str(fee.id))
            if fee.sub_school_id:
                sub_name = fee.sub_school.name
            elif fee.school_class_id and fee.school_class.sub_school_id:
                sub_name = fee.school_class.sub_school.name
            else:
                sub_name = 'All sub-schools'
            items.append({
                'fee_id': str(fee.id),
                'name': fee.name,
                'amount': float(fee.amount or 0),
                'currency': fee.currency or 'XAF',
                'due_date': fee.due_date,
                'description': fee.description or '',
                'class_name': fee.school_class.name if fee.school_class_id else 'All classes',
                'sub_school_name': sub_name,
                'student_id': str(user.id) if user is not None else str(student.id),
                'student_name': student.display_name,
                'student_matricule': student.display_matricule or '',
                'admission_number': student.admission_number or '',
                'status': 'paid' if payment else 'unpaid',
                'amount_paid': float(payment.amount) if payment else 0,
                'payment_date': payment.payment_date if payment else None,
                'receipt_number': payment.receipt_number if payment else '',
                'reference_number': payment.reference_number if payment else '',
                **(receipt_verification(payment) if payment else {'verify_url': '', 'qr_code': ''}),
                'payment_method': payment.get_payment_method_display() if payment else '',
            })
        return items

    @action(detail=True, methods=['get'], url_path='student-status')
    def student_status(self, request, pk=None):
        """
        Every learner this fee type applies to, and whether they have paid it.

        Students pay by fee type, but the school fee ledger is built per class,
        so it cannot answer "who has paid the PTA levy". This walks the other
        way: take the fee, find the learners it covers using the same class and
        sub-school rule my_fees uses, and mark off the confirmed payments.
        """
        if request.user.role not in ['SCHOOL_ADMIN', 'SUB_ADMIN', 'BURSAR']:
            raise PermissionDenied('Only bursars and school administrators can view fee collection.')

        fee = self.get_object()
        if request.user.school_id and fee.school_id != request.user.school_id:
            raise PermissionDenied('That fee belongs to another school.')

        from apps.students import api as students_api

        students = students_api.list_students(school=fee.school).select_related(
            'user', 'school_class__sub_school',
        )
        # A fee with no class targets every class; likewise for sub-schools.
        if fee.school_class_id:
            students = students.filter(school_class_id=fee.school_class_id)
        elif fee.sub_school_id:
            students = students.filter(school_class__sub_school_id=fee.sub_school_id)

        paid_by_user = {}
        for payment in Payment.objects.filter(
            fee_structure=fee, status='confirmed',
        ).order_by('payment_date'):
            paid_by_user[payment.payer_id] = payment

        amount = float(fee.amount or 0)
        rows = []
        for student in students:
            payment = paid_by_user.get(student.user_id)
            rows.append({
                'student_id': str(student.id),
                'student_name': student.display_name,
                'student_matricule': student.display_matricule or '',
                'admission_number': student.admission_number or '',
                'class_name': student.school_class.name if student.school_class_id else student.student_class,
                'class_id': str(student.school_class_id) if student.school_class_id else '',
                'amount_due': amount,
                'amount_paid': float(payment.amount) if payment else 0.0,
                'balance': 0.0 if payment else amount,
                'status': 'paid' if payment else 'unpaid',
                'payment_date': payment.payment_date if payment else None,
                'receipt_number': payment.receipt_number if payment else '',
            })

        rows.sort(key=lambda row: (row['class_name'] or '', row['student_name'] or ''))
        paid_count = sum(1 for row in rows if row['status'] == 'paid')
        return Response({
            'fee_id': str(fee.id),
            'fee_name': fee.name,
            'amount': amount,
            'currency': fee.currency or 'XAF',
            'class_name': fee.school_class.name if fee.school_class_id else 'All classes',
            'total_students': len(rows),
            'paid_count': paid_count,
            'unpaid_count': len(rows) - paid_count,
            'expected_total': amount * len(rows),
            'collected_total': sum(row['amount_paid'] for row in rows),
            'results': rows,
        })

    @action(detail=False, methods=['get'], url_path='school-ledger')
    def school_ledger(self, request):
        """Every learner against every fee they are charged, and what is left.

        One row per learner per fee, which is how a bursar thinks about it:
        "who still owes the PTA levy", "has this class paid tuition".

        Pending payments count towards the total, the same as when a payment is
        recorded, so a fee settled minutes ago does not read as unpaid while it
        waits for confirmation.
        """
        if request.user.role not in ['SCHOOL_ADMIN', 'SUB_ADMIN', 'BURSAR']:
            raise PermissionDenied('Only bursars and school administrators can view fee collection.')

        school_id = request.user.school_id
        if not school_id:
            raise PermissionDenied('Your account is not linked to a school.')

        from apps.students import api as students_api

        fees = list(FeeStructure.objects.filter(school_id=school_id, role='STUDENT'))
        students = list(
            students_api.list_students(school=request.user.school).select_related(
                'user', 'school_class__sub_school',
            )
        )

        # Every payment for these fees, totalled per learner per fee, in one
        # query rather than one per pair.
        totals = {}
        for row in Payment.objects.filter(
            school_id=school_id,
            fee_structure__in=fees,
            status__in=['pending', 'confirmed'],
        ).values('fee_structure_id', 'payer_id').annotate(paid=Sum('amount')):
            totals[(row['fee_structure_id'], row['payer_id'])] = row['paid'] or Decimal('0.00')

        rows = []
        for fee in fees:
            due = Decimal(fee.amount or 0)
            for student in students:
                # A fee with no class targets every class; likewise sub-schools.
                if fee.school_class_id and student.school_class_id != fee.school_class_id:
                    continue
                if (
                    not fee.school_class_id
                    and fee.sub_school_id
                    and getattr(student.school_class, 'sub_school_id', None) != fee.sub_school_id
                ):
                    continue

                paid = Decimal(totals.get((fee.id, student.user_id), 0))
                balance = max(due - paid, Decimal('0.00'))
                if due <= 0 or paid >= due:
                    state = 'paid'
                elif paid > 0:
                    state = 'incomplete'
                else:
                    state = 'unpaid'

                rows.append({
                    'id': f'{fee.id}-{student.id}',
                    'fee_id': str(fee.id),
                    'fee_name': fee.name,
                    'student_id': str(student.id),
                    'student_name': student.display_name,
                    'student_matricule': student.display_matricule or '',
                    'admission_number': student.admission_number or '',
                    'class_id': str(student.school_class_id) if student.school_class_id else '',
                    'class_name': (
                        student.school_class.name if student.school_class_id else student.student_class
                    ),
                    'sub_school_name': (
                        student.school_class.sub_school.name
                        if student.school_class_id and student.school_class.sub_school_id
                        else ''
                    ),
                    'currency': fee.currency or 'XAF',
                    'total_amount': str(due),
                    'amount_paid': str(paid),
                    'balance': str(balance),
                    'status': state,
                })

        rows.sort(key=lambda row: (row['class_name'] or '', row['student_name'] or '', row['fee_name'] or ''))

        return Response({
            'count': len(rows),
            'results': rows,
        })

    @action(detail=False, methods=['get'], url_path='my-fees')
    def my_fees(self, request):
        """Fee types applicable to the requesting student, or the parent's children."""
        user = request.user
        if user.role == 'STUDENT':
            student = getattr(user, 'student_profile', None)
            if not student:
                return Response([])
            return Response(self._fee_items_for_student(student))

        if user.role == 'PARENT':
            items = []
            seen = set()
            links = user.linked_students.select_related(
                'student__user', 'student__school_class__sub_school'
            )
            for link in links:
                student = link.student
                if student.id in seen:
                    continue
                seen.add(student.id)
                if not user_platform_charge_is_paid(student.user):
                    continue
                items.extend(self._fee_items_for_student(student))
            return Response(items)

        return Response([])

    def update(self, request, *args, **kwargs):
        if request.user.role not in ['SCHOOL_ADMIN', 'SUB_ADMIN', 'BURSAR']:
            raise PermissionDenied("Only bursars and school administrators can update fee structures.")
        partial = kwargs.pop('partial', False)
        instance = self.get_object()
        data = request.data.copy()
        data['school'] = request.user.school.id
        serializer = self.get_serializer(instance, data=data, partial=partial)
        serializer.is_valid(raise_exception=True)
        serializer.save(school=request.user.school)
        return Response(serializer.data)


class PaymentViewSet(viewsets.ModelViewSet):
    queryset = Payment.objects.select_related('payer', 'fee_structure', 'bursar')
    permission_classes = [permissions.IsAuthenticated, RequiresApp('fees')]

    def get_serializer_class(self):
        if self.action == 'create':
            return PaymentCreateSerializer
        if self.action == 'retrieve':
            return PaymentDetailSerializer
        if self.action in ['confirm', 'reject']:
            return PaymentConfirmSerializer
        return PaymentListSerializer

    def get_queryset(self):
        user = self.request.user
        queryset = Payment.objects.select_related('payer', 'fee_structure', 'bursar')

        if user.role in ['SCHOOL_ADMIN', 'SUB_ADMIN', 'BURSAR']:
            queryset = queryset.filter(school=user.school)
        elif user.role in ['STUDENT', 'PARENT']:
            queryset = queryset.filter(payer=user)
        else:
            queryset = queryset.none()

        return queryset

    def create(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        is_staff_payment = request.user.role in ['SCHOOL_ADMIN', 'SUB_ADMIN', 'BURSAR']
        payer = serializer.validated_data.get('payer') or request.user
        fee_structure = serializer.validated_data.get('fee_structure')
        mark_license_paid = serializer.validated_data.get('mark_license_paid', False)
        is_self_service_license_payment = (
            not is_staff_payment
            and request.user.is_authenticated
            and payer == request.user
            and request.user.school_id is not None
            and fee_structure is None
            and mark_license_paid
        )

        # A bursar / administrator settling a student's platform charge on their behalf.
        is_staff_license_payment = (
            is_staff_payment
            and fee_structure is None
            and mark_license_paid
            and request.user.role in ['SCHOOL_ADMIN', 'SUB_ADMIN', 'BURSAR']
        )

        if not is_staff_payment and not is_self_service_license_payment:
            raise PermissionDenied("Only bursars and administrators can record school fee payments.")
        if is_staff_payment and getattr(payer, 'role', None) == 'STUDENT' and fee_structure is not None and not user_platform_charge_is_paid(payer):
            raise PermissionDenied("This student's platform charges are unpaid. School-fee payments cannot be recorded until the platform charge is cleared.")

        # A fee is recorded once. Hiding a settled fee in the dropdown is
        # presentation; this is what actually stops it being taken twice,
        # whether from a stale screen, a double tap, two bursars working at
        # once, or a queued offline payment arriving late.
        #
        # Instalments are still allowed, because the ledger has an
        # "incomplete" state and schools do collect in parts: what is
        # refused is paying more than is left, not paying in stages.
        if fee_structure is not None:
            state = fee_payment_state(payer, fee_structure)
            if state['outstanding'] <= MONEY_ZERO:
                return Response(
                    {
                        'detail': (
                            f'"{fee_structure.name}" is already fully paid for this student. '
                            f'It cannot be recorded again.'
                        ),
                        'code': 'fee_already_paid',
                    },
                    status=status.HTTP_400_BAD_REQUEST,
                )
            amount = serializer.validated_data.get('amount') or MONEY_ZERO
            if amount > state['outstanding']:
                return Response(
                    {
                        'detail': (
                            f'Only {state["outstanding"]} {fee_structure.currency or "XAF"} is '
                            f'outstanding on "{fee_structure.name}" for this student.'
                        ),
                        'code': 'amount_exceeds_outstanding',
                    },
                    status=status.HTTP_400_BAD_REQUEST,
                )

        payment = serializer.save(
            school=request.user.school,
            bursar=request.user if is_staff_payment else None,
            reference_number=generate_reference_number(),
        )

        if is_self_service_license_payment or is_staff_license_payment:
            payment.status = 'confirmed'
            payment.confirmed_at = timezone.now()
            payment.receipt_number = generate_receipt_number()
            payment.notes = payment.notes or (
                'Platform charge settled by school staff' if is_staff_license_payment
                else 'Self-service platform license payment'
            )
            payment.save(update_fields=['status', 'confirmed_at', 'receipt_number', 'notes', 'modified'])
            Invoice.objects.get_or_create(
                payment=payment,
                defaults={
                    'invoice_number': generate_invoice_number(),
                    'issued_by': request.user if is_staff_license_payment else None,
                }
            )

        try:
            from apps.notifications.utils import notify_users

            if is_staff_license_payment:
                notify_users(
                    [payer],
                    'Platform charge paid',
                    'Your platform charge was settled by the school. Your account is now fully active.',
                    notification_type='fee_payment',
                    sender=request.user,
                )
            elif is_staff_payment and payer != request.user:
                fee_label = fee_structure.name if fee_structure else 'School fees'
                notify_users(
                    [payer],
                    'Payment recorded',
                    f'A payment of {payment.amount} {payment.currency or "XAF"} for "{fee_label}" was recorded on your account.',
                    notification_type='fee_payment',
                    sender=request.user,
                )
        except Exception:  # noqa: BLE001
            pass

        return Response(
            PaymentDetailSerializer(payment).data,
            status=status.HTTP_201_CREATED
        )

    @action(detail=False, methods=['get'], url_path='student-fee-status')
    def student_fee_status(self, request):
        """Every fee this student could be charged, and what is left on each.

        The screen that records a payment needs this before it offers a fee:
        without it a bursar is shown fees the student settled weeks ago and
        can record them again.
        """
        if request.user.role not in ['SCHOOL_ADMIN', 'SUB_ADMIN', 'BURSAR']:
            raise PermissionDenied("Only bursars and administrators can read a student's fee status.")

        student_id = request.query_params.get('student')
        if not student_id:
            return Response({'detail': 'A student is required.'}, status=status.HTTP_400_BAD_REQUEST)

        User = get_user_model()
        payer = User.objects.filter(id=student_id, school=request.user.school).first()
        if payer is None:
            return Response({'detail': 'No such student at this school.'}, status=status.HTTP_404_NOT_FOUND)

        structures = FeeStructure.objects.filter(school=request.user.school)

        rows = []
        for structure in structures:
            state = fee_payment_state(payer, structure)
            rows.append({
                'fee_structure': str(structure.id),
                'name': structure.name,
                'amount': str(state['total']),
                'paid': str(state['paid']),
                'outstanding': str(state['outstanding']),
                'status': state['status'],
                'currency': structure.currency or 'XAF',
            })

        return Response({'student': str(payer.id), 'results': rows})

    @action(detail=False, methods=['get'], url_path='activity')
    def activity(self, request):
        """Who recorded what, and when.

        A bursar and an administrator can both take a payment, confirm one
        and adjust the ledger, so neither can tell from the figures alone
        which of them did a thing. This is the answer to that: one feed of
        what happened, in order, with the name against each entry.

        Built from the records themselves rather than a separate audit
        table, so it cannot drift from what actually happened - and it
        already covers everything done before today.
        """
        if request.user.role not in ['SCHOOL_ADMIN', 'SUB_ADMIN', 'BURSAR']:
            raise PermissionDenied(
                'Only bursars and school administrators can see the fee activity log.'
            )

        school = request.user.school
        if not school:
            return Response({'results': []})

        try:
            limit = min(int(request.query_params.get('limit', 100)), 300)
        except (TypeError, ValueError):
            limit = 100

        entries = []

        payments = (
            Payment.objects.filter(school=school).select_related('payer', 'bursar', 'fee_structure')
            .order_by('-created')[:limit]
        )
        for payment in payments:
            who = payment.bursar
            entries.append({
                'at': payment.created,
                'action': 'Payment recorded',
                'who': who.get_full_name() if who else 'Unknown',
                'who_role': getattr(who, 'role', '') if who else '',
                'subject': payment.payer.get_full_name() if payment.payer_id else '',
                'detail': (
                    f'{payment.amount} {payment.currency} for '
                    f'"{payment.fee_structure.name}"' if payment.fee_structure_id
                    else f'{payment.amount} {payment.currency}'
                ),
                'reference': payment.reference_number,
            })
            if payment.status == 'confirmed' and payment.confirmed_at:
                entries.append({
                    'at': payment.confirmed_at,
                    'action': 'Payment confirmed',
                    'who': who.get_full_name() if who else 'Unknown',
                    'who_role': getattr(who, 'role', '') if who else '',
                    'subject': payment.payer.get_full_name() if payment.payer_id else '',
                    'detail': f'receipt {payment.receipt_number or "-"}',
                    'reference': payment.reference_number,
                })

        ledger = (
            StudentSchoolFeeRecord.objects.filter(school=school, last_recorded_at__isnull=False)
            .select_related('student__user', 'updated_by', 'fee_assignment__school_class')
            .order_by('-last_recorded_at')[:limit]
        )
        for record in ledger:
            who = record.updated_by
            entries.append({
                'at': record.last_recorded_at,
                'action': 'Ledger updated',
                'who': who.get_full_name() if who else 'Unknown',
                'who_role': getattr(who, 'role', '') if who else '',
                'subject': record.student.display_name if record.student_id else '',
                'detail': f'paid {record.amount_paid}, balance {record.balance}',
                'reference': '',
            })

        fee_types = (
            FeeStructure.objects.filter(school=school).select_related('school')
            .order_by('-created')[:limit]
        )
        for fee in fee_types:
            entries.append({
                'at': fee.created,
                'action': 'Fee type created',
                'who': '',
                'who_role': '',
                'subject': '',
                'detail': f'"{fee.name}" at {fee.amount} {fee.currency}',
                'reference': '',
            })

        entries.sort(key=lambda e: e['at'], reverse=True)
        return Response({
            'count': len(entries[:limit]),
            'results': [
                {
                    **entry,
                    'at': entry['at'].isoformat() if entry['at'] else None,
                }
                for entry in entries[:limit]
            ],
        })

    @action(detail=True, methods=['post'])
    def confirm(self, request, pk=None):
        if request.user.role not in ['SCHOOL_ADMIN', 'SUB_ADMIN', 'BURSAR']:
            raise PermissionDenied("Only bursars and administrators can confirm payments.")

        payment = self.get_object()
        if (
            payment.payer
            and payment.payer.role == 'STUDENT'
            and payment.fee_structure_id
            and not user_platform_charge_is_paid(payment.payer)
        ):
            raise PermissionDenied("This student's platform charges are unpaid. This school-fee payment cannot be confirmed until the platform charge is cleared.")
        if payment.status != 'pending':
            return Response(
                {'error': f'Payment is already {payment.status}.'},
                status=status.HTTP_400_BAD_REQUEST
            )

        serializer = PaymentConfirmSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        receipt_number = serializer.validated_data.get('receipt_number', generate_receipt_number())

        payment.status = 'confirmed'
        payment.confirmed_at = timezone.now()
        payment.receipt_number = receipt_number
        payment.save()

        # Put it on the student's ledger, which is what the Fee Records tab
        # shows. Without this the payment is recorded and a receipt printed
        # while the ledger still says the student has paid nothing.
        credit_payment_to_school_fees(payment, actor=request.user)

        invoice = Invoice.objects.create(
            payment=payment,
            invoice_number=generate_invoice_number(),
            issued_by=request.user,
        )

        return Response(
            {
                'payment': PaymentDetailSerializer(payment).data,
                'invoice': InvoiceSerializer(invoice).data,
            },
            status=status.HTTP_200_OK
        )

    @action(detail=True, methods=['post'])
    def reject(self, request, pk=None):
        if request.user.role not in ['SCHOOL_ADMIN', 'SUB_ADMIN', 'BURSAR']:
            raise PermissionDenied("Only bursars and administrators can reject payments.")

        payment = self.get_object()
        if payment.status != 'pending':
            return Response(
                {'error': 'Only pending payments can be rejected.'},
                status=status.HTTP_400_BAD_REQUEST
            )

        payment.status = 'rejected'
        payment.notes = request.data.get('reason', '')
        payment.save()
        return Response(PaymentDetailSerializer(payment).data, status=status.HTTP_200_OK)

    @action(detail=False, methods=['get'])
    def my_payments(self, request):
        queryset = self.get_queryset().filter(payer=request.user)
        serializer = self.get_serializer(queryset, many=True)
        return Response(serializer.data)

    @action(detail=False, methods=['get'])
    def revenue_report(self, request):
        if request.user.role not in ['SCHOOL_ADMIN', 'SUB_ADMIN', 'BURSAR']:
            raise PermissionDenied("Only school staff can view revenue reports.")

        start_date = request.query_params.get('start_date')
        end_date = request.query_params.get('end_date')

        queryset = Payment.objects.filter(school=request.user.school, status='confirmed')
        if start_date:
            queryset = queryset.filter(payment_date__gte=start_date)
        if end_date:
            queryset = queryset.filter(payment_date__lte=end_date)

        total_collected = queryset.aggregate(Sum('amount'))['amount__sum'] or Decimal('0.00')
        total_pending = Payment.objects.filter(
            school=request.user.school,
            status='pending'
        ).aggregate(Sum('amount'))['amount__sum'] or Decimal('0.00')
        total_rejected = Payment.objects.filter(
            school=request.user.school,
            status='rejected'
        ).aggregate(Sum('amount'))['amount__sum'] or Decimal('0.00')

        by_method = {}
        for method, _ in Payment.PAYMENT_METHOD_CHOICES:
            amount = queryset.filter(payment_method=method).aggregate(Sum('amount'))['amount__sum'] or Decimal('0.00')
            by_method[method] = float(amount)

        by_fee_type = {}
        for fee in queryset.values('fee_structure__name').annotate(total=Sum('amount')):
            if fee['fee_structure__name']:
                by_fee_type[fee['fee_structure__name']] = float(fee['total'])

        data = {
            'total_collected': float(total_collected),
            'total_pending': float(total_pending),
            'total_rejected': float(total_rejected),
            'period': f"{start_date or 'All'} to {end_date or 'All'}",
            'by_method': by_method,
            'by_fee_type': by_fee_type,
            'payment_count': queryset.count(),
        }
        serializer = RevenueReportSerializer(data)
        return Response(serializer.data)

    @action(detail=False, methods=['get'])
    def financial_overview(self, request):
        """Expected vs collected revenue across school fees and every fee type."""
        if request.user.role not in ['SCHOOL_ADMIN', 'SUB_ADMIN', 'BURSAR']:
            raise PermissionDenied("Only school staff can view financial analytics.")

        school = request.user.school
        currency = 'XAF'

        # School fees (per-student class allocations).
        school_fee_records = StudentSchoolFeeRecord.objects.filter(school=school, is_active=True)
        school_fees_expected = school_fee_records.aggregate(total=Sum('total_amount'))['total'] or Decimal('0.00')
        school_fees_collected = school_fee_records.aggregate(total=Sum('amount_paid'))['total'] or Decimal('0.00')
        school_fees_outstanding = school_fee_records.aggregate(total=Sum('balance'))['total'] or Decimal('0.00')
        student_count = school_fee_records.values('student').distinct().count()

        # Fee types (FeeStructure): expected = amount x eligible members for that role.
        fee_types = []
        fee_types_expected_total = Decimal('0.00')
        fee_types_collected_total = Decimal('0.00')
        for fee in FeeStructure.objects.filter(school=school):
            eligible_count = User.objects.filter(school=school, role=fee.role, is_drafted=False).count()
            expected = (fee.amount or Decimal('0.00')) * eligible_count
            collected = Payment.objects.filter(
                school=school, fee_structure=fee, status='confirmed'
            ).aggregate(total=Sum('amount'))['total'] or Decimal('0.00')
            fee_types_expected_total += expected
            fee_types_collected_total += collected
            fee_types.append({
                'id': str(fee.id),
                'name': fee.name,
                'role': fee.role,
                'amount': float(fee.amount or 0),
                'currency': fee.currency or currency,
                'eligible_count': eligible_count,
                'expected': float(expected),
                'collected': float(collected),
                'outstanding': float(expected - collected if expected > collected else 0),
            })

        total_expected = school_fees_expected + fee_types_expected_total
        total_collected = school_fees_collected + fee_types_collected_total

        return Response({
            'currency': currency,
            'school_fees': {
                'expected': float(school_fees_expected),
                'collected': float(school_fees_collected),
                'outstanding': float(school_fees_outstanding),
                'student_count': student_count,
            },
            'fee_types': fee_types,
            'fee_types_expected_total': float(fee_types_expected_total),
            'fee_types_collected_total': float(fee_types_collected_total),
            'total_expected_revenue': float(total_expected),
            'total_collected_revenue': float(total_collected),
            'total_outstanding_revenue': float(total_expected - total_collected if total_expected > total_collected else 0),
        })

    @action(detail=False, methods=['get'])
    def outstanding_fees(self, request):
        if request.user.role not in ['SCHOOL_ADMIN', 'SUB_ADMIN', 'BURSAR']:
            raise PermissionDenied("Only school staff can view outstanding fees.")

        fee_structures = FeeStructure.objects.filter(school=request.user.school)
        outstanding_data = []

        for fee in fee_structures:
            users = User.objects.filter(school=request.user.school, role=fee.role)
            for user in users:
                has_paid = Payment.objects.filter(
                    payer=user,
                    fee_structure=fee,
                    status='confirmed',
                ).exists()
                if has_paid:
                    continue

                total_owed = fee.amount
                total_paid = Payment.objects.filter(
                    payer=user,
                    fee_structure=fee,
                    status='confirmed',
                ).aggregate(Sum('amount'))['amount__sum'] or Decimal('0.00')

                outstanding_data.append({
                    'user_id': str(user.id),
                    'user_name': user.get_full_name(),
                    'total_owed': float(total_owed),
                    'total_paid': float(total_paid),
                    'pending_payments': Payment.objects.filter(payer=user, fee_structure=fee, status='pending').count(),
                    'paid_payments': Payment.objects.filter(payer=user, fee_structure=fee, status='confirmed').count(),
                    'compliance_percentage': float(total_paid / total_owed * 100) if total_owed > 0 else 0,
                })

        return Response(outstanding_data)

    @action(detail=True, methods=['get'])
    def generate_receipt(self, request, pk=None):
        payment = self.get_object()
        if payment.status != 'confirmed':
            return Response({'error': 'Only confirmed payments have receipts.'}, status=status.HTTP_400_BAD_REQUEST)

        try:
            invoice = payment.invoice
        except Invoice.DoesNotExist:
            return Response({'error': 'Receipt not found for this payment.'}, status=status.HTTP_404_NOT_FOUND)

        data = {
            'receipt_number': payment.receipt_number,
            'invoice_number': invoice.invoice_number,
            'payment_date': payment.payment_date,
            'payer_name': payment.payer.get_full_name(),
            'payer_email': payment.payer.email,
            'amount': float(payment.amount),
            'currency': payment.currency,
            'fee_description': payment.fee_structure.name if payment.fee_structure else 'General Payment',
            'payment_method': payment.get_payment_method_display(),
            'school_name': payment.school.name,
            'school_address': payment.school.address if hasattr(payment.school, 'address') else '',
        }
        return Response(data)


class SchoolFeeAssignmentViewSet(viewsets.ModelViewSet):
    serializer_class = SchoolFeeAssignmentSerializer
    permission_classes = [permissions.IsAuthenticated, RequiresApp('fees')]

    def get_queryset(self):
        user = self.request.user
        # SchoolFeeAssignmentSerializer has 7 SerializerMethodFields that each
        # re-query obj.student_records -- annotating them here turns a page of
        # 20 assignments from ~140-160 extra queries into 0. The serializer
        # reads these via getattr()/hasattr() and falls back to the original
        # per-instance query if an instance ever arrives unannotated.
        active_records = Q(student_records__is_active=True)
        queryset = SchoolFeeAssignment.objects.select_related(
            'school_class__sub_school', 'created_by', 'updated_by'
        ).annotate(
            ann_student_count=Count('student_records', filter=active_records, distinct=True),
            ann_total_collected=Sum('student_records__amount_paid', filter=active_records),
            ann_total_outstanding=Sum('student_records__balance', filter=active_records),
            ann_paid_students=Count(
                'student_records',
                filter=active_records & Q(student_records__status=StudentSchoolFeeRecord.STATUS_PAID),
                distinct=True,
            ),
            ann_incomplete_students=Count(
                'student_records',
                filter=active_records & Q(student_records__status=StudentSchoolFeeRecord.STATUS_INCOMPLETE),
                distinct=True,
            ),
            ann_unpaid_students=Count(
                'student_records',
                filter=active_records & Q(student_records__status=StudentSchoolFeeRecord.STATUS_UNPAID),
                distinct=True,
            ),
        )
        if user.role in ['SCHOOL_ADMIN', 'SUB_ADMIN', 'BURSAR'] and user.school_id:
            queryset = queryset.filter(school=user.school)
        else:
            return queryset.none()

        school_class_id = self.request.query_params.get('school_class')
        if school_class_id:
            queryset = queryset.filter(school_class_id=school_class_id)
        return queryset.order_by('school_class__name', '-academic_year')

    def create(self, request, *args, **kwargs):
        if request.user.role not in ['SCHOOL_ADMIN', 'SUB_ADMIN', 'BURSAR']:
            raise PermissionDenied("Only bursars and school administrators can manage school fee allocations.")
        return super().create(request, *args, **kwargs)

    def update(self, request, *args, **kwargs):
        if request.user.role not in ['SCHOOL_ADMIN', 'SUB_ADMIN', 'BURSAR']:
            raise PermissionDenied("Only bursars and school administrators can manage school fee allocations.")
        return super().update(request, *args, **kwargs)

    def destroy(self, request, *args, **kwargs):
        if request.user.role not in ['SCHOOL_ADMIN', 'SUB_ADMIN', 'BURSAR']:
            raise PermissionDenied("Only bursars and school administrators can manage school fee allocations.")
        return super().destroy(request, *args, **kwargs)


class StudentSchoolFeeRecordViewSet(viewsets.ModelViewSet):
    permission_classes = [permissions.IsAuthenticated, RequiresApp('fees')]
    queryset = StudentSchoolFeeRecord.objects.select_related(
        'student__user',
        'student__school_class__sub_school',
        'fee_assignment__school_class__sub_school',
        'updated_by',
    )

    def get_serializer_class(self):
        if self.action in ['update', 'partial_update']:
            return StudentSchoolFeeRecordUpdateSerializer
        return StudentSchoolFeeRecordSerializer

    def _ensure_school_access(self):
        school = getattr(self.request.user, 'school', None)
        if not school:
            raise PermissionDenied("Your account is not linked to a school.")
        return school

    def _ensure_staff_summary_access(self):
        if self.request.user.role not in ['SCHOOL_ADMIN', 'SUB_ADMIN', 'BURSAR']:
            raise PermissionDenied("Only bursars and school administrators can view school-wide fee summaries.")
        return self._ensure_school_access()

    def _sync_school_records(self, school):
        for assignment in SchoolFeeAssignment.objects.filter(school=school, is_active=True).select_related('school_class'):
            sync_class_fee_assignment_records(assignment)

    def get_queryset(self):
        user = self.request.user
        queryset = StudentSchoolFeeRecord.objects.select_related(
            'student__user',
            'student__school_class__sub_school',
            'fee_assignment__school_class__sub_school',
            'updated_by',
        )

        if user.role in ['SCHOOL_ADMIN', 'SUB_ADMIN', 'BURSAR']:
            if not user.school_id:
                return queryset.none()
            queryset = queryset.filter(school=user.school, is_active=True)
        elif user.role == 'STUDENT':
            queryset = queryset.filter(student__user=user, is_active=True)
        elif user.role == 'PARENT':
            queryset = filter_student_related_by_platform_access(queryset.filter(
                student__parent_links__parent=user,
                is_active=True,
            ).distinct())
        else:
            return queryset.none()

        school_class_id = self.request.query_params.get('school_class')
        if school_class_id:
            queryset = queryset.filter(fee_assignment__school_class_id=school_class_id)

        status_filter = self.request.query_params.get('status')
        if status_filter and status_filter.lower() not in ['all', 'any']:
            queryset = queryset.filter(status=status_filter.lower())

        search = (self.request.query_params.get('search') or '').strip()
        if search:
            queryset = queryset.filter(
                Q(student__user__name__icontains=search)
                | Q(student__user__email__icontains=search)
                | Q(student__user__matricule__icontains=search)
                | Q(student__admission_number__icontains=search)
                | Q(fee_assignment__school_class__name__icontains=search)
            )

        return queryset.order_by('fee_assignment__school_class__name', 'student__user__name')

    def list(self, request, *args, **kwargs):
        if request.user.role in ['SCHOOL_ADMIN', 'SUB_ADMIN', 'BURSAR']:
            school = self._ensure_school_access()
            self._sync_school_records(school)
        return super().list(request, *args, **kwargs)

    def create(self, request, *args, **kwargs):
        raise PermissionDenied("Student school-fee records are generated automatically from class fee allocations.")

    def update(self, request, *args, **kwargs):
        if request.user.role not in ['SCHOOL_ADMIN', 'SUB_ADMIN', 'BURSAR']:
            raise PermissionDenied("Only bursars and school administrators can update school fee records.")
        record = self.get_object()
        if not user_platform_charge_is_paid(record.student.user):
            raise PermissionDenied("This student's platform charges are unpaid. Bursars cannot update school fees for this student until the platform charge is cleared.")
        return super().update(request, *args, **kwargs)

    def partial_update(self, request, *args, **kwargs):
        if request.user.role not in ['SCHOOL_ADMIN', 'SUB_ADMIN', 'BURSAR']:
            raise PermissionDenied("Only bursars and school administrators can update school fee records.")
        record = self.get_object()
        if not user_platform_charge_is_paid(record.student.user):
            raise PermissionDenied("This student's platform charges are unpaid. Bursars cannot update school fees for this student until the platform charge is cleared.")
        return super().partial_update(request, *args, **kwargs)

    def destroy(self, request, *args, **kwargs):
        raise PermissionDenied("Student school-fee records cannot be deleted manually.")

    @action(detail=False, methods=['get'])
    def summary(self, request):
        school = self._ensure_staff_summary_access()
        self._sync_school_records(school)

        assignment_queryset = SchoolFeeAssignment.objects.filter(school=school, is_active=True).select_related('school_class__sub_school')
        filtered_class_id = request.query_params.get('school_class')
        if filtered_class_id:
            assignment_queryset = assignment_queryset.filter(school_class_id=filtered_class_id)

        school_records = StudentSchoolFeeRecord.objects.filter(school=school, is_active=True)
        filtered_records = self.get_queryset()

        def build_totals(queryset):
            total_expected = queryset.aggregate(total=Sum('total_amount')).get('total') or MONEY_ZERO
            total_collected = queryset.aggregate(total=Sum('amount_paid')).get('total') or MONEY_ZERO
            total_outstanding = queryset.aggregate(total=Sum('balance')).get('total') or MONEY_ZERO
            student_count = queryset.count()
            paid_students = queryset.filter(status=StudentSchoolFeeRecord.STATUS_PAID).count()
            incomplete_students = queryset.filter(status=StudentSchoolFeeRecord.STATUS_INCOMPLETE).count()
            unpaid_students = queryset.filter(status=StudentSchoolFeeRecord.STATUS_UNPAID).count()
            collection_rate = Decimal('0.00')
            if total_expected > MONEY_ZERO:
                collection_rate = (Decimal(total_collected) / Decimal(total_expected) * Decimal('100')).quantize(Decimal('0.01'))
            return {
                'student_count': student_count,
                'total_expected': total_expected,
                'total_collected': total_collected,
                'total_outstanding': total_outstanding,
                'paid_students': paid_students,
                'incomplete_students': incomplete_students,
                'unpaid_students': unpaid_students,
                'collection_rate': collection_rate,
            }

        class_rows = []
        for assignment in assignment_queryset:
            records = assignment.student_records.filter(is_active=True)
            total_collected = records.aggregate(total=Sum('amount_paid')).get('total') or MONEY_ZERO
            total_outstanding = records.aggregate(total=Sum('balance')).get('total') or MONEY_ZERO
            student_count = records.count()
            total_expected = assignment.amount * student_count
            class_rows.append(
                {
                    'id': str(assignment.id),
                    'school_class': str(assignment.school_class_id),
                    'class_name': assignment.school_class.name,
                    'sub_school_name': assignment.school_class.sub_school.name if assignment.school_class.sub_school_id else 'General',
                    'academic_year': assignment.academic_year,
                    'fee_amount': assignment.amount,
                    'currency': assignment.currency,
                    'student_count': student_count,
                    'total_expected': total_expected,
                    'total_collected': total_collected,
                    'total_outstanding': total_outstanding,
                    'paid_students': records.filter(status=StudentSchoolFeeRecord.STATUS_PAID).count(),
                    'incomplete_students': records.filter(status=StudentSchoolFeeRecord.STATUS_INCOMPLETE).count(),
                    'unpaid_students': records.filter(status=StudentSchoolFeeRecord.STATUS_UNPAID).count(),
                }
            )

        school_totals = build_totals(school_records)
        filtered_totals = build_totals(filtered_records)

        return Response(
            {
                'school_totals': {
                    'class_count': SchoolFeeAssignment.objects.filter(school=school, is_active=True).count(),
                    **school_totals,
                },
                'filtered_totals': {
                    'class_count': assignment_queryset.count(),
                    **filtered_totals,
                },
                'classes': class_rows,
                'platform_fee_controls_locked': True,
            }
        )

    @action(detail=False, methods=['get'], url_path='export-pdf')
    def export_pdf(self, request):
        school = self._ensure_staff_summary_access()
        self._sync_school_records(school)

        summary_response = self.summary(request)
        summary_payload = summary_response.data
        record_queryset = self.get_queryset()

        summary_lines = [
            f"Classes with fee plans: {summary_payload['school_totals']['class_count']}",
            f"Students covered: {summary_payload['school_totals']['student_count']}",
            f"Total expected: {summary_payload['school_totals']['total_expected']} XAF",
            f"Total collected: {summary_payload['school_totals']['total_collected']} XAF",
            f"Outstanding balance: {summary_payload['school_totals']['total_outstanding']} XAF",
            f"Paid students: {summary_payload['school_totals']['paid_students']}",
            f"Incomplete students: {summary_payload['school_totals']['incomplete_students']}",
            f"Unpaid students: {summary_payload['school_totals']['unpaid_students']}",
            f"Collection rate: {summary_payload['school_totals']['collection_rate']}%",
        ]

        class_lines = [
            (
                f"{row['class_name']} | Fee {row['fee_amount']} {row['currency']} | "
                f"Students {row['student_count']} | Expected {row['total_expected']} | "
                f"Collected {row['total_collected']} | Left {row['total_outstanding']}"
            )
            for row in summary_payload['classes']
        ]

        record_lines = [
            (
                f"{record.student.display_name} | {record.fee_assignment.school_class.name} | "
                f"Due {record.total_amount} | Paid {record.amount_paid} | Left {record.balance} | {record.status}"
            )
            for record in record_queryset
        ]

        pdf_bytes = build_school_fee_report_pdf(
            school_name=school.name,
            summary_lines=summary_lines,
            class_lines=class_lines,
            record_lines=record_lines,
            generated_at=timezone.now().strftime('%Y-%m-%d %H:%M'),
        )

        response = HttpResponse(pdf_bytes, content_type='application/pdf')
        response['Content-Disposition'] = f'attachment; filename="school_fee_report_{timezone.now().strftime("%Y%m%d_%H%M%S")}.pdf"'
        return response


class InvoiceViewSet(viewsets.ReadOnlyModelViewSet):
    queryset = Invoice.objects.select_related('payment', 'issued_by')
    serializer_class = InvoiceSerializer
    permission_classes = [permissions.IsAuthenticated, RequiresApp('fees')]

    def get_queryset(self):
        user = self.request.user
        queryset = Invoice.objects.select_related('payment', 'issued_by')

        if user.role in ['SCHOOL_ADMIN', 'SUB_ADMIN', 'BURSAR']:
            queryset = queryset.filter(payment__school=user.school)
        elif user.role in ['STUDENT', 'PARENT']:
            queryset = queryset.filter(payment__payer=user)
        else:
            queryset = queryset.none()

        return queryset


@api_view(['GET'])
@permission_classes([permissions.AllowAny])
@authentication_classes([])
@throttle_classes([verification.PublicVerifyThrottle])
def verify_receipt(request, token):
    """Public QR-scan check that a printed fee receipt is genuine.

    Reveals only what is already printed on the receipt itself (number, amount,
    date, school, fee line). It never returns the payer's name, matricule,
    contact details, payment reference or method. A receipt of a draft school is
    never confirmed as authentic.
    """
    doc = verification.DOC_FEE_RECEIPT
    payment = resolve_receipt_token(token)
    if payment is None or not payment.receipt_number or payment.school.is_drafted:
        return Response(
            verification.verification_response(
                verification.RESULT_NOT_VALID, doc,
                detail='No receipt matches this code. It may be forged or damaged.',
            ),
            status=status.HTTP_404_NOT_FOUND,
        )
    if payment.status != 'confirmed':
        return Response(
            verification.verification_response(
                verification.RESULT_REVOKED, doc,
                detail='This receipt is no longer valid (the payment was rejected or refunded).',
                receipt_number=payment.receipt_number,
                school_name=payment.school.name,
                status=payment.status,
            ),
            status=status.HTTP_200_OK,
        )
    return Response(verification.verification_response(
        verification.RESULT_VALID, doc,
        receipt_number=payment.receipt_number,
        amount=float(payment.amount),
        currency=payment.currency,
        payment_date=payment.payment_date,
        school_name=payment.school.name,
        fee_description=payment.fee_structure.name if payment.fee_structure else 'General Payment',
        status=payment.status,
    ))
