from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('payroll', '0001_initial'),
    ]

    operations = [
        migrations.AddField(
            model_name='payrollrecord',
            name='daily_ot_hours',
            field=models.DecimalField(decimal_places=2, default=0, max_digits=8),
        ),
        migrations.AddField(
            model_name='payrollrecord',
            name='double_time_hours',
            field=models.DecimalField(decimal_places=2, default=0, max_digits=8),
        ),
        migrations.AddField(
            model_name='payrollrecord',
            name='uk_income_tax',
            field=models.DecimalField(decimal_places=2, default=0, max_digits=10),
        ),
        migrations.AddField(
            model_name='payrollrecord',
            name='uk_employee_ni',
            field=models.DecimalField(decimal_places=2, default=0, max_digits=10),
        ),
        migrations.AddField(
            model_name='payrollrecord',
            name='uk_employer_ni',
            field=models.DecimalField(decimal_places=2, default=0, max_digits=10),
        ),
        migrations.AddField(
            model_name='payrollrecord',
            name='uk_tax_code',
            field=models.CharField(blank=True, max_length=20, null=True),
        ),
        migrations.AddField(
            model_name='payrollrecord',
            name='uk_ni_category',
            field=models.CharField(blank=True, max_length=1, null=True),
        ),
        migrations.AddField(
            model_name='payrollrecord',
            name='holiday_hours_accrued',
            field=models.DecimalField(decimal_places=2, default=0, max_digits=6),
        ),
        migrations.AddField(
            model_name='payrollrecord',
            name='region',
            field=models.CharField(blank=True, max_length=50, null=True),
        ),
        migrations.AddField(
            model_name='payrollrecord',
            name='is_exempt',
            field=models.BooleanField(default=False),
        ),
        migrations.AddField(
            model_name='payrollrecord',
            name='wage_floor_compliant',
            field=models.BooleanField(default=True),
        ),
    ]
