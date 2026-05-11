from django.contrib import admin
from .models import AuditLog, HolidayAccrual, RightToWork, WTROptOut, OvertimeAlert, BreakAttestation

admin.site.register(AuditLog)
admin.site.register(HolidayAccrual)
admin.site.register(RightToWork)
admin.site.register(WTROptOut)
admin.site.register(OvertimeAlert)
admin.site.register(BreakAttestation)
