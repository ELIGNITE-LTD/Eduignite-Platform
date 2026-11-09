from django.db import migrations

GROUPS = [
    ('A', 'Group A - Schools and school users',
     'Schools and school users: principals, administrators, teachers and other school staff.',
     ['SCHOOL_ADMIN', 'SUB_ADMIN', 'TEACHER', 'BURSAR', 'LIBRARIAN', 'PARENT', 'PROPRIETOR'], 10),
    ('B', 'Group B - Learners', 'Learners and students.', ['STUDENT', 'ACADEMY_LEARNER'], 20),
    ('C', 'Group C - Partners', 'Partners.', ['PARTNER'], 30),
]


def seed(apps, schema_editor):
    CustomerGroup = apps.get_model('customer_care', 'CustomerGroup')
    for slug, name, description, roles, order in GROUPS:
        CustomerGroup.objects.get_or_create(
            slug=slug, defaults={'name': name, 'description': description, 'rule_roles': roles,
                                 'sort_order': order, 'is_active': True})
    # Contact information: seeded from what the site already shows (nothing invented).
    Item = apps.get_model('customer_care', 'ContactInfoItem')
    if Item.objects.exists():
        return
    email, phone = 'info@eduignite.online', ''
    try:
        PlatformSettings = apps.get_model('platform', 'PlatformSettings')
        row = PlatformSettings.objects.first()
        if row:
            email = (row.contact_email or email).strip() or email
            phone = (row.contact_phone or '').strip()
    except LookupError:
        pass
    Item.objects.create(kind='email', label='Customer care email', value=email, sort_order=10)
    if phone:
        Item.objects.create(kind='phone', label='Phone', value=phone, sort_order=20)
    Item.objects.create(kind='address', label='Location', value='Bamenda, Cameroon', sort_order=30)
    Item.objects.create(kind='website', label='Website', value='https://eduignite.online', sort_order=40)


class Migration(migrations.Migration):
    dependencies = [
        ('customer_care', '0001_initial'),
        ('platform', '0015_integrationsecrets_whatsapp_api_token_and_more'),
    ]
    operations = [migrations.RunPython(seed, migrations.RunPython.noop)]
