import { useState } from "react"
import { useSearchParams, useNavigate } from "react-router-dom"
import { apiPasswordResetConfirm, extractAuthError } from "../../api/authService.js"
import { CalTrackLogo } from "../components/CalTrackLogo.jsx"
import { Lock, RefreshCcw, AlertCircle, CheckCircle2 } from "lucide-react"

export function ResetPasswordPage() {
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const uid = searchParams.get("uid")
  const token = searchParams.get("token")

  const [password, setPassword] = useState("")
  const [confirmPassword, setConfirmPassword] = useState("")
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")
  const [success, setSuccess] = useState(false)

  async function handleSubmit(e) {
    e.preventDefault()
    setError("")
    if (!uid || !token) {
      setError("Invalid password reset link.")
      return
    }
    if (password.length < 8) {
      setError("Password must be at least 8 characters long.")
      return
    }
    if (password !== confirmPassword) {
      setError("Passwords do not match.")
      return
    }

    setLoading(true)
    try {
      await apiPasswordResetConfirm({ uid, token, new_password: password })
      setSuccess(true)
    } catch (err) {
      setError(extractAuthError(err, "Failed to reset password. Link may be expired."))
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-[#FDFDFF] flex flex-col justify-center items-center p-6">
      <div className="absolute inset-0 pointer-events-none" style={{ backgroundImage: "radial-gradient(125% 125% at 50% 10%, #ffffff 40%, #fbbf24 100%)", backgroundSize: "100% 100%" }} />
      <div className="absolute inset-0 opacity-[0.015]" style={{ backgroundImage: "radial-gradient(#4338CA 2px, transparent 2px)", backgroundSize: "80px 80px" }} />
      
      <div className="relative z-10 w-full max-w-[400px]">
        <div className="flex justify-center mb-10">
          <CalTrackLogo size="lg" showTagline={false} />
        </div>

        <div className="bg-white rounded-[2rem] p-8 shadow-xl shadow-indigo-100/40 border border-[#F1F5F9]">
          <h2 className="text-[24px] font-black text-[#0F172A] leading-tight mb-2 text-center">Set New Password</h2>
          
          {success ? (
            <div className="text-center py-6">
              <div className="w-16 h-16 bg-green-50 rounded-full flex items-center justify-center mx-auto mb-4">
                <CheckCircle2 size={32} className="text-green-500" />
              </div>
              <p className="text-sm font-medium text-[#64748B] mb-8">Your password has been successfully reset. You can now use your new password to sign in.</p>
              <button onClick={() => navigate("/login")} className="w-full py-4 bg-indigo-600 text-white text-[13px] font-black uppercase tracking-widest rounded-2xl shadow-lg shadow-indigo-100 hover:bg-indigo-700 transition-all">
                Back to Sign In
              </button>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-5 mt-8">
              <p className="text-[13px] font-medium text-[#64748B] text-center mb-6">Create a strong new password for your account.</p>
              
              <div className="relative group">
                <Lock className="absolute left-5 top-1/2 -translate-y-1/2 text-[#94A3B8] group-focus-within:text-indigo-600 transition-colors" size={18} />
                <input
                  type="password"
                  className="w-full pl-14 pr-5 py-5 bg-[#F8FAFC] border border-[#F1F5F9] rounded-2xl text-[15px] font-medium focus:bg-white focus:border-indigo-500 focus:ring-4 focus:ring-indigo-500/5 outline-none transition-all placeholder:text-[#94A3B8]"
                  placeholder="New Password"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  required
                />
              </div>

              <div className="relative group">
                <Lock className="absolute left-5 top-1/2 -translate-y-1/2 text-[#94A3B8] group-focus-within:text-indigo-600 transition-colors" size={18} />
                <input
                  type="password"
                  className="w-full pl-14 pr-5 py-5 bg-[#F8FAFC] border border-[#F1F5F9] rounded-2xl text-[15px] font-medium focus:bg-white focus:border-indigo-500 focus:ring-4 focus:ring-indigo-500/5 outline-none transition-all placeholder:text-[#94A3B8]"
                  placeholder="Confirm New Password"
                  value={confirmPassword}
                  onChange={e => setConfirmPassword(e.target.value)}
                  required
                />
              </div>

              {error && (
                <div className="p-4 bg-red-50 text-red-600 text-xs font-bold rounded-2xl border border-red-100 flex items-center gap-3">
                  <AlertCircle size={15} /> {error}
                </div>
              )}

              <button
                type="submit"
                disabled={loading}
                className="w-full py-5 bg-indigo-600 text-white text-[13px] font-black uppercase tracking-widest rounded-2xl shadow-xl shadow-indigo-100/50 hover:bg-indigo-700 active:scale-[0.98] transition-all flex items-center justify-center gap-2 disabled:opacity-40 disabled:shadow-none mt-2"
              >
                {loading ? <RefreshCcw className="animate-spin" size={18} /> : "Reset Password"}
              </button>
              
              <div className="text-center mt-6">
                <button type="button" onClick={() => navigate("/login")} className="text-[12px] font-bold text-[#64748B] hover:text-indigo-600 transition-colors">
                  Cancel
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  )
}
