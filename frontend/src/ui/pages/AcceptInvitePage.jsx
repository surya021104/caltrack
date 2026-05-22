import { useState } from "react"
import { useNavigate, useSearchParams } from "react-router-dom"
import { motion, AnimatePresence } from "framer-motion"
import { apiRequest } from "../../api/client.js"
import { useAuth } from "../../state/auth/useAuth.js"
import { routes } from "../routes.js"
import { useGoogleLogin } from "@react-oauth/google"
import { CalTrackLogo } from "../components/CalTrackLogo.jsx"
import { Loader2, Lock, ArrowRight, User, Check, Mail, X } from "lucide-react"
import { setTokens } from "../../state/auth/tokens.js"

/* ─── Shared Card Config (from LoginPage) ─── */
const CW = 200
const CH = 130
const CARDS = [
  { id: 1, src: "/mockups/caltrack_dashboard_mockup_1778231495839.png", x: -250, y: -150, z: 80, r: -6, title: "Executive Dashboard" },
  { id: 2, src: "/mockups/caltrack_scheduling_mockup_1778231584856.png", x: -80, y: -160, z: 50, r: 4, title: "Smart Scheduling" },
  { id: 3, src: "/mockups/caltrack_live_map_mockup_1778231560076.png", x: 80, y: -145, z: 70, r: -3, title: "Live Tracking Map" },
  { id: 4, src: "/mockups/caltrack_mobile_app_mockup_1778231517495.png", x: 250, y: -155, z: 40, r: 8, title: "Mobile Field App" },
  { id: 5, src: "/mockups/caltrack_analytics_mockup_1778231608789.png", x: -220, y: 0, z: 60, r: 5, title: "Workforce Analytics" },
  { id: 6, src: "/mockups/caltrack_payroll_mockup_1778231538875.png", x: -60, y: 10, z: 90, r: -4, title: "Payroll Processing" },
]

function HoloCard({ card, index }) {
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.6 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.8, delay: index * 0.05, ease: [0.16, 1, 0.3, 1] }}
      style={{
        position: "absolute",
        width: CW, height: CH,
        left: `calc(50% - ${CW / 2}px)`,
        top: `calc(50% - ${CH / 2}px)`,
        x: card.x, y: card.y, zIndex: card.z + 300, rotate: card.r,
      }}
    >
      <div className="w-full h-full rounded-2xl overflow-hidden bg-white/90 border border-white/50 shadow-xl">
        <img src={card.src} alt="" className="w-full h-full object-cover select-none pointer-events-none" />
      </div>
    </motion.div>
  )
}

