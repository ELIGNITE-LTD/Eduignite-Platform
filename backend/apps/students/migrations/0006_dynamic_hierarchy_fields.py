from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("students", "0005_studentactivationtoken"),
    ]

    operations = [
        migrations.AlterField(
            model_name="student",
            name="class_level",
            field=models.CharField(default="Form 1", max_length=100),
        ),
        migrations.AlterField(
            model_name="student",
            name="section",
            field=models.CharField(default="General", max_length=100),
        ),
        migrations.AlterField(
            model_name="studentactivationtoken",
            name="class_level",
            field=models.CharField(default="Form 1", max_length=100),
        ),
        migrations.AlterField(
            model_name="studentactivationtoken",
            name="section",
            field=models.CharField(default="General", max_length=100),
        ),
    ]
