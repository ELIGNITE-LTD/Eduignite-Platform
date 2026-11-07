import hashlib
import logging
import uuid
from datetime import timedelta

from django.contrib.auth import get_user_model
from django.db import transaction
from django.db.models import Count, Q
from django.utils import timezone
from rest_framework import status, viewsets
from rest_framework.decorators import api_view, authentication_classes, permission_classes
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework_simplejwt.tokens import RefreshToken

from apps.orders.models import Order
from apps.users.models import UserRole
from apps.users.executive_access import executive_module_required
from apps.users.referrals import get_or_create_referral_code

from . import emails
from .models import ApplicantKind, Partner, PartnerApplication, PartnerType, ReferralClick
from .serializers import (
    AccountCreateSerializer,
    ApplicationReviewSerializer,
    PartnerApplicationCreateSerializer,
    PartnerApplicationSerializer,
    PartnerCeoSerializer,
    PartnerLoginSerializer,
    PartnerPublicProfileUpdateSerializer,
    PartnerPublicSerializer,
    PartnerTypeSerializer,
    PasswordResetConfirmSerializer,
    PasswordResetRequestSerializer,
    PublicPartnerTypeSerializer,
)
from .tokens import account_creation_url, make_account_token, read_account_token

logger = logging.getLogger(__name__)
PartnersModule = executive_module_required('partners')
User = get_user_model()
INACTIVITY_DAYS = 90


# ── helpers ──────────────────────────────────────────────────────────────────
def _session(user):
    refresh = RefreshToken.for_user(user)
    return {
        'access_token': str(refresh.access_token),
        'refresh_token': str(refresh),
        'user': {
            'id': str(user.id), 'name': user.name, 'email': user.email,
            'role': user.role, 'referral_code': get_or_create_referral_code(user),
        },
    }


def _current_partner(request):
    """The Partner for the signed-in user, or None (also updates activity).

    A partner is either a standalone partner account (role PARTNER) or an
    existing user (learner, staff, ...) who activated the partner capability in
    their own dashboard, keeping their primary role.
    """
    user = request.user
    if not getattr(user, 'is_authenticated', False):
        return None
    is_partner = user.role == UserRole.PARTNER or (
        getattr(user, 'has_capability', None) and user.has_capability('PARTNER')
    )
    if not is_partner:
        return None
    partner = Partner.objects.filter(user=user).exclude(status=Partner.Status.DELETED).first()
    return partner


