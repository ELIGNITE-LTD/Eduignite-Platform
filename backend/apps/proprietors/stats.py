"""Read-only statistics for a proprietor's linked schools.

Every function takes schools that ``services.linked_schools`` already scoped to
the requesting proprietor, and aggregates across ALL of them with one query per
metric (never one per school). Other apps are reached through their ``api``
modules. Nothing here writes.
"""

from datetime import timedelta
from decimal import Decimal

from django.contrib.auth import get_user_model
from django.db.models import Count
from django.utils import timezone

from apps.announcements import api as announcements_api
from apps.attendance import api as attendance_api
from apps.fees import api as fees_api
from apps.grades import api as grades_api
from apps.platform.access import school_subscription_state
from apps.schools.models import SchoolClass
from apps.students import api as students_api

from .services import ADMIN_ROLES, eligible_admins

User = get_user_model()

STAFF_ROLES = ('SCHOOL_ADMIN', 'SUB_ADMIN', 'TEACHER', 'BURSAR', 'LIBRARIAN')
TREND_DAYS = 14


def _rate(attended, records):
    return round(attended * 100.0 / records, 1) if records else None


def _att(row):
    return {'rate': _rate(row['attended'], row['records']), 'records': row['records']}


def _fees(row):
    billed, collected = row['billed'], row['collected']
    return {
        'billed': str(billed), 'collected': str(collected), 'outstanding': str(row['outstanding']),
        'collection_rate': round(float(collected) * 100.0 / float(billed), 1) if billed else None,
    }


def _billing(school):
    return {
        'state': school_subscription_state(school),
        'status': school.subscription_status,
        'expires_on': school.subscription_expires_on.isoformat() if school.subscription_expires_on else None,
        'free_until': school.subscription_free_until.isoformat() if school.subscription_free_until else None,
        'amount': str(school.subscription_amount),
        'currency': school.subscription_currency,
    }


def school_brief(school):
    return {
        'id': school.id, 'name': school.name, 'short_name': school.short_name, 'location': school.location,
        'logo': school.logo, 'education_category': school.education_category,
        'school_type': school.school_type, 'subsystem': school.subsystem, 'status': school.status,
    }


def _week_start(today):
    return today - timedelta(days=today.weekday())


def overview(schools):
    """Aggregate across ``schools`` (a list of School) plus one row per school."""
    ids = [s.id for s in schools]
    today = timezone.localdate()

    students = students_api.student_counts_by_school(ids)
    att_today = attendance_api.attendance_by_school(ids, today, today)
    att_week = attendance_api.attendance_by_school(ids, _week_start(today), today)
    fees = fees_api.school_fee_totals(ids)
    staff = dict(
        User.objects.filter(school_id__in=ids, role__in=STAFF_ROLES, is_active=True, is_drafted=False,
                            is_teacher_twin=False)
        .order_by().values_list('school_id').annotate(n=Count('id'))
    )
    classes = dict(SchoolClass.objects.filter(school_id__in=ids).order_by().values_list('school_id').annotate(n=Count('id')))
    admins = dict(
        User.objects.filter(school_id__in=ids, role__in=ADMIN_ROLES, is_drafted=False, is_teacher_twin=False)
        .order_by().values_list('school_id').annotate(n=Count('id'))
    )

    rows = []
    billing_totals = {'paid': 0, 'free': 0, 'unpaid': 0}
    for school in schools:
        billing = _billing(school)
        billing_totals[billing['state']] = billing_totals.get(billing['state'], 0) + 1
        rows.append({
            **school_brief(school),
            'students': students[school.id]['total'],
            'staff': staff.get(school.id, 0),
            'classes': classes.get(school.id, 0),
            'attendance_today': _att(att_today[school.id]),
            'attendance_week': _att(att_week[school.id]),
            'fees': _fees(fees[school.id]),
            'platform_billing': billing,
            'admin_count': admins.get(school.id, 0),
        })

    def total(mapping, key):
        return sum(mapping[i][key] for i in ids)

    zero = Decimal('0')
    fee_total = {
        'billed': sum((fees[i]['billed'] for i in ids), zero),
        'collected': sum((fees[i]['collected'] for i in ids), zero),
        'outstanding': sum((fees[i]['outstanding'] for i in ids), zero),
    }
    return {
        'totals': {
            'schools': len(ids),
            'students': total(students, 'total'),
            'students_male': total(students, 'male'),
            'students_female': total(students, 'female'),
            'staff': sum(staff.values()),
            'classes': sum(classes.values()),
            'attendance_today': _att({'attended': total(att_today, 'attended'), 'records': total(att_today, 'records')}),
            'attendance_week': _att({'attended': total(att_week, 'attended'), 'records': total(att_week, 'records')}),
            'fees': _fees(fee_total),
            'platform_billing': billing_totals,
        },
        'schools': rows,
    }


def school_detail(school):
    today = timezone.localdate()
    by_class = students_api.student_counts_by_class(school.id)
    totals = students_api.student_counts_by_school([school.id])[school.id]
    staff_rows = (
        User.objects.filter(school_id=school.id, role__in=STAFF_ROLES, is_active=True, is_drafted=False,
                            is_teacher_twin=False)
        .order_by().values('role').annotate(n=Count('id'))
    )
    by_role = {row['role']: row['n'] for row in staff_rows}
    today_row = attendance_api.attendance_by_school([school.id], today, today)[school.id]
    week_row = attendance_api.attendance_by_school([school.id], _week_start(today), today)[school.id]
    trend = [
        {'date': row['date'], 'rate': _rate(row['attended'], row['records']), 'records': row['records']}
        for row in attendance_api.attendance_trend(school.id, today - timedelta(days=TREND_DAYS - 1), today)
    ]
    detail = {
        'school': {
            **school_brief(school), 'motto': school.motto, 'email': school.email, 'phone': school.phone,
            'principal': school.principal, 'region': school.region, 'division': school.division,
        },
        'students': {
            'total': totals['total'], 'male': totals['male'], 'female': totals['female'],
            'other': totals['other'], 'by_class': by_class,
        },
        'staff': {'total': sum(by_role.values()), 'by_role': by_role},
        'classes': SchoolClass.objects.filter(school_id=school.id).count(),
        'attendance': {'today': _att(today_row), 'week': _att(week_row), 'trend': trend},
        'marks': {
            'max_score': grades_api.max_score(school.id),
            'by_class_term': grades_api.class_term_averages(school.id),
        },
        'fees': _fees(fees_api.school_fee_totals([school.id])[school.id]),
        'platform_billing': _billing(school),
        'announcements': announcements_api.recent_school_announcements(school.id, limit=5),
        'admins': [admin_row(a) for a in eligible_admins(school)],
    }
    return detail


def admin_row(user):
    return {
        'id': str(user.id), 'matricule': user.matricule, 'name': user.name, 'role': user.role,
        'display_role': user.display_role, 'email': user.email, 'phone': user.phone or '',
        'is_active': user.is_active, 'must_change_password': user.must_change_password,
        'last_login': user.last_login.isoformat() if user.last_login else None,
    }
