import { useEffect, useRef, useState } from "react"
import { apiRequest } from "../../api/client"
import {
    Users, Search, Plus, ChevronDown, X,
    Copy, RefreshCcw, Check,
    MoreHorizontal, ChevronRight,
    Columns, UserCircle, ShieldCheck,
    Mail, Settings2, Archive, Edit3, Trash2
} from "lucide-react"
import "./SettingsSubpages.css"

/* ─── Fake invite link ─────────────────────────────────────────── */
function makeLink() {
    return `https://app.caltrack.io/join?magic=${Math.random().toString(36).slice(2, 10)}&org=quicktims&t=${Date.now()}`
}

/* ─── Click-outside hook ───────────────────────────────────────── */
function useClickOutside(cb) {
    const ref = useRef(null)
    useEffect(() => {
        function h(e) { if (ref.current && !ref.current.contains(e.target)) cb() }
        document.addEventListener("mousedown", h)
        return () => document.removeEventListener("mousedown", h)
    }, [cb])
    return ref
}

/* ─── Simple filter dropdown ───────────────────────────────────── */
function FilterDropdown({ label, options, selected, onChange }) {
    const [open, setOpen] = useState(false)
    const ref = useClickOutside(() => setOpen(false))
    const toggle = (v) => onChange(selected.includes(v) ? selected.filter(x => x !== v) : [...selected, v])

    return (
        <div className="psFilterWrap" ref={ref}>
            <button
                className={`filterBtn${open || selected.length ? " active" : ""}`}
                onClick={() => setOpen(o => !o)}
            >
                {label}
                {selected.length > 0 && <span className="psFilterBadge">{selected.length}</span>}
                <ChevronDown size={13} style={{ marginLeft: 4, transform: open ? "rotate(180deg)" : "", transition: "transform .2s" }} />
            </button>
            {open && (
                <div className="psDropdown">
                    {options.map(opt => (
                        <label key={opt} className="psDropdownItem">
                            <input type="checkbox" checked={selected.includes(opt)} onChange={() => toggle(opt)} />
                            {opt}
                        </label>
                    ))}
                    {selected.length > 0 && (
                        <button className="psClearFilter" onClick={() => { onChange([]); setOpen(false) }}>Clear filter</button>
                    )}
                </div>
            )}
        </div>
    )
}

/* ─── Add Filter dropdown (reference image style) ──────────────── */
const ALL_FILTERS = [
    "Roles", "Groups", "Positions", "Employment types",
    "Managed by", "Statuses", "Face data", "NFC tag",
    "Last active", "Work schedule", "Holiday calendar"
]
const DEFAULT_FILTERS = ["Roles", "Groups"]

function AddFilterDropdown({ activeFilters, onChange }) {
    const [open, setOpen] = useState(false)
    const ref = useClickOutside(() => setOpen(false))
    const toggle = (f) => onChange(activeFilters.includes(f) ? activeFilters.filter(x => x !== f) : [...activeFilters, f])

    return (
        <div className="psFilterWrap" ref={ref}>
            <button
                className={`addFilterBtn${open ? " active" : ""}`}
                onClick={() => setOpen(o => !o)}
            >
                <Plus size={13} /> Add filter
            </button>
            {open && (
                <div className="psDropdown psAddFilterList">
                    {ALL_FILTERS.map(f => (
                        <button
                            key={f}
                            className={`psAddFilterItem${activeFilters.includes(f) ? " selected" : ""}`}
                            onClick={() => toggle(f)}
                        >
                            <span>{f}</span>
                            {activeFilters.includes(f) && <Check size={14} className="psCheckMark" />}
                        </button>
                    ))}
                    {activeFilters.length > 0 && (
                        <button className="psClearFilter" onClick={() => { onChange([]); setOpen(false) }}>
                            Clear selection
                        </button>
                    )}
                </div>
            )}
        </div>
    )
}

/* ─── Column visibility panel ──────────────────────────────────── */
const ALL_COLUMNS = ["Email", "Group", "Last active", "Join date", "Work schedule", "Holiday calendar", "Phone Number", "Member code", "Position", "Employment type", "Kiosks"]
const DEFAULT_COLS = ["Email", "Group", "Last active"]

function ColumnToggle({ visibleCols, onChange }) {
    const [open, setOpen] = useState(false)
    const ref = useClickOutside(() => setOpen(false))
    const toggle = (c) => onChange(visibleCols.includes(c) ? visibleCols.filter(x => x !== c) : [...visibleCols, c])

    return (
        <div style={{ position: "relative" }} ref={ref}>
            <button
                className={`psColIconBtn${open ? " active" : ""}`}
                title="Show/hide columns"
                onClick={() => setOpen(o => !o)}
            >
                <Columns size={16} />
            </button>
            {open && (
                <div className="psDropdown psColDropdown">
                    <div className="psColDropdownTitle">Columns</div>
                    {ALL_COLUMNS.map(col => (
                        <button
                            key={col}
                            className={`psAddFilterItem${visibleCols.includes(col) ? " selected" : ""}`}
                            onClick={() => toggle(col)}
                        >
                            <span>{col}</span>
                            {visibleCols.includes(col) && <Check size={14} className="psCheckMark" />}
                        </button>
                    ))}
                </div>
            )}
        </div>
    )
}

