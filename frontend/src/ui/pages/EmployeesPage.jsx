import { useEffect, useMemo, useRef, useState } from "react"
import { createPortal } from "react-dom"

import { apiRequest, unwrapResults } from "../../api/client.js"
import { useAuth } from "../../state/auth/useAuth.js"
import { useRole } from "../../state/auth/useRole.js"
import { Button, Card, Input, Pill } from "../components/kit.jsx"
import { Loader2, ShieldCheck, ShieldOff, AlertTriangle, ChevronDown, ChevronUp, Users, Edit3, Trash2, X, History, CalendarDays, CheckCircle2, Clock3, AlertCircle, Star, Briefcase, TrendingUp } from "lucide-react"
import { fireSparkleFromEl } from "../sparkle.js"

// ── Exempt status badge ─────────────────────────────────────────────────────
function ExemptBadge({ status }) {
  if (status === "exempt") return (
    <span className="inline-flex items-center gap-1 bg-emerald-50 dark:bg-emerald-900/20 text-emerald-600 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800 rounded-md px-2 py-0.5 text-[10px] font-black uppercase tracking-wider">
      <ShieldCheck size={11} /> EXEMPT
    </span>
  )
  if (status === "non_exempt") return (
    <span className="inline-flex items-center gap-1 bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400 border border-blue-200 dark:border-blue-800 rounded-md px-2 py-0.5 text-[10px] font-black uppercase tracking-wider">
      <ShieldOff size={11} /> NON-EXEMPT
    </span>
  )
  return (
    <span className="inline-flex items-center gap-1 bg-amber-50 dark:bg-amber-900/20 text-amber-600 dark:text-amber-400 border border-amber-200 dark:border-amber-800 rounded-md px-2 py-0.5 text-[10px] font-black uppercase tracking-wider">
      <AlertTriangle size={11} /> PENDING
    </span>
  )
}

function EditEmployeeModal({ employee, onClose, onSave, saving }) {
  const [email, setEmail] = useState(employee.user?.email || "")
  const [firstName, setFirstName] = useState(employee.user?.first_name || "")
  const [lastName, setLastName] = useState(employee.user?.last_name || "")
  const [title, setTitle] = useState(employee.title || "")
  const [hourlyRate, setHourlyRate] = useState(employee.hourly_rate ?? "")
  const [country, setCountry] = useState(employee.country || "US")
  const [state, setState] = useState(employee.state || "")
  const [exemptStatus, setExemptStatus] = useState(employee.exempt_status || "non_exempt")
  const [weeklySalary, setWeeklySalary] = useState(employee.weekly_salary ?? "")
  const [ukTaxCode, setUkTaxCode] = useState(employee.uk_tax_code || "1257L")
  const [ukNiCategory, setUkNiCategory] = useState(employee.uk_ni_category || "A")
  const [rolledUpHolidayPay, setRolledUpHolidayPay] = useState(!!employee.rolled_up_holiday_pay)
  const [isActive, setIsActive] = useState(employee.is_active !== false)

  async function submit() {
    await onSave({
      id: employee.id,
      user: employee.user,
      email,
      first_name: firstName,
      last_name: lastName,
      title,
      hourly_rate: hourlyRate,
      country,
      state,
      exempt_status: exemptStatus,
      weekly_salary: weeklySalary,
      uk_tax_code: ukTaxCode,
      uk_ni_category: ukNiCategory,
      rolled_up_holiday_pay: rolledUpHolidayPay,
      is_active: isActive,
    })
  }

  return (
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-black/40"
      onClick={(e) => { if (e.target === e.currentTarget) onClose() }}
    >
      <div className="w-full max-w-[860px] bg-white dark:bg-slate-950 rounded-3xl border border-stroke dark:border-slate-800 shadow-2xl overflow-hidden">
        <div className="flex items-center justify-between px-8 py-6 border-b border-stroke dark:border-slate-800 bg-surface dark:bg-slate-900/60">
          <div className="flex flex-col">
            <div className="text-xl font-black text-slate-900 dark:text-white tracking-tight">Edit Employee</div>
            <div className="text-xs text-slate-500 dark:text-slate-400 font-bold mt-1">
              {employee.employee_id} · {employee.user?.username || "—"}
            </div>
          </div>
          <button
            type="button"
            className="p-2 rounded-2xl hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-500 dark:text-slate-300"
            onClick={onClose}
            disabled={saving}
          >
            <X size={18} />
          </button>
        </div>

        <div className="p-8 space-y-8">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-x-6 gap-y-4">
            <Input label="Email" value={email} onChange={(e) => setEmail(e.target.value)} />
            <Input label="First name" value={firstName} onChange={(e) => setFirstName(e.target.value)} />
            <Input label="Last name" value={lastName} onChange={(e) => setLastName(e.target.value)} />
            <Input label="Title" value={title} onChange={(e) => setTitle(e.target.value)} />
            <Input label="Hourly rate" value={hourlyRate} onChange={(e) => setHourlyRate(e.target.value)} placeholder="e.g. 18.50" />
            <div className="flex flex-col gap-2">
              <label className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-[0.15em] ml-1">Status</label>
              <button
                type="button"
                className={`h-11 px-4 rounded-xl border border-stroke dark:border-slate-800 text-sm font-black uppercase tracking-widest transition-all ${
                  isActive
                    ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-900/20 dark:text-emerald-300"
                    : "bg-rose-50 text-rose-700 dark:bg-rose-900/20 dark:text-rose-300"
                }`}
                onClick={() => setIsActive(v => !v)}
                disabled={saving}
              >
                {isActive ? "Active" : "Inactive"}
              </button>
            </div>
          </div>

          <div className="rounded-3xl border border-stroke dark:border-slate-800 overflow-hidden bg-surface dark:bg-slate-950/20 shadow-sm">
            <div className="px-8 py-5 bg-surface2 dark:bg-slate-900/50 border-b border-stroke dark:border-slate-800">
              <div className="text-[11px] font-black text-slate-500 dark:text-slate-400 uppercase tracking-widest">Region & Compliance</div>
            </div>

            <div className="p-8 space-y-7">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-x-6 gap-y-4">
                <div className="flex flex-col gap-2">
                  <label className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest ml-1">Country</label>
                  <select
                    value={country}
                    onChange={e => setCountry(e.target.value)}
                    className="w-full h-11 px-4 rounded-xl border border-stroke dark:border-slate-800 bg-bg dark:bg-slate-950/60 text-sm font-bold text-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all appearance-none"
                    disabled={saving}
                  >
                    <option value="US">🇺🇸 United States</option>
                    <option value="UK">🇬🇧 United Kingdom</option>
                  </select>
                </div>

                {country === "US" ? (
                  <>
                    <div className="flex flex-col gap-1">
                      <label className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-[0.15em] ml-1">State (2-letter code)</label>
                      <input
                        className="w-full h-11 px-4 rounded-xl border border-stroke dark:border-slate-800 bg-bg dark:bg-slate-950/60 text-sm font-bold text-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all"
                        value={state}
                        onChange={e => setState(e.target.value.toUpperCase())}
                        maxLength={2}
                        placeholder="e.g. CA"
                        disabled={saving}
                      />
                    </div>
                    <div className="flex flex-col gap-2">
                      <label className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest ml-1">Exempt Status</label>
                      <select
                        value={exemptStatus}
                        onChange={e => setExemptStatus(e.target.value)}
                        className="w-full h-11 px-4 rounded-xl border border-stroke dark:border-slate-800 bg-bg dark:bg-slate-950/60 text-sm font-bold text-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all appearance-none"
                        disabled={saving}
                      >
                        <option value="non_exempt">Non-Exempt</option>
                        <option value="exempt">Exempt</option>
                        <option value="pending">Pending</option>
                      </select>
                    </div>
                    <div className="flex flex-col gap-1 md:col-span-3">
                      <label className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-[0.15em] ml-1">Weekly Salary (USD)</label>
                      <input
                        className="w-full h-11 px-4 rounded-xl border border-stroke dark:border-slate-800 bg-bg dark:bg-slate-950/60 text-sm font-bold text-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all"
                        type="number"
                        value={weeklySalary}
                        onChange={e => setWeeklySalary(e.target.value)}
                        placeholder="e.g. 1200"
                        step="0.01"
                        disabled={saving}
                      />
                    </div>
                  </>
                ) : (
                  <>
                    <div className="flex flex-col gap-1">
                      <label className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-[0.15em] ml-1">Tax Code</label>
                      <input
                        className="w-full h-11 px-4 rounded-xl border border-stroke dark:border-slate-800 bg-bg dark:bg-slate-950/60 text-sm font-bold text-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all"
                        value={ukTaxCode}
                        onChange={e => setUkTaxCode(e.target.value)}
                        disabled={saving}
                      />
                    </div>
                    <div className="flex flex-col gap-2">
                      <label className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest ml-1">NI Category</label>
                      <select
                        value={ukNiCategory}
                        onChange={e => setUkNiCategory(e.target.value)}
                        className="w-full h-11 px-4 rounded-xl border border-stroke dark:border-slate-800 bg-bg dark:bg-slate-950/60 text-sm font-bold text-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all appearance-none"
                        disabled={saving}
                      >
                        <option value="A">A</option>
                        <option value="B">B</option>
                        <option value="C">C</option>
                        <option value="H">H</option>
                        <option value="J">J</option>
                        <option value="M">M</option>
                        <option value="Z">Z</option>
                      </select>
                    </div>
                    <div className="flex items-center gap-3 md:col-span-3">
                      <input
                        id="editRolledUpHolidayPay"
                        type="checkbox"
                        checked={rolledUpHolidayPay}
                        onChange={e => setRolledUpHolidayPay(e.target.checked)}
                        disabled={saving}
                        style={{ width: 18, height: 18, cursor: saving ? "not-allowed" : "pointer" }}
                      />
                      <label htmlFor="editRolledUpHolidayPay" className="text-sm font-bold text-slate-700 dark:text-slate-300">
                        Rolled-up Holiday Pay
                      </label>
                    </div>
                  </>
                )}
              </div>
            </div>
          </div>
        </div>

        <div className="px-8 py-6 border-t border-stroke dark:border-slate-800 bg-surface dark:bg-slate-900/60 flex justify-end gap-3">
          <Button variant="ghost" type="button" onClick={onClose} disabled={saving}>Cancel</Button>
          <Button type="button" onClick={submit} disabled={saving}>
            {saving ? <span className="inline-flex items-center gap-2"><Loader2 className="animate-spin" size={16} />Saving…</span> : "Save changes"}
          </Button>
        </div>
      </div>
    </div>
  )
}

