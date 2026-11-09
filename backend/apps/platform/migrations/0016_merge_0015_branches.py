from django.db import migrations


class Migration(migrations.Migration):
    """Join the two 0015 migrations that both branched from 0014.

    0015_executive_activity_log (executive activity log) and
    0015_integrationsecrets_whatsapp_api_token_and_more (customer care) were
    merged from separate branches, leaving two leaf nodes. Django refuses to run
    `migrate` with two leaves, so the web container could not start. This merge
    changes no tables; both migrations touch different models.
    """

    dependencies = [
        ('platform', '0015_executive_activity_log'),
        ('platform', '0015_integrationsecrets_whatsapp_api_token_and_more'),
    ]

    operations = []
