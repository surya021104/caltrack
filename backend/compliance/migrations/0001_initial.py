from django.conf import settings
from django.db import migrations, models
import django.db.models.deletion
import django.utils.timezone


class Migration(migrations.Migration):

    initial = True

    dependencies = [
        ('companies', '0002_company_shift_enforcement_mode'),
        ('employees', '0004_employee_compliance_fields'),
        ('time_tracking', '0003_location_geofence_type_created_by'),
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = [
        # AuditLog
        migrations.CreateModel(
            name='AuditLog',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('time_log_id', models.IntegerField(db_index=True)),
                ('action', models.CharField(choices=[
                    ('create', 'Created'), ('edit', 'Edited'), ('delete', 'Deleted'),
                    ('approve', 'Approved'), ('reject', 'Rejected'), ('submit', 'Submitted'),
                    ('clock_in', 'Clock In'), ('clock_out', 'Clock Out'),
                ], max_length=20)),
                ('reason', models.TextField(blank=True)),
                ('before_state', models.JSONField(blank=True, null=True)),
                ('after_state', models.JSONField(blank=True, null=True)),
                ('timestamp', models.DateTimeField(db_index=True, default=django.utils.timezone.now)),
                ('retention_until', models.DateField(blank=True, null=True)),
                ('company', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='audit_logs', to='companies.company')),
                ('employee', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='audit_logs', to='employees.employee')),
                ('actor', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='audit_actions', to=settings.AUTH_USER_MODEL)),
            ],
            options={'ordering': ['-timestamp']},
        ),
        migrations.AddIndex(
            model_name='auditlog',
            index=models.Index(fields=['company', 'time_log_id'], name='comp_audit_co_tl_idx'),
        ),
        migrations.AddIndex(
            model_name='auditlog',
            index=models.Index(fields=['employee', 'timestamp'], name='comp_audit_emp_ts_idx'),
        ),
        # HolidayAccrual
        migrations.CreateModel(
            name='HolidayAccrual',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('leave_year_start', models.DateField()),
                ('leave_year_end', models.DateField()),
                ('reg13_hours_accrued', models.DecimalField(decimal_places=2, default=0, max_digits=8)),
                ('reg13a_hours_accrued', models.DecimalField(decimal_places=2, default=0, max_digits=8)),
                ('reg13_hours_taken', models.DecimalField(decimal_places=2, default=0, max_digits=8)),
                ('reg13a_hours_taken', models.DecimalField(decimal_places=2, default=0, max_digits=8)),
                ('carry_over_hours', models.DecimalField(decimal_places=2, default=0, max_digits=6)),
                ('average_hourly_rate', models.DecimalField(blank=True, decimal_places=4, max_digits=8, null=True)),
                ('rolled_up_pay_enabled', models.BooleanField(default=False)),
                ('updated_at', models.DateTimeField(auto_now=True)),
                ('company', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='holiday_accruals', to='companies.company')),
                ('employee', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='holiday_accruals', to='employees.employee')),
            ],
            options={'unique_together': {('company', 'employee', 'leave_year_start')}},
        ),
        # RightToWork
        migrations.CreateModel(
            name='RightToWork',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('document_type', models.CharField(choices=[
                    ('passport', 'Passport'), ('brp', 'Biometric Residence Permit (BRP)'),
                    ('share_code', 'Share Code'), ('eu_settlement', 'EU Settlement Scheme'),
                    ('birth_cert', 'Birth Certificate + NI'), ('other', 'Other'),
                ], max_length=30)),
                ('document_number', models.CharField(blank=True, max_length=100)),
                ('document_file', models.FileField(blank=True, null=True, upload_to='rtw_documents/')),
                ('issue_date', models.DateField(blank=True, null=True)),
                ('expiry_date', models.DateField(blank=True, null=True)),
                ('status', models.CharField(choices=[
                    ('pending', 'Pending Verification'), ('verified', 'Verified'),
                    ('expired', 'Expired'), ('rejected', 'Rejected'),
                ], default='pending', max_length=20)),
                ('notes', models.TextField(blank=True)),
                ('alert_sent_60d', models.BooleanField(default=False)),
                ('alert_sent_30d', models.BooleanField(default=False)),
                ('alert_sent_7d', models.BooleanField(default=False)),
                ('verified_at', models.DateTimeField(blank=True, null=True)),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('updated_at', models.DateTimeField(auto_now=True)),
                ('company', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='rtw_records', to='companies.company')),
                ('employee', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='rtw_records', to='employees.employee')),
                ('verified_by', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='rtw_verifications', to=settings.AUTH_USER_MODEL)),
            ],
            options={'ordering': ['-created_at']},
        ),
        # WTROptOut
        migrations.CreateModel(
            name='WTROptOut',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('agreement_file', models.FileField(blank=True, null=True, upload_to='wtr_optouts/')),
                ('signed_on', models.DateField()),
                ('is_active', models.BooleanField(default=True)),
                ('withdrawn_on', models.DateField(blank=True, null=True)),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('company', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='wtr_opt_outs', to='companies.company')),
                ('employee', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='wtr_opt_outs', to='employees.employee')),
            ],
            options={'ordering': ['-signed_on']},
        ),
        # OvertimeAlert
        migrations.CreateModel(
            name='OvertimeAlert',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('iso_year', models.IntegerField()),
                ('iso_week', models.IntegerField()),
                ('alert_type', models.CharField(choices=[
                    ('approaching_40', 'Approaching 40hrs (US)'),
                    ('exceeded_40', 'Exceeded 40hrs — OT Pay Required (US)'),
                    ('daily_ot_ca', 'Daily OT (CA >8hrs)'),
                    ('double_time_ca', 'Double Time (CA >12hrs)'),
                    ('daily_ot_ak', 'Daily OT (AK >8hrs)'),
                    ('approaching_48_uk', 'Approaching 48hr Limit (UK WTR)'),
                    ('exceeded_48_uk', '17-week avg exceeds 48hr limit (UK WTR)'),
                ], max_length=30)),
                ('hours_worked', models.DecimalField(decimal_places=2, max_digits=6)),
                ('threshold_hours', models.DecimalField(decimal_places=2, max_digits=6)),
                ('is_resolved', models.BooleanField(default=False)),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('company', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='overtime_alerts', to='companies.company')),
                ('employee', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='overtime_alerts', to='employees.employee')),
            ],
            options={
                'ordering': ['-iso_year', '-iso_week'],
                'unique_together': {('company', 'employee', 'iso_year', 'iso_week', 'alert_type')},
            },
        ),
        # BreakAttestation
        migrations.CreateModel(
            name='BreakAttestation',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('attested_at', models.DateTimeField(default=django.utils.timezone.now)),
                ('break_taken', models.BooleanField(default=True)),
                ('notes', models.TextField(blank=True)),
                ('company', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='break_attestations', to='companies.company')),
                ('employee', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='break_attestations', to='employees.employee')),
                ('time_log', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='break_attestations', to='time_tracking.timelog')),
            ],
            options={'unique_together': {('time_log', 'employee')}},
        ),
    ]