// ── Employee History Drawer ─────────────────────────────────────────────────
function StarRating({ value }) {
  if (!value) return <span className="text-slate-400 dark:text-slate-600 text-xs italic">Not rated</span>
  return (
    <span className="flex items-center gap-0.5">
      {[1,2,3,4,5].map(i => (
        <Star key={i} size={12} className={i <= value ? "text-amber-400 fill-amber-400" : "text-slate-200 dark:text-slate-700"} />
      ))}
      <span className="ml-1 text-xs font-black text-slate-700 dark:text-slate-300">{value}/5</span>
    </span>
  )
}

function LeaveStatusBadge({ status }) {
  const map = {
    approved: "bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400",
    pending: "bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400",
    rejected: "bg-rose-100 dark:bg-rose-900/30 text-rose-700 dark:text-rose-400",
    cancelled: "bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400",
    rework: "bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-400",
  }
  return (
    <span className={`px-2 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider ${map[status] || map.cancelled}`}>
      {status}
    </span>
  )
}

function TaskStatusBadge({ status }) {
  const map = {
    completed: "bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400",
    in_progress: "bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400",
    pending: "bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400",
    cancelled: "bg-slate-100 dark:bg-slate-800 text-slate-500",
  }
  const labels = { completed: "Completed", in_progress: "In Progress", pending: "Pending", cancelled: "Cancelled" }
  return (
    <span className={`px-2 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider ${map[status] || ""}`}>
      {labels[status] || status}
    </span>
  )
}

