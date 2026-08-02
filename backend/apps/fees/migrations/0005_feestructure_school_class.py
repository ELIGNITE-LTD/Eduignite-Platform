from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        ('schools', '0015_custom_sub_schools'),
        ('fees', '0004_rename_fees_school_school_i_5a6fb4_idx_fees_school_school__45c4ae_idx_and_more'),
    ]

    operations = [
        migrations.AddField(
            model_name='feestructure',
            name='school_class',
            field=models.ForeignKey(
                blank=True,
                help_text='Optional class/form target for student fee types.',
                null=True,
                on_delete=django.db.models.deletion.SET_NULL,
                related_name='fee_structures',
                to='schools.schoolclass',
            ),
        ),
        migrations.AddIndex(
            model_name='feestructure',
            index=models.Index(fields=['school', 'school_class', 'academic_year'], name='fees_feestr_school__3db548_idx'),
        ),
    ]
