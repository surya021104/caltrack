import { useEffect, useMemo, useState } from "react"

import { apiRequest, unwrapResults } from "../../api/client.js"
import { useAuth } from "../../state/auth/useAuth.js"
import { Button, Card, Input, Pill } from "../components/kit.jsx"

function formatEmployeeId(value) {
  if (!value) return ""
  const s = String(value).trim()
  const m = /^EMP(\d+)$/i.exec(s.replace(/\s+/g, ""))
  if (m) return `EMP ${m[1].padStart(3, "0")}`
  return s
}

export function PayrollPage() {
  const { user } = useAuth()
  const [records, setRecords] = useState([])
  const [employees, setEmployees] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")
  const [submitting, setSubmitting] = useState(false)

  const [employeeId, setEmployeeId] = useState("")
  const [start, setStart] = useState("")
  const [end, setEnd] = useState("")

  const isAdmin = user?.role === "admin"

  const employeeOptions = useMemo(() => {
    return employees.map((e) => ({ id: e.id, label: `${e.employee_id} (${e.user?.username ?? "user"})` }))
  }, [employees])

  async function load() {
    setLoading(true)
    setError("")
    try {
      const [recordsRes, employeesRes] = await Promise.all([
        apiRequest("/payroll/records/"),
        isAdmin ? apiRequest("/employees/") : Promise.resolve({ results: [] })
      ])
      setRecords(unwrapResults(recordsRes))
      setEmployees(isAdmin ? unwrapResults(employeesRes) : [])
    } catch (err) {
      setError(err?.body?.detail || "Failed to load payroll.")
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
  }, [isAdmin])

  async function generate(e) {
    e.preventDefault()
    setSubmitting(true)
    setError("")
    try {
      await apiRequest("/payroll/generate/", {
        method: "POST",
        json: { employee: employeeId, start, end }
      })
      await load()
    } catch (err) {
      const msg = err?.body?.detail || "Failed to generate payroll."
      setError(msg)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="stackLg">
      <div className="pageHeader">
        <div>
          <h1 className="pageTitle">Payroll</h1>
          <div className="pageSub">Transparent pay: regular, overtime, and leave all reconciled.</div>
        </div>
      </div>

      {error ? <div className="errorBox">{error}</div> : null}

      {isAdmin ? (
        <Card title="Generate Payroll">
          <form className="grid3" onSubmit={generate}>
            <div className="field">
              <label className="label">Employee</label>
              <select className="qt-input" value={employeeId} onChange={(e) => setEmployeeId(e.target.value)} required>
                <option value="">Select Employee...</option>
                {employees.map((emp) => (
                  <option key={emp.id} value={emp.id}>
                    {emp.user?.first_name || emp.user?.username} ({emp.employee_id})
                  </option>
                ))}
              </select>
            </div>
            <Input label="Start" type="date" value={start} onChange={(e) => setStart(e.target.value)} required />
            <Input label="End" type="date" value={end} onChange={(e) => setEnd(e.target.value)} required />
            <div className="gridSpan3 row">
              <Button type="submit" disabled={submitting}>
                {submitting ? "Generating…" : "Generate"}
              </Button>
            </div>
          </form>
        </Card>
      ) : null}

      <Card title="Records">
        {loading ? (
          <div className="muted">Loading…</div>
        ) : records.length ? (
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
              <thead>
                <tr style={{ borderBottom: "2px solid var(--stroke)", textTransform: "uppercase", fontSize: 11, color: "var(--muted)", letterSpacing: "0.05em" }}>
                  <th style={{ padding: "8px 10px", textAlign: "left" }}>Employee</th>
                  <th style={{ padding: "8px 10px", textAlign: "left" }}>Period</th>
                  <th style={{ padding: "8px 10px", textAlign: "left" }}>Region</th>
                  <th style={{ padding: "8px 10px", textAlign: "right" }}>Gross</th>
                  <th style={{ padding: "8px 10px", textAlign: "right" }}>Net</th>
                  <th style={{ padding: "8px 10px", textAlign: "right" }}>Regular hrs</th>
                  <th style={{ padding: "8px 10px", textAlign: "right" }}>OT hrs</th>
                  <th style={{ padding: "8px 10px", textAlign: "right" }}>Daily OT</th>
                  <th style={{ padding: "8px 10px", textAlign: "right" }}>Double Time</th>
                  <th style={{ padding: "8px 10px", textAlign: "right" }}>Tax (UK)</th>
                  <th style={{ padding: "8px 10px", textAlign: "right" }}>Emp NI</th>
                  <th style={{ padding: "8px 10px", textAlign: "right" }}>Employer NI</th>
                  <th style={{ padding: "8px 10px", textAlign: "right" }}>Holiday Accrual</th>
                  <th style={{ padding: "8px 10px", textAlign: "center" }}>Flags</th>
                </tr>
              </thead>
              <tbody>
                {records.map((r) => {
                  const isUK = r.region && r.region.includes("UK")
                  const curr = isUK ? "£" : "$"
                  return (
                    <tr key={r.id} style={{ borderBottom: "1px solid var(--stroke2)" }}>
                      <td style={{ padding: "10px 10px", fontWeight: 600 }}>
                        {r.employee ? formatEmployeeId(r.employee) : "—"}
                        {r.employee_name && <div style={{ fontSize: 11, color: "var(--muted)" }}>{r.employee_name}</div>}
                      </td>
                      <td style={{ padding: "10px 10px", color: "var(--muted)", fontSize: 12 }}>
                        {r.period?.start_date} → {r.period?.end_date}
                      </td>
                      <td style={{ padding: "10px 10px" }}>
                        <span style={{ fontSize: 11, fontWeight: 600, color: "#6366f1" }}>{r.region || "—"}</span>
                        {r.is_exempt && <div style={{ fontSize: 10, color: "#059669", fontWeight: 700 }}>FLSA EXEMPT</div>}
                        {isUK && r.uk_tax_code && <div style={{ fontSize: 10, color: "var(--muted)" }}>Tax: {r.uk_tax_code} · NI: {r.uk_ni_category}</div>}
                      </td>
                      <td style={{ padding: "10px 10px", textAlign: "right", fontWeight: 600 }}>{curr}{r.gross_pay}</td>
                      <td style={{ padding: "10px 10px", textAlign: "right" }}>
                        <Pill tone="good">{curr}{r.net_pay}</Pill>
                      </td>
                      <td style={{ padding: "10px 10px", textAlign: "right" }}>{r.regular_hours}h</td>
                      <td style={{ padding: "10px 10px", textAlign: "right", color: Number(r.overtime_hours) > 0 ? "#d97706" : "var(--fg)", fontWeight: Number(r.overtime_hours) > 0 ? 700 : 400 }}>
                        {r.overtime_hours}h
                      </td>
                      <td style={{ padding: "10px 10px", textAlign: "right", color: Number(r.daily_ot_hours) > 0 ? "#ea580c" : "var(--muted)" }}>
                        {Number(r.daily_ot_hours) > 0 ? `${r.daily_ot_hours}h` : "—"}
                      </td>
                      <td style={{ padding: "10px 10px", textAlign: "right", color: Number(r.double_time_hours) > 0 ? "#dc2626" : "var(--muted)", fontWeight: Number(r.double_time_hours) > 0 ? 700 : 400 }}>
                        {Number(r.double_time_hours) > 0 ? `${r.double_time_hours}h` : "—"}
                      </td>
                      <td style={{ padding: "10px 10px", textAlign: "right", color: "var(--muted)" }}>
                        {isUK && Number(r.uk_income_tax) > 0 ? `£${r.uk_income_tax}` : "—"}
                      </td>
                      <td style={{ padding: "10px 10px", textAlign: "right", color: "var(--muted)" }}>
                        {isUK && Number(r.uk_employee_ni) > 0 ? `£${r.uk_employee_ni}` : "—"}
                      </td>
                      <td style={{ padding: "10px 10px", textAlign: "right", color: "var(--muted)" }}>
                        {isUK && Number(r.uk_employer_ni) > 0 ? `£${r.uk_employer_ni}` : "—"}
                      </td>
                      <td style={{ padding: "10px 10px", textAlign: "right", color: Number(r.holiday_hours_accrued) > 0 ? "#059669" : "var(--muted)" }}>
                        {Number(r.holiday_hours_accrued) > 0 ? `${r.holiday_hours_accrued}h` : "—"}
                      </td>
                      <td style={{ padding: "10px 10px", textAlign: "center" }}>
                        {!r.wage_floor_compliant && (
                          <span style={{ fontSize: 10, background: "#fef2f2", color: "#dc2626", border: "1px solid #fca5a5", borderRadius: 4, padding: "2px 6px", fontWeight: 700 }}>
                            MIN WAGE
                          </span>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="muted">No payroll records yet.</div>
        )}
      </Card>
    </div>
  )
}

