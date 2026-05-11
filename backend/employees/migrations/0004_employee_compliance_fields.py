from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('employees', '0003_employee_allow_all_locations'),
    ]

    operations = [
        migrations.AddField(
            model_name='employee',
            name='date_of_birth',
            field=models.DateField(blank=True, null=True),
        ),
        migrations.AddField(
            model_name='employee',
            name='exempt_status',
            field=models.CharField(
                choices=[
                    ('non_exempt', 'Non-Exempt (eligible for OT)'),
                    ('exempt', 'Exempt (not eligible for OT)'),
                    ('pending', 'Pending Classification'),
                ],
                default='non_exempt',
                max_length=20,
            ),
        ),
        migrations.AddField(
            model_name='employee',
            name='exempt_history',
            field=models.JSONField(blank=True, default=list),
        ),
        migrations.AddField(
            model_name='employee',
            name='flsa_duties_category',
            field=models.CharField(blank=True, max_length=30, null=True),
        ),
        migrations.AddField(
            model_name='employee',
            name='weekly_salary',
            field=models.DecimalField(blank=True, decimal_places=2, max_digits=10, null=True),
        ),
        migrations.AddField(
            model_name='employee',
            name='uk_tax_code',
            field=models.CharField(blank=True, default='1257L', max_length=20, null=True),
        ),
        migrations.AddField(
            model_name='employee',
            name='uk_ni_category',
            field=models.CharField(blank=True, default='A', max_length=1, null=True),
        ),
        migrations.AddField(
            model_name='employee',
            name='rolled_up_holiday_pay',
            field=models.BooleanField(default=False),
        ),
        migrations.AddField(
            model_name='employee',
            name='wtr_opt_out_active',
            field=models.BooleanField(default=False),
        ),
    ]
