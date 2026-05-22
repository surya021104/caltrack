import { useEffect, useMemo, useState } from "react"
import { apiRequest, unwrapResults } from "../../api/client.js"
import { useRole } from "../../state/auth/useRole.js"
import { Banknote, X, ChevronDown, ChevronUp, AlertTriangle, CheckCircle2, Clock, Users, TrendingUp, DollarSign, Loader2, FileText } from "lucide-react"

const fmt = (n, curr = "$") => `${curr}${Number(n || 0).toFixed(2)}`
const fmtH = (n) => `${Number(n || 0).toFixed(2)}h`
const fmtId = (v) => { if (!v) return "—"; const m = /^EMP(\d+)$/i.exec(String(v).replace(/\s+/g, "")); return m ? `EMP ${m[1].padStart(3,"0")}` : v }

function KpiCard({ icon, label, value, sub, color }) {
  return (
    <div style={{ background:"#fff", border:"1.5px solid #e2e8f0", borderRadius:20, padding:"22px 24px", display:"flex", alignItems:"center", gap:16, boxShadow:"0 2px 12px rgba(0,0,0,0.04)" }}>
      <div style={{ width:48, height:48, borderRadius:14, background:`${color}18`, border:`1.5px solid ${color}30`, display:"flex", alignItems:"center", justifyContent:"center", color, flexShrink:0 }}>{icon}</div>
      <div>
        <div style={{ fontSize:10, fontWeight:800, color:"#94a3b8", textTransform:"uppercase", letterSpacing:"0.08em", marginBottom:4 }}>{label}</div>
        <div style={{ fontSize:22, fontWeight:900, color:"#0f172a", lineHeight:1 }}>{value}</div>
        {sub && <div style={{ fontSize:11, color:"#94a3b8", fontWeight:600, marginTop:4 }}>{sub}</div>}
      </div>
    </div>
  )
}

