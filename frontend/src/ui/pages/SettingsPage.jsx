import { useState, useCallback, useEffect, useMemo, lazy, Suspense } from "react"
import { useLocation } from "react-router-dom"
import { motion, AnimatePresence } from "framer-motion"
import { routes } from "../routes.js"
import { Button } from "../components/kit.jsx"
import { useAuth } from "../../state/auth/useAuth.js"
import {
  User, Shield, Palette, Bell, CreditCard, Users2, Plug,
  Building2, Database, AlertTriangle, ShieldCheck, RefreshCcw,
  CheckCircle2, X, Save, ChevronRight, FileText,
} from "lucide-react"

/* ── Lazy section imports ─────────────────────────────────────── */
const ProfileSection        = lazy(() => import("./settings/ProfileSection.jsx"))
const AccountSecuritySection = lazy(() => import("./settings/AccountSecuritySection.jsx"))
const AppearanceSection     = lazy(() => import("./settings/AppearanceSection.jsx"))
const NotificationsSection  = lazy(() => import("./settings/NotificationsSection.jsx"))
const BillingSection        = lazy(() => import("./settings/BillingSection.jsx"))
const MembersSettingsSection = lazy(() =>
  import("./PeopleSettingsPage.jsx").then(m => ({ default: m.PeopleSettingsPage }))
)
const TeamMembersSection    = lazy(() => import("./settings/TeamMembersSection.jsx"))
const InvoicesSection       = lazy(() => import("./settings/InvoicesSection.jsx"))
const IntegrationsApiSection = lazy(() => import("./settings/IntegrationsApiSection.jsx"))
const WorkspaceSection      = lazy(() => import("./settings/WorkspaceSection.jsx"))
const PrivacyDataSection    = lazy(() => import("./settings/PrivacyDataSection.jsx"))
const DangerZoneSection     = lazy(() => import("./settings/DangerZoneSection.jsx"))
const AccessControlSection  = lazy(() => import("./settings/AccessControlSection.jsx"))

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

function SectionHeader({ title, subtitle }) {
  return (
    <div className="mb-10">
      <h3 className="text-2xl font-black text-slate-900 dark:text-white mb-2 tracking-tight">{title}</h3>
      <p className="text-sm text-slate-500 dark:text-slate-400 leading-relaxed max-w-2xl">{subtitle}</p>
    </div>
  )
}

export function Field({ label, children, half }) {
  return (
    <div className={`flex flex-col gap-2 ${half ? "w-1/2" : "w-full"}`}>
      <label className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-[0.15em] ml-1">
        {label}
      </label>
      {children}
    </div>
  )
}

/* ── Tabs ────────────────────────────────────────────────────── */
const TABS = [
  {
    id: "profile",
    label: "My Profile",
    subtitle: "Update your personal information, avatar, timezone, and language.",
    icon: <User size={15} />,
    to: routes.settings_profile,
  },
  {
    id: "security",
    label: "Account & Security",
    subtitle: "Email, password, two-factor authentication, and active sessions.",
    icon: <Shield size={15} />,
    to: routes.settings_security,
  },
  {
    id: "appearance",
    label: "Appearance",
    subtitle: "Theme, accent color, density, and font size preferences.",
    icon: <Palette size={15} />,
    to: routes.settings_appearance,
  },
  {
    id: "notifications",
    label: "Notifications",
    subtitle: "Email, in-app, and SMS notification preferences per event.",
    icon: <Bell size={15} />,
    to: routes.settings_notifications,
  },
  {
    id: "billing",
    label: "Billing & Plans",
    subtitle: "Manage your subscription, invoices, payment method, and usage.",
    icon: <CreditCard size={15} />,
    adminOnly: true,
    to: routes.settings_billing,
  },
  {
    id: "people",
    label: "Members",
    subtitle: "Add members, manage roles, and view the invite/creation queue.",
    icon: <Users2 size={15} />,
    adminOnly: true,
    to: routes.settings_people,
  },
  {
    id: "team",
    label: "Team & Members",
    subtitle: "Invite members, assign roles, and manage workspace access.",
    icon: <Users2 size={15} />,
    adminOnly: true,
    to: routes.settings_team,
  },
  {
    id: "invoices",
    label: "Invoices",
    subtitle: "View, generate, and download your past billing invoices.",
    icon: <FileText size={15} />,
    adminOnly: true,
    to: routes.settings_invoices,
  },
  {
    id: "integrations",
    label: "Integrations & API",
    subtitle: "API keys, webhook endpoints, and connected OAuth apps.",
    icon: <Plug size={15} />,
    adminOnly: true,
    to: routes.settings_integrations,
  },
  {
    id: "organization",
    label: "Workspace",
    subtitle: "Organization name, logo, timezone, and data region.",
    icon: <Building2 size={15} />,
    adminOnly: true,
    to: routes.settings_organization,
  },
  {
    id: "data",
    label: "Privacy & Data",
    subtitle: "GDPR export, cookie preferences, audit log, and account deletion.",
    icon: <Database size={15} />,
    to: routes.settings_data,
  },
  {
    id: "rbac",
    label: "Access Control",
    subtitle: "Module visibility, data modification rights, and role-based permissions.",
    icon: <ShieldCheck size={15} />,
    adminOnly: true,
    to: routes.settings_rbac,
  },
  {
    id: "danger",
    label: "Danger Zone",
    subtitle: "Transfer ownership, delete workspace, and irreversible actions.",
    icon: <AlertTriangle size={15} />,
    adminOnly: true,
    to: routes.settings_danger,
  },
]