/* ─── Row kebab menu ────────────────────────────────────────────── */
const ROW_ACTIONS = [
    { label: "View profile", icon: <UserCircle size={15} />, key: "view" },
    { label: "Edit member", icon: <Edit3 size={15} />, key: "edit" },
    { label: "Add to a group...", icon: <Users size={15} />, key: "group" },
    { label: "Change role", icon: <ShieldCheck size={15} />, key: "role" },
    { label: "Send invite", icon: <Mail size={15} />, key: "invite" },
    { label: "Assign", icon: <ChevronRight size={15} />, key: "assign", sub: true },
    { label: "Unassign", icon: <ChevronRight size={15} />, key: "unassign", sub: true },
    { label: "Manage kiosks", icon: <Settings2 size={15} />, key: "kiosks" },
    { label: "Archive member", icon: <Archive size={15} />, key: "archive", danger: true },
]

function RowMenu({ memberId, onEdit }) {
    const [open, setOpen] = useState(false)
    const ref = useClickOutside(() => setOpen(false))

    const handleAction = (a) => {
        setOpen(false)
        if (a.key === "edit") onEdit(memberId)
        else alert(`${a.label} — coming soon`)
    }

    return (
        <div className="psRowMenuWrap" ref={ref}>
            <button
                className={`psRowMenuBtn${open ? " open" : ""}`}
                onClick={() => setOpen(o => !o)}
                title="More actions"
            >
                <MoreHorizontal size={16} />
            </button>
            {open && (
                <div className="psRowMenu">
                    {ROW_ACTIONS.map((a, i) => (
                        <button
                            key={a.key}
                            className={`psRowMenuItem${a.danger ? " danger" : ""}${i === ROW_ACTIONS.length - 2 ? " separator" : ""}`}
                            onClick={() => handleAction(a)}
                        >
                            <span className="psRowMenuLabel">{a.label}</span>
                            {a.sub && <ChevronRight size={13} className="psRowMenuArrow" />}
                        </button>
                    ))}
                </div>
            )}
        </div>
    )
}

/* ─── Country codes ──────────────────────────────────────────────── */
const COUNTRIES = [
    { flag: "🇮🇳", code: "+91", name: "India" },
    { flag: "🇺🇸", code: "+1", name: "USA" },
    { flag: "🇬🇧", code: "+44", name: "UK" },
    { flag: "🇦🇺", code: "+61", name: "Australia" },
    { flag: "🇨🇦", code: "+1", name: "Canada" },
    { flag: "🇩🇪", code: "+49", name: "Germany" },
    { flag: "🇫🇷", code: "+33", name: "France" },
    { flag: "🇮🇹", code: "+39", name: "Italy" },
    { flag: "🇪🇸", code: "+34", name: "Spain" },
    { flag: "🇧🇷", code: "+55", name: "Brazil" },
    { flag: "🇲🇽", code: "+52", name: "Mexico" },
    { flag: "🇯🇵", code: "+81", name: "Japan" },
    { flag: "🇰🇷", code: "+82", name: "South Korea" },
    { flag: "🇨🇳", code: "+86", name: "China" },
    { flag: "🇸🇬", code: "+65", name: "Singapore" },
    { flag: "🇦🇪", code: "+971", name: "UAE" },
    { flag: "🇸🇦", code: "+966", name: "Saudi Arabia" },
    { flag: "🇶🇦", code: "+974", name: "Qatar" },
    { flag: "🇿🇦", code: "+27", name: "South Africa" },
    { flag: "🇳🇬", code: "+234", name: "Nigeria" },
    { flag: "🇰🇪", code: "+254", name: "Kenya" },
    { flag: "🇳🇿", code: "+64", name: "New Zealand" },
    { flag: "🇵🇰", code: "+92", name: "Pakistan" },
    { flag: "🇧🇩", code: "+880", name: "Bangladesh" },
    { flag: "🇱🇰", code: "+94", name: "Sri Lanka" },
    { flag: "🇳🇵", code: "+977", name: "Nepal" },
    { flag: "🇵🇭", code: "+63", name: "Philippines" },
    { flag: "🇮🇩", code: "+62", name: "Indonesia" },
    { flag: "🇲🇾", code: "+60", name: "Malaysia" },
    { flag: "🇹🇭", code: "+66", name: "Thailand" },
    { flag: "🇻🇳", code: "+84", name: "Vietnam" },
    { flag: "🇷🇺", code: "+7", name: "Russia" },
    { flag: "🇹🇷", code: "+90", name: "Turkey" },
    { flag: "🇵🇱", code: "+48", name: "Poland" },
    { flag: "🇳🇱", code: "+31", name: "Netherlands" },
    { flag: "🇧🇪", code: "+32", name: "Belgium" },
    { flag: "🇸🇪", code: "+46", name: "Sweden" },
    { flag: "🇳🇴", code: "+47", name: "Norway" },
    { flag: "🇩🇰", code: "+45", name: "Denmark" },
    { flag: "🇨🇭", code: "+41", name: "Switzerland" },
    { flag: "🇦🇹", code: "+43", name: "Austria" },
    { flag: "🇵🇹", code: "+351", name: "Portugal" },
    { flag: "🇬🇷", code: "+30", name: "Greece" },
    { flag: "🇿🇦", code: "+27", name: "South Africa" },
    { flag: "🇦🇷", code: "+54", name: "Argentina" },
    { flag: "🇨🇴", code: "+57", name: "Colombia" },
    { flag: "🇨🇱", code: "+56", name: "Chile" },
    { flag: "🇵🇪", code: "+51", name: "Peru" },
    { flag: "🇪🇬", code: "+20", name: "Egypt" },
    { flag: "🇮🇱", code: "+972", name: "Israel" },
    { flag: "🇮🇶", code: "+964", name: "Iraq" },
    { flag: "🇮🇷", code: "+98", name: "Iran" },
]