function PayslipModal({ record, onClose }) {
  if (!record) return null
  const isUK = record.region?.includes("UK")
  const curr = isUK ? "£" : "$"
  const gross = Number(record.gross_pay || 0)
  const net = Number(record.net_pay || 0)
  const tax = Number(record.uk_income_tax || 0)
  const empNI = Number(record.uk_employee_ni || 0)
  const emplNI = Number(record.uk_employer_ni || 0)
  const deductions = tax + empNI

  return (
    <div style={{ position:"fixed", inset:0, background:"rgba(15,23,42,0.6)", backdropFilter:"blur(6px)", zIndex:9999, display:"flex", alignItems:"center", justifyContent:"center", padding:24 }}>
      <div style={{ background:"#fff", borderRadius:24, width:"100%", maxWidth:560, maxHeight:"90vh", overflow:"auto", boxShadow:"0 32px 80px rgba(0,0,0,0.2)" }}>
        {/* Header */}
        <div style={{ background:"linear-gradient(135deg,#4f46e5,#7c3aed)", padding:"28px 32px", borderRadius:"24px 24px 0 0", position:"relative" }}>
          <button onClick={onClose} style={{ position:"absolute", top:16, right:16, background:"rgba(255,255,255,0.15)", border:"none", borderRadius:8, padding:6, cursor:"pointer", color:"#fff", display:"flex" }}><X size={16}/></button>
          <div style={{ display:"flex", alignItems:"center", gap:12, marginBottom:12 }}>
            <div style={{ width:44, height:44, borderRadius:12, background:"rgba(255,255,255,0.15)", display:"flex", alignItems:"center", justifyContent:"center" }}><FileText size={20} color="#fff"/></div>
            <div>
              <div style={{ fontSize:11, fontWeight:800, color:"rgba(255,255,255,0.6)", letterSpacing:"0.12em", textTransform:"uppercase" }}>Payslip</div>
              <div style={{ fontSize:18, fontWeight:900, color:"#fff" }}>{fmtId(record.employee)} · {record.employee_name}</div>
            </div>
          </div>
          <div style={{ display:"flex", gap:16 }}>
            <div style={{ background:"rgba(255,255,255,0.12)", borderRadius:10, padding:"8px 14px" }}>
              <div style={{ fontSize:10, color:"rgba(255,255,255,0.6)", fontWeight:700, textTransform:"uppercase" }}>Period</div>
              <div style={{ fontSize:12, fontWeight:800, color:"#fff", marginTop:2 }}>{record.period?.start_date} → {record.period?.end_date}</div>
            </div>
            <div style={{ background:"rgba(255,255,255,0.12)", borderRadius:10, padding:"8px 14px" }}>
              <div style={{ fontSize:10, color:"rgba(255,255,255,0.6)", fontWeight:700, textTransform:"uppercase" }}>Region</div>
              <div style={{ fontSize:12, fontWeight:800, color:"#fff", marginTop:2 }}>{record.region || "—"}</div>
            </div>
            <div style={{ background:"rgba(255,255,255,0.12)", borderRadius:10, padding:"8px 14px" }}>
              <div style={{ fontSize:10, color:"rgba(255,255,255,0.6)", fontWeight:700, textTransform:"uppercase" }}>Rate</div>
              <div style={{ fontSize:12, fontWeight:800, color:"#fff", marginTop:2 }}>{fmt(record.hourly_rate, curr)}/hr</div>
            </div>
          </div>
        </div>
        {/* Body */}
        <div style={{ padding:"28px 32px" }}>
          {/* Hours breakdown */}
          <div style={{ marginBottom:24 }}>
            <div style={{ fontSize:10, fontWeight:800, color:"#94a3b8", textTransform:"uppercase", letterSpacing:"0.1em", marginBottom:12 }}>Hours Breakdown</div>
            <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:10 }}>
              {[
                { label:"Regular Hours", val:fmtH(record.regular_hours), color:"#4f46e5" },
                { label:"Overtime (1.5×)", val:fmtH(record.overtime_hours), color: Number(record.overtime_hours)>0?"#d97706":"#cbd5e1" },
                { label:"Daily OT", val:fmtH(record.daily_ot_hours), color: Number(record.daily_ot_hours)>0?"#ea580c":"#cbd5e1" },
                { label:"Double Time (2×)", val:fmtH(record.double_time_hours), color: Number(record.double_time_hours)>0?"#dc2626":"#cbd5e1" },
                { label:"Paid Leave", val:fmtH(record.paid_leave_hours), color:"#059669" },
                { label:"Unpaid Leave", val:fmtH(record.unpaid_leave_hours), color:"#94a3b8" },
              ].map(({ label, val, color }) => (
                <div key={label} style={{ display:"flex", justifyContent:"space-between", padding:"10px 14px", background:"#f8fafc", borderRadius:10, border:"1.5px solid #e2e8f0" }}>
                  <span style={{ fontSize:12, fontWeight:700, color:"#475569" }}>{label}</span>
                  <span style={{ fontSize:12, fontWeight:900, color }}>{val}</span>
                </div>
              ))}
            </div>
          </div>
          {/* Pay summary */}
          <div style={{ marginBottom:20 }}>
            <div style={{ fontSize:10, fontWeight:800, color:"#94a3b8", textTransform:"uppercase", letterSpacing:"0.1em", marginBottom:12 }}>Pay Summary</div>
            <div style={{ border:"1.5px solid #e2e8f0", borderRadius:14, overflow:"hidden" }}>
              {[
                { label:"Gross Pay", val:fmt(gross,curr), bold:true },
                isUK && tax > 0 && { label:"Income Tax (PAYE)", val:`− ${fmt(tax,curr)}`, neg:true },
                isUK && empNI > 0 && { label:"Employee NI", val:`− ${fmt(empNI,curr)}`, neg:true },
                isUK && emplNI > 0 && { label:"Employer NI (info)", val:fmt(emplNI,curr) },
                record.holiday_hours_accrued > 0 && { label:"Holiday Accrued", val:fmtH(record.holiday_hours_accrued) },
              ].filter(Boolean).map(({ label, val, bold, neg }, i) => (
                <div key={label} style={{ display:"flex", justifyContent:"space-between", padding:"12px 16px", borderBottom:"1px solid #f1f5f9", background: bold?"#f8fafc":"#fff" }}>
                  <span style={{ fontSize:13, fontWeight: bold?800:600, color:"#475569" }}>{label}</span>
                  <span style={{ fontSize:13, fontWeight:900, color: neg?"#dc2626": bold?"#0f172a":"#475569" }}>{val}</span>
                </div>
              ))}
              <div style={{ display:"flex", justifyContent:"space-between", padding:"16px", background:"linear-gradient(135deg,#4f46e5,#7c3aed)" }}>
                <span style={{ fontSize:14, fontWeight:900, color:"#fff" }}>Net Pay</span>
                <span style={{ fontSize:20, fontWeight:900, color:"#fff" }}>{fmt(net,curr)}</span>
              </div>
            </div>
          </div>
          {/* Flags */}
          <div style={{ display:"flex", gap:8, flexWrap:"wrap" }}>
            {record.is_exempt && <span style={{ fontSize:10, fontWeight:800, background:"#ecfdf5", color:"#059669", border:"1px solid #a7f3d0", padding:"4px 10px", borderRadius:6, textTransform:"uppercase" }}>FLSA Exempt</span>}
            {!record.wage_floor_compliant && <span style={{ fontSize:10, fontWeight:800, background:"#fef2f2", color:"#dc2626", border:"1px solid #fecaca", padding:"4px 10px", borderRadius:6, textTransform:"uppercase" }}>⚠ Below Minimum Wage</span>}
            {isUK && record.uk_tax_code && <span style={{ fontSize:10, fontWeight:800, background:"#eff6ff", color:"#2563eb", border:"1px solid #bfdbfe", padding:"4px 10px", borderRadius:6 }}>Tax Code: {record.uk_tax_code}</span>}
          </div>
        </div>
      </div>
    </div>
  )
}

