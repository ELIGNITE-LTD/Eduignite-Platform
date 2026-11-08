"""EduIgnite app declaration for Fees & Mobile Money.

See apps/registry/manifest.py for what each field means.
"""

from apps.registry.manifest import AppManifest, AppTier, register

register(
    AppManifest(
        key='fees',
        name='Fees & Mobile Money',
        summary='School fees, mobile-money collection, receipts and reminders.',
        icon='Wallet',
        tier=AppTier.STANDARD,
        roles=['SCHOOL_ADMIN', 'SUB_ADMIN', 'BURSAR', 'PARENT', 'STUDENT'],
        routes=['/dashboard/fees'],
        api_prefixes=['fees/'],
        core_services=['students'],
        owns_data=['fee structures', 'payments', 'invoices'],
        price_hint='Standard',
    )
)
