import { useEffect, useRef, useState, memo } from "react"
import { createPortal } from "react-dom"
import { useNavigate } from "react-router-dom"
import { apiRequest, unwrapResults } from "../../api/client.js"
import { useAuth } from "../../state/auth/useAuth.js"
import { useRole } from "../../state/auth/useRole.js"
import { Pill, Button, Card, Input, Select, TextArea } from "../components/kit.jsx"
import { ClipboardList, Clock, CheckCircle2, AlertCircle, MapPin, Calendar as CalIcon, Play, Save, Trash2, Tag, Loader2, Paperclip, User, Flag, ListChecks, Plus, X, Building2, Camera, ThumbsUp, ThumbsDown, RefreshCw, UserCheck, AlertTriangle, DollarSign } from "lucide-react"
import { SelfieCapture, getPosition } from "./TimePage.jsx"

// ─── Constants & Helpers ─────────────────────────────────────
const CATEGORIES = [
  { value: "electrician", label: "Electrician" },
  { value: "plumber", label: "Plumber" },
  { value: "carpenter", label: "Carpenter" },
  { value: "hvac", label: "HVAC" },
  { value: "maintenance", label: "Maintenance" },
  { value: "inspection", label: "Inspection" },
  { value: "cleaning", label: "Cleaning" },
  { value: "installation", label: "Installation" },
  { value: "repair", label: "Repair" },
  { value: "other", label: "Other" },
]

const PRIORITIES = [
  { value: "low", label: "Low", color: "bg-slate-500" },
  { value: "medium", label: "Medium", color: "bg-blue-600" },
  { value: "high", label: "High", color: "bg-amber-600" },
  { value: "urgent", label: "Urgent", color: "bg-rose-600" },
]

const STATUS_FILTERS = ["all", "pending", "in_progress", "completed", "cancelled"]

function categoryLabel(val) { return CATEGORIES.find(c => c.value === val)?.label ?? val }
function statusTone(s) { return s === "completed" ? "good" : s === "in_progress" ? "warn" : s === "cancelled" ? "bad" : "neutral" }
function statusLabel(s) { return { pending: "Pending", in_progress: "In Progress", completed: "Completed", cancelled: "Cancelled" }[s] ?? s }
function priorityColorClass(p) { return PRIORITIES.find(x => x.value === p)?.color ?? "bg-slate-500" }

// Acceptance status helpers
function acceptanceTone(s) {
  return s === "accepted" ? "good" : s === "declined" ? "bad" : "neutral"
}
function acceptanceLabel(s) {
  return { pending_acceptance: "Pending Acceptance", accepted: "Accepted", declined: "Declined" }[s] ?? s
}

const EMPTY_FORM = {
  title: "", description: "", category: "other", priority: "medium",
  status: "pending",
  assigned_to: "", due_date: new Date().toISOString().slice(0, 10),
  estimated_hours: "1", location: "", job_site: "", admin_notes: "",
  job_address: "", client_name: "", geofence_radius: "",
  location_lat: "", location_lon: "",
  require_selfie: false, require_before_after_photos: false
}

// ─── Availability Badge ──────────────────────────────────────
const AVAILABILITY_CONFIG = {
  available:  { color: "#059669", bg: "#ecfdf5", label: "Available" },
  busy:       { color: "#d97706", bg: "#fffbeb", label: "Working" },
  on_break:   { color: "#2563eb", bg: "#eff6ff", label: "On Break" },
  on_leave:   { color: "#7c3aed", bg: "#f5f3ff", label: "On Leave" },
  offline:    { color: "#94a3b8", bg: "#f8fafc", label: "Offline"  },
}

function AvailabilityBadge({ status, size = "sm" }) {
  const cfg = AVAILABILITY_CONFIG[status] || AVAILABILITY_CONFIG.offline
  const textSize = size === "xs" ? "9px" : "10px"
  const dotSize  = size === "xs" ? 6 : 7
  return (
    <span style={{
      display: "inline-flex", alignItems: "center", gap: 4,
      padding: size === "xs" ? "2px 6px" : "3px 8px",
      borderRadius: 20,
      backgroundColor: cfg.bg,
      border: `1px solid ${cfg.color}30`,
    }}>
      <span style={{
        width: dotSize, height: dotSize, borderRadius: "50%",
        backgroundColor: cfg.color,
        flexShrink: 0,
        boxShadow: `0 0 0 2px ${cfg.color}30`,
      }} />
      <span style={{ fontSize: textSize, fontWeight: 800, color: cfg.color, letterSpacing: "0.05em", textTransform: "uppercase" }}>
        {cfg.label}
      </span>
    </span>
  )
}

// ─── Billing Badge ───────────────────────────────────────────
function BillingBadge({ billedHours, actualHours, estimatedHours }) {
  if (!billedHours) return null
  const isShort = parseFloat(estimatedHours) < 1
  if (!isShort) return null
  return (
    <div style={{
      display: "inline-flex", alignItems: "center", gap: 6,
      padding: "4px 10px", borderRadius: 10,
      backgroundColor: "#f0fdf4", border: "1px solid #86efac",
      fontSize: 10, fontWeight: 800, color: "#16a34a",
      letterSpacing: "0.05em", textTransform: "uppercase",
    }}>
      <DollarSign size={11} />
      Billed: {billedHours}h
      {actualHours > 0 && <span style={{ color: "#4ade80", marginLeft: 2 }}>({actualHours}h actual)</span>}
    </div>
  )
}

// ─── Task Card (Employee) ────────────────────────────────────
// Centralized timer to prevent multiple intervals
let _globalTick = Date.now()
const _timerCallbacks = new Set()
setInterval(() => {
  _globalTick = Date.now()
  _timerCallbacks.forEach(cb => cb(_globalTick))
}, 1000)

function useElapsed(clockInStr) {
  const [now, setNow] = useState(Date.now())

  useEffect(() => {
    if (!clockInStr) return
    const update = (t) => setNow(t)
    _timerCallbacks.add(update)
    return () => _timerCallbacks.delete(update)
  }, [clockInStr])

  if (!clockInStr) return 0
  const start = new Date(clockInStr).getTime()
  return Math.max(0, Math.floor((now - start) / 1000))
}

function formatDuration(seconds) {
  if (!seconds && seconds !== 0) return "00:00:00"
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  const s = seconds % 60
  return [h, m, s].map(v => String(v).padStart(2, "0")).join(":")
}

