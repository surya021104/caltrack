import { useEffect, useMemo, useRef, useState } from "react"
import { NavLink, Outlet, useLocation, useNavigate } from "react-router-dom"

import { isOffline } from "../../api/client.js"
import { useAuth } from "../../state/auth/useAuth.js"
import { routes } from "../routes.js"
import { ThemeToggle } from "./ThemeToggle.jsx"
import { CommandPalette } from "./CommandPalette.jsx"
import { NotificationCenter } from "./NotificationCenter.jsx"
import { CalTrackLogo } from "../components/CalTrackLogo.jsx"
import { apiRequest, unwrapResults } from "../../api/client.js"
import { NotificationService } from "../../utils/notifications.js"

import {
  Home,
  Clock,
  CheckSquare,
  CalendarDays,
  Banknote,
  CalendarRange,
  Users,
  BarChart3,
  MapPin,
  Settings,
  Search,
  LogOut,
  User,
  SlidersHorizontal,
  MoreHorizontal,
  CreditCard,
  X,
  ChevronDown,
  ChevronUp,
  ChevronLeft,
  ChevronRight,
  History,
  Sun,
  Briefcase,
  Tag,
  Plug,
  Timer,
  Rocket,
  Bell,
  ShieldCheck,
  ScrollText,
  Workflow,
  Shield,
  Smartphone,
  Palette,
  Terminal,
  Database,
  ShieldAlert,
} from "lucide-react"

