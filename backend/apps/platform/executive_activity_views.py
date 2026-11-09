"""Founders-only API over the executive activity log (CEO and CTO, equal rights).

    GET /api/v1/platform/executive-activity/           list, filters, search, paging
    GET /api/v1/platform/executive-activity/summary/   counts per executive/module/day
    GET /api/v1/platform/executive-activity/export/    CSV (the export is itself logged)

Read-only: there is no create/update/delete endpoint.
"""

import csv
from datetime import date, datetime, timedelta
from zoneinfo import ZoneInfo

from django.db.models import Count, Q
from django.db.models.functions import TruncDate
from django.http import HttpResponse
from django.utils import timezone
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from .executive_activity import (
    DISPLAY_TIMEZONE,
    MODULE_LABELS,
    day_bounds_utc,
    department_label,
    record_executive_activity,
)
from .executive_activity_model import ExecutiveActivityLog
from .permissions import IsFounderCEOOrCTO

TZ = ZoneInfo(DISPLAY_TIMEZONE)
MAX_PAGE_SIZE = 200
EXPORT_LIMIT = 20000
ORDERING_FIELDS = {
    'created': 'created_at', 'actor': 'actor_name', 'module': 'module',
    'action': 'action', 'status': 'status_code', 'outcome': 'outcome',
}


def _parse_day(value, end=False):
    """YYYY-MM-DD (or ISO datetime) read as Douala time -> aware datetime, or None."""
    value = (value or '').strip()
    if not value:
        return None
    try:
        if len(value) <= 10:
            d = date.fromisoformat(value)
            start = datetime(d.year, d.month, d.day, tzinfo=TZ)
            return start + timedelta(days=1) if end else start
        dt = datetime.fromisoformat(value.replace('Z', '+00:00'))
        return dt if dt.tzinfo else dt.replace(tzinfo=TZ)
    except ValueError:
        return None


def filtered_queryset(params):
    qs = ExecutiveActivityLog.objects.all()
    executive = params.get('executive')
    if executive:
        qs = qs.filter(actor_id=executive)
    role = params.get('role')
    if role:
        qs = qs.filter(actor_role=role.upper())
    module = params.get('module')
    if module:
        qs = qs.filter(module=module)
    action = params.get('action')
    if action:
        qs = qs.filter(action=action)
    status = (params.get('status') or '').lower()
    if status in {c for c, _ in ExecutiveActivityLog.Outcome.choices}:
        qs = qs.filter(outcome=status)
    start = _parse_day(params.get('from'))
    if start:
        qs = qs.filter(created_at__gte=start)
    stop = _parse_day(params.get('to'), end=True)
    if stop:
        qs = qs.filter(created_at__lt=stop)
    q = (params.get('q') or '').strip()
    if q:
        qs = qs.filter(
            Q(actor_name__icontains=q) | Q(summary__icontains=q) | Q(target_label__icontains=q)
            | Q(target_id__icontains=q) | Q(target_type__icontains=q) | Q(path__icontains=q)
            | Q(ip_address__icontains=q)
        )
    ordering = (params.get('ordering') or '-created').strip()
    desc = ordering.startswith('-')
    field = ORDERING_FIELDS.get(ordering.lstrip('-'), 'created_at')
    return qs.order_by(('-' if desc else '') + field, '-created_at')


def serialize(row):
    return {
        'id': str(row.id),
        'created_at': row.created_at.isoformat(),
        'actor_id': str(row.actor_id) if row.actor_id else None,
        'actor_name': row.actor_name,
        'actor_role': row.actor_role,
        'actor_department': department_label(row.actor_role),
        'module': row.module,
        'module_label': MODULE_LABELS.get(row.module, row.module.replace('_', ' ').title()),
        'action': row.action,
        'target_type': row.target_type,
        'target_id': row.target_id,
        'target_label': row.target_label,
        'summary': row.summary,
        'outcome': row.outcome,
        'method': row.method,
        'path': row.path,
        'status_code': row.status_code,
        'ip_address': row.ip_address,
        'user_agent': row.user_agent,
        'request_id': row.request_id,
    }


def _int(value, default, low, high):
    try:
        return max(low, min(high, int(value)))
    except (TypeError, ValueError):
        return default


class FounderLogView(APIView):
    """Common gate: CEO and CTO only, never an assignable module."""

    permission_classes = [IsAuthenticated, IsFounderCEOOrCTO]


