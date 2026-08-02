from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        ('schools', '0018_schoolclass_cycle'),
        ('fees', '0008_payment_method_mobile_money_only'),
    ]

    operations = [
        migrations.AlterField(
            model_name='feestructure',
            name='role',
            field=models.CharField(
                choices=[
                    ('STUDENT', 'Student'),
                    ('PARENT', 'Parent'),
                    ('TEACHER', 'Teacher'),
                    ('STAFF', 'Staff'),
                ],
                default='STUDENT',
                max_length=50,
            ),
        ),
        migrations.AddField(
            model_name='feestructure',
            name='sub_school',
            field=models.ForeignKey(
                blank=True,
                help_text='Optional sub-school target. When set (and no class), the fee applies to every class in this sub-school.',
                null=True,
                on_delete=django.db.models.deletion.SET_NULL,
                related_name='fee_structures',
                to='schools.subschool',
            ),
        ),
    ]