@api_view(['POST'])
@permission_classes([IsAuthenticated])
def activate_partner(request):
    """Activate the partner programme for the signed-in user, in place.

    No second account is created: the person keeps their identity, primary role
    and history, and gains the partner capability plus a Partner profile and a
    referral code. Idempotent - if they are already a partner it just returns
    their current status.
    """
    user = request.user
    if getattr(user, 'is_platform_executive', False):
        return Response(
            {'detail': 'Executives run the partner programme and do not enrol as partners.'},
            status=status.HTTP_400_BAD_REQUEST,
        )
    # Same policy as Refer & Earn: students are the people a school exists to
    # teach, and paying a child to bring schools in is not a position to put
    # them in. They keep learning; they do not enrol as partners.
    if user.role == UserRole.STUDENT:
        return Response(
            {'detail': 'The partner programme is open to staff and parents, not students.'},
            status=status.HTTP_400_BAD_REQUEST,
        )

    existing = Partner.objects.filter(user=user).exclude(status=Partner.Status.DELETED).first()
    if existing:
        if existing.status == Partner.Status.SUSPENDED:
            return Response(
                {'detail': 'Your partner access is suspended. Please contact EduIgnite.'},
                status=status.HTTP_403_FORBIDDEN,
            )
        if existing.status == Partner.Status.INACTIVE:
            existing.status = Partner.Status.ACTIVE
            existing.inactivity_deadline = timezone.now() + timedelta(days=INACTIVITY_DAYS)
            existing.save(update_fields=['status', 'inactivity_deadline', 'updated_at'])
        user.grant_capability(user.CAP_PARTNER)
        code = get_or_create_referral_code(user)
        return Response(
            {'already_active': True, 'status': existing.status, 'referral_code': code,
             'display_name': existing.display_name},
            status=status.HTTP_200_OK,
        )

    if not request.data.get('accept_terms'):
        return Response(
            {'accept_terms': 'Please accept the partner programme terms to continue.'},
            status=status.HTTP_400_BAD_REQUEST,
        )

    partner_type = PartnerType.objects.filter(is_active=True).order_by('created_at').first()
    if partner_type is None:
        partner_type = PartnerType.objects.create(name='Community Partner', is_active=True)

    code = get_or_create_referral_code(user)
    partner = Partner.objects.create(
        user=user,
        partner_type=partner_type,
        applicant_kind=ApplicantKind.INDIVIDUAL,
        display_name=(user.name or user.email or 'Partner'),
        status=Partner.Status.ACTIVE,
        public_name=user.name or '',
        account_created_at=timezone.now(),
        inactivity_deadline=timezone.now() + timedelta(days=INACTIVITY_DAYS),
    )
    user.grant_capability(user.CAP_PARTNER, granted_by=user)
    return Response(
        {'already_active': False, 'status': partner.status, 'referral_code': code,
         'partner_type': partner_type.name, 'display_name': partner.display_name},
        status=status.HTTP_201_CREATED,
    )


def _mark_used(partner):
    """A partner genuinely used the account — it is no longer 'unused', so the
    three-month unused-account deletion rule stops applying to it."""
    now = timezone.now()
    fields = ['last_activity_at']
    partner.last_activity_at = now
    if partner.last_login_at is None:
        partner.last_login_at = now
        fields.append('last_login_at')
    if partner.inactivity_deadline is not None:
        partner.inactivity_deadline = None
        partner.inactivity_warnings_sent = 0
        fields += ['inactivity_deadline', 'inactivity_warnings_sent']
    partner.save(update_fields=fields + ['updated_at'])


def _referral_stats(user):
    """A partner's funnel, from real events. Clicks are tracked separately from
    schools; a school is counted only once it is an actual referred Order, and
    'approved/active' only once that Order is processed (the school is set up)."""
    code = get_or_create_referral_code(user)
    clicks = ReferralClick.objects.filter(referral_code=code).count()
    referred = Order.objects.filter(referred_by=user)
    applications = referred.count()
    approved = referred.filter(status='processed').count()
    # Until an Order carries a live School link, a processed order is treated as
    # the onboarded/active school. Documented attribution: click -> application
    # (Order) -> approved/active (Order.status == 'processed').
    active = approved
    conversion = round((approved / clicks) * 100, 1) if clicks else 0.0
    return {
        'code': code,
        'link': f'https://eduignite.online/?ref={code}',
        'clicks': clicks,
        'leads': applications,
        'applications': applications,
        'approved_schools': approved,
        'active_schools': active,
        'conversion_rate': conversion,
    }


# A referred school moves through these stages. The Order status is the source
# of truth; partners see the friendly label, a short explanation, and where the
# school sits in the journey (step N of the pipeline).
REFERRAL_STAGES = [
    ('pending', 'Received', 'We have the introduction and will reach out to the school.'),
    ('contacted', 'In conversation', 'EduIgnite is talking with the school about joining.'),
    ('processed', 'Onboarded', 'The school has joined EduIgnite. This referral counts.'),
]
# Rejected is a terminal side-branch, not a step on the main journey.
_STAGE_LABELS = {code: label for code, label, _ in REFERRAL_STAGES}
_STAGE_LABELS['rejected'] = 'Did not join'
_STAGE_BLURB = {code: blurb for code, _, blurb in REFERRAL_STAGES}
_STAGE_BLURB['rejected'] = 'This introduction did not lead to the school joining.'
_STAGE_STEP = {code: i + 1 for i, (code, _, _) in enumerate(REFERRAL_STAGES)}