const TaskCard = memo(({ task, onAction, busy }) => {
  const navigate = useNavigate()
  const [note, setNote] = useState(task.employee_notes || "")
  const [expanded, setExpanded] = useState(false)
  const [declining, setDeclining] = useState(false)
  const [declineReason, setDeclineReason] = useState("")
  const [localBusy, setLocalBusy] = useState(false)

  // Complete flow state
  const [afterPhoto, setAfterPhoto] = useState(null)

  const elapsed = useElapsed(task.started_at)
  const liveHours = task.status === "in_progress" && elapsed > 0 ? formatDuration(elapsed) : null

  function handleAfterPhotoChange(e) {
    if (e.target.files && e.target.files[0]) {
      setAfterPhoto(e.target.files[0])
    }
  }

  function handleStartWork() {
    navigate(`/time?task_id=${task.id}`)
  }

  function handleComplete() {
    if (task.require_before_after_photos && !afterPhoto) {
      alert("An after photo is required to complete this task."); return;
    }
    const payload = { notes: note, require_fd: true }
    if (afterPhoto) payload.photo = afterPhoto
    onAction(task.id, "complete", payload)
  }

  async function handleAccept() {
    setLocalBusy(true)
    await onAction(task.id, "accept", {})
    setLocalBusy(false)
  }

  async function handleDecline() {
    if (!declining) { setDeclining(true); return }
    setLocalBusy(true)
    await onAction(task.id, "decline", { reason: declineReason })
    setLocalBusy(false)
    setDeclining(false)
    setDeclineReason("")
  }

  const isPending = task.acceptance_status === "pending_acceptance"
  const isDeclined = task.acceptance_status === "declined"

  return (
    <div className="bg-surface dark:bg-slate-900/60 rounded-2xl border border-stroke dark:border-slate-800 shadow-sm hover:shadow-md transition-all duration-300 p-5 flex flex-col gap-4">
      <div className="flex justify-between items-start">
        <div className="flex items-center gap-2">
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-slate-100 text-slate-600 text-[10px] font-bold uppercase tracking-wider">
            <Tag size={10} /> {categoryLabel(task.category)}
          </span>
          <div className={`w-2 h-2 rounded-full ${priorityColorClass(task.priority)}`} title={`Priority: ${task.priority}`} />
        </div>
        <div className="flex items-center gap-2 flex-wrap justify-end">
          {isPending && (
            <span style={{
              padding: "3px 9px", borderRadius: 20, fontSize: 9, fontWeight: 900,
              backgroundColor: "#fffbeb", color: "#d97706", border: "1px solid #fde68a",
              letterSpacing: "0.08em", textTransform: "uppercase",
            }}>
              ⏳ Awaiting Your Response
            </span>
          )}
          <Pill tone={statusTone(task.status)}>
            {task.status === "in_progress" ? (liveHours ? `🟢 ${liveHours}` : "In Progress") : statusLabel(task.status)}
          </Pill>
        </div>
      </div>

      <div className="flex-1">
        <h3 className="text-lg font-black text-slate-900 dark:text-white leading-tight tracking-tight">{task.title}</h3>
        {task.description && (
          <div className={`text-slate-500 dark:text-slate-400 text-sm mt-2 line-clamp-${expanded ? 'none' : '3'} whitespace-pre-wrap leading-relaxed`}>
            {task.description}
          </div>
        )}
        {task.description && task.description.length > 120 && (
          <button className="text-indigo-600 text-xs font-bold mt-1 hover:underline" onClick={() => setExpanded(v => !v)}>
            {expanded ? "Show less" : "Read more"}
          </button>
        )}
      </div>

      <div className="grid grid-cols-2 gap-y-2 text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
        <div className="flex items-center gap-1.5 truncate">
          <Building2 size={12} className="text-slate-300" />
          <span className="truncate">{task.job_site_name || task.client_name || "No site"}</span>
        </div>
        <div className="flex items-center gap-1.5">
          <CalIcon size={12} className="text-slate-300" />
          <span>Due: {task.due_date}</span>
        </div>
        <div className="flex items-center gap-1.5">
          <Clock size={12} className="text-slate-300" />
          <span>Est: {task.estimated_hours}h</span>
        </div>
        {task.actual_hours > 0 && (
          <div className="flex items-center gap-1.5 text-emerald-600">
            <CheckCircle2 size={12} />
            <span>Actual: {task.actual_hours}h</span>
          </div>
        )}
      </div>

      {/* Billing badge for completed short tasks */}
      {task.status === "completed" && task.billed_hours && (
        <BillingBadge
          billedHours={task.billed_hours}
          actualHours={task.actual_hours}
          estimatedHours={task.estimated_hours}
        />
      )}

      {task.admin_notes && (
        <div className="bg-amber-50 dark:bg-amber-900/10 text-amber-800 dark:text-amber-400 p-3 rounded-xl text-[11px] font-bold border border-amber-100 dark:border-amber-900/30">
          <strong className="uppercase tracking-widest mr-1 opacity-60">Admin note:</strong> {task.admin_notes}
        </div>
      )}

      {/* ── Accept / Decline Banner ── */}
      {isPending && (
        <div style={{
          padding: 16, borderRadius: 14,
          background: "linear-gradient(135deg, #eff6ff 0%, #fefce8 100%)",
          border: "1.5px solid #bfdbfe",
          display: "flex", flexDirection: "column", gap: 12,
        }}>
          <div style={{ fontSize: 11, fontWeight: 900, color: "#1d4ed8", letterSpacing: "0.08em", textTransform: "uppercase", display: "flex", alignItems: "center", gap: 6 }}>
            <UserCheck size={14} /> New Task Assigned — Please Respond
          </div>
          {!declining ? (
            <div style={{ display: "flex", gap: 10 }}>
              <button
                onClick={handleAccept}
                disabled={localBusy || busy}
                style={{
                  flex: 1, padding: "10px 0", borderRadius: 10, border: "none",
                  background: "#059669", color: "#fff",
                  fontSize: 11, fontWeight: 900, cursor: "pointer",
                  display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
                  letterSpacing: "0.08em", textTransform: "uppercase",
                  opacity: localBusy || busy ? 0.6 : 1,
                }}
              >
                <ThumbsUp size={14} /> Accept Task
              </button>
              <button
                onClick={handleDecline}
                disabled={localBusy || busy}
                style={{
                  flex: 1, padding: "10px 0", borderRadius: 10, border: "1.5px solid #fca5a5",
                  background: "#fff", color: "#dc2626",
                  fontSize: 11, fontWeight: 900, cursor: "pointer",
                  display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
                  letterSpacing: "0.08em", textTransform: "uppercase",
                  opacity: localBusy || busy ? 0.6 : 1,
                }}
              >
                <ThumbsDown size={14} /> Decline
              </button>
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              <textarea
                rows={2}
                placeholder="Reason for declining (optional)..."
                value={declineReason}
                onChange={e => setDeclineReason(e.target.value)}
                style={{
                  resize: "none", borderRadius: 10, border: "1.5px solid #fca5a5",
                  padding: "10px 12px", fontSize: 13, fontFamily: "inherit",
                  outline: "none", color: "#374151",
                }}
              />
              <div style={{ display: "flex", gap: 8 }}>
                <button
                  onClick={() => { setDeclining(false); setDeclineReason("") }}
                  style={{
                    flex: 1, padding: "8px 0", borderRadius: 10, border: "1.5px solid #e2e8f0",
                    background: "#fff", color: "#64748b",
                    fontSize: 10, fontWeight: 800, cursor: "pointer",
                    letterSpacing: "0.08em", textTransform: "uppercase",
                  }}
                >
                  Cancel
                </button>
                <button
                  onClick={handleDecline}
                  disabled={localBusy || busy}
                  style={{
                    flex: 2, padding: "8px 0", borderRadius: 10, border: "none",
                    background: "#dc2626", color: "#fff",
                    fontSize: 10, fontWeight: 900, cursor: "pointer",
                    display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
                    letterSpacing: "0.08em", textTransform: "uppercase",
                    opacity: localBusy || busy ? 0.6 : 1,
                  }}
                >
                  <ThumbsDown size={12} /> Confirm Decline
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      <div className="mt-2 pt-4 border-t border-slate-100 dark:border-slate-800 flex flex-col gap-4">
        {task.status === "pending" && !isPending && (
          <Button
            className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-black py-3 rounded-xl flex items-center justify-center gap-2 tracking-widest uppercase text-[11px]"
            disabled={busy}
            onClick={handleStartWork}
          >
            <Play size={14} /> Start Work
          </Button>
        )}

        {task.status === "in_progress" && !isPending && (
          <div className="flex flex-col gap-4">
            {task.require_before_after_photos && (
              <div className="p-3 bg-bg dark:bg-slate-950/40 rounded-xl border border-stroke dark:border-slate-800">
                <div className="text-[10px] font-black text-slate-700 dark:text-slate-300 mb-2 flex items-center gap-1.5 uppercase tracking-widest">
                  <Camera size={14} className="text-indigo-600 dark:text-indigo-400" /> After Photo Required
                </div>
                <input type="file" accept="image/*" onChange={handleAfterPhotoChange} className="text-xs w-full text-slate-500 dark:text-slate-400" />
              </div>
            )}

            <TextArea
              rows={2}
              placeholder="Optional completion notes..."
              value={note}
              onChange={(e) => setNote(e.target.value)}
              className="min-h-[60px]"
            />
            <div className="flex gap-3">
              <Button variant="ghost" className="flex-1 border border-slate-200 bg-bg dark:bg-slate-950/40" disabled={busy} onClick={() => onAction(task.id, "notes", { employee_notes: note })}>
                <Save size={16} className="mr-2" /> Save Notes
              </Button>
              <Button className="flex-[1.5] bg-emerald-600 hover:bg-emerald-700 hover:shadow-emerald-200/50" disabled={busy} onClick={handleComplete}>
                <CheckCircle2 size={16} className="mr-2" /> Finish Work
              </Button>
            </div>
          </div>
        )}

        {task.status === "completed" && (
          <Button
            className="w-full bg-slate-100 dark:bg-slate-800/20 text-slate-400 dark:text-slate-600 font-black py-3 rounded-xl flex items-center justify-center gap-2 cursor-default border border-stroke dark:border-slate-800/80"
            disabled
          >
            <CheckCircle2 size={14} className="text-emerald-500" /> Work Completed
          </Button>
        )}
      </div>
    </div>
  )
})

// ─── Declined Tasks Panel (Admin) ────────────────────────────
function DeclinedTasksPanel({ declinedTasks, availableEmployees, onReassigned }) {
  const [reassigning, setReassigning] = useState({}) // taskId → newUserId
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState("")

  if (!declinedTasks || declinedTasks.length === 0) return null

  // Sort employees: available first, then busy, on_break, on_leave, offline
  const ORDER = { available: 0, busy: 1, on_break: 2, on_leave: 3, offline: 4 }
  const sortedEmployees = [...availableEmployees].sort((a, b) => {
    const aOrder = ORDER[a.current_availability] ?? 5
    const bOrder = ORDER[b.current_availability] ?? 5
    return aOrder - bOrder
  })

  async function doReassign(taskId) {
    const newUserId = reassigning[taskId]
    if (!newUserId) return
    setBusy(true); setErr("")
    try {
      await apiRequest(`/tasks/admin/${taskId}/`, {
        method: "PATCH",
        json: { assigned_to: newUserId },
      })
      await onReassigned?.()
    } catch (ex) {
      setErr(ex?.body?.detail || "Reassignment failed.")
    } finally { setBusy(false) }
  }

  return (
    <div style={{
      borderRadius: 20, border: "1.5px solid #fca5a5",
      background: "linear-gradient(135deg, #fff5f5 0%, #fff 100%)",
      overflow: "hidden", boxShadow: "0 4px 24px rgba(220,38,38,0.06)",
    }}>
      {/* Header */}
      <div style={{
        padding: "18px 24px", display: "flex", alignItems: "center", gap: 12,
        borderBottom: "1px solid #fecaca",
        background: "linear-gradient(90deg, #fef2f2 0%, #fff 100%)",
      }}>
        <div style={{
          width: 36, height: 36, borderRadius: 10,
          background: "#fef2f2", border: "1.5px solid #fca5a5",
          display: "flex", alignItems: "center", justifyContent: "center",
          color: "#dc2626",
        }}>
          <AlertTriangle size={18} />
        </div>
        <div>
          <div style={{ fontSize: 13, fontWeight: 900, color: "#991b1b", letterSpacing: "-0.01em" }}>
            Declined — Needs Reassignment
          </div>
          <div style={{ fontSize: 10, fontWeight: 700, color: "#f87171", marginTop: 2, letterSpacing: "0.05em", textTransform: "uppercase" }}>
            {declinedTasks.length} task{declinedTasks.length !== 1 ? "s" : ""} rejected by employees
          </div>
        </div>
      </div>

      {err && (
        <div style={{ padding: "10px 24px", background: "#fef2f2", color: "#dc2626", fontSize: 12, fontWeight: 700 }}>
          {err}
        </div>
      )}

      {/* Task list */}
      <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
        {declinedTasks.map((task, i) => (
          <div key={task.id} style={{
            padding: "20px 24px",
            borderBottom: i < declinedTasks.length - 1 ? "1px solid #fee2e2" : "none",
          }}>
            <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 16, flexWrap: "wrap" }}>
              {/* Task info */}
              <div style={{ flex: 1, minWidth: 200 }}>
                <div style={{ fontSize: 14, fontWeight: 900, color: "#1e293b", letterSpacing: "-0.01em" }}>
                  {task.title}
                </div>
                <div style={{ fontSize: 10, fontWeight: 700, color: "#94a3b8", marginTop: 4, letterSpacing: "0.05em", textTransform: "uppercase" }}>
                  {task.category} · Due {task.due_date} · Est {task.estimated_hours}h
                </div>
                {task.decline_reason && (
                  <div style={{
                    marginTop: 10, padding: "8px 12px", borderRadius: 10,
                    background: "#fff7ed", border: "1px solid #fed7aa",
                    fontSize: 12, color: "#92400e", fontStyle: "italic",
                  }}>
                    <span style={{ fontWeight: 800, fontStyle: "normal", marginRight: 4 }}>Reason:</span>
                    {task.decline_reason}
                  </div>
                )}
                <div style={{ marginTop: 8, fontSize: 10, color: "#cbd5e1", fontWeight: 600 }}>
                  Declined by {task.assigned_to_detail?.first_name || task.assigned_to_detail?.username || "employee"}
                  {task.declined_at && ` · ${new Date(task.declined_at).toLocaleDateString()}`}
                </div>
              </div>

              {/* Reassign UI */}
              <div style={{ display: "flex", alignItems: "center", gap: 10, flexShrink: 0 }}>
                <div style={{ position: "relative" }}>
                  <select
                    value={reassigning[task.id] || ""}
                    onChange={e => setReassigning(prev => ({ ...prev, [task.id]: e.target.value }))}
                    style={{
                      padding: "8px 36px 8px 12px", borderRadius: 10,
                      border: "1.5px solid #e2e8f0", background: "#fff",
                      fontSize: 12, fontWeight: 700, color: "#334155",
                      cursor: "pointer", appearance: "none", outline: "none",
                      minWidth: 180,
                    }}
                  >
                    <option value="">— Reassign to —</option>
                    {sortedEmployees.map(emp => {
                      const avail = emp.current_availability || "offline"
                      const cfg = AVAILABILITY_CONFIG[avail] || AVAILABILITY_CONFIG.offline
                      const name = `${emp.first_name || emp.user?.first_name || emp.user?.username || "?"} ${emp.last_name || emp.user?.last_name || ""}`.trim()
                      return (
                        <option key={emp.id} value={emp.user?.id}>
                          {cfg.label.toUpperCase()} · {name}
                        </option>
                      )
                    })}
                  </select>
                  <RefreshCw size={13} style={{ position: "absolute", right: 10, top: "50%", transform: "translateY(-50%)", color: "#94a3b8", pointerEvents: "none" }} />
                </div>
                <button
                  onClick={() => doReassign(task.id)}
                  disabled={busy || !reassigning[task.id]}
                  style={{
                    padding: "8px 18px", borderRadius: 10, border: "none",
                    background: reassigning[task.id] ? "#4f46e5" : "#e2e8f0",
                    color: reassigning[task.id] ? "#fff" : "#94a3b8",
                    fontSize: 11, fontWeight: 900, cursor: reassigning[task.id] ? "pointer" : "not-allowed",
                    letterSpacing: "0.06em", textTransform: "uppercase",
                    display: "flex", alignItems: "center", gap: 6,
                    transition: "all 0.15s ease",
                    opacity: busy ? 0.7 : 1,
                  }}
                >
                  <UserCheck size={13} /> Reassign
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

// ─── ADMIN: Assign Panel ─────────────────────────────────────
function AssignTaskPanel({ employees, jobSites, availableEmployees, onAssigned, onClose }) {
  const [form, setForm] = useState(EMPTY_FORM)
  const [files, setFiles] = useState([])
  const [dragging, setDragging] = useState(false)
  const [showMore, setShowMore] = useState(false)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState("")
  const fileInputRef = useRef(null)

  function set(k, v) { setForm(f => ({ ...f, [k]: v })) }

  // Sort employees by availability (available first)
  const ORDER = { available: 0, busy: 1, on_break: 2, on_leave: 3, offline: 4 }
  const empList = availableEmployees && availableEmployees.length > 0
    ? [...availableEmployees].sort((a, b) => (ORDER[a.current_availability] ?? 5) - (ORDER[b.current_availability] ?? 5))
    : employees

  async function geocodeAddress() {
    if (!form.job_address) return;
    try {
      setBusy(true);
      const res = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(form.job_address)}`);
      const data = await res.json();
      if (data && data.length > 0) {
        set("location_lat", parseFloat(data[0].lat).toFixed(6));
        set("location_lon", parseFloat(data[0].lon).toFixed(6));
      }
    } catch (e) {
      console.error(e);
    } finally {
      setBusy(false);
    }
  }

  function addFiles(list) {
    const next = [...files, ...Array.from(list || [])]
    const uniq = []
    const seen = new Set()
    for (const f of next) {
      const key = `${f.name}:${f.size}:${f.lastModified}`
      if (seen.has(key)) continue
      seen.add(key)
      uniq.push(f)
    }
    setFiles(uniq)
  }

  function removeFile(idx) {
    setFiles(xs => xs.filter((_, i) => i !== idx))
  }

  async function submit(e) {
    e.preventDefault()
    if (!form.assigned_to) return setErr("Please select an employee.")
    if (!form.title.trim()) return setErr("Title is required.")
    setBusy(true); setErr("")
    try {
      const payload = { ...form, estimated_hours: parseFloat(form.estimated_hours) || 1 }
      if (!payload.location_lat) delete payload.location_lat
      if (!payload.location_lon) delete payload.location_lon
      if (!payload.geofence_radius) delete payload.geofence_radius
      if (!payload.job_site) delete payload.job_site

      const created = await apiRequest("/tasks/admin/", {
        method: "POST",
        json: payload,
      })
      if (files.length) {
        const fd = new FormData()
        for (const f of files) fd.append("files", f)
        await apiRequest(`/tasks/admin/${created.id}/attachments/`, { method: "POST", body: fd })
      }
      setForm(EMPTY_FORM)
      setFiles([])
      setShowMore(false)
      await onAssigned?.()
      onClose?.()
    } catch (ex) {
      setErr(ex?.body?.detail || "Failed to assign task.")
    } finally { setBusy(false) }
  }

  return (
    <form className="flex flex-col gap-6" onSubmit={submit}>
      <div>
        <div className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-4">General Details</div>
        <Input
          value={form.title}
          onChange={e => set("title", e.target.value)}
          placeholder="e.g. Repair HVAC unit in Block B"
          label="Task Title"
          className="text-lg font-bold"
          required
        />
      </div>

      {err && (
        <div className="p-3 bg-rose-50 text-rose-700 border border-rose-200 rounded-lg text-sm font-semibold flex items-center gap-2">
          <AlertCircle size={16} /> {err}
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Assign To — with availability sorting */}
        <div>
          <div className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-1.5">Assign To</div>
          <select
            value={form.assigned_to}
            onChange={e => set("assigned_to", e.target.value)}
            required
            style={{
              width: "100%", padding: "10px 14px", borderRadius: 12,
              border: "1.5px solid #e2e8f0", background: "#fff",
              fontSize: 13, fontWeight: 600, color: "#1e293b",
              outline: "none", cursor: "pointer",
            }}
          >
            <option value="">— Select employee —</option>
            {empList.map(emp => {
              const avail = emp.current_availability || "offline"
              const cfg = AVAILABILITY_CONFIG[avail] || AVAILABILITY_CONFIG.offline
              const userId = emp.user?.id || emp.id
              const name = `${emp.first_name || emp.user?.first_name || emp.user?.username || "?"} ${emp.last_name || emp.user?.last_name || ""}`.trim()
              return (
                <option key={emp.id} value={userId}>
                  [{cfg.label.toUpperCase()}] {name}
                </option>
              )
            })}
          </select>
          {/* Availability legend */}
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 8 }}>
            {Object.entries(AVAILABILITY_CONFIG).map(([k, v]) => (
              <span key={k} style={{
                fontSize: 9, fontWeight: 800, color: v.color,
                background: v.bg, border: `1px solid ${v.color}30`,
                padding: "2px 7px", borderRadius: 20, letterSpacing: "0.06em", textTransform: "uppercase",
              }}>
                ● {v.label}
              </span>
            ))}
          </div>
        </div>

        <Select
          label="Job Site"
          value={form.job_site}
          onChange={e => set("job_site", e.target.value)}
          options={[
            { value: "", label: "— No specified site —" },
            ...jobSites.map(site => ({ value: site.id, label: site.name }))
          ]}
        />

        <Select
          label="Category"
          value={form.category}
          onChange={e => set("category", e.target.value)}
          options={CATEGORIES}
        />

        <Input
          label="Due Date"
          type="date"
          value={form.due_date}
          onChange={e => set("due_date", e.target.value)}
        />

        <Select
          label="Priority"
          value={form.priority}
          onChange={e => set("priority", e.target.value)}
          options={PRIORITIES.map(p => ({ value: p.value, label: p.label }))}
        />

        <Select
          label="Status"
          value={form.status}
          onChange={e => set("status", e.target.value)}
          options={[{ value: "pending", label: "Pending" }]}
        />
      </div>

      <button type="button" className="text-indigo-600 dark:text-indigo-400 text-xs font-black uppercase tracking-widest hover:underline flex items-center gap-1" onClick={() => setShowMore(v => !v)}>
        {showMore ? "- Hide advanced options" : "+ Add more properties (GPS, Client, Requirements)"}
      </button>

      {showMore && (
        <div className="p-6 bg-surface2 dark:bg-slate-900/40 rounded-2xl border border-stroke dark:border-slate-800 grid grid-cols-1 md:grid-cols-2 gap-6 animate-in fade-in slide-in-from-top-2">
          <Input
            label="Estimated Hours"
            type="number"
            min="0.5"
            step="0.5"
            value={form.estimated_hours}
            onChange={e => set("estimated_hours", e.target.value)}
          />
          <Input
            label="Client Name"
            value={form.client_name}
            onChange={e => set("client_name", e.target.value)}
            placeholder="e.g. Acme Corp"
          />
          <div className="md:col-span-2">
            <Input
              label="Job Address"
              value={form.job_address}
              onChange={e => set("job_address", e.target.value)}
              onBlur={geocodeAddress}
              placeholder="Full street address"
            />
          </div>
          <div className="flex gap-4">
            <Input
              label="Latitude"
              type="number"
              step="any"
              value={form.location_lat}
              onChange={e => set("location_lat", e.target.value)}
            />
            <Input
              label="Longitude"
              type="number"
              step="any"
              value={form.location_lon}
              onChange={e => set("location_lon", e.target.value)}
            />
          </div>
          <Input
            label="Geofence Radius (m)"
            type="number"
            value={form.geofence_radius}
            onChange={e => set("geofence_radius", e.target.value)}
            placeholder="Default 200m"
          />
          <div className="md:col-span-2">
            <div className="text-sm font-semibold text-slate-700 mb-3">Verification Requirements</div>
            <div className="flex gap-8">
              <label className="flex items-center gap-2.5 text-sm font-medium text-slate-600 cursor-pointer">
                <input type="checkbox" className="w-4 h-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500" checked={form.require_selfie} onChange={e => set("require_selfie", e.target.checked)} />
                Require Selfie at Start
              </label>
              <label className="flex items-center gap-2.5 text-sm font-medium text-slate-600 cursor-pointer">
                <input type="checkbox" className="w-4 h-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500" checked={form.require_before_after_photos} onChange={e => set("require_before_after_photos", e.target.checked)} />
                Before/After Photos
              </label>
            </div>
          </div>
        </div>
      )}

      <div className="h-px bg-slate-100 w-full" />

      <div>
        <div className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-4">Attachments & Documentation</div>
        <div
          className={`border-2 border-dashed rounded-2xl p-8 text-center transition-all ${dragging ? "border-indigo-500 bg-indigo-50" : "border-slate-200 hover:border-slate-300 hover:bg-slate-50"}`}
          onDragOver={(e) => { e.preventDefault(); setDragging(true) }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => { e.preventDefault(); setDragging(false); addFiles(e.dataTransfer.files) }}
        >
          <div className="flex flex-col items-center gap-3">
            <div className="w-12 h-12 rounded-full bg-bg dark:bg-slate-950/40 shadow-sm border border-stroke dark:border-slate-800 flex items-center justify-center text-slate-400 dark:text-slate-600">
              <Paperclip size={24} />
            </div>
            <div>
              <p className="text-sm font-bold text-slate-700">Drag & drop files here</p>
              <p className="text-xs text-slate-400 mt-1">or click to browse your computer</p>
            </div>
            <Button type="button" variant="ghost" className="mt-2 border border-stroke dark:border-slate-800 bg-bg dark:bg-slate-950/40" onClick={() => fileInputRef.current?.click()}>
              Choose Files
            </Button>
            <input ref={fileInputRef} type="file" multiple style={{ display: "none" }} onChange={(e) => addFiles(e.target.files)} />
          </div>
        </div>

        {files.length > 0 && (
          <div className="mt-4 flex flex-wrap gap-2">
            {files.map((f, idx) => (
              <div key={`${f.name}:${f.size}:${f.lastModified}`} className="flex items-center gap-2 pl-3 pr-1.5 py-1.5 bg-bg dark:bg-slate-950/40 border border-stroke dark:border-slate-800 rounded-lg text-xs font-semibold text-slate-700 dark:text-slate-300">
                <span className="truncate max-w-[150px]">{f.name}</span>
                <button type="button" className="p-1 rounded-md hover:bg-rose-50 hover:text-rose-600 transition-colors" onClick={() => removeFile(idx)}>
                  <X size={14} />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      <TextArea
        label="Description"
        rows={3}
        value={form.description}
        onChange={e => set("description", e.target.value)}
        placeholder="Add a more detailed description or instructions..."
      />

      <Input
        label="Internal Admin Notes"
        value={form.admin_notes}
        onChange={e => set("admin_notes", e.target.value)}
        placeholder="Private notes for admins only..."
      />

      <div className="pt-4">
        <Button type="submit" className="w-full py-4 text-base shadow-lg shadow-indigo-200/50" disabled={busy}>
          {busy ? <Loader2 size={20} className="animate-spin mr-2" /> : <Save size={20} className="mr-2" />}
          CREATE WORK ORDER
        </Button>
      </div>
    </form>
  )
}

// ─── ADMIN: All Tasks Table ──────────────────────────────────
function AdminTasksTable({ tasks, employees, availableEmployees, jobSites, onRefresh }) {
  const [busy, setBusy] = useState(false)

  async function deleteTask(id) {
    if (!window.confirm("Delete this task?")) return
    setBusy(true)
    try { await apiRequest(`/tasks/admin/${id}/`, { method: "DELETE" }); onRefresh() }
    catch { /* ignore */ }
    finally { setBusy(false) }
  }

  function getEmp(id) {
    // Try availableEmployees first (has availability), fallback to employees
    const fromAvail = availableEmployees.find(e => e.user?.id === id || String(e.user?.id) === String(id))
    if (fromAvail) return fromAvail
    const fromEmp = employees.find(x => x.user?.id === id || String(x.user?.id) === String(id))
    return fromEmp
  }

  return (
    <div className="overflow-hidden rounded-3xl border border-stroke dark:border-slate-800 bg-surface dark:bg-slate-900/60 shadow-sm">
      <div className="overflow-x-auto">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="bg-surface2 dark:bg-slate-900/50 border-b border-stroke dark:border-slate-800">
              <th className="p-6 text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest">Task Details</th>
              <th className="p-6 text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest">Assigned To</th>
              <th className="p-6 text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest">Due Date</th>
              <th className="p-6 text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest">Acceptance</th>
              <th className="p-6 text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest">Status</th>
              <th className="p-6 text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-stroke dark:divide-slate-800">
            {tasks.length === 0 && (
              <tr>
                <td colSpan={6} className="p-24 text-center text-slate-400">
                  <div className="flex flex-col items-center gap-3 text-[10px] font-black uppercase tracking-widest">
                    <ClipboardList size={32} className="opacity-20" />
                    No tasks actively assigned.
                  </div>
                </td>
              </tr>
            )}
          {tasks.map(t => {
            const emp = getEmp(t.assigned_to)
            const avail = emp?.current_availability
            return (
              <tr key={t.id} className="hover:bg-bg dark:hover:bg-slate-950/40 transition-colors">
                <td className="px-6 py-4">
                  <div className="font-black text-slate-900 dark:text-white text-sm tracking-tight">{t.title}</div>
                  <div className="flex items-center gap-2 mt-1.5 text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest">
                    <span className="flex items-center gap-1.5">
                      <div className={`w-2 h-2 rounded-full ${priorityColorClass(t.priority)} shadow-[0_0_8px_rgba(0,0,0,0.1)]`} />
                      {t.priority}
                    </span>
                    <span className="opacity-30">|</span>
                    <span>{categoryLabel(t.category)}</span>
                    {t.job_site_name && (
                      <><span className="opacity-30">|</span><span className="text-indigo-600 dark:text-indigo-400">🏢 {t.job_site_name}</span></>
                    )}
                  </div>
                  {(t.require_selfie || t.require_before_after_photos) && (
                    <div className="flex items-center gap-1.5 mt-2 text-[10px] font-bold text-indigo-600 uppercase tracking-wider">
                      <Camera size={12} />
                      {t.require_selfie && "Selfie"}
                      {t.require_selfie && t.require_before_after_photos && " + "}
                      {t.require_before_after_photos && "Photos"} Required
                    </div>
                  )}
                  {/* Billing badge for short completed tasks */}
                  {t.status === "completed" && t.billed_hours && parseFloat(t.estimated_hours) < 1 && (
                    <div style={{ marginTop: 6 }}>
                      <BillingBadge billedHours={t.billed_hours} actualHours={t.actual_hours} estimatedHours={t.estimated_hours} />
                    </div>
                  )}
                </td>
                <td className="px-6 py-4">
                  {emp && emp.user ? (
                    <div className="flex flex-col gap-2">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-lg bg-indigo-50 dark:bg-indigo-900/20 text-indigo-600 dark:text-indigo-400 flex items-center justify-center text-[10px] font-black border border-indigo-100 dark:border-indigo-800">
                          {(emp.user.first_name || emp.user.username || "?").charAt(0).toUpperCase()}
                        </div>
                        <div className="text-sm font-bold text-slate-700 dark:text-slate-300">
                          {emp.user.first_name || emp.user.username} {emp.user.last_name || ""}
                        </div>
                      </div>
                      {avail && <AvailabilityBadge status={avail} size="xs" />}
                    </div>
                  ) : <span className="text-slate-300 dark:text-slate-600 italic text-sm">Unassigned</span>}
                </td>
                <td className="px-6 py-4 text-xs font-black text-slate-500 dark:text-slate-400 uppercase tracking-widest">{t.due_date}</td>
                <td className="px-6 py-4">
                  <Pill tone={acceptanceTone(t.acceptance_status)}>
                    {acceptanceLabel(t.acceptance_status)}
                  </Pill>
                  {t.decline_reason && (
                    <div style={{ marginTop: 4, fontSize: 10, color: "#f87171", fontStyle: "italic", maxWidth: 160 }}>
                      "{t.decline_reason.slice(0, 60)}{t.decline_reason.length > 60 ? "…" : ""}"
                    </div>
                  )}
                </td>
                <td className="px-6 py-4">
                  <Pill tone={statusTone(t.status)}>{statusLabel(t.status)}</Pill>
                </td>
                <td className="px-6 py-4 text-right">
                  <button className="p-2 rounded-lg text-rose-400 hover:text-rose-600 hover:bg-rose-50 transition-all" onClick={() => deleteTask(t.id)} disabled={busy} title="Delete">
                    <Trash2 size={18} />
                  </button>
                </td>
              </tr>
            )
          })}
          </tbody>
        </table>
      </div>
    </div>
  )
}

// ─── ADMIN LAYOUT ────────────────────────────────────────────
function AdminTasksPage({ tasks, employees, availableEmployees, jobSites, declinedTasks, loadTasks }) {
  const [open, setOpen] = useState(false)
  const modalRef = useRef(null)

  useEffect(() => {
    if (!open) return
    const onKeyDown = (e) => {
      if (e.key === "Escape") setOpen(false)
    }
    window.addEventListener("keydown", onKeyDown)
    return () => window.removeEventListener("keydown", onKeyDown)
  }, [open])

  return (
    <>
      {open && createPortal(
        <div className="modal-overlay">
          <div
            className="modal-sheet w-[min(880px,100%)] max-h-[calc(100vh-32px)] flex flex-col pointer-events-auto"
          >
            <div className="flex justify-between items-center px-6 py-5 border-b border-slate-100 shrink-0">
              <div className="flex flex-col flex-1 user-select-none">
                <div className="text-xl professional-title text-slate-900 dark:text-white">Create Work Order</div>
                <div className="text-sm text-slate-400 font-medium mt-0.5">Define tasks, assign personnel, and set location constraints.</div>
              </div>
              <button type="button" className="p-2 rounded-xl hover:bg-slate-100 text-slate-400 transition-colors" onClick={() => setOpen(false)}>
                <X size={24} />
              </button>
            </div>

            <div className="p-6 overflow-y-auto">
              <AssignTaskPanel
                employees={employees}
                availableEmployees={availableEmployees}
                jobSites={jobSites}
                onAssigned={loadTasks}
                onClose={() => setOpen(false)}
              />
            </div>
          </div>
        </div>,
        document.body
      )}

      <div className="flex flex-col gap-6">
        {/* Declined tasks panel — shown when there are declined tasks */}
        {declinedTasks && declinedTasks.length > 0 && (
          <DeclinedTasksPanel
            declinedTasks={declinedTasks}
            availableEmployees={availableEmployees}
            onReassigned={loadTasks}
          />
        )}

        <div className="flex justify-between items-center">
          <div className="flex items-baseline gap-3">
            <h2 className="text-xl professional-title text-slate-900 dark:text-white">Task Queue</h2>
            <span className="text-[10px] professional-subtitle text-slate-400">{tasks.length} Total</span>
          </div>

          <Button onClick={() => setOpen(true)} className="shadow-indigo-100 shadow-xl gap-2">
            <Plus size={18} /> New Work Order
          </Button>
        </div>

        <AdminTasksTable
          tasks={tasks}
          employees={employees}
          availableEmployees={availableEmployees}
          jobSites={jobSites}
          onRefresh={loadTasks}
        />
      </div>
    </>
  )
}

// ─── EMPLOYEE LAYOUT ─────────────────────────────────────────
function EmployeeTasksPage({ tasks, handleAction, busy }) {
  const [filter, setFilter] = useState("all")

  // Split pending-acceptance tasks for the banner
  const pendingAcceptance = tasks.filter(t => t.acceptance_status === "pending_acceptance")
  const filtered = filter === "all"
    ? tasks
    : tasks.filter(t => t.status === filter)

  return (
    <div className="flex flex-col gap-8">
      {/* Pending acceptance banner */}
      {pendingAcceptance.length > 0 && (
        <div style={{
          padding: "16px 20px", borderRadius: 16,
          background: "linear-gradient(135deg, #fefce8 0%, #eff6ff 100%)",
          border: "1.5px solid #fde68a",
          display: "flex", alignItems: "center", gap: 14,
        }}>
          <div style={{
            width: 36, height: 36, borderRadius: 10,
            background: "#fef9c3", border: "1.5px solid #fde047",
            display: "flex", alignItems: "center", justifyContent: "center",
            color: "#ca8a04", flexShrink: 0,
          }}>
            <AlertTriangle size={18} />
          </div>
          <div>
            <div style={{ fontSize: 13, fontWeight: 900, color: "#92400e" }}>
              {pendingAcceptance.length} task{pendingAcceptance.length !== 1 ? "s" : ""} awaiting your response
            </div>
            <div style={{ fontSize: 11, fontWeight: 600, color: "#d97706", marginTop: 2 }}>
              Please accept or decline the highlighted tasks below so your manager can plan accordingly.
            </div>
          </div>
        </div>
      )}

      <div className="flex flex-wrap gap-2 bg-surface2 dark:bg-slate-900/60 p-1.5 rounded-2xl self-start border border-stroke dark:border-slate-800 shadow-inner">
        {STATUS_FILTERS.map(f => {
          const isActive = filter === f
          const count = tasks.filter(t => t.status === f).length
          return (
            <button
              key={f}
              className={`px-5 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-[0.15em] transition-all ${isActive ? 'bg-indigo-600 dark:bg-indigo-500 text-white shadow-lg shadow-indigo-200 dark:shadow-none' : 'text-slate-500 dark:text-slate-500 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800'}`}
              onClick={() => setFilter(f)}
            >
              <span className="flex items-center gap-2">
                {f === "all" ? "All Tasks" : statusLabel(f)}
                {f !== "all" && count > 0 && <span className={`px-1.5 py-0.5 rounded-md text-[9px] ${isActive ? 'bg-white/20 text-white' : 'bg-slate-200 dark:bg-slate-800 text-slate-500'}`}>{count}</span>}
              </span>
            </button>
          )
        })}
      </div>

      {filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-24 px-6 bg-surface dark:bg-slate-900/40 border border-stroke dark:border-slate-800 border-dashed rounded-[3rem] text-center">
          <div className="w-20 h-20 rounded-3xl bg-slate-50 dark:bg-slate-950 flex items-center justify-center text-slate-200 dark:text-slate-800 mb-8 shadow-inner">
            <ClipboardList size={40} />
          </div>
          <h3 className="text-xl font-black text-slate-900 dark:text-white tracking-tight">No tasks found</h3>
          <p className="text-slate-400 dark:text-slate-500 mt-3 max-w-xs text-sm font-medium leading-relaxed">You're all caught up! Enjoy your break or check back later for new assignments.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filtered.map(t => <TaskCard key={t.id} task={t} onAction={handleAction} busy={busy} />)}
        </div>
      )}
    </div>
  )
}

// ─── MAIN ROUTER PAGE ────────────────────────────────────────
export function TasksPage() {
  const { user } = useAuth()
  const { isAdmin } = useRole()
  const navigate = useNavigate()

  const [tasks, setTasks] = useState([])
  const [employees, setEmployees] = useState([])
  const [availableEmployees, setAvailableEmployees] = useState([])
  const [declinedTasks, setDeclinedTasks] = useState([])
  const [jobSites, setJobSites] = useState([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState("")

  async function loadTasks() {
    setLoading(true); setError("")
    try {
      const url = isAdmin ? "/tasks/admin/" : "/tasks/my/"
      const data = await apiRequest(url)
      setTasks(Array.isArray(data) ? data : unwrapResults(data))

      if (isAdmin) {
        // Load declined tasks and available employees in parallel
        const [declined, available] = await Promise.all([
          apiRequest("/tasks/admin/declined/").catch(() => []),
          apiRequest("/tasks/admin/available-employees/").catch(() => []),
        ])
        setDeclinedTasks(Array.isArray(declined) ? declined : unwrapResults(declined))
        setAvailableEmployees(Array.isArray(available) ? available : unwrapResults(available))
      }
    } catch (e) { setError(e?.body?.detail || "Failed to load tasks.") }
    finally { setLoading(false) }
  }

  async function loadEmployees() {
    if (!isAdmin) return
    try {
      const data = await apiRequest("/employees/")
      setEmployees(Array.isArray(data) ? data : unwrapResults(data))
    } catch { /* ignore */ }
  }

  async function loadSites() {
    if (!isAdmin) return
    try {
      const data = await apiRequest("/time/sites/")
      setJobSites(Array.isArray(data) ? data : unwrapResults(data))
    } catch { /* ignore */ }
  }

  useEffect(() => { loadTasks(); loadEmployees(); loadSites(); }, [])

  async function handleAction(taskId, action, body = {}) {
    setBusy(true)
    try {
      if (body.require_fd) {
        const fd = new FormData()
        Object.keys(body).forEach(k => {
          if (k !== 'require_fd' && body[k] !== undefined && body[k] !== null) {
            fd.append(k, body[k])
          }
        })
        await apiRequest(`/tasks/my/${taskId}/${action}/`, {
          method: "POST",
          body: fd,
        })
      } else {
        // Accept and decline use POST; notes uses PATCH
        const method = (action === "accept" || action === "decline") ? "POST" : "PATCH"
        await apiRequest(`/tasks/my/${taskId}/${action}/`, {
          method,
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        })
      }
      
      if (action === "accept") {
        navigate(`/time?task_id=${taskId}`)
        return
      }

      await loadTasks()
    } catch (e) { setError(e?.body?.detail || e.message || "Action failed.") }
    finally { setBusy(false) }
  }

  return (
    <div className="flex flex-col h-[calc(100vh-var(--header-height,64px))] w-full bg-bg dark:bg-bg overflow-hidden">
      {/* ── HEADER ── */}
      <div className="h-24 bg-surface dark:bg-slate-900/60 border-b border-stroke dark:border-slate-800 px-10 flex items-center justify-between shrink-0 relative overflow-hidden">
        <div className="flex items-center gap-6">
          <div>
            <h1 className="text-2xl font-black text-slate-900 dark:text-white tracking-tight font-[Manrope] flex items-center gap-3">
              <ClipboardList className="text-indigo-600 dark:text-indigo-400" size={24} />
              Tasks & Orders
            </h1>
            <div className="flex items-center gap-3 mt-2">
              <span className="text-[10px] font-black text-slate-500 dark:text-slate-500 uppercase tracking-widest opacity-80">
                {isAdmin ? "Dispatch and monitor work activity across all employees." : "Your personal task feed and execution queue."}
              </span>
            </div>
          </div>
        </div>
        {isAdmin && declinedTasks.length > 0 && (
          <div style={{
            display: "flex", alignItems: "center", gap: 8,
            padding: "8px 16px", borderRadius: 12,
            background: "#fef2f2", border: "1.5px solid #fca5a5",
          }}>
            <AlertTriangle size={16} style={{ color: "#dc2626" }} />
            <span style={{ fontSize: 12, fontWeight: 900, color: "#dc2626" }}>
              {declinedTasks.length} declined task{declinedTasks.length !== 1 ? "s" : ""} need reassignment
            </span>
          </div>
        )}
      </div>

      <div className="flex-1 overflow-y-auto p-10 space-y-10">

      {error && (
        <div className="p-4 bg-rose-50 text-rose-700 border border-rose-200 rounded-2xl font-bold flex items-center gap-3 animate-in shake duration-500">
          <AlertCircle size={20} /> {error}
        </div>
      )}

      {loading ? (
        <div className="flex flex-col items-center justify-center py-32 text-slate-400 gap-4">
          <Loader2 className="animate-spin" size={40} />
          <span className="text-lg font-medium">Syncing work orders...</span>
        </div>
      ) : isAdmin ? (
        <AdminTasksPage
          tasks={tasks}
          employees={employees}
          availableEmployees={availableEmployees}
          declinedTasks={declinedTasks}
          jobSites={jobSites}
          loadTasks={loadTasks}
        />
      ) : (
        <EmployeeTasksPage tasks={tasks} handleAction={handleAction} busy={busy} />
      )}
      </div>
    </div>
  )
}
