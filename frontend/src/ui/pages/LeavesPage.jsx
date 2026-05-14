import { useEffect, useMemo, useRef, useState } from "react"

import { apiRequest, unwrapResults } from "../../api/client.js"
import { useAuth } from "../../state/auth/useAuth.js"
import { Button, Card, Input, Pill, Select, TextArea } from "../components/kit.jsx"
import { CalendarDays } from "lucide-react"
import { fireSparkleFromEl } from "../sparkle.js"

const LEAVE_TYPES = [
  { label: "Vacation", value: "vacation" },
  { label: "Sick", value: "sick" },
  { label: "Unpaid", value: "unpaid" }
]

function toneForStatus(status) {
  if (status === "approved") return "good"
  if (status === "rejected") return "bad"
  return "warn"
}

function formatEmployeeId(value) {
  if (!value) return ""
  const s = String(value).trim()
  const m = /^EMP(\d+)$/i.exec(s.replace(/\s+/g, ""))
  if (m) return `EMP ${m[1].padStart(3, "0")}`
  return s
}

export function LeavesPage() {
  const { user } = useAuth()
  const isAdmin = user?.role === "admin" || user?.role === "manager"
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [busyId, setBusyId] = useState(null)
  const [error, setError] = useState("")
  const submitBtnRef = useRef(null)

  const [leaveType, setLeaveType] = useState("vacation")
  const [startDate, setStartDate] = useState("")
  const [endDate, setEndDate] = useState("")
  const [reason, setReason] = useState("")
  const [submitting, setSubmitting] = useState(false)

  const pendingCount = useMemo(() => items.filter((i) => i.status === "pending").length, [items])

  async function load() {
    setLoading(true)
    setError("")
    try {
      const res = await apiRequest("/leaves/")
      setItems(unwrapResults(res))
    } catch (err) {
      setError(err?.body?.detail || "Failed to load leave requests.")
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
  }, [])

  async function submit(e) {
    e.preventDefault()
    setSubmitting(true)
    setError("")
    try {
      await apiRequest("/leaves/", {
        method: "POST",
        json: { leave_type: leaveType, start_date: startDate, end_date: endDate, reason }
      })
      setStartDate("")
      setEndDate("")
      setReason("")
      fireSparkleFromEl(submitBtnRef.current)
      await load()
    } catch (err) {
      const msg =
        err?.body?.detail ||
        err?.body?.end_date ||
        (typeof err?.body === "string" ? err.body : "") ||
        "Failed to submit leave request."
      setError(Array.isArray(msg) ? msg.join(" ") : String(msg))
    } finally {
      setSubmitting(false)
    }
  }

  async function decide(id, verb) {
    setBusyId(id)
    setError("")
    try {
      await apiRequest(`/leaves/${id}/${verb}/`, { method: "POST" })
      await load()
    } catch (err) {
      setError(err?.body?.detail || "Failed to update request.")
    } finally {
      setBusyId(null)
    }
  }

  return (
    <div className="flex flex-col h-[calc(100vh-var(--header-height,64px))] w-full bg-bg dark:bg-bg overflow-hidden">
      {/* ── HEADER ── */}
      <div className="h-24 bg-surface dark:bg-slate-900/60 border-b border-stroke dark:border-slate-800 px-10 flex items-center justify-between shrink-0 relative overflow-hidden">
        <div className="flex items-center gap-6">
          <div>
            <h1 className="text-2xl professional-title text-slate-900 dark:text-white flex items-center gap-3">
              <CalendarDays className="text-indigo-600 dark:text-indigo-500" size={24} />
              Leaves
            </h1>
            <div className="flex items-center gap-3 mt-2">
              <span className="text-[10px] professional-subtitle text-slate-500 dark:text-slate-500 uppercase tracking-widest">
                Request time off, track approvals, keep the team aligned.
              </span>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-4 relative z-10">
          <div className="flex items-center gap-3 px-6 py-3 bg-bg dark:bg-slate-950/40 rounded-2xl border border-stroke dark:border-slate-800 shadow-sm">
            <CalendarDays size={18} className="text-slate-400 dark:text-slate-600" />
            <span className="text-[13px] font-black text-slate-700 dark:text-slate-300 tracking-tight uppercase tracking-widest">{pendingCount} Pending</span>
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-10 space-y-10" style={{ animation: "fadeUp 0.4s ease both" }}>

      {error ? <div className="p-4 bg-rose-500/10 border border-rose-500/20 rounded-xl text-rose-600 dark:text-rose-400 text-sm font-bold">{error}</div> : null}

      {!isAdmin ? (
        <Card title="New Leave Request">
          <form className="grid gap-6 md:grid-cols-2" onSubmit={submit}>
            <Select label="Type" value={leaveType} onChange={(e) => setLeaveType(e.target.value)} options={LEAVE_TYPES} />
            <div className="flex flex-col md:flex-row gap-4">
              <Input label="Start" type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} required />
              <Input label="End" type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} required />
            </div>
            <div className="md:col-span-2">
              <TextArea label="Reason" value={reason} onChange={(e) => setReason(e.target.value)} rows={3} />
            </div>
            <div className="md:col-span-2 flex justify-end">
              <Button type="submit" disabled={submitting} ref={submitBtnRef} className="px-10 h-14 rounded-2xl text-base font-black shadow-xl shadow-indigo-500/20">
                {submitting ? "Submitting…" : "Submit request"}
              </Button>
            </div>
          </form>
        </Card>
      ) : null}

      <Card title={isAdmin ? "All Requests" : "My Requests"}>
        {loading ? (
          <div className="text-slate-400 dark:text-slate-600 italic">Loading requests…</div>
        ) : items.length ? (
          <div className="w-full border-separate border-spacing-y-2">
            <div className="flex items-center px-6 py-4 text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest border-b border-stroke dark:border-slate-800/50 mb-2">
              <div className="flex-1">Employee ID</div>
              <div className="w-32">Type</div>
              <div className="w-40">Start</div>
              <div className="w-40">End</div>
              <div className="w-32">Status</div>
              <div className="w-48 text-right">Actions</div>
            </div>
            <div className="space-y-3">
              {items.map((i) => (
                <div key={i.id} className="flex items-center px-6 py-5 bg-bg dark:bg-slate-950/40 rounded-2xl border border-stroke dark:border-slate-800 hover:border-indigo-500/30 transition-all group">
                  <div className="flex-1">
                    <div className="text-sm font-black text-slate-900 dark:text-white tracking-tight">
                      {i.employee ? formatEmployeeId(i.employee) : "—"}
                    </div>
                    {isAdmin && i.employee_name ? <div className="text-[10px] text-slate-400 dark:text-slate-500 font-bold uppercase tracking-wide mt-1">{i.employee_name}</div> : null}
                  </div>
                  <div className="w-32 text-sm font-bold text-slate-600 dark:text-slate-400 capitalize">{i.leave_type}</div>
                  <div className="w-40 text-sm font-medium text-slate-500 dark:text-slate-400">{i.start_date}</div>
                  <div className="w-40 text-sm font-medium text-slate-500 dark:text-slate-400">{i.end_date}</div>
                  <div className="w-32">
                    <Pill tone={toneForStatus(i.status)}>{i.status}</Pill>
                  </div>
                  <div className="w-48 flex justify-end gap-2">
                    {isAdmin && i.status === "pending" ? (
                      <div className="flex gap-2">
                        <Button variant="ghost" disabled={busyId === i.id} onClick={() => decide(i.id, "approve")} type="button" className="h-9 px-4 text-[10px] font-black uppercase tracking-widest">
                          Approve
                        </Button>
                        <Button variant="danger" disabled={busyId === i.id} onClick={() => decide(i.id, "reject")} type="button" className="h-9 px-4 text-[10px] font-black uppercase tracking-widest">
                          Reject
                        </Button>
                      </div>
                    ) : (
                      <span className="text-slate-400 dark:text-slate-700 text-xs">—</span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        ) : (
          <div className="text-center py-20 bg-bg dark:bg-slate-950/20 rounded-3xl border border-dashed border-stroke dark:border-slate-800">
            <CalendarDays size={48} className="mx-auto text-slate-200 dark:text-slate-800 mb-4" />
            <div className="text-slate-400 dark:text-slate-600 font-bold uppercase tracking-widest text-sm">No leave requests found</div>
          </div>
        )}
      </Card>
      </div>
    </div>
  )
}