def _stage_of(order):
    """Partner-facing lifecycle position for one referred school."""
    code = order.status or 'pending'
    return {
        'stage': code,
        'stage_label': _STAGE_LABELS.get(code, code.title()),
        'stage_blurb': _STAGE_BLURB.get(code, ''),
        'step': _STAGE_STEP.get(code),          # None for rejected
        'total_steps': len(REFERRAL_STAGES),
        'is_final': code in ('processed', 'rejected'),
        'counts': code == 'processed',
    }


def _lifecycle_breakdown(user):
    """How many referred schools sit at each stage, in journey order, so the
    partner can see the whole pipeline at a glance (not only the totals)."""
    by_status = dict(
        Order.objects.filter(referred_by=user)
        .values_list('status')
        .annotate(n=Count('id'))
    )
    out = [{
        'stage': code,
        'label': label,
        'blurb': blurb,
        'count': by_status.get(code, 0),
    } for code, label, blurb in REFERRAL_STAGES]
    rejected = by_status.get('rejected', 0)
    if rejected:
        out.append({'stage': 'rejected', 'label': _STAGE_LABELS['rejected'],
                    'blurb': _STAGE_BLURB['rejected'], 'count': rejected})
    return out


def _monthly_schools(user, months=6):
    """Approved schools per month for the last N months (for the chart)."""
    now = timezone.now()
    out = []
    referred = Order.objects.filter(referred_by=user, status='processed')
    for i in range(months - 1, -1, -1):
        month = (now.replace(day=1) - timedelta(days=i * 30)).replace(day=1)
        start = month
        end = (month + timedelta(days=32)).replace(day=1)
        count = referred.filter(created_at__gte=start, created_at__lt=end).count()
        out.append({'month': start.strftime('%b %Y'), 'schools': count})
    return out


# ── Public: partner types + application + public profiles + click ────────────
@api_view(['GET'])
@permission_classes([AllowAny])
@authentication_classes([])
def public_partner_types(request):
    types = PartnerType.objects.filter(is_active=True)
    return Response(PublicPartnerTypeSerializer(types, many=True).data)


@api_view(['POST'])
@permission_classes([AllowAny])
@authentication_classes([])
def submit_application(request):
    serializer = PartnerApplicationCreateSerializer(data=request.data)
    serializer.is_valid(raise_exception=True)
    app = serializer.save()
    emails.application_submitted(app)
    return Response({'id': str(app.id), 'status': app.status}, status=status.HTTP_201_CREATED)


@api_view(['GET'])
@permission_classes([AllowAny])
@authentication_classes([])
def public_partners(request):
    partners = Partner.objects.filter(status=Partner.Status.ACTIVE, is_public=True).exclude(public_slug__isnull=True).exclude(public_slug='')
    return Response(PartnerPublicSerializer(partners, many=True).data)


@api_view(['GET'])
@permission_classes([AllowAny])
@authentication_classes([])
def public_partner_detail(request, slug):
    partner = Partner.objects.filter(public_slug=slug, status=Partner.Status.ACTIVE, is_public=True).first()
    if not partner:
        return Response({'detail': 'Partner not found.'}, status=404)
    return Response(PartnerPublicSerializer(partner).data)


