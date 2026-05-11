import React, { useState } from "react"
import { Save } from "lucide-react"

export default function ProfileSection({ markDirty, showToast, Field, SectionHeader }) {
  const [name, setName] = useState("Jasmine Dorathy")
  const [username, setUsername] = useState("jasminedorathy")
  const [bio, setBio] = useState("Enterprise admin managing QuickTims ERP system operations.")

  return (
    <div className="stPanel">
      <SectionHeader title="Profile" subtitle="Update your personal information visible across the system." />
      <div className="stCard">
        <div className="stFormGrid">
          <Field label="Full name" half>
            <input className="stInput" value={name} placeholder="Your full name" onChange={e => { setName(e.target.value); markDirty() }} />
          </Field>
          <Field label="Username" half>
            <input className="stInput" value={username} placeholder="Your username" onChange={e => { setUsername(e.target.value); markDirty() }} />
          </Field>
          <Field label="Profession">
            <select className="stInput stSelect" onChange={() => markDirty()}>
              <option>Administrator</option>
              <option>HR Manager</option>
              <option>Finance Lead</option>
              <option>Operations Head</option>
            </select>
          </Field>
          <Field label="Location">
            <select className="stInput stSelect" onChange={() => markDirty()}>
              <option>Chennai, Tamil Nadu</option>
              <option>Bengaluru, Karnataka</option>
              <option>Mumbai, Maharashtra</option>
              <option>Hyderabad, Telangana</option>
            </select>
          </Field>
          <Field label="Bio">
            <textarea className="stInput stTextarea" value={bio} placeholder="A short bio..."
              onChange={e => { setBio(e.target.value); markDirty() }} rows={3} />
          </Field>
          <Field label="Profile link">
            <div className="stInputAddon">
              <span className="stInputAddonPrefix">erp.caltims.com/u/</span>
              <input className="stInput stInputAddonField" value={username} onChange={e => { setUsername(e.target.value); markDirty() }} />
            </div>
          </Field>
        </div>
        <div className="stCardActions">
          <button className="stPrimaryBtn" onClick={() => showToast("Profile updated!")}>
            <Save size={14} /> Save Profile
          </button>
        </div>
      </div>
    </div>
  )
}
