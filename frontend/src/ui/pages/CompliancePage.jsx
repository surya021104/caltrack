import { useEffect, useState, useCallback, useRef } from "react"
import { apiRequest, unwrapResults } from "../../api/client.js"
import { useAuth } from "../../state/auth/useAuth.js"
import { useRole } from "../../state/auth/useRole.js"
import { Button, Card, Pill } from "../components/kit.jsx"
import {
  ShieldAlert, ShieldCheck, ShieldOff, AlertTriangle, Download,
  FileText, Users, Clock, CalendarDays, CheckCircle, XCircle,
  RefreshCw, BadgeAlert, BadgeCheck, FileClock, Send, ScrollText,
} from "lucide-react"

// ---------------------------------------------------------------------------
// Section header
// ---------------------------------------------------------------------------
function SectionHeader({ icon, title, sub }) {
  return (
    <div className="flex items-center gap-3 mb-6">
      <div className="w-10 h-10 rounded-xl bg-surface2 dark:bg-slate-950/40 flex items-center justify-center border border-stroke dark:border-slate-800 shadow-sm">
        {icon}
      </div>
      <div>
        <div className="professional-title text-base text-slate-900 dark:text-white leading-tight">{title}</div>
        {sub && <div className="professional-subtitle text-[10px] text-slate-400 dark:text-slate-500 mt-1 uppercase tracking-widest">{sub}</div>}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Stat 3D Card
// ---------------------------------------------------------------------------
function Stat3DCard({ label, value, colorClass }) {
  const cardRef = useRef(null)
  const [rotation, setRotation] = useState({ x: 0, y: 0 })
  const [isHovered, setIsHovered] = useState(false)

  const handleMouseMove = (e) => {
    if (!cardRef.current) return
    const rect = cardRef.current.getBoundingClientRect()
    const x = e.clientX - rect.left
    const y = e.clientY - rect.top
    const centerX = rect.width / 2
    const centerY = rect.height / 2
    const rotateX = ((y - centerY) / centerY) * -15
    const rotateY = ((x - centerX) / centerX) * 15
    setRotation({ x: rotateX, y: rotateY })
  }

  return (
    <div
      ref={cardRef}
      onMouseMove={handleMouseMove}
      onMouseLeave={() => { setIsHovered(false); setRotation({ x: 0, y: 0 }) }}
      onMouseEnter={() => setIsHovered(true)}
      style={{ perspective: "1000px" }}
      className="relative group cursor-default flex-1 min-w-[140px] max-w-[200px]"
    >
      <div
        className="relative h-[110px] rounded-2xl p-4 bg-surface dark:bg-slate-900/80 border border-stroke dark:border-slate-800 shadow-lg overflow-hidden transition-all duration-200 ease-out"
        style={{
          transform: `rotateX(${rotation.x}deg) rotateY(${rotation.y}deg)`,
          transformStyle: "preserve-3d",
          boxShadow: isHovered ? "0 25px 50px -12px rgba(0,0,0,0.25)" : "0 10px 20px -10px rgba(0,0,0,0.1)"
        }}
      >
        <div 
          className="absolute inset-0 bg-gradient-to-tr from-white/0 via-white/5 dark:via-white/2 to-white/0 opacity-0 transition-opacity duration-300 pointer-events-none"
          style={{ opacity: isHovered ? 1 : 0 }}
        />
        <div className={`absolute -bottom-6 -right-6 w-24 h-24 rounded-full bg-gradient-to-br ${colorClass} opacity-10 dark:opacity-20 blur-2xl group-hover:opacity-30 transition-opacity duration-500`} />
        <div className="flex flex-col items-center justify-center h-full relative z-10" style={{ transform: "translateZ(30px)" }}>
          <div className={`text-4xl professional-title drop-shadow-sm mb-1 bg-clip-text text-transparent bg-gradient-to-br ${colorClass}`}>
            {value}
          </div>
          <div className="text-[10px] professional-subtitle text-slate-400 dark:text-slate-500 text-center leading-tight mt-2 uppercase tracking-widest">
            {label}
          </div>
        </div>
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
          <div className="flex gap-4 mb-6 flex-wrap">
            {[
              { label: "Approaching OT", value: summary.approaching_ot ?? 0, color: "from-amber-400 to-orange-500" },
              { label: "In Overtime", value: summary.in_ot ?? 0, color: "from-red-500 to-rose-600" },
              { label: "CA Daily OT", value: summary.daily_ot ?? 0, color: "from-orange-500 to-red-600" },
              { label: "Double Time", value: summary.double_time ?? 0, color: "from-rose-600 to-pink-700" },
            ].map(s => (
              <Stat3DCard key={s.label} label={s.label} value={s.value} colorClass={s.color} />
            ))}
          </div>

          {alerts.length > 0 ? (
            <div className="flex flex-wrap gap-2">
              {alerts.map((a, i) => (
                <div key={i} className={`rounded-xl px-4 py-2 text-xs font-bold border transition-all ${
                  a.alert_type?.includes("double") 
                    ? "bg-red-50 dark:bg-red-900/10 border-red-200 dark:border-red-800 text-red-600 dark:text-red-400" 
                    : a.alert_type?.includes("approaching") 
                      ? "bg-amber-50 dark:bg-amber-900/10 border-amber-200 dark:border-amber-800 text-amber-600 dark:text-amber-400" 
                      : "bg-indigo-50 dark:bg-indigo-900/10 border-indigo-200 dark:border-indigo-800 text-indigo-600 dark:text-indigo-400"
                }`}>
                  <span className="font-black uppercase tracking-tight">
                    {a.employee_name || a.employee_id}
                  </span>
                  <span className="opacity-60 ml-2 font-medium">
                    {a.hours_worked?.toFixed(1)}h — {a.alert_type?.replace(/_/g, " ")}
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <div className="flex items-center gap-2 text-emerald-600 dark:text-emerald-400 text-sm font-black uppercase tracking-widest bg-emerald-50 dark:bg-emerald-950/20 px-4 py-3 rounded-xl border border-emerald-100 dark:border-emerald-900/30">
              <CheckCircle size={16} /> No overtime risk this week
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
          <div className="flex gap-4 mb-6">
            <Stat3DCard label="Compliant" value={compliant} colorClass="from-emerald-400 to-teal-500" />
            <Stat3DCard label="Breaching" value={breaching} colorClass="from-red-500 to-rose-600" />
          </div>
          {employees.length > 0 ? (
            <div className="overflow-x-auto rounded-xl border border-stroke dark:border-slate-800 bg-bg dark:bg-slate-950/40">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-bg2 dark:bg-slate-900/50 border-b border-stroke dark:border-slate-800 text-[10px] font-black text-slate-500 dark:text-slate-500 uppercase tracking-widest">
                    <th className="px-6 py-4">Employee</th>
                    <th className="px-6 py-4 text-right">Avg hrs/wk</th>
                    <th className="px-6 py-4 text-right">Headroom</th>
                    <th className="px-6 py-4 text-center">Opt-out</th>
                    <th className="px-6 py-4 text-center">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-stroke dark:divide-slate-800">
                  {employees.map((e, i) => (
                    <tr key={i} className="hover:bg-surface dark:hover:bg-slate-800/50 transition-colors">
                      <td className="px-6 py-4 font-bold text-slate-900 dark:text-white">{e.employee_name || e.employee_id}</td>
                      <td className={`px-6 py-4 text-right font-black ${!e.is_compliant ? "text-red-600 dark:text-red-400" : "text-slate-900 dark:text-white"}`}>
                        {e.average_hours?.toFixed(1)}h
                      </td>
                      <td className="px-6 py-4 text-right text-slate-400 dark:text-slate-500 font-medium">
                        {e.headroom_hours >= 0 ? `${e.headroom_hours?.toFixed(1)}h` : "—"}
                      </td>
                      <td className="px-6 py-4 text-center">
                        {e.has_opt_out ? <Pill tone="good">Yes</Pill> : <span className="text-[10px] font-bold text-slate-300 dark:text-slate-700">No</span>}
                      </td>
                      <td className="px-6 py-4 text-center">
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
      const expiringDocs = [
        ...(expiryRes.data?.expiring_within_60_days || []),
        ...(expiryRes.data?.expired || []),
      ]
      setExpiring(expiringDocs)
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
        <div className={`mb-4 px-4 py-3 rounded-xl border flex items-center gap-2 text-sm font-bold transition-all ${
          alertResult.ok 
            ? "bg-emerald-50 dark:bg-emerald-950/20 border-emerald-200 dark:border-emerald-800 text-emerald-600 dark:text-emerald-400" 
            : "bg-rose-50 dark:bg-rose-950/20 border-rose-200 dark:border-rose-800 text-rose-600 dark:text-rose-400"
        }`}>
          {alertResult.ok ? <CheckCircle size={16} /> : <XCircle size={16} />}
          {alertResult.ok ? `${alertResult.count} RTW alert email(s) sent.` : "Failed to send alerts."}
        </div>
      )}

      {expiring.length > 0 && (
        <div className="mb-4 flex flex-wrap gap-2">
          {expiring.map((e, i) => (
            <div key={i} className="bg-amber-50 dark:bg-amber-900/10 border border-amber-200 dark:border-amber-800 rounded-xl px-3 py-1.5 text-xs font-bold text-amber-600 dark:text-amber-400 flex items-center gap-2">
              <span className="animate-pulse">⚠</span>
              <span>{e.employee_name}</span>
              <span className="opacity-60 font-medium font-[Manrope]">expires in {e.days_until_expiry}d</span>
            </div>
          ))}
        </div>
      )}

      {loading ? <div className="text-slate-400 animate-pulse font-bold tracking-widest text-[10px] uppercase">Loading RTW Records…</div> : docs.length > 0 ? (
        <div className="overflow-x-auto rounded-xl border border-stroke dark:border-slate-800 bg-bg dark:bg-slate-950/40">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-bg2 dark:bg-slate-900/50 border-b border-stroke dark:border-slate-800 text-[10px] font-black text-slate-500 dark:text-slate-500 uppercase tracking-widest">
                <th className="px-6 py-4">Employee</th>
                <th className="px-6 py-4">Document</th>
                <th className="px-6 py-4">Reference</th>
                <th className="px-6 py-4">Expiry</th>
                <th className="px-6 py-4 text-center">Status</th>
                <th className="px-6 py-4 text-center">Verified by</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-stroke dark:divide-slate-800">
              {docs.map(d => (
                <tr key={d.id} className="hover:bg-surface dark:hover:bg-slate-800/50 transition-colors">
                  <td className="px-6 py-4 font-bold text-slate-900 dark:text-white">{d.employee_name || d.employee}</td>
                  <td className="px-6 py-4 text-slate-600 dark:text-slate-400 font-medium">{d.document_type_display || d.document_type}</td>
                  <td className="px-6 py-4 text-slate-400 dark:text-slate-500 font-mono text-[11px] tracking-tighter">{d.document_reference || "—"}</td>
                  <td className="px-6 py-4">
                    {d.expiry_date ? (
                      <div className="flex flex-col">
                        <span className={`font-bold ${d.days_until_expiry != null && d.days_until_expiry < 30 ? "text-red-600 dark:text-red-400" : "text-slate-900 dark:text-white"}`}>
                          {d.expiry_date}
                        </span>
                        {d.days_until_expiry != null && d.days_until_expiry < 60 && (
                          <span className="text-[10px] font-black text-amber-600 dark:text-amber-500 uppercase tracking-widest mt-0.5">Expires in {d.days_until_expiry}d</span>
                        )}
                      </div>
                    ) : <span className="text-slate-300 dark:text-slate-700">—</span>}
                  </td>
                  <td className="px-6 py-4 text-center">
                    <span className={`text-[10px] font-black uppercase tracking-widest px-2 py-1 rounded-md border ${
                      d.status === 'verified' ? 'bg-emerald-50 dark:bg-emerald-950/20 border-emerald-200 dark:border-emerald-800 text-emerald-600 dark:text-emerald-400' :
                      d.status === 'expired' || d.status === 'rejected' ? 'bg-red-50 dark:bg-red-950/20 border-red-200 dark:border-red-800 text-red-600 dark:text-red-400' :
                      'bg-amber-50 dark:bg-amber-950/20 border-amber-200 dark:border-amber-800 text-amber-600 dark:text-amber-400'
                    }`}>
                      {d.status}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-center text-[11px] font-bold text-slate-400 dark:text-slate-600">
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
      <div className="flex gap-4 mb-6">
        <Stat3DCard label="Active Opt-outs" value={active} colorClass="from-blue-500 to-indigo-600" />
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
      <div className="flex gap-4 mb-6">
        <Stat3DCard label="Violations" value={violations.length} colorClass={violations.length > 0 ? "from-red-500 to-rose-600" : "from-emerald-400 to-teal-500"} />
        <Stat3DCard label="Employees Checked" value={total} colorClass="from-slate-400 to-slate-500" />
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
                <tr key={i} style={{ borderBottom: "1px solid var(--stroke2)", background: "rgba(220,38,38,0.05)" }}>
                  <td style={{ padding: "8px 10px", fontWeight: 600, color: "var(--fg)" }}>{v.employee_name || v.employee_id}</td>
                  <td style={{ padding: "8px 10px", color: "var(--muted)" }}>{v.country}{v.state ? ` (${v.state})` : ""}</td>
                  <td style={{ padding: "8px 10px", textAlign: "right", color: "var(--fg)" }}>{v.currency}{v.employee_rate?.toFixed(2)}</td>
                  <td style={{ padding: "8px 10px", textAlign: "right", color: "var(--fg)" }}>{v.currency}{v.minimum_wage_floor?.toFixed(2)}</td>
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
          <div className="flex gap-4 mb-8">
            <Stat3DCard label="Break Violations" value={breakViolations.length} colorClass={breakViolations.length ? "from-red-500 to-rose-600" : "from-emerald-400 to-teal-500"} />
            <Stat3DCard label="Rest Violations (11hr)" value={restViolations.length} colorClass={restViolations.length ? "from-red-500 to-rose-600" : "from-emerald-400 to-teal-500"} />
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
      const base = apiBase || ""
      const res = await fetch(`${base}/api/compliance/audit-log/export/`, {
        credentials: "include",   // httpOnly cookie sent automatically
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
          <div className="flex gap-4 mb-6 flex-wrap">
            {[
              { label: "Tax Year", value: data.submission?.tax_year, color: "from-slate-400 to-slate-500" },
              { label: "Employees", value: data.totals?.total_employees, color: "from-blue-400 to-indigo-500" },
              { label: "Total Gross", value: `£${data.totals?.total_gross_pay?.toFixed(2)}`, color: "from-emerald-400 to-teal-500" },
              { label: "Total Tax", value: `£${data.totals?.total_income_tax?.toFixed(2)}`, color: "from-rose-400 to-red-500" },
              { label: "Emp NI", value: `£${data.totals?.total_employee_ni?.toFixed(2)}`, color: "from-purple-400 to-fuchsia-500" },
              { label: "Employer NI", value: `£${data.totals?.total_employer_ni?.toFixed(2)}`, color: "from-amber-400 to-orange-500" },
            ].map(s => (
              <Stat3DCard key={s.label} label={s.label} value={s.value} colorClass={s.color} />
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
  const { isAdmin } = useRole()
  const [tab, setTab] = useState("overview")

  if (!isAdmin) {
    return (
      <div className="flex flex-col h-[calc(100vh-var(--header-height,64px))] w-full bg-slate-50 overflow-hidden">
      <div className="h-24 bg-surface dark:bg-slate-900/60 border-b border-stroke dark:border-slate-800 px-10 flex items-center justify-between shrink-0 relative overflow-hidden">
          <div className="flex items-center gap-6">
            <div>
              <h1 className="text-2xl font-black text-slate-900 tracking-tight font-[Manrope] flex items-center gap-3">
                <ShieldAlert className="text-indigo-600" size={24} />
                Compliance Centre
              </h1>
              <div className="flex items-center gap-3 mt-2">
                <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest">
                  Admin Access Required
                </span>
              </div>
            </div>
          </div>
        </div>
        <div className="flex-1 overflow-y-auto p-10 space-y-10">
          <Card>
            <div className="text-[var(--muted)] italic">Compliance tools are only available to administrators.</div>
          </Card>
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col h-[calc(100vh-var(--header-height,64px))] w-full bg-[var(--bg)] overflow-hidden">
      {/* ── HEADER ── */}
      <div className="h-24 bg-[var(--surface)] border-b border-[var(--stroke)] px-10 flex items-center justify-between shrink-0 relative overflow-hidden">
        <div className="flex items-center gap-6">
          <div>
            <h1 className="text-2xl professional-title text-[var(--fg)] flex items-center gap-3">
              <ShieldAlert className="text-indigo-600" size={24} />
              Compliance Centre
            </h1>
            <div className="flex items-center gap-3 mt-2">
              <span className="text-[10px] professional-subtitle text-[var(--muted)]">
                US FLSA · UK WTR · PAYE/NI · Right to Work · Audit Trail
              </span>
            </div>
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-10 space-y-10" style={{ animation: "fadeUp 0.4s ease both" }}>

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
    </div>
  )
}