/* ── Page ────────────────────────────────────────────────────── */
export function SettingsPage({ section: sectionProp }) {
  const { user } = useAuth()
  const isAdmin = user?.role === "admin" || user?.role === "manager"
  const location = useLocation()

  const [activeSection, setActiveSection] = useState("profile")
  const [dirty, setDirty] = useState(false)
  const [saving, setSaving] = useState(false)
  const [toast, setToast] = useState(null)

  const filteredTabs = useMemo(() => TABS.filter(t => !t.adminOnly || isAdmin), [isAdmin])

  const markDirty = useCallback(() => setDirty(true), [])
  const showToast = useCallback((msg, type = "success") => setToast({ msg, type, id: Date.now() }), [])

  useEffect(() => {
    const section = sectionProp || new URLSearchParams(location.search).get("section")
    if (!section) return
    const match = filteredTabs.find(s => s.id === section)
    if (match) setActiveSection(match.id)
  }, [location.search, sectionProp, filteredTabs])

  const handleSave = async () => {
    setSaving(true)
    await new Promise(r => setTimeout(r, 800))
    setSaving(false)
    setDirty(false)
    showToast("Changes saved.")
  }

  const activeSub = filteredTabs.find(s => s.id === activeSection) || filteredTabs[0]

  const Loader = () => (
    <div className="flex items-center justify-center py-20">
      <div className="w-8 h-8 border-2 border-indigo-100 dark:border-slate-800 border-t-indigo-600 dark:border-t-indigo-500 rounded-full animate-spin" />
    </div>
  )

  return (
    <div className="flex min-h-screen bg-bg dark:bg-slate-950/20">

      {/* ── Sidebar ──────────────────────────────────────────────── */}
      <aside className="w-[280px] shrink-0 border-r border-stroke dark:border-slate-800 bg-surface dark:bg-slate-900/40 py-10 sticky top-0 h-screen overflow-y-auto">
        <div className="px-8 pb-6 text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-[0.2em]">
          {isAdmin ? "Settings" : "My Settings"}
        </div>
        <nav className="flex flex-col gap-1 px-4">
          {filteredTabs.map(tab => {
            const isActive = activeSection === tab.id
            return (
              <button
                key={tab.id}
                onClick={() => setActiveSection(tab.id)}
                className={`flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-bold transition-all ${
                  isActive 
                    ? "bg-indigo-50 dark:bg-indigo-900/20 text-indigo-600 dark:text-indigo-400 shadow-sm shadow-indigo-100/20 dark:shadow-none" 
                    : "text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800/40 hover:text-slate-900 dark:hover:text-white"
                }`}
              >
                <span className={`${isActive ? "text-indigo-600 dark:text-indigo-400" : "text-slate-400 dark:text-slate-500"} shrink-0`}>
                  {tab.icon}
                </span>
                {tab.label}
              </button>
            )
          })}
        </nav>
      </aside>

      {/* ── Content ──────────────────────────────────────────────── */}
      <main className="flex-1 px-14 py-12 overflow-y-auto">

        {/* Breadcrumb */}
        <div className="flex items-center gap-2 text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-[0.2em] mb-10">
          <span className="opacity-50">Settings</span>
          <ChevronRight size={12} className="opacity-30" />
          <span className="text-indigo-600 dark:text-indigo-400">{activeSub?.label}</span>
        </div>

        {/* Animated section */}
        <AnimatePresence mode="wait">
          <motion.div
            key={activeSection}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.2, ease: "easeOut" }}
          >
            <Suspense fallback={<Loader />}>
              {activeSection === "profile"       && <ProfileSection markDirty={markDirty} showToast={showToast} Field={Field} SectionHeader={SectionHeader} />}
              {activeSection === "security"      && <AccountSecuritySection markDirty={markDirty} showToast={showToast} Field={Field} SectionHeader={SectionHeader} />}
              {activeSection === "appearance"    && <AppearanceSection showToast={showToast} SectionHeader={SectionHeader} />}
              {activeSection === "notifications" && <NotificationsSection showToast={showToast} SectionHeader={SectionHeader} />}
              {activeSection === "billing"       && <BillingSection showToast={showToast} SectionHeader={SectionHeader} />}
              {activeSection === "people"        && <MembersSettingsSection />}
              {activeSection === "team"          && <TeamMembersSection showToast={showToast} SectionHeader={SectionHeader} />}
              {activeSection === "invoices"      && <InvoicesSection />}
              {activeSection === "integrations"  && <IntegrationsApiSection showToast={showToast} SectionHeader={SectionHeader} />}
              {activeSection === "organization"  && <WorkspaceSection showToast={showToast} SectionHeader={SectionHeader} />}
              {activeSection === "data"          && <PrivacyDataSection showToast={showToast} SectionHeader={SectionHeader} />}
              {activeSection === "rbac"          && <AccessControlSection />}
              {activeSection === "danger"        && <DangerZoneSection showToast={showToast} SectionHeader={SectionHeader} />}
            </Suspense>
          </motion.div>
        </AnimatePresence>

        {/* Save bar */}
        <AnimatePresence>
          {dirty && (
            <motion.div
              initial={{ y: 80, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: 80, opacity: 0 }}
              className="fixed bottom-10 left-1/2 -translate-x-1/2 z-50"
            >
              <div className="flex items-center gap-6 px-6 py-4 bg-surface dark:bg-slate-900 border border-stroke dark:border-slate-800 rounded-2xl shadow-[0_20px_50px_rgba(0,0,0,0.3)] backdrop-blur-xl">
                <div className="flex items-center gap-3">
                  <div className="w-2.5 h-2.5 rounded-full bg-amber-500 animate-pulse shadow-[0_0_10px_rgba(245,158,11,0.5)]" />
                  <span className="text-sm font-bold text-slate-900 dark:text-white">You have unsaved changes</span>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => setDirty(false)}
                    className="px-4 py-2 text-xs font-black uppercase tracking-widest text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white transition-colors"
                  >
                    Discard
                  </button>
                  <button
                    onClick={handleSave}
                    disabled={saving}
                    className="flex items-center gap-2 px-6 py-2 bg-indigo-600 dark:bg-indigo-500 text-white text-xs font-black uppercase tracking-widest rounded-xl shadow-lg shadow-indigo-600/20 hover:bg-indigo-700 transition-all disabled:opacity-50"
                  >
                    {saving ? <RefreshCcw size={14} className="animate-spin" /> : <Save size={14} />}
                    {saving ? "Saving..." : "Save Changes"}
                  </button>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {toast && <Toast key={toast.id} message={toast.msg} type={toast.type} onDismiss={() => setToast(null)} />}
      </main>
    </div>
  )
}