/* Country selector component */
function CountrySelector({ value, onChange }) {
    const [open, setOpen] = useState(false)
    const [search, setSearch] = useState("")
    const ref = useClickOutside(() => { setOpen(false); setSearch("") })
    const selected = COUNTRIES.find(c => c.code === value) || COUNTRIES[0]
    const filtered = COUNTRIES.filter(c =>
        c.name.toLowerCase().includes(search.toLowerCase()) ||
        c.code.includes(search)
    )

    return (
        <div className="psCountryWrap" ref={ref}>
            <button type="button" className="psCountryBtn" onClick={() => setOpen(o => !o)}>
                <span>{selected.flag}</span>
                <span>{selected.code}</span>
                <ChevronDown size={11} color="#64748b" />
            </button>
            {open && (
                <div className="psCountryDropdown">
                    <div className="psCountrySearch">
                        <Search size={13} color="#94a3b8" />
                        <input
                            autoFocus
                            placeholder="Search country..."
                            value={search}
                            onChange={e => setSearch(e.target.value)}
                        />
                    </div>
                    <div className="psCountryList">
                        {filtered.map((c, idx) => (
                            <button
                                key={`${c.code}-${idx}`}
                                type="button"
                                className={`psCountryItem${c.code === value ? " selected" : ""}`}
                                onClick={() => { onChange(c.code); setOpen(false); setSearch("") }}
                            >
                                <span className="psCountryFlag">{c.flag}</span>
                                <span className="psCountryName">{c.name}</span>
                                <span className="psCountryCode">{c.code}</span>
                            </button>
                        ))}
                        {filtered.length === 0 && (
                            <div className="psCountryEmpty">No country found</div>
                        )}
                    </div>
                </div>
            )}
        </div>
    )
}

