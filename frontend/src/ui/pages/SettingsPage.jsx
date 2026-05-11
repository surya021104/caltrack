import { useState, useRef, useCallback, useEffect, lazy, Suspense } from "react"
import { useLocation, NavLink } from "react-router-dom"
import { routes } from "../routes.js"
import { useAuth } from "../../state/auth/useAuth.js"
import {
  Building2, Palette, CreditCard, Users2, History, ScrollText,
  Clock, CalendarDays, Banknote, FileText, ShieldCheck, BarChart3,
  Bell, Workflow, Search, Globe, Image as ImageIcon, Settings,
  Sun, Moon, Monitor, RefreshCcw, Zap, Shield, Crown, Check, Minus,
  Star, ArrowRight, Plus, ChevronDown, Lock, Activity, Info,
  Save, X, CheckCircle2, AlertTriangle, Upload, Eye, EyeOff,
  Smartphone, Mail, MessageSquare, LogOut, Key, Wifi, Clock3,
  Edit3, MapPin, DollarSign, Calendar, TrendingUp, User,
  ChevronRight, Home, Plug, Layers, Cpu, MessageCircle,
  Database, Command, Link, Share2, SlidersHorizontal, CalendarRange,
  Copy, Download, Box, Terminal, Layout, FileJson, Link2, Briefcase, Timer
} from "lucide-react"

const ProfileSection = lazy(() => import("./settings/ProfileSection.jsx"))
const AISettingsSection = lazy(() => import("./settings/AISettingsSection.jsx"))

/* ── Helpers ─────────────────────────────────────────────────── */
function Toast({ message, type = "success", onDismiss }) {
  useEffect(() => { const t = setTimeout(onDismiss, 3500); return () => clearTimeout(t) }, [onDismiss])
  return (
    <div className="stToast" data-type={type}>
      {type === "success" ? <CheckCircle2 size={15} /> : <AlertTriangle size={15} />}
      <span>{message}</span>
      <button onClick={onDismiss} className="stToastClose"><X size={13} /></button>
    </div>
  )
}

function SaveBar({ dirty, onSave, onDiscard, saving }) {
  if (!dirty) return null
  return (
    <div className="stSaveBar">
      <div className="stSaveBarLeft"><span className="stSaveBarDot" />Unsaved changes</div>
      <div style={{ display: "flex", gap: 8 }}>
        <button className="btn btnGhost" style={{ color: "rgba(255,255,255,0.7)", fontSize: 12 }} onClick={onDiscard}>Discard</button>
        <button className="stSaveBtn" onClick={onSave} disabled={saving}>
          {saving ? <RefreshCcw size={13} style={{ animation: "stSpin .7s linear infinite" }} /> : <Save size={13} />}
          {saving ? "Saving..." : "Save changes"}
        </button>
      </div>
    </div>
  )
}

function ToggleSwitch({ checked, onChange, accent = "#1A56DB" }) {
  return (
    <div className={`stToggle ${checked ? "on" : ""}`} onClick={() => onChange(!checked)} style={{ "--acc": accent }}>
      <div className="stToggleKnob" />
    </div>
  )
}

function SectionHeader({ title, subtitle }) {
  return (
    <div style={{ marginBottom: 32 }}>
      <h3 style={{ fontSize: 24, fontWeight: 800, color: "#0f172a", marginBottom: 8 }}>{title}</h3>
      <p style={{ fontSize: 14, color: "#64748b", margin: 0, lineHeight: 1.5 }}>{subtitle}</p>
    </div>
  )
}

/* ── Main Page ───────────────────────────────────────────────── */
const TABS = [
  {
    id: "general", label: "General",
    subs: [
      { id: "profile", label: "My Profile", subtitle: "Update your personal information visible across the system.", icon: <User size={14} /> },
      { id: "preferences", label: "Preferences", subtitle: "Manage your theme, language, and interface settings.", icon: <SlidersHorizontal size={14} /> },
      { id: "branding", label: "Branding", subtitle: "Upload your logo and define your organization's brand identity.", icon: <Palette size={14} />, adminOnly: true },
      { id: "organization", label: "Organization", subtitle: "Manage organization details, address, and legal info.", icon: <Building2 size={14} />, adminOnly: true },
    ]
  },
  {
    id: "ai", label: "AI & Automation", adminOnly: true,
    subs: [
      { id: "ai-automation", label: "AI & Automation", subtitle: "Configure AI models and automated workflow assistants.", icon: <Zap size={14} /> },
    ]
  },
  {
    id: "workforce", label: "Workforce",
    subs: [
      { id: "people", label: "People", subtitle: "Manage employee directories, teams, and departments.", icon: <Users2 size={14} />, adminOnly: true },
      { id: "time-tracking", label: "Time Tracking", subtitle: "Define clock-in methods and time capture rules.", icon: <Clock size={14} /> },
      { id: "attendance", label: "Attendance Policies", subtitle: "Define rules for late marks, grace periods, and overtime.", icon: <SlidersHorizontal size={14} /> },
      { id: "schedules", label: "Work Schedules", subtitle: "Define standard work days and hours for your organization.", icon: <Sun size={14} /> },
      { id: "shift-planner", label: "Shift Planning", subtitle: "Manage complex shift patterns and rotations.", icon: <CalendarRange size={14} />, adminOnly: true },
      { id: "holidays", label: "Time Off & Holidays", subtitle: "Configure leave types and holiday calendars.", icon: <Briefcase size={14} /> },
    ]
  },
  {
    id: "financials", label: "Financials", adminOnly: true,
    subs: [
      { id: "payroll", label: "Payroll", subtitle: "Configure payroll frequency, tax settings, and payout dates.", icon: <Banknote size={14} /> },
      { id: "expenses", label: "Expenses", subtitle: "Manage expense categories and reimbursement limits.", icon: <CreditCard size={14} /> },
    ]
  },
  {
    id: "operations", label: "Operations",
    subs: [
      { id: "workflows", label: "Approval Workflows", subtitle: "Design multi-level approval chains for leaves and expenses.", icon: <Workflow size={14} />, adminOnly: true },
      { id: "productivity", label: "Productivity", subtitle: "Analyze workforce output and efficiency metrics.", icon: <Timer size={14} />, adminOnly: true },
      { id: "reports", label: "Reports & Analytics", subtitle: "Configure scheduled reports and dashboard views.", icon: <BarChart3 size={14} />, adminOnly: true },
      { id: "notifications", label: "Notifications", subtitle: "Manage delivery channels and notification triggers.", icon: <Bell size={14} /> },
    ]
  },
  {
    id: "system", label: "System & Security",
    subs: [
      { id: "security", label: "Security", subtitle: "Manage session safety, 2FA, and login restrictions.", icon: <Shield size={14} /> },
      { id: "rbac", label: "Permissions / RBAC", subtitle: "Define user roles and granular access permissions.", icon: <ShieldCheck size={14} />, adminOnly: true },
      { id: "audit", label: "Audit Log", subtitle: "Track system changes and administrative activities.", icon: <ScrollText size={14} />, adminOnly: true },
      { id: "devices", label: "Devices", subtitle: "Manage authorized devices and mobile app access.", icon: <Smartphone size={14} />, adminOnly: true },
      { id: "location", label: "Location Tracking", subtitle: "Configure geofencing and GPS tracking accuracy.", icon: <MapPin size={14} />, adminOnly: true },
    ]
  },
  {
    id: "enterprise", label: "Enterprise",
    subs: [
      { id: "integrations", label: "App Integrations", subtitle: "Connect Caltrack with your favorite tools and APIs.", icon: <Plug size={14} /> },
      { id: "developer", label: "Developer / API", subtitle: "Manage API keys and webhook endpoints for custom integrations.", icon: <Terminal size={14} />, adminOnly: true },
      { id: "billing", label: "Billing & Plans", subtitle: "Manage your subscription, invoices, and usage limits.", icon: <CreditCard size={14} />, adminOnly: true },
      { id: "data", label: "Data & Backups", subtitle: "Export organization data and manage retention policies.", icon: <Database size={14} />, adminOnly: true },
    ]
  },
]


export function SettingsPage({ section: sectionProp }) {
  const { user } = useAuth()
  const isAdmin = user?.role === "admin"
  const location = useLocation()
  const [activeSection, setActiveSection] = useState("profile")
  const [activeTab, setActiveTab] = useState("general")
  const [dirty, setDirty] = useState(false)
  const [saving, setSaving] = useState(false)
  const [toast, setToast] = useState(null)

  const filteredTabs = TABS.filter(t => !t.adminOnly || isAdmin).map(t => ({
    ...t,
    subs: t.subs.filter(s => !s.adminOnly || isAdmin)
  })).filter(t => t.subs.length > 0)

  const markDirty = useCallback(() => setDirty(true), [])
  const showToast = useCallback((msg, type = "success") => setToast({ msg, type, id: Date.now() }), [])

  useEffect(() => {
    const section = sectionProp || new URLSearchParams(location.search).get("section")
    if (!section) return
    const tab = filteredTabs.find((t) => t.subs.some((s) => s.id === section)) || filteredTabs[0]
    setActiveTab(tab.id)
    setActiveSection(tab.subs.some((s) => s.id === section) ? section : tab.subs[0].id)
  }, [location.search, sectionProp, isAdmin])

  const handleSave = async () => {
    setSaving(true); await new Promise(r => setTimeout(r, 800)); setSaving(false); setDirty(false)
    showToast("Changes saved successfully!")
  }
  const handleDiscard = () => { setDirty(false); showToast("Changes discarded.", "warn") }

  const navigate = (tabId, secId) => { setActiveTab(tabId); setActiveSection(secId); }

  /* left card items for current tab */
  const currentTab = filteredTabs.find(t => t.subs.some(s => s.id === activeSection)) || filteredTabs[0]
  const currentSubs = currentTab.subs

  /* Find active sub for title */
  const activeSub = currentTab.subs.find(s => s.id === activeSection) || currentTab.subs[0]

  return (
    <div className="stPage" style={{ padding: "40px 60px", width: "100%", background: "#f8fafc", minHeight: "100vh" }}>
      <div style={{ maxWidth: 1400, margin: 0 }}>
        {/* ── Page Header ── */}
        <div style={{ marginBottom: 48, textAlign: "left" }}>
          <h1 className="stPageTitle" style={{ fontSize: 42, fontWeight: 900, color: "#0f172a", marginBottom: 16, borderBottom: "none" }}>
            {activeSub.label}
          </h1>
          
          {/* Internal Tabs (Aligned Left) */}
          <div style={{ display: "flex", gap: 40, borderBottom: "1px solid #e2e8f0", marginBottom: 24 }}>
            <button style={{
              padding: "0 0 16px 0",
              fontSize: 16,
              fontWeight: 800,
              color: "#f97316",
              borderTop: 0,
              borderLeft: 0,
              borderRight: 0,
              borderBottom: "3px solid #f97316",
              background: "none",
              cursor: "pointer"
            }}>
              {activeSub.label}
            </button>
            <button style={{
              padding: "0 0 16px 0",
              fontSize: 16,
              fontWeight: 700,
              color: "#94a3b8",
              background: "none",
              border: 0,
              cursor: "pointer"
            }}>
              Management
            </button>
          </div>

          <p style={{ fontSize: 16, color: "#64748b", margin: 0, lineHeight: 1.7, maxWidth: 900 }}>
            {activeSub.subtitle}
          </p>
        </div>

        {/* ── Body ── */}
        <main className="stMain" style={{ marginTop: 32, paddingBottom: 100 }}>
          <Suspense fallback={<div className="p-20 text-center text-slate-400">Loading section...</div>}>
            {/* General */}
            {activeSection === "profile" && <ProfileSection markDirty={markDirty} showToast={showToast} Field={Field} SectionHeader={SectionHeader} />}
            {activeSection === "preferences" && <PreferencesSection markDirty={markDirty} showToast={showToast} />}
            {activeSection === "branding" && <LogoSection markDirty={markDirty} />}
            {activeSection === "organization" && <CompanySettingsSection markDirty={markDirty} showToast={showToast} />}

            {/* AI */}
            {activeSection === "ai-automation" && <AISettingsSection markDirty={markDirty} showToast={showToast} SectionHeader={SectionHeader} ToggleSwitch={ToggleSwitch} />}

            {/* Workforce */}
            {activeSection === "people" && <ProfileRequirementsSection markDirty={markDirty} />}
            {activeSection === "time-tracking" && <ClockInMethodsSection markDirty={markDirty} />}
            {activeSection === "attendance" && <AttendancePolicySection markDirty={markDirty} showToast={showToast} />}
            {activeSection === "schedules" && <FlexibleHoursSection markDirty={markDirty} />}
            {activeSection === "shift-planner" && <ShiftPlanningSection markDirty={markDirty} />}
            {activeSection === "holidays" && <PublicHolidaysSection markDirty={markDirty} />}

            {/* Financials */}
            {activeSection === "payroll" && <PayCycleSection markDirty={markDirty} />}
            {activeSection === "expenses" && <ExpensesSection markDirty={markDirty} showToast={showToast} />}

            {/* Operations */}
            {activeSection === "workflows" && <WorkflowSection markDirty={markDirty} showToast={showToast} />}
            {activeSection === "productivity" && <ProductivitySection markDirty={markDirty} />}
            {activeSection === "reports" && <ReportsSection showToast={showToast} />}
            {activeSection === "notifications" && <DeliveryChannelsSection markDirty={markDirty} />}

            {/* System */}
            {activeSection === "security" && <SecuritySection markDirty={markDirty} showToast={showToast} />}
            {activeSection === "rbac" && <RolesPermissionsSection markDirty={markDirty} />}
            {activeSection === "audit" && <ActivitySection />}
            {activeSection === "devices" && <DevicesSection markDirty={markDirty} showToast={showToast} />}
            {activeSection === "location" && <GeofencingSection markDirty={markDirty} />}

            {/* Enterprise */}
            {activeSection === "integrations" && <IntegrationsSection showToast={showToast} />}
            {activeSection === "developer" && <DeveloperSection showToast={showToast} />}
            {activeSection === "billing" && <PlanSection />}
            {activeSection === "data" && <DataBackupsSection showToast={showToast} />}
          </Suspense>
        </main>

        <SaveBar dirty={dirty} onSave={handleSave} onDiscard={handleDiscard} saving={saving} />
      </div>
      {toast && <Toast key={toast.id} message={toast.msg} type={toast.type} onDismiss={() => setToast(null)} />}
    </div>
  )
}