@api_view(['POST'])
@permission_classes([AllowAny])
@authentication_classes([])
def track_click(request):
    """Record a referral-link click, de-duplicated per visitor for 6 hours so
    repeat visits from the same person are not counted again."""
    code = str(request.data.get('ref') or request.query_params.get('ref') or '').strip().upper()[:12]
    if not code:
        return Response({'detail': 'No referral code.'}, status=status.HTTP_400_BAD_REQUEST)
    ua = request.META.get('HTTP_USER_AGENT', '')
    ip = (request.META.get('HTTP_X_FORWARDED_FOR', '').split(',')[0].strip()
          or request.META.get('REMOTE_ADDR', ''))
    visitor_hash = hashlib.sha256(f'{ip}|{ua}|{code}'.encode()).hexdigest()
    recent = ReferralClick.objects.filter(
        referral_code=code, visitor_hash=visitor_hash,
        created_at__gte=timezone.now() - timedelta(hours=6),
    ).exists()
    if not recent:
        partner = Partner.objects.filter(user__referral_code=code).first()
        ReferralClick.objects.create(
            referral_code=code, partner=partner, visitor_hash=visitor_hash,
            path=str(request.data.get('path') or '')[:255],
        )
    return Response({'ok': True})


# ── Account creation / auth ──────────────────────────────────────────────────
@api_view(['GET'])
@permission_classes([AllowAny])
@authentication_classes([])
def account_token_check(request):
    """Resolve an account-creation token to the (locked) approved email."""
    app_id = read_account_token(request.query_params.get('token', ''))
    app = PartnerApplication.objects.filter(id=app_id).first() if app_id else None
    if not app or app.status not in (PartnerApplication.Status.APPROVED,):
        return Response({'detail': 'This link is invalid or has expired.'}, status=400)
    return Response({'email': app.email, 'name': app.full_name})


@api_view(['POST'])
@permission_classes([AllowAny])
@authentication_classes([])
@transaction.atomic
def create_account(request):
    serializer = AccountCreateSerializer(data=request.data)
    serializer.is_valid(raise_exception=True)
    app_id = read_account_token(serializer.validated_data['token'])
    app = PartnerApplication.objects.select_for_update().filter(id=app_id).first() if app_id else None
    if not app or app.status != PartnerApplication.Status.APPROVED:
        return Response({'detail': 'This link is invalid or has expired.'}, status=400)
    if User.objects.filter(email__iexact=app.email).exists():
        return Response({'detail': 'An account with this email already exists. Please sign in.'}, status=400)

    user = User.objects.create_user(
        matricule=f'PTR-{uuid.uuid4().hex[:10].upper()}',
        name=app.full_name, email=app.email.lower(),
        role=UserRole.PARTNER, password=serializer.validated_data['password'],
    )
    get_or_create_referral_code(user)
    partner = Partner.objects.create(
        user=user, application=app, partner_type=app.partner_type,
        applicant_kind=app.applicant_kind,
        display_name=app.organization_name or app.full_name,
        status=Partner.Status.ACTIVE,
        public_name=app.organization_name or app.full_name,
        account_created_at=timezone.now(),
        inactivity_deadline=timezone.now() + timedelta(days=INACTIVITY_DAYS),
    )
    app.status = PartnerApplication.Status.ACCOUNT_CREATED
    app.save(update_fields=['status', 'updated_at'])
    emails.account_created(partner)
    return Response(_session(user), status=status.HTTP_201_CREATED)


@api_view(['POST'])
@permission_classes([AllowAny])
@authentication_classes([])
def partner_login(request):
    serializer = PartnerLoginSerializer(data=request.data)
    serializer.is_valid(raise_exception=True)
    email = serializer.validated_data['email'].strip().lower()
    user = User.objects.filter(email__iexact=email, role=UserRole.PARTNER).first()
    if user is None or not user.check_password(serializer.validated_data['password']):
        return Response({'detail': 'The email address or password is incorrect.'}, status=status.HTTP_401_UNAUTHORIZED)
    partner = Partner.objects.filter(user=user).first()
    if not partner or partner.status in (Partner.Status.DELETED,):
        return Response({'detail': 'This account is not available.'}, status=status.HTTP_403_FORBIDDEN)
    if partner.status == Partner.Status.SUSPENDED:
        return Response({'detail': 'Your partner account is suspended. Please contact EduIgnite.'}, status=status.HTTP_403_FORBIDDEN)
    _mark_used(partner)
    return Response(_session(user))


