from django.db import migrations
from django.utils.text import slugify

# Starter partner types so the public application form is usable immediately.
# These are ordinary editable rows — the CEO/CTO can rename, deactivate or
# delete them and add their own; nothing here is hard-coded into the app.
SEED = [
    ("Marketing Partner", "Help spread the word about EduIgnite and bring schools on board."),
    ("School / Institutional Partner", "Schools and institutions partnering with EduIgnite."),
    ("Technology Partner", "Integrations and technical collaboration."),
    ("Community Partner", "Associations and community groups championing EduIgnite locally."),
]


def seed(apps, schema_editor):
    PartnerType = apps.get_model('partners', 'PartnerType')
    for i, (name, desc) in enumerate(SEED):
        if PartnerType.objects.filter(name=name).exists():
            continue
        PartnerType.objects.create(
            name=name, slug=slugify(name), description=desc,
            is_active=True, order=i,
        )


def unseed(apps, schema_editor):
    PartnerType = apps.get_model('partners', 'PartnerType')
    for name, _ in SEED:
        PartnerType.objects.filter(name=name, applications__isnull=True, partners__isnull=True).delete()


class Migration(migrations.Migration):

    dependencies = [
        ('partners', '0002_partner_partnerapplication_partnertype_referralclick_and_more'),
    ]

    operations = [migrations.RunPython(seed, unseed)]