/* ── Field Helper ─────────────────────────────────────────────── */
function Field({ label, children, half }) {
  return (
    <div className={`stField ${half ? "half" : ""}`}>
      <label className="stLabel">{label}</label>
      {children}
    </div>
  )
}

function ComingSoon({ label }) {
  return (
    <div className="stComingSoon">
      <Settings size={40} opacity={0.12} />
      <h3>{label}</h3>
      <p>Configuration for this section will be available soon.</p>
    </div>
  )
}




/* ═══ COMPANY SETTINGS ═══════════════════════════════════════════════ */
function CompanySettingsSection({ markDirty, showToast }) {
  const [loading, setLoading] = useState(true)
  const [company, setCompany] = useState({
    company_name: "",
    primary_country: "US",
    default_state: "",
    compliance_mode: "strict"
  })

  useEffect(() => {
    fetch("/api/company/me", {
      headers: { "Authorization": `Bearer ${localStorage.getItem("token")}` }
    })
      .then(res => res.json())
      .then(data => {
        if (!data.error) setCompany(data)
        setLoading(false)
      })
      .catch(() => setLoading(false))
  }, [])

  const handleChange = (field, value) => {
    setCompany(prev => ({ ...prev, [field]: value }))
    markDirty()
  }

  const handleSave = async () => {
    try {
      const res = await fetch("/api/company/update", {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${localStorage.getItem("token")}`
        },
        body: JSON.stringify(company)
      })
      const data = await res.json()
      if (res.ok) {
        showToast("Company settings updated!")
      } else {
        showToast(data.default_state || "Failed to update settings", "error")
      }
    } catch (e) {
      showToast("Network error", "error")
    }
  }

  if (loading) return <div className="stPanel"><p>Loading...</p></div>

  return (
    <div className="stPanel">
      <div className="stCard" style={{ width: "100%" }}>
        <h4 style={{ margin: "0 0 24px 0", fontSize: 12, fontWeight: 800, color: "#475569", letterSpacing: "0.05em", background: "#f8fafc", padding: "10px 16px", borderRadius: 6, display: "inline-block" }}>
          ORGANIZATION DETAILS
        </h4>
        <div className="stFormGrid">
          <Field label="Company Name" half>
            <input
              className="stInput"
              value={company.company_name}
              onChange={e => handleChange("company_name", e.target.value)}
              placeholder="Enter company name"
            />
          </Field>

          <Field label="Organization ID (Read-only)" half>
            <input
              className="stInput"
              value={company.display_id || "Generating..."}
              readOnly
              style={{ background: "rgba(243, 244, 246, 0.5)", cursor: "not-allowed", borderStyle: "dashed" }}
            />
          </Field>

          <Field label="Primary Country" half>
            <select
              className="stInput stSelect"
              value={company.primary_country}
              onChange={e => handleChange("primary_country", e.target.value)}
            >
              <option value="US">United States (US)</option>
              <option value="UK">United Kingdom (UK)</option>
            </select>
          </Field>

          {company.primary_country === "US" && (
            <Field label="Default State (US Only)" half>
              <input
                className="stInput"
                value={company.default_state}
                onChange={e => handleChange("default_state", e.target.value)}
                placeholder="e.g. Florida"
              />
            </Field>
          )}

          <Field label="Compliance Mode" half={company.primary_country !== "US"}>
            <select
              className="stInput stSelect"
              value={company.compliance_mode}
              onChange={e => handleChange("compliance_mode", e.target.value)}
            >
              <option value="strict">Strict (Requested)</option>
              <option value="flexible">Flexible</option>
            </select>
          </Field>
        </div>

        <div className="stCardActions" style={{ justifyContent: "flex-start" }}>
          <button className="stPrimaryBtn" onClick={handleSave}>
            <Save size={14} /> Save Settings
          </button>
        </div>
      </div>

      <div className="stInfoBox" style={{ marginTop: 24, background: "rgba(26, 86, 219, 0.05)", border: "1px solid rgba(26, 86, 219, 0.1)", padding: 16, borderRadius: 12 }}>
        <div style={{ display: "flex", gap: 12 }}>
          <Shield size={20} color="#1A56DB" style={{ marginTop: 2 }} />
          <div>
            <div style={{ fontSize: 14, fontWeight: 700, color: "#1A56DB", marginBottom: 4 }}>Regional Compliance Active</div>
            <p style={{ fontSize: 12, color: "#6B7280", margin: 0, lineHeight: 1.5 }}>
              Your system is currently following <strong>{company.primary_country === "US" ? "US FLSA" : "UK WTR"}</strong> regulations.
              All payroll and overtime calculations are dynamically adjusted based on this region.
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}




/* ═══ ATTENDANCE POLICIES ════════════════════════════════════════════ */
function AttendancePolicySection({ markDirty, showToast }) {
  return (
    <div className="stPanel">


      <div className="stCard">
        <h4 style={{ margin: "0 0 24px 0", fontSize: 12, fontWeight: 800, color: "#475569", letterSpacing: "0.05em", background: "#f8fafc", padding: "10px 16px", borderRadius: 6, display: "inline-block" }}>
          THRESHOLDS & LIMITS
        </h4>
        <div className="stFormGrid">
          <Field label="Late Mark Threshold (Minutes)" half>
            <input type="number" className="stInput" defaultValue={15} onChange={markDirty} />
          </Field>
          <Field label="Grace Period (Minutes)" half>
            <input type="number" className="stInput" defaultValue={5} onChange={markDirty} />
          </Field>
          <Field label="Auto Clock-out after Idle" half>
            <select className="stInput stSelect" onChange={markDirty}>
              <option>Disabled</option>
              <option>1 Hour</option>
              <option>2 Hours</option>
              <option>4 Hours</option>
            </select>
          </Field>
          <Field label="Weekend Policy" half>
            <select className="stInput stSelect" onChange={markDirty}>
              <option>Standard (Sat/Sun off)</option>
              <option>Flexible (2 days off)</option>
              <option>Custom (Fixed days)</option>
            </select>
          </Field>
        </div>
      </div>

      <div className="stCard">
        <div className="stToggleRow">
          <div>
            <div className="stToggleLabel">Require Note on Late Arrival</div>
            <div className="stToggleDesc">Employees must provide a reason if they clock in after the threshold.</div>
          </div>
          <ToggleSwitch checked={true} onChange={markDirty} />
        </div>
        <div style={{ marginTop: 24 }}>
          <div style={{ padding: 12, borderRadius: 8, background: "var(--surface2)", border: "1px solid var(--stroke)" }}>
            <p style={{ margin: 0, fontSize: 13, color: "var(--muted)", lineHeight: 1.5 }}>
              Need a custom data retention policy? Our legal team can help you configure data residency and long-term storage solutions.
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}

/* ═══ PREFERENCES ══════════════════════════════════════════════ */
function PreferencesSection({ markDirty, showToast }) {
  return (
    <div className="stPanel">
      <div className="stCard">
        <h4 style={{ margin: "0 0 24px 0", fontSize: 12, fontWeight: 800, color: "#475569", letterSpacing: "0.05em", background: "#f8fafc", padding: "10px 16px", borderRadius: 6, display: "inline-block" }}>
          APPEARANCE & LANGUAGE
        </h4>
        <div className="stFormGrid">
          <div className="stField">
            <div className="stLabel">Theme</div>
            <select className="stInput" defaultValue="system" onChange={markDirty}>
              <option value="light">Light</option>
              <option value="dark">Dark</option>
              <option value="system">System Default</option>
            </select>
          </div>
          <div className="stField">
            <div className="stLabel">Language</div>
            <select className="stInput" defaultValue="en" onChange={markDirty}>
              <option value="en">English (US)</option>
              <option value="es">Español</option>
              <option value="fr">Français</option>
              <option value="de">Deutsch</option>
            </select>
          </div>
        </div>

        <div className="stToggleRow" style={{ marginTop: 24 }}>
          <div>
            <div className="stToggleLabel">Compact Mode</div>
            <div className="stToggleDesc">Density optimization for small screens.</div>
          </div>
          <ToggleSwitch checked={false} onChange={markDirty} />
        </div>
      </div>

      <div className="stCard">
        <h4 style={{ margin: "0 0 24px 0", fontSize: 12, fontWeight: 800, color: "#475569", letterSpacing: "0.05em", background: "#f8fafc", padding: "10px 16px", borderRadius: 6, display: "inline-block" }}>
          DATE & TIME FORMATS
        </h4>
        <div className="stFormGrid">
          <div className="stField">
            <div className="stLabel">Date Format</div>
            <select className="stInput" defaultValue="DMY" onChange={markDirty}>
              <option value="DMY">DD/MM/YYYY</option>
              <option value="MDY">MM/DD/YYYY</option>
              <option value="YMD">YYYY-MM-DD</option>
            </select>
          </div>
          <div className="stField">
            <div className="stLabel">Time Format</div>
            <select className="stInput" defaultValue="24" onChange={markDirty}>
              <option value="24">24-hour</option>
              <option value="12">12-hour (AM/PM)</option>
            </select>
          </div>
        </div>
      </div>
    </div>
  )
}

/* ═══ APPROVAL WORKFLOWS ═════════════════════════════════════════════ */
function WorkflowSection({ markDirty, showToast }) {
  return (
    <div className="stPanel">
      <div className="stCard" style={{ width: "100%" }}>
        <h4 style={{ margin: "0 0 24px 0", fontSize: 12, fontWeight: 800, color: "#475569", letterSpacing: "0.05em", background: "#f8fafc", padding: "10px 16px", borderRadius: 6, display: "inline-block" }}>
          APPROVAL CHAINS
        </h4>
        <h4 style={{ margin: "0 0 16px 0", fontSize: 16, fontWeight: 900, textAlign: "left" }}>Leave Approval Chain</h4>
        <div style={{ display: "flex", flexDirection: "column", gap: 16, maxWidth: 600 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 16, padding: 16, background: "var(--surface2)", borderRadius: 12, border: "1px solid var(--stroke)" }}>
            <div style={{ width: 32, height: 32, borderRadius: "50%", background: "#1A56DB", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, fontWeight: 900 }}>1</div>
            <div style={{ flex: 1, fontSize: 14, fontWeight: 700 }}>Direct Manager</div>
            <Shield size={18} color="#94a3b8" />
          </div>
          <div style={{ display: "flex", justifyContent: "center", padding: "4px 0" }}><ArrowRight size={18} style={{ transform: "rotate(90deg)" }} color="#cbd5e1" /></div>
          <div style={{ display: "flex", alignItems: "center", gap: 16, padding: 16, background: "var(--surface2)", borderRadius: 12, border: "1px solid var(--stroke)" }}>
            <div style={{ width: 32, height: 32, borderRadius: "50%", background: "#F97316", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, fontWeight: 900 }}>2</div>
            <div style={{ flex: 1, fontSize: 14, fontWeight: 700 }}>HR Department</div>
            <Shield size={18} color="#94a3b8" />
          </div>
        </div>
        <div style={{ marginTop: 24, display: "flex", justifyContent: "flex-start" }}>
          <button className="stGhostBtn" style={{ padding: "12px 24px" }} onClick={() => showToast("Workflow Editor coming soon.", "info")}>
            <Plus size={16} /> Add Approval Step
          </button>
        </div>
      </div>

      <div className="stCard" style={{ width: "100%" }}>
        <div className="stToggleRow">
          <div style={{ textAlign: "left" }}>
            <div className="stToggleLabel">Auto-approve Overtime</div>
            <div className="stToggleDesc">Automatically approve OT if it falls within pre-set limits.</div>
          </div>
          <ToggleSwitch checked={false} onChange={markDirty} accent="#10B981" />
        </div>
      </div>
    </div>
  )
}

/* ═══ SECURITY ═══════════════════════════════════════════════════════ */
function SecuritySection({ markDirty, showToast }) {
  return (
    <div className="stPanel">
      <div className="stCard">
        <h4 style={{ margin: "0 0 24px 0", fontSize: 12, fontWeight: 800, color: "#475569", letterSpacing: "0.05em", background: "#f8fafc", padding: "10px 16px", borderRadius: 6, display: "inline-block" }}>
          SECURITY & ACCESS
        </h4>
        <div className="stToggleRow">
          <div>
            <div className="stToggleLabel">Enforce 2FA for Admins</div>
            <div className="stToggleDesc">Two-factor authentication is mandatory for all administrative accounts.</div>
          </div>
          <ToggleSwitch checked={true} onChange={markDirty} accent="#6366F1" />
        </div>

        <div className="stToggleRow">
          <div>
            <div className="stToggleLabel">Session IP Restriction</div>
            <div className="stToggleDesc">Restrict dashboard access to specific company IP ranges.</div>
          </div>
          <ToggleSwitch checked={false} onChange={markDirty} accent="#F43F5E" />
        </div>
      </div>

      <div className="stCard">
        <h4 style={{ margin: "0 0 12px 0", fontSize: 14, fontWeight: 800 }}>Session Management</h4>
        <p style={{ fontSize: 12, color: "var(--muted)", marginBottom: 16 }}>Force logout all active sessions for security maintenance.</p>
        <button className="stSecondaryBtn stDangerTxt" onClick={() => showToast("All sessions terminated.", "warn")}>
          <LogOut size={14} /> Terminate All Sessions
        </button>
      </div>
    </div>
  )
}

/* ═══ LOGO ═══════════════════════════════════════════════════════ */
function LogoSection({ markDirty }) {
  const [preview, setPreview] = useState(null)
  const [bg, setBg] = useState("light")
  const [drag, setDrag] = useState(false)
  const ref = useRef()
  const handleFile = useCallback(e => {
    const file = e.dataTransfer?.files[0] || e.target?.files[0]
    if (file?.type.startsWith("image/")) { setPreview(URL.createObjectURL(file)); markDirty() }
  }, [markDirty])
  return (
    <div className="stPanel">
      <div className="stCard">
        <h4 style={{ margin: "0 0 24px 0", fontSize: 12, fontWeight: 800, color: "#475569", letterSpacing: "0.05em", background: "#f8fafc", padding: "10px 16px", borderRadius: 6, display: "inline-block" }}>
          BRAND ASSETS
        </h4>
        <div className="stLogoGrid">
          <div>
            {/* Drop zone */}
            <div className={`stDropZone ${drag ? "drag" : ""} ${preview ? "has" : ""}`}
              style={{ background: bg === "dark" ? "#0B1629" : undefined }}
              onDragOver={e => { e.preventDefault(); setDrag(true) }} onDragLeave={() => setDrag(false)}
              onDrop={e => { e.preventDefault(); setDrag(false); handleFile(e) }}
              onClick={() => ref.current?.click()}>
              {preview
                ? <img src={preview} alt="logo" className="stDropPreview" />
                : <>
                  <div className="stDropIcon"><Upload size={28} /></div>
                  <div className="stDropText">Drag & drop your logo</div>
                  <div className="stDropSub">PNG, SVG or WebP · Transparent background preferred · Max 2MB</div>
                </>
              }
              <input ref={ref} type="file" accept="image/*" style={{ display: "none" }} onChange={handleFile} />
            </div>
            {/* bg toggle */}
            <div className="stBgToggle">
              <span style={{ fontSize: 11, color: "var(--muted)", fontWeight: 600 }}>Preview on:</span>
              {["light", "dark"].map(b => (
                <button key={b} className={`stBgBtn ${bg === b ? "on" : ""}`} onClick={() => setBg(b)}>
                  {b === "light" ? <Sun size={11} /> : <Moon size={11} />} {b}
                </button>
              ))}
            </div>
          </div>
          <div className="stLogoUsage">
            <div className="stLogoUsageLabel">Usage Preview</div>
            {/* navbar preview */}
            <div className="stNavbarPreview">
              <div style={{ background: "#0B1629", borderRadius: 8, padding: "8px 16px", display: "flex", alignItems: "center", gap: 10 }}>
                {preview
                  ? <img src={preview} style={{ height: 28, width: "auto", objectFit: "contain" }} alt="nav logo" />
                  : <div style={{ width: 80, height: 20, background: "rgba(255,255,255,0.15)", borderRadius: 4 }} />}
                <div style={{ flex: 1 }} />
                <div style={{ width: 24, height: 24, borderRadius: "50%", background: "linear-gradient(135deg,#1A56DB,#F97316)" }} />
              </div>
              <div style={{ fontSize: 10, color: "var(--muted)", marginTop: 6, textAlign: "center" }}>Navbar</div>
            </div>
            <div className="stNavbarPreview">
              <div style={{ background: "var(--surface2)", borderRadius: 8, padding: "16px", display: "flex", flexDirection: "column", alignItems: "center", gap: 8 }}>
                {preview
                  ? <img src={preview} style={{ height: 36, width: "auto", objectFit: "contain" }} alt="report logo" />
                  : <div style={{ width: 100, height: 24, background: "var(--stroke2)", borderRadius: 4 }} />}
                <div style={{ fontSize: 10, color: "var(--muted)" }}>Monthly Payroll Report — March 2026</div>
              </div>
              <div style={{ fontSize: 10, color: "var(--muted)", marginTop: 6, textAlign: "center" }}>Report Header</div>
            </div>
          </div>
        </div>
        <div className="stCardActions">
          <button className="stPrimaryBtn" onClick={() => ref.current?.click()}><Upload size={14} /> Upload Logo</button>
          {preview && <button className="stGhostBtn stDangerTxt" onClick={() => { setPreview(null); markDirty() }}><X size={13} /> Remove</button>}
        </div>
      </div>
    </div>
  )
}

/* ═══ LOCALIZATION ════════════════════════════════════════════════ */
function LocalizationSection({ markDirty }) {
  const [tz, setTz] = useState("Asia/Kolkata (IST)")
  const [fmt, setFmt] = useState("DD/MM/YYYY")
  const [fiscal, setFiscal] = useState("April")
  const [week, setWeek] = useState("Monday - Friday")
  const now = new Date()
  const liveDate = fmt === "DD/MM/YYYY"
    ? `${String(now.getDate()).padStart(2, "0")}/${String(now.getMonth() + 1).padStart(2, "0")}/${now.getFullYear()}`
    : fmt === "MM/DD/YYYY"
      ? `${String(now.getMonth() + 1).padStart(2, "0")}/${String(now.getDate()).padStart(2, "0")}/${now.getFullYear()}`
      : `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`
  return (
    <div className="stPanel">
      <div className="stCard">
        <h4 style={{ margin: "0 0 24px 0", fontSize: 12, fontWeight: 800, color: "#475569", letterSpacing: "0.05em", background: "#f8fafc", padding: "10px 16px", borderRadius: 6, display: "inline-block" }}>
          REGIONAL SETTINGS
        </h4>
        <div className="stFormGrid">
          <Field label="Enterprise Timezone" half>
            <select className="stInput stSelect" value={tz} onChange={e => { setTz(e.target.value); markDirty() }}>
              <option>Asia/Kolkata (IST)</option><option>America/New_York (EST)</option>
              <option>Europe/London (GMT)</option><option>Asia/Dubai (GST)</option>
            </select>
          </Field>
          <Field label="Display Date Format" half>
            <select className="stInput stSelect" value={fmt} onChange={e => { setFmt(e.target.value); markDirty() }}>
              <option>DD/MM/YYYY</option><option>MM/DD/YYYY</option><option>YYYY-MM-DD</option>
            </select>
          </Field>
          <Field label="Fiscal Year Start" half>
            <select className="stInput stSelect" value={fiscal} onChange={e => { setFiscal(e.target.value); markDirty() }}>
              <option>April</option><option>January</option><option>July</option><option>October</option>
            </select>
          </Field>
          <Field label="Standard Work Week" half>
            <select className="stInput stSelect" value={week} onChange={e => { setWeek(e.target.value); markDirty() }}>
              <option>Monday - Friday</option><option>Monday - Saturday</option><option>Sunday - Thursday</option>
            </select>
          </Field>
        </div>
        {/* Live preview */}
        <div className="stLocalePreview">
          <div className="stLocalePreviewTitle"><Eye size={12} /> Live Preview</div>
          <div className="stLocalePreviewRow">
            <div className="stLocaleChip"><Calendar size={12} /> Today: <strong>{liveDate}</strong></div>
            <div className="stLocaleChip"><MapPin size={12} /> Zone: <strong>{tz.split(" ")[0]}</strong></div>
            <div className="stLocaleChip"><DollarSign size={12} /> Fiscal from: <strong>{fiscal}</strong></div>
          </div>
        </div>
        <div className="stCardActions">
          <button className="stPrimaryBtn"><Save size={14} /> Save Localization</button>
        </div>
      </div>
    </div>
  )
}

/* ═══ OPERATIONAL PACE ════════════════════════════════════════════ */
function PaceSection({ markDirty }) {
  const [hrs, setHrs] = useState(8)
  const [strict, setStrict] = useState(true)
  const [weekend, setWeekend] = useState(false)
  const paceLabel = hrs <= 4 ? "🟢 Relaxed" : hrs <= 7 ? "🟡 Balanced" : hrs <= 9 ? "🔵 Standard" : "🔴 Strict"
  const paceDesc = hrs <= 4 ? "Flexible hours, minimal enforcement."
    : hrs <= 7 ? "Moderate tracking, balanced policy."
      : hrs <= 9 ? "Standard 8-hour workday enforcement with timesheet compliance."
        : "High-intensity mode — late marking, checkout verification, and strike policy active."
  return (
    <div className="stPanel">
      <div className="stCard">
        <h4 style={{ margin: "0 0 24px 0", fontSize: 12, fontWeight: 800, color: "#475569", letterSpacing: "0.05em", background: "#f8fafc", padding: "10px 16px", borderRadius: 6, display: "inline-block" }}>
          SYSTEM PACE
        </h4>
        <div className="stField" style={{ marginBottom: 24 }}>
          <label className="stLabel">STANDARD WORK DAY — <strong>{hrs} hrs</strong></label>
          <div className="stPaceScaleLabels"><span>Relaxed</span><span>Balanced</span><span>Standard</span><span>Strict</span></div>
          <input type="range" className="stPaceSlider" min="2" max="12" value={hrs}
            onChange={e => { setHrs(Number(e.target.value)); markDirty() }} />
          <div className="stPaceResult">
            <div className="stPaceResultLabel">{paceLabel}</div>
            <div className="stPaceResultDesc">{paceDesc}</div>
          </div>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 16, paddingTop: 8, borderTop: "1px solid var(--stroke)" }}>
          <div className="stToggleRow">
            <div>
              <div className="stToggleLabel">Strict Enforcement</div>
              <div className="stToggleDesc">Mark late arrivals and flag checkout violations with strike records</div>
            </div>
            <ToggleSwitch checked={strict} onChange={v => { setStrict(v); markDirty() }} accent="#1A56DB" />
          </div>
          <div className="stToggleRow">
            <div>
              <div className="stToggleLabel">Weekend Access</div>
              <div className="stToggleDesc">Allow timesheet entries on Saturday and Sunday</div>
            </div>
            <ToggleSwitch checked={weekend} onChange={v => { setWeekend(v); markDirty() }} accent="#059669" />
          </div>
        </div>
        <div className="stCardActions">
          <button className="stPrimaryBtn"><Save size={14} /> Save Pace Settings</button>
        </div>
      </div>
    </div>
  )
}

/* ═══ NOTIFICATIONS ══════════════════════════════════════════════ */
function NotificationsSection({ markDirty }) {
  const events = [
    { key: "clockin", label: "Clock In/Out", desc: "Time tracking events" },
    { key: "leave", label: "Leave Requests", desc: "Applications & approvals" },
    { key: "payroll", label: "Payroll Processed", desc: "Salary credits & payslips" },
    { key: "tasks", label: "Task Assignments", desc: "New tasks assigned to you" },
    { key: "security", label: "Login Alerts", desc: "New device or suspicious login" },
    { key: "reports", label: "Report Ready", desc: "Scheduled exports completed" },
  ]
  const [prefs, setPrefs] = useState(() =>
    Object.fromEntries(events.map(e => [e.key, { email: true, sms: false, app: true }]))
  )
  const toggle = (ev, ch) => { setPrefs(p => ({ ...p, [ev]: { ...p[ev], [ch]: !p[ev][ch] } })); markDirty() }
  return (
    <div className="stPanel">
      <div className="stCard" style={{ padding: 0 }}>
        <h4 style={{ margin: "24px 24px 24px 24px", fontSize: 12, fontWeight: 800, color: "#475569", letterSpacing: "0.05em", background: "#f8fafc", padding: "10px 16px", borderRadius: 6, display: "inline-block" }}>
          ALERT CHANNELS
        </h4>
        <div className="stNotifTable">
          <div className="stNotifHead">
            <div style={{ flex: 1 }}>Event</div>
            {[["email", <Mail size={13} />], ["sms", <MessageSquare size={13} />], ["app", <Bell size={13} />]].map(([ch, ic]) => (
              <div key={ch} className="stNotifCol">{ic} {ch.toUpperCase()}</div>
            ))}
          </div>
          {events.map(ev => (
            <div key={ev.key} className="stNotifRow">
              <div style={{ flex: 1 }}>
                <div className="stNotifEvLabel">{ev.label}</div>
                <div className="stNotifEvDesc">{ev.desc}</div>
              </div>
              {["email", "sms", "app"].map(ch => (
                <div key={ch} className="stNotifCol">
                  <div className={`stNotifCheck ${prefs[ev.key][ch] ? "on" : ""}`} onClick={() => toggle(ev.key, ch)}>
                    {prefs[ev.key][ch] && <Check size={10} strokeWidth={3} />}
                  </div>
                </div>
              ))}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

/* ═══ ACTIVITY LOG ═══════════════════════════════════════════════ */
function ActivitySection() {
  const [filter, setFilter] = useState("all")
  const logs = [
    { time: "Today, 12:09 PM", action: "Login", detail: "Chrome · Chennai, India", type: "auth" },
    { time: "Today, 11:45 AM", action: "Settings Changed", detail: "Updated Operational Pace → 9h", type: "settings" },
    { time: "Today, 10:30 AM", action: "Employee Added", detail: "Ravi Kumar onboarded", type: "hr" },
    { time: "Yesterday, 4:12 PM", action: "Payroll Run", detail: "March 2026 · 14 employees", type: "payroll" },
    { time: "Yesterday, 2:00 PM", action: "Leave Approved", detail: "Request #L-091 for Priya S.", type: "leave" },
    { time: "Mar 30, 3:00 PM", action: "Report Exported", detail: "Monthly attendance (PDF)", type: "report" },
  ]
  const colors = { auth: "#1A56DB", settings: "#7C3AED", hr: "#059669", payroll: "#F97316", leave: "#D97706", report: "#0891B2" }
  const filtered = filter === "all" ? logs : logs.filter(l => l.type === filter)
  return (
    <div className="stPanel">
      <div className="stLogFilters">
        {["all", "auth", "settings", "hr", "payroll", "leave", "report"].map(f => (
          <button key={f} className={`stLogChip ${filter === f ? "on" : ""}`} onClick={() => setFilter(f)}>
            {f === "all" ? "All Events" : f.charAt(0).toUpperCase() + f.slice(1)}
          </button>
        ))}
      </div>
      <div className="stTimeline">
        {filtered.map((log, i) => (
          <div key={i} className="stTimelineItem">
            <div className="stTimelineDot" style={{ background: colors[log.type] }} />
            <div className="stTimelineCard">
              <div className="stTimelineTop">
                <span className="stTimelineAction">{log.action}</span>
                <span className="stTimelineBadge" style={{ background: `${colors[log.type]}15`, color: colors[log.type] }}>{log.type}</span>
              </div>
              <div className="stTimelineDetail">{log.detail}</div>
              <div className="stTimelineMeta">{log.time}</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

/* ═══ USERS / ROLES ══════════════════════════════════════════════ */
function UsersSection({ showToast }) {
  const [role, setRole] = useState("admin")
  const roles = [{ id: "admin", label: "Admin" }, { id: "hr", label: "HR" }, { id: "finance", label: "Finance" }, { id: "employee", label: "Employee" }]
  const permsMap = {
    admin: ["View", "Create", "Edit", "Delete", "Export", "Admin"],
    hr: ["View", "Create", "Edit", "Export"],
    finance: ["View", "Create", "Export"],
    employee: ["View", "Create"]
  }
  const modules = ["Payroll", "Employees", "Timesheets", "Leave Management", "Reports", "Settings"]
  return (
    <div className="stPanel">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 24 }}>
        <div />
        <button className="stPrimaryBtn" onClick={() => showToast("Role creation coming soon.", "warn")}><Plus size={13} /> New Role</button>
      </div>
      <div className="stRolesLayout">
        <div className="stRolesList">
          {roles.map(r => (
            <button key={r.id} className={`stRoleItem ${role === r.id ? "on" : ""}`} onClick={() => setRole(r.id)}>
              <div className="stRoleItemDot" style={{ background: role === r.id ? "#1A56DB" : "var(--stroke2)" }} />
              {r.label}
            </button>
          ))}
        </div>
        <div className="stCard" style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
            <h3 style={{ margin: 0, fontSize: 18, fontWeight: 800, fontFamily: "var(--font-display)" }}>{role.charAt(0).toUpperCase() + role.slice(1)}</h3>
            <span style={{ fontSize: 11, fontWeight: 700, background: "#EFF0FE", color: "#1A56DB", padding: "4px 12px", borderRadius: 6, display: "flex", alignItems: "center", gap: 5 }}>
              <Lock size={11} /> System Role
            </span>
          </div>
          <table className="stPermTable">
            <thead>
              <tr>
                <th>Module</th>
                {["View", "Create", "Edit", "Delete", "Export", "Admin"].map(p => <th key={p}>{p}</th>)}
              </tr>
            </thead>
            <tbody>
              {modules.map(mod => (
                <tr key={mod}>
                  <td>{mod}</td>
                  {["View", "Create", "Edit", "Delete", "Export", "Admin"].map(p => (
                    <td key={p}>
                      {permsMap[role].includes(p)
                        ? <Check size={13} color="#1A56DB" strokeWidth={3} />
                        : <div style={{ width: 13, height: 2, borderRadius: 1, background: "var(--stroke2)" }} />}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}

/* ═══ PLAN ════════════════════════════════════════════════════════ */
function PlanSection() {
  return (
    <div className="stPanel">
      <div className="stPlanGrid">
        {[
          {
            name: "Trial", price: "₹0", sub: "28 days free", icon: <Zap size={18} />, color: "var(--fg2)",
            feat: ["Timesheet Entry", "Weekly Submission", "Dashboard Overview", "Holiday Calendar"],
            miss: ["Advanced Reports", "Payroll", "Leave Management"], current: true
          },
          {
            name: "Basic", price: "₹29", sub: "per user/month", icon: <Shield size={18} />, color: "#1A56DB",
            feat: ["Everything in Trial", "Unlimited Projects", "Timesheet History", "Weekly Reports", "Holiday Mgmt"],
            miss: ["Payroll Automation", "Leave Management"], badge: "RECOMMENDED"
          },
          {
            name: "Pro", price: "₹49", sub: "per user/month", icon: <Crown size={18} />, color: "#5d5fef",
            feat: ["Everything in Basic", "Full Payroll", "Leave Management", "Analytics", "SSO", "Priority Support"],
            miss: [], badge: "MOST POPULAR", pro: true
          },
        ].map(plan => (
          <div key={plan.name} className={`stPlanCard ${plan.pro ? "pro" : ""}`}>
            {plan.badge && <div className="stPlanBadge" style={{ background: plan.pro ? "#5d5fef" : "var(--fg)" }}>{plan.badge}</div>}
            {plan.current && <div className="stPlanBadge" style={{ background: "#059669", left: 16, right: "auto" }}>
              <Check size={10} strokeWidth={3} /> ACTIVE
            </div>}
            <div className="stPlanIcon" style={{ color: plan.color, background: `${plan.color}12` }}>{plan.icon}</div>
            <h3 className="stPlanName">{plan.name}</h3>
            <div className="stPlanPrice">{plan.price} <span>{plan.sub}</span></div>
            <div style={{ height: 1, background: "var(--stroke)", margin: "16px 0" }} />
            <div className="stPlanFeats">
              {plan.feat.map(f => <div key={f} className="stPlanFeat"><Check size={12} color="#059669" strokeWidth={3} />{f}</div>)}
              {plan.miss.map(f => <div key={f} className="stPlanFeat stPlanFeatOff"><Minus size={12} color="var(--muted)" />{f}</div>)}
            </div>
            <button className={`stPlanBtn ${plan.pro ? "pro" : plan.current ? "curr" : ""}`}>
              {plan.current ? "Current Plan" : `Upgrade to ${plan.name}`}
              {!plan.current && <ArrowRight size={13} />}
            </button>
          </div>
        ))}
      </div>
    </div>
  )
}

/* ═══ SECURITY — SESSIONS ════════════════════════════════════════ */
function SecuritySessionsSection({ showToast }) {
  const sessions = [
    { device: "Chrome on Windows", loc: "Chennai, India", time: "Active now", current: true },
    { device: "Safari on iPhone", loc: "Chennai, India", time: "2 hours ago" },
    { device: "Edge on Laptop", loc: "Bengaluru, India", time: "Yesterday, 3:42 PM" },
  ]
  return (
    <div className="stPanel">
      <div className="stCard">
        <h4 style={{ margin: "0 0 24px 0", fontSize: 12, fontWeight: 800, color: "#475569", letterSpacing: "0.05em", background: "#f8fafc", padding: "10px 16px", borderRadius: 6, display: "inline-block" }}>
          ACTIVE SESSIONS
        </h4>
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {sessions.map((s, i) => (
            <div key={i} className="stSessionRow">
              <div className="stSessionIcon"><Monitor size={15} /></div>
              <div style={{ flex: 1 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span style={{ fontSize: 13, fontWeight: 700, color: "var(--fg)" }}>{s.device}</span>
                  {s.current && <span className="stCurrentChip">Current</span>}
                </div>
                <div style={{ fontSize: 12, color: "var(--muted)" }}>{s.loc} · {s.time}</div>
              </div>
              {!s.current && <button className="stDangerBtn" onClick={() => showToast("Session revoked.")}>Revoke</button>}
            </div>
          ))}
        </div>
        <div style={{ marginTop: 20, paddingTop: 20, borderTop: "1px solid var(--stroke)" }}>
          <button className="stGhostBtn stDangerTxt" onClick={() => showToast("Logged out all other devices.")}>
            <LogOut size={13} /> Logout from all devices
          </button>
        </div>
      </div>
    </div>
  )
}

/* ═══ SECURITY — PASSWORD ════════════════════════════════════════ */
function SecurityPasswordSection({ showToast }) {
  const [pw, setPw] = useState("")
  const [show, setShow] = useState(false)
  const str = pw.length === 0 ? 0 : pw.length < 6 ? 1 : pw.length < 10 ? 2
    : /[A-Z]/.test(pw) && /\d/.test(pw) && /[^A-Za-z0-9]/.test(pw) ? 4 : 3
  const strLabel = ["", "Weak", "Fair", "Good", "Strong"][str]
  const strColor = ["", "#DC2626", "#F97316", "#1A56DB", "#059669"][str]
  return (
    <div className="stPanel">
      <div className="stCard" style={{ maxWidth: 480 }}>
        <h4 style={{ margin: "0 0 24px 0", fontSize: 12, fontWeight: 800, color: "#475569", letterSpacing: "0.05em", background: "#f8fafc", padding: "10px 16px", borderRadius: 6, display: "inline-block" }}>
          UPDATE PASSWORD
        </h4>
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <Field label="Current Password">
            <input className="stInput" type="password" placeholder="Enter current password" />
          </Field>
          <Field label="New Password">
            <div style={{ position: "relative" }}>
              <input className="stInput" type={show ? "text" : "password"} placeholder="Enter new password"
                value={pw} onChange={e => setPw(e.target.value)} style={{ paddingRight: 40 }} />
              <button onClick={() => setShow(v => !v)}
                style={{ position: "absolute", right: 12, top: "50%", transform: "translateY(-50%)", background: "none", border: "none", cursor: "pointer", color: "var(--muted)" }}>
                {show ? <EyeOff size={15} /> : <Eye size={15} />}
              </button>
            </div>
            {pw.length > 0 && (
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 6 }}>
                <div style={{ display: "flex", gap: 3, flex: 1 }}>
                  {[1, 2, 3, 4].map(i => (
                    <div key={i} style={{ height: 3, flex: 1, borderRadius: 2, background: i <= str ? strColor : "var(--stroke2)", transition: "background .3s" }} />
                  ))}
                </div>
                <span style={{ fontSize: 11, fontWeight: 700, color: strColor }}>{strLabel}</span>
              </div>
            )}
          </Field>
          <Field label="Confirm New Password">
            <input className="stInput" type="password" placeholder="Repeat new password" />
          </Field>
          <button className="stPrimaryBtn" style={{ alignSelf: "flex-start" }} onClick={() => showToast("Password updated!")}>
            <Key size={13} /> Update Password
          </button>
        </div>
      </div>
    </div>
  )
}

/* ═══ SECURITY — 2FA ═════════════════════════════════════════════ */
function Security2FASection({ markDirty, showToast }) {
  const [on, setOn] = useState(true)
  return (
    <div className="stPanel">

      <div className="stCard" style={{ maxWidth: 480 }}>
        <div className="stToggleRow" style={{ marginBottom: on ? 20 : 0 }}>
          <div>
            <div className="stToggleLabel">Enable 2FA</div>
            <div className="stToggleDesc">Require OTP verification on every new device login</div>
          </div>
          <ToggleSwitch checked={on} onChange={v => { setOn(v); markDirty(); showToast(`2FA ${v ? "enabled" : "disabled"}.${v ? "" : " Your account is now less secure."}`, v ? "success" : "warn") }} accent="#059669" />
        </div>
        {on && (
          <div style={{ background: "#ECFDF5", border: "1px solid rgba(5,150,105,0.2)", borderRadius: 10, padding: "12px 16px", display: "flex", alignItems: "center", gap: 10 }}>
            <CheckCircle2 size={16} color="#059669" />
            <span style={{ fontSize: 13, fontWeight: 600, color: "#059669" }}>Your account is protected with two-factor authentication.</span>
          </div>
        )}
      </div>
    </div>
  )
}

/* ═══ PEOPLE ══════════════════════════════════════════════════════ */
function OnboardingAutomationSection({ markDirty }) {
  return (
    <div className="stPanel">

      <div className="stCard">
        <div className="stToggleRow">
          <div>
            <div className="stToggleLabel">Auto-send Welcome Email</div>
            <div className="stToggleDesc">Send system login credentials immediately upon creation.</div>
          </div>
          <ToggleSwitch checked={true} onChange={markDirty} />
        </div>
        <div className="stToggleRow">
          <div>
            <div className="stToggleLabel">Auto-assign Onboarding Tasks</div>
            <div className="stToggleDesc">Assign standard 'Getting Started' tasks to new hires.</div>
          </div>
          <ToggleSwitch checked={true} onChange={markDirty} />
        </div>
        <Field label="Welcome Message Template">
          <textarea className="stInput stTextarea" defaultValue="Welcome to the team! We're excited to have you here." rows={4} onChange={markDirty} />
        </Field>
      </div>
    </div>
  )
}

function ProfileRequirementsSection({ markDirty }) {
  return (
    <div className="stPanel">

      <div className="stCard">
        <div className="stToggleRow">
          <div>
            <div className="stToggleLabel">Require Government ID</div>
            <div className="stToggleDesc">Employees must upload a valid ID before they can clock in.</div>
          </div>
          <ToggleSwitch checked={false} onChange={markDirty} accent="#F43F5E" />
        </div>
        <div className="stToggleRow">
          <div>
            <div className="stToggleLabel">Background Verification</div>
            <div className="stToggleDesc">Trigger background check workflow for new profiles.</div>
          </div>
          <ToggleSwitch checked={false} onChange={markDirty} accent="#F43F5E" />
        </div>
      </div>
    </div>
  )
}

function MandatoryFieldsSection({ markDirty }) {
  const fields = ["Full Name", "Work Email", "Phone Number", "Employee ID", "Department", "Position", "Date of Join"]
  return (
    <div className="stPanel">

      <div className="stCard">
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
          {fields.map(f => (
            <div key={f} style={{ display: "flex", alignItems: "center", gap: 12, padding: "8px 0" }}>
              <input type="checkbox" defaultChecked={true} onChange={markDirty} style={{ accentColor: "#1A56DB" }} />
              <span style={{ fontSize: 14, fontWeight: 500 }}>{f}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

function DefaultRoleAssignmentSection({ markDirty }) {
  return (
    <div className="stPanel">

      <div className="stCard">
        <Field label="Standard New Hire Role">
          <select className="stInput stSelect" defaultValue="employee" onChange={markDirty}>
            <option value="employee">Employee</option>
            <option value="manager">Manager</option>
            <option value="kiosk">Kiosk Only</option>
          </select>
        </Field>
        <p style={{ fontSize: 12, color: "var(--muted)", marginTop: 8 }}>
          Admins can always override this role during or after the creation process.
        </p>
      </div>
    </div>
  )
}

/* ═══ TIME TRACKING ═══════════════════════════════════════════════ */
function ClockInMethodsSection({ markDirty }) {
  const methods = [
    { id: "web", label: "Web Portal", icon: <Globe size={14} />, desc: "Clock in via browser dashboard" },
    { id: "mobile", label: "Mobile App", icon: <Smartphone size={14} />, desc: "Clock in via iOS/Android app" },
    { id: "kiosk", label: "Kiosk Mode", icon: <Monitor size={14} />, desc: "Shared tablet/terminal entry" },
    { id: "qr", label: "QR Code Scan", icon: <RefreshCcw size={14} />, desc: "Scan station code to clock in" },
    { id: "face", label: "Face Recognition", icon: <User size={14} />, desc: "Biometric verification at Kiosk" },
  ]
  return (
    <div className="stPanel">
      <div className="stCard" style={{ display: "grid", gap: 12 }}>
        <h4 style={{ margin: "0 0 24px 0", fontSize: 12, fontWeight: 800, color: "#475569", letterSpacing: "0.05em", background: "#f8fafc", padding: "10px 16px", borderRadius: 6, display: "inline-block" }}>
          ENABLED METHODS
        </h4>
        {methods.map(m => (
          <div key={m.id} className="stToggleRow">
            <div style={{ display: "flex", gap: 12 }}>
              <div style={{ padding: 8, background: "var(--surface2)", borderRadius: 8, color: "var(--fg)" }}>{m.icon}</div>
              <div>
                <div className="stToggleLabel">{m.label}</div>
                <div className="stToggleDesc">{m.desc}</div>
              </div>
            </div>
            <ToggleSwitch checked={true} onChange={markDirty} />
          </div>
        ))}
      </div>
    </div>
  )
}

function GeofencingSection({ markDirty }) {
  return (
    <div className="stPanel">

      <div className="stCard">
        <div className="stToggleRow">
          <div>
            <div className="stToggleLabel">Enable GPS Restriction</div>
            <div className="stToggleDesc">Compare user location with workplace coordinates.</div>
          </div>
          <ToggleSwitch checked={true} onChange={markDirty} accent="#6366F1" />
        </div>
        <div className="stToggleRow">
          <div>
            <div className="stToggleLabel">Block-on-Violation</div>
            <div className="stToggleDesc">Prevent clock-in if user is outside the geofence radius.</div>
          </div>
          <ToggleSwitch checked={true} onChange={markDirty} accent="#F43F5E" />
        </div>
        <Field label="Default Radius (meters)">
          <input className="stInput" type="number" defaultValue={200} onChange={markDirty} />
        </Field>
      </div>
    </div>
  )
}

function RoundingRulesSection({ markDirty }) {
  return (
    <div className="stPanel">

      <div className="stCard">
        <Field label="Rounding Increment">
          <select className="stInput stSelect" defaultValue="15" onChange={markDirty}>
            <option value="0">No Rounding</option>
            <option value="5">Nearest 5 minutes</option>
            <option value="15">Nearest 15 minutes</option>
            <option value="30">Nearest 30 minutes</option>
          </select>
        </Field>
        <div className="stToggleRow">
          <div>
            <div className="stToggleLabel">Round Up Only</div>
            <div className="stToggleDesc">Always round clock-out times upwards to the next increment.</div>
          </div>
          <ToggleSwitch checked={false} onChange={markDirty} />
        </div>
      </div>
    </div>
  )
}

function OvertimeThresholdsSection({ markDirty }) {
  return (
    <div className="stPanel">

      <div className="stCard">
        <Field label="Daily Overtime starts after (hours)">
          <input className="stInput" type="number" defaultValue={8} onChange={markDirty} />
        </Field>
        <Field label="Weekly Overtime starts after (hours)">
          <input className="stInput" type="number" defaultValue={40} onChange={markDirty} />
        </Field>
        <div className="stToggleRow">
          <div>
            <div className="stToggleLabel">Double Time Rule</div>
            <div className="stToggleDesc">Enable 2x rate for hours exceeding 12 per day.</div>
          </div>
          <ToggleSwitch checked={true} onChange={markDirty} accent="#EAB308" />
        </div>
      </div>
    </div>
  )
}

function EntryApprovalsSection({ markDirty }) {
  return (
    <div className="stPanel">

      <div className="stCard">
        <div className="stToggleRow">
          <div>
            <div className="stToggleLabel">Require Manager Approval</div>
            <div className="stToggleDesc">Manual timesheet entries must be approved before payroll inclusion.</div>
          </div>
          <ToggleSwitch checked={true} onChange={markDirty} />
        </div>
        <div className="stToggleRow">
          <div>
            <div className="stToggleLabel">Allow Retroactive Edits</div>
            <div className="stToggleDesc">Employees can edit entries from previous pay periods.</div>
          </div>
          <ToggleSwitch checked={false} onChange={markDirty} accent="#F43F5E" />
        </div>
      </div>
    </div>
  )
}

/* ═══ WORK SCHEDULES ══════════════════════════════════════════════ */
function FlexibleHoursSection({ markDirty }) {
  const days = ["MON", "TUE", "WED", "THU", "FRI"]
  return (
    <div className="stPanel" style={{ gap: 32 }}>
      {/* ── Default Working Hours Card ── */}
      <div className="stCard">
        <h4 style={{
          margin: "0 0 24px 0",
          fontSize: 12,
          fontWeight: 800,
          color: "#475569",
          letterSpacing: "0.05em",
          background: "#f8fafc",
          padding: "10px 16px",
          borderRadius: 6,
          display: "inline-block"
        }}>
          DEFAULT WORKING HOURS
        </h4>

        <p style={{ fontSize: 13.5, color: "#64748b", marginBottom: 24 }}>
          Define the standard work days and hours for your organization.
        </p>

        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {days.map(day => (
            <div key={day} style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              padding: "12px 20px",
              background: "#fff",
              border: "1px solid #e2e8f0",
              borderRadius: 12,
              transition: "border-color 0.2s"
            }}>
              <span style={{ fontWeight: 800, fontSize: 14, color: "#1e293b", width: 60 }}>{day}</span>
              <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                <input
                  type="time"
                  defaultValue="09:00"
                  className="stInput"
                  style={{ width: 120, border: "none", background: "#f1f5f9", fontWeight: 600 }}
                  onChange={markDirty}
                />
              </div>
            </div>
          ))}
          <div style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "12px 20px",
            background: "#f8fafc",
            border: "1px solid #e2e8f0",
            borderRadius: 12,
            opacity: 0.7
          }}>
            <span style={{ fontWeight: 800, fontSize: 14, color: "#64748b", width: 80 }}>SAT/SUN</span>
            <span style={{ fontSize: 13, fontWeight: 600, color: "#94a3b8" }}>Weekend - Off</span>
          </div>
        </div>
      </div>

      {/* ── Flexible Schedules Card ── */}
      <div className="stCard">
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
          <h4 style={{
            margin: 0,
            fontSize: 12,
            fontWeight: 800,
            color: "#475569",
            letterSpacing: "0.05em",
            background: "#f8fafc",
            padding: "10px 16px",
            borderRadius: 6
          }}>
            FLEXIBLE SCHEDULES
          </h4>
          <Info size={16} color="#94a3b8" />
        </div>

        <div className="stToggleRow">
          <div>
            <div className="stToggleLabel">Allow flexible start/end times</div>
            <div className="stToggleDesc">Employees can adjust their hours as long as total duration is met.</div>
          </div>
          <ToggleSwitch checked={true} onChange={markDirty} accent="#f97316" />
        </div>
      </div>
    </div>
  )
}

function BreakDeductionSection({ markDirty }) {
  return (
    <div className="stPanel">

      <div className="stCard">
        <div className="stToggleRow">
          <div>
            <div className="stToggleLabel">Auto-deduct Unpaid Breaks</div>
            <div className="stToggleDesc">Automatically subtract 30-60 mins for shifts longer than 6 hours.</div>
          </div>
          <ToggleSwitch checked={true} onChange={markDirty} />
        </div>
        <Field label="Break Duration (minutes)">
          <input className="stInput" type="number" defaultValue={30} onChange={markDirty} />
        </Field>
      </div>
    </div>
  )
}

function ShiftSwapSection({ markDirty }) {
  return (
    <div className="stPanel">

      <div className="stCard">
        <div className="stToggleRow">
          <div>
            <div className="stToggleLabel">Allow Peer Swaps</div>
            <div className="stToggleDesc">Employees can request to swap shifts directly via the app.</div>
          </div>
          <ToggleSwitch checked={true} onChange={markDirty} accent="#10B981" />
        </div>
        <div className="stToggleRow">
          <div>
            <div className="stToggleLabel">Require Manager Approval</div>
            <div className="stToggleDesc">Swaps must be reviewed by a manager before the schedule is updated.</div>
          </div>
          <ToggleSwitch checked={true} onChange={markDirty} />
        </div>
      </div>
    </div>
  )
}

function MinimumRestSection({ markDirty }) {
  return (
    <div className="stPanel">

      <div className="stCard">
        <Field label="Minimum Rest Period (hours)">
          <input className="stInput" type="number" defaultValue={11} onChange={markDirty} />
        </Field>
        <div className="stToggleRow">
          <div>
            <div className="stToggleLabel">Block Schedule Violations</div>
            <div className="stToggleDesc">Prevent managers from assigning shifts that violate rest rules.</div>
          </div>
          <ToggleSwitch checked={true} onChange={markDirty} accent="#F43F5E" />
        </div>
      </div>
    </div>
  )
}

function SchedulePublishingSection({ markDirty }) {
  return (
    <div className="stPanel">

      <div className="stCard">
        <Field label="Advance Publishing (days)">
          <input className="stInput" type="number" defaultValue={14} onChange={markDirty} />
        </Field>
        <div className="stToggleRow">
          <div>
            <div className="stToggleLabel">Auto-publish on Completion</div>
            <div className="stToggleDesc">Notify employees as soon as the manager finishes the roster.</div>
          </div>
          <ToggleSwitch checked={false} onChange={markDirty} />
        </div>
      </div>
    </div>
  )
}

/* ═══ TIME OFF ════════════════════════════════════════════════════ */
function AccrualFrequencySection({ markDirty }) {
  return (
    <div className="stPanel">

      <div className="stCard">
        <Field label="Accrual Cycle">
          <select className="stInput stSelect" defaultValue="monthly" onChange={markDirty}>
            <option value="annually">Annually (Lump sum)</option>
            <option value="monthly">Monthly</option>
            <option value="biweekly">Bi-weekly</option>
            <option value="worked">Per hour worked</option>
          </select>
        </Field>
      </div>
    </div>
  )
}

function CarryOverRulesSection({ markDirty }) {
  return (
    <div className="stPanel">

      <div className="stCard">
        <div className="stToggleRow">
          <div>
            <div className="stToggleLabel">Allow Carry-over</div>
            <div className="stToggleDesc">Unused days transfer to the next year.</div>
          </div>
          <ToggleSwitch checked={true} onChange={markDirty} />
        </div>
        <Field label="Max Carry-over Days">
          <input className="stInput" type="number" defaultValue={5} onChange={markDirty} />
        </Field>
        <div className="stToggleRow">
          <div>
            <div className="stToggleLabel">Allow Negative Balance</div>
            <div className="stToggleDesc">Employees can 'borrow' leave from the next accrual period.</div>
          </div>
          <ToggleSwitch checked={false} onChange={markDirty} accent="#F43F5E" />
        </div>
      </div>
    </div>
  )
}

function SickLeaveDocsSection({ markDirty }) {
  return (
    <div className="stPanel">

      <div className="stCard">
        <Field label="Require Doctor's Note after (days)">
          <input className="stInput" type="number" defaultValue={3} onChange={markDirty} />
        </Field>
        <div className="stToggleRow">
          <div>
            <div className="stToggleLabel">Strict Verification</div>
            <div className="stToggleDesc">Flag sick leave without documentation for HR review.</div>
          </div>
          <ToggleSwitch checked={true} onChange={markDirty} />
        </div>
      </div>
    </div>
  )
}

function PublicHolidaysSection({ markDirty }) {
  return (
    <div className="stPanel">

      <div className="stCard">
        <Field label="Country-specific Calendar">
          <select className="stInput stSelect" defaultValue="in" onChange={markDirty}>
            <option value="in">India (Standard)</option>
            <option value="us">United States</option>
            <option value="uk">United Kingdom</option>
            <option value="ae">UAE / Dubai</option>
          </select>
        </Field>
        <div className="stToggleRow">
          <div>
            <div className="stToggleLabel">Auto-apply Public Holidays</div>
            <div className="stToggleDesc">Automatically mark these days as 'Paid Off' in the timesheet.</div>
          </div>
          <ToggleSwitch checked={true} onChange={markDirty} />
        </div>
      </div>
    </div>
  )
}

/* ═══ PAYROLL ═════════════════════════════════════════════════════ */
function PayCycleSection({ markDirty }) {
  return (
    <div className="stPanel" style={{ gap: 32 }}>
      <div className="stCard">
        <h4 style={{ margin: "0 0 24px 0", fontSize: 12, fontWeight: 800, color: "#475569", letterSpacing: "0.05em", background: "#f8fafc", padding: "10px 16px", borderRadius: 6, display: "inline-block" }}>
          PAYROLL CYCLE
        </h4>
        <div className="stFormGrid">
          <Field label="Cycle Frequency" half>
            <select className="stInput stSelect" onChange={markDirty} defaultValue="monthly">
              <option value="weekly">Weekly</option>
              <option value="biweekly">Bi-weekly</option>
              <option value="monthly">Monthly</option>
            </select>
          </Field>
          <Field label="Payout Date (of month)" half>
            <input type="number" className="stInput" defaultValue={1} onChange={markDirty} />
          </Field>
        </div>
      </div>

      <div className="stCard">
        <h4 style={{ margin: "0 0 24px 0", fontSize: 12, fontWeight: 800, color: "#475569", letterSpacing: "0.05em", background: "#f8fafc", padding: "10px 16px", borderRadius: 6, display: "inline-block" }}>
          STATUTORY COMPLIANCE
        </h4>
        <div className="stToggleRow">
          <div>
            <div className="stToggleLabel">Enable Tax Deductions</div>
            <div className="stToggleDesc">Automatically calculate TDS/Professional Tax based on local regulations.</div>
          </div>
          <ToggleSwitch checked={true} onChange={markDirty} accent="#EAB308" />
        </div>
      </div>
    </div>
  )
}

function CurrencySection({ markDirty }) {
  return (
    <div className="stPanel">

      <div className="stCard">
        <Field label="Primary Currency">
          <select className="stInput stSelect" defaultValue="INR" onChange={markDirty}>
            <option value="INR">Indian Rupee (₹)</option>
            <option value="USD">US Dollar ($)</option>
            <option value="GBP">British Pound (£)</option>
            <option value="EUR">Euro (€)</option>
          </select>
        </Field>
      </div>
    </div>
  )
}

function OvertimeMultipliersSection({ markDirty }) {
  return (
    <div className="stPanel">

      <div className="stCard">
        <div className="stFormGrid">
          <Field label="Weekday Overtime Rate" half>
            <div className="stInputAddon">
              <input className="stInput" type="number" step="0.1" defaultValue={1.5} onChange={markDirty} />
              <span className="stInputAddonPrefix">x</span>
            </div>
          </Field>
          <Field label="Weekend Overtime Rate" half>
            <div className="stInputAddon">
              <input className="stInput" type="number" step="0.1" defaultValue={2.0} onChange={markDirty} />
              <span className="stInputAddonPrefix">x</span>
            </div>
          </Field>
          <Field label="Public Holiday Rate" half>
            <div className="stInputAddon">
              <input className="stInput" type="number" step="0.1" defaultValue={2.5} onChange={markDirty} />
              <span className="stInputAddonPrefix">x</span>
            </div>
          </Field>
        </div>
      </div>
    </div>
  )
}

function AutoExportSection({ markDirty }) {
  return (
    <div className="stPanel">

      <div className="stCard">
        <Field label="Accounting Tool">
          <select className="stInput stSelect" defaultValue="tally" onChange={markDirty}>
            <option value="none">No Export</option>
            <option value="tally">Tally Prime</option>
            <option value="quickbooks">QuickBooks</option>
            <option value="xero">Xero</option>
            <option value="sap">SAP / Oracle</option>
          </select>
        </Field>
        <div className="stToggleRow">
          <div>
            <div className="stToggleLabel">Auto-sync on Payroll Completion</div>
            <div className="stToggleDesc">Push data immediately once the payroll run is finalized.</div>
          </div>
          <ToggleSwitch checked={false} onChange={markDirty} />
        </div>
      </div>
    </div>
  )
}

/* ═══ NOTIFICATIONS (Alert Sets) ══════════════════════════════════ */
function AlertSetSection({ role, markDirty }) {
  const events = role === "employee" ? [
    { key: "clockin_late", label: "Late Clock-in", desc: "Alert when you miss your shift start" },
    { key: "payslip", label: "Payslip Published", desc: "Notification when salary is credited" },
    { key: "leave_approved", label: "Leave Approval", desc: "Status update on your leave request" },
    { key: "schedule_new", label: "New Schedule", desc: "Alert when a new work roster is published" },
  ] : [
    { key: "missed_clockin", label: "Staff Late Arrival", desc: "Alert when an employee misses shift start" },
    { key: "leave_request", label: "New Leave Application", desc: "Notification for pending approvals" },
    { key: "manual_entry", label: "Manual Timesheet Entry", desc: "Alert for timesheet edits requiring review" },
    { key: "overtime_alert", label: "Approaching Overtime", desc: "Notification when staff near OT thresholds" },
  ]

  return (
    <div className="stPanel">

      <div className="stCard" style={{ padding: 0 }}>
        <div className="stNotifTable">
          {events.map(ev => (
            <div key={ev.key} className="stNotifRow">
              <div style={{ flex: 1 }}>
                <div className="stNotifEvLabel">{ev.label}</div>
                <div className="stNotifEvDesc">{ev.desc}</div>
              </div>
              <div className="stNotifCol">
                <ToggleSwitch checked={true} onChange={markDirty} />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

function DeliveryChannelsSection({ markDirty }) {
  const channels = [
    { id: "push", label: "Mobile Push", icon: <Smartphone size={14} />, desc: "Direct app notifications" },
    { id: "email", label: "Email Notifications", icon: <Mail size={14} />, desc: "HTML alerts to work inbox" },
    { id: "sms", label: "SMS Alerts", icon: <MessageSquare size={14} />, desc: "Text messages for critical alerts" },
    { id: "whatsapp", label: "WhatsApp Business", icon: <MessageSquare size={14} />, desc: "Automated WhatsApp messages" },
  ]
  return (
    <div className="stPanel">

      <div className="stCard" style={{ display: "grid", gap: 12 }}>
        {channels.map(c => (
          <div key={c.id} className="stToggleRow">
            <div style={{ display: "flex", gap: 12 }}>
              <div style={{ padding: 8, background: "var(--surface2)", borderRadius: 8, color: "var(--fg)" }}>{c.icon}</div>
              <div>
                <div className="stToggleLabel">{c.label}</div>
                <div className="stToggleDesc">{c.desc}</div>
              </div>
            </div>
            <ToggleSwitch checked={c.id === "push" || c.id === "email"} onChange={markDirty} />
          </div>
        ))}
      </div>
    </div>
  )
}

/* ═══ RBAC ════════════════════════════════════════════════════════ */
function RolesPermissionsSection({ markDirty }) {
  return (
    <div className="stPanel">

      <div className="stCard">
        <div className="stToggleRow">
          <div>
            <div className="stToggleLabel">Manager Leave Approval</div>
            <div className="stToggleDesc">Allow team managers to approve/reject leaves.</div>
          </div>
          <ToggleSwitch checked={true} onChange={markDirty} />
        </div>
        <div className="stToggleRow">
          <div>
            <div className="stToggleLabel">Timesheet Lock</div>
            <div className="stToggleDesc">Prevent employees from editing past timesheets.</div>
          </div>
          <ToggleSwitch checked={true} onChange={markDirty} />
        </div>
      </div>
    </div>
  )
}

function SalaryVisibilitySection({ markDirty }) {
  return (
    <div className="stPanel">

      <div className="stCard">
        <div className="stToggleRow">
          <div>
            <div className="stToggleLabel">Hide Salary from Managers</div>
            <div className="stToggleDesc">Only Admins and Finance roles can see pay rates.</div>
          </div>
          <ToggleSwitch checked={true} onChange={markDirty} accent="#F43F5E" />
        </div>
        <div className="stToggleRow">
          <div>
            <div className="stToggleLabel">Payslip Access</div>
            <div className="stToggleDesc">Allow employees to download their own payslips.</div>
          </div>
          <ToggleSwitch checked={true} onChange={markDirty} />
        </div>
      </div>
    </div>
  )
}

/* ═══ AUDIT LOG ═══════════════════════════════════════════════════ */
function RetentionPolicySection({ markDirty }) {
  return (
    <div className="stPanel">

      <div className="stCard">
        <Field label="Log Retention Period">
          <select className="stInput stSelect" defaultValue="365" onChange={markDirty}>
            <option value="90">90 Days</option>
            <option value="180">180 Days</option>
            <option value="365">1 Year</option>
            <option value="1095">3 Years</option>
            <option value="unlimited">Unlimited (Compliance)</option>
          </select>
        </Field>
        <div className="stCardActions" style={{ marginTop: 20 }}>
          <button className="stGhostBtn"><FileText size={14} /> Export CSV Audit Trail</button>
        </div>
      </div>
    </div>
  )
}

function SecurityAlertsSection({ markDirty }) {
  return (
    <div className="stPanel">

      <div className="stCard">
        <div className="stToggleRow">
          <div>
            <div className="stToggleLabel">Suspicious Login Detection</div>
            <div className="stToggleDesc">Notify admins of new devices or locations.</div>
          </div>
          <ToggleSwitch checked={true} onChange={markDirty} accent="#F43F5E" />
        </div>
        <div className="stToggleRow">
          <div>
            <div className="stToggleLabel">Bulk Data Export Alert</div>
            <div className="stToggleDesc">Alert when someone exports more than 50 employee records.</div>
          </div>
          <ToggleSwitch checked={true} onChange={markDirty} accent="#F43F5E" />
        </div>
      </div>
    </div>
  )
}

/* ═══ INTEGRATIONS ════════════════════════════════════════════════ */
function IntegrationsSection({ showToast }) {
  const [connected, setConnected] = useState(["google-cal", "slack"])
  const [connecting, setConnecting] = useState(null)

  const categories = [
    { id: "auth", label: "Identity & Authentication", icon: <Shield size={16} /> },
    { id: "comm", label: "Communication & Messaging", icon: <MessageCircle size={16} /> },
    { id: "pm", label: "Project Management", icon: <Layout size={16} /> },
    { id: "calendar", label: "Calendars & Scheduling", icon: <Calendar size={16} /> },
    { id: "tracking", label: "Time Tracking Sync", icon: <Clock size={16} /> },
    { id: "storage", label: "Cloud Storage", icon: <Database size={16} /> },
    { id: "ai", label: "Artificial Intelligence", icon: <Cpu size={16} /> },
    { id: "browser", label: "Browser Extensions", icon: <Globe size={16} /> },
  ]

  const apps = [
    { id: "discord", cat: "comm", label: "Discord", desc: "Collaborative communication for teams.", free: "Free Tier Available", icon: <MessageCircle size={18} /> },
    { id: "slack", cat: "comm", label: "Slack", desc: "Professional team messaging and workflows.", free: "Great for MVP", icon: <Layers size={18} /> },
    { id: "google-auth", cat: "auth", label: "Google Workspace", desc: "Enable SSO via Google OAuth 2.0.", free: "Always Free", icon: <Globe size={18} /> },
    { id: "auth0", cat: "auth", label: "Auth0", desc: "Enterprise-grade identity management.", free: "Generous Free Tier", icon: <Shield size={18} /> },
    { id: "trello", cat: "pm", label: "Trello", desc: "Visual task boards and cards.", free: "Standard Free Plan", icon: <Layout size={18} /> },
    { id: "clickup", cat: "pm", label: "ClickUp", desc: "One app to replace them all.", free: "Full-featured Free", icon: <Box size={18} /> },
    { id: "asana", cat: "pm", label: "Asana", desc: "Manage projects and team tasks.", free: "Limited Free Plan", icon: <Plus size={18} /> },
    { id: "sentry", cat: "monitoring", label: "Sentry", desc: "Error tracking & monitoring.", free: "Excellent Free Tier", icon: <AlertTriangle size={18} /> },
    { id: "new-relic", cat: "monitoring", label: "New Relic", desc: "Full-stack observability.", free: "Limited Free Quota", icon: <BarChart3 size={18} /> },
    { id: "google-drive", cat: "storage", label: "Google Drive", desc: "Cloud storage for team assets.", free: "15GB Free per User", icon: <Database size={18} /> },
    { id: "dropbox", cat: "storage", label: "Dropbox", desc: "File hosting and smart sync.", free: "API Access Free", icon: <Box size={18} /> },
    { id: "clockify", cat: "tracking", label: "Clockify", desc: "The most popular free time tracker.", free: "100% Free for Teams", icon: <Clock size={18} /> },
    { id: "jibble", cat: "tracking", label: "Jibble", desc: "Time tracking with face recognition.", free: "Strong Free Tier", icon: <Smartphone size={18} /> },
    { id: "gemini", cat: "ai", label: "Gemini AI", desc: "Google DeepMind's powerful LLM.", free: "Free Daily Quota", icon: <Cpu size={18} /> },
    { id: "local-ai", cat: "ai", label: "Ollama / Local", desc: "Self-hosted open-source AI models.", free: "Fully Free Forever", icon: <Terminal size={18} /> },
    { id: "google-cal", cat: "calendar", label: "Google Calendar", desc: "Sync events and track time.", free: "Oauth-based", icon: <Calendar size={18} /> },
    { id: "outlook-cal", cat: "calendar", label: "Outlook Calendar", desc: "Microsoft 365 integration.", free: "Enterprise Sync", icon: <Mail size={18} /> },
    { id: "chrome-ext", cat: "browser", label: "Chrome Extension", desc: "Track time inside other web apps.", free: "Free Download", icon: <Globe size={18} /> },
    { id: "firefox-ext", cat: "browser", label: "Firefox Add-on", desc: "Browser-based tracking.", free: "Free Download", icon: <Share2 size={18} /> },
  ]

  const handleConnect = (id) => {
    setConnecting(id)
    setTimeout(() => {
      setConnected(prev => [...prev, id])
      setConnecting(null)
      showToast(`${apps.find(a => a.id === id).label} connected successfully!`)
    }, 1200)
  }

  const handleDisconnect = (id) => {
    setConnected(prev => prev.filter(a => a !== id))
    showToast(`${apps.find(a => a.id === id).label} disconnected.`, "warn")
  }

  return (
    <div className="stPanel">

      {categories.map(cat => {
        const catApps = apps.filter(a => a.cat === cat.id)
        if (catApps.length === 0) return null

        return (
          <div key={cat.id} className="stCard" style={{ marginBottom: 24 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 20 }}>
              <div style={{ padding: 8, background: "var(--surface2)", borderRadius: 8, color: "var(--fg)" }}>
                {cat.icon}
              </div>
              <div>
                <h4 style={{ margin: 0, fontSize: 15, fontWeight: 800, color: "var(--fg)" }}>{cat.label}</h4>
                <div style={{ fontSize: 12, color: "var(--muted)" }}>{catApps.length} integration{catApps.length !== 1 ? "s" : ""} available</div>
              </div>
            </div>

            <div style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))",
              gap: 16
            }}>
              {catApps.map(app => {
                const isConnected = connected.includes(app.id)
                const isConnecting = connecting === app.id

                return (
                  <div key={app.id} style={{
                    padding: 16,
                    border: "1px solid var(--stroke)",
                    borderRadius: 12,
                    background: isConnected ? "var(--surface2)" : "transparent",
                    transition: "all 0.2s"
                  }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 12 }}>
                      <div style={{
                        width: 40, height: 40,
                        background: "var(--bg)",
                        border: "1px solid var(--stroke)",
                        borderRadius: 10,
                        display: "flex", alignItems: "center", justifyContent: "center"
                      }}>
                        {app.icon}
                      </div>
                      <div style={{ fontSize: 10, fontWeight: 800, padding: "2px 8px", background: "var(--stroke)", borderRadius: 10, color: "var(--muted)", textTransform: "uppercase" }}>
                        {app.free}
                      </div>
                    </div>

                    <h5 style={{ margin: "0 0 4px 0", fontSize: 14, fontWeight: 800, color: "var(--fg)" }}>{app.label}</h5>
                    <p style={{ margin: "0 0 16px 0", fontSize: 12, color: "var(--muted)", lineHeight: 1.5, minHeight: 36 }}>
                      {app.desc}
                    </p>

                    <div style={{ display: "flex", gap: 8 }}>
                      {isConnected ? (
                        <>
                          <div style={{
                            flex: 1, height: 36,
                            display: "flex", alignItems: "center", justifyContent: "center",
                            gap: 6, background: "#ecfdf5", color: "#059669",
                            borderRadius: 8, fontSize: 12, fontWeight: 800
                          }}>
                            <Check size={12} strokeWidth={4} /> Connected
                          </div>
                          <button
                            className="stIntConfigBtn"
                            style={{ width: 36, height: 36, padding: 0 }}
                            onClick={() => showToast("Configuration coming soon.", "info")}
                          >
                            <Settings size={14} />
                          </button>
                          <button
                            className="stIntUnlinkBtn"
                            style={{ width: 36, height: 36, padding: 0 }}
                            onClick={() => handleDisconnect(app.id)}
                          >
                            <X size={14} />
                          </button>
                        </>
                      ) : (
                        <button
                          className="stPrimaryBtn"
                          style={{ width: "100%", height: 36, padding: 0, gap: 8 }}
                          onClick={() => handleConnect(app.id)}
                          disabled={isConnecting}
                        >
                          {isConnecting ? <RefreshCcw size={14} className="stSpin" /> : <Plug size={14} />}
                          {isConnecting ? "Connecting..." : "Connect"}
                        </button>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )
      })}

      <div className="stInfoBox" style={{ marginTop: 32 }}>
        <Info size={18} />
        <div>
          <div style={{ fontSize: 14, fontWeight: 800, color: "var(--fg)", marginBottom: 4 }}>Need a custom integration?</div>
          <p style={{ fontSize: 13, color: "var(--muted)", margin: 0, lineHeight: 1.5 }}>
            Our enterprise plan supports webhooks and custom API connectors. Reach out to our solution architects to build a bespoke workflow for your business.
          </p>
        </div>
      </div>
    </div>
  )
}
/* ═══ SHIFT PLANNING ═══════════════════════════════════════════════ */
function ShiftPlanningSection({ markDirty }) {
  return (
    <div className="stPanel">

      <div className="stCard">
        <div className="stToggleRow">
          <div>
            <div className="stToggleLabel">Enable Rotating Shifts</div>
            <div className="stToggleDesc">Automatically cycle employees through morning, afternoon, and night shifts.</div>
          </div>
          <ToggleSwitch checked={true} onChange={markDirty} accent="#EC4899" />
        </div>
        <div className="stToggleRow">
          <div>
            <div className="stToggleLabel">Auto Shift Assignment</div>
            <div className="stToggleDesc">AI-suggested rosters based on availability and labor laws.</div>
          </div>
          <ToggleSwitch checked={false} onChange={markDirty} accent="#10B981" />
        </div>
        <Field label="Default Shift Duration (Hours)">
          <input className="stInput" type="number" defaultValue={8} onChange={markDirty} />
        </Field>
      </div>
      <div className="stCard">
        <h4 style={{ margin: "0 0 12px 0", fontSize: 14, fontWeight: 800 }}>Weekly Roster Template</h4>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 4 }}>
          {["M", "T", "W", "T", "F", "S", "S"].map((d, i) => (
            <div key={i} style={{ padding: "8px 4px", background: i < 5 ? "#EFF0FE" : "var(--stroke2)", borderRadius: 4, textAlign: "center", fontSize: 11, fontWeight: 700, color: i < 5 ? "#1A56DB" : "var(--muted)" }}>
              {d}<br /><span style={{ fontSize: 9 }}>{i < 5 ? "8h" : "OFF"}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

/* ═══ EXPENSES ═════════════════════════════════════════════════════ */
function ExpensesSection({ markDirty, showToast }) {
  return (
    <div className="stPanel">

      <div className="stCard">
        <div className="stToggleRow">
          <div>
            <div className="stToggleLabel">Require Receipt Upload</div>
            <div className="stToggleDesc">All expense claims must have a valid document attached.</div>
          </div>
          <ToggleSwitch checked={true} onChange={markDirty} accent="#F97316" />
        </div>
        <Field label="Max Auto-Approval Limit (₹)">
          <input className="stInput" type="number" defaultValue={500} onChange={markDirty} />
        </Field>
      </div>
      <div className="stCard">
        <h4 style={{ margin: "0 0 12px 0", fontSize: 14, fontWeight: 800 }}>Active Expense Categories</h4>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
          {["Travel", "Meals", "Office Supplies", "Internet", "Hardware"].map(c => (
            <div key={c} style={{ padding: "6px 12px", background: "var(--surface2)", borderRadius: 20, fontSize: 12, fontWeight: 600, display: "flex", alignItems: "center", gap: 6, border: "1px solid var(--stroke)" }}>
              <div style={{ width: 6, height: 6, borderRadius: "50%", background: "#F97316" }} /> {c}
            </div>
          ))}
          <button className="stGhostBtn" style={{ fontSize: 11, padding: "4px 8px" }} onClick={() => showToast("Category editor coming soon.", "info")}><Plus size={12} /> Add Category</button>
        </div>
      </div>
    </div>
  )
}

/* ═══ PRODUCTIVITY ═════════════════════════════════════════════════ */
function ProductivitySection({ markDirty }) {
  return (
    <div className="stPanel">

      <div className="stCard">
        <div className="stToggleRow">
          <div>
            <div className="stToggleLabel">Idle Detection</div>
            <div className="stToggleDesc">Mark time as 'Idle' after 5 minutes of inactivity.</div>
          </div>
          <ToggleSwitch checked={true} onChange={markDirty} accent="#06B6D4" />
        </div>
        <div className="stToggleRow">
          <div>
            <div className="stToggleLabel">Website & App Tracking</div>
            <div className="stToggleDesc">Categorize URL/App usage into 'Productive' or 'Distracting'.</div>
          </div>
          <ToggleSwitch checked={false} onChange={markDirty} accent="#F43F5E" />
        </div>
      </div>
      <div className="stCard">
        <h4 style={{ margin: "0 0 12px 0", fontSize: 14, fontWeight: 800 }}>Focus Score Calculation</h4>
        <div style={{ padding: 16, background: "var(--surface2)", borderRadius: 12, border: "1px solid var(--stroke)" }}>
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
            <span style={{ fontSize: 12, color: "var(--muted)" }}>Current Algorithm</span>
            <span style={{ fontSize: 12, fontWeight: 700, color: "#06B6D4" }}>v2.4 (Enterprise)</span>
          </div>
          <div style={{ height: 4, background: "var(--stroke2)", borderRadius: 2, overflow: "hidden" }}>
            <div style={{ width: "75%", height: "100%", background: "#06B6D4" }} />
          </div>
          <p style={{ fontSize: 11, color: "var(--muted)", marginTop: 8 }}>Weight: 40% Active Hours, 40% Task Completion, 20% App Focus.</p>
        </div>
      </div>
    </div>
  )
}

/* ═══ REPORTS ══════════════════════════════════════════════════════ */
function ReportsSection({ showToast }) {
  return (
    <div className="stPanel">
      <div className="stCard" style={{ width: "100%" }}>
        <h4 style={{ margin: "0 0 20px 0", fontSize: 14, fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.05em", color: "#64748b" }}>Scheduled Reports</h4>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(400px, 1fr))", gap: 16 }}>
          {[
            { name: "Monthly Attendance", type: "PDF", freq: "Monthly", next: "May 1, 2026" },
            { name: "Weekly Timesheets", type: "XLSX", freq: "Weekly", next: "Monday, 9 AM" },
            { name: "Late Mark Summary", type: "CSV", freq: "Daily", next: "Tomorrow, 8 PM" },
          ].map((r, i) => (
            <div key={i} style={{ display: "flex", alignItems: "center", gap: 16, padding: 20, background: "var(--surface2)", borderRadius: 12, border: "1px solid var(--stroke)" }}>
              <div style={{ padding: 10, background: "#fff", borderRadius: 8, boxShadow: "0 2px 4px rgba(0,0,0,0.05)" }}><ScrollText size={18} color="#1A56DB" /></div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 15, fontWeight: 800 }}>{r.name}</div>
                <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 2 }}>{r.type} · {r.freq} · Next: {r.next}</div>
              </div>
              <button className="stGhostBtn" style={{ padding: 8, borderRadius: 8 }} onClick={() => showToast(`Downloading ${r.name}...`)}><Download size={16} /></button>
            </div>
          ))}
        </div>
        <div style={{ marginTop: 24, display: "flex", justifyContent: "flex-start" }}>
          <button className="stPrimaryBtn" style={{ padding: "12px 24px" }} onClick={() => showToast("Report builder coming soon.", "info")}>
            <Plus size={16} /> Create New Schedule
          </button>
        </div>
      </div>
    </div>
  )
}

/* ═══ DEVICES ══════════════════════════════════════════════════════ */
function DevicesSection({ markDirty, showToast }) {
  return (
    <div className="stPanel">

      <div className="stCard">
        <div className="stToggleRow">
          <div>
            <div className="stToggleLabel">Restrict to Allowed Devices</div>
            <div className="stToggleDesc">Only registered devices can access the clock-in portal.</div>
          </div>
          <ToggleSwitch checked={false} onChange={markDirty} accent="#64748B" />
        </div>
        <div className="stToggleRow">
          <div>
            <div className="stToggleLabel">Desktop App Control</div>
            <div className="stToggleDesc">Force use of Caltrack Desktop for time tracking on workstations.</div>
          </div>
          <ToggleSwitch checked={true} onChange={markDirty} accent="#1A56DB" />
        </div>
      </div>
      <div className="stCard">
        <h4 style={{ margin: "0 0 12px 0", fontSize: 14, fontWeight: 800 }}>Registered Kiosks</h4>
        <div style={{ display: "flex", alignItems: "center", gap: 12, padding: 12, background: "#F1F5F9", borderRadius: 8 }}>
          <Smartphone size={18} color="#64748B" />
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 13, fontWeight: 700 }}>Front Desk iPad (Main Entry)</div>
            <div style={{ fontSize: 11, color: "#64748B" }}>ID: K-8812 · Last Online: 2 mins ago</div>
          </div>
          <div style={{ width: 8, height: 8, borderRadius: "50%", background: "#10B981" }} />
        </div>
      </div>
    </div>
  )
}

/* ═══ DEVELOPER ════════════════════════════════════════════════════ */
function DeveloperSection({ showToast }) {
  return (
    <div className="stPanel">
      <div className="stCard">
        <h4 style={{ margin: "0 0 12px 0", fontSize: 14, fontWeight: 800 }}>API Keys</h4>
        <div style={{ position: "relative" }}>
          <input className="stInput" readOnly value="sk_live_51MvXp3S9X2mR7q2..." style={{ fontFamily: "monospace", paddingRight: 40, background: "var(--surface2)" }} />
          <button style={{ position: "absolute", right: 8, top: "50%", transform: "translateY(-50%)", background: "none", border: "none", cursor: "pointer", color: "var(--muted)" }} onClick={() => { navigator.clipboard.writeText("sk_live_51MvXp3S9X2mR7q2..."); showToast("API Key copied!") }}>
            <Copy size={14} />
          </button>
        </div>
        <p style={{ fontSize: 11, color: "var(--muted)", marginTop: 8 }}>Treat your API keys as passwords. Do not share them.</p>
        <button className="stSecondaryBtn" style={{ marginTop: 12 }} onClick={() => showToast("Regenerating API Key...", "warn")}>Regenerate Secret</button>
      </div>
      <div className="stCard">
        <h4 style={{ margin: "0 0 12px 0", fontSize: 14, fontWeight: 800 }}>Webhooks</h4>
        <div style={{ padding: 12, border: "1px dashed var(--stroke)", borderRadius: 8, textAlign: "center", color: "var(--muted)", fontSize: 12 }}>
          No active webhooks. <button className="stLinkBtn" style={{ fontWeight: 700, color: "#1A56DB" }} onClick={() => showToast("Webhook editor coming soon.", "info")}>Add Endpoint</button>
        </div>
      </div>
    </div>
  )
}

/* ═══ DATA & BACKUPS ═══════════════════════════════════════════════ */
function DataBackupsSection({ showToast }) {
  return (
    <div className="stPanel">
      <div className="stCard">
        <h4 style={{ margin: "0 0 24px 0", fontSize: 12, fontWeight: 800, color: "#475569", letterSpacing: "0.05em", background: "#f8fafc", padding: "10px 16px", borderRadius: 6, display: "inline-block" }}>
          EXPORTS & SNAPSHOTS
        </h4>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          <button className="stSecondaryBtn" style={{ height: 80, flexDirection: "column", gap: 8 }} onClick={() => showToast("Full backup initiated...")}>
            <Database size={20} />
            Create Full Backup
          </button>
          <button className="stSecondaryBtn" style={{ height: 80, flexDirection: "column", gap: 8 }} onClick={() => showToast("Exporting data as CSV...")}>
            <Download size={20} />
            Export Organization Data
          </button>
        </div>
      </div>
      <div className="stCard">
        <h4 style={{ margin: "0 0 12px 0", fontSize: 14, fontWeight: 800 }}>Retention Policy</h4>
        <Field label="Keep Activity Logs for">
          <select className="stInput stSelect">
            <option>90 Days</option>
            <option>1 Year</option>
            <option>5 Years (Compliance)</option>
            <option>Indefinitely</option>
          </select>
        </Field>
      </div>
    </div>
  )
}