@api_view(['POST'])
@permission_classes([AllowAny])
@authentication_classes([])
def password_reset_request(request):
    serializer = PasswordResetRequestSerializer(data=request.data)
    serializer.is_valid(raise_exception=True)
    email = serializer.validated_data['email'].strip().lower()
    user = User.objects.filter(email__iexact=email, role=UserRole.PARTNER).first()
    partner = Partner.objects.filter(user=user).first() if user else None
    # Always the same response, so the form never reveals which emails exist.
    if partner and partner.status != Partner.Status.DELETED:
        from django.contrib.auth.tokens import default_token_generator
        from django.utils.http import urlsafe_base64_encode
        from django.utils.encoding import force_bytes
        uid = urlsafe_base64_encode(force_bytes(user.pk))
        token = default_token_generator.make_token(user)
        reset_url = f'https://eduignite.online/partners/reset-password?uid={uid}&token={token}'
        emails.password_reset(partner, reset_url)
    return Response({'detail': 'If a partner account uses this email, a reset link has been sent.'})


@api_view(['POST'])
@permission_classes([AllowAny])
@authentication_classes([])
def password_reset_confirm(request):
    from django.contrib.auth.tokens import default_token_generator
    from django.utils.http import urlsafe_base64_decode
    serializer = PasswordResetConfirmSerializer(data=request.data)
    serializer.is_valid(raise_exception=True)
    raw = serializer.validated_data['token']
    uid = request.data.get('uid', '')
    try:
        user = User.objects.get(pk=urlsafe_base64_decode(uid).decode(), role=UserRole.PARTNER)
    except Exception:
        return Response({'detail': 'This reset link is invalid.'}, status=400)
    if not default_token_generator.check_token(user, raw):
        return Response({'detail': 'This reset link is invalid or has expired.'}, status=400)
    user.set_password(serializer.validated_data['password'])
    user.save(update_fields=['password'])
    return Response({'detail': 'Your password has been reset. You can now sign in.'})


# ── Partner portal (own data only) ───────────────────────────────────────────
@api_view(['GET'])
@permission_classes([IsAuthenticated])
def portal_me(request):
    partner = _current_partner(request)
    if not partner:
        return Response({'detail': 'Partner account required.'}, status=403)
    _mark_used(partner)
    stats = _referral_stats(request.user)
    referred = Order.objects.filter(referred_by=request.user).order_by('-created_at')[:50]
    schools = [{
        'school_name': o.school_name, 'region': o.region, 'status': o.status,
        'date': o.created_at.isoformat(),
        **_stage_of(o),
    } for o in referred]
    return Response({
        'partner': {
            'display_name': partner.display_name,
            'partner_type': getattr(partner.partner_type, 'name', ''),
            'status': partner.status,
            'is_public': partner.is_public,
            'public_name': partner.public_name,
            'public_description': partner.public_description,
            'public_website': partner.public_website,
            'logo_url': partner.logo_url,
            'public_slug': partner.public_slug,
        },
        'referral': stats,
        'timeline': _monthly_schools(request.user),
        'lifecycle': _lifecycle_breakdown(request.user),
        'schools': schools,
    })


# ── Part K: partner feedback to EduIgnite ────────────────────────────────────
PARTNER_FEEDBACK_CATEGORY = 'partner programme'


