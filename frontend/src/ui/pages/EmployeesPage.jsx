import { useEffect, useMemo, useRef, useState } from "react"

import { apiRequest, unwrapResults } from "../../api/client.js"
import { useAuth } from "../../state/auth/useAuth.js"
import { Button, Card, Input, Pill } from "../components/kit.jsx"
import { Loader2, ShieldCheck, ShieldOff, AlertTriangle, ChevronDown, ChevronUp } from "lucide-react"
import { fireSparkleFromEl } from "../sparkle.js"

// ── Exempt status badge ─────────────────────────────────────────────────────
function ExemptBadge({ status }) {
  if (status === "exempt") return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 4, background: "#ecfdf5", color: "#059669", border: "1px solid #6ee7b7", borderRadius: 6, padding: "2px 8px", fontSize: 11, fontWeight: 700 }}>
      <ShieldCheck size={11} /> EXEMPT
    </span>
  )
  if (status === "non_exempt") return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 4, background: "#eff6ff", color: "#2563eb", border: "1px solid #bfdbfe", borderRadius: 6, padding: "2px 8px", fontSize: 11, fontWeight: 700 }}>
      <ShieldOff size={11} /> NON-EXEMPT
    </span>
  )
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 4, background: "#fefce8", color: "#ca8a04", border: "1px solid #fde68a", borderRadius: 6, padding: "2px 8px", fontSize: 11, fontWeight: 700 }}>
      <AlertTriangle size={11} /> PENDING
    </span>
  )
}

