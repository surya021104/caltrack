import React, { useState } from "react"
import { Zap, RefreshCcw } from "lucide-react"

export default function AISettingsSection({ markDirty, showToast, SectionHeader, ToggleSwitch }) {
  const [enabled, setEnabled] = useState(true)
  const [anomaly, setAnomaly] = useState(true)
  const [autoApproval, setAutoApproval] = useState(false)
  
  return (
    <div className="stPanel">
      <SectionHeader title="AI & Automation" subtitle="Leverage machine learning for attendance insights and smart operations." />
      
      <div className="stCard">
        <div className="stToggleRow">
          <div>
            <div className="stToggleLabel">AI Attendance Insights</div>
            <div className="stToggleDesc">Automatically detect patterns in employee clock-ins and outs.</div>
          </div>
          <ToggleSwitch checked={enabled} onChange={v => { setEnabled(v); markDirty() }} />
        </div>
        
        <div className="stToggleRow">
          <div>
            <div className="stToggleLabel">Anomaly Detection</div>
            <div className="stToggleDesc">Flag suspicious activity like multiple logins or unusual locations.</div>
          </div>
          <ToggleSwitch checked={anomaly} onChange={v => { setAnomaly(v); markDirty() }} accent="#F43F5E" />
        </div>

        <div className="stToggleRow">
          <div>
            <div className="stToggleLabel">Auto-Payroll Suggestions</div>
            <div className="stToggleDesc">AI-generated payroll exports based on historical work hours.</div>
          </div>
          <ToggleSwitch checked={autoApproval} onChange={v => { setAutoApproval(v); markDirty() }} accent="#10B981" />
        </div>
      </div>

      <div className="stCard">
        <h4 style={{ margin: "0 0 12px 0", fontSize: 14, fontWeight: 800 }}>Productivity Scoring</h4>
        <p style={{ fontSize: 12, color: "var(--muted)", marginBottom: 16 }}>Calculate individual and team productivity scores using AI models.</p>
        <button className="stSecondaryBtn" onClick={() => showToast("AI Model Training in progress...", "info")}>
          <RefreshCcw size={14} /> Recalculate Scores
        </button>
      </div>
    </div>
  )
}