/* ─── Add Members Modal ─────────────────────────────────────────── */
function AddMembersModal({ onClose, onSave }) {
    const [tab, setTab] = useState("add")
    const [link] = useState(makeLink)
    const [copied, setCopied] = useState(false)
    const [rows, setRows] = useState([{ name: "", email: "", phone: "", dialCode: "+91" }])
    const [errs, setErrs] = useState([{}])

    function copy() {
        navigator.clipboard.writeText(link).catch(() => { })
        setCopied(true); setTimeout(() => setCopied(false), 2000)
    }
    function addRow() {
        setRows(p => [...p, { name: "", email: "", phone: "", dialCode: "+91", role: "employee" }])
        setErrs(p => [...p, {}])
    }
    function removeRow(i) {
        if (rows.length === 1) return // keep at least 1
        setRows(p => p.filter((_, j) => j !== i))
        setErrs(p => p.filter((_, j) => j !== i))
    }
    function update(i, k, v) {
        setRows(p => p.map((r, j) => j === i ? { ...r, [k]: v } : r))
    }
    function save() {
        const e = rows.map(r => {
            const noName = !r.name.trim()
            const noContact = !r.email.trim() && !r.phone.trim()
            return {
                name: noName ? "Name is required" : "",
                contact: noContact ? "Email or phone number is required" : ""
            }
        })
        setErrs(e)
        if (e.every(x => !x.name && !x.contact)) {
            onSave(rows)
            onClose()
        }
    }

    return (
        <div className="psModalOverlay" onClick={e => e.target === e.currentTarget && onClose()}>
            <div className="psModal">
                <div className="psModalHeader">
                    <h2 className="psModalTitle">Add Members</h2>
                    <button className="psModalClose" onClick={onClose}><X size={18} /></button>
                </div>
                <div className="psModalBanner">
                    We recommend letting employees create their own profile so they can{" "}
                    <span className="psHighlight">clock in</span> from their own devices and view their{" "}
                    <span className="psHighlight">timesheets</span>. Send them an{" "}
                    <span className="psHighlight">invite</span> to get started.
                </div>
                <div className="psModalTabs">
                    <button className={`psModalTab${tab === "link" ? " active" : ""}`} onClick={() => setTab("link")}>Invite by link</button>
                    <button className={`psModalTab${tab === "add" ? " active" : ""}`} onClick={() => setTab("add")}>Add member</button>
                </div>
                <div className="psModalBody">
                    {tab === "link" ? (
                        <div>
                            <p className="psInviteInfo">
                                Share this link with team members to invite them to your organization. Visit our{" "}
                                <a href="#" className="psHighlight">help article <ExternalLink size={11} style={{ display: "inline" }} /></a>{" "}
                                to about signing up via invitation link.
                            </p>
                            <hr className="psDivider" />
                            <div className="psLinkRow">
                                <input className="psLinkInput" readOnly value={link} />
                                <button className="psCopyBtn" onClick={copy}>
                                    {copied ? <><Check size={14} /> Copied</> : <><Copy size={14} /> Copy</>}
                                </button>
                            </div>
                            <button className="psGenLink"><RefreshCw size={13} /> Generate new link</button>
                        </div>
                    ) : (
                        <div>
                            <p className="psInviteInfo">
                                Sending invites enable team members to{" "}
                                <span className="psHighlight">login to CalTrack</span> on their own devices to track{" "}
                                <span className="psHighlight">time</span>. They can{" "}
                                <span className="psHighlight">clock in</span> via Kiosk without an invite.
                            </p>
                            <hr className="psDivider" />

                            {rows.map((r, i) => (
                                <div key={i} className="psMemberRowWrap">
                                    <div className="psMemberRow">
                                        {/* Name */}
                                        <div className="psMemberField">
                                            <input
                                                className={`psMemberInput${errs[i]?.name ? " error" : ""}`}
                                                placeholder="Full name *"
                                                value={r.name}
                                                onChange={e => update(i, "name", e.target.value)}
                                            />
                                            {errs[i]?.name && <span className="psFieldError">{errs[i].name}</span>}
                                        </div>

                                        {/* Email */}
                                        <div className="psMemberField">
                                            <input
                                                className={`psMemberInput${errs[i]?.contact ? " error" : ""}`}
                                                type="email"
                                                placeholder="Email"
                                                value={r.email}
                                                onChange={e => update(i, "email", e.target.value)}
                                            />
                                        </div>

                                        {/* Phone */}
                                        <div className="psMemberField">
                                            <div className={`psPhoneInputGroup${errs[i]?.contact ? " error" : ""}`}>
                                                <CountrySelector
                                                    value={r.dialCode}
                                                    onChange={v => update(i, "dialCode", v)}
                                                />
                                                <input
                                                    className="psPhoneInput"
                                                    type="tel"
                                                    placeholder="Phone number"
                                                    value={r.phone}
                                                    onChange={e => update(i, "phone", e.target.value)}
                                                />
                                            </div>
                                            {errs[i]?.contact && <span className="psFieldError">{errs[i].contact}</span>}
                                        </div>

                                        {/* Role Select */}
                                        <div className="psMemberField" style={{ maxWidth: 120 }}>
                                            <select
                                                className="psMemberInput"
                                                value={r.role}
                                                onChange={e => update(i, "role", e.target.value)}
                                            >
                                                <option value="employee">Employee</option>
                                                <option value="admin">Admin</option>
                                                <option value="manager">Manager</option>
                                            </select>
                                        </div>

                                        {/* Delete row button */}
                                        <button
                                            type="button"
                                            className="psDeleteRowBtn"
                                            title="Remove this row"
                                            onClick={() => removeRow(i)}
                                            disabled={rows.length === 1}
                                        >
                                            <X size={15} />
                                        </button>
                                    </div>
                                </div>
                            ))}

                            <button type="button" className="psAddRowBtn" onClick={addRow}>
                                <Plus size={14} /> Add new member
                            </button>
                        </div>
                    )}
                </div>
                <div className="psModalFooter">
                    <button className="psCancelBtn" onClick={onClose}>Cancel</button>
                    <button className="psSaveBtn" onClick={save}>Save</button>
                </div>
            </div>
        </div>
    )
}