@api_view(['GET', 'POST'])
@permission_classes([IsAuthenticated])
def partner_feedback(request):
    """A partner's own feedback to EduIgnite, and EduIgnite's replies.

    Partners belong to no school, so this writes platform-level Feedback
    (school=None) that lands in the executives' existing feedback console. GET
    returns only this partner's threads, with status and any responses, so the
    loop closes - the partner sees that EduIgnite read and answered.
    """
    from apps.feedback.models import Feedback

    partner = _current_partner(request)
    if not partner:
        return Response({'detail': 'Partner account required.'}, status=403)

    if request.method == 'GET':
        rows = (Feedback.objects
                .filter(sender=request.user, category=PARTNER_FEEDBACK_CATEGORY)
                .prefetch_related('responses__responder')
                .order_by('-created_at')[:50])
        return Response([{
            'id': str(f.id),
            'subject': f.subject,
            'message': f.message,
            'status': f.status,
            'created_at': f.created_at.isoformat(),
            'resolution_note': f.resolution_note,
            'responses': [{
                'message': r.message,
                'responder': r.responder.get_full_name() or r.responder.email,
                'created_at': r.created_at.isoformat(),
            } for r in f.responses.all()],
        } for f in rows])

    subject = (request.data.get('subject') or '').strip()
    message = (request.data.get('message') or '').strip()
    if not subject or not message:
        return Response({'detail': 'A subject and a message are both required.'}, status=400)
    priority = {'low': 'Low', 'medium': 'Medium', 'high': 'High', 'critical': 'Critical'}.get(
        str(request.data.get('priority', 'medium')).lower(), 'Medium')
    fb = Feedback.objects.create(
        sender=request.user,
        school=None,
        subject=subject[:255],
        message=message,
        category=PARTNER_FEEDBACK_CATEGORY,
        priority=priority,
    )
    return Response({'id': str(fb.id), 'status': fb.status}, status=status.HTTP_201_CREATED)


@api_view(['PATCH'])
@permission_classes([IsAuthenticated])
def portal_update_profile(request):
    partner = _current_partner(request)
    if not partner:
        return Response({'detail': 'Partner account required.'}, status=403)
    serializer = PartnerPublicProfileUpdateSerializer(partner, data=request.data, partial=True)
    serializer.is_valid(raise_exception=True)
    serializer.save()
    return Response(serializer.data)


# ── CEO/CTO: partner types ───────────────────────────────────────────────────
class PartnerTypeViewSet(viewsets.ModelViewSet):
    serializer_class = PartnerTypeSerializer
    permission_classes = [PartnersModule]
    queryset = PartnerType.objects.all()

    def get_queryset(self):
        return PartnerType.objects.annotate(application_total=Count('applications', distinct=True))

    def perform_create(self, serializer):
        serializer.save(created_by=self.request.user)

    def destroy(self, request, *args, **kwargs):
        ptype = self.get_object()
        if ptype.applications.exists() or ptype.partners.exists():
            # Safe-delete guard: never orphan real records; deactivate instead.
            ptype.is_active = False
            ptype.save(update_fields=['is_active', 'updated_at'])
            return Response(
                {'detail': 'This type has applications or partners, so it was deactivated rather than deleted.'},
                status=status.HTTP_200_OK,
            )
        return super().destroy(request, *args, **kwargs)


# ── CEO/CTO: applications ────────────────────────────────────────────────────
@api_view(['GET'])
@permission_classes([PartnersModule])
def admin_applications(request):
    qs = PartnerApplication.objects.select_related('partner_type').all()
    status_f = request.query_params.get('status')
    kind_f = request.query_params.get('kind')
    type_f = request.query_params.get('partner_type')
    search = request.query_params.get('search')
    if status_f:
        qs = qs.filter(status=status_f)
    if kind_f:
        qs = qs.filter(applicant_kind=kind_f)
    if type_f:
        qs = qs.filter(partner_type_id=type_f)
    if search:
        qs = qs.filter(Q(full_name__icontains=search) | Q(email__icontains=search) | Q(organization_name__icontains=search))
    return Response(PartnerApplicationSerializer(qs, many=True).data)


@api_view(['GET'])
@permission_classes([PartnersModule])
def admin_application_detail(request, pk):
    app = PartnerApplication.objects.filter(id=pk).first()
    if not app:
        return Response({'detail': 'Not found.'}, status=404)
    return Response(PartnerApplicationSerializer(app).data)


