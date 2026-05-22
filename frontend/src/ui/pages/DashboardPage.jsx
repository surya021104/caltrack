import React, { useEffect, useMemo, useState, useRef, lazy, Suspense } from "react"
import { useNavigate } from "react-router-dom"
import { motion, useMotionValue, useTransform, useSpring, AnimatePresence } from "framer-motion"
import { Clock, Users, Briefcase, CalendarDays, DollarSign, Loader2, AlertCircle, Timer, Activity, MapPin, ShieldAlert, TrendingUp, FileWarning, BadgeCheck, XCircle, CheckCircle2, ClipboardList, UserCheck, ArrowRight } from "lucide-react"

import { apiRequest, unwrapResults } from "../../api/client.js"
import { useAuth } from "../../state/auth/useAuth.js"
import { useRole } from "../../state/auth/useRole.js"
import { routes } from "../routes.js"

// ─── Employee Personal Dashboard ────────────────────────────
function StatCard({ icon, label, value, sub, color, onClick }) {
  return (
    <div
      onClick={onClick}
      style={{
        background: "#fff",
        border: "1.5px solid #e2e8f0",
        borderRadius: 20,
        padding: "24px 28px",
        display: "flex",
        alignItems: "center",
        gap: 20,
        cursor: onClick ? "pointer" : "default",
        transition: "box-shadow 0.2s, transform 0.2s",
        boxShadow: "0 2px 12px rgba(0,0,0,0.04)",
      }}
      onMouseEnter={e => { if (onClick) { e.currentTarget.style.boxShadow = "0 8px 28px rgba(0,0,0,0.10)"; e.currentTarget.style.transform = "translateY(-2px)" } }}
      onMouseLeave={e => { e.currentTarget.style.boxShadow = "0 2px 12px rgba(0,0,0,0.04)"; e.currentTarget.style.transform = "none" }}
    >
      <div style={{
        width: 52, height: 52, borderRadius: 14, flexShrink: 0,
        background: `${color}18`, border: `1.5px solid ${color}30`,
        display: "flex", alignItems: "center", justifyContent: "center",
        color,
      }}>
        {icon}
      </div>
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: 10, fontWeight: 800, color: "#94a3b8", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 4 }}>
          {label}
        </div>
        <div style={{ fontSize: 26, fontWeight: 900, color: "#0f172a", lineHeight: 1 }}>
          {value}
        </div>
        {sub && <div style={{ fontSize: 11, color: "#94a3b8", fontWeight: 600, marginTop: 4 }}>{sub}</div>}
      </div>
      {onClick && <ArrowRight size={18} style={{ color: "#cbd5e1", flexShrink: 0 }} />}
    </div>
  )
}

function TaskStatusRow({ label, count, color }) {
  if (!count) return null
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 0", borderBottom: "1px solid #f1f5f9" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <div style={{ width: 8, height: 8, borderRadius: "50%", background: color }} />
        <span style={{ fontSize: 13, fontWeight: 700, color: "#475569" }}>{label}</span>
      </div>
      <span style={{ fontSize: 13, fontWeight: 900, color }}>{count}</span>
    </div>
  )
}

function EmployeeDashboard() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const [tasks, setTasks]   = useState([])
  const [leaves, setLeaves] = useState([])
  const [loading, setLoading] = useState(true)
  const hour = new Date().getHours()
  const greeting = hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening"

  useEffect(() => {
    async function load() {
      setLoading(true)
      try {
        const [t, l] = await Promise.all([
          apiRequest("/tasks/my/").catch(() => []),
          apiRequest("/leaves/").catch(() => []),
        ])
        setTasks(Array.isArray(t) ? t : unwrapResults(t))
        setLeaves(Array.isArray(l) ? l : unwrapResults(l))
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [])

  const pendingAcceptance = tasks.filter(t => t.acceptance_status === "pending_acceptance").length
  const inProgress        = tasks.filter(t => t.status === "in_progress").length
  const completedToday    = tasks.filter(t => {
    if (t.status !== "completed" || !t.completed_at) return false
    return new Date(t.completed_at).toDateString() === new Date().toDateString()
  }).length
  const activeTasks       = tasks.filter(t => t.status !== "completed" && t.status !== "cancelled").length

  const pendingLeaves  = leaves.filter(l => l.status === "pending").length
  const approvedLeaves = leaves.filter(l => l.status === "approved").length
  const totalLeaves    = leaves.length

  const firstName = user?.firstName || user?.username || "there"

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", background: "#f8fafc", overflow: "auto" }}>
      {/* Header */}
      <div style={{
        background: "linear-gradient(135deg, #4f46e5 0%, #7c3aed 100%)",
        padding: "36px 48px 48px",
        position: "relative",
        overflow: "visible",
      }}>
        <div style={{ position: "absolute", inset: 0, backgroundImage: "radial-gradient(circle at 80% 50%, rgba(255,255,255,0.06) 0%, transparent 60%)", pointerEvents: "none" }} />
        <div style={{ position: "relative", zIndex: 1 }}>
          <div style={{ fontSize: 11, fontWeight: 800, color: "rgba(255,255,255,0.6)", letterSpacing: "0.12em", textTransform: "uppercase", marginBottom: 8 }}>
            {new Date().toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })}
          </div>
          <h1 style={{ fontSize: 28, fontWeight: 900, color: "#fff", margin: 0, letterSpacing: "-0.02em" }}>
            {greeting}, {firstName} 👋
          </h1>
          <p style={{ color: "rgba(255,255,255,0.7)", fontSize: 14, fontWeight: 500, marginTop: 8 }}>
            Here's your personal overview for today.
          </p>
        </div>

        {/* Floating alert for pending tasks */}
        {pendingAcceptance > 0 && (
          <div
            onClick={() => navigate(routes.tasks)}
            style={{
              position: "absolute", bottom: 16, right: 48,
              background: "rgba(255, 255, 255, 0.12)",
              backdropFilter: "blur(16px)",
              WebkitBackdropFilter: "blur(16px)",
              borderRadius: 16, padding: "12px 20px",
              boxShadow: "0 10px 32px rgba(0, 0, 0, 0.15), inset 0 1px 1px rgba(255, 255, 255, 0.2)",
              display: "flex", alignItems: "center", gap: 12, cursor: "pointer",
              border: "1px solid rgba(255, 255, 255, 0.25)",
              zIndex: 10,
              transition: "transform 0.25s cubic-bezier(0.4, 0, 0.2, 1), background-color 0.25s, border-color 0.25s, box-shadow 0.25s",
            }}
            onMouseEnter={e => {
              e.currentTarget.style.transform = "translateY(-3px) scale(1.03)"
              e.currentTarget.style.background = "rgba(255, 255, 255, 0.18)"
              e.currentTarget.style.borderColor = "rgba(255, 255, 255, 0.45)"
              e.currentTarget.style.boxShadow = "0 15px 35px rgba(0, 0, 0, 0.22), 0 0 15px rgba(255, 255, 255, 0.2), inset 0 1px 1px rgba(255, 255, 255, 0.3)"
            }}
            onMouseLeave={e => {
              e.currentTarget.style.transform = "none"
              e.currentTarget.style.background = "rgba(255, 255, 255, 0.12)"
              e.currentTarget.style.borderColor = "rgba(255, 255, 255, 0.25)"
              e.currentTarget.style.boxShadow = "0 10px 32px rgba(0, 0, 0, 0.15), inset 0 1px 1px rgba(255, 255, 255, 0.2)"
            }}
          >
            <div style={{
              width: 38, height: 38, borderRadius: 12,
              background: "rgba(255, 255, 255, 0.2)",
              display: "flex", alignItems: "center", justifyContent: "center",
              border: "1px solid rgba(255, 255, 255, 0.3)",
              boxShadow: "inset 0 1px 2px rgba(255,255,255,0.15)",
              flexShrink: 0,
            }}>
              <ClipboardList size={18} style={{ color: "#ffffff" }} />
            </div>
            <div>
              <div style={{ fontSize: 13, fontWeight: 900, color: "#ffffff", letterSpacing: "-0.01em", textShadow: "0 1px 2px rgba(0,0,0,0.1)" }}>
                {pendingAcceptance} task{pendingAcceptance > 1 ? "s" : ""} need{pendingAcceptance === 1 ? "s" : ""} your response
              </div>
              <div style={{ fontSize: 10, color: "rgba(255, 255, 255, 0.8)", fontWeight: 700, letterSpacing: "0.02em" }}>
                Tap to accept or decline
              </div>
            </div>
            <ArrowRight size={16} style={{ color: "#ffffff", marginLeft: 4 }} />
          </div>
        )}
      </div>

      {/* Content */}
      <div style={{ padding: "48px 48px 40px", display: "flex", flexDirection: "column", gap: 32, flex: 1 }}>

        {loading ? (
          <div style={{ display: "flex", alignItems: "center", justifyContent: "center", padding: "48px 0", color: "#94a3b8", gap: 12 }}>
            <Loader2 className="animate-spin" size={24} />
            <span style={{ fontSize: 14, fontWeight: 600 }}>Loading your dashboard…</span>
          </div>
        ) : (
          <>
            {/* KPI Row */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))", gap: 20 }}>
              <StatCard
                icon={<ClipboardList size={22} />}
                label="Active Tasks"
                value={activeTasks}
                sub={completedToday > 0 ? `${completedToday} completed today` : "No completions today"}
                color="#4f46e5"
                onClick={() => navigate(routes.tasks)}
              />
              <StatCard
                icon={<UserCheck size={22} />}
                label="Awaiting Response"
                value={pendingAcceptance}
                sub={pendingAcceptance > 0 ? "Action required" : "All caught up"}
                color={pendingAcceptance > 0 ? "#d97706" : "#059669"}
                onClick={pendingAcceptance > 0 ? () => navigate(routes.tasks) : null}
              />
              <StatCard
                icon={<CalendarDays size={22} />}
                label="My Leaves"
                value={totalLeaves}
                sub={`${pendingLeaves} pending · ${approvedLeaves} approved`}
                color="#ec4899"
                onClick={() => navigate(routes.leaves)}
              />
              <StatCard
                icon={<Clock size={22} />}
                label="Clock In/Out"
                value="Time"
                sub="Tap to open attendance"
                color="#f59e0b"
                onClick={() => navigate(routes.time)}
              />
            </div>

            {/* Tasks breakdown */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 24 }}>
              {/* Tasks breakdown card */}
              <div style={{ background: "#fff", border: "1.5px solid #e2e8f0", borderRadius: 20, padding: "24px 28px", boxShadow: "0 2px 12px rgba(0,0,0,0.04)" }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20 }}>
                  <div style={{ fontSize: 13, fontWeight: 900, color: "#0f172a" }}>My Task Breakdown</div>
                  <button
                    onClick={() => navigate(routes.tasks)}
                    style={{ fontSize: 11, fontWeight: 800, color: "#4f46e5", background: "#ede9fe", border: "none", borderRadius: 8, padding: "4px 10px", cursor: "pointer" }}
                  >
                    View All
                  </button>
                </div>
                <TaskStatusRow label="Awaiting Acceptance" count={pendingAcceptance} color="#d97706" />
                <TaskStatusRow label="In Progress"         count={inProgress}         color="#2563eb" />
                <TaskStatusRow label="Completed Today"     count={completedToday}     color="#059669" />
                {tasks.length === 0 && (
                  <div style={{ textAlign: "center", padding: "24px 0", color: "#cbd5e1", fontSize: 13, fontWeight: 600 }}>
                    No tasks assigned yet
                  </div>
                )}
              </div>

              {/* Leave summary card */}
              <div style={{ background: "#fff", border: "1.5px solid #e2e8f0", borderRadius: 20, padding: "24px 28px", boxShadow: "0 2px 12px rgba(0,0,0,0.04)" }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20 }}>
                  <div style={{ fontSize: 13, fontWeight: 900, color: "#0f172a" }}>My Leave Requests</div>
                  <button
                    onClick={() => navigate(routes.leaves)}
                    style={{ fontSize: 11, fontWeight: 800, color: "#ec4899", background: "#fdf2f8", border: "none", borderRadius: 8, padding: "4px 10px", cursor: "pointer" }}
                  >
                    View All
                  </button>
                </div>
                <TaskStatusRow label="Pending Approval" count={pendingLeaves}  color="#d97706" />
                <TaskStatusRow label="Approved"         count={approvedLeaves} color="#059669" />
                <TaskStatusRow label="Rejected"         count={leaves.filter(l => l.status === "rejected").length} color="#dc2626" />
                {leaves.length === 0 && (
                  <div style={{ textAlign: "center", padding: "24px 0", color: "#cbd5e1", fontSize: 13, fontWeight: 600 }}>
                    No leave requests yet
                  </div>
                )}
              </div>
            </div>

            {/* Quick actions */}
            <div>
              <div style={{ fontSize: 10, fontWeight: 800, color: "#94a3b8", textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 16 }}>
                Quick Actions
              </div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 12 }}>
                {[
                  { label: "Clock In / Out",    to: routes.time,   color: "#f59e0b", icon: <Clock size={15} /> },
                  { label: "My Tasks",          to: routes.tasks,  color: "#4f46e5", icon: <ClipboardList size={15} /> },
                  { label: "Request Leave",     to: routes.leaves, color: "#ec4899", icon: <CalendarDays size={15} /> },
                  { label: "My Profile",        to: routes.settings_profile, color: "#64748b", icon: <UserCheck size={15} /> },
                ].map(({ label, to, color, icon }) => (
                  <button
                    key={to}
                    onClick={() => navigate(to)}
                    style={{
                      display: "flex", alignItems: "center", gap: 8,
                      padding: "10px 20px", borderRadius: 12,
                      background: `${color}12`, border: `1.5px solid ${color}30`,
                      color, fontSize: 12, fontWeight: 800, cursor: "pointer",
                      transition: "all 0.15s",
                    }}
                    onMouseEnter={e => { e.currentTarget.style.background = `${color}22`; e.currentTarget.style.transform = "translateY(-1px)" }}
                    onMouseLeave={e => { e.currentTarget.style.background = `${color}12`; e.currentTarget.style.transform = "none" }}
                  >
                    {icon} {label}
                  </button>
                ))}
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  )
}

