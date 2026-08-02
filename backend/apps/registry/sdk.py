"""The SDK app code is handed.

This is the whole surface an app can reach. There is no ORM here, no queryset
that escapes, no connection, and no way to name another app or another school.

The isolation is structural rather than defensive. ``app_key`` and ``school_id``
are set by the runtime when it builds the context, and every query filters on
them. App code cannot supply them, cannot change them, and cannot express a
query that omits them — not because it is checked, but because there is no
parameter through which to say it.

A language-level sandbox can be escaped. A missing API cannot be called.
"""

from __future__ import annotations

from django.db import transaction

from .collection_schema import ValidationError, collection_spec, indexed_fields, validate_record
from .data_models import AppRecord

#: A single query can never return more than this, whatever the app asks for.
MAX_LIMIT = 500
DEFAULT_LIMIT = 100

#: Filter operators an app may use. Anything else is refused rather than
#: silently ignored, so a typo does not become a query returning everything.
OPERATORS = {'', 'in', 'gt', 'gte', 'lt', 'lte', 'contains', 'startswith', 'isnull'}


class PermissionError_(RuntimeError):
    """An app reaching past what its manifest declared."""


class SdkError(RuntimeError):
    """A misuse of the SDK, reported to the app author."""


class CollectionHandle:
    """Reads and writes for one collection, already scoped to one app and school."""

    def __init__(self, service: 'DataService', name: str):
        self._service = service
        self._name = name
        self._spec = collection_spec(service.manifest_raw, name)
        if self._spec is None:
            raise SdkError(
                f'This app does not declare a collection called {name!r}.'
            )

    # -- internal ---------------------------------------------------------

    def _require(self, action: str) -> None:
        self._service.require_permission(self._name, action)

    def _base(self):
        """Every query starts here. There is no way to build one that does not."""
        return AppRecord.objects.filter(
            app_key=self._service.app_key,
            school_id=self._service.school_id,
            collection=self._name,
        )

    def _row(self, record: AppRecord) -> dict:
        return {
            'id': str(record.id),
            'created': record.created.isoformat() if record.created else None,
            'modified': record.modified.isoformat() if record.modified else None,
            **(record.data or {}),
        }

    def _build_filters(self, where: dict | None) -> dict:
        if not where:
            return {}

        allowed = set(indexed_fields(self._spec))
        filters = {}
        for key, value in where.items():
            field, _, operator = str(key).partition('__')
            if operator not in OPERATORS:
                raise SdkError(
                    f'Unknown filter {key!r}. Supported: '
                    f'{", ".join(sorted(o for o in OPERATORS if o))}.'
                )
            if field not in allowed:
                raise SdkError(
                    f'{field!r} is not filterable. Mark it "indexed": true in the '
                    'collection declaration first — an unindexed filter would scan '
                    "every one of this school's records."
                )
            lookup = f'data__{field}' + (f'__{operator}' if operator else '')
            filters[lookup] = value
        return filters

    # -- reads ------------------------------------------------------------

    def query(self, where: dict | None = None, order_by: str | None = None,
              limit: int | None = None, offset: int = 0) -> list:
        """Records matching ``where``, newest first unless told otherwise."""
        self._require('read')

        queryset = self._base().filter(**self._build_filters(where))

        if order_by:
            descending = order_by.startswith('-')
            field = order_by.lstrip('-')
            if field in ('created', 'modified'):
                queryset = queryset.order_by(order_by)
            elif field in indexed_fields(self._spec):
                queryset = queryset.order_by(('-' if descending else '') + f'data__{field}')
            else:
                raise SdkError(
                    f'Cannot sort by {field!r}. Sort by created, modified, or a field '
                    'marked "indexed": true.'
                )

        size = min(int(limit or DEFAULT_LIMIT), MAX_LIMIT)
        start = max(int(offset or 0), 0)
        return [self._row(r) for r in queryset[start:start + size]]

    def get(self, record_id) -> dict | None:
        """One record by id, or None. Never reaches outside this app and school."""
        self._require('read')
        record = self._base().filter(id=record_id).first()
        return self._row(record) if record else None

    def count(self, where: dict | None = None) -> int:
        self._require('read')
        return self._base().filter(**self._build_filters(where)).count()

    # -- writes -----------------------------------------------------------

    def insert(self, values: dict) -> dict:
        self._require('write')
        cleaned = validate_record(self._spec, values)
        record = AppRecord.objects.create(
            app_key=self._service.app_key,
            school_id=self._service.school_id,
            collection=self._name,
            data=cleaned,
            created_by=self._service.user,
        )
        return self._row(record)

    def update(self, record_id, values: dict) -> dict | None:
        """Merge ``values`` into an existing record. Returns None if there is none."""
        self._require('write')
        with transaction.atomic():
            record = self._base().select_for_update().filter(id=record_id).first()
            if record is None:
                return None
            cleaned = validate_record(self._spec, values, partial=True)
            record.data = {**(record.data or {}), **cleaned}
            record.save(update_fields=['data', 'modified'])
        return self._row(record)

    def delete(self, record_id) -> bool:
        self._require('write')
        deleted, _ = self._base().filter(id=record_id).delete()
        return bool(deleted)


