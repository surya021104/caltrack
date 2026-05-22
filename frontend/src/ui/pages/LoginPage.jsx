import { useState } from "react"
import { useNavigate } from "react-router-dom"
import { motion, AnimatePresence } from "framer-motion"
import { useAuth } from "../../state/auth/useAuth.js"
import { extractAuthError } from "../../api/authService.js"
import { validateLoginForm } from "../../utils/validate.js"
import { routes } from "../routes.js"
import { useGoogleLogin } from "@react-oauth/google"
import { CalTrackLogo } from "../components/CalTrackLogo.jsx"
import { RefreshCcw, AlertCircle, Eye, EyeOff, Mail, Lock, X, ArrowRight, Check, User, Globe, Users, ShieldCheck, Apple } from "lucide-react"

/* ─── Card dimensions ─── */
const CW = 200
const CH = 130

/* ─── Card grid layout — 4 columns x 3 rows, centered in visible area ─── */
const CARDS = [
  // Row 1 (top)
  {
    id: 1, src: "/mockups/caltrack_dashboard_mockup_1778231495839.png", x: -250, y: -150, z: 80, r: -6,
    title: "Executive Dashboard",
    desc: "1. Real-time KPI overview with productivity scores\n2. Total labor cost tracking across departments\n3. Employee engagement metrics with trend analysis\n4. Active headcount monitoring per location\n5. Monthly labor cost trend with bar & line charts\n6. Productivity score distribution (donut chart)\n7. AI-driven anomaly detection alerts\n8. Top productive teams ranking table\n9. Department-wise cost breakdown\n10. One-click drill-down into any metric"
  },
  {
    id: 2, src: "/mockups/caltrack_scheduling_mockup_1778231584856.png", x: -80, y: -160, z: 50, r: 4,
    title: "Smart Scheduling",
    desc: "1. Drag-and-drop shift assignment calendar\n2. Auto-fill shifts based on availability rules\n3. Overtime threshold alerts & compliance flags\n4. Shift swap requests with manager approval\n5. Break scheduling with labor law compliance\n6. Multi-location coverage visualization\n7. Skills-based shift matching engine\n8. Recurring schedule templates\n9. Real-time understaffing notifications\n10. Export schedules to PDF or calendar sync"
  },
  {
    id: 3, src: "/mockups/caltrack_live_map_mockup_1778231560076.png", x: 80, y: -145, z: 70, r: -3,
    title: "Live Tracking Map",
    desc: "1. Real-time GPS tracking of field employees\n2. Geofenced work zones with entry/exit alerts\n3. Route history playback for each worker\n4. Active employee count per zone\n5. Speed and movement status indicators\n6. Site boundary polygon editor\n7. Employee activity feed with timestamps\n8. Satellite and road map toggle views\n9. Restricted zone violation notifications\n10. Multi-site dashboard with zone summaries"
  },
  {
    id: 4, src: "/mockups/caltrack_mobile_app_mockup_1778231517495.png", x: 250, y: -155, z: 40, r: 8,
    title: "Mobile Field App",
    desc: "1. Geolocation-based punch in/out\n2. Selfie verification at clock-in\n3. Weekly timesheet with daily hours\n4. Current week total and pending approvals\n5. Geolocation map with red pin for HQ\n6. Face verification capture & validation\n7. Activity feed with task assignments\n8. Break timer with auto-deduction\n9. Push notifications for schedule changes\n10. Offline mode with auto-sync on reconnect"
  },
  // Row 2 (middle)
  {
    id: 5, src: "/mockups/caltrack_analytics_mockup_1778231608789.png", x: -220, y: 0, z: 60, r: 5,
    title: "Workforce Analytics",
    desc: "1. Attendance trend analysis over 12 months\n2. Department-level productivity heatmap\n3. Overtime distribution across teams\n4. Late arrival pattern detection\n5. Leave utilization rate by category\n6. Cost-per-employee benchmarking\n7. Predictive staffing recommendations\n8. Custom date range filtering\n9. Export reports to Excel/PDF\n10. Scheduled report email delivery"
  },
  {
    id: 6, src: "/mockups/caltrack_payroll_mockup_1778231538875.png", x: -60, y: 10, z: 90, r: -4,
    title: "Payroll Processing",
    desc: "1. Automated payroll calculation from timesheets\n2. Tax deduction and compliance engine\n3. Overtime rate multiplier configuration\n4. Department-wise salary breakdown\n5. Bonus and incentive management\n6. Payslip generation with PDF export\n7. Bank transfer file generation\n8. Year-to-date earnings summary\n9. Multi-currency support for global teams\n10. Audit trail for all payroll changes"
  },
  {
    id: 7, src: "/mockups/caltrack_dashboard_mockup_1778231495839.png", x: 100, y: -5, z: 30, r: 3,
    title: "Performance Overview",
    desc: "1. Individual employee performance scores\n2. Team comparison leaderboards\n3. Goal tracking with progress bars\n4. Performance review cycle management\n5. 360-degree feedback collection\n6. Skill gap analysis visualization\n7. Training completion tracking\n8. Monthly performance trend lines\n9. Manager notes and action items\n10. Integration with HR systems"
  },
  {
    id: 8, src: "/mockups/caltrack_live_map_mockup_1778231560076.png", x: 260, y: 5, z: 55, r: -7,
    title: "Zone Management",
    desc: "1. Custom geofence zone creation\n2. Multi-polygon boundary drawing\n3. Zone-based attendance rules\n4. Entry/exit time logging per zone\n5. Restricted area access control\n6. Zone capacity monitoring\n7. Historical zone activity reports\n8. Alert configuration per zone\n9. Integration with access control systems\n10. Zone-wise labor cost allocation"
  },
  // Row 3 (bottom)
  {
    id: 9, src: "/mockups/caltrack_mobile_app_mockup_1778231517495.png", x: -240, y: 150, z: 35, r: 6,
    title: "Employee Self-Service",
    desc: "1. Personal profile and document management\n2. Leave request submission with calendar\n3. Timesheet review and approval status\n4. Expense claim submission with receipts\n5. Team directory with org chart\n6. Company announcements feed\n7. Benefits enrollment dashboard\n8. Training module access\n9. Helpdesk ticket creation\n10. Personal analytics and hours summary"
  },
  {
    id: 10, src: "/mockups/caltrack_scheduling_mockup_1778231584856.png", x: -70, y: 155, z: 65, r: -5,
    title: "Shift Planning",
    desc: "1. Weekly and monthly shift calendar views\n2. Employee availability preferences\n3. Conflict detection and resolution\n4. Minimum rest period enforcement\n5. Holiday and leave integration\n6. Cost optimization suggestions\n7. Bulk shift assignment tools\n8. Notification to employees on changes\n9. Coverage gap highlighting\n10. Historical shift pattern analytics"
  },
  {
    id: 11, src: "/mockups/caltrack_payroll_mockup_1778231538875.png", x: 90, y: 145, z: 45, r: 4,
    title: "Compensation Reports",
    desc: "1. Comprehensive salary reports by department\n2. Overtime cost analysis and trends\n3. Benefits cost per employee tracking\n4. Tax liability forecasting\n5. Budget vs actual labor cost comparison\n6. Compensation band analysis\n7. Equal pay audit reports\n8. Contractor vs employee cost analysis\n9. Annual compensation review tools\n10. Custom report builder with filters"
  },
  {
    id: 12, src: "/mockups/caltrack_analytics_mockup_1778231608789.png", x: 240, y: 160, z: 75, r: -8,
    title: "Insights Engine",
    desc: "1. AI-powered workforce trend predictions\n2. Attrition risk scoring per employee\n3. Engagement survey result analysis\n4. Absenteeism pattern recognition\n5. Seasonal demand forecasting\n6. Cost saving opportunity identification\n7. Benchmark against industry standards\n8. Custom KPI dashboard builder\n9. Real-time data pipeline monitoring\n10. Automated insight notifications"
  },
]

