import { useEffect, useState, useCallback } from "react"
import { apiRequest, unwrapResults } from "../../api/client.js"
import { useAuth } from "../../state/auth/useAuth.js"
import { Button, Card, Pill } from "../components/kit.jsx"
import {
  ShieldAlert, ShieldCheck, ShieldOff, AlertTriangle, Download,
  FileText, Users, Clock, CalendarDays, CheckCircle, XCircle,
  RefreshCw, BadgeAlert, BadgeCheck, FileClock, Send,
} from "lucide-react"

// ---------------------------------------------------------------------------
// Section header
// ---------------------------------------------------------------------------
function SectionHeader({ icon, title, sub }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 18 }}>
      <div style={{ width: 36, height: 36, borderRadius: 8, background: "var(--surface)", display: "flex", alignItems: "center", justifyContent: "center" }}>
        {icon}
      </div>
      <div>
        <div style={{ fontWeight: 700, fontSize: 15 }}>{title}</div>
        {sub && <div style={{ fontSize: 12, color: "var(--muted)" }}>{sub}</div>}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// OT Risk Panel
// ---------------------------------------------------------------------------
function OTRiskPanel() {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    apiRequest("/compliance/ot-risk/")
      .then(r => setData(r.data || r))
      .catch(() => setData(null))
      .finally(() => setLoading(false))
  }, [])

  const alerts = data?.alerts || []
  const summary = data?.summary || {}

  return (
    <Card title="">
      <SectionHeader
        icon={<AlertTriangle size={18} color="#d97706" />}
        title="Overtime Risk (US FLSA)"
        sub="Real-time OT flags for active employees this week"
      />
      {loading ? <div className="muted">Loading…</div> : (
        <>
          <div style={{ display: "flex", gap: 16, marginBottom: 16, flexWrap: "wrap" }}>
            {[
              { label: "Approaching OT", value: summary.approaching_ot ?? 0, color: "#d97706" },
              { label: "In Overtime", value: summary.in_ot ?? 0, color: "#dc2626" },
              { label: "CA Daily OT", value: summary.daily_ot ?? 0, color: "#ea580c" },
              { label: "Double Time", value: summary.double_time ?? 0, color: "#991b1b" },
            ].map(s => (
              <div key={s.label} style={{ background: "var(--surface)", borderRadius: 10, padding: "10px 18px", minWidth: 110, textAlign: "center" }}>
                <div style={{ fontSize: 24, fontWeight: 800, color: s.color }}>{s.value}</div>
                <div style={{ fontSize: 11, color: "var(--muted)", marginTop: 2 }}>{s.label}</div>
              </div>
            ))}
          </div>

          {alerts.length > 0 ? (
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
              {alerts.map((a, i) => (
                <div key={i} style={{
                  background: a.alert_type?.includes("double") ? "#fef2f2" : a.alert_type?.includes("approaching") ? "#fffbeb" : "#fff7ed",
                  border: `1px solid ${a.alert_type?.includes("double") ? "#fca5a5" : a.alert_type?.includes("approaching") ? "#fde68a" : "#fed7aa"}`,
                  borderRadius: 8, padding: "6px 12px", fontSize: 12,
                }}>
                  <span style={{ fontWeight: 700, color: a.alert_type?.includes("double") ? "#dc2626" : "#d97706" }}>
                    {a.employee_name || a.employee_id}
                  </span>
                  <span style={{ color: "var(--muted)", marginLeft: 6 }}>
                    {a.hours_worked?.toFixed(1)}h — {a.alert_type?.replace(/_/g, " ")}
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <div style={{ color: "#059669", fontSize: 13, fontWeight: 600, display: "flex", alignItems: "center", gap: 6 }}>
              <CheckCircle size={15} /> No overtime risk this week
            </div>
          )}
        </>
      )}
    </Card>
  )
}

// ---------------------------------------------------------------------------
// UK 48hr Monitor Panel
// ---------------------------------------------------------------------------
function UK48HrPanel() {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    apiRequest("/compliance/uk-48hr/")
      .then(r => setData(r.data || r))
      .catch(() => setData(null))
      .finally(() => setLoading(false))
  }, [])

  const employees = data?.employees || []
  const compliant = employees.filter(e => e.is_compliant).length
  const breaching = employees.filter(e => !e.is_compliant).length

  return (
    <Card title="">
      <SectionHeader
        icon={<Clock size={18} color="#6366f1" />}
        title="UK 48-Hour Rolling Average (WTR)"
        sub="17-week rolling average — limit: 48 hrs/week"
      />
      {loading ? <div className="muted">Loading…</div> : (
        <>
          <div style={{ display: "flex", gap: 16, marginBottom: 16 }}>
            <div style={{ background: "#f0fdf4", borderRadius: 10, padding: "10px 18px", textAlign: "center", minWidth: 100 }}>
              <div style={{ fontSize: 22, fontWeight: 800, color: "#059669" }}>{compliant}</div>
              <div style={{ fontSize: 11, color: "var(--muted)" }}>Compliant</div>
            </div>
            <div style={{ background: "#fef2f2", borderRadius: 10, padding: "10px 18px", textAlign: "center", minWidth: 100 }}>
              <div style={{ fontSize: 22, fontWeight: 800, color: "#dc2626" }}>{breaching}</div>
              <div style={{ fontSize: 11, color: "var(--muted)" }}>Breaching</div>
            </div>
          </div>
          {employees.length > 0 ? (
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                <thead>
                  <tr style={{ borderBottom: "2px solid var(--stroke)", fontSize: 11, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.05em" }}>
                    <th style={{ padding: "6px 10px", textAlign: "left" }}>Employee</th>
                    <th style={{ padding: "6px 10px", textAlign: "right" }}>Avg hrs/wk</th>
                    <th style={{ padding: "6px 10px", textAlign: "right" }}>Headroom</th>
                    <th style={{ padding: "6px 10px", textAlign: "center" }}>Opt-out</th>
                    <th style={{ padding: "6px 10px", textAlign: "center" }}>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {employees.map((e, i) => (
                    <tr key={i} style={{ borderBottom: "1px solid var(--stroke2)" }}>
                      <td style={{ padding: "8px 10px", fontWeight: 600 }}>{e.employee_name || e.employee_id}</td>
                      <td style={{ padding: "8px 10px", textAlign: "right", fontWeight: 700, color: !e.is_compliant ? "#dc2626" : "var(--fg)" }}>
                        {e.average_hours?.toFixed(1)}h
                      </td>
                      <td style={{ padding: "8px 10px", textAlign: "right", color: "var(--muted)" }}>
                        {e.headroom_hours >= 0 ? `${e.headroom_hours?.toFixed(1)}h` : "—"}
                      </td>
                      <td style={{ padding: "8px 10px", textAlign: "center" }}>
                        {e.has_opt_out ? <Pill tone="good">Yes</Pill> : <span style={{ color: "var(--muted)", fontSize: 11 }}>No</span>}
                      </td>
                      <td style={{ padding: "8px 10px", textAlign: "center" }}>
                        {e.is_compliant
                          ? <Pill tone="good">OK</Pill>
                          : <Pill tone="bad">BREACH</Pill>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="muted">No UK employees found.</div>
          )}
        </>
      )}
    </Card>
  )
}

// ---------------------------------------------------------------------------
// RTW Documents Panel
// ---------------------------------------------------------------------------
function RTWPanel() {
  const [docs, setDocs] = useState([])
  const [expiring, setExpiring] = useState([])
  const [loading, setLoading] = useState(true)
  const [alerting, setAlerting] = useState(false)
  const [alertResult, setAlertResult] = useState(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [docsRes, expiryRes] = await Promise.all([
        apiRequest("/compliance/rtw/"),
        apiRequest("/compliance/rtw/expiry-check/"),
      ])
      setDocs(unwrapResults(docsRes))
      setExpiring(expiryRes.data?.expiring || [])
    } catch {
      setDocs([])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  async function sendAlerts() {
    setAlerting(true)
    setAlertResult(null)
    try {
      const res = await apiRequest("/compliance/rtw/send-alerts/", { method: "POST" })
      setAlertResult({ ok: true, count: res.data?.alerts_processed || 0 })
    } catch {
      setAlertResult({ ok: false })
    } finally {
      setAlerting(false)
    }
  }

  const STATUS_COLOR = {
    verified: "#059669",
    pending: "#d97706",
    expired: "#dc2626",
    rejected: "#dc2626",
  }

  return (
    <Card title="">
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 18 }}>
        <SectionHeader
          icon={<FileText size={18} color="#059669" />}
          title="Right to Work Documents (UK)"
          sub="Passport, BRP, share code verification"
        />
        <div style={{ display: "flex", gap: 8, flexShrink: 0 }}>
          {expiring.length > 0 && (
            <Button onClick={sendAlerts} disabled={alerting} style={{ fontSize: 12 }}>
              <Send size={13} style={{ marginRight: 5 }} />
              {alerting ? "Sending…" : `Send ${expiring.length} Alert${expiring.length !== 1 ? "s" : ""}`}
            </Button>
          )}
        </div>
      </div>

      {alertResult && (
        <div style={{ marginBottom: 12, padding: "8px 12px", borderRadius: 8, background: alertResult.ok ? "#f0fdf4" : "#fef2f2", fontSize: 13 }}>
          {alertResult.ok ? `✓ ${alertResult.count} RTW alert email(s) sent.` : "Failed to send alerts."}
        </div>
      )}

      {expiring.length > 0 && (
        <div style={{ marginBottom: 14, display: "flex", flexWrap: "wrap", gap: 6 }}>
          {expiring.map((e, i) => (
            <div key={i} style={{ background: "#fff7ed", border: "1px solid #fed7aa", borderRadius: 8, padding: "5px 10px", fontSize: 12 }}>
              <span style={{ fontWeight: 700, color: "#ea580c" }}>⚠ {e.employee_name}</span>
              <span style={{ color: "var(--muted)", marginLeft: 6 }}>expires in {e.days_until_expiry}d</span>
            </div>
          ))}
        </div>
      )}

      {loading ? <div className="muted">Loading…</div> : docs.length > 0 ? (
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
            <thead>
              <tr style={{ borderBottom: "2px solid var(--stroke)", fontSize: 11, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.05em" }}>
                <th style={{ padding: "6px 10px", textAlign: "left" }}>Employee</th>
                <th style={{ padding: "6px 10px", textAlign: "left" }}>Document</th>
                <th style={{ padding: "6px 10px", textAlign: "left" }}>Reference</th>
                <th style={{ padding: "6px 10px", textAlign: "left" }}>Expiry</th>
                <th style={{ padding: "6px 10px", textAlign: "center" }}>Status</th>
                <th style={{ padding: "6px 10px", textAlign: "center" }}>Verified by</th>
              </tr>
            </thead>
            <tbody>
              {docs.map(d => (
                <tr key={d.id} style={{ borderBottom: "1px solid var(--stroke2)" }}>
                  <td style={{ padding: "8px 10px", fontWeight: 600 }}>{d.employee_name || d.employee}</td>
                  <td style={{ padding: "8px 10px" }}>{d.document_type_display || d.document_type}</td>
                  <td style={{ padding: "8px 10px", color: "var(--muted)", fontFamily: "monospace", fontSize: 12 }}>{d.document_reference || "—"}</td>
                  <td style={{ padding: "8px 10px" }}>
                    {d.expiry_date ? (
                      <span style={{ color: d.days_until_expiry != null && d.days_until_expiry < 30 ? "#dc2626" : "var(--fg)" }}>
                        {d.expiry_date}
                        {d.days_until_expiry != null && d.days_until_expiry < 60 && (
                          <span style={{ marginLeft: 4, fontSize: 10, color: "#d97706" }}>({d.days_until_expiry}d)</span>
                        )}
                      </span>
                    ) : "—"}
                  </td>
                  <td style={{ padding: "8px 10px", textAlign: "center" }}>
                    <span style={{ fontSize: 11, fontWeight: 700, color: STATUS_COLOR[d.status] || "var(--muted)", textTransform: "uppercase" }}>
                      {d.status}
                    </span>
                  </td>
                  <td style={{ padding: "8px 10px", textAlign: "center", fontSize: 11, color: "var(--muted)" }}>
                    {d.verified_by_name || "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="muted">No RTW documents on record.</div>
      )}
    </Card>
  )
}

// ---------------------------------------------------------------------------
// WTR Opt-Out Panel
// ---------------------------------------------------------------------------
function WTROptOutPanel() {
  const [optOuts, setOptOuts] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    apiRequest("/compliance/wtr-optout/")
      .then(r => setOptOuts(unwrapResults(r)))
      .catch(() => setOptOuts([]))
      .finally(() => setLoading(false))
  }, [])

  const active = optOuts.filter(o => o.is_active).length

  return (
    <Card title="">
      <SectionHeader
        icon={<ShieldOff size={18} color="#6366f1" />}
        title="WTR 48-Hour Opt-Out Agreements"
        sub="Employees who have signed the WTR Reg 5 opt-out"
      />
      <div style={{ marginBottom: 12, fontSize: 13 }}>
        <span style={{ fontWeight: 700, color: "#6366f1" }}>{active}</span>
        <span style={{ color: "var(--muted)", marginLeft: 4 }}>active opt-out{active !== 1 ? "s" : ""}</span>
      </div>
      {loading ? <div className="muted">Loading…</div> : optOuts.length > 0 ? (
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
            <thead>
              <tr style={{ borderBottom: "2px solid var(--stroke)", fontSize: 11, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.05em" }}>
                <th style={{ padding: "6px 10px", textAlign: "left" }}>Employee</th>
                <th style={{ padding: "6px 10px", textAlign: "left" }}>Signed On</th>
                <th style={{ padding: "6px 10px", textAlign: "left" }}>Withdrawn</th>
                <th style={{ padding: "6px 10px", textAlign: "center" }}>Active</th>
              </tr>
            </thead>
            <tbody>
              {optOuts.map(o => (
                <tr key={o.id} style={{ borderBottom: "1px solid var(--stroke2)" }}>
                  <td style={{ padding: "8px 10px", fontWeight: 600 }}>{o.employee_name || o.employee}</td>
                  <td style={{ padding: "8px 10px", color: "var(--muted)" }}>{o.signed_on || "—"}</td>
                  <td style={{ padding: "8px 10px", color: "var(--muted)" }}>{o.withdrawn_on || "—"}</td>
                  <td style={{ padding: "8px 10px", textAlign: "center" }}>
                    {o.is_active ? <Pill tone="good">Active</Pill> : <Pill tone="neutral">Withdrawn</Pill>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="muted">No WTR opt-out agreements on record.</div>
      )}
    </Card>
  )
}

// ---------------------------------------------------------------------------
// Wage Floor Panel
// ---------------------------------------------------------------------------
function WageFloorPanel() {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    apiRequest("/compliance/wage-floor/")
      .then(r => setData(r.data || r))
      .catch(() => setData(null))
      .finally(() => setLoading(false))
  }, [])

  const violations = data?.violations || []
  const total = data?.total_checked || 0

  return (
    <Card title="">
      <SectionHeader
        icon={<BadgeAlert size={18} color="#dc2626" />}
        title="Minimum Wage Floor (US + UK)"
        sub="All 50 US states + UK NMW/NLW by age band"
      />
      <div style={{ marginBottom: 12, fontSize: 13 }}>
        <span style={{ fontWeight: 700, color: violations.length > 0 ? "#dc2626" : "#059669" }}>{violations.length}</span>
        <span style={{ color: "var(--muted)", marginLeft: 4 }}>
          violation{violations.length !== 1 ? "s" : ""} out of {total} employees checked
        </span>
      </div>
      {loading ? <div className="muted">Loading…</div> : violations.length > 0 ? (
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
            <thead>
              <tr style={{ borderBottom: "2px solid var(--stroke)", fontSize: 11, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.05em" }}>
                <th style={{ padding: "6px 10px", textAlign: "left" }}>Employee</th>
                <th style={{ padding: "6px 10px", textAlign: "left" }}>Region</th>
                <th style={{ padding: "6px 10px", textAlign: "right" }}>Rate</th>
                <th style={{ padding: "6px 10px", textAlign: "right" }}>Floor</th>
                <th style={{ padding: "6px 10px", textAlign: "right" }}>Shortfall</th>
              </tr>
            </thead>
            <tbody>
              {violations.map((v, i) => (
                <tr key={i} style={{ borderBottom: "1px solid var(--stroke2)", background: "#fef2f2" }}>
                  <td style={{ padding: "8px 10px", fontWeight: 600 }}>{v.employee_name || v.employee_id}</td>
                  <td style={{ padding: "8px 10px", color: "var(--muted)" }}>{v.country}{v.state ? ` (${v.state})` : ""}</td>
                  <td style={{ padding: "8px 10px", textAlign: "right" }}>{v.currency}{v.employee_rate?.toFixed(2)}</td>
                  <td style={{ padding: "8px 10px", textAlign: "right" }}>{v.currency}{v.minimum_wage_floor?.toFixed(2)}</td>
                  <td style={{ padding: "8px 10px", textAlign: "right", color: "#dc2626", fontWeight: 700 }}>
                    {v.currency}{v.shortfall_per_hour?.toFixed(2)}/hr
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div style={{ color: "#059669", fontSize: 13, fontWeight: 600, display: "flex", alignItems: "center", gap: 6 }}>
          <CheckCircle size={15} /> All employees above minimum wage floor
        </div>
      )}
    </Card>
  )
}

// ---------------------------------------------------------------------------
// Break Compliance Panel
// ---------------------------------------------------------------------------
function BreakCompliancePanel() {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(false)
  const [start, setStart] = useState(() => {
    const d = new Date(); d.setDate(d.getDate() - 7); return d.toISOString().slice(0, 10)
  })
  const [end, setEnd] = useState(() => new Date().toISOString().slice(0, 10))

  async function run() {
    setLoading(true)
    try {
      const res = await apiRequest(`/compliance/break-compliance/?start=${start}&end=${end}`)
      setData(res.data || res)
    } catch {
      setData(null)
    } finally {
      setLoading(false)
    }
  }

  const breakViolations = data?.break_violations || []
  const restViolations = data?.rest_violations || []

  return (
    <Card title="">
      <SectionHeader
        icon={<FileClock size={18} color="#6366f1" />}
        title="Break Compliance Report"
        sub="Meal/rest break violations + UK 11hr daily rest"
      />
      <div style={{ display: "flex", gap: 10, alignItems: "flex-end", marginBottom: 16 }}>
        <div className="field" style={{ marginBottom: 0 }}>
          <label className="label">From</label>
          <input className="qt-input" type="date" value={start} onChange={e => setStart(e.target.value)} />
        </div>
        <div className="field" style={{ marginBottom: 0 }}>
          <label className="label">To</label>
          <input className="qt-input" type="date" value={end} onChange={e => setEnd(e.target.value)} />
        </div>
        <Button onClick={run} disabled={loading}>
          {loading ? "Running…" : "Run Report"}
        </Button>
      </div>
      {data && (
        <>
          <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 8 }}>
            Break violations: <span style={{ color: breakViolations.length ? "#dc2626" : "#059669" }}>{breakViolations.length}</span>
            <span style={{ marginLeft: 16 }}>
              Rest violations (UK 11hr): <span style={{ color: restViolations.length ? "#dc2626" : "#059669" }}>{restViolations.length}</span>
            </span>
          </div>
          {breakViolations.length > 0 && (
            <div style={{ overflowX: "auto", marginBottom: 12 }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                <thead>
                  <tr style={{ borderBottom: "1px solid var(--stroke)", color: "var(--muted)", textTransform: "uppercase", fontSize: 10 }}>
                    <th style={{ padding: "5px 8px", textAlign: "left" }}>Employee</th>
                    <th style={{ padding: "5px 8px", textAlign: "left" }}>Date</th>
                    <th style={{ padding: "5px 8px", textAlign: "right" }}>Hours Worked</th>
                    <th style={{ padding: "5px 8px", textAlign: "left" }}>Violation</th>
                  </tr>
                </thead>
                <tbody>
                  {breakViolations.map((v, i) => (
                    <tr key={i} style={{ borderBottom: "1px solid var(--stroke2)", background: i % 2 ? "var(--surface)" : "" }}>
                      <td style={{ padding: "6px 8px" }}>{v.employee_name || v.employee_id}</td>
                      <td style={{ padding: "6px 8px", color: "var(--muted)" }}>{v.work_date}</td>
                      <td style={{ padding: "6px 8px", textAlign: "right" }}>{v.worked_hours}h</td>
                      <td style={{ padding: "6px 8px", color: "#dc2626", fontSize: 11 }}>{v.violation}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {restViolations.length > 0 && (
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                <thead>
                  <tr style={{ borderBottom: "1px solid var(--stroke)", color: "var(--muted)", textTransform: "uppercase", fontSize: 10 }}>
                    <th style={{ padding: "5px 8px", textAlign: "left" }}>Employee</th>
                    <th style={{ padding: "5px 8px", textAlign: "left" }}>Shift Start</th>
                    <th style={{ padding: "5px 8px", textAlign: "right" }}>Rest (hrs)</th>
                    <th style={{ padding: "5px 8px", textAlign: "left" }}>Violation</th>
                  </tr>
                </thead>
                <tbody>
                  {restViolations.map((v, i) => (
                    <tr key={i} style={{ borderBottom: "1px solid var(--stroke2)", background: i % 2 ? "var(--surface)" : "" }}>
                      <td style={{ padding: "6px 8px" }}>{v.employee_name || v.employee_id}</td>
                      <td style={{ padding: "6px 8px", color: "var(--muted)" }}>{v.shift_start?.slice(0, 16).replace("T", " ")}</td>
                      <td style={{ padding: "6px 8px", textAlign: "right", color: "#dc2626", fontWeight: 700 }}>{v.rest_hours}h</td>
                      <td style={{ padding: "6px 8px", color: "#dc2626", fontSize: 11 }}>{v.violation}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {breakViolations.length === 0 && restViolations.length === 0 && (
            <div style={{ color: "#059669", fontSize: 13, fontWeight: 600, display: "flex", alignItems: "center", gap: 6 }}>
              <CheckCircle size={15} /> No break or rest violations in this period
            </div>
          )}
        </>
      )}
    </Card>
  )
}

// ---------------------------------------------------------------------------
// Holiday Accrual Panel
// ---------------------------------------------------------------------------
function HolidayAccrualPanel() {
  const [accruals, setAccruals] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    apiRequest("/compliance/holiday-accrual/")
      .then(r => setAccruals(unwrapResults(r)))
      .catch(() => setAccruals([]))
      .finally(() => setLoading(false))
  }, [])

  return (
    <Card title="">
      <SectionHeader
        icon={<CalendarDays size={18} color="#059669" />}
        title="UK Holiday Accrual (WTR Reg 13 + 13A)"
        sub="12.07% of hours worked — Reg 13 (4wk) + Reg 13A (1.6wk) pots"
      />
      {loading ? <div className="muted">Loading…</div> : accruals.length > 0 ? (
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
            <thead>
              <tr style={{ borderBottom: "2px solid var(--stroke)", fontSize: 11, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.05em" }}>
                <th style={{ padding: "6px 10px", textAlign: "left" }}>Employee</th>
                <th style={{ padding: "6px 10px", textAlign: "right" }}>Reg 13 (4wk)</th>
                <th style={{ padding: "6px 10px", textAlign: "right" }}>Reg 13A (1.6wk)</th>
                <th style={{ padding: "6px 10px", textAlign: "right" }}>Total Remaining</th>
                <th style={{ padding: "6px 10px", textAlign: "right" }}>Carry-over</th>
                <th style={{ padding: "6px 10px", textAlign: "center" }}>Rolled-up Pay</th>
              </tr>
            </thead>
            <tbody>
              {accruals.map(a => (
                <tr key={a.id} style={{ borderBottom: "1px solid var(--stroke2)" }}>
                  <td style={{ padding: "8px 10px", fontWeight: 600 }}>{a.employee_name || a.employee}</td>
                  <td style={{ padding: "8px 10px", textAlign: "right" }}>{a.reg13_hours_remaining?.toFixed(1) ?? "—"}h</td>
                  <td style={{ padding: "8px 10px", textAlign: "right" }}>{a.reg13a_hours_remaining?.toFixed(1) ?? "—"}h</td>
                  <td style={{ padding: "8px 10px", textAlign: "right", fontWeight: 700, color: "#059669" }}>{a.total_hours_remaining?.toFixed(1) ?? "—"}h</td>
                  <td style={{ padding: "8px 10px", textAlign: "right", color: "var(--muted)" }}>{a.carry_over_hours?.toFixed(1) ?? "—"}h</td>
                  <td style={{ padding: "8px 10px", textAlign: "center" }}>
                    {a.rolled_up_pay_enabled ? <Pill tone="good">Yes</Pill> : <span style={{ color: "var(--muted)", fontSize: 11 }}>No</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="muted">No holiday accrual records. Run payroll to generate accruals.</div>
      )}
    </Card>
  )
}

// ---------------------------------------------------------------------------
// Audit Trail Panel
// ---------------------------------------------------------------------------
function AuditTrailPanel({ apiBase }) {
  const [logs, setLogs] = useState([])
  const [loading, setLoading] = useState(true)
  const [downloading, setDownloading] = useState(false)
  const [page, setPage] = useState(1)
  const PAGE_SIZE = 30

  useEffect(() => {
    apiRequest("/compliance/audit-log/")
      .then(r => setLogs(unwrapResults(r)))
      .catch(() => setLogs([]))
      .finally(() => setLoading(false))
  }, [])

  async function downloadPDF() {
    setDownloading(true)
    try {
      const token = localStorage.getItem("quicktims.token")
      const base = apiBase || ""
      const res = await fetch(`${base}/api/compliance/audit-log/export/`, {
        headers: { Authorization: `Bearer ${token}` }
      })
      if (!res.ok) throw new Error("Export failed")
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement("a")
      a.href = url; a.download = "audit_trail.pdf"; a.click()
      URL.revokeObjectURL(url)
    } catch {
      alert("PDF export failed.")
    } finally {
      setDownloading(false)
    }
  }

  const paged = logs.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)
  const totalPages = Math.ceil(logs.length / PAGE_SIZE)

  const ACTION_COLOR = {
    CREATE: "#059669",
    EDIT: "#d97706",
    DELETE: "#dc2626",
    SUBMIT: "#6366f1",
    APPROVE: "#059669",
    REJECT: "#dc2626",
    ADMIN_OVERRIDE: "#ea580c",
  }

  return (
    <Card title="">
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 18 }}>
        <SectionHeader
          icon={<ScrollText size={18} color="#64748b" />}
          title="Immutable Audit Trail"
          sub="Every TimeLog edit/delete logged — 3-year DOL/WTR retention"
        />
        <Button onClick={downloadPDF} disabled={downloading} style={{ flexShrink: 0 }}>
          <Download size={13} style={{ marginRight: 5 }} />
          {downloading ? "Exporting…" : "DOL/WTR PDF"}
        </Button>
      </div>

      {loading ? <div className="muted">Loading…</div> : logs.length > 0 ? (
        <>
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
              <thead>
                <tr style={{ borderBottom: "2px solid var(--stroke)", fontSize: 10, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.05em" }}>
                  <th style={{ padding: "5px 8px", textAlign: "left" }}>Timestamp</th>
                  <th style={{ padding: "5px 8px", textAlign: "left" }}>Employee</th>
                  <th style={{ padding: "5px 8px", textAlign: "left" }}>Action</th>
                  <th style={{ padding: "5px 8px", textAlign: "left" }}>Field</th>
                  <th style={{ padding: "5px 8px", textAlign: "left" }}>Before</th>
                  <th style={{ padding: "5px 8px", textAlign: "left" }}>After</th>
                  <th style={{ padding: "5px 8px", textAlign: "left" }}>By / Reason</th>
                </tr>
              </thead>
              <tbody>
                {paged.map(entry => (
                  <tr key={entry.id} style={{ borderBottom: "1px solid var(--stroke2)" }}>
                    <td style={{ padding: "6px 8px", color: "var(--muted)", whiteSpace: "nowrap", fontFamily: "monospace", fontSize: 11 }}>
                      {entry.timestamp?.slice(0, 19).replace("T", " ")}
                    </td>
                    <td style={{ padding: "6px 8px", fontWeight: 600, fontSize: 12 }}>{entry.employee_id || "—"}</td>
                    <td style={{ padding: "6px 8px" }}>
                      <span style={{ fontSize: 10, fontWeight: 800, color: ACTION_COLOR[entry.action] || "var(--muted)", background: "var(--surface)", padding: "2px 6px", borderRadius: 4 }}>
                        {entry.action}
                      </span>
                    </td>
                    <td style={{ padding: "6px 8px", color: "var(--muted)", fontSize: 11 }}>{entry.field_changed || "—"}</td>
                    <td style={{ padding: "6px 8px", color: "var(--muted)", fontSize: 11, maxWidth: 120, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {JSON.stringify(entry.before_state)?.slice(0, 50) || "—"}
                    </td>
                    <td style={{ padding: "6px 8px", color: "var(--muted)", fontSize: 11, maxWidth: 120, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {JSON.stringify(entry.after_state)?.slice(0, 50) || "—"}
                    </td>
                    <td style={{ padding: "6px 8px", fontSize: 11 }}>
                      <div>{entry.changed_by_name || "—"}</div>
                      {entry.reason && <div style={{ color: "var(--muted)" }}>{entry.reason.slice(0, 40)}</div>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {totalPages > 1 && (
            <div style={{ display: "flex", gap: 8, marginTop: 10, alignItems: "center" }}>
              <Button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}>←</Button>
              <span style={{ fontSize: 12, color: "var(--muted)" }}>Page {page} / {totalPages}</span>
              <Button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages}>→</Button>
            </div>
          )}
        </>
      ) : (
        <div className="muted">No audit entries yet. Edits to time logs will appear here.</div>
      )}
    </Card>
  )
}

// ---------------------------------------------------------------------------
// RTI FPS Export Panel
// ---------------------------------------------------------------------------
function RTIFPSPanel() {
  const [start, setStart] = useState(() => {
    const d = new Date(); d.setDate(1); return d.toISOString().slice(0, 10)
  })
  const [end, setEnd] = useState(() => new Date().toISOString().slice(0, 10))
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(false)

  async function generate() {
    setLoading(true)
    try {
      const res = await apiRequest(`/compliance/rti-fps/?start=${start}&end=${end}`)
      setData(res.data || res)
    } catch {
      setData(null)
    } finally {
      setLoading(false)
    }
  }

  function downloadJSON() {
    if (!data) return
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url; a.download = `rti_fps_${start}_${end}.json`; a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <Card title="">
      <SectionHeader
        icon={<BadgeCheck size={18} color="#6366f1" />}
        title="UK RTI Full Payment Submission (HMRC)"
        sub="FPS data for payroll period — ready for HMRC RTI gateway"
      />
      <div style={{ display: "flex", gap: 10, alignItems: "flex-end", marginBottom: 14 }}>
        <div className="field" style={{ marginBottom: 0 }}>
          <label className="label">Period Start</label>
          <input className="qt-input" type="date" value={start} onChange={e => setStart(e.target.value)} />
        </div>
        <div className="field" style={{ marginBottom: 0 }}>
          <label className="label">Period End</label>
          <input className="qt-input" type="date" value={end} onChange={e => setEnd(e.target.value)} />
        </div>
        <Button onClick={generate} disabled={loading}>
          {loading ? "Building…" : "Generate FPS"}
        </Button>
        {data && (
          <Button onClick={downloadJSON} style={{ background: "#6366f1", color: "#fff" }}>
            <Download size={13} style={{ marginRight: 5 }} /> Download JSON
          </Button>
        )}
      </div>

      {data && (
        <div>
          <div style={{ display: "flex", gap: 14, marginBottom: 12, flexWrap: "wrap" }}>
            {[
              { label: "Tax Year", value: data.submission?.tax_year },
              { label: "Employees", value: data.totals?.total_employees },
              { label: "Total Gross", value: `£${data.totals?.total_gross_pay?.toFixed(2)}` },
              { label: "Total Tax", value: `£${data.totals?.total_income_tax?.toFixed(2)}` },
              { label: "Emp NI", value: `£${data.totals?.total_employee_ni?.toFixed(2)}` },
              { label: "Employer NI", value: `£${data.totals?.total_employer_ni?.toFixed(2)}` },
            ].map(s => (
              <div key={s.label} style={{ background: "var(--surface)", borderRadius: 8, padding: "8px 14px", minWidth: 90, textAlign: "center" }}>
                <div style={{ fontWeight: 800, fontSize: 15, color: "#6366f1" }}>{s.value}</div>
                <div style={{ fontSize: 10, color: "var(--muted)", marginTop: 2 }}>{s.label}</div>
              </div>
            ))}
          </div>
          <div style={{ fontSize: 11, color: "var(--muted)", borderTop: "1px solid var(--stroke)", paddingTop: 8 }}>
            FPS schema: {data.fps_schema_version} &nbsp;|&nbsp;
            Submission type: {data.submission?.type} &nbsp;|&nbsp;
            Generated: {data.submission?.submission_timestamp?.slice(0, 19).replace("T", " ")} UTC
          </div>
        </div>
      )}
    </Card>
  )
}

// ---------------------------------------------------------------------------
// Main CompliancePage
// ---------------------------------------------------------------------------
const TABS = [
  { id: "overview", label: "Overview" },
  { id: "rtw", label: "Right to Work" },
  { id: "holiday", label: "Holiday Accrual" },
  { id: "audit", label: "Audit Trail" },
  { id: "rti", label: "RTI / FPS" },
]

export function CompliancePage() {
  const { user } = useAuth()
  const [tab, setTab] = useState("overview")

  if (user?.role !== "admin") {
    return (
      <div className="stackLg">
        <div style={{ padding: 40, textAlign: "center", color: "var(--muted)" }}>
          <ShieldAlert size={40} style={{ marginBottom: 12, color: "#E94560" }} />
          <div style={{ fontWeight: 700, fontSize: 16 }}>Admin Access Required</div>
          <div style={{ fontSize: 13, marginTop: 4 }}>Compliance tools are only available to administrators.</div>
        </div>
      </div>
    )
  }

  return (
    <div className="stackLg" style={{ animation: "fadeUp 0.4s ease both" }}>
      <div className="pageHeader">
        <div>
          <h1 className="pageTitle" style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <ShieldAlert size={22} color="#E94560" /> Compliance Centre
          </h1>
          <div className="pageSub">US FLSA · UK WTR · PAYE/NI · Right to Work · Audit Trail</div>
        </div>
      </div>

      {/* Tab bar */}
      <div style={{ display: "flex", gap: 4, borderBottom: "2px solid var(--stroke)", paddingBottom: 0 }}>
        {TABS.map(t => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            style={{
              padding: "8px 18px",
              border: "none",
              background: "none",
              cursor: "pointer",
              fontWeight: tab === t.id ? 700 : 400,
              color: tab === t.id ? "#5d5fef" : "var(--muted)",
              borderBottom: tab === t.id ? "2px solid #5d5fef" : "2px solid transparent",
              marginBottom: -2,
              fontSize: 13,
              transition: "all 0.15s",
            }}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Overview tab */}
      {tab === "overview" && (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20 }}>
          <OTRiskPanel />
          <UK48HrPanel />
          <WageFloorPanel />
          <BreakCompliancePanel />
        </div>
      )}

      {/* RTW tab */}
      {tab === "rtw" && (
        <div style={{ display: "grid", gap: 20 }}>
          <RTWPanel />
          <WTROptOutPanel />
        </div>
      )}

      {/* Holiday tab */}
      {tab === "holiday" && <HolidayAccrualPanel />}

      {/* Audit tab */}
      {tab === "audit" && <AuditTrailPanel />}

      {/* RTI tab */}
      {tab === "rti" && <RTIFPSPanel />}
    </div>
  )
}