export function EmployeesPage() {
  const { user } = useAuth()
  const isAdmin = user?.role === "admin"
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
          <h1 className="text-3xl font-extrabold text-slate-900 tracking-tight">Employees</h1>
          <div className="text-slate-500 mt-1">Admin access required.</div>
        </div>
        <Card><div className="text-slate-400 italic">You don't have permission to view this page.</div></Card>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-8">
      <div className="flex justify-between items-end">
        <div>
          <h1 className="text-3xl font-extrabold text-slate-900 tracking-tight">Employees</h1>
          <div className="text-slate-500 mt-1">Manage roster, rates, and compliance classification.</div>
        </div>
        <div className="flex items-center gap-3">
          <Pill tone="neutral">{items.length} total</Pill>
          <Pill tone="good">{activeCount} active</Pill>
        </div>
      </div>

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
              <div className="text-[10px] text-slate-400 mt-1 flex gap-1">
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
          <div style={{ border: "1px solid var(--stroke)", borderRadius: 10, overflow: "hidden" }}>
            <button
              type="button"
              onClick={() => setShowComplianceFields(v => !v)}
              style={{
                width: "100%", display: "flex", alignItems: "center", justifyContent: "space-between",
                padding: "12px 16px", background: "var(--surface)", border: "none", cursor: "pointer",
                fontWeight: 700, fontSize: 13, color: "var(--fg)",
              }}
            >
              <span>⚖️ Compliance &amp; Payroll Classification</span>
              {showComplianceFields ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
            </button>

            {showComplianceFields && (
              <div style={{ padding: "16px", display: "flex", flexDirection: "column", gap: 16 }}>
                {/* Region */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-x-6 gap-y-4">
                  <div className="flex flex-col gap-1">
                    <label className="fieldLabel">Country</label>
                    <select
                      value={country}
                      onChange={e => setCountry(e.target.value)}
                      style={{ border: "1px solid var(--stroke)", borderRadius: 8, padding: "8px 12px", fontSize: 14, background: "var(--bg)", color: "var(--fg)" }}
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
                  <div style={{ background: "#eff6ff", border: "1px solid #bfdbfe", borderRadius: 8, padding: 14 }}>
                    <div style={{ fontWeight: 700, fontSize: 13, color: "#1d4ed8", marginBottom: 10 }}>
                      🇺🇸 US FLSA Classification
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-4">
                      <div className="flex flex-col gap-1">
                        <label className="fieldLabel">Exempt Status</label>
                        <select
                          value={exemptStatus}
                          onChange={e => setExemptStatus(e.target.value)}
                          style={{ border: "1px solid var(--stroke)", borderRadius: 8, padding: "8px 12px", fontSize: 14, background: "var(--bg)", color: "var(--fg)" }}
                        >
                          <option value="non_exempt">Non-Exempt (eligible for OT pay)</option>
                          <option value="exempt">Exempt (no OT pay required)</option>
                          <option value="pending">Pending Classification</option>
                        </select>
                        <div style={{ fontSize: 11, color: "#64748b", marginTop: 2 }}>
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
                          <div style={{ fontSize: 11, marginTop: 2, fontWeight: 600, color: Number(weeklySalary) >= 844 ? "#059669" : "#dc2626" }}>
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
                  <div style={{ background: "#f0fdf4", border: "1px solid #bbf7d0", borderRadius: 8, padding: 14 }}>
                    <div style={{ fontWeight: 700, fontSize: 13, color: "#166534", marginBottom: 10 }}>
                      🇬🇧 UK PAYE &amp; NI Settings
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-x-6 gap-y-4">
                      <div className="flex flex-col gap-1">
                        <label className="fieldLabel">Tax Code</label>
                        <input className="input" value={ukTaxCode} onChange={e => setUkTaxCode(e.target.value)} placeholder="e.g. 1257L" />
                        <div style={{ fontSize: 11, color: "#64748b" }}>Standard personal allowance: 1257L</div>
                      </div>
                      <div className="flex flex-col gap-1">
                        <label className="fieldLabel">NI Category Letter</label>
                        <select
                          value={ukNiCategory}
                          onChange={e => setUkNiCategory(e.target.value)}
                          style={{ border: "1px solid var(--stroke)", borderRadius: 8, padding: "8px 12px", fontSize: 14, background: "var(--bg)", color: "var(--fg)" }}
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
          <div className="text-slate-400 flex items-center gap-2">
            <Loader2 className="animate-spin" size={16} />Loading…
          </div>
        ) : items.length ? (
          <div className="w-full overflow-x-auto">
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
              <thead>
                <tr style={{ borderBottom: "2px solid var(--stroke)", textTransform: "uppercase", fontSize: 11, color: "var(--muted)", letterSpacing: "0.05em" }}>
                  <th style={{ padding: "8px 12px", textAlign: "left", fontWeight: 700 }}>ID</th>
                  <th style={{ padding: "8px 12px", textAlign: "left", fontWeight: 700 }}>User</th>
                  <th style={{ padding: "8px 12px", textAlign: "left", fontWeight: 700 }}>Title</th>
                  <th style={{ padding: "8px 12px", textAlign: "right", fontWeight: 700 }}>Rate</th>
                  <th style={{ padding: "8px 12px", textAlign: "left", fontWeight: 700 }}>Region</th>
                  <th style={{ padding: "8px 12px", textAlign: "left", fontWeight: 700 }}>Classification</th>
                  <th style={{ padding: "8px 12px", textAlign: "left", fontWeight: 700 }}>UK Payroll</th>
                  <th style={{ padding: "8px 12px", textAlign: "right", fontWeight: 700 }}>Status</th>
                </tr>
              </thead>
              <tbody>
                {items.map((e) => (
                  <tr key={e.id} style={{ borderBottom: "1px solid var(--stroke2)" }}>
                    <td style={{ padding: "10px 12px", fontWeight: 700, color: "var(--fg)" }}>{e.employee_id}</td>
                    <td style={{ padding: "10px 12px", color: "var(--muted)" }}>
                      {e.user?.username}
                      {e.user?.email && <div style={{ fontSize: 11 }}>{e.user.email}</div>}
                    </td>
                    <td style={{ padding: "10px 12px", color: "var(--fg)" }}>{e.title || "—"}</td>
                    <td style={{ padding: "10px 12px", textAlign: "right", fontWeight: 600 }}>
                      {e.country === "UK" ? "£" : "$"}{e.hourly_rate}/hr
                    </td>
                    <td style={{ padding: "10px 12px" }}>
                      <div style={{ fontSize: 12, fontWeight: 600, color: "var(--fg)" }}>
                        {e.country === "UK" ? "🇬🇧 UK" : e.country === "US" ? "🇺🇸 US" : (e.country || "—")}
                      </div>
                      {e.state && <div style={{ fontSize: 11, color: "var(--muted)" }}>{e.state}</div>}
                    </td>
                    <td style={{ padding: "10px 12px" }}>
                      {e.country === "US" ? (
                        <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
                          <ExemptBadge status={e.exempt_status} />
                          {e.weekly_salary && (
                            <span style={{ fontSize: 11, color: "var(--muted)" }}>${e.weekly_salary}/wk</span>
                          )}
                          {e.flsa_duties_category && (
                            <span style={{ fontSize: 10, color: "#6366f1", textTransform: "uppercase", fontWeight: 600 }}>{e.flsa_duties_category}</span>
                          )}
                        </div>
                      ) : "—"}
                    </td>
                    <td style={{ padding: "10px 12px" }}>
                      {e.country === "UK" ? (
                        <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                          <span style={{ fontSize: 12, fontWeight: 600 }}>Tax: {e.uk_tax_code || "—"}</span>
                          <span style={{ fontSize: 11, color: "var(--muted)" }}>NI Cat: {e.uk_ni_category || "—"}</span>
                          {e.rolled_up_holiday_pay && (
                            <span style={{ fontSize: 10, color: "#059669", fontWeight: 700 }}>Rolled-up holiday</span>
                          )}
                          {e.wtr_opt_out_active && (
                            <span style={{ fontSize: 10, color: "#d97706", fontWeight: 700 }}>48hr opt-out</span>
                          )}
                        </div>
                      ) : "—"}
                    </td>
                    <td style={{ padding: "10px 12px", textAlign: "right" }}>
                      <Pill tone={e.is_active ? "good" : "bad"}>{e.is_active ? "active" : "inactive"}</Pill>
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
  )
}