/* ─── HOLOGRAPHIC CARD ─── */
function HoloCard({ card, index, onSelect }) {
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.6 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{
        duration: 0.8,
        delay: 0.05 + index * 0.04,
        ease: [0.16, 1, 0.3, 1],
      }}
      style={{
        position: "absolute",
        width: CW,
        height: CH,
        left: `calc(50% - ${CW / 2}px)`,
        top: `calc(50% - ${CH / 2}px)`,
        x: card.x,
        y: card.y,
        zIndex: card.z + 300,
        rotate: card.r,
        contain: "layout style paint",
        willChange: "transform",
      }}
      className="cursor-pointer"
      onClick={() => onSelect(card)}
      whileHover={{
        scale: 1.12,
        zIndex: 999,
        rotate: 0,
        transition: { type: "spring", stiffness: 400, damping: 25 },
      }}
      whileTap={{ scale: 0.97 }}
    >
      <div className="w-full h-full rounded-2xl overflow-hidden bg-white/90 border border-white/50 shadow-[0_8px_24px_-4px_rgba(0,0,0,0.1)]">
        <img
          src={card.src}
          alt=""
          draggable={false}
          loading="lazy"
          className="w-full h-full object-cover select-none pointer-events-none"
        />
        <div className="absolute inset-0 rounded-2xl bg-gradient-to-br from-white/30 via-transparent to-transparent pointer-events-none" />
      </div>
    </motion.div>
  )
}


