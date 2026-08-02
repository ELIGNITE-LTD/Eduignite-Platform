from django.db import migrations, models

import apps.app_store.models


class Migration(migrations.Migration):

    dependencies = [
        ('app_store', '0002_appstoreitem_full_description_blank'),
    ]

    operations = [
        migrations.SeparateDatabaseAndState(
            database_operations=[
                migrations.RunSQL(
                    sql='''
                    ALTER TABLE "app_store_appstoreitem"
                    ALTER COLUMN "screenshots" DROP DEFAULT,
                    ALTER COLUMN "screenshots" TYPE jsonb
                    USING COALESCE(to_jsonb("screenshots"), '[]'::jsonb),
                    ALTER COLUMN "screenshots" SET DEFAULT '[]'::jsonb;
                    ''',
                    reverse_sql='''
                    ALTER TABLE "app_store_appstoreitem"
                    ALTER COLUMN "screenshots" DROP DEFAULT,
                    ALTER COLUMN "screenshots" TYPE varchar(1000)[]
                    USING ARRAY[]::varchar(1000)[],
                    ALTER COLUMN "screenshots" SET DEFAULT ARRAY[]::varchar(1000)[];
                    ''',
                ),
            ],
            state_operations=[
                migrations.AlterField(
                    model_name='appstoreitem',
                    name='screenshots',
                    field=models.JSONField(blank=True, default=list),
                ),
            ],
        ),
        migrations.AlterField(
            model_name='appstoreitem',
            name='download_link',
            field=models.URLField(blank=True, default='', max_length=1000),
        ),
        migrations.AddField(
            model_name='appstoreitem',
            name='apk_file',
            field=models.FileField(blank=True, null=True, upload_to=apps.app_store.models.app_store_upload_to),
        ),
        migrations.AddField(
            model_name='appstoreitem',
            name='rating',
            field=models.DecimalField(decimal_places=2, default=0, max_digits=3),
        ),
        migrations.AddField(
            model_name='appstoreitem',
            name='version',
            field=models.CharField(default='1.0.0', max_length=50),
        ),
    ]