class DataService:
    """The app's own data. Scoped at construction, never by the caller."""

    def __init__(self, *, app_key: str, school_id, manifest_raw: dict, user=None):
        self.app_key = app_key
        self.school_id = school_id
        self.manifest_raw = manifest_raw or {}
        self.user = user
        self._declared = self._read_declared_permissions()

    def _read_declared_permissions(self) -> set:
        declared = set()
        permissions = self.manifest_raw.get('permissions') or {}
        for entry in permissions.get('collections') or []:
            name, _, action = str(entry).partition(':')
            declared.add((name, action))
        return declared

    def require_permission(self, collection: str, action: str) -> None:
        if (collection, action) not in self._declared:
            raise PermissionError_(
                f'This app did not declare "{collection}:{action}". '
                'Add it to permissions in the manifest and resubmit.'
            )

    def collection(self, name: str) -> CollectionHandle:
        return CollectionHandle(self, name)


class CoreService:
    """Read-only access to platform data, scoped to the caller's school.

    Everything here goes through the Core service boundaries the rest of the
    platform uses, so an app is subject to exactly the same rules as first-party
    code. There is deliberately no write path: an app that could change student
    records or marks is one bad build away from corrupting a term of data.
    """

    def __init__(self, *, school_id, manifest_raw: dict, user=None):
        self.school_id = school_id
        self.user = user
        permissions = (manifest_raw or {}).get('permissions') or {}
        self._declared = set(permissions.get('core') or [])

    def _require(self, permission: str) -> None:
        if permission not in self._declared:
            raise PermissionError_(
                f'This app did not declare {permission!r}. '
                'Add it to permissions.core in the manifest and resubmit.'
            )

    def students(self, school_class=None, class_name: str = '') -> list:
        """Students of this school. Never another school's."""
        self._require('students:read')
        from apps.students import api as students_api

        queryset = students_api.list_students(
            school=self.school_id, school_class=school_class, class_name=class_name
        )
        return [
            {
                'id': str(s.id),
                'name': getattr(s.user, 'name', '') if s.user_id else '',
                'admission_number': s.admission_number or '',
                'class_name': (s.school_class.name if s.school_class_id else '')
                or s.student_class
                or '',
            }
            for s in queryset[:MAX_LIMIT]
        ]

    def staff(self, roles=None) -> list:
        """Staff accounts at this school."""
        self._require('users:read')
        from django.contrib.auth import get_user_model

        queryset = get_user_model().objects.filter(
            school_id=self.school_id, is_drafted=False, is_active=True
        )
        if roles:
            queryset = queryset.filter(role__in=list(roles))
        return [
            {'id': str(u.id), 'name': u.name or '', 'role': u.role}
            for u in queryset[:MAX_LIMIT]
        ]

    def classes(self) -> list:
        """Classes at this school."""
        self._require('classes:read')
        from apps.schools.models import SchoolClass

        queryset = SchoolClass.objects.filter(school_id=self.school_id)
        return [{'id': str(c.id), 'name': c.name} for c in queryset[:MAX_LIMIT]]


class AppContext:
    """What every app handler is called with.

    The runtime builds it. App code receives it and cannot construct another
    one for a different app or a different school.
    """

    def __init__(self, *, app_key: str, school_id, manifest_raw: dict, user=None):
        self.app_key = app_key
        self.school_id = school_id
        self.user = user
        self.data = DataService(
            app_key=app_key, school_id=school_id, manifest_raw=manifest_raw, user=user
        )
        self.core = CoreService(
            school_id=school_id, manifest_raw=manifest_raw, user=user
        )

    def __repr__(self):
        return f'<AppContext {self.app_key} school={self.school_id}>'


__all__ = [
    'AppContext', 'CollectionHandle', 'CoreService', 'DataService',
    'PermissionError_', 'SdkError', 'ValidationError',
]