const NAV = [
  { label: "Get Started", to: routes.get_started, icon: <Rocket size={18} strokeWidth={2.5} color="#8B5CF6" /> },
  { label: "Dashboard", to: routes.dashboard, icon: <Home size={18} strokeWidth={2.5} color="#2563EB" /> },
  { label: "Locations", to: routes.locations, icon: <MapPin size={18} strokeWidth={2.5} color="#6366F1" /> },
  { label: "Live Tracking", to: routes.live_locations, icon: <MapPin size={18} strokeWidth={3} color="#F97316" />, adminOnly: true },
  { label: "Time", to: routes.time, icon: <Clock size={18} strokeWidth={2.5} color="#06B6D4" /> },
  { label: "Tasks", to: routes.tasks, icon: <CheckSquare size={18} strokeWidth={2.5} color="#10B981" /> },
  { label: "Leaves", to: routes.leaves, icon: <CalendarDays size={18} strokeWidth={2.5} color="#F43F5E" /> },
  { label: "Payroll", to: routes.payroll, icon: <Banknote size={18} strokeWidth={2.5} color="#EAB308" /> },
  { label: "Scheduling", to: routes.scheduling, icon: <CalendarRange size={18} strokeWidth={2.5} color="#EC4899" /> },
  { label: "Employees", to: routes.employees, icon: <Users size={18} strokeWidth={2.5} color="#A855F7" />, adminOnly: true },
  { label: "Reports", to: routes.reports, icon: <BarChart3 size={18} strokeWidth={2.5} color="#F59E0B" />, adminOnly: true },
  { label: "Compliance", to: routes.compliance, icon: <ShieldAlert size={18} strokeWidth={2.5} color="#E94560" />, adminOnly: true },
  {
    label: "Settings",
    to: routes.settings,
    icon: <Settings size={18} strokeWidth={2.5} color="#64748B" />,
    children: [
      { label: "My Profile", to: routes.settings_profile, icon: <User size={17} strokeWidth={2.2} color="#64748B" /> },
      { label: "Preferences", to: routes.settings_preferences, icon: <SlidersHorizontal size={17} strokeWidth={2.2} color="#64748B" /> },
      { label: "People", to: routes.settings_people, icon: <Users size={17} strokeWidth={2.2} color="#A855F7" />, adminOnly: true },
      { label: "Time Tracking", to: routes.settings_timetracking, icon: <Clock size={17} strokeWidth={2.2} color="#06B6D4" /> },
      { label: "Attendance Policies", to: routes.settings_attendance, icon: <SlidersHorizontal size={17} strokeWidth={2.2} color="#10B981" /> },
      { label: "Work Schedules", to: routes.settings_schedules, icon: <Sun size={17} strokeWidth={2.2} color="#F59E0B" /> },
      { label: "Shift Planning", to: routes.settings_shiftplanner, icon: <CalendarRange size={17} strokeWidth={2.2} color="#EC4899" />, adminOnly: true },
      { label: "Time Off & Holidays", to: routes.settings_holidays, icon: <Briefcase size={17} strokeWidth={2.2} color="#F43F5E" /> },
      { label: "Payroll", to: routes.settings_payroll, icon: <Banknote size={17} strokeWidth={2.2} color="#EAB308" />, adminOnly: true },
      { label: "Expenses", to: routes.settings_expenses, icon: <CreditCard size={17} strokeWidth={2.2} color="#F97316" />, adminOnly: true },
      { label: "Approval Workflows", to: routes.settings_workflows, icon: <Workflow size={17} strokeWidth={2.2} color="#2563EB" />, adminOnly: true },
      { label: "Productivity", to: routes.settings_productivity, icon: <Timer size={17} strokeWidth={2.2} color="#06B6D4" />, adminOnly: true },
      { label: "Reports & Analytics", to: routes.settings_reports, icon: <BarChart3 size={17} strokeWidth={2.2} color="#F59E0B" />, adminOnly: true },
      { label: "Notifications", to: routes.settings_notifications, icon: <Bell size={17} strokeWidth={2.2} color="#6366F1" /> },
      { label: "Security", to: routes.settings_security, icon: <Shield size={17} strokeWidth={2.2} color="#10B981" /> },
      { label: "Permissions / RBAC", to: routes.settings_rbac, icon: <ShieldCheck size={17} strokeWidth={2.2} color="#10B981" />, adminOnly: true },
      { label: "Audit Log", to: routes.settings_audit, icon: <ScrollText size={17} strokeWidth={2.2} color="#64748B" />, adminOnly: true },
      { label: "Devices", to: routes.settings_devices, icon: <Smartphone size={17} strokeWidth={2.2} color="#64748B" />, adminOnly: true },
      { label: "Location Tracking", to: routes.settings_location, icon: <MapPin size={17} strokeWidth={2.2} color="#F97316" />, adminOnly: true },
      { label: "Branding", to: routes.settings_branding, icon: <Palette size={17} strokeWidth={2.2} color="#EC4899" />, adminOnly: true },
      { label: "Organization", to: routes.settings_organization, icon: <Settings size={17} strokeWidth={2.2} color="#64748B" />, adminOnly: true },
      { label: "Integrations", to: routes.settings_integrations, icon: <Plug size={17} strokeWidth={2.2} color="#2563EB" /> },
      { label: "Developer / API", to: routes.settings_developer, icon: <Terminal size={17} strokeWidth={2.2} color="#64748B" />, adminOnly: true },
      { label: "Billing", to: routes.settings_billing, icon: <CreditCard size={17} strokeWidth={2.2} color="#EAB308" />, adminOnly: true },
      { label: "Data & Backups", to: routes.settings_data, icon: <Database size={17} strokeWidth={2.2} color="#6366F1" />, adminOnly: true },
    ],
  },
]

const THEME_STORAGE_KEY = "quicktims.theme"


function applyTheme(theme) {
  document.documentElement.dataset.theme = theme
  localStorage.setItem(THEME_STORAGE_KEY, theme)
  window.dispatchEvent(new CustomEvent("quicktims:theme", { detail: theme }))
}

function getInitialTheme() {
  const stored = localStorage.getItem(THEME_STORAGE_KEY)
  if (stored === "dark" || stored === "light") return stored
  const ds = document.documentElement.dataset.theme
  if (ds === "dark" || ds === "light") return ds
  return window.matchMedia?.("(prefers-color-scheme: dark)").matches ? "dark" : "light"
}

function initials(username) {
  const s = String(username || "").trim()
  if (!s) return "U"
  const parts = s.split(/\s+/).filter(Boolean)
  const first = (parts[0] || "").slice(0, 1)
  const second = (parts.length > 1 ? parts[1] : parts[0] || "").slice(1, 2)
  return (first + second).toUpperCase()
}

function displayName(username) {
  const s = String(username || "").trim()
  if (!s) return ""
  return s.charAt(0).toUpperCase() + s.slice(1)
}