// Lazy-loaded sub-modules
const DashboardMap = lazy(() => import("./DashboardMap.jsx"))
const BarChart = lazy(() => import("../components/DashboardCharts.jsx").then(m => ({ default: m.BarChart })))
const LineChart = lazy(() => import("../components/DashboardCharts.jsx").then(m => ({ default: m.LineChart })))
const DoughnutChart = lazy(() => import("../components/DashboardCharts.jsx").then(m => ({ default: m.DoughnutChart })))
const PieChart = lazy(() => import("../components/DashboardCharts.jsx").then(m => ({ default: m.DoughnutChart }))) // Pie is similar to Doughnut

// ── Shared Chart Defaults ──
const CHART_COLORS = {
  primary: "#6366F1",
  primaryLight: "rgba(99, 102, 241, 0.15)",
  blue: "#3B82F6",
  blueLight: "rgba(59, 130, 246, 0.12)",
  emerald: "#10B981",
  emeraldLight: "rgba(16, 185, 129, 0.12)",
  amber: "#F59E0B",
  amberLight: "rgba(245, 158, 11, 0.12)",
  orange: "#F97316",
  orangeLight: "rgba(249, 115, 22, 0.12)",
  rose: "#F43F5E",
  roseLight: "rgba(244, 63, 94, 0.12)",
  violet: "#8B5CF6",
  violetLight: "rgba(139, 92, 246, 0.12)",
  cyan: "#06B6D4",
  cyanLight: "rgba(6, 182, 212, 0.12)",
  slate: "#64748B",
  slateLight: "rgba(100, 116, 139, 0.12)",
}

const PIE_PALETTE = ["#6366F1", "#3B82F6", "#10B981", "#F59E0B", "#F43F5E", "#8B5CF6", "#06B6D4", "#EC4899", "#14B8A6", "#F97316"]

const sharedTooltip = {
  backgroundColor: "rgba(15, 23, 42, 0.92)",
  titleColor: "#F8FAFC",
  bodyColor: "#CBD5E1",
  borderColor: "rgba(99, 102, 241, 0.3)",
  borderWidth: 1,
  cornerRadius: 10,
  padding: 12,
  titleFont: { weight: "700", size: 13 },
  bodyFont: { size: 12 },
  boxPadding: 4,
}

const sharedGrid = {
  color: "rgba(148, 163, 184, 0.08)",
  drawBorder: false,
}

function formatHours(h) {
  if (h == null) return "—"
  return `${h.toFixed(1)}h`
}

function formatMoney(n) {
  if (!n && n !== 0) return "$0"
  if (n >= 1000) return `$${(n / 1000).toFixed(1)}k`
  return `$${n.toFixed(0)}`
}


function ChartPlaceholder() {
  return (
    <div className="flex items-center justify-center h-full w-full bg-bg dark:bg-slate-950/40 rounded-xl border border-dashed border-stroke dark:border-slate-800 animate-pulse">
      <Loader2 className="text-slate-200 dark:text-slate-800 animate-spin" size={20} />
    </div>
  )
}

export function DashboardPage() {
  const { isAdmin } = useRole()
  if (!isAdmin) return <EmployeeDashboard />
  return <AdminDashboard />
}