function EmployeeHistoryDrawer({ employee, onClose }) {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState("overview")

  useEffect(() => {
    setLoading(true)
    apiRequest(`/employees/${employee.id}/history/`)
      .then(res => setData(res?.data || res))
      .catch(() => setData(null))
      .finally(() => setLoading(false))
  }, [employee.id])

  const ts = data?.task_stats || {}
  const ls = data?.leave_summary || {}
  const perf = data?.performance || {}
  const completionRate = ts.total > 0 ? Math.round((ts.completed / ts.total) * 100) : 0

  const TABS = [
    { id: "overview", label: "Overview" },
    { id: "leaves", label: "Leave History" },
    { id: "tasks", label: "Task History" },
    { id: "performance", label: "Performance" },
  ]

  return createPortal(
    <div className="fixed inset-0 z-[9999] flex">
      {/* Backdrop */}
      <div className="flex-1 bg-slate-950/50 backdrop-blur-sm" onClick={onClose} />

      {/* Drawer */}
      <div className="w-full max-w-2xl bg-white dark:bg-slate-900 h-full flex flex-col shadow-2xl border-l border-stroke dark:border-slate-800 overflow-hidden">
        {/* Header */}
        <div className="px-8 py-6 border-b border-stroke dark:border-slate-800 bg-gradient-to-r from-indigo-600 to-violet-600 flex items-center justify-between shrink-0">
          <div>
            <div className="text-xs font-black uppercase tracking-widest text-indigo-200 mb-1">{employee.employee_id}</div>
            <h2 className="text-xl font-black text-white tracking-tight">
              {employee.user?.first_name || employee.user?.username || "Employee"} {employee.user?.last_name || ""}
            </h2>
            <div className="text-indigo-200 text-xs font-semibold mt-0.5">{employee.title || "No title"}</div>
          </div>
          <button onClick={onClose} className="p-2 rounded-xl hover:bg-white/10 text-white/70 hover:text-white transition-colors">
            <X size={20} />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-stroke dark:border-slate-800 bg-surface dark:bg-slate-900/60 shrink-0 overflow-x-auto">
          {TABS.map(t => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`px-5 py-3.5 text-[11px] font-black uppercase tracking-wider whitespace-nowrap transition-all border-b-2 ${
                tab === t.id
                  ? "border-indigo-600 text-indigo-600 dark:text-indigo-400"
                  : "border-transparent text-slate-500 hover:text-slate-900 dark:hover:text-white"
              }`}
            >{t.label}</button>
          ))}
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-8">
          {loading ? (
            <div className="flex items-center justify-center h-48 text-slate-400 gap-3">
              <Loader2 className="animate-spin" size={22} />
              <span className="font-semibold">Loading history…</span>
            </div>
          ) : !data ? (
            <div className="text-center text-rose-500 font-bold py-16">Failed to load history.</div>
          ) : (
            <>
              {/* OVERVIEW TAB */}
              {tab === "overview" && (
                <div className="space-y-6">
                  {/* Task KPIs */}
                  <div>
                    <div className="text-[10px] font-black uppercase tracking-widest text-slate-400 dark:text-slate-500 mb-3 flex items-center gap-2">
                      <Briefcase size={12} /> Work Summary
                    </div>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                      {[
                        { label: "Completed", value: ts.completed, color: "#10b981", bg: "#d1fae5", icon: <CheckCircle2 size={16} /> },
                        { label: "In Progress", value: ts.in_progress, color: "#3b82f6", bg: "#dbeafe", icon: <Clock3 size={16} /> },
                        { label: "Pending", value: ts.pending, color: "#f59e0b", bg: "#fef3c7", icon: <AlertCircle size={16} /> },
                        { label: "Overdue", value: ts.overdue, color: "#ef4444", bg: "#fee2e2", icon: <AlertTriangle size={16} /> },
                      ].map(({ label, value, color, bg, icon }) => (
                        <div key={label} style={{ background: bg, border: `1.5px solid ${color}30` }}
                          className="rounded-2xl p-4 flex flex-col gap-1">
                          <div style={{ color }} className="flex items-center gap-1.5">{icon}
                            <span className="text-[10px] font-black uppercase tracking-wider">{label}</span>
                          </div>
                          <div style={{ color }} className="text-2xl font-black">{value ?? 0}</div>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Completion ring + billed hours */}
                  <div className="grid grid-cols-2 gap-4">
                    <div className="rounded-2xl border border-stroke dark:border-slate-800 p-5 bg-surface dark:bg-slate-900/40">
                      <div className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-2">Completion Rate</div>
                      <div className="text-4xl font-black text-indigo-600 dark:text-indigo-400">{completionRate}%</div>
                      <div className="text-xs text-slate-500 mt-1">{ts.completed} of {ts.total} tasks done</div>
                    </div>
                    <div className="rounded-2xl border border-stroke dark:border-slate-800 p-5 bg-surface dark:bg-slate-900/40">
                      <div className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-2">Billed Hours</div>
                      <div className="text-4xl font-black text-emerald-600 dark:text-emerald-400">{ts.total_billed_hours?.toFixed(1)}h</div>
                      <div className="text-xs text-slate-500 mt-1">Across completed work</div>
                    </div>
                  </div>

                  {/* Leave KPIs */}
                  <div>
                    <div className="text-[10px] font-black uppercase tracking-widest text-slate-400 dark:text-slate-500 mb-3 flex items-center gap-2">
                      <CalendarDays size={12} /> Leave Summary
                    </div>
                    <div className="grid grid-cols-3 gap-3">
                      {[
                        { label: "Days Taken", value: ls.total_approved_days, color: "text-violet-600 dark:text-violet-400" },
                        { label: "Requested", value: ls.total_requested_days, color: "text-amber-600 dark:text-amber-400" },
                        { label: "Came Early", value: ls.days_returned_early, color: "text-emerald-600 dark:text-emerald-400" },
                      ].map(({ label, value, color }) => (
                        <div key={label} className="rounded-2xl border border-stroke dark:border-slate-800 p-4 bg-surface dark:bg-slate-900/40">
                          <div className="text-[10px] font-black uppercase tracking-wider text-slate-400 mb-1">{label}</div>
                          <div className={`text-2xl font-black ${color}`}>{value ?? 0}</div>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Performance quick view */}
                  <div className="rounded-2xl border border-stroke dark:border-slate-800 p-5 bg-surface dark:bg-slate-900/40">
                    <div className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-4 flex items-center gap-2"><TrendingUp size={12}/> Performance</div>
                    <div className="grid grid-cols-2 gap-3">
                      {[
                        { label: "Feedback Rate", val: perf.feedback_rate },
                        { label: "Functionality", val: perf.functionality },
                        { label: "Attitude", val: perf.attitude },
                        { label: "Self Respect", val: perf.self_respect },
                      ].map(({ label, val }) => (
                        <div key={label}>
                          <div className="text-[10px] text-slate-500 font-bold uppercase tracking-wider mb-1">{label}</div>
                          <StarRating value={val} />
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {/* LEAVE HISTORY TAB */}
              {tab === "leaves" && (() => {
                // Helper: enumerate every calendar day between two date strings
                function eachDay(startStr, endStr) {
                  const days = []
                  const cur = new Date(startStr + "T00:00:00")
                  const end = new Date(endStr + "T00:00:00")
                  while (cur <= end) {
                    days.push(cur.toISOString().slice(0, 10))
                    cur.setDate(cur.getDate() + 1)
                  }
                  return days
                }
                function fmtDate(d) {
                  if (!d) return "—"
                  const dt = new Date(d + "T00:00:00")
                  return dt.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" })
                }

                return (
                  <div className="space-y-5">
                    {/* Top summary strip */}
                    {data.leave_summary && (
                      <div className="grid grid-cols-3 gap-2">
                        {[
                          { label: "Total Requests", value: data.leave_summary.total_requests, cls: "text-slate-800 dark:text-slate-200" },
                          { label: "Total Days Taken", value: `${data.leave_summary.total_approved_days}d`, cls: "text-violet-700 dark:text-violet-400" },
                          { label: "Early Returns", value: `${data.leave_summary.days_returned_early}d saved`, cls: "text-emerald-700 dark:text-emerald-400" },
                        ].map(({ label, value, cls }) => (
                          <div key={label} className="rounded-xl border border-stroke dark:border-slate-800 bg-surface dark:bg-slate-900/50 py-2 px-3 text-center">
                            <div className={`text-sm font-black ${cls}`}>{value}</div>
                            <div className="text-[9px] font-black uppercase tracking-wider text-slate-400 mt-0.5">{label}</div>
                          </div>
                        ))}
                      </div>
                    )}

                    {data.leave_history?.length === 0 && (
                      <div className="text-center text-slate-400 py-12 font-semibold">No leave records found.</div>
                    )}

                    {data.leave_history?.map(lv => {
                      const isApproved = lv.status === "approved"
                      const isRejected = lv.status === "rejected"
                      const isCancelled = lv.status === "cancelled"
                      const tookLess = lv.returned_early && lv.actual_days_taken != null

                      // Build day-by-day array for approved leaves
                      const allDays = isApproved ? eachDay(lv.start_date, lv.end_date) : []

                      // Determine each day's state
                      const dayStates = allDays.map(d => {
                        if (lv.early_return_date && d === lv.early_return_date) return "returned"
                        if (lv.early_return_date && d > lv.early_return_date) return "unused"
                        return "leave"
                      })

                      const borderColor = isApproved
                        ? tookLess ? "border-emerald-400 dark:border-emerald-700" : "border-indigo-300 dark:border-indigo-800"
                        : isRejected ? "border-rose-300 dark:border-rose-800"
                        : isCancelled ? "border-slate-300 dark:border-slate-700"
                        : "border-amber-300 dark:border-amber-800"

                      const headerBg = isApproved
                        ? tookLess ? "bg-gradient-to-r from-indigo-50 to-emerald-50 dark:from-indigo-900/20 dark:to-emerald-900/20"
                          : "bg-indigo-50 dark:bg-indigo-900/20"
                        : isRejected ? "bg-rose-50 dark:bg-rose-900/20"
                        : isCancelled ? "bg-slate-50 dark:bg-slate-800/40"
                        : "bg-amber-50 dark:bg-amber-900/20"

                      return (
                        <div key={lv.id} className={`rounded-2xl border-2 ${borderColor} overflow-hidden`}>

                          {/* ── Header ── */}
                          <div className={`${headerBg} px-5 pt-4 pb-3`}>
                            <div className="flex items-start justify-between gap-3">
                              <div className="flex flex-col gap-1.5">
                                <div className="flex items-center gap-2 flex-wrap">
                                  <LeaveStatusBadge status={lv.status} />
                                  <span className="text-xs font-black uppercase tracking-widest text-slate-800 dark:text-slate-200">{lv.leave_type}</span>
                                  <span className={`text-[9px] font-black uppercase px-1.5 py-0.5 rounded-full ${lv.paid ? "bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300" : "bg-rose-100 dark:bg-rose-900/30 text-rose-700"}`}>
                                    {lv.paid ? "Paid" : "Unpaid"}
                                  </span>
                                  {tookLess && (
                                    <span className="text-[9px] font-black uppercase px-1.5 py-0.5 rounded-full bg-emerald-200 dark:bg-emerald-800 text-emerald-800 dark:text-emerald-200">
                                      ↩ Returned Early
                                    </span>
                                  )}
                                </div>
                                {/* Human-readable sentence */}
                                <div className="text-xs font-semibold text-slate-600 dark:text-slate-300 leading-snug">
                                  {isApproved && tookLess && (
                                    <>Approved <strong>{lv.requested_days} day{lv.requested_days !== 1 ? "s" : ""}</strong> leave · took <strong>{lv.actual_days_taken} day{lv.actual_days_taken !== 1 ? "s" : ""}</strong> · <span className="text-emerald-600 dark:text-emerald-400 font-black">{lv.days_saved} day{lv.days_saved !== 1 ? "s" : ""} unused</span></>
                                  )}
                                  {isApproved && !tookLess && (
                                    <>Approved <strong>{lv.requested_days} day{lv.requested_days !== 1 ? "s" : ""}</strong> leave · took <strong>{lv.actual_days_taken ?? lv.requested_days} day{(lv.actual_days_taken ?? lv.requested_days) !== 1 ? "s" : ""}</strong></>
                                  )}
                                  {isRejected && <>Leave request was <strong className="text-rose-600">rejected</strong></>}
                                  {isCancelled && <>Leave request was <strong className="text-slate-500">cancelled</strong></>}
                                  {lv.status === "pending" && <>Leave request is <strong className="text-amber-600">awaiting approval</strong></>}
                                </div>
                              </div>
                              {/* Days requested pill */}
                              <div className="shrink-0 flex flex-col items-center bg-white dark:bg-slate-900 rounded-xl px-3 py-1.5 border border-stroke dark:border-slate-700 shadow-sm">
                                <div className="text-2xl font-black text-slate-900 dark:text-white leading-none">{lv.requested_days}</div>
                                <div className="text-[8px] font-black uppercase tracking-wider text-slate-400">days req.</div>
                              </div>
                            </div>
                          </div>

                          {/* ── Day-by-day pill timeline (approved only) ── */}
                          {isApproved && allDays.length > 0 && (
                            <div className="px-5 py-4 border-t border-stroke dark:border-slate-800 bg-white dark:bg-slate-900/30">
                              <div className="text-[9px] font-black uppercase tracking-widest text-slate-400 mb-3">Leave Timeline — Day by Day</div>
                              <div className="flex flex-wrap gap-2">
                                {allDays.map((day, i) => {
                                  const state = dayStates[i]
                                  const fmt = fmtDate(day)
                                  if (state === "leave") return (
                                    <div key={day} className="flex flex-col items-center gap-1">
                                      <div className="w-9 h-9 rounded-xl bg-indigo-500 dark:bg-indigo-600 flex items-center justify-center shadow-sm">
                                        <span className="text-white text-xs font-black">✓</span>
                                      </div>
                                      <div className="text-[8px] font-black text-indigo-600 dark:text-indigo-400 text-center leading-tight">{fmt.split(" ").slice(0, 2).join(" ")}</div>
                                      <div className="text-[7px] text-slate-400 uppercase font-bold">On Leave</div>
                                    </div>
                                  )
                                  if (state === "returned") return (
                                    <div key={day} className="flex flex-col items-center gap-1">
                                      <div className="w-9 h-9 rounded-xl bg-emerald-500 dark:bg-emerald-600 flex items-center justify-center shadow-sm border-2 border-emerald-300 dark:border-emerald-400">
                                        <span className="text-white text-xs font-black">↩</span>
                                      </div>
                                      <div className="text-[8px] font-black text-emerald-600 dark:text-emerald-400 text-center leading-tight">{fmt.split(" ").slice(0, 2).join(" ")}</div>
                                      <div className="text-[7px] text-emerald-500 uppercase font-bold">Came Back</div>
                                    </div>
                                  )
                                  if (state === "unused") return (
                                    <div key={day} className="flex flex-col items-center gap-1 opacity-60">
                                      <div className="w-9 h-9 rounded-xl border-2 border-dashed border-slate-300 dark:border-slate-600 flex items-center justify-center">
                                        <span className="text-slate-400 text-xs font-black">○</span>
                                      </div>
                                      <div className="text-[8px] font-black text-slate-400 text-center leading-tight">{fmt.split(" ").slice(0, 2).join(" ")}</div>
                                      <div className="text-[7px] text-slate-400 uppercase font-bold line-through">Unused</div>
                                    </div>
                                  )
                                  return null
                                })}
                              </div>

                              {/* Legend */}
                              <div className="flex gap-4 mt-3 pt-2 border-t border-stroke/50 dark:border-slate-800">
                                {[
                                  { color: "bg-indigo-500", label: "On Leave" },
                                  { color: "bg-emerald-500", label: "Came Back Early" },
                                  { color: "bg-transparent border-2 border-dashed border-slate-300", label: "Unused" },
                                ].map(({ color, label }) => (
                                  <div key={label} className="flex items-center gap-1.5">
                                    <div className={`w-3 h-3 rounded-sm ${color}`} />
                                    <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wider">{label}</span>
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}

                          {/* ── Stats row (approved) ── */}
                          {isApproved && (
                            <div className="grid grid-cols-3 divide-x divide-stroke dark:divide-slate-800 border-t border-stroke dark:border-slate-800">
                              <div className="px-4 py-3 text-center">
                                <div className="text-base font-black text-indigo-600 dark:text-indigo-400">{lv.requested_days}d</div>
                                <div className="text-[9px] font-black uppercase text-slate-400 tracking-wider">Approved</div>
                              </div>
                              <div className="px-4 py-3 text-center">
                                <div className="text-base font-black text-slate-800 dark:text-slate-200">{lv.actual_days_taken ?? "—"}d</div>
                                <div className="text-[9px] font-black uppercase text-slate-400 tracking-wider">Actually Taken</div>
                              </div>
                              <div className="px-4 py-3 text-center">
                                <div className={`text-base font-black ${(lv.days_saved ?? 0) > 0 ? "text-emerald-600 dark:text-emerald-400" : "text-slate-400"}`}>{lv.days_saved ?? 0}d</div>
                                <div className="text-[9px] font-black uppercase text-slate-400 tracking-wider">Left Unused</div>
                              </div>
                            </div>
                          )}

                          {/* ── Early return callout ── */}
                          {tookLess && (
                            <div className="mx-5 mb-3 mt-1 flex items-start gap-3 bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-700 rounded-xl px-4 py-3">
                              <span className="text-emerald-500 text-lg leading-none">✓</span>
                              <div>
                                <div className="text-xs font-black text-emerald-700 dark:text-emerald-400">Employee returned to work early</div>
                                <div className="text-[11px] text-emerald-600 dark:text-emerald-500 mt-0.5">
                                  Clocked in on <strong>{fmtDate(lv.early_return_date)}</strong> — {lv.days_saved} day{lv.days_saved !== 1 ? "s" : ""} of leave were unused
                                </div>
                              </div>
                            </div>
                          )}

                          {/* ── Rejection/Cancel reason ── */}
                          {(isRejected || isCancelled) && lv.reason && (
                            <div className={`mx-5 mb-3 mt-1 flex items-start gap-3 rounded-xl px-4 py-3 border ${isRejected ? "bg-rose-50 dark:bg-rose-900/20 border-rose-200 dark:border-rose-700" : "bg-slate-50 dark:bg-slate-800 border-slate-200 dark:border-slate-700"}`}>
                              <span className="text-base">{isRejected ? "✗" : "—"}</span>
                              <div>
                                <div className={`text-xs font-black ${isRejected ? "text-rose-700 dark:text-rose-400" : "text-slate-600 dark:text-slate-400"}`}>
                                  {isRejected ? "Rejection Reason" : "Cancellation Reason"}
                                </div>
                                <div className="text-[11px] text-slate-600 dark:text-slate-400 mt-0.5 italic">"{lv.reason}"</div>
                              </div>
                            </div>
                          )}

                          {/* ── Approved leave notes ── */}
                          {isApproved && lv.reason && (
                            <div className="mx-5 mb-3 text-xs text-slate-500 dark:text-slate-400 italic border-l-2 border-indigo-300 dark:border-indigo-700 pl-3">
                              Note: "{lv.reason}"
                            </div>
                          )}

                          {/* ── Footer: dates & decision ── */}
                          <div className="grid grid-cols-2 gap-4 px-5 py-3 border-t border-stroke dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/20">
                            <div>
                              <div className="text-[9px] font-black uppercase tracking-wider text-slate-400 mb-1">📅 Submitted</div>
                              <div className="text-xs font-bold text-slate-700 dark:text-slate-300">{fmtDate(lv.submitted_date)}</div>
                              <div className="text-[10px] text-slate-400 mt-0.5">{lv.submitted_time}</div>
                            </div>
                            {lv.decision_date ? (
                              <div>
                                <div className={`text-[9px] font-black uppercase tracking-wider mb-1 ${isApproved ? "text-indigo-400" : isRejected ? "text-rose-400" : "text-slate-400"}`}>
                                  {isApproved ? "✅ Approved On" : isRejected ? "❌ Rejected On" : "📋 Decision On"}
                                </div>
                                <div className="text-xs font-bold text-slate-700 dark:text-slate-300">{fmtDate(lv.decision_date)}</div>
                                <div className="text-[10px] text-slate-400 mt-0.5">{lv.decision_time}</div>
                                {lv.approved_by && <div className="text-[10px] text-indigo-500 dark:text-indigo-400 font-bold mt-0.5">by {lv.approved_by}</div>}
                              </div>
                            ) : (
                              <div>
                                <div className="text-[9px] font-black uppercase tracking-wider text-amber-400 mb-1">⏳ Awaiting Decision</div>
                                <div className="text-xs text-slate-400 italic">Not yet reviewed</div>
                              </div>
                            )}
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )
              })()}


              {/* TASK HISTORY TAB */}
              {tab === "tasks" && (
                <div className="space-y-3">
                  {data.task_history?.length === 0 && (
                    <div className="text-center text-slate-400 py-12 font-semibold">No tasks found.</div>
                  )}
                  {data.task_history?.map(t => (
                    <div key={t.id} className="rounded-2xl border border-stroke dark:border-slate-800 p-4 bg-surface dark:bg-slate-900/40 hover:border-indigo-300 dark:hover:border-indigo-700 transition-colors">
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap mb-1">
                            <TaskStatusBadge status={t.status} />
                            <span className="text-[10px] font-black uppercase text-slate-500 tracking-wider">{t.category}</span>
                            <span className="text-[10px] font-black uppercase tracking-wider" style={{
                              color: t.priority === "urgent" ? "#ef4444" : t.priority === "high" ? "#f97316" : t.priority === "medium" ? "#f59e0b" : "#94a3b8"
                            }}>{t.priority}</span>
                          </div>
                          <div className="text-sm font-bold text-slate-900 dark:text-white truncate">{t.title}</div>
                          {t.client_name && <div className="text-xs text-slate-500 mt-0.5">Client: {t.client_name}</div>}
                          <div className="text-xs text-slate-400 mt-0.5">Due: {t.due_date}</div>
                        </div>
                        {t.billed_hours != null && (
                          <div className="text-right shrink-0">
                            <div className="text-base font-black text-indigo-600 dark:text-indigo-400">{t.billed_hours}h</div>
                            <div className="text-[10px] text-slate-400">billed</div>
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* PERFORMANCE TAB */}
              {tab === "performance" && (
                <div className="space-y-6">
                  {perf.rated_at ? (
                    <div className="text-xs text-slate-500 font-semibold">Last rated: {new Date(perf.rated_at).toLocaleDateString()}</div>
                  ) : (
                    <div className="rounded-2xl border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-900/20 p-4 text-amber-700 dark:text-amber-400 text-sm font-semibold">
                      ⚠️ No performance ratings recorded yet for this employee.
                    </div>
                  )}
                  <div className="grid grid-cols-1 gap-5">
                    {[
                      { label: "Feedback Rate", key: "feedback_rate", desc: "Quality of feedback given/received", icon: "💬" },
                      { label: "Functionality", key: "functionality", desc: "Ability to perform assigned duties", icon: "⚙️" },
                      { label: "Attitude", key: "attitude", desc: "Professional conduct and teamwork", icon: "🤝" },
                      { label: "Self Respect", key: "self_respect", desc: "Punctuality, presentation, and ownership", icon: "🏅" },
                    ].map(({ label, key, desc, icon }) => (
                      <div key={key} className="rounded-2xl border border-stroke dark:border-slate-800 p-5 bg-surface dark:bg-slate-900/40">
                        <div className="flex items-center justify-between mb-2">
                          <div>
                            <div className="text-sm font-black text-slate-900 dark:text-white flex items-center gap-2">{icon} {label}</div>
                            <div className="text-xs text-slate-500 mt-0.5">{desc}</div>
                          </div>
                          <StarRating value={perf[key]} />
                        </div>
                        {perf[key] && (
                          <div className="w-full bg-slate-100 dark:bg-slate-800 rounded-full h-1.5 mt-3">
                            <div className="h-1.5 rounded-full bg-indigo-500" style={{ width: `${(perf[key] / 5) * 100}%` }} />
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                  {perf.notes && (
                    <div className="rounded-2xl border border-stroke dark:border-slate-800 p-5 bg-surface dark:bg-slate-900/40">
                      <div className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-2">Admin Notes</div>
                      <p className="text-sm text-slate-700 dark:text-slate-300 italic">"{perf.notes}"</p>
                    </div>
                  )}
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>,
    document.body
  )
}

export function EmployeesPage() {
  const { user } = useAuth()
  const { isAdmin } = useRole()
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")
  const [submitting, setSubmitting] = useState(false)
  const [successMsg, setSuccessMsg] = useState("")
  const submitBtnRef = useRef(null)

  // Core fields
  const [employeeId, setEmployeeId] = useState("")
  const [username, setUsername] = useState("")
  const [password, setPassword] = useState("")
  const [email, setEmail] = useState("")
  const [firstName, setFirstName] = useState("")
  const [lastName, setLastName] = useState("")
  const [title, setTitle] = useState("")
  const [hourlyRate, setHourlyRate] = useState("")

  // Compliance fields
  const [country, setCountry] = useState("US")
  const [state, setState] = useState("")
  const [dateOfBirth, setDateOfBirth] = useState("")
  const [exemptStatus, setExemptStatus] = useState("non_exempt")
  const [weeklySalary, setWeeklySalary] = useState("")
  const [ukTaxCode, setUkTaxCode] = useState("1257L")
  const [ukNiCategory, setUkNiCategory] = useState("A")
  const [rolledUpHolidayPay, setRolledUpHolidayPay] = useState(false)
  const [showComplianceFields, setShowComplianceFields] = useState(false)
  const [showEditModal, setShowEditModal] = useState(false)
  const [editingEmployee, setEditingEmployee] = useState(null)
  const [savingEdit, setSavingEdit] = useState(false)
  const [deletingId, setDeletingId] = useState(null)
  const [historyEmployee, setHistoryEmployee] = useState(null)

  const activeCount = useMemo(() => items.filter((e) => e.is_active).length, [items])

  async function load() {
    setLoading(true)
    setError("")
    try {
      if (!isAdmin) { setItems([]); return }
      const res = await apiRequest("/employees/")
      setItems(unwrapResults(res))
    } catch (err) {
      setError(err?.body?.detail || "Failed to load employees.")
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [isAdmin])

  function openEdit(employee) {
    setEditingEmployee(employee)
    setShowEditModal(true)
  }

  async function saveEdit(data) {
    setSavingEdit(true)
    setError("")
    try {
      const original = items.find(e => e.id === data.id) || editingEmployee
      const payload = {
        username: data.user?.username,
        email: data.email || "",
        first_name: data.first_name || "",
        last_name: data.last_name || "",
        title: data.title || "",
        hourly_rate: data.hourly_rate === "" || data.hourly_rate === null || typeof data.hourly_rate === "undefined" ? 0 : Number(data.hourly_rate),
        country: data.country || null,
        state: data.country === "US" ? (data.state || null) : null,
        exempt_status: data.country === "US" ? (data.exempt_status || "non_exempt") : null,
        weekly_salary: data.country === "US" ? (data.weekly_salary === "" || data.weekly_salary === null || typeof data.weekly_salary === "undefined" ? null : Number(data.weekly_salary)) : null,
        uk_tax_code: data.country === "UK" ? (data.uk_tax_code || null) : null,
        uk_ni_category: data.country === "UK" ? (data.uk_ni_category || null) : null,
        rolled_up_holiday_pay: data.country === "UK" ? !!data.rolled_up_holiday_pay : false,
        is_active: !!data.is_active,
      }

      const res = await apiRequest(`/employees/${data.id}/`, { method: "PATCH", json: payload })
      const updated = res?.data || res
      if (updated && typeof updated === "object") {
        setItems(prev => prev.map(emp => {
          if (emp.id !== data.id) return emp
          const nextUser = updated.user ? { ...(emp.user || {}), ...updated.user } : emp.user
          return { ...emp, ...updated, user: nextUser }
        }))
      }

      const verified = await apiRequest(`/employees/${data.id}/`).catch(() => null)
      const verifiedObj = verified?.data || verified
      if (verifiedObj && typeof verifiedObj === "object") {
        const sameTitle = String(verifiedObj.title || "") === String(payload.title || "")
        const sameRate = Number(verifiedObj.hourly_rate ?? 0) === Number(payload.hourly_rate ?? 0)
        const sameActive = !!verifiedObj.is_active === !!payload.is_active
        const sameEmail = String(verifiedObj.user?.email || verifiedObj.email || "") === String(payload.email || "")
        if (!(sameTitle && sameRate && sameActive && sameEmail) && original) {
          const putPayload = {
            employee_id: original.employee_id,
            username: original.user?.username || payload.username,
            email: payload.email,
            first_name: payload.first_name,
            last_name: payload.last_name,
            title: payload.title,
            hourly_rate: payload.hourly_rate,
            country: payload.country,
            state: payload.state,
            exempt_status: payload.exempt_status,
            weekly_salary: payload.weekly_salary,
            uk_tax_code: payload.uk_tax_code,
            uk_ni_category: payload.uk_ni_category,
            rolled_up_holiday_pay: payload.rolled_up_holiday_pay,
            is_active: payload.is_active,
          }
          const putRes = await apiRequest(`/employees/${data.id}/`, { method: "PUT", json: putPayload })
          const putUpdated = putRes?.data || putRes
          if (putUpdated && typeof putUpdated === "object") {
            setItems(prev => prev.map(emp => {
              if (emp.id !== data.id) return emp
              const nextUser = putUpdated.user ? { ...(emp.user || {}), ...putUpdated.user } : emp.user
              return { ...emp, ...putUpdated, user: nextUser }
            }))
          }
        }
      }

      setSuccessMsg(`Employee "${data.user?.username || data.email || data.id}" updated.`)
      setTimeout(() => setSuccessMsg(""), 6000)
      setShowEditModal(false)
      setEditingEmployee(null)
      await load()
    } catch (err) {
      setError(err?.body?.detail || "Failed to update employee.")
    } finally {
      setSavingEdit(false)
    }
  }

  async function deleteEmployee(employee) {
    if (!window.confirm(`Delete employee "${employee.user?.username || employee.employee_id || employee.id}"?`)) return
    setDeletingId(employee.id)
    setError("")
    try {
      await apiRequest(`/employees/${employee.id}/`, { method: "DELETE" })
      setSuccessMsg("Employee deleted.")
      setTimeout(() => setSuccessMsg(""), 6000)
      await load()
    } catch (err) {
      try {
        await apiRequest(`/employees/${employee.id}/`, { method: "PATCH", json: { is_active: false } })
        setSuccessMsg("Employee deactivated.")
        setTimeout(() => setSuccessMsg(""), 6000)
        await load()
      } catch {
        setError(err?.body?.detail || "Failed to delete employee.")
      }
    } finally {
      setDeletingId(null)
    }
  }

  async function createEmployee(e) {
    e.preventDefault()
    setSubmitting(true)
    setError("")
    try {
      const payload = {
        employee_id: employeeId,
        username, password, email,
        first_name: firstName,
        last_name: lastName,
        title,
        hourly_rate: hourlyRate ? Number(hourlyRate) : 0,
        country: country || null,
        state: state || null,
        date_of_birth: dateOfBirth || null,
        exempt_status: exemptStatus,
        weekly_salary: weeklySalary ? Number(weeklySalary) : null,
        uk_tax_code: country === "UK" ? ukTaxCode : null,
        uk_ni_category: country === "UK" ? ukNiCategory : null,
        rolled_up_holiday_pay: country === "UK" ? rolledUpHolidayPay : false,
      }
      await apiRequest("/employees/", { method: "POST", json: payload })

      // Reset form
      setEmployeeId(""); setUsername(""); setPassword(""); setEmail("")
      setFirstName(""); setLastName(""); setTitle(""); setHourlyRate("")
      setCountry("US"); setState(""); setDateOfBirth(""); setExemptStatus("non_exempt")
      setWeeklySalary(""); setUkTaxCode("1257L"); setUkNiCategory("A"); setRolledUpHolidayPay(false)

      fireSparkleFromEl(submitBtnRef.current)
      setSuccessMsg(`Employee "${username}" created. They can log in at ${window.location.origin} with their username and password.`)
      setTimeout(() => setSuccessMsg(""), 8000)
      await load()
    } catch (err) {
      const msg =
        err?.body?.detail ||
        (err?.body && typeof err.body === "object"
          ? Object.entries(err.body).map(([k, v]) => `${k}: ${v}`).join("; ")
          : "") ||
        "Failed to create employee."
      setError(msg)
    } finally {
      setSubmitting(false)
    }
  }

  if (!isAdmin) {
    return (
      <div className="flex flex-col gap-8">
        <div>
          <h1 className="text-3xl font-extrabold text-slate-900 dark:text-white tracking-tight">Employees</h1>
          <div className="text-slate-500 dark:text-slate-400 mt-1">Admin access required.</div>
        </div>
        <Card><div className="text-slate-400 dark:text-slate-600 italic">You don't have permission to view this page.</div></Card>
      </div>
    )
  }

  return (
    <div className="flex flex-col h-[calc(100vh-var(--header-height,64px))] w-full bg-bg dark:bg-bg overflow-hidden">
      {/* ── HEADER ── */}
      <div className="h-24 bg-surface dark:bg-slate-900/60 border-b border-stroke dark:border-slate-800 px-10 flex items-center justify-between shrink-0 relative overflow-hidden">
        <div className="flex items-center gap-6">
          <div>
            <h1 className="text-2xl professional-title text-slate-900 dark:text-white flex items-center gap-3">
              <Users className="text-indigo-600 dark:text-indigo-400" size={24} />
              Employees
            </h1>
            <div className="flex items-center gap-3 mt-2">
              <span className="text-[10px] professional-subtitle text-slate-500 dark:text-slate-500 uppercase tracking-widest">
                Manage roster, rates, and compliance classification.
              </span>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-4 relative z-10">
          <div className="flex items-center gap-3 px-6 py-3 bg-bg dark:bg-slate-800/50 rounded-2xl border border-stroke dark:border-slate-700">
            <span className="text-[13px] font-black text-slate-700 dark:text-slate-300 tracking-tight uppercase">{items.length} Total</span>
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-10 space-y-10">

        {error && <div className="p-4 bg-rose-50 text-rose-700 border border-rose-200 rounded-lg font-medium">{error}</div>}
        {successMsg && (
          <div className="p-4 bg-emerald-50 text-emerald-700 border border-emerald-200 rounded-lg font-medium flex items-start gap-3">
            <span className="text-lg">✓</span><span>{successMsg}</span>
          </div>
        )}

        <Card title="Create Employee">
          <form className="flex flex-col gap-6" onSubmit={createEmployee}>
            {/* Core fields */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-x-6 gap-y-4">
              <Input label="Employee ID" value={employeeId} onChange={(e) => setEmployeeId(e.target.value)} required />
              <Input label="Username" value={username} onChange={(e) => setUsername(e.target.value)} required />
              <div className="flex flex-col gap-1">
                <Input label="Password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required />
                <div className="text-[10px] text-slate-400 dark:text-slate-500 mt-1 flex gap-1">
                  <span>⚠️</span>
                  <span>This becomes the login password at <strong>{window.location.origin}</strong></span>
                </div>
              </div>
              <Input label="Email" value={email} onChange={(e) => setEmail(e.target.value)} />
              <Input label="First name" value={firstName} onChange={(e) => setFirstName(e.target.value)} />
              <Input label="Last name" value={lastName} onChange={(e) => setLastName(e.target.value)} />
              <Input label="Title" value={title} onChange={(e) => setTitle(e.target.value)} />
              <Input label="Hourly rate" value={hourlyRate} onChange={(e) => setHourlyRate(e.target.value)} placeholder="e.g. 18.50" />
            </div>

            {/* Compliance accordion */}
            <div className="rounded-2xl border border-stroke dark:border-slate-800 overflow-hidden bg-surface dark:bg-slate-950/20 shadow-sm">
              <button
                type="button"
                onClick={() => setShowComplianceFields(v => !v)}
                className="w-full flex items-center justify-between px-6 py-4 bg-surface2 dark:bg-slate-900/50 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors border-none cursor-pointer"
              >
                <div className="flex items-center gap-3">
                  <span className="text-lg">⚖️</span>
                  <span className="text-sm font-black text-slate-900 dark:text-white uppercase tracking-widest">Compliance & Payroll Classification</span>
                </div>
                {showComplianceFields ? <ChevronUp size={18} className="text-slate-400" /> : <ChevronDown size={18} className="text-slate-400" />}
              </button>

              {showComplianceFields && (
                <div className="p-6 flex flex-col gap-8 bg-surface dark:bg-slate-900/40">
                  {/* Region */}
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-x-6 gap-y-4">
                    <div className="flex flex-col gap-2">
                      <label className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest ml-1">Country</label>
                      <select
                        value={country}
                        onChange={e => setCountry(e.target.value)}
                        className="w-full h-11 px-4 rounded-xl border border-stroke dark:border-slate-800 bg-bg dark:bg-slate-950/60 text-sm font-bold text-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all appearance-none"
                      >
                        <option value="US">🇺🇸 United States</option>
                        <option value="UK">🇬🇧 United Kingdom</option>
                      </select>
                    </div>
                    {country === "US" && (
                      <div className="flex flex-col gap-1">
                        <label className="fieldLabel">State (2-letter code)</label>
                        <input
                          className="input"
                          value={state}
                          onChange={e => setState(e.target.value.toUpperCase())}
                          maxLength={2}
                          placeholder="e.g. CA, NY, TX"
                        />
                      </div>
                    )}
                    <div className="flex flex-col gap-1">
                      <label className="fieldLabel">Date of Birth</label>
                      <input
                        className="input"
                        type="date"
                        value={dateOfBirth}
                        onChange={e => setDateOfBirth(e.target.value)}
                      />
                    </div>
                  </div>

                  {/* US FLSA classification */}
                  {country === "US" && (
                    <div className="bg-blue-50/50 dark:bg-blue-900/10 border border-blue-200 dark:border-blue-800 rounded-xl p-5">
                      <div className="font-black text-[11px] text-blue-600 dark:text-blue-400 uppercase tracking-widest mb-4">
                        🇺🇸 US FLSA Classification
                      </div>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-4">
                        <div className="flex flex-col gap-2">
                          <label className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest ml-1">Exempt Status</label>
                          <select
                            value={exemptStatus}
                            onChange={e => setExemptStatus(e.target.value)}
                            className="w-full h-11 px-4 rounded-xl border border-stroke dark:border-slate-800 bg-bg dark:bg-slate-950/60 text-sm font-bold text-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all appearance-none"
                          >
                            <option value="non_exempt">Non-Exempt (eligible for OT pay)</option>
                            <option value="exempt">Exempt (no OT pay required)</option>
                            <option value="pending">Pending Classification</option>
                          </select>
                          <div className="text-[10px] text-slate-500 dark:text-slate-500 mt-1.5 uppercase font-bold tracking-wider">
                            Exempt threshold: $844/week salary + duties test
                          </div>
                        </div>
                        <div className="flex flex-col gap-1">
                          <label className="fieldLabel">Weekly Salary (USD) — for threshold check</label>
                          <input
                            className="input"
                            type="number"
                            value={weeklySalary}
                            onChange={e => setWeeklySalary(e.target.value)}
                            placeholder="e.g. 1200"
                            step="0.01"
                          />
                          {weeklySalary && (
                            <div className={`text-[10px] mt-2 font-black uppercase tracking-wider ${Number(weeklySalary) >= 844 ? "text-emerald-600 dark:text-emerald-400" : "text-rose-600 dark:text-rose-400"}`}>
                              {Number(weeklySalary) >= 844
                                ? "✓ Meets $844/wk FLSA threshold — verify duties test"
                                : "✗ Below $844/wk threshold — likely non-exempt"}
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  )}

                  {/* UK payroll */}
                  {country === "UK" && (
                    <div className="bg-emerald-50/50 dark:bg-emerald-900/10 border border-emerald-200 dark:border-emerald-800 rounded-xl p-5">
                      <div className="font-black text-[11px] text-emerald-600 dark:text-emerald-400 uppercase tracking-widest mb-4">
                        🇬🇧 UK PAYE &amp; NI Settings
                      </div>
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-x-6 gap-y-4">
                        <div className="flex flex-col gap-1">
                          <label className="fieldLabel">Tax Code</label>
                          <input className="input" value={ukTaxCode} onChange={e => setUkTaxCode(e.target.value)} placeholder="e.g. 1257L" />
                          <div className="text-[10px] text-slate-500 dark:text-slate-500 mt-1 uppercase font-bold tracking-wider">Standard personal allowance: 1257L</div>
                        </div>
                        <div className="flex flex-col gap-2">
                          <label className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest ml-1">NI Category Letter</label>
                          <select
                            value={ukNiCategory}
                            onChange={e => setUkNiCategory(e.target.value)}
                            className="w-full h-11 px-4 rounded-xl border border-stroke dark:border-slate-800 bg-bg dark:bg-slate-950/60 text-sm font-bold text-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all appearance-none"
                          >
                            <option value="A">A — Standard (most employees)</option>
                            <option value="B">B — Married women / widows (reduced)</option>
                            <option value="C">C — Over State Pension Age</option>
                            <option value="H">H — Apprentice under 25</option>
                            <option value="J">J — Deferred (another job)</option>
                            <option value="M">M — Under 21</option>
                            <option value="Z">Z — Under 21, deferred</option>
                          </select>
                        </div>
                        <div className="flex flex-col gap-1">
                          <label className="fieldLabel">Rolled-up Holiday Pay</label>
                          <div style={{ display: "flex", alignItems: "center", gap: 10, height: 40 }}>
                            <input
                              type="checkbox"
                              id="rolledUp"
                              checked={rolledUpHolidayPay}
                              onChange={e => setRolledUpHolidayPay(e.target.checked)}
                              style={{ width: 18, height: 18, cursor: "pointer" }}
                            />
                            <label htmlFor="rolledUp" style={{ fontSize: 13, color: "var(--fg)", cursor: "pointer" }}>
                              Add 12.07% holiday pay to each payslip
                            </label>
                          </div>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>

            <div className="pt-1">
              <Button type="submit" disabled={submitting} ref={submitBtnRef} className="min-w-[160px]">
                {submitting ? "Creating…" : "Create employee"}
              </Button>
            </div>
          </form>
        </Card>

        <Card title="Roster">
          {loading ? (
            <div className="text-slate-400 dark:text-slate-600 flex items-center gap-2">
              <Loader2 className="animate-spin" size={16} />Loading…
            </div>
          ) : items.length ? (
            <div className="w-full overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-bg dark:bg-slate-800/50 border-b-2 border-stroke dark:border-slate-800">
                    <th className="px-6 py-4 text-[11px] font-black text-slate-500 dark:text-slate-500 uppercase tracking-widest">ID</th>
                    <th className="px-6 py-4 text-[11px] font-black text-slate-500 dark:text-slate-500 uppercase tracking-widest">User</th>
                    <th className="px-6 py-4 text-[11px] font-black text-slate-500 dark:text-slate-500 uppercase tracking-widest">Title</th>
                    <th className="px-6 py-4 text-[11px] font-black text-slate-500 dark:text-slate-500 uppercase tracking-widest text-right">Rate</th>
                    <th className="px-6 py-4 text-[11px] font-black text-slate-500 dark:text-slate-500 uppercase tracking-widest">Region</th>
                    <th className="px-6 py-4 text-[11px] font-black text-slate-500 dark:text-slate-500 uppercase tracking-widest">Classification</th>
                    <th className="px-6 py-4 text-[11px] font-black text-slate-500 dark:text-slate-500 uppercase tracking-widest">UK Payroll</th>
                    <th className="px-6 py-4 text-[11px] font-black text-slate-500 dark:text-slate-500 uppercase tracking-widest text-right">Status</th>
                    <th className="px-6 py-4 text-[11px] font-black text-slate-500 dark:text-slate-500 uppercase tracking-widest text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-stroke dark:divide-slate-800">
                  {items.map((e) => (
                    <tr key={e.id} className="hover:bg-bg dark:hover:bg-slate-800/30 transition-colors">
                      <td className="px-6 py-5 font-bold text-slate-900 dark:text-white">{e.employee_id}</td>
                      <td className="px-6 py-5 text-slate-600 dark:text-slate-400">
                        <div className="font-bold">{e.user?.username}</div>
                        {(e.user?.email || e.email) && <div className="text-[11px] opacity-60 font-medium">{e.user?.email || e.email}</div>}
                      </td>
                      <td className="px-6 py-5 text-slate-700 dark:text-slate-300">{e.title || "—"}</td>
                      <td className="px-6 py-5 text-right font-black text-slate-900 dark:text-white">
                        {e.country === "UK" ? "£" : "$"}{e.hourly_rate}/hr
                      </td>
                      <td className="px-6 py-5">
                        <div className="text-xs font-black text-slate-800 dark:text-slate-200 uppercase tracking-wider">
                          {e.country === "UK" ? "🇬🇧 UK" : e.country === "US" ? "🇺🇸 US" : (e.country || "—")}
                        </div>
                        {e.state && <div className="text-[10px] text-slate-500 dark:text-slate-500 uppercase font-bold">{e.state}</div>}
                      </td>
                      <td className="px-6 py-5">
                        {e.country === "US" ? (
                          <div className="flex flex-col gap-1.5">
                            <ExemptBadge status={e.exempt_status} />
                            {e.weekly_salary && (
                              <span className="text-[10px] text-slate-500 dark:text-slate-500 font-bold uppercase tracking-tighter">${e.weekly_salary}/wk</span>
                            )}
                            {e.flsa_duties_category && (
                              <span className="text-[9px] text-indigo-500 dark:text-indigo-400 font-black uppercase tracking-widest">{e.flsa_duties_category}</span>
                            )}
                          </div>
                        ) : <span className="text-slate-400 dark:text-slate-600 italic text-xs">N/A</span>}
                      </td>
                      <td className="px-6 py-5">
                        {e.country === "UK" ? (
                          <div className="flex flex-col gap-1.5">
                            <span className="text-xs font-black text-slate-800 dark:text-slate-200">Tax: {e.uk_tax_code || "—"}</span>
                            <span className="text-[10px] text-slate-500 dark:text-slate-500 font-bold uppercase">NI Cat: {e.uk_ni_category || "—"}</span>
                            {e.rolled_up_holiday_pay && (
                              <span className="text-[9px] text-emerald-600 dark:text-emerald-400 font-black uppercase tracking-widest">Rolled-up holiday</span>
                            )}
                            {e.wtr_opt_out_active && (
                              <span className="text-[9px] text-amber-600 dark:text-amber-400 font-black uppercase tracking-widest">48hr opt-out</span>
                            )}
                          </div>
                        ) : <span className="text-slate-400 dark:text-slate-600 italic text-xs">N/A</span>}
                      </td>
                      <td className="px-6 py-5 text-right">
                        <Pill tone={e.is_active ? "good" : "bad"}>{e.is_active ? "active" : "inactive"}</Pill>
                      </td>
                      <td className="px-6 py-5 text-right">
                        <div className="inline-flex items-center gap-2">
                          <button
                            type="button"
                            className="p-2 rounded-xl border border-stroke dark:border-slate-800 hover:bg-violet-50 dark:hover:bg-violet-900/20 text-violet-600 dark:text-violet-400 transition-colors disabled:opacity-40"
                            title="History"
                            onClick={() => setHistoryEmployee(e)}
                            disabled={deletingId === e.id}
                          >
                            <History size={16} />
                          </button>
                          <button
                            type="button"
                            className="p-2 rounded-xl border border-stroke dark:border-slate-800 hover:bg-indigo-50 dark:hover:bg-indigo-900/20 text-indigo-600 dark:text-indigo-400 transition-colors disabled:opacity-40"
                            title="Edit"
                            onClick={() => openEdit(e)}
                            disabled={deletingId === e.id}
                          >
                            <Edit3 size={16} />
                          </button>
                          <button
                            type="button"
                            className="p-2 rounded-xl border border-stroke dark:border-slate-800 hover:bg-rose-50 dark:hover:bg-rose-900/20 text-rose-600 dark:text-rose-400 transition-colors disabled:opacity-40"
                            title="Delete"
                            onClick={() => deleteEmployee(e)}
                            disabled={deletingId === e.id}
                          >
                            <Trash2 size={16} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="text-slate-400 italic">No employees found.</div>
          )}
        </Card>
      </div>

      {showEditModal && editingEmployee && (
        <EditEmployeeModal
          employee={editingEmployee}
          onClose={() => { if (!savingEdit) { setShowEditModal(false); setEditingEmployee(null) } }}
          onSave={saveEdit}
          saving={savingEdit}
        />
      )}
      {historyEmployee && (
        <EmployeeHistoryDrawer
          employee={historyEmployee}
          onClose={() => setHistoryEmployee(null)}
        />
      )}
    </div>
  )
}