/* ═══════════════════════════════════════════════════════════════════
   MAIN — LoginPage
   ═══════════════════════════════════════════════════════════════════ */
export function LoginPage() {
  const { login, loginWithGoogle, register } = useAuth()
  const navigate = useNavigate()
  const googleClientId = import.meta.env.VITE_GOOGLE_CLIENT_ID

  const [mode, setMode] = useState("signin")
  const [username, setUsername] = useState("")
  const [password, setPassword] = useState("")
  const [fullName, setFullName] = useState("")
  const [email, setEmail] = useState("")
  const [orgName, setOrgName] = useState("")
  const [numEmployees, setNumEmployees] = useState("1 - 10 employees")
  const [regStep, setRegStep] = useState(1)
  const [showPass, setShowPass] = useState(false)
  const [error, setError] = useState("")
  const [loading, setLoading] = useState(false)
  const [selected, setSelected] = useState(null)
  const [agreedUpdates, setAgreedUpdates] = useState(true)
  const [agreedTerms, setAgreedTerms] = useState(false)

  const postLoginRoute = (usr) => {
    const role = usr?.role
    const isAdmin = role === "admin" || role === "manager"
    return isAdmin ? routes.get_started : routes.dashboard
  }

  const googleLoginHandler = useGoogleLogin({
    onSuccess: async (tr) => {
      setLoading(true)
      try { 
        const u = await loginWithGoogle(tr.access_token)
        navigate(postLoginRoute(u), { replace: true }) 
      }
      catch (err) { setError(extractAuthError(err, "Google login failed.")) }
      finally { setLoading(false) }
    },
    onError: () => setError("Google login failed.")
  })

  async function onSubmit(e) {
    if (e) e.preventDefault()
    if (loading) return
    setError("")
    if (mode === "signin") {
      const ve = validateLoginForm({ identifier: username, password })
      if (ve) return setError(ve)
      setLoading(true)
      try { 
        const u = await login(username.trim(), password)
        navigate(postLoginRoute(u), { replace: true }) 
      }
      catch (err) { setError(extractAuthError(err, "Login failed.")) }
      finally { setLoading(false) }
    } else if (mode === "forgot_password") {
      setLoading(true)
      try {
        const { apiPasswordResetRequest } = await import("../../api/authService.js")
        const res = await apiPasswordResetRequest(username.trim())
        alert(res.detail || "Password reset link sent! Check your email.")
        setMode("signin")
      } catch (err) { setError(extractAuthError(err, "Failed to send reset link.")) }
      finally { setLoading(false) }
    } else {
      setLoading(true)
      try {
        const [first, ...rest] = fullName.trim().split(" ")
        const u = await register({ username: username.trim(), password, email: email.trim(), first_name: first || "", last_name: rest.join(" ") || "", organization_name: orgName.trim() })
        navigate(postLoginRoute(u), { replace: true })
      } catch (err) { setError(extractAuthError(err, "Registration failed.")) }
      finally { setLoading(false) }
    }
  }

  /* ═══════════════════════════════ JSX ═══════════════════════════════ */
  return (
    <div className="flex min-h-screen bg-white font-sans overflow-hidden">

      {/* ═══════════════════ LEFT PANEL — 60 % ═══════════════════ */}
      <div className="hidden lg:flex flex-col w-[60%] bg-[#FDFDFF] relative border-r border-[#F1F5F9] overflow-hidden">

        {/* Golden Glow Gradient Background */}
        <div
          className="absolute inset-0 pointer-events-none"
          style={{
            backgroundImage: "radial-gradient(125% 125% at 50% 10%, #ffffff 40%, #fbbf24 100%)",
            backgroundSize: "100% 100%",
          }}
        />

        <div className="absolute inset-0 pointer-events-none">

          {/* Animated Field Tracking Network */}
          <div className="absolute inset-0 overflow-hidden opacity-[0.2]">
            <svg width="100%" height="100%" className="absolute inset-0">
              <defs>
                <radialGradient id="nodeGlow" cx="50%" cy="50%" r="50%">
                  <stop offset="0%" stopColor="#4338CA" stopOpacity="0.8" />
                  <stop offset="100%" stopColor="#4338CA" stopOpacity="0" />
                </radialGradient>
              </defs>

              {/* Animated Connection Lines */}
              {[...Array(6)].map((_, i) => (
                <motion.line
                  key={`line-${i}`}
                  x1={`${10 + i * 15}%`} y1={`${20 + (i % 3) * 25}%`}
                  x2={`${25 + i * 12}%`} y2={`${45 + (i % 2) * 30}%`}
                  stroke="#4338CA" strokeWidth="0.5" strokeDasharray="4 8"
                  animate={{ strokeDashoffset: [0, -40], opacity: [0.1, 0.3, 0.1] }}
                  transition={{ duration: 10 + i * 2, repeat: Infinity, ease: "linear" }}
                />
              ))}

              {/* Pulsing Tracking Nodes */}
              {[...Array(8)].map((_, i) => (
                <motion.circle
                  key={`node-${i}`}
                  cx={`${15 + i * 10}%`} cy={`${25 + (i % 4) * 15}%`}
                  r="3" fill="url(#nodeGlow)"
                  animate={{
                    scale: [1, 1.5, 1],
                    opacity: [0.3, 0.7, 0.3],
                    x: [0, 15, 0],
                    y: [0, 20, 0]
                  }}
                  transition={{
                    duration: 12 + i * 3,
                    repeat: Infinity,
                    ease: "easeInOut",
                    delay: i * 0.5
                  }}
                />
              ))}
            </svg>
          </div>

          {/* 3D Rotating Wireframe Cube */}
          <div className="absolute inset-0 flex items-center justify-center opacity-[0.04]" style={{ perspective: "1200px" }}>
            <motion.div
              animate={{ rotateY: 360, rotateX: [0, 20, 0] }}
              transition={{ duration: 40, repeat: Infinity, ease: "linear" }}
              style={{ transformStyle: "preserve-3d", width: "400px", height: "400px" }}
              className="relative"
            >
              {/* Cube Faces (Wireframe) */}
              {[
                { rY: 0, z: 200 }, { rY: 90, z: 200 }, { rY: 180, z: 200 },
                { rY: 270, z: 200 }, { rX: 90, z: 200 }, { rX: -90, z: 200 }
              ].map((face, i) => (
                <div
                  key={`face-${i}`}
                  className="absolute inset-0 border border-indigo-500/40"
                  style={{
                    transform: `rotateY(${face.rY || 0}deg) rotateX(${face.rX || 0}deg) translateZ(${face.z}px)`,
                    backgroundImage: "linear-gradient(45deg, transparent 45%, rgba(67, 56, 202, 0.1) 50%, transparent 55%)",
                    backgroundSize: "20px 20px"
                  }}
                />
              ))}

              {/* Inner floating nodes */}
              {[...Array(4)].map((_, i) => (
                <motion.div
                  key={`inner-${i}`}
                  animate={{ scale: [1, 1.2, 1], opacity: [0.3, 0.6, 0.3] }}
                  transition={{ duration: 5 + i, repeat: Infinity }}
                  className="absolute w-4 h-4 bg-indigo-400 rounded-full blur-md"
                  style={{
                    top: `${20 + i * 20}%`,
                    left: `${20 + (i % 2) * 40}%`,
                    transform: "translateZ(100px)"
                  }}
                />
              ))}
            </motion.div>
          </div>

          <div
            className="absolute inset-0 opacity-[0.015]"
            style={{ backgroundImage: "radial-gradient(#4338CA 2px, transparent 2px)", backgroundSize: "80px 80px" }}
          />
        </div>

        {/* Logo */}
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.9, ease: [0.25, 0.46, 0.45, 0.94] }}
          className="relative z-50 flex justify-center pt-14 pb-2"
        >
          <CalTrackLogo size="lg" showTagline={false} />
        </motion.div>

        {/* ── 3D Stage ── */}
        <motion.div
          initial={{ opacity: 0, y: 40, filter: "blur(8px)" }}
          animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
          transition={{ duration: 1.6, delay: 0.4, ease: [0.25, 0.46, 0.45, 0.94] }}
          className="relative flex-1"
          style={{ perspective: "2500px", transformStyle: "preserve-3d" }}
        >
          <div className="absolute inset-0">
            {CARDS.map((card, i) => (
              <HoloCard
                key={card.id}
                card={card}
                index={i}
                onSelect={setSelected}
              />
            ))}
          </div>
        </motion.div>

        {/* ── Full-screen Preview Modal ── */}
        <AnimatePresence>
          {selected && (
            <>
              {/* Backdrop */}
              <motion.div
                key="backdrop"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.2 }}
                className="absolute inset-0 z-[1999] bg-white/30 backdrop-blur-2xl"
                onClick={() => setSelected(null)}
              />

              {/* Preview — fills entire left panel */}
              <motion.div
                key="preview"
                initial={{ opacity: 0, scale: 0.96 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.98 }}
                transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
                className="absolute inset-0 z-[2000] flex flex-col bg-[#0B1120]"
                onClick={() => setSelected(null)}
              >
                {/* Title bar */}
                <div className="px-8 py-4 bg-gradient-to-r from-[#0F172A] to-[#1E293B] flex items-center justify-between shrink-0" onClick={(e) => e.stopPropagation()}>
                  <h2 className="text-white text-lg font-bold tracking-tight">{selected.title}</h2>
                  <button
                    onClick={() => setSelected(null)}
                    className="bg-white/10 hover:bg-white/20 rounded-full p-2 text-white transition-colors"
                  >
                    <X size={18} />
                  </button>
                </div>

                {/* Image — covers full length */}
                <div className="flex-1 min-h-0 overflow-hidden" onClick={(e) => e.stopPropagation()}>
                  <img
                    src={selected.src}
                    alt={selected.title}
                    className="w-full h-full object-cover"
                  />
                </div>

                {/* Workflow description — compact glass overlay */}
                <div className="absolute bottom-0 inset-x-0 px-8 py-6 bg-black/60 backdrop-blur-md border-t border-white/10 shrink-0 overflow-y-auto max-h-[35%]" onClick={(e) => e.stopPropagation()}>
                  <h3 className="text-white/50 text-[10px] font-black uppercase tracking-[0.2em] mb-2">Workflow</h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-1">
                    {selected.desc.split("\n").map((line, i) => (
                      <p key={i} className="flex gap-2 text-white/80 text-[11px] leading-tight font-medium">
                        <span className="text-indigo-400 font-bold shrink-0">{line.split('. ')[0]}.</span>
                        <span>{line.split('. ').slice(1).join('. ')}</span>
                      </p>
                    ))}
                  </div>
                </div>
              </motion.div>
            </>
          )}
        </AnimatePresence>
      </div>

      {/* ═══════════════════ RIGHT PANEL — 40 % ═══════════════════ */}
      <div className="flex-1 flex flex-col justify-center items-center p-8 lg:p-12 bg-white overflow-y-auto">
        <div className="w-full max-w-[440px]">

          {/* Toggle Sign In / Create Account */}
          <div className="flex bg-[#F8FAFC] p-1.5 rounded-2xl mb-12 border border-[#F1F5F9] shadow-sm max-w-[320px] mx-auto">
            <button
              onClick={() => { setMode("signin"); setError(""); setRegStep(1) }}
              className={`flex-1 py-2.5 rounded-xl text-xs font-black uppercase tracking-wider transition-all ${mode === "signin" ? "bg-white text-indigo-600 shadow-md shadow-indigo-100/50 border border-indigo-50/50" : "text-[#94A3B8]"}`}
            >
              Sign In
            </button>
            <button
              onClick={() => { setMode("register"); setError(""); setRegStep(1) }}
              className={`flex-1 py-2.5 rounded-xl text-xs font-black uppercase tracking-wider transition-all ${mode === "register" ? "bg-white text-indigo-600 shadow-md shadow-indigo-100/50 border border-indigo-50/50" : "text-[#94A3B8]"}`}
            >
              Create Account
            </button>
          </div>

          <div className="text-center mb-10">
            <h1 className="text-[32px] font-black text-[#0F172A] leading-tight tracking-tight">
              {mode === "signin" ? "Welcome Back" : "Create a new account"}
            </h1>
          </div>

          {/* Connect With Buttons */}
          <div className="mb-8">
            <p className="text-center text-[10px] font-black text-[#94A3B8] uppercase tracking-[0.2em] mb-4">Connect With</p>
            <button type="button" onClick={() => googleLoginHandler()} className="flex items-center justify-center w-full py-4 px-2 border border-[#F1F5F9] rounded-2xl hover:bg-[#F8FAFC] transition-all group">
              <svg width="20" height="20" viewBox="0 0 48 48">
                <path fill="#EA4335" d="M24 9.5c3.5 0 6.5 1.2 8.9 3.2l6.7-6.7C35.4 2.2 30.1 0 24 0 14.8 0 6.9 5.4 3.1 13.3l7.8 6.1C13 13.1 18 9.5 24 9.5z" />
                <path fill="#4285F4" d="M46.6 24.5c0-1.6-.1-3.2-.4-4.7H24v9h12.7c-.6 3.1-2.4 5.7-5 7.4l7.7 6c4.5-4.1 7.2-10.2 7.2-17.7z" />
                <path fill="#FBBC05" d="M10.9 28.6A14.5 14.5 0 0 1 9.5 24c0-1.6.3-3.2.8-4.6L2.5 13.3A24 24 0 0 0 0 24c0 3.8.9 7.4 2.5 10.7l8.4-6.1z" />
                <path fill="#34A853" d="M24 48c6.1 0 11.2-2 14.9-5.5l-7.7-6c-2 1.4-4.6 2.2-7.2 2.2-5.9 0-11-4-12.8-9.4l-8 6.1C6.9 42.6 14.8 48 24 48z" />
              </svg>
              <span className="ml-3 text-[13px] font-black uppercase text-[#475569]">Google</span>
            </button>
          </div>

          <div className="relative flex items-center mb-8">
            <div className="flex-grow border-t border-[#F1F5F9]" />
            <span className="mx-4 text-[10px] font-black text-[#CBD5E1] tracking-[0.3em]">OR</span>
            <div className="flex-grow border-t border-[#F1F5F9]" />
          </div>

          {mode === "register" && (
            <div className="mb-10 flex items-center justify-between relative px-2">
              <div className="absolute top-1/2 left-0 right-0 h-0.5 bg-[#F1F5F9] -translate-y-1/2 z-0 mx-8" />
              <div
                className="absolute top-1/2 left-0 h-0.5 bg-[#10B981] -translate-y-1/2 z-0 transition-all duration-500 mx-8"
                style={{ width: `calc(${(regStep - 1) / 3 * 100}%)` }}
              />
              {[1, 2, 3, 4].map((s) => (
                <div key={s} className="relative z-10 flex flex-col items-center">
                  <div
                    className={`w-10 h-10 rounded-full flex items-center justify-center text-[13px] font-black transition-all duration-300 border-4 ${regStep > s ? "bg-[#10B981] border-[#D1FAE5] text-white" :
                        regStep === s ? "bg-indigo-600 border-[#EEF2FF] text-white" :
                          "bg-[#F8FAFC] border-[#F1F5F9] text-[#94A3B8]"
                      }`}
                  >
                    {regStep > s ? <Check size={18} strokeWidth={3} /> : s}
                  </div>
                </div>
              ))}
            </div>
          )}

          <form onSubmit={onSubmit} className="space-y-6">
            {mode === "signin" ? (
              <div className="space-y-5">
                <div className="space-y-2">
                  <div className="relative group">
                    <Mail className="absolute left-5 top-1/2 -translate-y-1/2 text-[#94A3B8] group-focus-within:text-indigo-600 transition-colors" size={18} />
                    <input
                      className="w-full pl-14 pr-5 py-5 bg-[#F8FAFC] border border-[#F1F5F9] rounded-2xl text-[15px] font-medium focus:bg-white focus:border-indigo-500 focus:ring-4 focus:ring-indigo-500/5 outline-none transition-all placeholder:text-[#94A3B8]"
                      placeholder="Work Email"
                      value={username}
                      onChange={e => setUsername(e.target.value)}
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <div className="relative group">
                    <Lock className="absolute left-5 top-1/2 -translate-y-1/2 text-[#94A3B8] group-focus-within:text-indigo-600 transition-colors" size={18} />
                    <input
                      className="w-full pl-14 pr-14 py-5 bg-[#F8FAFC] border border-[#F1F5F9] rounded-2xl text-[15px] font-medium focus:bg-white focus:border-indigo-500 focus:ring-4 focus:ring-indigo-500/5 outline-none transition-all placeholder:text-[#94A3B8]"
                      type={showPass ? "text" : "password"}
                      placeholder="Password"
                      value={password}
                      onChange={e => setPassword(e.target.value)}
                    />
                    <button type="button" className="absolute right-5 top-1/2 -translate-y-1/2 text-[#94A3B8] hover:text-[#334155]" onClick={() => setShowPass(p => !p)}>
                      {showPass ? <EyeOff size={18} /> : <Eye size={18} />}
                    </button>
                  </div>
                </div>
                <div className="flex justify-end mt-1 pr-1">
                  <button type="button" onClick={() => setMode("forgot_password")} className="text-[12px] font-bold text-indigo-600 hover:text-indigo-800 transition-colors">
                    Forgot Password?
                  </button>
                </div>
              </div>
            ) : mode === "forgot_password" ? (
              <div className="space-y-5 min-h-[240px]">
                <h2 className="text-xl font-black text-[#0F172A] mb-2">Reset Password</h2>
                <p className="text-[13px] font-medium text-[#64748B] mb-6">Enter your email address and we'll send you a link to reset your password.</p>
                <div className="relative group">
                  <Mail className="absolute left-5 top-1/2 -translate-y-1/2 text-[#94A3B8] group-focus-within:text-indigo-600 transition-colors" size={18} />
                  <input
                    className="w-full pl-14 pr-5 py-5 bg-[#F8FAFC] border border-[#F1F5F9] rounded-2xl text-[15px] font-medium focus:bg-white focus:border-indigo-500 focus:ring-4 focus:ring-indigo-500/5 outline-none transition-all placeholder:text-[#94A3B8]"
                    placeholder="Work Email"
                    value={username}
                    onChange={e => setUsername(e.target.value)}
                    required
                  />
                </div>
              </div>
            ) : (
              <div className="min-h-[240px]">
                {regStep === 1 && (
                  <motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} className="space-y-5">
                    <h2 className="text-xl font-black text-[#0F172A] mb-6">Personal Details</h2>
                    <div className="relative">
                      <input className="w-full px-6 py-5 bg-[#F8FAFC] border border-[#F1F5F9] rounded-2xl text-[15px] font-medium outline-none focus:bg-white focus:border-indigo-500 transition-all" placeholder="Full Name" value={fullName} onChange={e => setFullName(e.target.value)} />
                    </div>
                    <div className="relative">
                      <input className="w-full px-6 py-5 bg-[#F8FAFC] border border-[#F1F5F9] rounded-2xl text-[15px] font-medium outline-none focus:bg-white focus:border-indigo-500 transition-all" placeholder="Work Email" value={email} onChange={e => setEmail(e.target.value)} />
                    </div>
                  </motion.div>
                )}
                {regStep === 2 && (
                  <motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} className="space-y-5">
                    <h2 className="text-xl font-black text-[#0F172A] mb-6">Organization Info</h2>
                    <input className="w-full px-6 py-5 bg-[#F8FAFC] border border-[#F1F5F9] rounded-2xl text-[15px] font-medium outline-none focus:bg-white focus:border-indigo-500 transition-all" placeholder="Organization Name" value={orgName} onChange={e => setOrgName(e.target.value)} />
                    <select className="w-full px-6 py-5 bg-[#F8FAFC] border border-[#F1F5F9] rounded-2xl text-[15px] font-medium outline-none focus:bg-white focus:border-indigo-500 transition-all appearance-none" value={numEmployees} onChange={e => setNumEmployees(e.target.value)}>
                      <option>1 - 10 employees</option>
                      <option>11 - 50 employees</option>
                      <option>51 - 200 employees</option>
                      <option>201+ employees</option>
                    </select>
                  </motion.div>
                )}
                {regStep === 3 && (
                  <motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} className="space-y-5">
                    <h2 className="text-xl font-black text-[#0F172A] mb-6">Platform Credentials</h2>
                    <input className="w-full px-6 py-5 bg-[#F8FAFC] border border-[#F1F5F9] rounded-2xl text-[15px] font-medium outline-none focus:bg-white focus:border-indigo-500 transition-all" placeholder="Username" value={username} onChange={e => setUsername(e.target.value)} />
                    <input className="w-full px-6 py-5 bg-[#F8FAFC] border border-[#F1F5F9] rounded-2xl text-[15px] font-medium outline-none focus:bg-white focus:border-indigo-500 transition-all" type="password" placeholder="Password" value={password} onChange={e => setPassword(e.target.value)} />
                  </motion.div>
                )}
                {regStep === 4 && (
                  <motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} className="space-y-6">
                    <div className="flex items-center gap-2 text-indigo-600 font-black text-[10px] uppercase tracking-widest mb-1">
                      <ShieldCheck size={14} /> Finalize
                    </div>
                    <h2 className="text-[28px] font-black text-[#0F172A] leading-tight">Almost there!</h2>

                    <div className="space-y-4 pt-2">
                      <label className="flex items-start gap-3 cursor-pointer group">
                        <div className={`mt-1 w-5 h-5 rounded-md flex items-center justify-center transition-all border ${agreedUpdates ? "bg-indigo-600 border-indigo-600 text-white" : "border-[#E2E8F0] bg-white group-hover:border-indigo-200"}`}>
                          {agreedUpdates && <Check size={14} strokeWidth={4} />}
                        </div>
                        <input type="checkbox" className="hidden" checked={agreedUpdates} onChange={() => setAgreedUpdates(!agreedUpdates)} />
                        <span className="text-[13px] font-medium text-[#64748B] leading-tight">Receive updates and tips from Caltrack.</span>
                      </label>
                      <label className="flex items-start gap-3 cursor-pointer group">
                        <div className={`mt-1 w-5 h-5 rounded-md flex items-center justify-center transition-all border ${agreedTerms ? "bg-indigo-600 border-indigo-600 text-white" : "border-[#E2E8F0] bg-white group-hover:border-indigo-200"}`}>
                          {agreedTerms && <Check size={14} strokeWidth={4} />}
                        </div>
                        <input type="checkbox" className="hidden" checked={agreedTerms} onChange={() => setAgreedTerms(!agreedTerms)} />
                        <span className="text-[13px] font-medium text-[#64748B] leading-tight">Agree to <span className="text-indigo-600 font-bold">Terms</span> & <span className="text-indigo-600 font-bold">Privacy</span>.</span>
                      </label>
                    </div>

                    <div className="bg-[#F8FAFC] border border-[#F1F5F9] rounded-2xl p-5 flex items-center justify-between">
                      <span className="text-[15px] font-bold text-[#0F172A]">I'm not a robot</span>
                      <div className="w-6 h-6 border-2 border-[#E2E8F0] rounded-md" />
                    </div>
                  </motion.div>
                )}
              </div>
            )}

            {error && (
              <div className="p-4 bg-red-50 text-red-600 text-xs font-bold rounded-2xl border border-red-100 flex items-center gap-3">
                <AlertCircle size={15} /> {error}
              </div>
            )}

            <div className="flex gap-3">
              {mode === "register" && regStep > 1 && (
                <button
                  type="button"
                  onClick={() => setRegStep(p => p - 1)}
                  className="flex-1 py-5 bg-[#F8FAFC] text-[#64748B] text-[13px] font-black uppercase tracking-widest rounded-2xl border border-[#F1F5F9] hover:bg-white transition-all"
                >
                  Back
                </button>
              )}
              <button
                type={mode === "register" && regStep < 4 ? "button" : "submit"}
                disabled={loading || (mode === "register" && regStep === 4 && !agreedTerms)}
                onClick={() => {
                  if (mode === "register" && regStep < 4) setRegStep(p => p + 1)
                }}
                className={`flex-[2] py-5 bg-indigo-600 text-white text-[13px] font-black uppercase tracking-widest rounded-2xl shadow-xl shadow-indigo-100/50 hover:bg-indigo-700 active:scale-[0.98] transition-all flex items-center justify-center gap-2 disabled:opacity-40 disabled:shadow-none`}
              >
                {loading ? <RefreshCcw className="animate-spin" size={18} /> :
                  mode === "signin" ? "Sign In" :
                  mode === "forgot_password" ? "Send Reset Link" :
                    regStep === 4 ? (agreedTerms ? "Continue" : <RefreshCcw size={18} />) : "Continue"}
              </button>
            </div>
          </form>

          <div className="mt-12 text-center">
            <button className="text-[11px] font-black uppercase tracking-widest text-[#94A3B8] hover:text-indigo-600 transition-colors">
              Need Help? <span className="text-indigo-600">Contact Support</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
