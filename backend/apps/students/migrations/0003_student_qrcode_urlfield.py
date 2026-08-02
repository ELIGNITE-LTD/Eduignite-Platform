# Converts Student.qr_code from ImageField to URLField so QR codes are stored
# as base64 data URLs instead of locally saved files.

from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('students', '0002_initial'),
    ]

    operations = [
        migrations.AlterField(
            model_name='student',
            name='qr_code',
            field=models.URLField(blank=True, max_length=5000, null=True),
        ),
    ]
