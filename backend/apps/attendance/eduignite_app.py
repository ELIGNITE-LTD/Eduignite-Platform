"""EduIgnite app declaration for Attendance.

See apps/registry/manifest.py for what each field means.
"""

from apps.registry.manifest import AppManifest, AppTier, register

register(
    AppManifest(
        key='attendance',
        name='Attendance',
        summary='Daily attendance per class, with absence alerts to parents.',
        icon='ClipboardCheck',
        tier=AppTier.INCLUDED,
        roles=['SCHOOL_ADMIN', 'SUB_ADMIN', 'TEACHER', 'STUDENT', 'PARENT'],
        routes=['/dashboard/attendance'],
        api_prefixes=['attendance/'],
        core_services=['students'],
        owns_data=['attendance records', 'attendance sessions'],
        price_hint='Included',
    )
)