@api_view(['POST'])
@permission_classes([PartnersModule])
def admin_review_application(request, pk):
    app = PartnerApplication.objects.filter(id=pk).first()
    if not app:
        return Response({'detail': 'Not found.'}, status=404)
    serializer = ApplicationReviewSerializer(data=request.data)
    serializer.is_valid(raise_exception=True)
    action = serializer.validated_data['action']
    message = serializer.validated_data.get('message', '')
    now = timezone.now()
    app.reviewed_by = request.user
    app.reviewed_at = now

    if action == 'under_review':
        app.status = PartnerApplication.Status.UNDER_REVIEW
    elif action == 'request_info':
        app.status = PartnerApplication.Status.MORE_INFO
        app.ceo_message = message
        emails.more_info_requested(app, message)
    elif action == 'reject':
        app.status = PartnerApplication.Status.REJECTED
        app.ceo_message = message
        emails.application_rejected(app, message)
    elif action == 'approve':
        app.status = PartnerApplication.Status.APPROVED
        app.approved_at = now
        app.save()
        emails.application_approved(app, account_creation_url(app.id))
        return Response(PartnerApplicationSerializer(app).data)
    app.save()
    return Response(PartnerApplicationSerializer(app).data)


# ── CEO/CTO: partners + overview + performance ───────────────────────────────
@api_view(['GET'])
@permission_classes([PartnersModule])
def admin_overview(request):
    p = Partner.objects.exclude(status=Partner.Status.DELETED)
    apps_qs = PartnerApplication.objects.all()
    month_start = timezone.now().replace(day=1, hour=0, minute=0, second=0, microsecond=0)
    referring = (
        Order.objects.filter(referred_by__isnull=False, referred_by__role=UserRole.PARTNER)
        .values('referred_by').distinct().count()
    )
    return Response({
        'total_partners': p.count(),
        'active_partners': p.filter(status=Partner.Status.ACTIVE).count(),
        'suspended_partners': p.filter(status=Partner.Status.SUSPENDED).count(),
        'inactive_partners': p.filter(status=Partner.Status.INACTIVE).count(),
        'account_pending': p.filter(status=Partner.Status.ACCOUNT_PENDING).count(),
        'individual_partners': p.filter(applicant_kind=ApplicantKind.INDIVIDUAL).count(),
        'organization_partners': p.filter(applicant_kind=ApplicantKind.ORGANIZATION).count(),
        'new_partners_this_month': p.filter(created_at__gte=month_start).count(),
        'pending_applications': apps_qs.filter(status__in=[
            PartnerApplication.Status.PENDING, PartnerApplication.Status.UNDER_REVIEW,
            PartnerApplication.Status.MORE_INFO,
        ]).count(),
        'active_referring_partners': referring,
    })


@api_view(['GET'])
@permission_classes([PartnersModule])
def admin_partners(request):
    qs = Partner.objects.select_related('user', 'partner_type').exclude(status=Partner.Status.DELETED)
    status_f = request.query_params.get('status')
    kind_f = request.query_params.get('kind')
    type_f = request.query_params.get('partner_type')
    public_f = request.query_params.get('is_public')
    search = request.query_params.get('search')
    if status_f:
        qs = qs.filter(status=status_f)
    if kind_f:
        qs = qs.filter(applicant_kind=kind_f)
    if type_f:
        qs = qs.filter(partner_type_id=type_f)
    if public_f is not None:
        qs = qs.filter(is_public=str(public_f).lower() in {'1', 'true', 'yes'})
    if search:
        qs = qs.filter(Q(display_name__icontains=search) | Q(user__email__icontains=search))
    return Response(PartnerCeoSerializer(qs, many=True).data)


