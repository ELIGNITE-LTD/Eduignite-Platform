from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("users", "0030_leadership_entries"),
    ]

    operations = [
        migrations.AddField(
            model_name="founderprofile",
            name="public_bio",
            field=models.CharField(
                blank=True,
                default="",
                help_text="Short professional bio shown on the public About page.",
                max_length=320,
            ),
        ),
        migrations.AddField(
            model_name="founderprofile",
            name="public_links",
            field=models.JSONField(
                blank=True,
                default=list,
                help_text='Professional links shown on the public card: a list of {"type", "url"}.',
            ),
        ),
    ]
