import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { NavLink, Outlet, useLocation, useNavigate } from "react-router-dom"
import { motion, AnimatePresence } from "framer-motion"

import { isOffline } from "../../api/client.js"
import { useAuth } from "../../state/auth/useAuth.js"
import { routes } from "../routes.js"
import { ThemeToggle } from "./ThemeToggle.jsx"
import ThemeSwitch from "@/components/ui/theme-switch"
import { CommandPalette } from "./CommandPalette.jsx"
import { NotificationCenter } from "./NotificationCenter.jsx"
import { CalTrackLogo } from "../components/CalTrackLogo.jsx"
import { apiRequest, unwrapResults } from "../../api/client.js"
import { NotificationService } from "../../utils/notifications.js"
import { useWebSocket } from "../../hooks/useWebSocket.js"
import { useDispatch } from "react-redux"
import { addSosAlert, addGeofenceBreach } from "../../store/liveLocationSlice.js"

import {
  Home, Clock, CheckSquare, CalendarDays, Banknote, CalendarRange,
  Users, BarChart3, MapPin, Settings, Search, LogOut,
  ChevronLeft, ChevronRight, Rocket, ShieldAlert,
} from "lucide-react"

// Items visible to all authenticated users (employees + admins)
const NAV_SHARED = [
  { label: "Dashboard",  to: routes.dashboard, icon: <Home size={20} />,        color: "#10B981" },
  { label: "Time",       to: routes.time,       icon: <Clock size={20} />,       color: "#F59E0B" },
  { label: "Tasks",      to: routes.tasks,      icon: <CheckSquare size={20} />, color: "#14B8A6" },
  { label: "Leaves",     to: routes.leaves,     icon: <CalendarDays size={20} />,color: "#EC4899" },
  { label: "Settings",   to: routes.settings,   icon: <Settings size={20} />,    color: "#64748B" },
]

// Items visible only to admins/managers
const NAV_ADMIN = [
  { label: "Get Started",   to: routes.get_started,    icon: <Rocket size={20} />,      color: "#0EA5E9" },
  { label: "Locations",     to: routes.locations,      icon: <MapPin size={20} />,      color: "#8B5CF6" },
  { label: "Live Tracking", to: routes.live_locations, icon: <MapPin size={20} />,      color: "#EF4444" },
  { label: "Payroll",       to: routes.payroll,        icon: <Banknote size={20} />,    color: "#6366F1" },
  { label: "Scheduling",    to: routes.scheduling,     icon: <CalendarRange size={20} />,color: "#38BDF8" },
  { label: "Employees",     to: routes.employees,      icon: <Users size={20} />,       color: "#D946EF" },
  { label: "Reports",       to: routes.reports,        icon: <BarChart3 size={20} />,   color: "#FACC15" },
  { label: "Compliance",    to: routes.compliance,     icon: <ShieldAlert size={20} />, color: "#2563EB" },
]

// Full combined NAV — built per role at render time (see `items` memo below)
const NAV = [...NAV_SHARED, ...NAV_ADMIN]

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

function playCriticalAlert() {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)()
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    osc.connect(gain)
    gain.connect(ctx.destination)
    osc.frequency.setValueAtTime(880, ctx.currentTime)
    osc.frequency.exponentialRampToValueAtTime(440, ctx.currentTime + 0.5)
    osc.type = "square"
    gain.gain.setValueAtTime(0.1, ctx.currentTime)
    gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.5)
    osc.start()
    osc.stop(ctx.currentTime + 0.5)
  } catch (e) {
    console.warn("Audio alert failed", e)
  }
}