function AdminDashboard() {
  const { user } = useAuth()
  const { isAdmin } = useRole()
  const navigate = useNavigate()

  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")
  const [analytics, setAnalytics] = useState(null)
  const [otAlerts, setOtAlerts] = useState([])
  const [wageViolations, setWageViolations] = useState([])
  const [rtwExpiring, setRtwExpiring] = useState([])
  const [complianceDismissed, setComplianceDismissed] = useState(false)

  useEffect(() => {
    let cancelled = false

    async function load() {
      setLoading(true)
      setError("")
      try {
        const data = await apiRequest("/reports/dashboard-analytics/")
        if (!cancelled) setAnalytics(data)
      } catch (err) {
        if (!cancelled) {
          console.error("Dashboard analytics error:", err)
          setError("Failed to load dashboard analytics.")
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    async function loadCompliance() {
      try {
        // OT risk
        const otData = await apiRequest("/compliance/ot-risk/")
        if (!cancelled && otData?.data?.alerts) setOtAlerts(otData.data.alerts)
      } catch (_) { }
      try {
        // Wage floor violations
        const wfData = await apiRequest("/compliance/wage-floor/")
        if (!cancelled && wfData?.data?.violations) setWageViolations(wfData.data.violations)
      } catch (_) { }
      try {
        // RTW expiry (UK)
        const rtwData = await apiRequest("/compliance/rtw/expiry-check/")
        if (!cancelled && rtwData?.data) {
          const expiring = [
            ...(rtwData.data.expiring_within_60_days || []),
            ...(rtwData.data.expired || []),
          ]
          setRtwExpiring(expiring)
        }
      } catch (_) { }
    }

    if (user && isAdmin) {
      load()
      loadCompliance()
    }
    return () => { cancelled = true }
  }, [user, isAdmin])

  const kpi = analytics?.kpi || {}

  const kpiCards = [
    {
      title: "Active Employees",
      value: kpi.employees_active || 0,
      icon: <Users size={20} />,
      color: CHART_COLORS.emerald,
      bg: CHART_COLORS.emeraldLight,
      sub: `Total personnel: ${kpi.employees_total || 0}`,
    },
    {
      title: "Total Hours",
      value: formatHours(kpi.total_hours_month),
      icon: <Clock size={20} />,
      color: CHART_COLORS.blue,
      bg: CHART_COLORS.blueLight,
      sub: "This month",
    },
    {
      title: "Active Tasks",
      value: kpi.active_tasks || 0,
      icon: <Briefcase size={20} />,
      color: CHART_COLORS.primary,
      bg: CHART_COLORS.primaryLight,
      sub: `Total: ${kpi.total_tasks || 0}`,
    },
    {
      title: "Pending Leaves",
      value: kpi.pending_leaves || 0,
      icon: <CalendarDays size={20} />,
      color: CHART_COLORS.amber,
      bg: CHART_COLORS.amberLight,
      sub: "Awaiting approval",
    },
    {
      title: "Monthly Payroll",
      value: formatMoney(kpi.total_payroll_month),
      icon: <DollarSign size={20} />,
      color: CHART_COLORS.rose,
      bg: CHART_COLORS.roseLight,
      sub: "Total net pay",
    },
    {
      title: "Upcoming Shifts",
      value: kpi.upcoming_shifts || 0,
      icon: <Timer size={20} />,
      color: CHART_COLORS.violet,
      bg: CHART_COLORS.violetLight,
      sub: "Next 7 days",
    },
  ]

  const kpiEmp = kpiCards[0]
  const kpiHrs = kpiCards[1]
  const kpiTsk = kpiCards[2]
  const kpiLvs = kpiCards[3]
  const kpiPay = kpiCards[4]
  const kpiShft = kpiCards[5]

  function ThreeDKpiCard({ children, color, side }) {
    const x = useMotionValue(0);
    const y = useMotionValue(0);

    const rotateX = useTransform(y, [-100, 100], [15, -15]);
    const rotateY = useTransform(x, [-100, 100], [-15, 15]);

    const springConfig = { damping: 25, stiffness: 200 };
    const rX = useSpring(rotateX, springConfig);
    const rY = useSpring(rotateY, springConfig);

    function handleMouse(event) {
      const rect = event.currentTarget.getBoundingClientRect();
      const centerX = rect.left + rect.width / 2;
      const centerY = rect.top + rect.height / 2;
      x.set(event.clientX - centerX);
      y.set(event.clientY - centerY);
    }

    function handleMouseLeave() {
      x.set(0);
      y.set(0);
    }

    return (
      <motion.div
        style={{
          perspective: 1200,
          rotateX: rX,
          rotateY: rY,
          transformStyle: "preserve-3d",
        }}
        onMouseMove={handleMouse}
        onMouseLeave={handleMouseLeave}
        className="relative cursor-pointer"
        initial={{ opacity: 0, x: side === 'left' ? -30 : 30 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ duration: 0.8, delay: 0.2, type: "spring" }}
      >
        {/* Dynamic Glow */}
        <motion.div
          className="absolute -inset-6 opacity-0 group-hover:opacity-40 blur-3xl transition-opacity duration-700 rounded-full pointer-events-none"
          style={{
            background: `radial-gradient(circle at center, ${color}, transparent 70%)`,
            transform: "translateZ(-20px)",
          }}
        />
        <div style={{ transform: "translateZ(40px)" }}>
          {children}
        </div>
      </motion.div>
    );
  }

  function KpiDiagramSide({ card, side }) {
    const desc = (
      <div className={`flex flex-col ${side === 'left' ? 'items-end text-right' : 'items-start text-left'} min-w-[140px]`}>
        <div className="professional-title text-[1.4rem] leading-none" style={{ color: card.color }}>
          {card.value}
        </div>
        <div className="professional-subtitle text-slate-400 text-[0.7rem] mt-1.5 opacity-60 whitespace-nowrap">
          {card.sub}
        </div>
      </div>
    )

    const pill = (
      <motion.div
        whileHover={{ scale: 1.05, y: -2 }}
        className={`flex items-center rounded-2xl min-h-[58px] shadow-[0_20px_40px_rgba(0,0,0,0.12)] px-4 py-2 gap-4 border border-white/20 relative overflow-hidden group`}
        style={{
          background: `linear-gradient(135deg, ${card.color} 0%, ${card.color}dd 100%)`,
        }}
      >
        <div className="absolute inset-0 bg-gradient-to-tr from-white/10 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
        <div className="text-white professional-subtitle text-[0.9rem] whitespace-nowrap">{card.title}</div>
        <div className="w-[40px] h-[40px] rounded-xl bg-white/10 backdrop-blur-md flex items-center justify-center flex-none border border-white/20 shadow-inner">
          <span style={{ color: "white", display: "flex" }}>{card.icon}</span>
        </div>
      </motion.div>
    )

    const connector = (
      <div className={`flex items-center ${side === 'left' ? 'justify-end' : 'justify-start'} w-[60px]`}>
        <motion.div
          initial={{ width: 0 }}
          animate={{ width: "100%" }}
          className="h-[2px] relative"
          style={{
            background: `linear-gradient(${side === 'left' ? 'to right' : 'to left'}, transparent, ${card.color}44)`
          }}
        >
          <motion.div
            animate={{ x: side === 'left' ? [0, 60, 0] : [0, -60, 0], opacity: [0, 1, 0] }}
            transition={{ duration: 3, repeat: Infinity, ease: "linear" }}
            className="absolute top-1/2 -translate-y-1/2 w-1 h-1 rounded-full"
            style={{ backgroundColor: card.color }}
          />
        </motion.div>
      </div>
    )

    return (
      <ThreeDKpiCard color={card.color} side={side}>
        <div className={`flex items-center gap-6 ${side === 'left' ? 'flex-row' : 'flex-row-reverse'}`}>
          {desc}
          {pill}
          {connector}
        </div>
      </ThreeDKpiCard>
    )
  }

  // ── Hours by Employee (Horizontal Bar) ──
  const hoursByEmployee = analytics?.hours_by_employee || []
  const hbeData = {
    labels: hoursByEmployee.map((e) => e.name),
    datasets: [
      {
        label: "Hours",
        data: hoursByEmployee.map((e) => e.hours),
        backgroundColor: hoursByEmployee.map((_, i) => PIE_PALETTE[i % PIE_PALETTE.length]),
        borderRadius: 6,
        borderSkipped: false,
        barThickness: 22,
      },
    ],
  }
  const hbeOptions = {
    indexAxis: "y",
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { display: false },
      tooltip: {
        ...sharedTooltip,
        callbacks: { label: (ctx) => ` ${ctx.raw}h worked` },
      },
    },
    scales: {
      x: {
        grid: sharedGrid,
        ticks: { color: "#94A3B8", font: { size: 11 }, callback: (v) => `${v}h` },
      },
      y: {
        grid: { display: false },
        ticks: { color: "#94A3B8", font: { size: 12, weight: "600" } },
      },
    },
  }

  // ── Daily Hours Trend (Line Chart) ──
  const dailyTrend = analytics?.daily_hours_trend || []
  const trendData = {
    labels: dailyTrend.map((d) => {
      const dt = new Date(d.date)
      return dt.toLocaleDateString([], { month: "short", day: "numeric" })
    }),
    datasets: [
      {
        label: "Hours Worked",
        data: dailyTrend.map((d) => d.hours),
        borderColor: CHART_COLORS.primary,
        backgroundColor: (ctx) => {
          const chart = ctx.chart
          const { ctx: context, chartArea } = chart
          if (!chartArea) return CHART_COLORS.primaryLight
          const gradient = context.createLinearGradient(0, chartArea.top, 0, chartArea.bottom)
          gradient.addColorStop(0, "rgba(99, 102, 241, 0.3)")
          gradient.addColorStop(1, "rgba(99, 102, 241, 0.01)")
          return gradient
        },
        fill: true,
        tension: 0.4,
        pointRadius: 0,
        pointHoverRadius: 6,
        pointHoverBackgroundColor: CHART_COLORS.primary,
        pointHoverBorderColor: "#fff",
        pointHoverBorderWidth: 2,
        borderWidth: 2.5,
      },
    ],
  }
  const trendOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { display: false },
      tooltip: {
        ...sharedTooltip,
        callbacks: { label: (ctx) => ` ${ctx.raw}h worked` },
      },
    },
    scales: {
      x: {
        grid: { display: false },
        ticks: { color: "#94A3B8", font: { size: 10 }, maxTicksLimit: 10 },
      },
      y: {
        grid: sharedGrid,
        ticks: { color: "#94A3B8", font: { size: 11 }, callback: (v) => `${v}h` },
        beginAtZero: true,
      },
    },
    interaction: { mode: "index", intersect: false },
  }

  // ── Task Status (Donut Chart) ──
  const taskStatus = analytics?.task_status || {}
  const tsLabels = Object.keys(taskStatus)
  const tsData = {
    labels: tsLabels,
    datasets: [
      {
        data: tsLabels.map((k) => taskStatus[k]),
        backgroundColor: ["#F59E0B", "#3B82F6", "#10B981", "#F43F5E"],
        borderWidth: 0,
        hoverOffset: 8,
      },
    ],
  }
  const donutOptions = {
    responsive: true,
    maintainAspectRatio: false,
    cutout: "70%",
    plugins: {
      legend: {
        position: "bottom",
        labels: { color: "#94A3B8", font: { size: 12, weight: "600" }, padding: 16, usePointStyle: true, pointStyleWidth: 10 },
      },
      tooltip: sharedTooltip,
    },
  }

  // ── Leave Status (Pie Chart) ──
  const leaveStatus = analytics?.leave_status || {}
  const lsLabels = Object.keys(leaveStatus)
  const lsData = {
    labels: lsLabels,
    datasets: [
      {
        data: lsLabels.map((k) => leaveStatus[k]),
        backgroundColor: ["#F59E0B", "#10B981", "#F43F5E"],
        borderWidth: 0,
        hoverOffset: 8,
      },
    ],
  }
  const pieOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        position: "bottom",
        labels: { color: "#94A3B8", font: { size: 12, weight: "600" }, padding: 16, usePointStyle: true, pointStyleWidth: 10 },
      },
      tooltip: sharedTooltip,
    },
  }

  // ── Attendance Daily (Bar Chart) ──
  const attendance = analytics?.attendance_daily || []
  const attData = {
    labels: attendance.map((d) => d.day),
    datasets: [
      {
        label: "Clock-ins",
        data: attendance.map((d) => d.count),
        backgroundColor: attendance.map((_, i) => {
          const colors = [CHART_COLORS.primary, CHART_COLORS.blue, CHART_COLORS.emerald, CHART_COLORS.amber, CHART_COLORS.violet, CHART_COLORS.cyan, CHART_COLORS.rose]
          return colors[i % colors.length]
        }),
        borderRadius: 8,
        borderSkipped: false,
        barThickness: 28,
      },
    ],
  }
  const attOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { display: false },
      tooltip: {
        ...sharedTooltip,
        callbacks: { label: (ctx) => ` ${ctx.raw} clock-ins` },
      },
    },
    scales: {
      x: { grid: { display: false }, ticks: { color: "#94A3B8", font: { size: 12, weight: "600" } } },
      y: { grid: sharedGrid, ticks: { color: "#94A3B8", font: { size: 11 }, stepSize: 1 }, beginAtZero: true },
    },
  }

  // ── Task Categories (Bar Chart) ──
  const taskCategories = analytics?.task_categories || {}
  const tcLabels = Object.keys(taskCategories)
  const tcData = {
    labels: tcLabels,
    datasets: [
      {
        label: "Tasks",
        data: tcLabels.map((k) => taskCategories[k]),
        backgroundColor: tcLabels.map((_, i) => PIE_PALETTE[i % PIE_PALETTE.length]),
        borderRadius: 6,
        borderSkipped: false,
        barThickness: 22,
      },
    ],
  }
  const tcOptions = {
    indexAxis: "y",
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { display: false },
      tooltip: {
        ...sharedTooltip,
        callbacks: { label: (ctx) => ` ${ctx.raw} tasks` },
      },
    },
    scales: {
      x: { grid: sharedGrid, ticks: { color: "#94A3B8", font: { size: 11 }, stepSize: 1 } },
      y: { grid: { display: false }, ticks: { color: "#94A3B8", font: { size: 11, weight: "600" } } },
    },
  }

  // ── Payroll Trend (Line + Bar combo) ──
  const payrollTrend = analytics?.payroll_trend || []
  const ptData = {
    labels: payrollTrend.map((p) => p.label),
    datasets: [
      {
        type: "bar",
        label: "Gross Pay",
        data: payrollTrend.map((p) => p.gross_pay),
        backgroundColor: "rgba(99, 102, 241, 0.18)",
        borderRadius: 6,
        borderSkipped: false,
        barThickness: 22,
        order: 2,
      },
      {
        type: "line",
        label: "Net Pay",
        data: payrollTrend.map((p) => p.net_pay),
        borderColor: CHART_COLORS.emerald,
        backgroundColor: "rgba(16, 185, 129, 0.08)",
        pointRadius: 4,
        pointBackgroundColor: CHART_COLORS.emerald,
        borderWidth: 2.5,
        tension: 0.3,
        fill: false,
        order: 1,
      },
    ],
  }
  const ptOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        position: "top",
        align: "end",
        labels: { color: "#94A3B8", font: { size: 11, weight: "600" }, usePointStyle: true, pointStyleWidth: 10, padding: 16 },
      },
      tooltip: {
        ...sharedTooltip,
        callbacks: { label: (ctx) => ` ${ctx.dataset.label}: $${ctx.raw.toLocaleString()}` },
      },
    },
    scales: {
      x: { grid: { display: false }, ticks: { color: "#94A3B8", font: { size: 11 } } },
      y: { grid: sharedGrid, ticks: { color: "#94A3B8", font: { size: 11 }, callback: (v) => `$${v >= 1000 ? `${(v / 1000).toFixed(0)}k` : v}` }, beginAtZero: true },
    },
  }

  // ── Location Analysis ──
  const locationAnalysis = analytics?.location_analysis || {}
  const locationSummary = locationAnalysis.summary || []
  const employeesByLoc = locationAnalysis.employees_by_location || []
  const tasksByLoc = locationAnalysis.tasks_by_location || []
  const hoursByLoc = locationAnalysis.hours_by_location || []

  // Employees by Location (Horizontal Bar)
  const empLocData = {
    labels: employeesByLoc.map((e) => e.location),
    datasets: [
      {
        label: "Employees",
        data: employeesByLoc.map((e) => e.employees),
        backgroundColor: employeesByLoc.map((_, i) => PIE_PALETTE[i % PIE_PALETTE.length]),
        borderRadius: 6,
        borderSkipped: false,
        barThickness: 22,
      },
    ],
  }
  const empLocOptions = {
    indexAxis: "y",
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { display: false },
      tooltip: {
        ...sharedTooltip,
        callbacks: { label: (ctx) => ` ${ctx.raw} employees` },
      },
    },
    scales: {
      x: { grid: sharedGrid, ticks: { color: "#94A3B8", font: { size: 11 }, stepSize: 1 } },
      y: { grid: { display: false }, ticks: { color: "#94A3B8", font: { size: 12, weight: "600" } } },
    },
  }

  // Tasks by Location (Horizontal Stacked Bar)
  const taskLocData = {
    labels: tasksByLoc.map((t) => t.location),
    datasets: [
      {
        label: "Active Tasks",
        data: tasksByLoc.map((t) => t.active_tasks),
        backgroundColor: CHART_COLORS.primary,
        borderRadius: 0,
        borderSkipped: false,
        barThickness: 22,
      },
      {
        label: "Completed / Other",
        data: tasksByLoc.map((t) => t.total_tasks - t.active_tasks),
        backgroundColor: "rgba(99, 102, 241, 0.18)",
        borderRadius: 6,
        borderSkipped: false,
        barThickness: 22,
      },
    ],
  }
  const taskLocOptions = {
    indexAxis: "y",
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        position: "top",
        align: "end",
        labels: { color: "#94A3B8", font: { size: 11, weight: "600" }, usePointStyle: true, pointStyleWidth: 10, padding: 16 },
      },
      tooltip: {
        ...sharedTooltip,
        callbacks: { label: (ctx) => ` ${ctx.dataset.label}: ${ctx.raw}` },
      },
    },
    scales: {
      x: { stacked: true, grid: sharedGrid, ticks: { color: "#94A3B8", font: { size: 11 }, stepSize: 1 } },
      y: { stacked: true, grid: { display: false }, ticks: { color: "#94A3B8", font: { size: 12, weight: "600" } } },
    },
  }

  // Hours by Location (Horizontal Bar)
  const hrsLocData = {
    labels: hoursByLoc.map((h) => h.location),
    datasets: [
      {
        label: "Hours",
        data: hoursByLoc.map((h) => h.hours),
        backgroundColor: hoursByLoc.map((_, i) => {
          const colors = [CHART_COLORS.emerald, CHART_COLORS.blue, CHART_COLORS.primary, CHART_COLORS.amber, CHART_COLORS.violet, CHART_COLORS.cyan, CHART_COLORS.rose]
          return colors[i % colors.length]
        }),
        borderRadius: 6,
        borderSkipped: false,
        barThickness: 22,
      },
    ],
  }
  const hrsLocOptions = {
    indexAxis: "y",
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { display: false },
      tooltip: {
        ...sharedTooltip,
        callbacks: { label: (ctx) => ` ${ctx.raw}h worked` },
      },
    },
    scales: {
      x: { grid: sharedGrid, ticks: { color: "#94A3B8", font: { size: 11 }, callback: (v) => `${v}h` } },
      y: { grid: { display: false }, ticks: { color: "#94A3B8", font: { size: 12, weight: "600" } } },
    },
  }

  // Clock-in Status by Location (Horizontal Stacked Bar — clocked in vs clocked out)
  const clockLocData = {
    labels: locationSummary.map((l) => l.name),
    datasets: [
      {
        label: "Clocked In",
        data: locationSummary.map((l) => l.clocked_in_now || 0),
        backgroundColor: "#10B981",
        borderRadius: 0,
        borderSkipped: false,
        barThickness: 26,
      },
      {
        label: "Clocked Out",
        data: locationSummary.map((l) => l.clocked_out_today || 0),
        backgroundColor: "#F43F5E",
        borderRadius: 6,
        borderSkipped: false,
        barThickness: 26,
      },
    ],
  }
  const clockLocOptions = {
    indexAxis: "y",
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        position: "top",
        align: "end",
        labels: { color: "#94A3B8", font: { size: 11, weight: "600" }, usePointStyle: true, pointStyleWidth: 10, padding: 16 },
      },
      tooltip: {
        ...sharedTooltip,
        callbacks: { label: (ctx) => ` ${ctx.dataset.label}: ${ctx.raw} employees` },
      },
    },
    scales: {
      x: { stacked: true, grid: sharedGrid, ticks: { color: "#94A3B8", font: { size: 11 }, stepSize: 1 } },
      y: { stacked: true, grid: { display: false }, ticks: { color: "#94A3B8", font: { size: 12, weight: "600" } } },
    },
  }


  const [hoveredLoc, setHoveredLoc] = useState(null)

  if (loading) {
    return (
      <div className="p-6 max-w-[1600px] mx-auto flex flex-col gap-6 bg-bg dark:bg-bg min-h-screen">
        <div className="flex items-center justify-center gap-3 h-[50vh] text-slate-500 dark:text-slate-400 text-lg font-medium">
          <Loader2 className="animate-spin" size={24} />
          <span>Loading analytics…</span>
        </div>
      </div>
    )
  }

  return (
    <div className="p-6 max-w-[1600px] mx-auto flex flex-col gap-6 bg-bg dark:bg-bg min-h-screen">
      {/* ── Onboarding Progress Banner (Top Simple View) ── */}
      {!complianceDismissed && (
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-surface dark:bg-slate-900/50 rounded-xl shadow-sm border border-stroke dark:border-slate-800 p-6 flex items-center gap-6 relative group hover:shadow-md transition-shadow cursor-pointer mb-2"
          onClick={() => navigate("/get-started")}
        >
          <div className="relative w-16 h-16 flex-shrink-0">
            <svg className="w-full h-full" viewBox="0 0 36 36">
              <path
                className="text-slate-100 dark:text-slate-800"
                stroke="currentColor"
                strokeWidth="3"
                fill="none"
                d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
              />
              <motion.path
                className="text-orange-500"
                stroke="currentColor"
                strokeWidth="3"
                strokeDasharray="100, 100"
                initial={{ strokeDasharray: "0, 100" }}
                animate={{ strokeDasharray: "20, 100" }}
                transition={{ duration: 1, delay: 0.5 }}
                strokeLinecap="round"
                fill="none"
                d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
              />
            </svg>
            <div className="absolute inset-0 flex items-center justify-center text-[0.7rem] font-black text-slate-800 dark:text-slate-200">
              20%
            </div>
          </div>
          <div className="flex flex-col">
            <h3 className="text-base font-extrabold text-slate-800 dark:text-white leading-tight">
              Complete setting up your organization
            </h3>
            <p className="text-xs font-bold text-slate-400 dark:text-slate-500 mt-1 uppercase tracking-wider">
              1 of 5 steps completed
            </p>
          </div>
          <div className="ml-auto flex items-center gap-4">
            <div className="text-indigo-600 dark:text-indigo-400 font-bold text-xs bg-indigo-50 dark:bg-indigo-900/30 px-3 py-1.5 rounded-lg opacity-0 group-hover:opacity-100 transition-opacity">
              Resume Setup
            </div>
            <button
              onClick={(e) => { e.stopPropagation(); setComplianceDismissed(true); }}
              className="p-1 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-md text-slate-400 dark:text-slate-600 transition-colors"
            >
              <XCircle size={18} />
            </button>
          </div>
        </motion.div>
      )}

      {/* ── Compliance Risk Banner (admin only) ── */}
      {isAdmin && !complianceDismissed && (otAlerts.length > 0 || wageViolations.length > 0 || rtwExpiring.length > 0) && (
        <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-500/50 dark:border-amber-500/30 rounded-2xl p-5 flex flex-col gap-3 relative shadow-sm mb-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <ShieldAlert size={20} className="text-amber-600 dark:text-amber-400" />
              <span className="font-bold text-[15px] text-amber-900 dark:text-amber-100">
                Compliance Alerts — Action Required
              </span>
            </div>
            <button
              onClick={() => setComplianceDismissed(true)}
              className="p-1 hover:bg-amber-100 dark:hover:bg-amber-900/50 rounded-lg text-amber-900/60 dark:text-amber-100/60 transition-colors"
            >
              <XCircle size={18} />
            </button>
          </div>

          <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
            {/* OT Alerts */}
            {otAlerts.map((a, i) => {
              const isUK = a.country === "UK"
              const isExceeded = a.alert_type === "exceeded_40" || a.alert_type === "exceeded_48_uk"
              const isDoubleTime = a.alert_type === "double_time_ca"
              const color = isDoubleTime ? "#dc2626" : isExceeded ? "#d97706" : "#2563eb"
              const bg = isDoubleTime ? "#fef2f2" : isExceeded ? "#fffbeb" : "#eff6ff"
              const border = isDoubleTime ? "#fca5a5" : isExceeded ? "#fcd34d" : "#bfdbfe"
              const labels = {
                approaching_40: "Approaching 40hr limit",
                exceeded_40: "OT Pay Required (>40hrs)",
                daily_ot_ca: "CA Daily OT (>8hrs)",
                double_time_ca: "CA Double Time (>12hrs)",
                daily_ot_ak: "AK Daily OT (>8hrs)",
                approaching_48_uk: "UK WTR: Approaching 48hr avg",
                exceeded_48_uk: "UK WTR: 48hr Limit Breached",
              }
              return (
                <div key={i} style={{
                  background: bg, border: `1.5px solid ${border}`, borderRadius: 8,
                  padding: "8px 12px", display: "flex", alignItems: "center", gap: 8,
                }}>
                  <TrendingUp size={14} color={color} />
                  <span style={{ fontSize: 12, fontWeight: 600, color }}>
                    {labels[a.alert_type] || a.alert_type}
                  </span>
                  <span style={{ fontSize: 11, color: "#64748b" }}>
                    {a.employee_name} — {a.hours_this_week != null ? `${a.hours_this_week}h` : a.rolling_17wk_avg != null ? `avg ${a.rolling_17wk_avg}h/wk` : ""}
                    {a.state ? ` (${a.state})` : isUK ? " (UK)" : ""}
                    {a.wtr_opt_out ? " · Opt-out active" : ""}
                  </span>
                </div>
              )
            })}

            {/* Wage floor violations */}
            {wageViolations.map((v, i) => (
              <div key={`wf-${i}`} style={{
                background: "#fef2f2", border: "1.5px solid #fca5a5", borderRadius: 8,
                padding: "8px 12px", display: "flex", alignItems: "center", gap: 8,
              }}>
                <FileWarning size={14} color="#dc2626" />
                <span style={{ fontSize: 12, fontWeight: 600, color: "#dc2626" }}>
                  Below Minimum Wage
                </span>
                <span style={{ fontSize: 11, color: "#64748b" }}>
                  {v.employee_name} — ${v.hourly_rate}/hr (floor: ${v.minimum_wage_floor}/hr, shortfall: ${v.shortfall_per_hour.toFixed(2)}/hr)
                  {v.country === "UK" ? " · UK NMW" : v.state ? ` · ${v.state}` : " · Federal"}
                </span>
              </div>
            ))}

            {/* RTW expiry */}
            {rtwExpiring.map((r, i) => (
              <div key={`rtw-${i}`} style={{
                background: "#fff7ed", border: "1.5px solid #fed7aa", borderRadius: 8,
                padding: "8px 12px", display: "flex", alignItems: "center", gap: 8,
              }}>
                <BadgeCheck size={14} color="#ea580c" />
                <span style={{ fontSize: 12, fontWeight: 600, color: "#ea580c" }}>
                  RTW {r.days_until_expiry != null && r.days_until_expiry >= 0 ? `Expiring in ${r.days_until_expiry}d` : "Expired"}
                </span>
                <span style={{ fontSize: 11, color: "#64748b" }}>
                  {r.employee_name} — {r.document_type} · {r.expiry_date}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="bg-surface dark:bg-slate-900/40 rounded-xl shadow-sm border border-stroke dark:border-slate-800 overflow-hidden transition-all duration-500">
        <div className="px-6 pt-5 pb-1.5">
          <div className="text-[1.25rem] professional-title text-slate-900 dark:text-white">Key Performance Indicators</div>
          <div className="text-[0.9rem] text-slate-400 dark:text-slate-500 font-medium mt-1">Strategic overview</div>
        </div>

        <div className="p-8 pb-12 grid grid-cols-1 lg:grid-cols-[1fr_260px_1fr] lg:grid-rows-[repeat(3,minmax(110px,auto))] gap-x-24 gap-y-12 items-center">
          <div className="flex justify-center items-center max-lg:col-span-1 lg:col-start-2 lg:row-start-1 lg:row-span-3">
            <motion.div
              initial={{ scale: 0.8, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ duration: 1, type: "spring" }}
              className="relative w-[180px] h-[180px] grid place-items-center"
            >
              <div className="absolute inset-0 rounded-full border-2 border-dashed border-slate-400/60 dark:border-slate-700/60 animate-[spin_20s_linear_infinite]">
                <span className="absolute w-[14px] h-[14px] rounded-full border-[3px] border-surface dark:border-slate-800 shadow-[0_0_15px_rgba(0,0,0,0.1)] -top-[7px] left-1/2 -translate-x-1/2" style={{ backgroundColor: kpiEmp.color }} />
                <span className="absolute w-[14px] h-[14px] rounded-full border-[3px] border-surface dark:border-slate-800 shadow-[0_0_15px_rgba(0,0,0,0.1)] top-[24px] right-[12px]" style={{ backgroundColor: kpiHrs.color }} />
                <span className="absolute w-[14px] h-[14px] rounded-full border-[3px] border-surface dark:border-slate-800 shadow-[0_0_15px_rgba(0,0,0,0.1)] top-1/2 -right-[7px] -translate-y-1/2" style={{ backgroundColor: kpiPay.color }} />
                <span className="absolute w-[14px] h-[14px] rounded-full border-[3px] border-surface dark:border-slate-800 shadow-[0_0_15px_rgba(0,0,0,0.1)] bottom-[24px] right-[12px]" style={{ backgroundColor: kpiShft.color }} />
                <span className="absolute w-[14px] h-[14px] rounded-full border-[3px] border-surface dark:border-slate-800 shadow-[0_0_15px_rgba(0,0,0,0.1)] -bottom-[7px] left-1/2 -translate-x-1/2" style={{ backgroundColor: kpiLvs.color }} />
                <span className="absolute w-[14px] h-[14px] rounded-full border-[3px] border-surface dark:border-slate-800 shadow-[0_0_15px_rgba(0,0,0,0.1)] top-1/2 -left-[7px] -translate-y-1/2" style={{ backgroundColor: kpiTsk.color }} />
              </div>
              <motion.div
                whileHover={{ scale: 1.1, rotate: 5 }}
                className="w-[96px] h-[96px] rounded-3xl bg-surface dark:bg-slate-800 border border-stroke dark:border-slate-700 shadow-[0_15px_40px_rgba(0,0,0,0.1)] flex items-center justify-center text-slate-900 dark:text-white z-10 relative overflow-hidden group"
              >
                <div className="absolute inset-0 bg-gradient-to-br from-indigo-500/10 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
                <Activity size={32} className="text-indigo-600 dark:text-indigo-400 group-hover:animate-pulse" />
              </motion.div>

              {/* Outer Pulse Rings */}
              <motion.div
                animate={{ scale: [1, 1.4, 1], opacity: [0.1, 0, 0.1] }}
                transition={{ duration: 4, repeat: Infinity }}
                className="absolute w-[120px] h-[120px] rounded-full border border-indigo-200"
              />
            </motion.div>
          </div>

          <div className="max-lg:col-span-1 lg:col-start-1 lg:row-start-1">
            <KpiDiagramSide card={kpiEmp} side="left" />
          </div>
          <div className="max-lg:col-span-1 lg:col-start-3 lg:row-start-1">
            <KpiDiagramSide card={kpiHrs} side="right" />
          </div>

          <div className="max-lg:col-span-1 lg:col-start-1 lg:row-start-2">
            <KpiDiagramSide card={kpiTsk} side="left" />
          </div>
          <div className="max-lg:col-span-1 lg:col-start-3 lg:row-start-2">
            <KpiDiagramSide card={kpiPay} side="right" />
          </div>

          <div className="max-lg:col-span-1 lg:col-start-1 lg:row-start-3">
            <KpiDiagramSide card={kpiLvs} side="left" />
          </div>
          <div className="max-lg:col-span-1 lg:col-start-3 lg:row-start-3">
            <KpiDiagramSide card={kpiShft} side="right" />
          </div>
        </div>
      </div>

      {/* ── Row 1: Hours by Employee + Task Status Donut + Leave Status Pie ── */}
      <div className="grid gap-6 grid-cols-1 lg:grid-cols-[2fr_1fr_1fr]">
        <div className="bg-surface dark:bg-slate-900/40 rounded-xl shadow-sm border border-stroke dark:border-slate-800 flex flex-col overflow-hidden">
          <div className="px-6 py-5 border-b border-stroke dark:border-slate-800 flex justify-between items-center">
            <span className="text-[1.05rem] font-bold text-slate-800 dark:text-slate-200">Hours by Employee</span>
            <span className="text-xs font-bold text-indigo-600 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-900/30 px-3 py-1 rounded-full border border-indigo-100 dark:border-indigo-900/50">Last 30 days</span>
          </div>
          <div className="p-5 h-[300px] relative">
            {hoursByEmployee.length ? (
              <Suspense fallback={<ChartPlaceholder />}>
                <BarChart data={hbeData} options={hbeOptions} />
              </Suspense>
            ) : (
              <div className="flex items-center justify-center h-full text-slate-400 dark:text-slate-600 text-sm italic bg-bg dark:bg-slate-950/40 rounded-lg border border-dashed border-stroke dark:border-slate-800">No time data available</div>
            )}
          </div>
        </div>

        <div className="bg-surface dark:bg-slate-900/40 rounded-xl shadow-sm border border-stroke dark:border-slate-800 flex flex-col overflow-hidden">
          <div className="px-6 py-5 border-b border-stroke dark:border-slate-800 flex justify-between items-center">
            <span className="text-[1.05rem] font-bold text-slate-800 dark:text-slate-200">Task Status</span>
          </div>
          <div className="p-5 h-[300px] relative">
            {tsLabels.length ? (
              <Suspense fallback={<ChartPlaceholder />}>
                <DoughnutChart data={tsData} options={donutOptions} />
              </Suspense>
            ) : (
              <div className="flex items-center justify-center h-full text-slate-400 dark:text-slate-600 text-sm italic bg-bg dark:bg-slate-900/50 rounded-lg border border-dashed border-stroke dark:border-slate-800">No tasks</div>
            )}
          </div>
        </div>

        <div className="bg-surface dark:bg-slate-900/40 rounded-xl shadow-sm border border-stroke dark:border-slate-800 flex flex-col overflow-hidden">
          <div className="px-6 py-5 border-b border-stroke dark:border-slate-800 flex justify-between items-center">
            <span className="text-[1.05rem] font-bold text-slate-800 dark:text-slate-200">Leave Status</span>
          </div>
          <div className="p-5 h-[300px] relative">
            {lsLabels.length ? (
              <Suspense fallback={<ChartPlaceholder />}>
                <DoughnutChart data={lsData} options={pieOptions} />
              </Suspense>
            ) : (
              <div className="flex items-center justify-center h-full text-slate-400 dark:text-slate-600 text-sm italic bg-bg dark:bg-slate-900/50 rounded-lg border border-dashed border-stroke dark:border-slate-800">No leave data</div>
            )}
          </div>
        </div>
      </div>

      {/* ── Row 2: Daily Hours Trend (full width) ── */}
      <div className="grid gap-6 grid-cols-1">
        <div className="bg-surface dark:bg-slate-900/40 rounded-xl shadow-sm border border-stroke dark:border-slate-800 flex flex-col overflow-hidden">
          <div className="px-6 py-5 border-b border-stroke dark:border-slate-800 flex justify-between items-center">
            <span className="text-[1.05rem] font-bold text-slate-800 dark:text-slate-200">Daily Hours Trend</span>
            <span className="text-xs font-bold text-indigo-600 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-900/30 px-3 py-1 rounded-full border border-indigo-100 dark:border-indigo-900/50">Last 30 days</span>
          </div>
          <div className="p-5 h-[280px] relative">
            <Suspense fallback={<ChartPlaceholder />}>
              <LineChart data={trendData} options={trendOptions} />
            </Suspense>
          </div>
        </div>
      </div>

      {/* ── Row 3: Attendance + Task Category + Payroll Trend ── */}
      <div className="grid gap-6 grid-cols-1 lg:grid-cols-3">
        <div className="bg-surface dark:bg-slate-900/40 rounded-xl shadow-sm border border-stroke dark:border-slate-800 flex flex-col overflow-hidden">
          <div className="px-6 py-5 border-b border-stroke dark:border-slate-800 flex justify-between items-center">
            <span className="text-[1.05rem] font-bold text-slate-800 dark:text-slate-200">Daily Attendance</span>
            <span className="text-xs font-bold text-indigo-600 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-900/30 px-3 py-1 rounded-full border border-indigo-100 dark:border-indigo-900/50">Last 7 days</span>
          </div>
          <div className="p-5 h-[280px] relative">
            <Suspense fallback={<ChartPlaceholder />}>
              <BarChart data={attData} options={attOptions} />
            </Suspense>
          </div>
        </div>

        <div className="bg-surface dark:bg-slate-900/40 rounded-xl shadow-sm border border-stroke dark:border-slate-800 flex flex-col overflow-hidden">
          <div className="px-6 py-5 border-b border-stroke dark:border-slate-800 flex justify-between items-center">
            <span className="text-[1.05rem] font-bold text-slate-800 dark:text-slate-200">Tasks by Category</span>
          </div>
          <div className="p-5 h-[280px] relative">
            {tcLabels.length ? (
              <Suspense fallback={<ChartPlaceholder />}>
                <BarChart data={tcData} options={tcOptions} />
              </Suspense>
            ) : (
              <div className="flex items-center justify-center h-full text-slate-400 dark:text-slate-600 text-sm italic bg-bg dark:bg-slate-950/40 rounded-lg border border-dashed border-stroke dark:border-slate-800">No categorized tasks</div>
            )}
          </div>
        </div>

        <div className="bg-surface dark:bg-slate-900/40 rounded-xl shadow-sm border border-stroke dark:border-slate-800 flex flex-col overflow-hidden">
          <div className="px-6 py-5 border-b border-stroke dark:border-slate-800 flex justify-between items-center">
            <span className="text-[1.05rem] font-bold text-slate-800 dark:text-slate-200">Payroll Trend</span>
          </div>
          <div className="p-5 h-[280px] relative">
            {payrollTrend.length ? (
              <Suspense fallback={<ChartPlaceholder />}>
                <BarChart data={ptData} options={ptOptions} />
              </Suspense>
            ) : (
              <div className="flex items-center justify-center h-full text-slate-400 dark:text-slate-600 text-sm italic bg-bg dark:bg-slate-900/50 rounded-lg border border-dashed border-stroke dark:border-slate-800">No payroll data</div>
            )}
          </div>
        </div>
      </div>

      {/* ── Row 4: Location-wise Analysis ── */}
      <div className="grid gap-6 grid-cols-1 lg:grid-cols-3">
        <div className="bg-surface dark:bg-slate-900/40 rounded-xl shadow-sm border border-stroke dark:border-slate-800 flex flex-col overflow-hidden">
          <div className="px-6 py-5 border-b border-stroke dark:border-slate-800 flex justify-between items-center">
            <span className="text-[1.05rem] font-bold text-slate-800 dark:text-slate-200">Employees by Location</span>
            <span className="text-xs font-bold text-indigo-600 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-900/30 px-3 py-1 rounded-full border border-indigo-100 dark:border-indigo-900/50">{employeesByLoc.length} locations</span>
          </div>
          <div className="p-5 h-[300px] relative">
            {employeesByLoc.length ? (
              <Suspense fallback={<ChartPlaceholder />}>
                <BarChart data={empLocData} options={empLocOptions} />
              </Suspense>
            ) : (
              <div className="flex items-center justify-center h-full text-slate-400 dark:text-slate-600 text-sm italic bg-bg dark:bg-slate-900/50 rounded-lg border border-dashed border-stroke dark:border-slate-800">No locations configured</div>
            )}
          </div>
        </div>

        <div className="bg-surface dark:bg-slate-900/40 rounded-xl shadow-sm border border-stroke dark:border-slate-800 flex flex-col overflow-hidden">
          <div className="px-6 py-5 border-b border-stroke dark:border-slate-800 flex justify-between items-center">
            <span className="text-[1.05rem] font-bold text-slate-800 dark:text-slate-200">Tasks by Location</span>
            <span className="text-xs font-bold text-indigo-600 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-900/30 px-3 py-1 rounded-full border border-indigo-100 dark:border-indigo-900/50">Active vs Total</span>
          </div>
          <div className="p-5 h-[300px] relative">
            {tasksByLoc.length ? (
              <Suspense fallback={<ChartPlaceholder />}>
                <BarChart data={taskLocData} options={taskLocOptions} />
              </Suspense>
            ) : (
              <div className="flex items-center justify-center h-full text-slate-400 dark:text-slate-600 text-sm italic bg-bg dark:bg-slate-900/50 rounded-lg border border-dashed border-stroke dark:border-slate-800">No location task data</div>
            )}
          </div>
        </div>

        <div className="bg-surface dark:bg-slate-900/40 rounded-xl shadow-sm border border-stroke dark:border-slate-800 flex flex-col overflow-hidden">
          <div className="px-6 py-5 border-b border-stroke dark:border-slate-800 flex justify-between items-center">
            <span className="text-[1.05rem] font-bold text-slate-800 dark:text-slate-200">Hours by Location</span>
            <span className="text-xs font-bold text-indigo-600 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-900/30 px-3 py-1 rounded-full border border-indigo-100 dark:border-indigo-900/50">Last 30 days</span>
          </div>
          <div className="p-5 h-[300px] relative">
            {hoursByLoc.length ? (
              <Suspense fallback={<ChartPlaceholder />}>
                <BarChart data={hrsLocData} options={hrsLocOptions} />
              </Suspense>
            ) : (
              <div className="flex items-center justify-center h-full text-slate-400 dark:text-slate-600 text-sm italic bg-bg dark:bg-slate-900/50 rounded-lg border border-dashed border-stroke dark:border-slate-800">No location hours data</div>
            )}
          </div>
        </div>
      </div>

      {/* ── Row 5: Location Map — Innovative Full-Width ── */}
      <div className="grid gap-6 grid-cols-1">
        <div className="bg-surface dark:bg-slate-900/40 rounded-2xl shadow-sm border border-stroke dark:border-slate-800 overflow-hidden">
          {/* White Header */}
          <div className="bg-surface dark:bg-slate-900/60 border-b border-stroke dark:border-slate-800 px-7 py-5 flex justify-between items-center flex-wrap gap-3">
            <div className="flex flex-col gap-1">
              <div className="flex items-center gap-2.5 text-[1.15rem] professional-title text-slate-900 dark:text-white">
                <MapPin size={20} className="text-indigo-600 dark:text-indigo-400" />
                <span>Location <span className="text-indigo-600 dark:text-indigo-400 italic">Distribution</span> of Employees</span>
              </div>
              <div className="text-[0.82rem] text-slate-500 dark:text-slate-500 font-medium pl-[30px]">
                {locationSummary.length} locations · {locationSummary.reduce((s, l) => s + (l.employees || 0), 0)} total employees
              </div>
            </div>
            <div className="flex gap-4.5">
              <div className="flex items-center gap-1.5 text-[0.78rem] font-bold text-slate-600 dark:text-slate-400 tracking-wide">
                <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.3)]" />
                Clocked In
              </div>
              <div className="flex items-center gap-1.5 text-[0.78rem] font-bold text-slate-600 dark:text-slate-400 tracking-wide ml-4">
                <span className="w-2.5 h-2.5 rounded-full bg-rose-500 shadow-[0_0_8px_rgba(244,63,94,0.3)]" />
                Clocked Out
              </div>
              <div className="flex items-center gap-1.5 text-[0.78rem] font-bold text-slate-600 dark:text-slate-400 tracking-wide ml-4">
                <span className="w-2.5 h-2.5 rounded-full bg-indigo-500 shadow-[0_0_8px_rgba(99,102,241,0.3)]" />
                Assigned
              </div>
            </div>
          </div>

          {/* Map + Sidebar Layout */}
          <div className="flex h-[460px]">
            {/* Sidebar location list */}
            <div className="w-[280px] min-w-[280px] bg-bg dark:bg-slate-900/50 border-r border-stroke dark:border-slate-800 flex flex-col overflow-hidden">
              <div className="px-5 pt-4 pb-2.5 text-xs font-black text-slate-500 dark:text-slate-600 uppercase tracking-widest">Locations by Activity</div>
              {locationSummary.length ? (
                <div className="flex-1 overflow-y-auto px-3 pb-3 scrollbar-hide">
                  {locationSummary.map((loc) => {
                    const isHovered = hoveredLoc === loc.name
                    return (
                      <div
                        key={loc.name}
                        className={`p-3.5 rounded-xl cursor-pointer transition-all duration-200 mb-1 ${isHovered ? 'bg-surface dark:bg-slate-800 shadow-sm border border-stroke dark:border-slate-700' : 'hover:bg-surface dark:hover:bg-slate-800 hover:shadow-sm border border-transparent hover:border-stroke dark:hover:border-slate-700'}`}
                        onMouseEnter={() => setHoveredLoc(loc.name)}
                        onMouseLeave={() => setHoveredLoc(null)}
                      >
                        <div className="flex justify-between items-center mb-1.5">
                          <div className="text-[0.88rem] font-bold text-slate-800 dark:text-slate-200 whitespace-nowrap overflow-hidden text-ellipsis max-w-[180px]">{loc.name}</div>
                          <div className="text-[0.95rem] font-extrabold text-indigo-600 dark:text-indigo-400 min-w-[24px] text-right">{loc.employees || 0}</div>
                        </div>
                        <div className="h-1.5 bg-slate-200 dark:bg-slate-800 rounded-full overflow-hidden mb-1.5">
                          <div
                            className="h-full rounded-full transition-all duration-500 min-w-[4px]"
                            style={{
                              width: `${Math.min(100, Math.max(4, ((loc.employees || 0) / Math.max(1, ...locationSummary.map(l => l.employees || 0))) * 100))}%`,
                              background: (loc.clocked_in_now || 0) > 0 ? '#10B981' : '#6366F1',
                            }}
                          />
                        </div>
                        <div className="flex gap-2.5 text-[0.72rem] font-semibold">
                          {(loc.clocked_in_now || 0) > 0 && (
                            <span className="text-emerald-500">● {loc.clocked_in_now} in</span>
                          )}
                          {(loc.clocked_out_today || 0) > 0 && (
                            <span className="text-rose-500">● {loc.clocked_out_today} out</span>
                          )}
                          {(loc.clocked_in_now || 0) === 0 && (loc.clocked_out_today || 0) === 0 && (
                            <span className="text-slate-400">No activity today</span>
                          )}
                        </div>
                      </div>
                    )
                  })}
                </div>
              ) : (
                <div className="p-10 text-center text-slate-400 italic">No locations</div>
              )}
            </div>

            {/* Map */}
            <div className="flex-1 relative min-h-[300px]">
              {locationSummary.length ? (
                <Suspense fallback={<ChartPlaceholder />}>
                  <DashboardMap locationSummary={locationSummary} />
                </Suspense>
              ) : (
                <div className="flex items-center justify-center h-full text-slate-400 dark:text-slate-600 text-sm italic bg-bg dark:bg-slate-950/40 rounded-lg border border-dashed border-stroke dark:border-slate-800">No locations configured</div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* ── Row 5b: Clock-in Status Bar Chart (Full Width) ── */}
      <div className="grid gap-6 grid-cols-1">
        <div className="bg-surface dark:bg-slate-900/40 rounded-xl shadow-sm border border-stroke dark:border-slate-800 flex flex-col overflow-hidden">
          <div className="px-6 py-5 border-b border-stroke dark:border-slate-800 flex justify-between items-center">
            <span className="text-[1.05rem] font-bold text-slate-800 dark:text-slate-200">Clock-in Status by Location</span>
            <span className="text-xs font-bold text-indigo-600 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-900/30 px-3 py-1 rounded-full border border-indigo-100 dark:border-indigo-900/50">Today</span>
          </div>
          <div className="p-5 h-[320px] relative">
            {locationSummary.length ? (
              <Suspense fallback={<ChartPlaceholder />}>
                <BarChart data={clockLocData} options={clockLocOptions} />
              </Suspense>
            ) : (
              <div className="flex items-center justify-center h-full text-slate-400 dark:text-slate-600 text-sm italic bg-bg dark:bg-slate-950/40 rounded-lg border border-dashed border-stroke dark:border-slate-800">No location data</div>
            )}
          </div>
        </div>
      </div>

      {/* ── Row 6: Location Summary Table ── */}
      <div className="grid gap-6 grid-cols-1">
        <div className="bg-surface dark:bg-slate-900/40 rounded-xl shadow-sm border border-stroke dark:border-slate-800 flex flex-col overflow-hidden">
          <div className="px-6 py-5 border-b border-stroke dark:border-slate-800 flex justify-between items-center">
            <span className="text-[1.05rem] font-bold text-slate-800 dark:text-slate-200">Location Summary</span>
            <span className="text-xs font-bold text-indigo-600 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-900/30 px-3 py-1 rounded-full flex items-center border border-indigo-100 dark:border-indigo-900/50">
              <MapPin size={14} className="mr-1" />
              {locationSummary.length} Locations
            </span>
          </div>
          <div className="p-0 overflow-x-auto">
            {locationSummary.length ? (
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr>
                    <th className="px-6 py-4 text-[11px] font-black text-slate-500 dark:text-slate-500 uppercase tracking-widest bg-bg dark:bg-slate-800/50 border-b border-stroke dark:border-slate-800">Location</th>
                    <th className="px-6 py-4 text-[11px] font-black text-slate-500 dark:text-slate-500 uppercase tracking-widest bg-bg dark:bg-slate-800/50 border-b border-stroke dark:border-slate-800">Address</th>
                    <th className="px-6 py-4 text-[11px] font-black text-slate-500 dark:text-slate-500 uppercase tracking-widest bg-bg dark:bg-slate-800/50 border-b border-stroke dark:border-slate-800">Employees</th>
                    <th className="px-6 py-4 text-[11px] font-black text-slate-500 dark:text-slate-500 uppercase tracking-widest bg-bg dark:bg-slate-800/50 border-b border-stroke dark:border-slate-800">Clocked In</th>
                    <th className="px-6 py-4 text-[11px] font-black text-slate-500 dark:text-slate-500 uppercase tracking-widest bg-bg dark:bg-slate-800/50 border-b border-stroke dark:border-slate-800">Clocked Out</th>
                    <th className="px-6 py-4 text-[11px] font-black text-slate-500 dark:text-slate-500 uppercase tracking-widest bg-bg dark:bg-slate-800/50 border-b border-stroke dark:border-slate-800">Tasks</th>
                    <th className="px-6 py-4 text-[11px] font-black text-slate-500 dark:text-slate-500 uppercase tracking-widest bg-bg dark:bg-slate-800/50 border-b border-stroke dark:border-slate-800 text-right">Hours (30d)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-stroke dark:divide-slate-800">
                  {locationSummary.map((loc) => (
                    <tr key={loc.name} className="hover:bg-bg dark:hover:bg-slate-800/30 transition-colors">
                      <td className="px-6 py-5">
                        <div className="flex items-center gap-3">
                          <div className="w-9 h-9 rounded-full bg-gradient-to-br from-indigo-500 to-indigo-600 text-white flex items-center justify-center font-semibold shadow-sm">
                            <MapPin size={14} />
                          </div>
                          <div className="font-bold text-slate-800 dark:text-slate-200">{loc.name}</div>
                        </div>
                      </td>
                      <td className="px-6 py-5 text-sm text-slate-600 dark:text-slate-400 max-w-[180px] truncate">{loc.address || "—"}</td>
                      <td className="px-6 py-5">
                        <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-bold bg-emerald-50 dark:bg-emerald-900/20 text-emerald-600 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800">
                          {loc.employees}
                        </span>
                      </td>
                      <td className="px-6 py-5">
                        <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-bold bg-emerald-50 dark:bg-emerald-900/20 text-emerald-600 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800">
                          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 mr-1.5" />
                          {loc.clocked_in_now || 0}
                        </span>
                      </td>
                      <td className="px-6 py-5">
                        <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-bold bg-rose-50 dark:bg-rose-900/20 text-rose-600 dark:text-rose-400 border border-rose-200 dark:border-rose-800">
                          <span className="w-1.5 h-1.5 rounded-full bg-rose-500 mr-1.5" />
                          {loc.clocked_out_today || 0}
                        </span>
                      </td>
                      <td className="px-6 py-5 text-sm text-slate-700 dark:text-slate-300 font-medium">{loc.total_tasks}</td>
                      <td className="px-6 py-5 text-sm font-bold text-slate-600 dark:text-slate-400 text-right">{loc.hours}h</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <div className="flex items-center justify-center h-[200px] text-slate-400 dark:text-slate-600 text-sm italic bg-bg dark:bg-slate-950/40 rounded-lg border border-dashed border-stroke dark:border-slate-800 m-6">No locations configured. Add locations in Settings › Locations.</div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