/* ── Sidebar Tooltip (JS portal, never clipped) ──────────────── */
function SidebarTooltip({ tooltip }) {
  if (!tooltip) return null
  return (
    <div 
      className="fixed z-[999999] bg-slate-900/95 backdrop-blur-md text-white px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap shadow-xl border border-white/10 pointer-events-none transition-all"
      style={{ top: tooltip.y, left: tooltip.x + 12, transform: "translateY(-50%)" }}
    >
      {tooltip.label}
    </div>
  )
}

/* ── Submenu Flyout ────────────────────────────────────────── */
function SubmenuFlyout({ flyout, onMouseEnter, onMouseLeave, user, onClose }) {
  if (!flyout) return null
  const isBottom = flyout.bottom !== null
  return (
    <div
      className="fixed z-[999998] bg-transparent pl-5 pointer-events-auto"
      style={{
        top: isBottom ? "auto" : flyout.y,
        bottom: isBottom ? flyout.bottom : "auto",
        left: flyout.x - 12
      }}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
    >
      <div className="bg-white text-slate-900 p-2 rounded-xl min-w-[200px] shadow-[0_20px_25px_-5px_rgba(0,0,0,0.1),0_8px_10px_-6px_rgba(0,0,0,0.1)] border border-slate-200/60 flex flex-col gap-0.5">
        <div className="px-3 py-2 text-[11px] font-extrabold text-slate-500 uppercase tracking-widest">
          {flyout.label}
        </div>
        {flyout.children
          .filter(child => !child.adminOnly || user?.role === 'admin')
          .map((child) => (
            <NavLink
              key={child.to}
              to={child.to}
              className={({ isActive }) => `flex items-center px-3 py-2.5 rounded-lg text-[13.5px] font-semibold transition-all ${isActive ? 'bg-indigo-50 text-indigo-600' : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'}`}
              onClick={onClose}
            >
              {child.label}
            </NavLink>
        ))}
      </div>
    </div>
  )
}


