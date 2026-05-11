import React, { useEffect, useMemo, useState, useRef, lazy, Suspense } from "react"
import { Clock, Users, Briefcase, CalendarDays, DollarSign, Loader2, AlertCircle, Timer, Activity, MapPin, ShieldAlert, TrendingUp, FileWarning, BadgeCheck, XCircle } from "lucide-react"

import { apiRequest } from "../../api/client.js"
import { useAuth } from "../../state/auth/useAuth.js"

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


export function DashboardPage() {
  const { user } = useAuth()
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
      } catch (_) {}
      try {
        // Wage floor violations
        const wfData = await apiRequest("/compliance/wage-floor/")
        if (!cancelled && wfData?.data?.violations) setWageViolations(wfData.data.violations)
      } catch (_) {}
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
      } catch (_) {}
    }

    if (user) {
      load()
      if (user.role === "admin") loadCompliance()
    }
    return () => { cancelled = true }
  }, [user])

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

  function KpiDiagramSide({ card, side }) {
    const desc = (
      <div className={`flex flex-col ${side === 'left' ? 'items-end text-right max-lg:items-start max-lg:text-left' : 'items-start text-left'} max-w-[320px] mb-2`}>
        <div className="font-bold text-[0.95rem] tracking-[0.02em]" style={{ color: card.color }}>
          {card.value}
        </div>
        <div className="text-slate-400 text-[0.9rem] mt-1">{card.sub}</div>
      </div>
    )

    const pill = (
      <div className={`inline-flex items-center rounded-full min-h-[54px] shadow-[0_10px_22px_rgba(15,23,42,0.08)] px-2.5 py-2 gap-2.5`} style={{ backgroundColor: card.color }}>
        <div className="py-1 px-3">
          <div className="text-white font-bold text-[0.92rem] tracking-[0.01em]">{card.title}</div>
        </div>
        <div className="w-[42px] h-[42px] rounded-full bg-white flex items-center justify-center flex-none">
          <span style={{ color: card.color, display: "flex" }}>{card.icon}</span>
        </div>
      </div>
    )

    const connector = (
      <div className={`flex items-center gap-2 mt-2.5 ${side === 'left' ? 'justify-end max-lg:justify-start' : 'justify-start'}`}>
        <span className="h-[2px] bg-slate-300/35 max-lg:w-[38px] lg:w-[62px]" />
        <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: card.color }} />
      </div>
    )

    if (side === "left") {
      return (
        <div className="grid grid-cols-1 items-center max-lg:justify-items-stretch max-lg:text-left lg:justify-items-end lg:text-right">
          {desc}
          {pill}
          {connector}
        </div>
      )
    }

    return (
      <div className="grid grid-cols-1 items-center max-lg:justify-items-stretch max-lg:text-left lg:justify-items-start lg:text-left">
        {connector}
        {pill}
        {desc}
      </div>
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
      <div className="p-6 max-w-[1600px] mx-auto flex flex-col gap-6 bg-slate-50 min-h-screen">
        <div className="flex items-center justify-center gap-3 h-[50vh] text-slate-500 text-lg font-medium">
          <Loader2 className="animate-spin" size={24} />
          <span>Loading analytics…</span>
        </div>
      </div>
    )
  }

  return (
    <div className="p-6 max-w-[1600px] mx-auto flex flex-col gap-6 bg-slate-50 min-h-screen">
      {error && (
        <div className="flex items-center gap-2 p-4 bg-red-50 text-red-700 rounded-lg border border-red-200 font-medium">
          <AlertCircle size={18} /> {error}
        </div>
      )}

      {/* ── Compliance Risk Banner (admin only) ── */}
      {user?.role === "admin" && !complianceDismissed && (otAlerts.length > 0 || wageViolations.length > 0 || rtwExpiring.length > 0) && (
        <div style={{
          background: "linear-gradient(135deg, #fef3c7 0%, #fde8d8 100%)",
          border: "1.5px solid #f59e0b",
          borderRadius: 14,
          padding: "16px 20px",
          display: "flex",
          flexDirection: "column",
          gap: 12,
          position: "relative",
        }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <ShieldAlert size={22} color="#d97706" />
              <span style={{ fontWeight: 700, fontSize: 15, color: "#92400e" }}>
                Compliance Alerts — Action Required
              </span>
            </div>
            <button
              onClick={() => setComplianceDismissed(true)}
              style={{ background: "none", border: "none", cursor: "pointer", color: "#92400e", display: "flex", alignItems: "center" }}
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

      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
        <div className="px-6 pt-5 pb-1.5">
          <div className="text-[1.25rem] font-bold text-slate-900 tracking-tight">Key Performance Indicators</div>
          <div className="text-[0.9rem] text-slate-400 font-medium mt-1">Strategic overview</div>
        </div>

        <div className="p-[18px] pb-[22px] grid grid-cols-1 lg:grid-cols-[1fr_220px_1fr] lg:grid-rows-[repeat(3,minmax(96px,auto))] gap-x-[18px] gap-y-[14px] items-center">
          <div className="flex justify-center items-center max-lg:col-span-1 lg:col-start-2 lg:row-start-1 lg:row-span-3">
            <div className="relative w-[180px] h-[180px] grid place-items-center">
              <div className="absolute inset-0 rounded-full border-2 border-dashed border-slate-400/60">
                <span className="absolute w-[14px] h-[14px] rounded-full border-[3px] border-white shadow-[0_6px_14px_rgba(15,23,42,0.12)] -top-[7px] left-1/2 -translate-x-1/2" style={{ backgroundColor: kpiEmp.color }} />
                <span className="absolute w-[14px] h-[14px] rounded-full border-[3px] border-white shadow-[0_6px_14px_rgba(15,23,42,0.12)] top-[24px] right-[12px]" style={{ backgroundColor: kpiHrs.color }} />
                <span className="absolute w-[14px] h-[14px] rounded-full border-[3px] border-white shadow-[0_6px_14px_rgba(15,23,42,0.12)] top-1/2 -right-[7px] -translate-y-1/2" style={{ backgroundColor: kpiPay.color }} />
                <span className="absolute w-[14px] h-[14px] rounded-full border-[3px] border-white shadow-[0_6px_14px_rgba(15,23,42,0.12)] bottom-[24px] right-[12px]" style={{ backgroundColor: kpiShft.color }} />
                <span className="absolute w-[14px] h-[14px] rounded-full border-[3px] border-white shadow-[0_6px_14px_rgba(15,23,42,0.12)] -bottom-[7px] left-1/2 -translate-x-1/2" style={{ backgroundColor: kpiLvs.color }} />
                <span className="absolute w-[14px] h-[14px] rounded-full border-[3px] border-white shadow-[0_6px_14px_rgba(15,23,42,0.12)] top-1/2 -left-[7px] -translate-y-1/2" style={{ backgroundColor: kpiTsk.color }} />
              </div>
              <div className="w-[86px] h-[86px] rounded-full bg-white border border-slate-200 shadow-[0_10px_25px_rgba(15,23,42,0.08)] flex items-center justify-center text-slate-900 z-10">
                <Activity size={26} />
              </div>
            </div>
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
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 flex flex-col overflow-hidden">
          <div className="px-6 py-5 border-b border-slate-100 flex justify-between items-center">
            <span className="text-[1.05rem] font-bold text-slate-800">Hours by Employee</span>
            <span className="text-xs font-bold text-indigo-600 bg-indigo-50 px-3 py-1 rounded-full">Last 30 days</span>
          </div>
          <div className="p-5 h-[300px] relative">
            {hoursByEmployee.length ? (
              <Suspense fallback={<ChartPlaceholder />}>
                <BarChart data={hbeData} options={hbeOptions} />
              </Suspense>
            ) : (
              <div className="flex items-center justify-center h-full text-slate-400 text-sm italic bg-slate-50 rounded-lg border border-dashed border-slate-300">No time data available</div>
            )}
          </div>
        </div>

        <div className="bg-white rounded-xl shadow-sm border border-slate-200 flex flex-col overflow-hidden">
          <div className="px-6 py-5 border-b border-slate-100 flex justify-between items-center">
            <span className="text-[1.05rem] font-bold text-slate-800">Task Status</span>
          </div>
          <div className="p-5 h-[300px] relative">
            {tsLabels.length ? (
              <Suspense fallback={<ChartPlaceholder />}>
                <DoughnutChart data={tsData} options={donutOptions} />
              </Suspense>
            ) : (
              <div className="flex items-center justify-center h-full text-slate-400 text-sm italic bg-slate-50 rounded-lg border border-dashed border-slate-300">No tasks</div>
            )}
          </div>
        </div>

        <div className="bg-white rounded-xl shadow-sm border border-slate-200 flex flex-col overflow-hidden">
          <div className="px-6 py-5 border-b border-slate-100 flex justify-between items-center">
            <span className="text-[1.05rem] font-bold text-slate-800">Leave Status</span>
          </div>
          <div className="p-5 h-[300px] relative">
            {lsLabels.length ? (
              <Suspense fallback={<ChartPlaceholder />}>
                <DoughnutChart data={lsData} options={pieOptions} />
              </Suspense>
            ) : (
              <div className="flex items-center justify-center h-full text-slate-400 text-sm italic bg-slate-50 rounded-lg border border-dashed border-slate-300">No leave data</div>
            )}
          </div>
        </div>
      </div>

      {/* ── Row 2: Daily Hours Trend (full width) ── */}
      <div className="grid gap-6 grid-cols-1">
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 flex flex-col overflow-hidden">
          <div className="px-6 py-5 border-b border-slate-100 flex justify-between items-center">
            <span className="text-[1.05rem] font-bold text-slate-800">Daily Hours Trend</span>
            <span className="text-xs font-bold text-indigo-600 bg-indigo-50 px-3 py-1 rounded-full">Last 30 days</span>
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
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 flex flex-col overflow-hidden">
          <div className="px-6 py-5 border-b border-slate-100 flex justify-between items-center">
            <span className="text-[1.05rem] font-bold text-slate-800">Daily Attendance</span>
            <span className="text-xs font-bold text-indigo-600 bg-indigo-50 px-3 py-1 rounded-full">Last 7 days</span>
          </div>
          <div className="p-5 h-[280px] relative">
            <Suspense fallback={<ChartPlaceholder />}>
              <BarChart data={attData} options={attOptions} />
            </Suspense>
          </div>
        </div>

        <div className="bg-white rounded-xl shadow-sm border border-slate-200 flex flex-col overflow-hidden">
          <div className="px-6 py-5 border-b border-slate-100 flex justify-between items-center">
            <span className="text-[1.05rem] font-bold text-slate-800">Tasks by Category</span>
          </div>
          <div className="p-5 h-[280px] relative">
            {tcLabels.length ? (
              <Suspense fallback={<ChartPlaceholder />}>
                <BarChart data={tcData} options={tcOptions} />
              </Suspense>
            ) : (
              <div className="flex items-center justify-center h-full text-slate-400 text-sm italic bg-slate-50 rounded-lg border border-dashed border-slate-300">No categorized tasks</div>
            )}
          </div>
        </div>

        <div className="bg-white rounded-xl shadow-sm border border-slate-200 flex flex-col overflow-hidden">
          <div className="px-6 py-5 border-b border-slate-100 flex justify-between items-center">
            <span className="text-[1.05rem] font-bold text-slate-800">Payroll Trend</span>
          </div>
          <div className="p-5 h-[280px] relative">
            {payrollTrend.length ? (
              <Suspense fallback={<ChartPlaceholder />}>
                <BarChart data={ptData} options={ptOptions} />
              </Suspense>
            ) : (
              <div className="flex items-center justify-center h-full text-slate-400 text-sm italic bg-slate-50 rounded-lg border border-dashed border-slate-300">No payroll data</div>
            )}
          </div>
        </div>
      </div>

      {/* ── Row 4: Location-wise Analysis ── */}
      <div className="grid gap-6 grid-cols-1 lg:grid-cols-3">
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 flex flex-col overflow-hidden">
          <div className="px-6 py-5 border-b border-slate-100 flex justify-between items-center">
            <span className="text-[1.05rem] font-bold text-slate-800">Employees by Location</span>
            <span className="text-xs font-bold text-indigo-600 bg-indigo-50 px-3 py-1 rounded-full">{employeesByLoc.length} locations</span>
          </div>
          <div className="p-5 h-[300px] relative">
            {employeesByLoc.length ? (
              <Suspense fallback={<ChartPlaceholder />}>
                <BarChart data={empLocData} options={empLocOptions} />
              </Suspense>
            ) : (
              <div className="flex items-center justify-center h-full text-slate-400 text-sm italic bg-slate-50 rounded-lg border border-dashed border-slate-300">No locations configured</div>
            )}
          </div>
        </div>

        <div className="bg-white rounded-xl shadow-sm border border-slate-200 flex flex-col overflow-hidden">
          <div className="px-6 py-5 border-b border-slate-100 flex justify-between items-center">
            <span className="text-[1.05rem] font-bold text-slate-800">Tasks by Location</span>
            <span className="text-xs font-bold text-indigo-600 bg-indigo-50 px-3 py-1 rounded-full">Active vs Total</span>
          </div>
          <div className="p-5 h-[300px] relative">
            {tasksByLoc.length ? (
              <Suspense fallback={<ChartPlaceholder />}>
                <BarChart data={taskLocData} options={taskLocOptions} />
              </Suspense>
            ) : (
              <div className="flex items-center justify-center h-full text-slate-400 text-sm italic bg-slate-50 rounded-lg border border-dashed border-slate-300">No location task data</div>
            )}
          </div>
        </div>

        <div className="bg-white rounded-xl shadow-sm border border-slate-200 flex flex-col overflow-hidden">
          <div className="px-6 py-5 border-b border-slate-100 flex justify-between items-center">
            <span className="text-[1.05rem] font-bold text-slate-800">Hours by Location</span>
            <span className="text-xs font-bold text-indigo-600 bg-indigo-50 px-3 py-1 rounded-full">Last 30 days</span>
          </div>
          <div className="p-5 h-[300px] relative">
            {hoursByLoc.length ? (
              <Suspense fallback={<ChartPlaceholder />}>
                <BarChart data={hrsLocData} options={hrsLocOptions} />
              </Suspense>
            ) : (
              <div className="flex items-center justify-center h-full text-slate-400 text-sm italic bg-slate-50 rounded-lg border border-dashed border-slate-300">No location hours data</div>
            )}
          </div>
        </div>
      </div>

      {/* ── Row 5: Location Map — Innovative Full-Width ── */}
      <div className="grid gap-6 grid-cols-1">
        <div className="bg-white rounded-2xl shadow-[0_4px_24px_rgba(15,23,42,0.08)] border border-slate-200 overflow-hidden">
          {/* Dark Gradient Header */}
          <div className="bg-gradient-to-br from-slate-900 via-slate-800 to-slate-700 px-7 py-5 flex justify-between items-center flex-wrap gap-3">
            <div className="flex flex-col gap-1">
              <div className="flex items-center gap-2.5 text-[1.15rem] font-bold text-slate-100 tracking-tight">
                <MapPin size={20} />
                <span>Location <span className="bg-gradient-to-br from-indigo-400 to-indigo-300 text-transparent bg-clip-text italic">Distribution</span> of Employees</span>
              </div>
              <div className="text-[0.82rem] text-slate-400 font-medium pl-[30px]">
                {locationSummary.length} locations · {locationSummary.reduce((s, l) => s + (l.employees || 0), 0)} total employees
              </div>
            </div>
            <div className="flex gap-4.5">
              <div className="flex items-center gap-1.5 text-[0.78rem] font-semibold text-slate-300 tracking-wide">
                <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 shadow-[0_0_6px_rgba(255,255,255,0.15)]" />
                Clocked In
              </div>
              <div className="flex items-center gap-1.5 text-[0.78rem] font-semibold text-slate-300 tracking-wide ml-4">
                <span className="w-2.5 h-2.5 rounded-full bg-rose-500 shadow-[0_0_6px_rgba(255,255,255,0.15)]" />
                Clocked Out
              </div>
              <div className="flex items-center gap-1.5 text-[0.78rem] font-semibold text-slate-300 tracking-wide ml-4">
                <span className="w-2.5 h-2.5 rounded-full bg-indigo-500 shadow-[0_0_6px_rgba(255,255,255,0.15)]" />
                Assigned
              </div>
            </div>
          </div>

          {/* Map + Sidebar Layout */}
          <div className="flex h-[460px]">
            {/* Sidebar location list */}
            <div className="w-[280px] min-w-[280px] bg-slate-50 border-r border-slate-200 flex flex-col overflow-hidden">
              <div className="px-5 pt-4 pb-2.5 text-xs font-bold text-slate-500 uppercase tracking-widest">Locations by Activity</div>
              {locationSummary.length ? (
                <div className="flex-1 overflow-y-auto px-3 pb-3 scrollbar-hide">
                  {locationSummary.map((loc) => {
                    const isHovered = hoveredLoc === loc.name
                    return (
                      <div
                        key={loc.name}
                        className={`p-3.5 rounded-xl cursor-pointer transition-all duration-200 mb-1 ${isHovered ? 'bg-white shadow-[0_2px_8px_rgba(99,102,241,0.1)]' : 'hover:bg-white hover:shadow-[0_2px_8px_rgba(99,102,241,0.1)]'}`}
                        onMouseEnter={() => setHoveredLoc(loc.name)}
                        onMouseLeave={() => setHoveredLoc(null)}
                      >
                        <div className="flex justify-between items-center mb-1.5">
                          <div className="text-[0.88rem] font-bold text-slate-800 whitespace-nowrap overflow-hidden text-ellipsis max-w-[180px]">{loc.name}</div>
                          <div className="text-[0.95rem] font-extrabold text-indigo-600 min-w-[24px] text-right">{loc.employees || 0}</div>
                        </div>
                        <div className="h-1.5 bg-slate-200 rounded-full overflow-hidden mb-1.5">
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
                <div className="flex items-center justify-center h-full text-slate-400 text-sm italic bg-slate-50 rounded-lg border border-dashed border-slate-300">No locations configured</div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* ── Row 5b: Clock-in Status Bar Chart (Full Width) ── */}
      <div className="grid gap-6 grid-cols-1">
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 flex flex-col overflow-hidden">
          <div className="px-6 py-5 border-b border-slate-100 flex justify-between items-center">
            <span className="text-[1.05rem] font-bold text-slate-800">Clock-in Status by Location</span>
            <span className="text-xs font-bold text-indigo-600 bg-indigo-50 px-3 py-1 rounded-full">Today</span>
          </div>
          <div className="p-5 h-[320px] relative">
            {locationSummary.length ? (
              <Suspense fallback={<ChartPlaceholder />}>
                <BarChart data={clockLocData} options={clockLocOptions} />
              </Suspense>
            ) : (
              <div className="flex items-center justify-center h-full text-slate-400 text-sm italic bg-slate-50 rounded-lg border border-dashed border-slate-300">No location data</div>
            )}
          </div>
        </div>
      </div>

      {/* ── Row 6: Location Summary Table ── */}
      <div className="grid gap-6 grid-cols-1">
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 flex flex-col overflow-hidden">
          <div className="px-6 py-5 border-b border-slate-100 flex justify-between items-center">
            <span className="text-[1.05rem] font-bold text-slate-800">Location Summary</span>
            <span className="text-xs font-bold text-indigo-600 bg-indigo-50 px-3 py-1 rounded-full flex items-center">
              <MapPin size={14} className="mr-1" />
              {locationSummary.length} Locations
            </span>
          </div>
          <div className="p-0 overflow-x-auto">
            {locationSummary.length ? (
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr>
                    <th className="px-6 py-3 text-xs font-bold text-slate-500 uppercase tracking-wider bg-slate-50 border-b-2 border-slate-200">Location</th>
                    <th className="px-6 py-3 text-xs font-bold text-slate-500 uppercase tracking-wider bg-slate-50 border-b-2 border-slate-200">Address</th>
                    <th className="px-6 py-3 text-xs font-bold text-slate-500 uppercase tracking-wider bg-slate-50 border-b-2 border-slate-200">Employees</th>
                    <th className="px-6 py-3 text-xs font-bold text-slate-500 uppercase tracking-wider bg-slate-50 border-b-2 border-slate-200">Clocked In</th>
                    <th className="px-6 py-3 text-xs font-bold text-slate-500 uppercase tracking-wider bg-slate-50 border-b-2 border-slate-200">Clocked Out</th>
                    <th className="px-6 py-3 text-xs font-bold text-slate-500 uppercase tracking-wider bg-slate-50 border-b-2 border-slate-200">Tasks</th>
                    <th className="px-6 py-3 text-xs font-bold text-slate-500 uppercase tracking-wider bg-slate-50 border-b-2 border-slate-200">Hours (30d)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {locationSummary.map((loc) => (
                    <tr key={loc.name} className="hover:bg-slate-50 transition-colors">
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-3">
                          <div className="w-9 h-9 rounded-full bg-gradient-to-br from-indigo-500 to-indigo-600 text-white flex items-center justify-center font-semibold shadow-sm">
                            <MapPin size={14} />
                          </div>
                          <div className="font-bold text-slate-800">{loc.name}</div>
                        </div>
                      </td>
                      <td className="px-6 py-4 text-sm text-slate-600 max-w-[180px] truncate">{loc.address || "—"}</td>
                      <td className="px-6 py-4">
                        <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-bold bg-emerald-50 text-emerald-600 border border-emerald-200">
                          {loc.employees}
                        </span>
                      </td>
                      <td className="px-6 py-4">
                        <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-bold bg-emerald-50 text-emerald-600 border border-emerald-200">
                          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 mr-1.5" />
                          {loc.clocked_in_now || 0}
                        </span>
                      </td>
                      <td className="px-6 py-4">
                        <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-bold bg-rose-50 text-rose-600 border border-rose-200">
                          <span className="w-1.5 h-1.5 rounded-full bg-rose-500 mr-1.5" />
                          {loc.clocked_out_today || 0}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-sm text-slate-700 font-medium">{loc.total_tasks}</td>
                      <td className="px-6 py-4 text-sm font-bold text-slate-600">{loc.hours}h</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <div className="flex items-center justify-center h-[200px] text-slate-400 text-sm italic bg-slate-50 rounded-lg border border-dashed border-slate-300 m-6">No locations configured. Add locations in Settings › Locations.</div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
