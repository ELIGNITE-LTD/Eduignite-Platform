from django.db import migrations, models


class Migration(migrations.Migration):
    """Remove global unique constraint on Subject.code; school-scoped unique_together is sufficient."""

    dependencies = [
        ("grades", "0004_initial"),
    ]

    operations = [
        migrations.AlterField(
            model_name="subject",
            name="code",
            field=models.CharField(max_length=50, db_index=True),
        ),
    ]
