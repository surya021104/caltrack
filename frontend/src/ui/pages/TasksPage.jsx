import { useEffect, useRef, useState, memo } from "react"
import { apiRequest, unwrapResults } from "../../api/client.js"
import { useAuth } from "../../state/auth/useAuth.js"
import { Pill, Button, Card, Input, Select, TextArea } from "../components/kit.jsx"
import { ClipboardList, Clock, CheckCircle2, AlertCircle, MapPin, Calendar as CalIcon, Play, Save, Trash2, Tag, Loader2, Paperclip, User, Flag, ListChecks, Plus, X, Building2, Camera } from "lucide-react"
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

const EMPTY_FORM = {
  title: "", description: "", category: "other", priority: "medium",
  status: "pending",
  assigned_to: "", due_date: new Date().toISOString().slice(0, 10),
  estimated_hours: "1", location: "", job_site: "", admin_notes: "",
  job_address: "", client_name: "", geofence_radius: "",
  location_lat: "", location_lon: "",
  require_selfie: false, require_before_after_photos: false
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
  const [note, setNote] = useState(task.employee_notes || "")
  const [expanded, setExpanded] = useState(false)

  // Complete flow state
  const [afterPhoto, setAfterPhoto] = useState(null)

  const elapsed = useElapsed(task.started_at)
  const liveHours = task.status === "in_progress" && elapsed > 0 ? formatDuration(elapsed) : null


  function handleAfterPhotoChange(e) {
    if (e.target.files && e.target.files[0]) {
      setAfterPhoto(e.target.files[0])
    }
  }

  function handleComplete() {
    if (task.require_before_after_photos && !afterPhoto) {
      alert("An after photo is required to complete this task."); return;
    }
    const payload = { notes: note, require_fd: true }
    if (afterPhoto) payload.photo = afterPhoto
    onAction(task.id, "complete", payload)
  }

  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm hover:shadow-md transition-all duration-300 p-5 flex flex-col gap-4">
      <div className="flex justify-between items-start">
        <div className="flex items-center gap-2">
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-slate-100 text-slate-600 text-[10px] font-bold uppercase tracking-wider">
            <Tag size={10} /> {categoryLabel(task.category)}
          </span>
          <div className={`w-2 h-2 rounded-full ${priorityColorClass(task.priority)}`} title={`Priority: ${task.priority}`} />
        </div>
        <Pill tone={statusTone(task.status)}>
          {task.status === "in_progress" ? (liveHours ? `🟢 ${liveHours}` : "In Progress") : statusLabel(task.status)}
        </Pill>
      </div>

      <div className="flex-1">
        <h3 className="text-lg font-bold text-slate-900 leading-tight">{task.title}</h3>
        {task.description && (
          <div className={`text-slate-500 text-sm mt-2 line-clamp-${expanded ? 'none' : '3'} whitespace-pre-wrap`}>
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
        
      {task.admin_notes && (
        <div className="bg-amber-50 text-amber-800 p-3 rounded-xl text-xs border border-amber-100">
          <strong className="uppercase tracking-tight mr-1">Admin note:</strong> {task.admin_notes}
        </div>
      )}


      {task.status !== "completed" && task.status !== "cancelled" && (
        <div className="mt-2 pt-4 border-t border-slate-100">
          {task.status === "pending" && (
            <div className="p-3 bg-indigo-50 border border-indigo-100 rounded-xl text-[10px] font-bold text-indigo-700 text-center uppercase tracking-widest">
              Please initiate this task via the Attendance module
            </div>
          )}
          {task.status === "in_progress" && (
            <div className="flex flex-col gap-4">
              {task.require_before_after_photos && (
                <div className="p-3 bg-slate-50 rounded-xl border border-slate-200">
                  <div className="text-xs font-bold text-slate-700 mb-2 flex items-center gap-1.5">
                    <Camera size={14} /> Requirement: After Photo
                  </div>
                  <input type="file" accept="image/*" onChange={handleAfterPhotoChange} className="text-xs w-full" />
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
                <Button variant="ghost" className="flex-1 border border-slate-200" disabled={busy} onClick={() => onAction(task.id, "notes", { employee_notes: note })}>
                  <Save size={16} className="mr-2" /> Save
                </Button>
                <Button className="flex-[1.5] bg-emerald-600 hover:bg-emerald-700 hover:shadow-emerald-200/50" disabled={busy} onClick={handleComplete}>
                  <CheckCircle2 size={16} className="mr-2" /> COMPLETE
                </Button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
})

// ─── ADMIN: Assign Panel ─────────────────────────────────────
function AssignTaskPanel({ employees, jobSites, onAssigned, onClose }) {
  const [form, setForm] = useState(EMPTY_FORM)
  const [files, setFiles] = useState([])
  const [dragging, setDragging] = useState(false)
  const [showMore, setShowMore] = useState(false)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState("")
  const fileInputRef = useRef(null)

  function set(k, v) { setForm(f => ({ ...f, [k]: v })) }

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
        <Select 
          label="Assign To"
          value={form.assigned_to} 
          onChange={e => set("assigned_to", e.target.value)}
          required
          options={[
            { value: "", label: "— Select employee —" },
            ...employees.map(emp => ({
              value: emp.user?.id,
              label: `${emp.user?.first_name || emp.user?.username} ${emp.user?.last_name || ""}`
            }))
          ]}
        />

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
          options={STATUS_FILTERS.filter(x => x !== "all").map(s => ({ value: s, label: statusLabel(s) }))}
        />
      </div>

      <button type="button" className="text-indigo-600 text-sm font-bold hover:underline flex items-center gap-1" onClick={() => setShowMore(v => !v)}>
        {showMore ? "- Hide advanced options" : "+ Add more properties (GPS, Client, Requirements)"}
      </button>

      {showMore && (
        <div className="p-5 bg-slate-50 rounded-2xl border border-slate-200 grid grid-cols-1 md:grid-cols-2 gap-6 animate-in fade-in slide-in-from-top-2">
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
            <div className="w-12 h-12 rounded-full bg-white shadow-sm flex items-center justify-center text-slate-400">
              <Paperclip size={24} />
            </div>
            <div>
              <p className="text-sm font-bold text-slate-700">Drag & drop files here</p>
              <p className="text-xs text-slate-400 mt-1">or click to browse your computer</p>
            </div>
            <Button type="button" variant="ghost" className="mt-2 border border-slate-200 bg-white" onClick={() => fileInputRef.current?.click()}>
              Choose Files
            </Button>
            <input ref={fileInputRef} type="file" multiple style={{ display: "none" }} onChange={(e) => addFiles(e.target.files)} />
          </div>
        </div>

        {files.length > 0 && (
          <div className="mt-4 flex flex-wrap gap-2">
            {files.map((f, idx) => (
              <div key={`${f.name}:${f.size}:${f.lastModified}`} className="flex items-center gap-2 pl-3 pr-1.5 py-1.5 bg-white border border-slate-200 rounded-lg text-xs font-semibold text-slate-700">
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
function AdminTasksTable({ tasks, employees, jobSites, onRefresh }) {
  const [busy, setBusy] = useState(false)

  async function deleteTask(id) {
    if (!window.confirm("Delete this task?")) return
    setBusy(true)
    try { await apiRequest(`/tasks/admin/${id}/`, { method: "DELETE" }); onRefresh() }
    catch { /* ignore */ }
    finally { setBusy(false) }
  }

  function getEmp(id) { return employees.find((x) => x.user?.id === id) }

  return (
    <Card className="overflow-x-auto">
      <table className="w-full text-left border-collapse">
        <thead>
          <tr className="border-b border-slate-100">
            <th className="px-4 py-4 text-xs font-bold text-slate-400 uppercase tracking-widest">Task Details</th>
            <th className="px-4 py-4 text-xs font-bold text-slate-400 uppercase tracking-widest">Assigned To</th>
            <th className="px-4 py-4 text-xs font-bold text-slate-400 uppercase tracking-widest">Due Date</th>
            <th className="px-4 py-4 text-xs font-bold text-slate-400 uppercase tracking-widest">Status</th>
            <th className="px-4 py-4 text-xs font-bold text-slate-400 uppercase tracking-widest text-right">Actions</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-50">
          {tasks.length === 0 && (
            <tr>
              <td colSpan={5} className="px-4 py-16 text-center text-slate-400 italic">
                <div className="flex flex-col items-center gap-3">
                  <ClipboardList size={40} className="opacity-20" />
                  No tasks actively assigned.
                </div>
              </td>
            </tr>
          )}
          {tasks.map(t => {
            const emp = getEmp(t.assigned_to)
            return (
              <tr key={t.id} className="hover:bg-slate-50/80 transition-colors">
                <td className="px-4 py-4">
                  <div className="font-bold text-slate-900 text-sm">{t.title}</div>
                  <div className="flex items-center gap-2 mt-1.5 text-[11px] font-bold text-slate-400 uppercase tracking-wider">
                    <span className="flex items-center gap-1">
                      <div className={`w-1.5 h-1.5 rounded-full ${priorityColorClass(t.priority)}`} />
                      {t.priority}
                    </span>
                    <span>·</span>
                    <span>{categoryLabel(t.category)}</span>
                    {t.job_site_name && (
                      <><span>·</span><span className="text-slate-500">🏢 {t.job_site_name}</span></>
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
                </td>
                <td className="px-4 py-4">
                  {emp && emp.user ? (
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-full bg-indigo-100 text-indigo-700 flex items-center justify-center text-xs font-bold">
                        {(emp.user.first_name || emp.user.username || "?").charAt(0).toUpperCase()}
                      </div>
                      <div className="text-sm font-bold text-slate-700">
                        {emp.user.first_name || emp.user.username} {emp.user.last_name || ""}
                      </div>
                    </div>
                  ) : <span className="text-slate-300 italic text-sm">Unassigned</span>}
                </td>
                <td className="px-4 py-4 text-sm font-semibold text-slate-600">{t.due_date}</td>
                <td className="px-4 py-4">
                  <Pill tone={statusTone(t.status)}>{statusLabel(t.status)}</Pill>
                </td>
                <td className="px-4 py-4 text-right">
                  <button className="p-2 rounded-lg text-rose-400 hover:text-rose-600 hover:bg-rose-50 transition-all" onClick={() => deleteTask(t.id)} disabled={busy} title="Delete">
                    <Trash2 size={18} />
                  </button>
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </Card>
  )
}

// ─── ADMIN LAYOUT ────────────────────────────────────────────
function AdminTasksPage({ tasks, employees, jobSites, loadTasks }) {
  const [open, setOpen] = useState(false)
  const modalRef = useRef(null)
  const [pos, setPos] = useState({ x: 24, y: 88 })
  const dragRef = useRef({ dragging: false, dx: 0, dy: 0 })

  useEffect(() => {
    if (!open) return
    const onKeyDown = (e) => {
      if (e.key === "Escape") setOpen(false)
    }
    window.addEventListener("keydown", onKeyDown)
    return () => window.removeEventListener("keydown", onKeyDown)
  }, [open])

  useEffect(() => {
    if (!open) return
    const w = window.innerWidth || 0
    const h = window.innerHeight || 0
    const rect = modalRef.current?.getBoundingClientRect()
    const mw = rect?.width || 880
    const mh = rect?.height || 520
    setPos({
      x: Math.max(16, Math.round((w - mw) / 2)),
      y: Math.max(16, Math.round((h - mh) / 6)),
    })
  }, [open])

  function startDrag(e) {
    if (!open) return
    dragRef.current.dragging = true
    dragRef.current.dx = e.clientX - pos.x
    dragRef.current.dy = e.clientY - pos.y
    e.currentTarget.setPointerCapture?.(e.pointerId)
  }

  function moveDrag(e) {
    if (!dragRef.current.dragging) return
    const rect = modalRef.current?.getBoundingClientRect()
    const mw = rect?.width || 880
    const mh = rect?.height || 520
    const w = window.innerWidth || 0
    const h = window.innerHeight || 0
    const x = e.clientX - dragRef.current.dx
    const y = e.clientY - dragRef.current.dy
    setPos({
      x: Math.min(Math.max(16, x), Math.max(16, w - mw - 16)),
      y: Math.min(Math.max(16, y), Math.max(16, h - mh - 16)),
    })
  }

  function endDrag() {
    dragRef.current.dragging = false
  }

  return (
    <>
      {open && (
        <div className="fixed inset-0 z-[9999] pointer-events-none">
          <div
            ref={modalRef}
            className="absolute w-[min(880px,calc(100vw-32px))] max-h-[calc(100vh-32px)] overflow-auto bg-white rounded-3xl shadow-[0_20px_50px_rgba(0,0,0,0.3)] border border-slate-200 pointer-events-auto animate-in zoom-in-95 duration-200"
            style={{ left: pos.x, top: pos.y }}
          >
            <div className="flex justify-between items-center px-6 py-5 border-b border-slate-100">
              <div
                onPointerDown={startDrag}
                onPointerMove={moveDrag}
                onPointerUp={endDrag}
                onPointerCancel={endDrag}
                className="flex flex-col flex-1 cursor-grab active:cursor-grabbing user-select-none"
              >
                <div className="text-xl font-extrabold text-slate-900 tracking-tight">Create Work Order</div>
                <div className="text-sm text-slate-400 font-medium mt-0.5">Define tasks, assign personnel, and set location constraints.</div>
              </div>
              <button type="button" className="p-2 rounded-xl hover:bg-slate-100 text-slate-400 transition-colors" onClick={() => setOpen(false)}>
                <X size={24} />
              </button>
            </div>

            <div className="p-6">
              <AssignTaskPanel employees={employees} jobSites={jobSites} onAssigned={loadTasks} onClose={() => setOpen(false)} />
            </div>
          </div>
        </div>
      )}

      <div className="flex flex-col gap-6">
        <div className="flex justify-between items-center">
          <div className="flex items-baseline gap-3">
            <h2 className="text-2xl font-extrabold text-slate-900 tracking-tight">Task Queue</h2>
            <span className="text-sm font-bold text-slate-400 uppercase tracking-wider">{tasks.length} Total</span>
          </div>

          <Button onClick={() => setOpen(true)} className="shadow-indigo-100 shadow-xl gap-2">
            <Plus size={18} /> New Work Order
          </Button>
        </div>

        <AdminTasksTable tasks={tasks} employees={employees} jobSites={jobSites} onRefresh={loadTasks} />
      </div>
    </>
  )
}

// ─── EMPLOYEE LAYOUT ─────────────────────────────────────────
function EmployeeTasksPage({ tasks, handleAction, busy }) {
  const [filter, setFilter] = useState("all")
  const filtered = filter === "all" ? tasks : tasks.filter(t => t.status === filter)

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-wrap gap-2 bg-slate-100 p-1.5 rounded-2xl self-start">
        {STATUS_FILTERS.map(f => {
          const isActive = filter === f
          const count = tasks.filter(t => t.status === f).length
          return (
            <button 
              key={f} 
              className={`px-4 py-2 rounded-xl text-sm font-bold transition-all ${isActive ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700 hover:bg-slate-200/50'}`} 
              onClick={() => setFilter(f)}
            >
              <span className="flex items-center gap-2">
                {f === "all" ? "All Tasks" : statusLabel(f)}
                {f !== "all" && count > 0 && <span className={`px-1.5 py-0.5 rounded-md text-[10px] ${isActive ? 'bg-slate-100 text-slate-600' : 'bg-slate-200 text-slate-500'}`}>{count}</span>}
              </span>
            </button>
          )
        })}
      </div>

      {filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-24 px-6 bg-white border border-slate-200 border-dashed rounded-[2rem] text-center">
          <div className="w-20 h-20 rounded-full bg-slate-50 flex items-center justify-center text-slate-200 mb-6">
            <ClipboardList size={40} />
          </div>
          <h3 className="text-xl font-bold text-slate-900">No tasks found</h3>
          <p className="text-slate-400 mt-2 max-w-xs">You're all caught up! Enjoy your break or check back later for new assignments.</p>
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
  const isAdmin = user?.role === "admin"

  const [tasks, setTasks] = useState([])
  const [employees, setEmployees] = useState([])
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
          method: "POST", // using POST because of FormData implementation
          body: fd,
        })
      } else {
        await apiRequest(`/tasks/my/${taskId}/${action}/`, {
          method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
        })
      }
      await loadTasks()
    } catch (e) { setError(e?.body?.detail || e.message || "Action failed.") }
    finally { setBusy(false) }
  }

  return (
    <div className="flex flex-col gap-8">
      <div className="flex justify-between items-end">
        <div>
          <h1 className="text-4xl font-extrabold text-slate-900 tracking-tight flex items-center gap-3">
            <ClipboardList className="text-indigo-600" size={32} />
            Tasks & Orders
          </h1>
          <p className="text-slate-500 mt-2 text-lg">
            {isAdmin ? "Dispatch and monitor work activity across all employees." : "Your personal task feed and execution queue."}
          </p>
        </div>
      </div>

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
        <AdminTasksPage tasks={tasks} employees={employees} jobSites={jobSites} loadTasks={loadTasks} />
      ) : (
        <EmployeeTasksPage tasks={tasks} handleAction={handleAction} busy={busy} />
      )}
    </div>
  )
}