/* ─── Edit Member Modal ────────────────────────────────────────── */
function EditMemberModal({ member, onClose, onSave }) {
    const [name, setName] = useState(member.user?.first_name ? `${member.user.first_name} ${member.user.last_name}` : member.name || "")
    const [email, setEmail] = useState(member.user?.email || member.email || "")
    const [phone, setPhone] = useState(member.phone || "")
    const [dialCode, setDialCode] = useState("+91")
    const [role, setRole] = useState(member.user?.role || "employee")
    const [err, setErr] = useState({})

    function save() {
        if (!name.trim()) return setErr({ name: "Name is required" })
        onSave({ id: member.id, name, email, phone, role })
        onClose()
    }

    return (
        <div className="psModalOverlay" onClick={e => e.target === e.currentTarget && onClose()}>
            <div className="psModal" style={{ maxWidth: 500, width: "100%" }}>
                <div className="psModalHeader">
                    <h2 className="psModalTitle">Edit Member</h2>
                    <button className="psModalClose" onClick={onClose}><X size={18} /></button>
                </div>
                <div className="psModalBody">
                    <div className="psMemberField" style={{ marginBottom: 16 }}>
                        <label className="psFieldLabel">Full Name</label>
                        <input
                            className={`psMemberInput${err.name ? " error" : ""}`}
                            placeholder="Full name *"
                            value={name}
                            onChange={e => setName(e.target.value)}
                        />
                        {err.name && <span className="psFieldError">{err.name}</span>}
                    </div>

                    <div className="psMemberField" style={{ marginBottom: 16 }}>
                        <label className="psFieldLabel">Email Address</label>
                        <input
                            className="psMemberInput"
                            type="email"
                            placeholder="Email"
                            value={email}
                            onChange={e => setEmail(e.target.value)}
                        />
                    </div>

                    <div className="psMemberField">
                        <label className="psFieldLabel">Phone Number</label>
                        <div className="psPhoneInputGroup">
                            <CountrySelector value={dialCode} onChange={setDialCode} />
                            <input
                                className="psPhoneInput"
                                type="tel"
                                placeholder="Phone number"
                                value={phone}
                                onChange={e => setPhone(e.target.value)}
                            />
                        </div>
                    </div>

                    <div className="psMemberField" style={{ marginTop: 16 }}>
                        <label className="psFieldLabel">Access Role</label>
                        <select
                            className="psMemberInput"
                            value={role}
                            onChange={e => setRole(e.target.value)}
                        >
                            <option value="employee">Employee</option>
                            <option value="admin">Admin</option>
                            <option value="manager">Manager</option>
                        </select>
                        <p className="psFieldHint">Determines what this member can see and do in the system.</p>
                    </div>
                </div>
                <div className="psModalFooter">
                    <button className="psCancelBtn" onClick={onClose}>Cancel</button>
                    <button className="psSaveBtn" onClick={save}>Update Member</button>
                </div>
            </div>
        </div>
    )
}

function EditQueueItemModal({ item, onClose, onSave }) {
    const [name, setName] = useState(item?.name || "")
    const [email, setEmail] = useState(item?.email || "")
    const [phone, setPhone] = useState(item?.phone || "")
    const [dialCode, setDialCode] = useState(item?.dialCode || "+91")
    const [role, setRole] = useState(item?.role || "employee")
    const [err, setErr] = useState({})

    function save() {
        if (!name.trim()) return setErr({ name: "Name is required" })
        onSave({ ...item, name, email, phone, dialCode, role })
        onClose()
    }

    return (
        <div className="psModalOverlay" onClick={e => e.target === e.currentTarget && onClose()}>
            <div className="psModal" style={{ maxWidth: 500, width: "100%" }}>
                <div className="psModalHeader">
                    <h2 className="psModalTitle">Edit Queue Member</h2>
                    <button className="psModalClose" onClick={onClose}><X size={18} /></button>
                </div>
                <div className="psModalBody">
                    <div className="psMemberField" style={{ marginBottom: 16 }}>
                        <label className="psFieldLabel">Full Name</label>
                        <input
                            className={`psMemberInput${err.name ? " error" : ""}`}
                            placeholder="Full name *"
                            value={name}
                            onChange={e => setName(e.target.value)}
                        />
                        {err.name && <span className="psFieldError">{err.name}</span>}
                    </div>

                    <div className="psMemberField" style={{ marginBottom: 16 }}>
                        <label className="psFieldLabel">Email Address</label>
                        <input
                            className="psMemberInput"
                            type="email"
                            placeholder="Email"
                            value={email}
                            onChange={e => setEmail(e.target.value)}
                        />
                    </div>

                    <div className="psMemberField">
                        <label className="psFieldLabel">Phone Number</label>
                        <div className="psPhoneInputGroup">
                            <CountrySelector value={dialCode} onChange={setDialCode} />
                            <input
                                className="psPhoneInput"
                                type="tel"
                                placeholder="Phone number"
                                value={phone}
                                onChange={e => setPhone(e.target.value)}
                            />
                        </div>
                    </div>

                    <div className="psMemberField" style={{ marginTop: 16 }}>
                        <label className="psFieldLabel">Access Role</label>
                        <select
                            className="psMemberInput"
                            value={role}
                            onChange={e => setRole(e.target.value)}
                        >
                            <option value="employee">Employee</option>
                            <option value="admin">Admin</option>
                            <option value="manager">Manager</option>
                        </select>
                    </div>
                </div>
                <div className="psModalFooter">
                    <button className="psCancelBtn" onClick={onClose}>Cancel</button>
                    <button className="psSaveBtn" onClick={save}>Save</button>
                </div>
            </div>
        </div>
    )
}