class ExecutiveActivityListView(FounderLogView):
    def get(self, request):
        qs = filtered_queryset(request.query_params)
        page_size = _int(request.query_params.get('page_size'), 50, 1, MAX_PAGE_SIZE)
        page = _int(request.query_params.get('page'), 1, 1, 10_000_000)
        count = qs.count()
        offset = (page - 1) * page_size
        rows = list(qs[offset:offset + page_size])
        return Response({
            'count': count,
            'page': page,
            'page_size': page_size,
            'has_next': offset + page_size < count,
            'timezone': DISPLAY_TIMEZONE,
            'results': [serialize(r) for r in rows],
        })


class ExecutiveActivitySummaryView(FounderLogView):
    def get(self, request):
        now = timezone.now()
        today_start = day_bounds_utc(0)
        week_start = day_bounds_utc(6)
        month_start = day_bounds_utc(29)
        base = ExecutiveActivityLog.objects.all()

        week = base.filter(created_at__gte=week_start)
        per_exec = list(
            base.filter(created_at__gte=month_start, actor__isnull=False)
            .values('actor_id', 'actor_name', 'actor_role')
            .annotate(total=Count('id'), denied=Count('id', filter=Q(outcome='denied')))
            .order_by('-total')[:50]
        )
        week_per_exec = list(
            week.filter(actor__isnull=False).values('actor_id', 'actor_name', 'actor_role')
            .annotate(total=Count('id')).order_by('-total')[:1]
        )
        per_module = list(
            base.filter(created_at__gte=month_start).values('module')
            .annotate(total=Count('id')).order_by('-total')
        )
        per_day = list(
            base.filter(created_at__gte=month_start)
            .annotate(day=TruncDate('created_at', tzinfo=TZ)).values('day')
            .annotate(total=Count('id')).order_by('day')
        )
        most_active = week_per_exec[0] if week_per_exec else None
        return Response({
            'timezone': DISPLAY_TIMEZONE,
            'generated_at': now.isoformat(),
            'today': base.filter(created_at__gte=today_start).count(),
            'last_7_days': week.count(),
            'denied_last_7_days': week.filter(outcome='denied').count(),
            'total': base.count(),
            'most_active_executive': ({
                'id': str(most_active['actor_id']),
                'name': most_active['actor_name'],
                'department': department_label(most_active['actor_role']),
                'count': most_active['total'],
            } if most_active else None),
            'per_executive': [{
                'id': str(r['actor_id']), 'name': r['actor_name'], 'role': r['actor_role'],
                'department': department_label(r['actor_role']),
                'count': r['total'], 'denied': r['denied'],
            } for r in per_exec],
            'per_module': [{
                'module': r['module'],
                'label': MODULE_LABELS.get(r['module'], r['module'].replace('_', ' ').title()),
                'count': r['total'],
            } for r in per_module],
            'per_day': [{'day': r['day'].isoformat(), 'count': r['total']} for r in per_day],
        })


class ExecutiveActivityExportView(FounderLogView):
    def get(self, request):
        qs = filtered_queryset(request.query_params)[:EXPORT_LIMIT]
        response = HttpResponse(content_type='text/csv; charset=utf-8')
        stamp = timezone.now().astimezone(TZ).strftime('%Y%m%d-%H%M')
        response['Content-Disposition'] = f'attachment; filename="executive-activity-{stamp}.csv"'
        response.write('﻿')
        writer = csv.writer(response)
        writer.writerow([
            f'Date and time ({DISPLAY_TIMEZONE})', 'Executive', 'Department', 'Module', 'Action',
            'Target', 'Summary', 'Result', 'HTTP status', 'Method', 'Path', 'IP address',
        ])
        written = 0
        for row in qs.iterator():
            target = ' '.join(x for x in (row.target_type, row.target_label or row.target_id) if x)
            writer.writerow([
                row.created_at.astimezone(TZ).strftime('%Y-%m-%d %H:%M:%S'),
                _safe_cell(row.actor_name), department_label(row.actor_role),
                MODULE_LABELS.get(row.module, row.module), row.action, _safe_cell(target),
                _safe_cell(row.summary), row.outcome, row.status_code or '', row.method,
                row.path, row.ip_address,
            ])
            written += 1
        record_executive_activity(
            user=request.user, request=request, action='export', module='executive_activity',
            target_type='executive activity log', summary=(
                f'{department_label(request.user.role)}: {request.user.name} exported the system log '
                f'({written} rows)'
            ), status_code=200,
        )
        return response


def _safe_cell(value):
    """Neutralise spreadsheet formula injection in text cells."""
    value = str(value or '')
    return "'" + value if value[:1] in ('=', '+', '-', '@') else value