@api_view(['GET', 'PATCH'])
@permission_classes([PartnersModule])
def admin_partner_detail(request, pk):
    partner = Partner.objects.filter(id=pk).first()
    if not partner:
        return Response({'detail': 'Not found.'}, status=404)
    if request.method == 'PATCH':
        serializer = PartnerCeoSerializer(partner, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        # If the CEO turns on public display, ensure a slug exists.
        serializer.save()
        if partner.is_public and not partner.public_slug:
            _assign_public_slug(partner)
        return Response(PartnerCeoSerializer(partner).data)
    data = PartnerCeoSerializer(partner).data
    data['referral'] = _referral_stats(partner.user)
    data['timeline'] = _monthly_schools(partner.user)
    return Response(data)


def _assign_public_slug(partner):
    from django.utils.text import slugify
    base = slugify(partner.public_name or partner.display_name)[:170] or 'partner'
    slug = base
    n = 2
    while Partner.objects.exclude(pk=partner.pk).filter(public_slug=slug).exists():
        slug = f'{base}-{n}'
        n += 1
    partner.public_slug = slug
    partner.save(update_fields=['public_slug', 'updated_at'])


@api_view(['POST'])
@permission_classes([PartnersModule])
def admin_partner_action(request, pk):
    partner = Partner.objects.filter(id=pk).first()
    if not partner:
        return Response({'detail': 'Not found.'}, status=404)
    action = request.data.get('action')
    if action == 'activate':
        partner.status = Partner.Status.ACTIVE
        partner.user.is_active = True
        partner.user.save(update_fields=['is_active'])
        partner.save(update_fields=['status', 'updated_at'])
        emails.account_reactivated(partner)
    elif action == 'suspend':
        partner.status = Partner.Status.SUSPENDED
        partner.save(update_fields=['status', 'updated_at'])
        emails.account_suspended(partner)
    elif action == 'delete':
        # Permanent delete of the account; the application/audit record is kept.
        partner.status = Partner.Status.DELETED
        partner.deleted_at = timezone.now()
        partner.deletion_reason = str(request.data.get('reason') or 'Deleted by executive')[:255]
        partner.is_public = False
        partner.save(update_fields=['status', 'deleted_at', 'deletion_reason', 'is_public', 'updated_at'])
        u = partner.user
        u.is_active = False
        u.save(update_fields=['is_active'])
    else:
        return Response({'detail': 'Unknown action.'}, status=400)
    return Response(PartnerCeoSerializer(partner).data)


@api_view(['GET'])
@permission_classes([PartnersModule])
def admin_performance(request):
    """Leaderboard ranked by real schools produced, not clicks."""
    partners = Partner.objects.select_related('user').filter(status=Partner.Status.ACTIVE)
    rows = []
    totals = {'clicks': 0, 'applications': 0, 'approved': 0, 'active': 0}
    for partner in partners:
        s = _referral_stats(partner.user)
        totals['clicks'] += s['clicks']
        totals['applications'] += s['applications']
        totals['approved'] += s['approved_schools']
        totals['active'] += s['active_schools']
        rows.append({
            'id': str(partner.id),
            'name': partner.display_name,
            'partner_type': getattr(partner.partner_type, 'name', ''),
            'clicks': s['clicks'],
            'applications': s['applications'],
            'approved_schools': s['approved_schools'],
            'active_schools': s['active_schools'],
            'conversion_rate': s['conversion_rate'],
            'last_activity_at': partner.last_activity_at.isoformat() if partner.last_activity_at else None,
        })
    # Rank by real schools first, then conversion — never by clicks alone.
    rows.sort(key=lambda r: (r['approved_schools'], r['conversion_rate']), reverse=True)
    for i, r in enumerate(rows, 1):
        r['rank'] = i
    overall_conv = round((totals['approved'] / totals['clicks']) * 100, 1) if totals['clicks'] else 0.0
    return Response({
        'totals': {
            'clicks': totals['clicks'],
            'applications': totals['applications'],
            'approved_schools': totals['approved'],
            'active_schools': totals['active'],
            'conversion_rate': overall_conv,
        },
        'leaderboard': rows,
    })