export function AppShell() {
  const { user, logout } = useAuth()
  const location = useLocation()
  const navigate = useNavigate()
  const [offline, setOffline] = useState(false)
  const [cmdOpen, setCmdOpen] = useState(false)
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)
  const [profileOpen, setProfileOpen] = useState(false)
  const [prefTab, setPrefTab] = useState("general")
  const [theme, setTheme] = useState(() => getInitialTheme())
  const [workspaceMenuOpen, setWorkspaceMenuOpen] = useState(false)
  const [orgName, setOrgName] = useState(() => localStorage.getItem("quicktims.orgName") || "")
  const [settingsExpanded, setSettingsExpanded] = useState(true)
  const [tooltip, setTooltip] = useState(null) // { label, x, y }
  const [flyout, setFlyout] = useState(null) // { label, children, x, y }
  const flyoutTimerRef = useRef(null)

  const showTooltip = (label, e) => {
    if (!sidebarCollapsed) return
    const rect = e.currentTarget.getBoundingClientRect()
    setTooltip({ label, x: rect.right, y: rect.top + rect.height / 2 })
  }
  const hideTooltip = () => setTooltip(null)

  const showFlyout = (item, e) => {
    if (!sidebarCollapsed || !item.children) return
    if (flyoutTimerRef.current) clearTimeout(flyoutTimerRef.current)
    const rect = e.currentTarget.getBoundingClientRect()
    const isBottomHalf = rect.top > window.innerHeight / 2

    setFlyout({
      label: item.label,
      children: item.children,
      x: rect.right,
      y: isBottomHalf ? null : rect.top,
      bottom: isBottomHalf ? window.innerHeight - rect.bottom : null,
    })
  }

  const hideFlyout = () => {
    flyoutTimerRef.current = setTimeout(() => {
      setFlyout(null)
    }, 1200)
  }

  const cancelHideFlyout = () => {
    if (flyoutTimerRef.current) clearTimeout(flyoutTimerRef.current)
  }

  // NOTE: orgName redirect removed — App.jsx routing already guards AppShell
  // with user && user.companyId. Redirecting to /onboarding here caused an
  // infinite loop because /onboarding immediately redirects back to /login.

  const [prefs, setPrefs] = useState(() => {
    try {
      const raw = localStorage.getItem("quicktims.prefs")
      const obj = raw ? JSON.parse(raw) : {}
      return {
        language: obj.language || "English",
        groupTimeEntries: obj.groupTimeEntries ?? true,
        compactProjectList: obj.compactProjectList || "Collapse if too many projects",
        compactProjectLimit: obj.compactProjectLimit || 50,
        taskFilter: obj.taskFilter ?? false,
        dateFormat: obj.dateFormat || "DD/MM/YYYY",
        timeFormat: obj.timeFormat || "24-hour",
        dayStart: obj.dayStart || "09:00",
      }
    } catch {
      return {
        language: "English",
        groupTimeEntries: true,
        compactProjectList: "Collapse if too many projects",
        compactProjectLimit: 50,
        taskFilter: false,
        dateFormat: "DD/MM/YYYY",
        timeFormat: "24-hour",
        dayStart: "09:00",
      }
    }
  })

  const [emailPrefs, setEmailPrefs] = useState(() => {
    try {
      const raw = localStorage.getItem("quicktims.emailPrefs")
      const obj = raw ? JSON.parse(raw) : {}
      return {
        newsletter: !!obj.newsletter,
        onboarding: obj.onboarding ?? true,
        weeklyReport: !!obj.weeklyReport,
        longRunningTimer: !!obj.longRunningTimer,
        scheduledReports: obj.scheduledReports ?? true,
        approval: obj.approval ?? true,
        timeOff: obj.timeOff ?? true,
        alerts: obj.alerts ?? true,
        reminders: obj.reminders ?? true,
        schedule: obj.schedule ?? true,
        invoices: !!obj.invoices,
      }
    } catch {
      return {
        newsletter: false,
        onboarding: true,
        weeklyReport: false,
        longRunningTimer: false,
        scheduledReports: true,
        approval: true,
        timeOff: true,
        alerts: true,
        reminders: true,
        schedule: true,
        invoices: false,
      }
    }
  })

  const [apiKeys, setApiKeys] = useState(() => {
    try {
      const raw = localStorage.getItem("quicktims.apiKeys")
      const xs = raw ? JSON.parse(raw) : []
      return Array.isArray(xs) ? xs : []
    } catch {
      return []
    }
  })
  const [webhooks, setWebhooks] = useState(() => {
    try {
      const raw = localStorage.getItem("quicktims.webhooks")
      const xs = raw ? JSON.parse(raw) : []
      return Array.isArray(xs) ? xs : []
    } catch {
      return []
    }
  })
  const [workspace, setWorkspace] = useState(() => localStorage.getItem("quicktims.orgName") || "ok")

  const [apiKeyModalOpen, setApiKeyModalOpen] = useState(false)
  const [apiKeyName, setApiKeyName] = useState("")
  const [apiKeyNameErr, setApiKeyNameErr] = useState("")

  const [webhookModalOpen, setWebhookModalOpen] = useState(false)
  const [webhookName, setWebhookName] = useState("")
  const [webhookUrl, setWebhookUrl] = useState("")
  const [webhookEvent, setWebhookEvent] = useState("")
  const [webhookErr, setWebhookErr] = useState("")

  useEffect(() => {
    const t = setInterval(() => setOffline(isOffline()), 1500)
    return () => clearInterval(t)
  }, [])

  // Auto-logout when JWT expires and refresh fails
  useEffect(() => {
    function handleSessionExpired() {
      logout()
      navigate("/login", { replace: true })
    }
    window.addEventListener("quicktims:session-expired", handleSessionExpired)
    return () => window.removeEventListener("quicktims:session-expired", handleSessionExpired)
  }, [logout, navigate])

  useEffect(() => {
    function syncOrg() {
      const name = localStorage.getItem("quicktims.orgName") || ""
      setOrgName(name)
      setWorkspace(name || "ok")
    }
    window.addEventListener("storage", syncOrg)
    window.addEventListener("quicktims:orgName", syncOrg)
    return () => {
      window.removeEventListener("storage", syncOrg)
      window.removeEventListener("quicktims:orgName", syncOrg)
    }
  }, [])

  // --- GPS Auto Clock-in/out & Reminders ---
  useEffect(() => {
    if (location.pathname.startsWith("/settings")) {
      setSettingsExpanded(true)
    }
  }, [location.pathname])

  useEffect(() => {
    if (!user) return

    NotificationService.requestPermission()

    const calculateDistance = (lat1, lon1, lat2, lon2) => {
      const R = 6371e3; // metres
      const p1 = lat1 * Math.PI / 180;
      const p2 = lat2 * Math.PI / 180;
      const dp = (lat2 - lat1) * Math.PI / 180;
      const dl = (lon2 - lon1) * Math.PI / 180;

      const a = Math.sin(dp / 2) * Math.sin(dp / 2) + Math.cos(p1) * Math.cos(p2) * Math.sin(dl / 2) * Math.sin(dl / 2);
      const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
      return Math.round(R * c);
    }

    let lastReminderDate = null
    let autoClockedInToday = false
    let autoClockedOutToday = false

    const checkGeofence = async () => {
      try {
        const now = new Date()
        const currentHour = now.getHours()
        const todayStr = now.toDateString()

        // 1. Get current session
        const sessionRes = await apiRequest("/time/current-session/")
        const isActive = sessionRes && sessionRes.active

        // 2. Get locations
        let locationsFetch = []
        try {
          locationsFetch = unwrapResults(await apiRequest("/time/locations/"))
        } catch (e) { }

        // Filter valid auto-locations (radius >= 300)
        const validLocations = (Array.isArray(locationsFetch) ? locationsFetch : []).filter(l => l.geofence_radius >= 300)

        // Reset daily flags
        if (lastReminderDate !== todayStr) {
          lastReminderDate = todayStr
          autoClockedInToday = false
          autoClockedOutToday = false
        }

        // 3. Time-based evening reminder (fallback)
        if (currentHour >= 18 && isActive && !autoClockedOutToday) {
          NotificationService.sendClockOutReminder()
          autoClockedOutToday = true
        }

        // 4. GPS Auto Clock / Reminders
        if (navigator.geolocation && validLocations.length > 0) {
          navigator.geolocation.getCurrentPosition(
            async (pos) => {
              const { latitude, longitude } = pos.coords

              let insideAny = false
              for (const loc of validLocations) {
                const dist = calculateDistance(latitude, longitude, parseFloat(loc.lat), parseFloat(loc.lng))
                if (dist <= loc.geofence_radius) {
                  insideAny = true
                  break
                }
              }

              if (insideAny && !isActive && !autoClockedInToday) {
                // Entered Geofence - Auto Clock In
                try {
                  await apiRequest("/time/clock-in/", { method: "POST", json: { notes: "Auto clock-in via Geofence" } })
                  NotificationService.send("Auto Clock-in", "You entered the workplace geofence. Clocked in successfully.")
                  autoClockedInToday = true
                } catch (e) {
                  NotificationService.send("GPS Reminder", "You are at work. Remember to clock in!")
                }
              } else if (!insideAny && isActive && !autoClockedOutToday) {
                // Exited Geofence - Auto Clock Out
                try {
                  await apiRequest("/time/clock-out/", { method: "POST" })
                  NotificationService.send("Auto Clock-out", "You left the workplace geofence. Clocked out successfully.")
                  autoClockedOutToday = true
                  // Reset autoClockedInToday so they can auto clock back in later if they return
                  autoClockedInToday = false
                } catch (e) {
                  NotificationService.send("GPS Reminder", "You left work. Remember to clock out!")
                }
              }
            },
            (err) => console.debug("GPS Check failed", err),
            { enableHighAccuracy: true, maximumAge: 0, timeout: 15000 }
          )
        }
      } catch (err) {
        console.error("Geofence check failed", err)
      }
    }

    // Check every 5 minutes for geofence entry/exit (reduces DB connection pressure)
    const timer = setInterval(checkGeofence, 300000)
    checkGeofence() // Initial check

    return () => clearInterval(timer)
  }, [user])


  useEffect(() => {
    applyTheme(theme)
  }, [theme])

  useEffect(() => {
    localStorage.setItem("quicktims.prefs", JSON.stringify(prefs))
  }, [prefs])

  useEffect(() => {
    localStorage.setItem("quicktims.emailPrefs", JSON.stringify(emailPrefs))
  }, [emailPrefs])

  useEffect(() => {
    localStorage.setItem("quicktims.apiKeys", JSON.stringify(apiKeys))
  }, [apiKeys])

  useEffect(() => {
    localStorage.setItem("quicktims.webhooks", JSON.stringify(webhooks))
  }, [webhooks])

  useEffect(() => {
    setWorkspaceMenuOpen(false)
  }, [location.pathname])

  useEffect(() => {
    if (!workspaceMenuOpen) return

    function onKeyDown(e) {
      if (e.key === "Escape") {
        setWorkspaceMenuOpen(false)
      }
    }

    function onPointerDown(e) {
      const t = e.target
      if (!(t instanceof Element)) return
      if (t.closest(".workspaceMenuWrap")) return
      setWorkspaceMenuOpen(false)
    }

    window.addEventListener("keydown", onKeyDown)
    window.addEventListener("pointerdown", onPointerDown)
    return () => {
      window.removeEventListener("keydown", onKeyDown)
      window.removeEventListener("pointerdown", onPointerDown)
    }
  }, [workspaceMenuOpen])

  if (!user) return null

  const items = NAV.filter((i) => !i.adminOnly || user.role === "admin")
  const email = `${user.email}`

  function randKey(len = 32) {
    const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"
    const arr = new Uint8Array(len)
    if (globalThis.crypto?.getRandomValues) globalThis.crypto.getRandomValues(arr)
    else {
      for (let i = 0; i < len; i++) arr[i] = Math.floor(Math.random() * 256)
    }
    let out = ""
    for (let i = 0; i < len; i++) out += alphabet[arr[i] % alphabet.length]
    return out
  }

  function openApiKeyModal() {
    setApiKeyName("")
    setApiKeyNameErr("")
    setApiKeyModalOpen(true)
  }

  function generateApiKey() {
    const name = apiKeyName.trim()
    if (!name) {
      setApiKeyNameErr("Name is mandatory")
      return
    }
    const createdAt = new Date().toISOString()
    const item = { id: `${Date.now()}`, name, createdAt, key: randKey(36) }
    setApiKeys((xs) => [item, ...xs])
    setApiKeyModalOpen(false)
  }

  function openWebhookModal() {
    setWebhookName("")
    setWebhookUrl("")
    setWebhookEvent("")
    setWebhookErr("")
    setWebhookModalOpen(true)
  }

  function createWebhook() {
    const name = webhookName.trim()
    const url = webhookUrl.trim()
    const event = webhookEvent.trim()
    if (!name) return setWebhookErr("Name is mandatory")
    if (!url) return setWebhookErr("Endpoint URL is mandatory")
    if (!event) return setWebhookErr("Event is mandatory")
    const createdAt = new Date().toISOString()
    const item = { id: `${Date.now()}`, workspace, name, url, event, createdAt }
    setWebhooks((xs) => [item, ...xs])
    setWebhookModalOpen(false)
  }

  return (
    <div className="flex flex-col h-screen w-full overflow-hidden bg-slate-50 text-slate-900 font-sans">
      <CommandPalette open={cmdOpen} setOpen={setCmdOpen} />
      {/* ── Topbar ───────────────────────────── */}
      <header className="flex items-center justify-between h-[64px] px-6 bg-white border-b border-slate-200 z-50 shrink-0">
        {/* Left: Brand */}
        <div className="flex items-center gap-6">
          <div className="flex items-center gap-3">
            <CalTrackLogo size="sm" />
            <span className="font-extrabold text-slate-900 text-lg truncate max-w-[150px] sm:max-w-[300px] tracking-tight" title={orgName || workspace}>
              {orgName || workspace}
            </span>
            <div className="relative workspaceMenuWrap">
              <button
                type="button"
                className="flex items-center justify-center w-8 h-8 rounded-lg hover:bg-slate-100 text-slate-500 hover:text-slate-800 transition-colors focus:outline-none"
                aria-label="Workspace menu"
                title="Workspace menu"
                onClick={() => setWorkspaceMenuOpen((v) => !v)}
              >
                <MoreHorizontal size={18} strokeWidth={2.5} />
              </button>
              {workspaceMenuOpen && (
                <div className="absolute top-full left-0 mt-2 w-60 bg-white rounded-xl shadow-xl border border-slate-200/60 py-2 z-[99999]">
                  <div className="px-3 py-2 text-xs font-bold text-slate-400 uppercase tracking-wider">Workspace</div>
                  <div className="px-4 py-2 text-[13px] text-slate-500 font-medium">
                    {orgName || workspace}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Right: Actions & Profile */}
        <div className="flex items-center gap-4">
          {offline && (
            <span className="flex items-center gap-2 px-3 py-1.5 bg-amber-50 border border-amber-200 text-amber-700 text-xs font-bold rounded-full" title="Backend unreachable — showing demo data">
              <span className="w-2 h-2 rounded-full bg-amber-500 animate-pulse"></span> Demo Mode
            </span>
          )}

          <button
            type="button"
            className="hidden md:flex items-center gap-3 px-3 py-1.5 bg-slate-50 hover:bg-slate-100 border border-slate-200 rounded-lg text-sm text-slate-500 transition-colors"
            onClick={() => setCmdOpen(true)}
            title="Search command palette (⌘K)"
          >
            <Search size={15} />
            <span className="hidden lg:inline-block font-medium">Search everywhere...</span>
            <span className="px-1.5 py-0.5 text-[10px] font-bold bg-white border border-slate-200 rounded text-slate-400">⌘K</span>
          </button>

          <div className="w-px h-6 bg-slate-200 mx-1"></div>

          <div className="flex items-center gap-1">
            <NotificationCenter />
            <ThemeToggle />
          </div>

          <div className="w-px h-6 bg-slate-200 mx-1"></div>

          <div
            className="relative profileMenuWrap"
            onMouseEnter={() => setProfileOpen(true)}
            onMouseLeave={() => setProfileOpen(false)}
          >
            <button className="flex items-center justify-center w-9 h-9 rounded-full bg-indigo-100 border-2 border-white shadow-sm hover:ring-2 hover:ring-indigo-500/30 transition-all focus:outline-none" type="button" aria-label="Account menu" title="Account">
              <div className="relative w-full h-full flex items-center justify-center rounded-full">
                <span className="text-indigo-700 font-bold text-sm">{user.username.charAt(0).toUpperCase()}</span>
                <div className="absolute bottom-0 right-0 w-2.5 h-2.5 bg-emerald-500 border-2 border-white rounded-full"></div>
              </div>
            </button>

            {profileOpen && (
              <div className="absolute top-full right-0 mt-2 w-72 bg-white rounded-xl shadow-xl border border-slate-200/60 z-[99999] overflow-hidden">
                <div className="p-5 bg-slate-50 border-b border-slate-200/60">
                  <div className="flex items-center gap-4">
                    <div className="flex items-center justify-center w-12 h-12 rounded-full bg-indigo-600 text-white text-lg font-bold shadow-sm">{initials(user.username)}</div>
                    <div>
                      <div className="font-bold text-slate-900">{displayName(user.username)}</div>
                      <div className="text-xs text-slate-500 truncate max-w-[160px]">{email}</div>
                    </div>
                  </div>
                  <div className={`inline-flex items-center gap-1.5 mt-4 px-2.5 py-1 rounded-full text-[10px] font-extrabold uppercase tracking-wider ${user.role === 'admin' ? 'bg-violet-100 text-violet-700' : 'bg-blue-100 text-blue-700'}`}>
                    <span className={`w-1.5 h-1.5 rounded-full ${user.role === 'admin' ? 'bg-violet-500' : 'bg-blue-500'}`}></span>
                    {user.role === "admin" ? "Administrator" : "Employee"}
                  </div>
                </div>

                <div className="p-2 flex flex-col gap-1">
                  <button
                    type="button"
                    className="flex items-center w-full px-3 py-2 text-sm font-medium text-red-600 hover:bg-red-50 hover:text-red-700 rounded-lg transition-colors"
                    onClick={() => {
                      setProfileOpen(false)
                      logout()
                    }}
                  >
                    <LogOut size={16} className="mr-3" /> Log out
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </header>

      {/* Modals removed for sidebar-only settings access */}

      {/* ── Body ─────────────────────────────── */}
      <div className="flex flex-1 overflow-hidden">
        {/* Sidebar */}
        <aside className={`flex flex-col bg-white border-r border-slate-200 transition-all duration-300 z-40 ${sidebarCollapsed ? 'w-[72px]' : 'w-[260px]'}`} onMouseLeave={() => { hideTooltip(); hideFlyout(); }}>
          <nav className="flex-1 overflow-y-auto py-4 px-3 flex flex-col gap-1.5 scrollbar-hide">
            {items.map((item) => (
              <div key={item.label} className="flex flex-col gap-1">
                {item.children ? (
                  <>
                    <button
                      type="button"
                      className={`flex items-center px-3 py-2.5 rounded-lg transition-all group ${location.pathname.startsWith(item.to) ? 'bg-indigo-50 text-indigo-700 font-semibold' : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900 font-medium'}`}
                      onClick={(e) => {
                        if (sidebarCollapsed) {
                          navigate(item.to)
                          if (flyout) setFlyout(null)
                          else showFlyout(item, e)
                        } else {
                          navigate(item.to)
                          setSettingsExpanded(true)
                        }
                      }}
                      onMouseEnter={(e) => { showTooltip(item.label, e); showFlyout(item, e); }}
                      onMouseLeave={() => { hideTooltip(); hideFlyout(); }}
                    >
                      <span className={`flex items-center justify-center transition-transform group-hover:scale-110 ${sidebarCollapsed ? 'mx-auto' : 'mr-3'}`}>
                        {item.icon}
                        {sidebarCollapsed && <span className="absolute right-2 top-1/2 -translate-y-1/2 w-1.5 h-1.5 rounded-full bg-indigo-400"></span>}
                      </span>
                      {!sidebarCollapsed && <span className="flex-1 text-left text-sm">{item.label}</span>}
                      {!sidebarCollapsed && (
                        <span className="text-slate-400">
                          {settingsExpanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                        </span>
                      )}
                    </button>
                    {!sidebarCollapsed && settingsExpanded && (
                      <div className="flex flex-col gap-0.5 pl-9 mt-1 mb-2 border-l-2 border-slate-100 ml-4">
                        {item.children
                          .filter(child => !child.adminOnly || user?.role === 'admin')
                          .map((child) => (
                            <NavLink
                              key={child.to}
                              to={child.to}
                              className={({ isActive }) => `flex items-center px-3 py-2 rounded-lg text-[13px] font-medium transition-all ${isActive ? 'bg-indigo-50 text-indigo-700 font-semibold' : 'text-slate-500 hover:text-slate-900 hover:bg-slate-50'}`}
                            >
                              <span className="mr-2 opacity-70">{child.icon}</span>
                              {child.label}
                            </NavLink>
                          ))}
                      </div>
                    )}
                  </>
                ) : (
                  <NavLink
                    to={item.to}
                    className={({ isActive }) => `flex items-center px-3 py-2.5 rounded-lg transition-all group ${isActive || (item.to !== "/" && location.pathname.startsWith(item.to)) ? 'bg-indigo-50 text-indigo-700 font-semibold' : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900 font-medium'}`}
                    end={item.to === "/"}
                    onMouseEnter={(e) => showTooltip(item.label, e)}
                    onMouseLeave={hideTooltip}
                  >
                    <span className={`flex items-center justify-center transition-transform group-hover:scale-110 ${sidebarCollapsed ? 'mx-auto' : 'mr-3'}`}>
                      {item.icon}
                    </span>
                    {!sidebarCollapsed && <span className="text-sm">{item.label}</span>}
                  </NavLink>
                )}
              </div>
            ))}
          </nav>
          <div className="p-3 border-t border-slate-200 bg-slate-50/50">
            <button
              className="flex items-center justify-center w-full py-2.5 rounded-lg text-slate-500 hover:bg-slate-200/50 hover:text-slate-800 transition-colors"
              onClick={() => { setSidebarCollapsed(!sidebarCollapsed); hideTooltip() }}
              title={sidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"}
            >
              {sidebarCollapsed ? <ChevronRight size={18} /> : <><ChevronLeft size={18} /> <span className="ml-2 text-sm font-semibold">Collapse</span></>}
            </button>
          </div>
        </aside>

        {/* Main Content Area */}
        <main className="flex-1 overflow-y-auto bg-slate-50 relative">
          <Outlet />
        </main>
      </div>

      <SidebarTooltip tooltip={tooltip} />
      <SubmenuFlyout
        flyout={flyout}
        onMouseEnter={cancelHideFlyout}
        onMouseLeave={hideFlyout}
        user={user}
        onClose={() => setFlyout(null)}
      />
    </div>
  )
}
