import { useEffect, useMemo, useRef, useState } from "react"
import { createPortal } from "react-dom"

import { apiRequest, unwrapResults } from "../../api/client.js"
import { useAuth } from "../../state/auth/useAuth.js"
import { Button, Card, Input, Pill, Select, TextArea } from "../components/kit.jsx"
import { CalendarDays, X, AlertTriangle } from "lucide-react"
import { fireSparkleFromEl } from "../sparkle.js"

const LEAVE_TYPES = [
  { label: "Vacation", value: "vacation" },
  { label: "Sick", value: "sick" },
  { label: "Unpaid", value: "unpaid" }
]

function toneForStatus(status) {
  if (status === "approved") return "good"
  if (status === "rejected") return "bad"
  if (status === "cancelled") return "neutral"
  if (status === "rework") return "warn"
  if (status === "pending_cancel") return "warn"
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

  // Edit / Reassign workflow states
  const [editingItem, setEditingItem] = useState(null)
  const [editLeaveType, setEditLeaveType] = useState("vacation")
  const [editStartDate, setEditStartDate] = useState("")
  const [editEndDate, setEditEndDate] = useState("")
  const [editReason, setEditReason] = useState("")
  const [editSubmitting, setEditSubmitting] = useState(false)

  const pendingCount = useMemo(() => items.filter((i) => i.status === "pending").length, [items])
  const [cancelTarget, setCancelTarget] = useState(null) // leave item to cancel

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

  async function confirmCancel(item) {
    setBusyId(item.id)
    setError("")
    setCancelTarget(null)
    try {
      await apiRequest(`/leaves/${item.id}/cancel/`, { method: "POST" })
      await load()
    } catch (err) {
      setError(err?.body?.detail || "Failed to cancel leave.")
    } finally {
      setBusyId(null)
    }
  }

  function startEdit(item) {
    setEditingItem(item)
    setEditLeaveType(item.leave_type)
    setEditStartDate(item.start_date)
    setEditEndDate(item.end_date)
    setEditReason(item.reason || "")
  }

  async function handleEditSubmit(e) {
    e.preventDefault()
    if (!editingItem) return
    setEditSubmitting(true)
    setError("")
    try {
      await apiRequest(`/leaves/${editingItem.id}/`, {
        method: "PATCH",
        json: {
          leave_type: editLeaveType,
          start_date: editStartDate,
          end_date: editEndDate,
          reason: editReason
        }
      })
      setEditingItem(null)
      await load()
    } catch (err) {
      const msg =
        err?.body?.detail ||
        err?.body?.end_date ||
        (typeof err?.body === "string" ? err.body : "") ||
        "Failed to update leave request."
      setError(Array.isArray(msg) ? msg.join(" ") : String(msg))
    } finally {
      setEditSubmitting(false)
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
              <div className="w-32 shrink-0">Type</div>
              <div className="w-40 shrink-0">Start</div>
              <div className="w-40 shrink-0">End</div>
              <div className="w-32 shrink-0">Status</div>
              <div className="w-80 shrink-0 text-right">Actions</div>
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
                  <div className="w-32 shrink-0 text-sm font-bold text-slate-600 dark:text-slate-400 capitalize">{i.leave_type}</div>
                  <div className="w-40 shrink-0 text-sm font-medium text-slate-500 dark:text-slate-400">{i.start_date}</div>
                  <div className="w-40 shrink-0 text-sm font-medium text-slate-500 dark:text-slate-400">{i.end_date}</div>
                  <div className="w-32 shrink-0">
                    <Pill tone={toneForStatus(i.status)}>{i.status}</Pill>
                  </div>
                  <div className="w-80 shrink-0 flex justify-end gap-2">
                    {isAdmin ? (
                      <div className="flex gap-2">
                        {i.status === "pending" && (
                          <>
                            <Button variant="ghost" disabled={busyId === i.id} onClick={() => decide(i.id, "approve")} type="button" className="h-9 px-3 text-[10px] font-black uppercase tracking-widest text-emerald-600 dark:text-emerald-500 hover:bg-emerald-500/10">
                              Approve
                            </Button>
                            <Button variant="ghost" disabled={busyId === i.id} onClick={() => decide(i.id, "rework")} type="button" className="h-9 px-3 text-[10px] font-black uppercase tracking-widest text-amber-600 dark:text-amber-500 hover:bg-amber-500/10">
                              Rework
                            </Button>
                            <Button variant="danger" disabled={busyId === i.id} onClick={() => decide(i.id, "reject")} type="button" className="h-9 px-3 text-[10px] font-black uppercase tracking-widest">
                              Reject
                            </Button>
                          </>
                        )}
                        {i.status === "pending_cancel" && (
                          <>
                            <Button variant="ghost" disabled={busyId === i.id} onClick={() => decide(i.id, "approve")} type="button" className="h-9 px-3 text-[10px] font-black uppercase tracking-widest text-emerald-600 dark:text-emerald-500 hover:bg-emerald-500/10">
                              Reject Cancel
                            </Button>
                            <Button variant="ghost" disabled={busyId === i.id} onClick={() => decide(i.id, "rework")} type="button" className="h-9 px-3 text-[10px] font-black uppercase tracking-widest text-amber-600 dark:text-amber-500 hover:bg-amber-500/10">
                              Rework
                            </Button>
                            <Button variant="danger" disabled={busyId === i.id} onClick={() => decide(i.id, "cancel")} type="button" className="h-9 px-3 text-[10px] font-black uppercase tracking-widest">
                              Approve Cancel
                            </Button>
                          </>
                        )}
                        {i.status === "approved" && (
                          <Button variant="danger" disabled={busyId === i.id} onClick={() => decide(i.id, "cancel")} type="button" className="h-9 px-4 text-[10px] font-black uppercase tracking-widest">
                            Cancel Leave
                          </Button>
                        )}
                        {i.status === "cancelled" && (
                          <span className="text-slate-400 dark:text-slate-700 text-[10px] font-black uppercase tracking-widest self-center py-1">Cancelled</span>
                        )}
                        {i.status === "rejected" && (
                          <span className="text-slate-400 dark:text-slate-700 text-[10px] font-black uppercase tracking-widest self-center py-1">Rejected</span>
                        )}
                        {i.status === "rework" && (
                          <span className="text-amber-500 dark:text-amber-400 text-[10px] font-black uppercase tracking-widest self-center py-1">Awaiting Rework</span>
                        )}
                      </div>
                    ) : (
                      <div className="flex gap-2">
                        {(i.status === "pending" || i.status === "approved") ? (
                          <Button
                            variant="danger"
                            disabled={busyId === i.id}
                            onClick={() => {
                              if (i.status === "approved") {
                                // Show confirmation modal for active approved leave
                                setCancelTarget(i)
                              } else {
                                decide(i.id, "cancel")
                              }
                            }}
                            type="button"
                            className="h-9 px-4 text-[10px] font-black uppercase tracking-widest"
                          >
                            {i.status === "approved" ? "Cancel Remaining Leave" : "Cancel Leave"}
                          </Button>
                        ) : i.status === "pending_cancel" ? (
                          <span className="text-amber-500 dark:text-amber-400 text-[10px] font-black uppercase tracking-widest self-center py-1">Cancellation Requested</span>
                        ) : (i.status === "rework" || i.status === "cancelled" || i.status === "rejected") ? (
                          <Button variant="primary" disabled={busyId === i.id} onClick={() => startEdit(i)} type="button" className="h-9 px-4 text-[10px] font-black uppercase tracking-widest">
                            Edit & Reassign
                          </Button>
                        ) : (
                          <span className="text-slate-400 dark:text-slate-700 text-xs">—</span>
                        )}
                      </div>
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

      {/* ── EDIT/REASSIGN MODAL ── */}
      {editingItem && createPortal(
        <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 overflow-x-hidden overflow-y-auto">
          {/* Backdrop */}
          <div className="fixed inset-0 bg-slate-950/60 backdrop-blur-md transition-opacity" onClick={() => setEditingItem(null)} />
          
          {/* Modal Container */}
          <div className="relative w-full max-w-2xl bg-surface dark:bg-slate-900 border border-stroke dark:border-slate-800 rounded-3xl shadow-2xl overflow-hidden transform transition-all animate-in fade-in zoom-in-95 duration-200 z-[10000]">
            {/* Modal Header */}
            <div className="px-8 py-6 border-b border-stroke dark:border-slate-800/80 flex items-center justify-between bg-surface2 dark:bg-slate-950/20">
              <div>
                <h3 className="text-lg font-black text-slate-900 dark:text-white tracking-tight flex items-center gap-2">
                  <CalendarDays className="text-indigo-600 dark:text-indigo-500" size={20} />
                  Edit & Reassign Leave Request
                </h3>
                <p className="text-[10px] text-slate-500 dark:text-slate-500 font-bold uppercase tracking-wider mt-1">
                  Status: <span className="text-indigo-600 dark:text-indigo-400 capitalize">{editingItem.status}</span> · Will reset to pending on submit
                </p>
              </div>
              <button 
                onClick={() => setEditingItem(null)}
                className="p-2 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-400 dark:text-slate-500 transition-colors"
              >
                <svg width="18" height="18" viewBox="0 0 18 18" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <path d="M13.5 4.5L4.5 13.5M4.5 4.5L13.5 13.5" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              </button>
            </div>

            {/* Modal Form */}
            <form onSubmit={handleEditSubmit} className="p-8 space-y-6">
              <div className="grid gap-6 sm:grid-cols-3">
                <Select 
                  label="Leave Type" 
                  value={editLeaveType} 
                  onChange={(e) => setEditLeaveType(e.target.value)} 
                  options={LEAVE_TYPES} 
                />
                <Input 
                  label="Start Date" 
                  type="date" 
                  value={editStartDate} 
                  onChange={(e) => setEditStartDate(e.target.value)} 
                  required 
                />
                <Input 
                  label="End Date" 
                  type="date" 
                  value={editEndDate} 
                  onChange={(e) => setEditEndDate(e.target.value)} 
                  required 
                />
              </div>
              
              <TextArea 
                label="Reason / Notes" 
                value={editReason} 
                onChange={(e) => setEditReason(e.target.value)} 
                rows={4} 
                placeholder="Explain the updates or reassignment details here..."
              />

              <div className="flex justify-end gap-3 pt-4 border-t border-stroke dark:border-slate-800/80">
                <Button 
                  type="button" 
                  variant="ghost" 
                  onClick={() => setEditingItem(null)} 
                  className="px-6 h-12 rounded-2xl"
                >
                  Cancel
                </Button>
                <Button 
                  type="submit" 
                  disabled={editSubmitting} 
                  className="px-8 h-12 rounded-2xl font-black shadow-lg shadow-indigo-500/20"
                >
                  {editSubmitting ? "Saving Updates…" : "Save & Re-submit"}
                </Button>
              </div>
            </form>
          </div>
        </div>,
        document.body
      )}
      {/* ── CANCEL REMAINING LEAVE CONFIRMATION MODAL ── */}
      {cancelTarget && createPortal(
        <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4">
          <div className="fixed inset-0 bg-slate-950/60 backdrop-blur-md" onClick={() => setCancelTarget(null)} />
          <div className="relative w-full max-w-md bg-white dark:bg-slate-900 rounded-3xl shadow-2xl border border-stroke dark:border-slate-800 overflow-hidden z-[10000]">
            <div className="bg-gradient-to-r from-rose-500 to-orange-500 px-7 py-5 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <AlertTriangle size={20} className="text-white" />
                <div>
                  <div className="text-white font-black text-base">Cancel Remaining Leave?</div>
                  <div className="text-white/80 text-xs font-semibold">This will notify your admin immediately</div>
                </div>
              </div>
              <button onClick={() => setCancelTarget(null)} className="p-1.5 rounded-xl hover:bg-white/10 text-white/70 hover:text-white transition-colors">
                <X size={18} />
              </button>
            </div>
            <div className="px-7 py-6 space-y-4">
              {(() => {
                const today = new Date().toISOString().slice(0, 10)
                const start = cancelTarget.start_date
                const end = cancelTarget.end_date
                const totalDays = Math.round((new Date(end) - new Date(start)) / 86400000) + 1
                const daysTaken = Math.max(0, Math.round((new Date(today) - new Date(start)) / 86400000))
                const daysLeft = Math.max(0, totalDays - daysTaken)
                const fmt = d => new Date(d + "T00:00:00").toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" })
                return (
                  <>
                    <div className="rounded-2xl bg-slate-50 dark:bg-slate-800/40 border border-stroke dark:border-slate-700 p-5">
                      <div className="text-[9px] font-black uppercase tracking-widest text-slate-400 mb-3">Leave Period</div>
                      <div className="flex items-center gap-3">
                        <div className="text-center">
                          <div className="text-sm font-black text-slate-800 dark:text-slate-200">{fmt(start)}</div>
                          <div className="text-[9px] text-slate-400 uppercase font-bold">Start</div>
                        </div>
                        <div className="flex-1 h-0.5 bg-slate-200 dark:bg-slate-700" />
                        <div className="text-center">
                          <div className="text-sm font-black text-slate-800 dark:text-slate-200">{fmt(end)}</div>
                          <div className="text-[9px] text-slate-400 uppercase font-bold">End</div>
                        </div>
                      </div>
                    </div>
                    <div className="grid grid-cols-3 gap-3">
                      <div className="rounded-2xl border border-stroke dark:border-slate-700 p-3 text-center bg-surface dark:bg-slate-900/50">
                        <div className="text-2xl font-black text-indigo-600 dark:text-indigo-400">{totalDays}</div>
                        <div className="text-[9px] font-black uppercase text-slate-400 tracking-wider">Approved</div>
                      </div>
                      <div className="rounded-2xl border border-stroke dark:border-slate-700 p-3 text-center bg-surface dark:bg-slate-900/50">
                        <div className="text-2xl font-black text-slate-800 dark:text-slate-200">{daysTaken}</div>
                        <div className="text-[9px] font-black uppercase text-slate-400 tracking-wider">Days Taken</div>
                      </div>
                      <div className="rounded-2xl border border-emerald-200 dark:border-emerald-800 p-3 text-center bg-emerald-50 dark:bg-emerald-900/20">
                        <div className="text-2xl font-black text-emerald-700 dark:text-emerald-400">{daysLeft}</div>
                        <div className="text-[9px] font-black uppercase text-emerald-400 tracking-wider">Remaining</div>
                      </div>
                    </div>
                    <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-xl px-4 py-3 text-xs text-amber-700 dark:text-amber-400 font-semibold">
                      ⚡ You took <strong>{daysTaken} day{daysTaken !== 1 ? "s" : ""}</strong> of leave. Cancelling now will forfeit the remaining <strong>{daysLeft} day{daysLeft !== 1 ? "s" : ""}</strong>. Your admin will be notified automatically.
                    </div>
                  </>
                )
              })()}
            </div>
            <div className="flex gap-3 px-7 pb-6">
              <Button variant="ghost" onClick={() => setCancelTarget(null)} className="flex-1 h-12 rounded-2xl font-black">
                Keep My Leave
              </Button>
              <Button
                variant="danger"
                disabled={busyId === cancelTarget.id}
                onClick={() => confirmCancel(cancelTarget)}
                className="flex-1 h-12 rounded-2xl font-black"
              >
                {busyId === cancelTarget.id ? "Cancelling…" : "Yes, Cancel Remaining"}
              </Button>
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  )
}
