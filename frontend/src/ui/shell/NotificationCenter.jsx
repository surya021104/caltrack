import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { useNavigate } from "react-router-dom"
import { Bell, CheckSquare, Clock, ArrowRight, CalendarDays, Banknote, AlertCircle, LogIn } from "lucide-react"

import { apiRequest, unwrapResults } from "../../api/client.js"
import { useAuth } from "../../state/auth/useAuth.js"
import { useRole } from "../../state/auth/useRole.js"
import { routes } from "../routes.js"

function timeAgo(ts) {
  if (!ts) return ""
  const d = typeof ts === "string" ? new Date(ts) : ts
  const ms = d.getTime()
  if (!Number.isFinite(ms)) return ""
  const diff = Date.now() - ms
  if (diff < 60_000) return "Just now"
  const mins = Math.floor(diff / 60_000)
  if (mins < 60) return `${mins} min${mins === 1 ? "" : "s"} ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs} hour${hrs === 1 ? "" : "s"} ago`
  const days = Math.floor(hrs / 24)
  return `${days} day${days === 1 ? "" : "s"} ago`
}

function parseISODate(value) {
  if (!value) return null
  const d = new Date(value)
  return Number.isFinite(d.getTime()) ? d : null
}

function buildNotifications({ tasks, leaves, shifts, payroll, timesheet, sos, isAdmin }) {
  const now = new Date()
  const out = []

  const taskItems = Array.isArray(tasks) ? tasks : unwrapResults(tasks)
  const actionable = taskItems.filter((t) => t && t.status !== "completed" && t.status !== "cancelled")
  const todayISO = new Date().toISOString().slice(0, 10)
  const overdue = actionable.filter((t) => t.due_date && t.due_date < todayISO)
  const dueSoon = actionable
    .filter((t) => t.due_date && t.due_date >= todayISO)
    .sort((a, b) => String(a.due_date).localeCompare(String(b.due_date)))

  if (overdue.length) {
    const top = overdue.sort((a, b) => String(a.due_date).localeCompare(String(b.due_date)))[0]
    out.push({
      id: `tasks:overdue:${top.id}`,
      kind: "task",
      when: parseISODate(top.due_date),
      to: routes.tasks,
      icon: { bg: "#FEF2F2", fg: "#EF4444", el: <AlertCircle size={16} /> },
      body: (
        <span>
          Overdue: <span style={{ fontWeight: 800 }}>{top.title}</span>
          {overdue.length > 1 ? ` (+${overdue.length - 1} more)` : ""}
        </span>
      ),
    })
  } else if (dueSoon.length) {
    const top = dueSoon[0]
    out.push({
      id: `tasks:due:${top.id}`,
      kind: "task",
      when: parseISODate(top.due_date),
      to: routes.tasks,
      icon: { bg: "#EFF0FE", fg: "#5D5FEF", el: <CheckSquare size={16} /> },
      body: (
        <span>
          Task due soon: <span style={{ fontWeight: 800 }}>{top.title}</span> ({top.due_date})
        </span>
      ),
    })
  }

  const leaveItems = Array.isArray(leaves) ? leaves : unwrapResults(leaves)
  if (isAdmin) {
    const pending = leaveItems.filter((l) => l && l.status === "pending").slice(0, 3)
    for (const l of pending) {
      out.push({
        id: `leave:pending:${l.id}`,
        kind: "leave",
        when: parseISODate(l.start_date),
        to: routes.leaves,
        icon: { bg: "#FFFBEB", fg: "#D97706", el: <CalendarDays size={16} /> },
        body: (
          <span>
            Leave pending: <span style={{ fontWeight: 800 }}>{l.employee_name || "Employee"}</span> ({l.start_date} → {l.end_date})
          </span>
        ),
      })
    }
  } else {
    const pending = leaveItems.filter((l) => l && l.status === "pending").sort((a, b) => (b.id ?? 0) - (a.id ?? 0))[0]
    if (pending) {
      out.push({
        id: `leave:my:pending:${pending.id}`,
        kind: "leave",
        when: parseISODate(pending.start_date),
        to: routes.leaves,
        icon: { bg: "#FFFBEB", fg: "#D97706", el: <CalendarDays size={16} /> },
        body: (
          <span>
            Your leave request is pending ({pending.start_date} → {pending.end_date})
          </span>
        ),
      })
    }
  }

  const shiftItems = Array.isArray(shifts) ? shifts : unwrapResults(shifts)
  const nextShift = shiftItems
    .map((s) => ({
      ...s,
      start: parseISODate(s.shift_start),
      end: parseISODate(s.shift_end),
    }))
    .filter((s) => s.start && s.start.getTime() >= now.getTime())
    .sort((a, b) => a.start.getTime() - b.start.getTime())[0]

  if (nextShift) {
    out.push({
      id: `shift:next:${nextShift.id}`,
      kind: "shift",
      when: nextShift.start,
      to: routes.scheduling,
      icon: { bg: "#EFF0FE", fg: "#5D5FEF", el: <Clock size={16} /> },
      body: (
        <span>
          Next shift: <span style={{ fontWeight: 800 }}>{nextShift.title || "Shift"}</span> ({nextShift.shift_start})
        </span>
      ),
    })
  }

  const payrollItems = Array.isArray(payroll) ? payroll : unwrapResults(payroll)
  const latestPayroll = payrollItems?.[0]
  if (latestPayroll?.period?.end_date && latestPayroll?.net_pay) {
    out.push({
      id: `payroll:latest:${latestPayroll.id}`,
      kind: "payroll",
      when: parseISODate(latestPayroll.period.end_date),
      to: routes.payroll,
      icon: { bg: "#ECFDF5", fg: "#10B981", el: <Banknote size={16} /> },
      body: (
        <span>
          Payroll posted: <span style={{ fontWeight: 800 }}>${latestPayroll.net_pay}</span> (period ending {latestPayroll.period.end_date})
        </span>
      ),
    })
  }

  if (timesheet?.totals?.hours != null) {
    out.push({
      id: `timesheet:range:${timesheet?.range?.start || ""}:${timesheet?.range?.end || ""}`,
      kind: "timesheet",
      when: parseISODate(timesheet?.range?.end),
      to: routes.time,
      icon: { bg: "#EFF0FE", fg: "#5D5FEF", el: <Clock size={16} /> },
      body: (
        <span>
          Timesheet total: <span style={{ fontWeight: 800 }}>{timesheet.totals.hours}</span> hours
        </span>
      ),
    })
  }

  const sosItems = Array.isArray(sos) ? sos : unwrapResults(sos)
  for (const s of sosItems) {
    out.push({
      id: `sos:active:${s.id}`,
      kind: "sos",
      when: parseISODate(s.timestamp),
      to: routes.live_locations,
      icon: { bg: "#FEF2F2", fg: "#E94560", el: <AlertCircle size={16} /> },
      body: (
        <span>
          <span style={{ color: "#E94560", fontWeight: 900 }}>🆘 SOS ALERT:</span>{" "}
          <span style={{ fontWeight: 800 }}>{s.employee_name}</span> needs assistance!
        </span>
      ),
    })
  }

  return out.filter(Boolean)
}

