"""
companies/utils.py — Multi-region compliance data for QuickTIMS.
US FLSA (all 50 states) + UK WTR/PAYE/NI.
"""
from decimal import Decimal

# ---------------------------------------------------------------------------
# US State Minimum Wages (2024-2025, USD/hr)
# ---------------------------------------------------------------------------
US_STATE_MINIMUM_WAGES = {
    "AL": 7.25,  "AK": 11.73, "AZ": 14.35, "AR": 11.00, "CA": 16.50,
    "CO": 14.42, "CT": 15.69, "DE": 13.25, "FL": 13.00, "GA": 7.25,
    "HI": 14.00, "ID": 7.25,  "IL": 14.00, "IN": 7.25,  "IA": 7.25,
    "KS": 7.25,  "KY": 7.25,  "LA": 7.25,  "ME": 14.15, "MD": 15.00,
    "MA": 15.00, "MI": 10.33, "MN": 10.85, "MS": 7.25,  "MO": 12.30,
    "MT": 10.30, "NE": 12.00, "NV": 12.00, "NH": 7.25,  "NJ": 15.49,
    "NM": 12.00, "NY": 16.00, "NC": 7.25,  "ND": 7.25,  "OH": 10.45,
    "OK": 7.25,  "OR": 14.70, "PA": 7.25,  "RI": 14.00, "SC": 7.25,
    "SD": 11.20, "TN": 7.25,  "TX": 7.25,  "UT": 7.25,  "VT": 13.67,
    "VA": 12.41, "WA": 16.28, "WV": 8.75,  "WI": 7.25,  "WY": 7.25,
    "DC": 17.50,
}
US_FEDERAL_MINIMUM_WAGE = 7.25

# ---------------------------------------------------------------------------
# US State Break Laws
# ---------------------------------------------------------------------------
US_STATE_BREAK_LAWS = {
    "CA": {
        "rest_break_minutes": 10, "rest_break_per_hours": 4,
        "meal_break_minutes": 30, "meal_break_threshold_hours": 5,
        "second_meal_threshold_hours": 10, "paid_rest_breaks": True,
    },
    "NY": {
        "meal_break_minutes": 30, "meal_break_threshold_hours": 6,
        "rest_break_minutes": None, "rest_break_per_hours": None,
        "paid_rest_breaks": False,
    },
    "WA": {
        "rest_break_minutes": 10, "rest_break_per_hours": 4,
        "meal_break_minutes": 30, "meal_break_threshold_hours": 5,
        "second_meal_threshold_hours": None, "paid_rest_breaks": True,
    },
    "CO": {
        "rest_break_minutes": 10, "rest_break_per_hours": 4,
        "meal_break_minutes": 30, "meal_break_threshold_hours": 5,
        "second_meal_threshold_hours": None, "paid_rest_breaks": True,
    },
    "OR": {
        "rest_break_minutes": 10, "rest_break_per_hours": 4,
        "meal_break_minutes": 30, "meal_break_threshold_hours": 6,
        "second_meal_threshold_hours": None, "paid_rest_breaks": True,
    },
    "DEFAULT": {
        "meal_break_minutes": None, "meal_break_threshold_hours": None,
        "rest_break_minutes": None, "rest_break_per_hours": None,
        "paid_rest_breaks": False,
    },
}

# ---------------------------------------------------------------------------
# UK National Minimum / Living Wage (2024-2025, GBP/hr)
# ---------------------------------------------------------------------------
UK_NMW_RATES = {
    "21+": 11.44,
    "18-20": 8.60,
    "16-17": 6.40,
    "apprentice": 6.40,
}

# ---------------------------------------------------------------------------
# UK Income Tax Bands 2024/25 (GBP annual)
# ---------------------------------------------------------------------------
UK_TAX_BANDS = [
    {"name": "Personal Allowance", "from": 0,      "to": 12570,  "rate": 0.00},
    {"name": "Basic Rate",         "from": 12570,  "to": 50270,  "rate": 0.20},
    {"name": "Higher Rate",        "from": 50270,  "to": 125140, "rate": 0.40},
    {"name": "Additional Rate",    "from": 125140, "to": None,   "rate": 0.45},
]

# ---------------------------------------------------------------------------
# UK National Insurance 2024/25
# ---------------------------------------------------------------------------
UK_NI = {
    "primary_threshold_annual": 12570,
    "upper_earnings_limit_annual": 50270,
    "secondary_threshold_annual": 9100,
    "employee_rate_lower": Decimal("0.08"),
    "employee_rate_upper": Decimal("0.02"),
    "employer_rate": Decimal("0.138"),
}

UK_NI_CATEGORIES = {
    "A": "Standard (most employees)",
    "B": "Married women / widows (reduced rate)",
    "C": "Over State Pension Age",
    "H": "Apprentice under 25",
    "J": "Deferred (another job)",
    "M": "Under 21",
    "Z": "Under 21, deferred",
}