export function AcceptInvitePage() {
  const [searchParams] = useSearchParams()
  const token = searchParams.get("token")
  const org = searchParams.get("org")
  const navigate = useNavigate()
  const { refreshMe, loginWithGoogle } = useAuth()
  
  const [formData, setFormData] = useState({ first_name: "", last_name: "", password: "" })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  const handleGoogleSuccess = async (tr) => {
    setLoading(true)
    setError(null)
    try {
      const u = await loginWithGoogle(tr.access_token)
      const role = u?.role
      const isAdmin = role === "admin" || role === "manager"
      navigate(isAdmin ? routes.get_started : routes.dashboard)
    } catch (err) {
      setError(err?.body?.detail || "Google authentication failed.")
      setLoading(false)
    }
  }

  const googleLogin = useGoogleLogin({
    onSuccess: handleGoogleSuccess,
    onError: () => setError("Google login failed.")
  })

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!formData.password || formData.password.length < 8) {
      setError("Password must be at least 8 characters long.")
      return
    }
    setLoading(true)
    setError(null)
    try {
      const res = await apiRequest("/auth/accept-invite/", {
        method: "POST",
        json: { ...formData, token, org }
      })
      
      setTokens({ access: res.access, refresh: res.refresh })
      const u = await refreshMe()
      const role = u?.role
      const isAdmin = role === "admin" || role === "manager"
      navigate(isAdmin ? routes.get_started : routes.dashboard)
    } catch (err) {
      setError(err?.body?.detail || err?.body?.message || "Failed to join team.")
      setLoading(false)
    }
  }

  if (!token) return <div className="p-20 text-center">Invalid invitation link.</div>

  return (
    <div className="flex min-h-screen bg-white font-sans overflow-hidden">
      
      {/* ═══════════════════ LEFT PANEL ═══════════════════ */}
      <div className="hidden lg:flex flex-col w-[60%] bg-[#FDFDFF] relative border-r border-[#F1F5F9] overflow-hidden">
        <div className="absolute inset-0 pointer-events-none" style={{ backgroundImage: "radial-gradient(125% 125% at 50% 10%, #ffffff 40%, #fbbf24 100%)" }} />
        
        <motion.div initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }} className="relative z-50 flex justify-center pt-14">
          <CalTrackLogo size="lg" showTagline={false} />
        </motion.div>

        <div className="relative flex-1" style={{ perspective: "2500px", transformStyle: "preserve-3d" }}>
          <div className="absolute inset-0">
            {CARDS.map((card, i) => <HoloCard key={card.id} card={card} index={i} />)}
          </div>
        </div>
      </div>

      {/* ═══════════════════ RIGHT PANEL ═══════════════════ */}
      <div className="flex-1 flex flex-col justify-center items-center p-8 lg:p-12 bg-white overflow-y-auto">
        <div className="w-full max-w-[440px]">
          
          <div className="text-center mb-12">
            <h1 className="text-[32px] font-black text-[#0F172A] leading-tight tracking-tight">Join Your Team</h1>
            <p className="text-[#64748B] font-medium mt-3">Setup your account to start tracking time</p>
          </div>

          {/* Social Join */}
          <div className="space-y-4 mb-8">
            <button 
              onClick={() => googleLogin()}
              disabled={loading}
              className="flex items-center justify-center gap-3 w-full px-6 py-4 bg-white border border-[#E2E8F0] rounded-2xl text-[14px] font-bold text-[#334155] hover:bg-[#F8FAFF] transition-all shadow-sm"
            >
              <svg width="20" height="20" viewBox="0 0 48 48">
                <path fill="#EA4335" d="M24 9.5c3.5 0 6.5 1.2 8.9 3.2l6.7-6.7C35.4 2.2 30.1 0 24 0 14.8 0 6.9 5.4 3.1 13.3l7.8 6.1C13 13.1 18 9.5 24 9.5z" />
                <path fill="#4285F4" d="M46.6 24.5c0-1.6-.1-3.2-.4-4.7H24v9h12.7c-.6 3.1-2.4 5.7-5 7.4l7.7 6c4.5-4.1 7.2-10.2 7.2-17.7z" />
                <path fill="#FBBC05" d="M10.9 28.6A14.5 14.5 0 0 1 9.5 24c0-1.6.3-3.2.8-4.6L2.5 13.3A24 24 0 0 0 0 24c0 3.8.9 7.4 2.5 10.7l8.4-6.1z" />
                <path fill="#34A853" d="M24 48c6.1 0 11.2-2 14.9-5.5l-7.7-6c-2 1.4-4.6 2.2-7.2 2.2-5.9 0-11-4-12.8-9.4l-8 6.1C6.9 42.6 14.8 48 24 48z" />
              </svg>
              Continue with Google
            </button>
          </div>

          <div className="relative flex items-center mb-10">
            <div className="flex-grow border-t border-[#F1F5F9]" />
            <span className="mx-4 text-[10px] font-black text-[#CBD5E1] tracking-[0.3em]">OR JOIN MANUALLY</span>
            <div className="flex-grow border-t border-[#F1F5F9]" />
          </div>

          {error && (
            <div className="mb-6 p-4 bg-red-50 text-red-600 text-xs font-bold rounded-2xl border border-red-100">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-5">
            <div className="grid grid-cols-2 gap-4">
              <input 
                className="w-full px-6 py-5 bg-[#F8FAFC] border border-[#F1F5F9] rounded-2xl text-[15px] font-medium focus:bg-white focus:border-indigo-500 transition-all outline-none"
                placeholder="First Name"
                value={formData.first_name}
                onChange={e => setFormData(p => ({ ...p, first_name: e.target.value }))}
                required
              />
              <input 
                className="w-full px-6 py-5 bg-[#F8FAFC] border border-[#F1F5F9] rounded-2xl text-[15px] font-medium focus:bg-white focus:border-indigo-500 transition-all outline-none"
                placeholder="Last Name"
                value={formData.last_name}
                onChange={e => setFormData(p => ({ ...p, last_name: e.target.value }))}
                required
              />
            </div>

            <div className="relative group">
              <Lock className="absolute left-5 top-1/2 -translate-y-1/2 text-[#94A3B8]" size={18} />
              <input 
                className="w-full pl-14 pr-5 py-5 bg-[#F8FAFC] border border-[#F1F5F9] rounded-2xl text-[15px] font-medium focus:bg-white focus:border-indigo-500 transition-all outline-none"
                type="password"
                placeholder="Set Password"
                value={formData.password}
                onChange={e => setFormData(p => ({ ...p, password: e.target.value }))}
                required
              />
            </div>

            <button 
              type="submit"
              disabled={loading}
              className="w-full py-5 bg-indigo-600 text-white text-[13px] font-black uppercase tracking-widest rounded-2xl shadow-xl hover:bg-indigo-700 transition-all flex items-center justify-center gap-2"
            >
              {loading ? <Loader2 className="animate-spin" size={18} /> : <>Join Workspace <ArrowRight size={18} /></>}
            </button>
          </form>

        </div>
      </div>
    </div>
  )
}