export function PayrollPage() {
  const { isAdmin } = useRole()
  const [records, setRecords] = useState([])
  const [employees, setEmployees] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")
  const [submitting, setSubmitting] = useState(false)
  const [selected, setSelected] = useState(null)
  const [filterEmp, setFilterEmp] = useState("")
  const [sortField, setSortField] = useState("generated_at")
  const [sortDir, setSortDir] = useState("desc")

  // Generate form state
  const [empId, setEmpId] = useState("")
  const [start, setStart] = useState("")
  const [end, setEnd] = useState("")

  async function load() {
    setLoading(true); setError("")
    try {
      const [rRes, eRes] = await Promise.all([
        apiRequest("/payroll/records/"),
        isAdmin ? apiRequest("/employees/") : Promise.resolve({ results: [] }),
      ])
      setRecords(unwrapResults(rRes))
      setEmployees(isAdmin ? unwrapResults(eRes) : [])
    } catch (err) {
      setError(err?.body?.detail || "Failed to load payroll.")
    } finally { setLoading(false) }
  }

  useEffect(() => { load() }, [isAdmin])

  async function generate(e) {
    e.preventDefault(); setSubmitting(true); setError("")
    try {
      await apiRequest("/payroll/generate/", { method:"POST", json:{ employee:empId, start, end } })
      await load()
      setEmpId(""); setStart(""); setEnd("")
    } catch (err) {
      setError(err?.body?.detail || "Failed to generate payroll.")
    } finally { setSubmitting(false) }
  }

  const filtered = useMemo(() => {
    let list = [...records]
    if (filterEmp) list = list.filter(r => r.employee?.toLowerCase().includes(filterEmp.toLowerCase()) || r.employee_name?.toLowerCase().includes(filterEmp.toLowerCase()))
    list.sort((a, b) => {
      let av = a[sortField] ?? "", bv = b[sortField] ?? ""
      if (sortField === "gross_pay" || sortField === "net_pay") { av = Number(av); bv = Number(bv) }
      return sortDir === "asc" ? (av > bv ? 1 : -1) : (av < bv ? 1 : -1)
    })
    return list
  }, [records, filterEmp, sortField, sortDir])

  // KPI Stats
  const totalGross = records.reduce((s, r) => s + Number(r.gross_pay || 0), 0)
  const totalNet = records.reduce((s, r) => s + Number(r.net_pay || 0), 0)
  const totalRegHrs = records.reduce((s, r) => s + Number(r.regular_hours || 0), 0)
  const uniqueEmps = new Set(records.map(r => r.employee)).size
  const flagged = records.filter(r => !r.wage_floor_compliant).length

  function toggleSort(f) {
    if (sortField === f) setSortDir(d => d === "asc" ? "desc" : "asc")
    else { setSortField(f); setSortDir("desc") }
  }

  const SortIcon = ({ field }) => sortField === field
    ? (sortDir === "asc" ? <ChevronUp size={12}/> : <ChevronDown size={12}/>)
    : <ChevronDown size={12} style={{ opacity:0.3 }}/>

  const thStyle = (field) => ({
    padding:"12px 14px", fontSize:10, fontWeight:800, color:"#94a3b8",
    textTransform:"uppercase", letterSpacing:"0.08em", whiteSpace:"nowrap",
    cursor:"pointer", userSelect:"none",
    background: sortField === field ? "#f1f5f9" : "transparent",
  })

  return (
    <div style={{ display:"flex", flexDirection:"column", height:"100%", background:"#f8fafc", overflow:"auto" }}>
      {/* Header */}
      <div style={{ background:"linear-gradient(135deg,#4f46e5,#7c3aed)", padding:"32px 48px 40px", position:"relative", overflow:"hidden" }}>
        <div style={{ position:"absolute", inset:0, backgroundImage:"radial-gradient(circle at 80% 50%,rgba(255,255,255,0.06),transparent 60%)", pointerEvents:"none" }}/>
        <div style={{ position:"relative", zIndex:1 }}>
          <div style={{ display:"flex", alignItems:"center", gap:12, marginBottom:8 }}>
            <Banknote size={28} color="#fff"/>
            <h1 style={{ fontSize:26, fontWeight:900, color:"#fff", margin:0, letterSpacing:"-0.02em" }}>Payroll</h1>
          </div>
          <p style={{ color:"rgba(255,255,255,0.7)", fontSize:13, fontWeight:500, margin:0 }}>
            Transparent pay — regular, overtime, leave, and deductions all reconciled.
          </p>
        </div>
      </div>

      <div style={{ padding:"40px 48px", display:"flex", flexDirection:"column", gap:28 }}>
        {error && (
          <div style={{ background:"#fef2f2", border:"1.5px solid #fecaca", borderRadius:12, padding:"12px 16px", display:"flex", alignItems:"center", gap:10, color:"#dc2626", fontSize:13, fontWeight:700 }}>
            <AlertTriangle size={16}/> {error}
          </div>
        )}

        {/* KPI Cards */}
        <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fill,minmax(200px,1fr))", gap:16 }}>
          <KpiCard icon={<DollarSign size={20}/>} label="Total Gross" value={`$${totalGross.toFixed(2)}`} sub="All periods" color="#4f46e5"/>
          <KpiCard icon={<TrendingUp size={20}/>} label="Total Net Pay" value={`$${totalNet.toFixed(2)}`} sub="After deductions" color="#059669"/>
          <KpiCard icon={<Users size={20}/>} label="Employees Paid" value={uniqueEmps} sub={`${records.length} records total`} color="#2563eb"/>
          <KpiCard icon={<Clock size={20}/>} label="Regular Hours" value={fmtH(totalRegHrs)} sub="Across all records" color="#f59e0b"/>
          {flagged > 0 && <KpiCard icon={<AlertTriangle size={20}/>} label="Wage Violations" value={flagged} sub="Below minimum wage" color="#dc2626"/>}
        </div>

        {/* Generate Form */}
        {isAdmin && (
          <div style={{ background:"#fff", border:"1.5px solid #e2e8f0", borderRadius:20, padding:"28px 32px", boxShadow:"0 2px 12px rgba(0,0,0,0.04)" }}>
            <div style={{ fontSize:14, fontWeight:900, color:"#0f172a", marginBottom:20, display:"flex", alignItems:"center", gap:8 }}>
              <Banknote size={16} style={{ color:"#4f46e5" }}/> Generate Payroll
            </div>
            <form onSubmit={generate} style={{ display:"grid", gridTemplateColumns:"1fr 1fr 1fr auto", gap:14, alignItems:"end" }}>
              <div>
                <label style={{ fontSize:11, fontWeight:800, color:"#64748b", textTransform:"uppercase", letterSpacing:"0.08em", display:"block", marginBottom:6 }}>Employee</label>
                <select value={empId} onChange={e => setEmpId(e.target.value)} required
                  style={{ width:"100%", padding:"12px 14px", border:"1.5px solid #e2e8f0", borderRadius:12, fontSize:13, fontWeight:600, color:"#0f172a", background:"#f8fafc", outline:"none" }}>
                  <option value="">Select employee…</option>
                  {employees.map(emp => (
                    <option key={emp.id} value={emp.id}>
                      {emp.user?.first_name || emp.user?.username} ({emp.employee_id})
                    </option>
                  ))}
                </select>
              </div>
              {[["Start Date", start, setStart], ["End Date", end, setEnd]].map(([lbl, val, set]) => (
                <div key={lbl}>
                  <label style={{ fontSize:11, fontWeight:800, color:"#64748b", textTransform:"uppercase", letterSpacing:"0.08em", display:"block", marginBottom:6 }}>{lbl}</label>
                  <input type="date" value={val} onChange={e => set(e.target.value)} required
                    style={{ width:"100%", padding:"12px 14px", border:"1.5px solid #e2e8f0", borderRadius:12, fontSize:13, fontWeight:600, color:"#0f172a", background:"#f8fafc", outline:"none" }}/>
                </div>
              ))}
              <button type="submit" disabled={submitting}
                style={{ padding:"12px 24px", background:"linear-gradient(135deg,#4f46e5,#7c3aed)", color:"#fff", border:"none", borderRadius:12, fontSize:13, fontWeight:800, cursor:"pointer", display:"flex", alignItems:"center", gap:8, opacity:submitting?0.7:1 }}>
                {submitting ? <><Loader2 size={14} style={{ animation:"spin 0.7s linear infinite" }}/> Generating…</> : "Generate"}
              </button>
            </form>
          </div>
        )}

        {/* Records Table */}
        <div style={{ background:"#fff", border:"1.5px solid #e2e8f0", borderRadius:20, boxShadow:"0 2px 12px rgba(0,0,0,0.04)", overflow:"hidden" }}>
          <div style={{ padding:"20px 24px", borderBottom:"1px solid #f1f5f9", display:"flex", alignItems:"center", justifyContent:"space-between", gap:16 }}>
            <div style={{ fontSize:14, fontWeight:900, color:"#0f172a", display:"flex", alignItems:"center", gap:8 }}>
              <FileText size={16} style={{ color:"#4f46e5" }}/> Payroll Records
              <span style={{ fontSize:11, background:"#ede9fe", color:"#7c3aed", fontWeight:800, padding:"2px 8px", borderRadius:6 }}>{filtered.length}</span>
            </div>
            <input placeholder="Search employee…" value={filterEmp} onChange={e => setFilterEmp(e.target.value)}
              style={{ padding:"8px 14px", border:"1.5px solid #e2e8f0", borderRadius:10, fontSize:13, color:"#0f172a", outline:"none", width:220 }}/>
          </div>

          {loading ? (
            <div style={{ padding:48, textAlign:"center", color:"#94a3b8", display:"flex", alignItems:"center", justifyContent:"center", gap:10 }}>
              <Loader2 size={20} style={{ animation:"spin 0.7s linear infinite" }}/> Loading records…
            </div>
          ) : filtered.length === 0 ? (
            <div style={{ padding:48, textAlign:"center", color:"#94a3b8", fontSize:13, fontWeight:600 }}>
              No payroll records found. Generate one above.
            </div>
          ) : (
            <div style={{ overflowX:"auto" }}>
              <table style={{ width:"100%", borderCollapse:"collapse" }}>
                <thead>
                  <tr style={{ borderBottom:"1.5px solid #f1f5f9" }}>
                    {[
                      ["Employee","employee"], ["Period","period"], ["Region","region"],
                      ["Rate/hr","hourly_rate"], ["Gross","gross_pay"], ["Net Pay","net_pay"],
                      ["Reg Hrs","regular_hours"], ["OT Hrs","overtime_hours"],
                      ["Daily OT","daily_ot_hours"], ["2× Time","double_time_hours"],
                      ["Tax","uk_income_tax"], ["Emp NI","uk_employee_ni"], ["Holiday","holiday_hours_accrued"],
                      ["Status","wage_floor_compliant"],
                    ].map(([lbl, field]) => (
                      <th key={field} style={thStyle(field)} onClick={() => toggleSort(field)}>
                        <span style={{ display:"inline-flex", alignItems:"center", gap:4 }}>{lbl} <SortIcon field={field}/></span>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filtered.map(r => {
                    const isUK = r.region?.includes("UK")
                    const curr = isUK ? "£" : "$"
                    return (
                      <tr key={r.id} onClick={() => setSelected(r)}
                        style={{ borderBottom:"1px solid #f1f5f9", cursor:"pointer", transition:"background 0.15s" }}
                        onMouseEnter={e => e.currentTarget.style.background="#f8fafc"}
                        onMouseLeave={e => e.currentTarget.style.background="transparent"}>
                        <td style={{ padding:"14px 14px" }}>
                          <div style={{ fontSize:13, fontWeight:900, color:"#0f172a" }}>{fmtId(r.employee)}</div>
                          <div style={{ fontSize:10, fontWeight:700, color:"#94a3b8", textTransform:"uppercase", marginTop:2 }}>{r.employee_name}</div>
                        </td>
                        <td style={{ padding:"14px 14px" }}>
                          <div style={{ fontSize:11, fontWeight:700, color:"#64748b", whiteSpace:"nowrap" }}>{r.period?.start_date}</div>
                          <div style={{ fontSize:11, fontWeight:700, color:"#64748b" }}>{r.period?.end_date}</div>
                        </td>
                        <td style={{ padding:"14px 14px" }}>
                          <span style={{ fontSize:10, fontWeight:800, color:"#4f46e5", textTransform:"uppercase", letterSpacing:"0.06em" }}>{r.region || "—"}</span>
                          {r.is_exempt && <div style={{ fontSize:9, fontWeight:800, color:"#059669", textTransform:"uppercase", marginTop:2 }}>FLSA EXEMPT</div>}
                        </td>
                        <td style={{ padding:"14px 14px", textAlign:"right", fontSize:12, fontWeight:700, color:"#64748b" }}>{fmt(r.hourly_rate, curr)}</td>
                        <td style={{ padding:"14px 14px", textAlign:"right", fontSize:13, fontWeight:900, color:"#0f172a" }}>{fmt(r.gross_pay, curr)}</td>
                        <td style={{ padding:"14px 14px", textAlign:"right" }}>
                          <span style={{ fontSize:13, fontWeight:900, color:"#059669", background:"#ecfdf5", padding:"4px 10px", borderRadius:8 }}>{fmt(r.net_pay, curr)}</span>
                        </td>
                        <td style={{ padding:"14px 14px", textAlign:"right", fontSize:12, fontWeight:700, color:"#475569" }}>{fmtH(r.regular_hours)}</td>
                        <td style={{ padding:"14px 14px", textAlign:"right", fontSize:12, fontWeight:800, color: Number(r.overtime_hours)>0?"#d97706":"#cbd5e1" }}>{fmtH(r.overtime_hours)}</td>
                        <td style={{ padding:"14px 14px", textAlign:"right", fontSize:12, fontWeight:800, color: Number(r.daily_ot_hours)>0?"#ea580c":"#cbd5e1" }}>
                          {Number(r.daily_ot_hours)>0 ? fmtH(r.daily_ot_hours) : "—"}
                        </td>
                        <td style={{ padding:"14px 14px", textAlign:"right", fontSize:12, fontWeight:800, color: Number(r.double_time_hours)>0?"#dc2626":"#cbd5e1" }}>
                          {Number(r.double_time_hours)>0 ? fmtH(r.double_time_hours) : "—"}
                        </td>
                        <td style={{ padding:"14px 14px", textAlign:"right", fontSize:12, fontWeight:700, color:"#64748b" }}>
                          {isUK && Number(r.uk_income_tax)>0 ? fmt(r.uk_income_tax,"£") : "—"}
                        </td>
                        <td style={{ padding:"14px 14px", textAlign:"right", fontSize:12, fontWeight:700, color:"#64748b" }}>
                          {isUK && Number(r.uk_employee_ni)>0 ? fmt(r.uk_employee_ni,"£") : "—"}
                        </td>
                        <td style={{ padding:"14px 14px", textAlign:"right", fontSize:12, fontWeight:700, color: Number(r.holiday_hours_accrued)>0?"#059669":"#cbd5e1" }}>
                          {Number(r.holiday_hours_accrued)>0 ? fmtH(r.holiday_hours_accrued) : "—"}
                        </td>
                        <td style={{ padding:"14px 14px", textAlign:"center" }}>
                          {r.wage_floor_compliant
                            ? <CheckCircle2 size={16} style={{ color:"#059669" }}/>
                            : <span style={{ fontSize:9, fontWeight:800, background:"#fef2f2", color:"#dc2626", border:"1px solid #fecaca", padding:"3px 8px", borderRadius:5, textTransform:"uppercase" }}>MIN WAGE ⚠</span>}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {selected && <PayslipModal record={selected} onClose={() => setSelected(null)}/>}

      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  )
}