# ---------------------------------------------------------------------------
# UK Working Time Regulations 1998
# ---------------------------------------------------------------------------
UK_WTR = {
    "max_weekly_hours": 48,
    "reference_period_weeks": 17,
    "min_rest_between_shifts_hours": 11,
    "min_weekly_rest_hours": 24,
    "break_threshold_hours": 6,
    "break_minutes": 20,
    "reg13_weeks": 4,
    "reg13a_weeks": 1.6,
    "total_holiday_weeks": 5.6,
    "holiday_accrual_rate": Decimal("0.1207"),
    "max_carry_over_days": 8,
}

# FLSA exempt salary threshold (US 2024)
FLSA_EXEMPT_SALARY_THRESHOLD_WEEKLY = Decimal("844.00")

# FLSA duties test categories
FLSA_DUTIES_TEST_CATEGORIES = [
    "executive", "administrative", "professional", "outside_sales", "computer",
]


# ---------------------------------------------------------------------------
# Region Resolution
# ---------------------------------------------------------------------------

def resolve_region(employee, company):
    """Employee-level country/state takes precedence over company defaults."""
    country = (
        getattr(employee, "country", None) or
        getattr(company, "primary_country", None) or
        "US"
    )
    state = (
        getattr(employee, "state", None) or
        getattr(company, "default_state", None)
    )
    return {"country": country, "state": state}


# ---------------------------------------------------------------------------
# Compliance Rule Resolution
# ---------------------------------------------------------------------------

def get_compliance_rules(region):
    """Full compliance rule set for US FLSA or UK WTR."""
    country = (region.get("country") or "US").upper()
    state = (region.get("state") or "").upper()

    if country == "US":
        min_wage = US_STATE_MINIMUM_WAGES.get(state, US_FEDERAL_MINIMUM_WAGE)
        break_law = US_STATE_BREAK_LAWS.get(state, US_STATE_BREAK_LAWS["DEFAULT"])

        daily_ot_threshold = None
        daily_ot_multiplier = None
        double_time_threshold = None

        if state == "CA":
            daily_ot_threshold = Decimal("8")
            daily_ot_multiplier = Decimal("1.5")
            double_time_threshold = Decimal("12")
        elif state == "AK":
            daily_ot_threshold = Decimal("8")
            daily_ot_multiplier = Decimal("1.5")

        return {
            "name": "US FLSA ({})".format(state if state else "Federal"),
            "country": "US",
            "state": state,
            "overtime_threshold": Decimal("40"),
            "overtime_multiplier": Decimal("1.5"),
            "daily_ot_threshold": daily_ot_threshold,
            "daily_ot_multiplier": daily_ot_multiplier,
            "double_time_threshold": double_time_threshold,
            "double_time_multiplier": Decimal("2.0"),
            "exempt_salary_threshold_weekly": FLSA_EXEMPT_SALARY_THRESHOLD_WEEKLY,
            "minimum_wage": Decimal(str(min_wage)),
            "break_law": break_law,
            "wtr": None,
            "tax_bands": None,
            "ni": None,
        }

    elif country == "UK":
        return {
            "name": "UK WTR / PAYE",
            "country": "UK",
            "state": None,
            "overtime_threshold": Decimal("37.5"),
            "overtime_multiplier": Decimal("1.0"),
            "daily_ot_threshold": None,
            "daily_ot_multiplier": None,
            "double_time_threshold": None,
            "double_time_multiplier": None,
            "exempt_salary_threshold_weekly": None,
            "minimum_wage": None,
            "minimum_wage_by_age": UK_NMW_RATES,
            "wtr": UK_WTR,
            "tax_bands": UK_TAX_BANDS,
            "ni": UK_NI,
            "ni_categories": UK_NI_CATEGORIES,
            "break_law": {
                "break_threshold_hours": UK_WTR["break_threshold_hours"],
                "break_minutes": UK_WTR["break_minutes"],
                "rest_between_shifts_hours": UK_WTR["min_rest_between_shifts_hours"],
                "meal_break_minutes": None,
                "meal_break_threshold_hours": None,
                "rest_break_minutes": 20,
                "rest_break_per_hours": 6,
                "paid_rest_breaks": False,
            },
        }

    return {
        "name": "Default",
        "country": country,
        "state": state,
        "overtime_threshold": Decimal("40"),
        "overtime_multiplier": Decimal("1.5"),
        "daily_ot_threshold": None,
        "daily_ot_multiplier": None,
        "double_time_threshold": None,
        "double_time_multiplier": None,
        "minimum_wage": Decimal("7.25"),
        "break_law": US_STATE_BREAK_LAWS["DEFAULT"],
        "wtr": None,
        "tax_bands": None,
        "ni": None,
    }


# ---------------------------------------------------------------------------
# UK PAYE Calculations
# ---------------------------------------------------------------------------

