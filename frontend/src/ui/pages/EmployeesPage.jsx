import { useEffect, useMemo, useRef, useState } from "react"

import { apiRequest, unwrapResults } from "../../api/client.js"
import { useAuth } from "../../state/auth/useAuth.js"
import { useRole } from "../../state/auth/useRole.js"
import { Button, Card, Input, Pill } from "../components/kit.jsx"
import { Loader2, ShieldCheck, ShieldOff, AlertTriangle, ChevronDown, ChevronUp, Users, Edit3, Trash2, X } from "lucide-react"
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
    </div>
  )
}