export function NotificationCenter() {
  const { user } = useAuth()
  const { isAdmin } = useRole()
  const navigate = useNavigate()
  const [open, setOpen] = useState(false)
  const ref = useRef(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")
  const [items, setItems] = useState([])
  const [readIds, setReadIds] = useState(() => {
    try {
      const raw = localStorage.getItem("qt.notifications.readIds")
      const parsed = raw ? JSON.parse(raw) : []
      return new Set(Array.isArray(parsed) ? parsed : [])
    } catch {
      return new Set()
    }
  })

  useEffect(() => {
    const handleClick = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false)
    }
    document.addEventListener("mousedown", handleClick)
    return () => document.removeEventListener("mousedown", handleClick)
  }, [])

  function persistReadIds(nextSet) {
    const arr = Array.from(nextSet)
    const capped = arr.slice(-200)
    localStorage.setItem("qt.notifications.readIds", JSON.stringify(capped))
  }

  function markRead(id) {
    setReadIds((prev) => {
      if (prev.has(id)) return prev
      const next = new Set(prev)
      next.add(id)
      persistReadIds(next)
      return next
    })
  }

  function markAllRead() {
    setReadIds((prev) => {
      const next = new Set(prev)
      for (const n of items) next.add(n.id)
      persistReadIds(next)
      return next
    })
  }
  const role = user?.role

  const load = useCallback(async () => {
    if (!role) return
    setLoading(true)
    setError("")
    try {
      const tasksUrl = isAdmin ? "/tasks/admin/" : "/tasks/my/"
      
      // Sequential fetches to avoid connection pool exhaustion (EMAXCONNSESSION)
      let tasks = []; try { tasks = await apiRequest(tasksUrl) } catch(e) {}
      let leaves = []; try { leaves = await apiRequest("/leaves/") } catch(e) {}
      let shifts = []; try { shifts = await apiRequest("/scheduling/shifts/") } catch(e) {}
      let payroll = []; try { payroll = await apiRequest("/payroll/records/") } catch(e) {}
      let sos = []; try { if (isAdmin) sos = await apiRequest("/live-locations/sos/") } catch(e) {}
      let timesheet = null; try { timesheet = await apiRequest("/time/timesheets/") } catch(e) {}

      // ── Early-return / cancel notifications from the backend ──────────
      let backendNotifs = []
      try { backendNotifs = await apiRequest("/leaves/notifications/") } catch(e) {}
      const backendItems = (Array.isArray(backendNotifs) ? backendNotifs : []).map(n => ({
        id: `backend:${n.notif_type}:${n.created_at}`,
        kind: "early_return",
        when: n.created_at ? new Date(n.created_at) : null,
        to: isAdmin ? routes.employees : routes.leaves,
        read: !!n.read,
        icon: { bg: "#d1fae5", fg: "#065f46", el: <LogIn size={16} /> },
        body: (
          <span>
            <strong>{n.title?.replace(/^[🏃✅]\s*/, "")}</strong>
            {n.employee_name ? <span style={{ color: "var(--muted)", fontWeight: 600 }}> · {n.employee_name}</span> : null}<br />
            <span style={{ fontSize: 11, color: "var(--muted)" }}>{n.body}</span>
          </span>
        ),
      }))

      const next = [
        ...backendItems,
        ...buildNotifications({ tasks, leaves, shifts, payroll, timesheet, sos, isAdmin })
      ]
      setItems(next)
    } catch {
      setError("Failed to load notifications.")
      setItems([])
    } finally {
      setLoading(false)
    }
  }, [role])

  useEffect(() => {
    load()
    const t = setInterval(load, 60_000) // 1 minute to catch early returns fast
    return () => clearInterval(t)
  }, [load])

  useEffect(() => {
    if (open) load()
  }, [open, load])

  const unreadCount = useMemo(() => items.filter((n) => !readIds.has(n.id)).length, [items, readIds])

  return (
    <div style={{ position: "relative" }} ref={ref}>
      <button 
        className="btn btnGhost" 
        onClick={() => setOpen(!open)}
        style={{ padding: 8, position: "relative", background: open ? "var(--surface2)" : "transparent" }}
      >
        <Bell size={18} color={open ? "var(--fg)" : "var(--muted)"} />
        <div style={{ position: "absolute", top: 8, right: 8, width: 8, height: 8, background: "#ef4444", borderRadius: "50%", border: "2px solid var(--surface)", display: unreadCount ? "block" : "none" }} />
      </button>

      {open && (
        <div style={{
          position: "absolute", top: "calc(100% + 8px)", right: -12, width: 360,
          background: "var(--surface)", borderRadius: 16,
          boxShadow: "0 10px 40px rgba(0,0,0,0.15), 0 0 0 1px var(--stroke)",
          zIndex: 99999, display: "flex", flexDirection: "column", overflow: "hidden",
          animation: "fadeIn 0.2s ease"
        }}>
          <div style={{ padding: "16px 20px", borderBottom: "1px solid var(--stroke)", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <h3 style={{ margin: 0, fontSize: 14, fontWeight: 800 }}>Notifications</h3>
            <button
              type="button"
              onClick={markAllRead}
              disabled={!items.length || !unreadCount}
              style={{
                background: "none",
                border: "none",
                fontSize: 11,
                color: !items.length || !unreadCount ? "var(--muted)" : "#5d5fef",
                fontWeight: 800,
                cursor: !items.length || !unreadCount ? "default" : "pointer",
                opacity: !items.length || !unreadCount ? 0.7 : 1
              }}
            >
              MARK ALL READ
            </button>
          </div>

          <div style={{ maxHeight: 320, overflowY: "auto", display: "flex", flexDirection: "column" }}>
            {loading ? (
              <div style={{ padding: "18px 20px", color: "var(--muted)", fontSize: 13, fontWeight: 600 }}>
                Loading…
              </div>
            ) : error ? (
              <div style={{ padding: "18px 20px", color: "#B91C1C", fontSize: 13, fontWeight: 700, background: "#FEF2F2" }}>
                {error}
              </div>
            ) : items.length ? (
              items.map((n) => {
                const unread = !readIds.has(n.id)
                return (
                  <div
                    key={n.id}
                    style={{
                      padding: "16px 20px",
                      display: "flex",
                      gap: 16,
                      borderBottom: "1px solid var(--stroke2)",
                      background: "transparent",
                      cursor: "pointer",
                      transition: "background 0.2s",
                    }}
                    onMouseEnter={(e) => (e.currentTarget.style.background = "var(--surface2)")}
                    onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
                    onClick={() => {
                      markRead(n.id)
                      setOpen(false)
                      if (n.to) navigate(n.to)
                    }}
                  >
                    <div
                      style={{
                        width: 32,
                        height: 32,
                        borderRadius: "50%",
                        background: n.icon?.bg || "#EFF0FE",
                        color: n.icon?.fg || "#5D5FEF",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        flexShrink: 0,
                      }}
                    >
                      {n.icon?.el || <Clock size={16} />}
                    </div>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 13, color: "var(--fg)", lineHeight: 1.4, marginBottom: 4 }}>
                        {n.body}
                      </div>
                      <div style={{ fontSize: 11, color: "var(--muted)", fontWeight: 600 }}>
                        {timeAgo(n.when)}
                      </div>
                    </div>
                    {unread ? <div style={{ width: 8, height: 8, background: "#5d5fef", borderRadius: "50%", marginTop: 6 }} /> : null}
                  </div>
                )
              })
            ) : (
              <div style={{ padding: "18px 20px", color: "var(--muted)", fontSize: 13, fontWeight: 700 }}>
                No notifications.
              </div>
            )}
          </div>

          <div style={{ padding: "12px 20px", background: "var(--surface2)", borderTop: "1px solid var(--stroke)", textAlign: "center" }}>
             <button
               type="button"
               onClick={() => {
                 setOpen(false)
                 if (items[0]?.to) navigate(items[0].to)
                 else navigate(routes.dashboard)
               }}
               style={{ background: "none", border: "none", fontSize: 12, fontWeight: 800, color: "var(--muted)", cursor: "pointer", display: "inline-flex", alignItems: "center", gap: 4 }}
             >
               VIEW ALL <ArrowRight size={14} />
             </button>
          </div>
        </div>
      )}
    </div>
  )
}