/* ─── Main page ─────────────────────────────────────────────────── */
const ROLES = ["Owner", "Admin", "Manager", "Employee", "Kiosk"]
const GROUPS = ["No group", "Engineering", "HR", "Marketing", "Operations"]

export function PeopleSettingsPage() {
    const [pageTab, setPageTab] = useState("members")
    const [search, setSearch] = useState("")
    const [selRoles, setSelRoles] = useState([])
    const [selGroups, setSelGroups] = useState([])
    const [activeFilters, setActiveFilters] = useState(DEFAULT_FILTERS)
    const [visibleCols, setVisibleCols] = useState(DEFAULT_COLS)
    const [showModal, setShowModal] = useState(false)
    const [showEditModal, setShowEditModal] = useState(false)
    const [editingMember, setEditingMember] = useState(null)
    const [showQueueEditModal, setShowQueueEditModal] = useState(false)
    const [editingQueueItem, setEditingQueueItem] = useState(null)
    const [members, setMembers] = useState([])
    const [queue, setQueue] = useState([])
    const [loading, setLoading] = useState(false)
    const queueRef = useRef([])
    const cancelledQueueIdsRef = useRef(new Set())
    const processingQueueIdsRef = useRef(new Set())

    function setQueueSafe(updater) {
        setQueue(prev => {
            const next = typeof updater === "function" ? updater(prev) : updater
            queueRef.current = next
            return next
        })
    }

    useEffect(() => {
        fetchMembers()
    }, [])

    const fetchMembers = async () => {
        try {
            const data = await apiRequest("/employees/")
            setMembers(Array.isArray(data) ? data : data.results || [])
        } catch (err) {
            console.error("Failed to fetch members:", err)
        }
    }

    const handleAddMembers = async (newRows) => {
        setLoading(true)
        const newQueueItems = newRows.map((r, i) => {
            const id = `temp-${Date.now()}-${i}`
            const dialCode = r.dialCode || "+91"
            const phone = r.phone || ""
            return {
                id,
                name: r.name,
                email: r.email || "",
                dialCode,
                phone,
                role: r.role || "employee",
                status: "queued",
                statusText: "Queued"
            }
        })

        setQueueSafe(prev => [...prev, ...newQueueItems])
        for (const q of newQueueItems) await processQueueItem(q.id)
        setLoading(false)
    }

    async function processQueueItem(id) {
        if (processingQueueIdsRef.current.has(id)) return
        const item = queueRef.current.find(q => q.id === id)
        if (!item) return
        if (cancelledQueueIdsRef.current.has(id)) return

        processingQueueIdsRef.current.add(id)
        setQueueSafe(prev => prev.map(q => q.id === id ? { ...q, status: "processing", statusText: "Processing" } : q))

        try {
            const latest = queueRef.current.find(q => q.id === id)
            if (!latest) return

            const [firstNameRaw, ...lastNameParts] = (latest.name || "").trim().split(" ")
            const firstName = firstNameRaw || ""
            const lastName = lastNameParts.join(" ") || ""
            const payload = {
                username: latest.email || `user_${Math.random().toString(36).slice(2, 7)}`,
                password: "TemporaryPassword123!",
                email: latest.email || "",
                first_name: firstName,
                last_name: lastName,
                role: latest.role || "employee",
                phone: latest.phone ? `${latest.dialCode || ""} ${latest.phone}`.trim() : "",
                is_active: true
            }

            await apiRequest("/employees/", { method: "POST", json: payload })
            if (cancelledQueueIdsRef.current.has(id)) return
            setQueueSafe(prev => prev.filter(q => q.id !== id))
            fetchMembers()
        } catch (err) {
            if (cancelledQueueIdsRef.current.has(id)) return
            const errorMsg = err?.body?.detail ||
                (typeof err?.body === "object" ? Object.values(err.body)[0] : null) ||
                err?.message || "Error"
            setQueueSafe(prev => prev.map(q => q.id === id ? { ...q, status: "error", statusText: String(errorMsg) } : q))
        } finally {
            processingQueueIdsRef.current.delete(id)
        }
    }

    const handleEditClick = (id) => {
        const m = members.find(m => m.id === id)
        if (m) {
            setEditingMember(m)
            setShowEditModal(true)
        }
    }

    const handleSaveEdit = async (data) => {
        setLoading(true)
        try {
            const [firstName, ...lastNameParts] = data.name.split(" ")
            const lastName = lastNameParts.join(" ") || "—"

            const payload = {
                username: data.email || editingMember.user?.username,
                email: data.email,
                first_name: firstName,
                last_name: lastName,
                phone: data.phone,
                role: data.role
            }

            await apiRequest(`/employees/${data.id}/`, {
                method: "PATCH",
                json: payload
            })

            fetchMembers()
        } catch (err) {
            console.error("Failed to update member:", err)
            alert("Failed to update member details.")
        }
        setLoading(false)
    }

    const handleQueueEditClick = (q) => {
        setEditingQueueItem(q)
        setShowQueueEditModal(true)
    }

    const handleSaveQueueEdit = async (data) => {
        setQueueSafe(prev => prev.map(q => q.id === data.id ? {
            ...q,
            name: data.name,
            email: data.email || "",
            dialCode: data.dialCode || "+91",
            phone: data.phone || "",
            role: data.role || "employee",
            status: processingQueueIdsRef.current.has(data.id) ? "processing" : "queued",
            statusText: processingQueueIdsRef.current.has(data.id) ? "Processing" : "Queued"
        } : q))

        if (!processingQueueIdsRef.current.has(data.id)) await processQueueItem(data.id)
    }

    const handleQueueDeleteClick = (q) => {
        const msg = q.status === "processing"
            ? "Cancel processing and remove this member from the queue?"
            : "Remove this member from the queue?"
        if (!window.confirm(msg)) return
        cancelledQueueIdsRef.current.add(q.id)
        setQueueSafe(prev => prev.filter(x => x.id !== q.id))
    }

    const filtered = members.filter(m => {
        const mName = m.user?.first_name ? `${m.user.first_name} ${m.user.last_name}` : m.name || ""
        const mEmail = m.user?.email || m.email || ""
        const s = search.toLowerCase()
        const matchS = !s || mName.toLowerCase().includes(s) || mEmail.toLowerCase().includes(s)
        const matchR = selRoles.length === 0 || selRoles.includes(m.user?.role || m.role)
        const matchG = selGroups.length === 0 || selGroups.includes(m.group) || selGroups.includes("No group")
        return matchS && matchR && matchG
    })

    // Map col name → data key
    const colKey = {
        Email: "email",
        Group: "group",
        "Last active": "lastActive",
        "Join date": "created_at",
        "Work schedule": "work_schedule",
        "Holiday calendar": "holiday_calendar",
        "Phone Number": "phone",
        "Member code": "employee_id",
        Position: "title",
        "Employment type": "employment_type",
        Kiosks: "kiosks"
    }

    return (
        <div className="settingsSubpage">
            <header className="pageHeader">
                <h1 className="pageTitle">Members</h1>
            </header>

            <div className="tabNav">
                <button className={`tabBtn${pageTab === "members" ? " active" : ""}`} onClick={() => setPageTab("members")}>Members</button>
                <button className={`tabBtn${pageTab === "groups" ? " active" : ""}`} onClick={() => setPageTab("groups")}>Groups</button>
                <button className={`tabBtn${pageTab === "queue" ? " active" : ""}`} onClick={() => setPageTab("queue")}>
                    Queue
                    {queue.length > 0 && <span className="psTabBadge">{queue.length}</span>}
                </button>
            </div>

            <div className="tabContent">
                {pageTab === "members" ? (
                    <div className="membersView">
                        {/* ── Action bar ── */}
                        <div className="actionBar">
                            <div className="actionLeft" style={{ flexWrap: "wrap", gap: 8 }}>
                                {/* Search */}
                                <div className="searchWrap">
                                    <Search size={16} />
                                    <input
                                        placeholder="Search members..."
                                        value={search}
                                        onChange={e => setSearch(e.target.value)}
                                    />
                                    {search && <button className="psClearSearch" onClick={() => setSearch("")}><X size={13} /></button>}
                                </div>

                                {/* Roles + Groups always shown; extra filters from activeFilters */}
                                <FilterDropdown label="Roles" options={ROLES} selected={selRoles} onChange={setSelRoles} />
                                <FilterDropdown label="Groups" options={GROUPS} selected={selGroups} onChange={setSelGroups} />

                                {/* Extra active filters from Add filter panel */}
                                {activeFilters
                                    .filter(f => f !== "Roles" && f !== "Groups")
                                    .map(f => (
                                        <button key={f} className="psExtraTag">
                                            {f} <X size={11} onClick={() => setActiveFilters(p => p.filter(x => x !== f))} />
                                        </button>
                                    ))}

                                <AddFilterDropdown activeFilters={activeFilters} onChange={setActiveFilters} />
                            </div>

                            <button className="primaryBtn" onClick={() => setShowModal(true)}>
                                <Plus size={15} /> Add Members
                            </button>
                        </div>

                        {/* ── Table ── */}
                        <div className="tableWrap">
                            <table className="membersTable">
                                <thead>
                                    <tr>
                                        <th width="40"><input type="checkbox" /></th>
                                        <th>{filtered.length} member{filtered.length !== 1 ? "s" : ""}</th>
                                        {visibleCols.map(c => <th key={c}>{c}</th>)}
                                        {/* Column toggle in last header cell */}
                                        <th width="52" style={{ textAlign: "right" }}>
                                            <ColumnToggle visibleCols={visibleCols} onChange={setVisibleCols} />
                                        </th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {filtered.length === 0 ? (
                                        <tr>
                                            <td colSpan={3 + visibleCols.length} className="psEmptyCell">
                                                No members match your filters.
                                            </td>
                                        </tr>
                                    ) : filtered.map(m => (
                                        <tr key={m.id}>
                                            <td><input type="checkbox" /></td>
                                            <td>
                                                <div className="userNameWrap">
                                                    <div className="userAvatar">{(m.user?.first_name?.charAt(0) || m.name?.charAt(0) || "?").toUpperCase()}</div>
                                                    <div className="userInfo">
                                                        <span className="userName">{m.user?.first_name ? `${m.user.first_name} ${m.user.last_name}` : m.name}</span>
                                                        <span className="userRole">{m.user?.role || m.role}</span>
                                                    </div>
                                                </div>
                                            </td>
                                            {visibleCols.map(c => {
                                                const val = m[colKey[c]] ?? m.user?.[colKey[c]?.toLowerCase()] ?? "—"
                                                return <td key={c}>{val}</td>
                                            })}
                                            <td style={{ textAlign: "right" }}>
                                                <RowMenu memberId={m.id} onEdit={handleEditClick} />
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>
                ) : pageTab === "queue" ? (
                    <div className="queueView">
                        <div className="queueHeader">
                            <h2 className="sectionTitle">Pending Members ({queue.length})</h2>
                            <p className="sectionDesc">These members are currently being processed or waiting for backend storage.</p>
                        </div>
                        <div className="tableWrap">
                            <table className="membersTable">
                                <thead>
                                    <tr>
                                        <th>Name</th>
                                        <th>Email</th>
                                        <th>Phone</th>
                                        <th>Status</th>
                                        <th style={{ textAlign: "right" }}>Action</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {queue.length === 0 ? (
                                        <tr>
                                            <td colSpan={5} className="psEmptyCell">
                                                No members in the queue.
                                            </td>
                                        </tr>
                                    ) : (
                                        queue.map(q => (
                                            <tr key={q.id}>
                                                <td>{q.name}</td>
                                                <td>{q.email}</td>
                                                <td>{q.phone ? `${q.dialCode || ""} ${q.phone}`.trim() : "—"}</td>
                                                <td>
                                                    <span className={`statusBadge ${q.status}`}>
                                                        {q.statusText || "—"}
                                                    </span>
                                                </td>
                                                <td style={{ textAlign: "right" }}>
                                                    <div style={{ display: "inline-flex", gap: 8 }}>
                                                        <button
                                                            className="psActionBtn edit"
                                                            onClick={() => handleQueueEditClick(q)}
                                                            title="Edit"
                                                            disabled={q.status === "processing"}
                                                        >
                                                            <Edit3 size={14} />
                                                        </button>
                                                        <button
                                                            className="psActionBtn delete"
                                                            onClick={() => handleQueueDeleteClick(q)}
                                                            title="Delete"
                                                        >
                                                            <Trash2 size={14} />
                                                        </button>
                                                    </div>
                                                </td>
                                            </tr>
                                        ))
                                    )}
                                </tbody>
                            </table>
                        </div>
                    </div>
                ) : (
                    <div className="premiumPlaceholder">
                        <div className="premiumBadge">PREMIUM</div>
                        <h2 className="premiumTitle">Groups are a Premium feature</h2>
                        <p className="premiumSub">
                            Organize your team efficiently with custom groups. Assign members and manage the group with custom activities and tailored time tracking settings.
                        </p>
                        <div className="premiumGraphicWrap">
                            <img src="https://img.freepik.com/free-vector/modern-team-working-together-flat-design_23-2148243013.jpg" alt="Premium" className="premiumIllu" />
                        </div>
                        <button className="upgradeBtn">See upgrade options</button>
                    </div>
                )}
            </div>

            {showModal && <AddMembersModal onClose={() => setShowModal(false)} onSave={handleAddMembers} />}
            {showEditModal && editingMember && (
                <EditMemberModal
                    member={editingMember}
                    onClose={() => setShowEditModal(false)}
                    onSave={handleSaveEdit}
                />
            )}
            {showQueueEditModal && editingQueueItem && (
                <EditQueueItemModal
                    item={editingQueueItem}
                    onClose={() => setShowQueueEditModal(false)}
                    onSave={handleSaveQueueEdit}
                />
            )}
        </div>
    )
}