def calculate_uk_income_tax_annual(gross_annual):
    """UK income tax on gross annual salary (GBP)."""
    gross = Decimal(str(gross_annual))
    tax = Decimal("0")
    for band in UK_TAX_BANDS:
        low = Decimal(str(band["from"]))
        high = Decimal(str(band["to"])) if band["to"] is not None else gross
        rate = Decimal(str(band["rate"]))
        if gross <= low:
            break
        taxable = min(gross, high) - low
        if taxable > 0:
            tax += taxable * rate
    effective = (tax / gross * 100).quantize(Decimal("0.01")) if gross > 0 else Decimal("0")
    return {
        "gross_annual": float(gross),
        "income_tax_annual": float(tax.quantize(Decimal("0.01"))),
        "effective_rate_pct": float(effective),
    }


def calculate_uk_ni_annual(gross_annual, ni_category="A"):
    """UK NI contributions (employee + employer) for gross annual (GBP)."""
    gross = Decimal(str(gross_annual))
    ni = UK_NI
    pt  = Decimal(str(ni["primary_threshold_annual"]))
    uel = Decimal(str(ni["upper_earnings_limit_annual"]))
    st  = Decimal(str(ni["secondary_threshold_annual"]))
    employee_ni = Decimal("0")
    if ni_category == "C":
        employee_ni = Decimal("0")
    elif ni_category == "B":
        if gross > pt:
            employee_ni += max(Decimal("0"), min(gross, uel) - pt) * Decimal("0.0585")
        if gross > uel:
            employee_ni += (gross - uel) * ni["employee_rate_upper"]
    else:
        if gross > pt:
            employee_ni += max(Decimal("0"), min(gross, uel) - pt) * ni["employee_rate_lower"]
        if gross > uel:
            employee_ni += (gross - uel) * ni["employee_rate_upper"]
    employer_ni = Decimal("0")
    if gross > st:
        employer_ni = (gross - st) * ni["employer_rate"]
    return {
        "gross_annual": float(gross),
        "employee_ni_annual": float(employee_ni.quantize(Decimal("0.01"))),
        "employer_ni_annual": float(employer_ni.quantize(Decimal("0.01"))),
        "ni_category": ni_category,
    }


# ---------------------------------------------------------------------------
# UK Holiday Accrual (WTR Reg 13 + 13A)
# ---------------------------------------------------------------------------

def calculate_uk_holiday_accrual(hours_worked, existing_reg13=Decimal("0"), existing_reg13a=Decimal("0")):
    """Accrue 12.07% of hours worked, split into Reg 13 (4wk) and Reg 13A (1.6wk) pots."""
    hours = Decimal(str(hours_worked))
    total_accrued = hours * UK_WTR["holiday_accrual_rate"]
    reg13_accrued  = (total_accrued * Decimal("4")   / Decimal("5.6")).quantize(Decimal("0.01"))
    reg13a_accrued = (total_accrued * Decimal("1.6") / Decimal("5.6")).quantize(Decimal("0.01"))
    return {
        "reg13_hours":  float((Decimal(str(existing_reg13))  + reg13_accrued).quantize(Decimal("0.01"))),
        "reg13a_hours": float((Decimal(str(existing_reg13a)) + reg13a_accrued).quantize(Decimal("0.01"))),
        "accrued_this_period_hours": float(total_accrued.quantize(Decimal("0.01"))),
    }


# ---------------------------------------------------------------------------
# UK NMW Age Band Lookup
# ---------------------------------------------------------------------------

def get_uk_nmw_for_age(age):
    if age is None or age >= 21:
        return UK_NMW_RATES["21+"]
    elif age >= 18:
        return UK_NMW_RATES["18-20"]
    return UK_NMW_RATES["16-17"]


# ---------------------------------------------------------------------------
# Wage Floor Check
# ---------------------------------------------------------------------------

def check_wage_floor(hourly_rate, region, age=None):
    """Returns is_compliant, floor, shortfall for the employee\'s region."""
    rate    = Decimal(str(hourly_rate))
    country = (region.get("country") or "US").upper()
    state   = (region.get("state") or "").upper()
    if country == "UK":
        floor = Decimal(str(get_uk_nmw_for_age(age)))
    else:
        floor = Decimal(str(US_STATE_MINIMUM_WAGES.get(state, US_FEDERAL_MINIMUM_WAGE)))
    shortfall = max(Decimal("0"), floor - rate)
    return {
        "is_compliant": rate >= floor,
        "minimum_wage_floor": float(floor),
        "employee_rate": float(rate),
        "shortfall_per_hour": float(shortfall),
        "country": country,
        "age": age,
    }


# ---------------------------------------------------------------------------
# UK 48-Hour Rolling Average (WTR)
# ---------------------------------------------------------------------------

def calculate_uk_48hr_average(weekly_hours_list):
    """17-week rolling average; returns average, compliance, headroom."""
    window = list(weekly_hours_list[-UK_WTR["reference_period_weeks"]:])
    if not window:
        return {"average_hours": 0.0, "is_compliant": True, "weeks_in_window": 0, "limit": 48}
    avg   = sum(window) / len(window)
    limit = UK_WTR["max_weekly_hours"]
    return {
        "average_hours":  round(avg, 2),
        "is_compliant":   avg <= limit,
        "weeks_in_window": len(window),
        "limit":          limit,
        "headroom_hours": round(max(0, limit - avg), 2),
    }
