import os
import django
import sys

# Setup django
sys.path.append(os.getcwd())
os.environ.setdefault("DJANGO_SETTINGS_MODULE", "quicktims.settings")
django.setup()

from settings_hub.models import Invoice
from companies.models import Company
from django.utils import timezone
from decimal import Decimal
from django_tenants.utils import schema_context

def seed_invoices():
    # Target the 'caldim' tenant specifically
    target_schema = "caldim"
    try:
        tenant = Company.objects.get(schema_name=target_schema)
    except Company.DoesNotExist:
        print(f"Tenant {target_schema} not found. Seeding first available tenant.")
        tenant = Company.objects.exclude(schema_name="public").first()
    
    if not tenant:
        print("No tenant company found.")
        return

    print(f"Seeding invoices for tenant: {tenant.schema_name}")
    
    with schema_context(tenant.schema_name):
        invoices = [
            {
                "invoice_number": "INV-2026-001",
                "amount": Decimal("149.00"),
                "status": "paid",
                "billing_date": timezone.now() - timezone.timedelta(days=30),
                "due_date": timezone.now() - timezone.timedelta(days=15),
            },
            {
                "invoice_number": "INV-2026-002",
                "amount": Decimal("149.00"),
                "status": "paid",
                "billing_date": timezone.now() - timezone.timedelta(days=5),
                "due_date": timezone.now() + timezone.timedelta(days=10),
            },
            {
                "invoice_number": "INV-2026-003",
                "amount": Decimal("49.00"),
                "status": "pending",
                "billing_date": timezone.now(),
                "due_date": timezone.now() + timezone.timedelta(days=14),
            }
        ]

        for inv_data in invoices:
            Invoice.objects.get_or_create(
                invoice_number=inv_data["invoice_number"],
                defaults={
                    "company": tenant,
                    "amount": inv_data["amount"],
                    "status": inv_data["status"],
                    "billing_date": inv_data["billing_date"],
                    "due_date": inv_data["due_date"],
                    "pdf_url": "https://caltrack.com/invoices/mock.pdf"
                }
            )
        print("Seed complete.")

if __name__ == "__main__":
    seed_invoices()