function SidebarTooltip({ tooltip }) {
  if (!tooltip) return null
  return (
    <div
      className="fixed z-[999999] bg-slate-900 dark:bg-white text-white dark:text-slate-900 px-3 py-1.5 rounded-lg text-xs font-bold whitespace-nowrap shadow-xl border border-white/10 dark:border-black/10 pointer-events-none transition-all animate-in fade-in zoom-in duration-200"
      style={{ top: tooltip.y, left: tooltip.x + 12, transform: "translateY(-50%)" }}
    >
      {tooltip.label}
    </div>
  )
}

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
      <div className="bg-white dark:bg-slate-900 text-slate-900 dark:text-white p-2 rounded-2xl min-w-[220px] shadow-xl border border-slate-200 dark:border-slate-800 flex flex-col gap-1 backdrop-blur-xl animate-in slide-in-from-left-2 duration-200">
        <div className="px-3 py-2 text-[10px] font-bold text-slate-400 uppercase tracking-widest border-b border-slate-100 dark:border-slate-800 mb-1">
          {flyout.label}
        </div>
        {flyout.children
          .filter(child => !child.adminOnly || isAdmin)
          .map((child) => (
            <NavLink
              key={child.to}
              to={child.to}
              className={({ isActive }) => `flex items-center px-3 py-2.5 rounded-xl text-[13px] font-bold transition-all ${isActive ? 'bg-blue-50 dark:bg-blue-500/10 text-blue-600 dark:text-blue-400' : 'text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800 hover:text-slate-900 dark:hover:text-white'}`}
              onClick={onClose}
            >
              <span className="mr-3 opacity-70">{child.icon}</span>
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
  const [sidebarCollapsed, setSidebarCollapsed] = useState(true)
  const [profileOpen, setProfileOpen] = useState(false)
  const [workspaceMenuOpen, setWorkspaceMenuOpen] = useState(false)
  const [orgName, setOrgName] = useState(() => localStorage.getItem("quicktims.orgName") || "")
  const [settingsExpanded, setSettingsExpanded] = useState(true)
  const [tooltip, setTooltip] = useState(null)
  const [flyout, setFlyout] = useState(null)
  const [drillDownParent, setDrillDownParent] = useState(null)
  const flyoutTimerRef = useRef(null)

  const isAdmin = user?.role === "admin" || user?.role === "manager"

  const items = useMemo(() => {
    if (!user) return []
    const isAdminUser = user.role === "admin" || user.role === "manager"
    // Employees only see shared nav; admins see shared + admin items (admin items interleaved naturally)
    return isAdminUser
      ? [...NAV_SHARED.slice(0, 1), ...NAV_ADMIN, ...NAV_SHARED.slice(1)] // dashboard first, then admin, then shared rest
      : NAV_SHARED
  }, [user])

  useEffect(() => {
    localStorage.setItem("caltrack.sidebarCollapsed", sidebarCollapsed)
  }, [sidebarCollapsed])

  useEffect(() => {
    if (location.pathname.startsWith("/settings")) {
      setDrillDownParent(null)
      return
    }
    const parent = items.find(item => item.children && location.pathname.startsWith(item.to))
    if (parent) setDrillDownParent(parent)
  }, [location.pathname, items])

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
    }, 800)
  }

  const cancelHideFlyout = () => {
    if (flyoutTimerRef.current) clearTimeout(flyoutTimerRef.current)
  }

  useEffect(() => {
    const t = setInterval(() => setOffline(isOffline()), 1500)
    return () => clearInterval(t)
  }, [])

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
    }
    window.addEventListener("storage", syncOrg)
    window.addEventListener("quicktims:orgName", syncOrg)
    return () => {
      window.removeEventListener("storage", syncOrg)
      window.removeEventListener("quicktims:orgName", syncOrg)
    }
  }, [])

  useEffect(() => {
    if (location.pathname.startsWith("/settings")) {
      setSettingsExpanded(true)
    }
  }, [location.pathname])

  useEffect(() => {
    if (!user) return
    NotificationService.requestPermission()
  }, [user])

  useEffect(() => {
    setWorkspaceMenuOpen(false)
  }, [location.pathname])

  useEffect(() => {
    if (!workspaceMenuOpen) return
    function onKeyDown(e) { if (e.key === "Escape") setWorkspaceMenuOpen(false) }
    function onPointerDown(e) {
      if (!e.target.closest(".workspaceMenuWrap")) setWorkspaceMenuOpen(false)
    }
    window.addEventListener("keydown", onKeyDown)
    window.addEventListener("pointerdown", onPointerDown)
    return () => {
      window.removeEventListener("keydown", onKeyDown)
      window.removeEventListener("pointerdown", onPointerDown)
    }
  }, [workspaceMenuOpen])

  const dispatch = useDispatch()

  const handleGlobalWsMessage = useCallback((msg) => {
    if (msg.type === "sos_alert") {
      dispatch(addSosAlert(msg.data))
      playCriticalAlert()
      NotificationService.send("🆘 SOS ALERT", `${msg.data.employee_name} needs assistance!`)
    } else if (msg.type === "geofence_breach") {
      dispatch(addGeofenceBreach(msg.data))
    }
  }, [dispatch])

  const isLiveTrackingPage = location.pathname === routes.live_locations
  useWebSocket(isAdmin && !isLiveTrackingPage ? "/ws/live/admin/" : null, {
    onMessage: handleGlobalWsMessage,
  })


  if (!user) return null

  const email = user.email

  return (
    <div className="flex flex-col h-screen w-full overflow-hidden bg-bg text-fg font-body">
      <CommandPalette open={cmdOpen} setOpen={setCmdOpen} />

      {/* ── Topbar ───────────────────────────── */}
      <header className="flex items-center justify-between h-[var(--header-height)] px-8 bg-surface/80 dark:bg-slate-950/80 backdrop-blur-xl border-b border-stroke dark:border-slate-800 z-50 shrink-0 shadow-sm">
        <div className="flex items-center gap-8">
          <div className="flex items-center gap-4">
            <CalTrackLogo size="sm" className="hover:scale-105 transition-transform" />
            <div className="flex flex-col">
              <span className="font-bold text-slate-900 dark:text-white text-base tracking-tight truncate max-w-[200px]" title={orgName || "CalTrack"}>
                {orgName || "CalTrack"}
              </span>
              <span className="text-[10px] professional-subtitle text-blue-500 leading-none">Enterprise</span>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-6">
          <button
            type="button"
            className="hidden md:flex items-center gap-3 px-5 py-2.5 bg-white dark:bg-black hover:bg-slate-50 dark:hover:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl text-sm text-slate-500 dark:text-white/80 hover:text-slate-900 dark:hover:text-white transition-all duration-300 w-72 group shadow-sm dark:shadow-lg dark:shadow-black/20 active:scale-[0.98]"
            onClick={() => setCmdOpen(true)}
          >
            <Search size={16} className="text-blue-500 group-hover:scale-110 transition-transform" />
            <span className="flex-1 text-left font-black tracking-tight opacity-70 group-hover:opacity-100">Quick search...</span>
            <div className="flex items-center gap-1 px-1.5 py-0.5 text-[9px] font-black bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-400 dark:text-white/40 group-hover:text-slate-600 dark:group-hover:text-white/60 transition-colors uppercase tracking-widest">
              <span>⌘</span>
              <span>K</span>
            </div>
          </button>

          <div className="flex items-center gap-3">
            <NotificationCenter />
            <ThemeSwitch />
          </div>

          <div className="h-8 w-px bg-slate-200 dark:bg-slate-800"></div>

          <div
            className="relative profileMenuWrap"
            onMouseEnter={() => setProfileOpen(true)}
            onMouseLeave={() => setProfileOpen(false)}
          >
            <button className="flex items-center gap-3 p-1 rounded-2xl hover:bg-slate-100 dark:hover:bg-slate-800 transition-all duration-300 group" type="button">
              <div className="relative w-10 h-10 flex items-center justify-center rounded-xl bg-blue-600 dark:bg-blue-500 text-white font-bold text-sm shadow-lg shadow-blue-500/20 group-hover:scale-105 transition-transform">
                {initials(user.username)}
                <div className="absolute -bottom-1 -right-1 w-4 h-4 bg-emerald-500 border-4 border-white dark:border-slate-950 rounded-full shadow-sm"></div>
              </div>
              {!sidebarCollapsed && (
                <div className="hidden lg:flex flex-col text-left mr-2">
                  <span className="text-sm font-bold leading-none">{displayName(user.username)}</span>
                  <span
                    className="text-[10px] font-bold uppercase tracking-wider mt-1 px-1.5 py-0.5 rounded-md"
                    style={{
                      color: isAdmin ? "#4f46e5" : "#059669",
                      background: isAdmin ? "#ede9fe" : "#d1fae5",
                    }}
                  >
                    {user.role}
                  </span>
                </div>
              )}
            </button>

            {profileOpen && (
              <div className="absolute top-full right-0 mt-3 w-80 bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-800 z-[99999] overflow-hidden animate-in fade-in slide-in-from-top-2 duration-300">
                <div className="p-6 bg-slate-50/80 dark:bg-slate-800/50 backdrop-blur-xl border-b border-slate-200/60 dark:border-slate-700/60">
                  <div className="flex items-center gap-4">
                    <div className="flex items-center justify-center w-14 h-14 rounded-2xl bg-blue-600 dark:bg-blue-500 text-white text-xl font-bold shadow-xl shadow-blue-500/20">{initials(user.username)}</div>
                    <div>
                      <div className="font-bold text-slate-900 dark:text-white text-lg">{displayName(user.username)}</div>
                      <div className="text-xs text-slate-500 dark:text-slate-400 truncate max-w-[180px] font-medium">{email}</div>
                      <span
                        className="inline-block mt-1.5 text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded-full"
                        style={{
                          color: isAdmin ? "#4f46e5" : "#059669",
                          background: isAdmin ? "#ede9fe" : "#d1fae5",
                          border: `1px solid ${isAdmin ? "#c4b5fd" : "#a7f3d0"}`,
                        }}
                      >
                        {isAdmin ? "Administrator" : "Employee"}
                      </span>
                    </div>
                  </div>
                </div>

                <div className="p-3">
                  <button
                    type="button"
                    className="flex items-center w-full px-4 py-3 text-sm font-bold text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-500/10 rounded-xl transition-all duration-300 group"
                    onClick={() => { setProfileOpen(false); logout(); }}
                  >
                    <LogOut size={18} className="mr-3 group-hover:-translate-x-1 transition-transform" /> Log out
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </header>

      {/* ── Body ─────────────────────────────── */}
      <div className="flex flex-1 overflow-hidden">
        {/* ── Main Primary Sidebar ─────────────────────────────── */}
        <aside
          className="flex flex-col bg-white dark:bg-slate-950 border-r border-stroke dark:border-slate-900 z-50 w-[100px] shrink-0"
        >
          <nav className="flex-1 overflow-y-auto py-6 flex flex-col items-center gap-4 scrollbar-hide">
            {items.map((item) => {
              const active = (item.to === "/" && location.pathname === "/") || (item.to !== "/" && location.pathname.startsWith(item.to));
              const color = item.color || "#3b82f6";
              const hasChildren = !!item.children;

              return (
                <div key={item.label} className="relative group">
                  <button
                    onClick={() => {
                      if (hasChildren) setDrillDownParent(item);
                      navigate(item.to);
                    }}
                    className={`flex flex-col items-center justify-center w-20 h-20 rounded-2xl transition-all duration-500 relative gap-1.5 ${active ? 'shadow-lg shadow-sm' : 'text-slate-400 hover:bg-slate-50'}`}
                    style={{
                      backgroundColor: active ? `${color}15` : 'transparent',
                      color: active ? color : undefined
                    }}
                  >
                    <motion.span
                      animate={active ? { scale: [1, 1.1, 1] } : {}}
                      transition={{ repeat: Infinity, duration: 4 }}
                      className={`transition-all duration-300 ${active ? '' : 'group-hover:scale-110'}`}
                    >
                      {item.icon}
                    </motion.span>
                    <span
                      className={`text-[9px] font-black text-center px-1 leading-tight uppercase tracking-tighter transition-all ${active ? 'text-black dark:text-white opacity-100' : 'text-black/60 dark:text-white/60 group-hover:text-black dark:group-hover:text-white group-hover:opacity-100'}`}
                    >
                      {item.label}
                    </span>

                    {active && (
                      <motion.div
                        layoutId="active-indicator-main"
                        className="absolute -right-0 w-1 h-10 rounded-full"
                        style={{ backgroundColor: color }}
                      />
                    )}

                    {/* Hover Glow */}
                    <div
                      className="absolute inset-0 rounded-2xl opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none"
                      style={{ background: `radial-gradient(circle at center, ${color}10 0%, transparent 70%)` }}
                    />
                  </button>
                </div>
              );
            })}
          </nav>
        </aside>

        {/* ── Secondary Sub-Sidebar Panel ─────────────────────────────── */}
        <AnimatePresence mode="wait">
          {drillDownParent && (
            <motion.aside
              initial={{ x: -260, opacity: 0, width: 0 }}
              animate={{ x: 0, opacity: 1, width: 260 }}
              exit={{ x: -260, opacity: 0, width: 0 }}
              transition={{ type: "spring", damping: 25, stiffness: 200 }}
              className="flex flex-col bg-slate-50/50 dark:bg-slate-900/20 backdrop-blur-xl border-r border-stroke dark:border-slate-800 z-40 overflow-hidden shrink-0"
            >
              <div className="p-4 flex flex-col gap-1 h-full">
                <div className="mb-4 px-3">
                  <h4 className="text-[10px] font-black uppercase tracking-[0.2em] text-black dark:text-white mb-1">{drillDownParent.label}</h4>
                </div>

                <div className="flex-1 overflow-y-auto scrollbar-hide flex flex-col gap-1">
                  {drillDownParent.children
                    .filter(child => !child.adminOnly || isAdmin)
                    .map((child) => {
                      const active = location.pathname === child.to || (child.to !== '/settings' && location.pathname.startsWith(child.to));
                      const color = child.color || drillDownParent.color || "#3b82f6";
                      return (
                        <NavLink
                          key={child.label}
                          to={child.to}
                          className={`flex flex-row items-center justify-start w-full px-5 py-4 rounded-xl transition-all duration-300 relative group gap-4 ${active ? 'bg-white dark:bg-slate-800 shadow-lg border border-slate-200 dark:border-slate-700' : 'text-slate-400 hover:bg-white/50'}`}
                        >
                          <span className={`shrink-0 transition-all duration-300 ${active ? 'scale-110' : 'opacity-40 group-hover:opacity-100 group-hover:scale-105'}`} style={{ color }}>
                            {child.icon}
                          </span>
                          <span className={`text-[10px] font-black text-left uppercase tracking-tighter transition-colors ${active ? 'text-black dark:text-white' : 'text-slate-500 group-hover:text-black dark:group-hover:text-white'}`}>
                            {child.label}
                          </span>
                          {active && (
                            <motion.div
                              layoutId="active-indicator-sub"
                              className="absolute right-2 w-1 h-4 rounded-full"
                              style={{ backgroundColor: color }}
                            />
                          )}
                        </NavLink>
                      );
                    })}
                </div>

                <button
                  onClick={() => setDrillDownParent(null)}
                  className="mt-auto w-full py-3 flex items-center justify-center gap-2 text-[10px] font-black uppercase tracking-widest text-slate-400 hover:text-slate-600 transition-colors"
                >
                  <ChevronLeft size={14} /> Close
                </button>
              </div>
            </motion.aside>
          )}
        </AnimatePresence>

        {/* Main Content Area */}
        <main className="flex-1 overflow-y-auto bg-bg relative scroll-smooth">
          <div className="absolute inset-0 bg-grid-slate-900/[0.02] dark:bg-grid-white/[0.02] pointer-events-none"></div>
          <div className="relative z-10 min-h-full">
            <Outlet />
          </div>
        </main>
      </div>

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
