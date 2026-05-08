import React, { useState, useEffect, useCallback, useRef, useMemo } from "react"
import { MapContainer, TileLayer, Marker, Popup, Circle, Polygon, useMap } from "react-leaflet"
import { Search, MapPin, X, ChevronDown, Info, Archive, Layers, UserCheck, Map, Activity, Loader2, Plus, Globe, Navigation2, Target, Save, Building2 } from "lucide-react"
import L from "leaflet"
import "leaflet/dist/leaflet.css"

import { apiRequest, unwrapResults } from "../../api/client.js"
import { Pill, Button, Card, Input, Select, TextArea } from "../components/kit.jsx"
import { ZonesPanel } from "./locations/ZonesPanel.jsx"
import { AssignmentsPanel } from "./locations/AssignmentsPanel.jsx"
import { MapOverview } from "./locations/MapOverview.jsx"
import { GeofenceEditorModal } from "./locations/GeofenceEditorModal.jsx"

/* ── Fix default Leaflet icons ────────────────────────────────── */
delete L.Icon.Default.prototype._getIconUrl
L.Icon.Default.mergeOptions({
  iconRetinaUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
  iconUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
  shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
})

/* ── Orange pin icon for selected search result ───────────────── */
const createOrangePin = () =>
  L.divIcon({
    className: "custom-orange-pin",
    html: `<div style="
      width: 32px; height: 32px;
      background: #F97316;
      border: 3px solid white;
      border-radius: 50% 50% 50% 0;
      transform: rotate(-45deg);
      box-shadow: 0 3px 12px rgba(249,115,22,0.5);
      display: flex; align-items: center; justify-content: center;
    ">
      <div style="
        width: 10px; height: 10px;
        background: white;
        border-radius: 50%;
        transform: rotate(45deg);
      "></div>
    </div>`,
    iconSize: [32, 32],
    iconAnchor: [16, 32],
    popupAnchor: [0, -32],
  })

/* ── Saved location icon (indigo) ─────────────────────────────── */
const createSavedPin = () =>
  L.divIcon({
    className: "saved-loc-pin",
    html: `<div style="
      width: 28px; height: 28px;
      background: #4F46E5;
      color: white;
      border: 2px solid white;
      border-radius: 6px;
      box-shadow: 0 2px 6px rgba(0,0,0,0.3);
      display: flex; align-items: center; justify-content: center;
    ">
      <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z"/><circle cx="12" cy="10" r="3"/></svg>
    </div>`,
    iconSize: [28, 28],
    iconAnchor: [14, 14],
    popupAnchor: [0, -14],
  })

/* ── Map recenter helper ─────────────────────────────────────── */
function MapUpdater({ center, zoom }) {
  const map = useMap()
  useEffect(() => {
    if (center) map.setView(center, zoom || 14, { animate: true })
  }, [center, zoom, map])
  return null
}

/* ── Debounce utility ────────────────────────────────────────── */
function useDebouncedValue(value, delay = 400) {
  const [debounced, setDebounced] = useState(value)
  useEffect(() => {
    const h = setTimeout(() => setDebounced(value), delay)
    return () => clearTimeout(h)
  }, [value, delay])
  return debounced
}

/* ═══════════════════════════════════════════════════════════════
   LOCATIONS PAGE — Search + Map + Add Location
   ═══════════════════════════════════════════════════════════════ */
export function LocationsPage() {
  /* ── Search state ──────────────────────────────────────────── */
  const [searchQuery, setSearchQuery] = useState("")
  const [searchResults, setSearchResults] = useState([])
  const [searching, setSearching] = useState(false)
  const [showDropdown, setShowDropdown] = useState(false)
  const searchRef = useRef(null)

  /* ── Selected place ────────────────────────────────────────── */
  const [selectedPlace, setSelectedPlace] = useState(null)

  /* ── Add Location panel ────────────────────────────────────── */
  const [showAddPanel, setShowAddPanel] = useState(false)
  const [formData, setFormData] = useState({
    name: "",
    coordinates: "",
    address: "",
    radius: 300,
  })
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState("")

  /* ── Saved locations from DB ───────────────────────────────── */
  const [savedLocations, setSavedLocations] = useState([])
  const [loadingSaved, setLoadingSaved] = useState(true)

  /* ── Phase 4: polygon-draw modal ──────────────────────────── */
  const [editingGeofenceFor, setEditingGeofenceFor] = useState(null)

  /* When the modal saves, splice the updated location back into our list. */
  const handleGeofenceSaved = (updated) => {
    if (!updated?.id) return
    setSavedLocations((prev) => prev.map((l) => (l.id === updated.id ? { ...l, ...updated } : l)))
  }

  /* ── View toggle ───────────────────────────────────────────── */
  const [viewMode, setViewMode] = useState("map")

  /* ── Active tab ────────────────────────────────────────────── */
  const [activeTab, setActiveTab] = useState("map") // "map" | "zones" | "assignments"

  /* ── Map state ─────────────────────────────────────────────── */
  const defaultCenter = [12.9716, 80.0414]
  const [mapCenter, setMapCenter] = useState(defaultCenter)
  const [mapZoom, setMapZoom] = useState(5)

  /* ── Radius ────────────────────────────────────────────────── */
  const [customRadius, setCustomRadius] = useState(false)
  const [customRadiusValue, setCustomRadiusValue] = useState("")

  const radiusOptions = [
    { value: 300, label: "300 Meters", recommended: true },
    { value: 400, label: "400 Meters" },
    { value: 500, label: "500 Meters" },
    { value: 1000, label: "1000 Meters" },
  ]

  /* ── Radius Filter state ─────────────────────────────────────── */
  const radiusFilterOptions = [
    { id: "0-300", label: "0-300 meters", min: 0, max: 300 },
    { id: "300-400", label: "300-400 meters", min: 300.01, max: 400 },
    { id: "400-500", label: "400-500 meters", min: 400.01, max: 500 },
    { id: "500-1000", label: "500-1000 meters", min: 500.01, max: 1000 },
    { id: "1000+", label: "1000+ meters", min: 1000.01, max: 999999 },
  ]
  const [selectedRadiusFilters, setSelectedRadiusFilters] = useState([])
  const [showRadiusDropdown, setShowRadiusDropdown] = useState(false)
  const radiusRef = useRef(null)

  const toggleRadiusFilter = (filter) => {
    setSelectedRadiusFilters((prev) => {
      const isSelected = prev.some((f) => f.id === filter.id)
      if (isSelected) return prev.filter((f) => f.id !== filter.id)
      return [...prev, filter]
    })
  }

  const clearRadiusFilters = () => setSelectedRadiusFilters([])

  const radiusFilterLabel = useMemo(() => {
    if (selectedRadiusFilters.length === 0) return "Radius"
    if (selectedRadiusFilters.length === 1) return `Radius: ${selectedRadiusFilters[0].label}`
    return `Radius: ${selectedRadiusFilters.length} selected`
  }, [selectedRadiusFilters])

  const filteredLocations = useMemo(() => {
    if (selectedRadiusFilters.length === 0) return savedLocations
    return savedLocations.filter((loc) => {
      const r = loc.geofence_radius || 0
      return selectedRadiusFilters.some((f) => r >= f.min && r <= f.max)
    })
  }, [savedLocations, selectedRadiusFilters])

  /* ── Load saved locations on mount ─────────────────────────── */
  useEffect(() => {
    loadSavedLocations()
  }, [])

  const loadSavedLocations = async () => {
    setLoadingSaved(true)
    try {
      const res = await apiRequest("/time/locations/")
      const all = unwrapResults(res) || []
      // Split into active and archived if the field exists, otherwise assume all are active
      setSavedLocations(all.filter(l => !l.is_archived))
      setArchivedLocations(all.filter(l => l.is_archived))
    } catch {
      setSavedLocations([])
      setArchivedLocations([])
    } finally {
      setLoadingSaved(false)
    }
  }

  /* ── Archive / Restore logic ────────────────────────────────── */
  const [archivedLocations, setArchivedLocations] = useState([])

  const handleArchive = async (id) => {
    try {
      await apiRequest(`/time/locations/${id}/`, {
        method: "PATCH",
        json: { is_archived: true }
      })
      const loc = savedLocations.find(l => l.id === id)
      if (loc) {
        setSavedLocations(prev => prev.filter(l => l.id !== id))
        setArchivedLocations(prev => [{ ...loc, is_archived: true }, ...prev])
      }
    } catch {
      alert("Failed to archive location.")
    }
  }

  const handleRestore = async (id) => {
    try {
      await apiRequest(`/time/locations/${id}/`, {
        method: "PATCH",
        json: { is_archived: false }
      })
      const loc = archivedLocations.find(l => l.id === id)
      if (loc) {
        setArchivedLocations(prev => prev.filter(l => l.id !== id))
        setSavedLocations(prev => [{ ...loc, is_archived: false }, ...prev])
      }
    } catch {
      alert("Failed to restore location.")
    }
  }

  /* ── Google Maps API key ────────────────────────────────────── */
  const GOOGLE_API_KEY = import.meta.env.VITE_GOOGLE_MAPS_API_KEY ?? ""

  /* ── Load Google Maps JS SDK (once) ────────────────────────── */
  const autocompleteService = useRef(null)
  const placesService = useRef(null)
  const dummyDiv = useRef(null)

  useEffect(() => {
    if (!GOOGLE_API_KEY) return
    // If already loaded
    if (window.google?.maps?.places) {
      autocompleteService.current = new window.google.maps.places.AutocompleteService()
      if (!dummyDiv.current) dummyDiv.current = document.createElement("div")
      placesService.current = new window.google.maps.places.PlacesService(dummyDiv.current)
      return
    }
    // Load script
    const script = document.createElement("script")
    script.src = `https://maps.googleapis.com/maps/api/js?key=${GOOGLE_API_KEY}&libraries=places&language=en`
    script.async = true
    script.defer = true
    script.onload = () => {
      autocompleteService.current = new window.google.maps.places.AutocompleteService()
      if (!dummyDiv.current) dummyDiv.current = document.createElement("div")
      placesService.current = new window.google.maps.places.PlacesService(dummyDiv.current)
    }
    document.head.appendChild(script)
    return () => {
      // Don't remove — other components might need it
    }
  }, [GOOGLE_API_KEY])

  /* ── Google Places Autocomplete search (debounced) ─────────── */
  const debouncedQuery = useDebouncedValue(searchQuery, 300)

  useEffect(() => {
    if (debouncedQuery.trim().length < 2) {
      setSearchResults([])
      return
    }

    /* ── If Google Places is available, use it ─────────────────── */
    if (autocompleteService.current) {
      setSearching(true)
      autocompleteService.current.getPlacePredictions(
        {
          input: debouncedQuery,
          types: [],  // all types — worldwide precise results
        },
        (predictions, status) => {
          setSearching(false)
          if (status !== window.google.maps.places.PlacesServiceStatus.OK || !predictions) {
            setSearchResults([])
            return
          }
          setSearchResults(
            predictions.map((p) => ({
              id: p.place_id,
              placeId: p.place_id,
              name: p.structured_formatting?.main_text || p.description.split(",")[0],
              secondaryText: p.structured_formatting?.secondary_text || p.description.split(",").slice(1).join(",").trim(),
              fullAddress: p.description,
              // lat/lng not yet available — fetched on selection via getDetails
              lat: null,
              lng: null,
              types: p.types,
            }))
          )
          setShowDropdown(true)
        }
      )
      return
    }

    /* ── Fallback: Nominatim if no Google key ──────────────────── */
    let cancelled = false
    setSearching(true)
    fetch(
      `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(
        debouncedQuery
      )}&format=json&limit=8&addressdetails=1`,
      { headers: { "Accept-Language": "en" } }
    )
      .then((r) => r.json())
      .then((data) => {
        if (cancelled) return
        setSearchResults(
          data.map((d) => ({
            id: d.place_id,
            placeId: null,
            name: d.display_name.split(",")[0],
            secondaryText: d.display_name.split(",").slice(1).join(",").trim(),
            fullAddress: d.display_name,
            lat: parseFloat(d.lat),
            lng: parseFloat(d.lon),
            type: d.type,
          }))
        )
        setShowDropdown(true)
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setSearching(false)
      })
    return () => { cancelled = true }
  }, [debouncedQuery])


  /* ── Close dropdowns on outside click ───────────────────────── */
  useEffect(() => {
    const handler = (e) => {
      if (searchRef.current && !searchRef.current.contains(e.target)) {
        setShowDropdown(false)
      }
      if (radiusRef.current && !radiusRef.current.contains(e.target)) {
        setShowRadiusDropdown(false)
      }
    }
    document.addEventListener("mousedown", handler)
    return () => document.removeEventListener("mousedown", handler)
  }, [])

  /* ── Select a search result ────────────────────────────────── */
  const handleSelectPlace = (place) => {
    setSearchQuery(place.name)
    setShowDropdown(false)
    setShowAddPanel(false)

    /* Google prediction — needs getDetails() for lat/lng */
    if (place.placeId && placesService.current) {
      placesService.current.getDetails(
        {
          placeId: place.placeId,
          fields: ["geometry", "formatted_address", "name"],
        },
        (result, status) => {
          if (status === window.google.maps.places.PlacesServiceStatus.OK && result?.geometry?.location) {
            const lat = result.geometry.location.lat()
            const lng = result.geometry.location.lng()
            const resolved = {
              ...place,
              lat,
              lng,
              fullAddress: result.formatted_address || place.fullAddress,
              name: result.name || place.name,
            }
            setSelectedPlace(resolved)
            setMapCenter([lat, lng])
            setMapZoom(16)
          }
        }
      )
      return
    }

    /* Nominatim result — already has lat/lng */
    if (place.lat && place.lng) {
      setSelectedPlace(place)
      setMapCenter([place.lat, place.lng])
      setMapZoom(15)
    }
  }

  /* ── Open add panel ────────────────────────────────────────── */
  const handleOpenAddPanel = () => {
    if (!selectedPlace) return
    setFormData({
      name: selectedPlace.name,
      coordinates: `${selectedPlace.lat},${selectedPlace.lng}`,
      address: selectedPlace.fullAddress,
      radius: 300,
    })
    setSaveError("")
    setCustomRadius(false)
    setCustomRadiusValue("")
    setShowAddPanel(true)
  }

  /* ── Save location to DB ───────────────────────────────────── */
  const handleSave = async () => {
    if (!formData.name.trim()) {
      setSaveError("Location name is required.")
      return
    }
    setSaving(true)
    setSaveError("")
    try {
      const [lat, lng] = formData.coordinates.split(",").map((s) => parseFloat(s.trim()))
      const payload = {
        name: formData.name,
        address: formData.address,
        lat,
        lng,
        geofence_radius: formData.radius,
      }
      const res = await apiRequest("/time/locations/", { method: "POST", json: payload })
      setSavedLocations((prev) => [res, ...prev])
      setShowAddPanel(false)
      setSelectedPlace(null)
      setSearchQuery("")
    } catch (err) {
      setSaveError(
        err?.body?.detail || (err?.body && JSON.stringify(err.body)) || "Failed to save location."
      )
    } finally {
      setSaving(false)
    }
  }

  /* ── Delete ────────────────────────────────────────────────── */
  const handleDelete = async (id) => {
    if (!window.confirm("Delete this saved location?")) return
    try {
      await apiRequest(`/time/locations/${id}/`, { method: "DELETE" })
      setSavedLocations((prev) => prev.filter((l) => l.id !== id))
    } catch {
      alert("Failed to delete location.")
    }
  }

  /* ─────────────────────────── RENDER ─────────────────────────── */
  return (
    <div className="flex flex-col h-[calc(100vh-100px)] bg-white border border-slate-200 rounded-[2.5rem] overflow-hidden shadow-sm">

      {/* ── Tab Bar ──────────────────────────────────────────── */}
      <div className="flex items-center justify-between px-8 py-4 bg-slate-50/50 border-b border-slate-100 flex-shrink-0">
        <div className="flex items-center gap-2 bg-slate-200/40 p-1.5 rounded-2xl">
          {[
            { id: "overview",    label: "Overview",        Icon: Activity },
            { id: "map",         label: "Map & Sites",     Icon: Map },
            { id: "zones",       label: "Zones",           Icon: Layers },
            { id: "assignments", label: "Assignments",     Icon: UserCheck },
          ].map(({ id, label, Icon }) => {
            const isActive = activeTab === id
            return (
              <button 
                key={id} 
                onClick={() => setActiveTab(id)}
                className={`flex items-center gap-2 px-6 py-2.5 rounded-xl text-sm font-black transition-all ${isActive ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-500 hover:bg-slate-200/50 hover:text-slate-700'}`}
              >
                <Icon size={16} />
                {label}
              </button>
            )
          })}
        </div>
        
        <div className="flex items-center gap-4">
          <Pill tone="neutral" className="px-4 py-1.5 bg-white border border-slate-200 text-slate-600 font-bold">
            {savedLocations.length} ACTIVE SITES
          </Pill>
        </div>
      </div>

      {/* ── Tab Content ──────────────────────────────────── */}
      {activeTab === "overview" && (
        <div className="flex-1 overflow-hidden animate-in fade-in duration-500">
          <MapOverview />
        </div>
      )}

      {activeTab === "zones" && (
        <div className="flex-1 overflow-hidden animate-in fade-in duration-500">
          <ZonesPanel locations={savedLocations} />
        </div>
      )}

      {activeTab === "assignments" && (
        <div className="flex-1 overflow-hidden animate-in fade-in duration-500">
          <AssignmentsPanel locations={savedLocations} />
        </div>
      )}

      {activeTab === "map" && (
        <div className="flex flex-1 overflow-hidden animate-in fade-in duration-500">

          {/* LEFT: search + map stacked in a column */}
          <div className="flex-1 flex flex-col relative min-w-0">

            {/* ── Top Search Bar ──────────────────────────────────── */}
            <div className="relative z-[1000] px-8 py-4 flex gap-4 items-center bg-white border-b border-slate-50 shadow-sm">
              <div ref={searchRef} className="relative flex-1 max-w-2xl">
                <div className="relative">
                  <div className="absolute inset-y-0 left-5 flex items-center pointer-events-none">
                    <Search size={20} className="text-slate-300" />
                  </div>
                  <input
                    id="location-search-input"
                    type="text"
                    placeholder="Search for an address, business, or landmark..."
                    value={searchQuery}
                    onChange={(e) => {
                      setSearchQuery(e.target.value)
                      if (e.target.value.length >= 2) setShowDropdown(true)
                    }}
                    onFocus={() => { if (searchResults.length > 0) setShowDropdown(true) }}
                    className="w-full pl-14 pr-12 py-4 bg-slate-50/50 border-2 border-slate-100 rounded-[1.25rem] text-base font-semibold text-slate-700 placeholder-slate-400 outline-none focus:border-indigo-400 focus:bg-white focus:ring-8 focus:ring-indigo-50/50 transition-all"
                  />
                  {searching && (
                    <div className="absolute inset-y-0 right-14 flex items-center">
                      <Loader2 size={18} className="animate-spin text-indigo-400" />
                    </div>
                  )}
                  {searchQuery && (
                    <button
                      onClick={() => { setSearchQuery(""); setSearchResults([]); setShowDropdown(false); setSelectedPlace(null) }}
                      className="absolute inset-y-0 right-5 flex items-center text-slate-300 hover:text-slate-500 transition-colors"
                    >
                      <X size={20} />
                    </button>
                  )}
                </div>

                {/* ── Search Dropdown ─────────────────────────────── */}
                {showDropdown && searchResults.length > 0 && (
                  <div className="absolute top-full left-0 right-0 mt-4 bg-white rounded-3xl shadow-[0_20px_60px_-15px_rgba(0,0,0,0.2)] border border-slate-100 z-[9999] overflow-hidden max-h-[28rem] overflow-y-auto animate-in fade-in slide-in-from-top-4 duration-300">
                    {searchResults.map((r) => (
                      <button
                        key={r.id}
                        onClick={() => handleSelectPlace(r)}
                        className="w-full px-6 py-5 flex items-start gap-5 hover:bg-slate-50 text-left transition-colors border-b border-slate-50 last:border-0"
                      >
                        <div className="w-12 h-12 rounded-2xl bg-indigo-50 text-indigo-600 flex items-center justify-center shrink-0 shadow-sm">
                          <MapPin size={24} />
                        </div>
                        <div className="min-w-0">
                          <div className="text-base font-extrabold text-slate-900 mb-1">{r.name}</div>
                          <div className="text-xs font-semibold text-slate-400 uppercase tracking-wide">
                            {r.secondaryText || r.fullAddress.split(",").slice(1).join(",").trim()}
                          </div>
                        </div>
                      </button>
                    ))}
                    <button 
                      className="w-full px-6 py-5 text-indigo-600 text-sm font-extrabold text-left hover:bg-indigo-50/50 transition-colors flex items-center gap-3"
                      onClick={() => handleManualAdd()}
                    >
                      <Plus size={18} /> Add missing location manually
                    </button>
                  </div>
                )}
              </div>

            {/* Radius filter dropdown */}
            <div ref={radiusRef} className="relative">
              <button 
                onClick={() => setShowRadiusDropdown(!showRadiusDropdown)}
                className={`flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-bold transition-all border-2 ${selectedRadiusFilters.length > 0 ? 'border-indigo-400 bg-indigo-50 text-indigo-600' : 'border-slate-100 bg-slate-50 text-slate-500 hover:border-slate-200'}`}
              >
                {radiusFilterLabel}
                <ChevronDown size={14} className={`transition-transform duration-200 ${showRadiusDropdown ? 'rotate-180' : ''}`} />
              </button>

              {showRadiusDropdown && (
                <div className="absolute top-full left-0 mt-3 bg-white rounded-2xl shadow-2xl border border-slate-100 z-[9999] w-64 overflow-hidden p-2 animate-in fade-in slide-in-from-top-2">
                  {radiusFilterOptions.map((opt) => {
                    const isSelected = selectedRadiusFilters.some(f => f.id === opt.id)
                    return (
                      <button
                        key={opt.id}
                        onClick={() => toggleRadiusFilter(opt)}
                        className={`w-full px-4 py-3 flex items-center justify-between rounded-xl text-sm transition-colors ${isSelected ? 'bg-indigo-50 text-indigo-600 font-bold' : 'text-slate-600 hover:bg-slate-50'}`}
                      >
                        {opt.label}
                        {isSelected && (
                          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                            <polyline points="20 6 9 17 4 12" />
                          </svg>
                        )}
                      </button>
                    )
                  })}
                  <div className="h-px bg-slate-100 my-2" />
                  <button
                    onClick={clearRadiusFilters}
                    className="w-full px-4 py-3 text-left text-sm font-bold text-rose-500 hover:bg-rose-50 rounded-xl transition-colors"
                  >
                    Clear selection
                  </button>
                </div>
              )}
            </div>

          <div style={{ flex: 1 }} />

          {/* Map / List toggle */}
          <div style={{
            display: "flex", borderRadius: "8px",
            border: "1px solid var(--stroke)", overflow: "hidden",
          }}>
            <button
              onClick={() => setViewMode("map")}
              style={{
                padding: "8px 18px", border: "none", cursor: "pointer",
                fontSize: "13px", fontWeight: 600, display: "flex", alignItems: "center", gap: "6px",
                background: viewMode === "map" ? "rgba(249,115,22,0.08)" : "var(--surface)",
                color: viewMode === "map" ? "#F97316" : "var(--fg2)",
                borderRight: "1px solid var(--stroke)",
              }}
            >
              <MapPin size={14} /> Map
            </button>
            <button
              onClick={() => setViewMode("list")}
              style={{
                padding: "8px 18px", border: "none", cursor: "pointer",
                fontSize: "13px", fontWeight: 600,
                background: viewMode === "list" ? "rgba(249,115,22,0.08)" : "var(--surface)",
                color: viewMode === "list" ? "#F97316" : "var(--fg2)",
              }}
            >
              ☰ List
            </button>
          </div>
        </div>

        {/* ── Map View ───────────────────────────────────────── */}
        {viewMode === "map" ? (
          <div className="flex-1 relative z-0">
            <MapContainer
              center={mapCenter}
              zoom={mapZoom}
              className="w-full h-full"
              zoomControl={true}
            >
              <MapUpdater center={mapCenter} zoom={mapZoom} />
              <TileLayer
                url="https://mt1.google.com/vt/lyrs=m&x={x}&y={y}&z={z}"
                attribution='&copy; <a href="https://maps.google.com/">Google Maps</a>'
              />

              {/* Selected search result: orange pin with popup */}
              {selectedPlace && (
                <>
                  <Marker
                    position={[selectedPlace.lat, selectedPlace.lng]}
                    icon={createOrangePin()}
                  >
                    <Popup maxWidth={300} minWidth={260} autoPan>
                      <div className="p-4 text-center">
                        <div className="text-lg font-black text-slate-900 tracking-tight mb-1">
                          {selectedPlace.name}
                        </div>
                        <div className="text-sm font-medium text-slate-500 leading-relaxed mb-5">
                          {selectedPlace.fullAddress}
                        </div>
                        <Button
                          onClick={handleOpenAddPanel}
                          className="w-full shadow-lg shadow-indigo-100 rounded-xl py-3"
                        >
                          Add New Location
                        </Button>
                        <div className="mt-4 flex items-center justify-center gap-1.5 text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                          {savedLocations.length} active sites · 
                          <span className="text-indigo-600 cursor-pointer hover:underline">Upgrade Plan</span>
                        </div>
                      </div>
                    </Popup>
                  </Marker>
                  <Circle
                    center={[selectedPlace.lat, selectedPlace.lng]}
                    radius={formData.radius || 300}
                    pathOptions={{
                      color: "#6366F1",
                      fillColor: "#6366F1",
                      fillOpacity: 0.1,
                      weight: 2,
                      dashArray: "10, 10"
                    }}
                  />
                </>
              )}

              {/* Saved locations: indigo pins */}
              {filteredLocations.map((loc) => (
                <React.Fragment key={loc.id}>
                  <Marker
                    position={[parseFloat(loc.lat), parseFloat(loc.lng)]}
                    icon={createSavedPin()}
                  >
                    <Popup>
                      <div className="p-2 min-w-[200px]">
                        <div className="text-[10px] font-black text-indigo-600 uppercase tracking-widest mb-1">SAVED SITE</div>
                        <div className="text-sm font-black text-slate-900">{loc.name}</div>
                        <div className="text-xs text-slate-500 mt-1 font-medium">{loc.address}</div>
                        <div className="flex items-center gap-2 mt-4 pt-3 border-t border-slate-100">
                          <Target size={12} className="text-indigo-500" />
                          <span className="text-[11px] font-bold text-slate-700">{loc.geofence_radius}m Protection Zone</span>
                        </div>
                      </div>
                    </Popup>
                  </Marker>
                  <Circle
                    center={[parseFloat(loc.lat), parseFloat(loc.lng)]}
                    radius={loc.geofence_radius || 300}
                    pathOptions={{ color: "#6366F1", fillColor: "#6366F1", fillOpacity: 0.08, weight: 1.5 }}
                  />
                </React.Fragment>
              ))}
            </MapContainer>

            {/* Left info card when nothing is selected */}
            {!selectedPlace && !showAddPanel && (
              <div className="absolute top-6 left-6 z-[500] w-72 animate-in slide-in-from-left-4 duration-500">
                <Card className="shadow-2xl shadow-indigo-100 rounded-3xl p-8 bg-white/95 backdrop-blur-sm border-none">
                  <div className="w-14 h-14 rounded-2xl bg-indigo-50 text-indigo-600 flex items-center justify-center mb-6 shadow-sm">
                    <MapPin size={28} />
                  </div>
                  <h3 className="text-lg font-black text-slate-900 mb-2 tracking-tight">Global Presence</h3>
                  <p className="text-sm text-slate-500 font-medium leading-relaxed mb-8">
                    Select a location on the map or use the search bar to establish a new operational geofence.
                  </p>
                  
                  <div className="space-y-4">
                    <div className="flex items-center gap-4 p-4 bg-slate-50 rounded-2xl border border-slate-100">
                      <div className="w-10 h-10 rounded-xl bg-white flex items-center justify-center text-indigo-600 font-black shadow-sm">
                        {savedLocations.length}
                      </div>
                      <div className="text-[11px] font-black text-slate-400 uppercase tracking-widest">Active Sites</div>
                    </div>
                  </div>
                </Card>
              </div>
            )}
          </div>
        ) : viewMode === "list" ? (
          /* ── List View ─────────────────────────────────────── */
          <div className="flex-1 overflow-y-auto p-8 bg-slate-50/50 animate-in fade-in duration-500">
            <div className="max-w-7xl mx-auto">
              <div className="flex items-center justify-between mb-10">
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 rounded-2xl bg-indigo-600 text-white flex items-center justify-center shadow-lg shadow-indigo-100">
                    <Layers size={24} />
                  </div>
                  <div>
                    <h3 className="text-2xl font-black text-slate-900 tracking-tight">Saved Locations</h3>
                    <p className="text-sm text-slate-400 font-bold uppercase tracking-widest">{filteredLocations.length} TOTAL SITES</p>
                  </div>
                </div>
              </div>

              {filteredLocations.length === 0 ? (
                <div className="text-center py-32 bg-white rounded-[3rem] border-2 border-dashed border-slate-100">
                  <MapPin size={64} className="mx-auto text-slate-200 mb-6" />
                  <div className="text-xl font-black text-slate-900 mb-2">No locations found</div>
                  <div className="text-sm text-slate-500 font-medium">Try clearing your filters or search query.</div>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
                  {filteredLocations.map((loc) => (
                    <Card 
                      key={loc.id} 
                      className="group hover:shadow-2xl hover:shadow-indigo-100 transition-all duration-300 rounded-[2.5rem] border-none bg-white overflow-hidden"
                    >
                      <div className="p-2">
                        <div className="flex items-start justify-between mb-6">
                          <div className="w-14 h-14 rounded-2xl bg-slate-50 text-slate-400 group-hover:bg-indigo-600 group-hover:text-white flex items-center justify-center shadow-sm transition-all duration-300">
                            <MapPin size={28} />
                          </div>
                          <div className="flex flex-col items-end gap-2">
                            <Pill tone="neutral" className="bg-slate-50 border-slate-100 text-slate-500 font-black">
                              {loc.geofence_radius}M RADIUS
                            </Pill>
                          </div>
                        </div>
                        <h3 className="text-lg font-black text-slate-900 mb-2 tracking-tight">{loc.name}</h3>
                        <p className="text-sm text-slate-500 font-medium mb-8 line-clamp-2 leading-relaxed">
                          {loc.address}
                        </p>
                        <div className="pt-6 border-t border-slate-50 flex items-center justify-between">
                          <div className="flex gap-2">
                            {/* Phase 4: open polygon editor for this site */}
                            <button
                              onClick={(e) => { e.stopPropagation(); setEditingGeofenceFor(loc) }}
                              className={`p-2.5 rounded-xl transition-colors ${
                                loc.geofence_polygon
                                  ? "bg-indigo-50 text-indigo-600 hover:bg-indigo-100"
                                  : "bg-slate-50 text-slate-400 hover:bg-indigo-50 hover:text-indigo-600"
                              }`}
                              title={loc.geofence_polygon ? "Edit polygon geofence" : "Draw polygon geofence"}
                            >
                              <Layers size={18} />
                            </button>
                            <button
                              onClick={(e) => { e.stopPropagation(); handleArchive(loc.id) }}
                              className="p-2.5 rounded-xl bg-slate-50 text-slate-400 hover:bg-amber-50 hover:text-amber-600 transition-colors"
                              title="Archive Site"
                            >
                              <Archive size={18} />
                            </button>
                            <button
                              onClick={(e) => { e.stopPropagation(); handleDelete(loc.id) }}
                              className="p-2.5 rounded-xl bg-slate-50 text-slate-400 hover:bg-rose-50 hover:text-rose-600 transition-colors"
                              title="Delete Site"
                            >
                              <X size={18} />
                            </button>
                          </div>
                          <Button 
                            variant="ghost" 
                            className="text-indigo-600 font-black text-xs hover:bg-indigo-50"
                            onClick={() => {
                              setActiveTab("map");
                              setViewMode("map");
                              setMapCenter([parseFloat(loc.lat), parseFloat(loc.lng)]);
                              setMapZoom(17);
                            }}
                          >
                            LOCATE
                          </Button>
                        </div>
                      </div>
                    </Card>
                  ))}
                </div>
              )}
            </div>
          </div>
        ) : (
          /* ── Archived View ──────────────────────────────────── */
          <div className="flex-1 overflow-y-auto p-8 bg-slate-50/50 animate-in fade-in duration-500">
            <div className="max-w-7xl mx-auto">
              <div className="flex items-center gap-4 mb-10">
                <button 
                  onClick={() => setViewMode("map")}
                  className="w-12 h-12 rounded-2xl bg-white border border-slate-200 text-slate-400 hover:text-indigo-600 hover:border-indigo-200 flex items-center justify-center shadow-sm transition-all"
                >
                  <Navigation2 size={20} className="rotate-[-90deg]" />
                </button>
                <div>
                  <h3 className="text-2xl font-black text-slate-900 tracking-tight">Archived Sites</h3>
                  <p className="text-sm text-slate-400 font-bold uppercase tracking-widest">{archivedLocations.length} INACTIVE SITES</p>
                </div>
              </div>

              {archivedLocations.length === 0 ? (
                <div className="text-center py-32 bg-white rounded-[3rem] border-2 border-dashed border-slate-100">
                  <Archive size={64} className="mx-auto text-slate-200 mb-6" />
                  <div className="text-xl font-black text-slate-900 mb-2">Archive is empty</div>
                  <div className="text-sm text-slate-500 font-medium">Locations you deactivate will appear here.</div>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
                  {archivedLocations.map((loc) => (
                    <Card key={loc.id} className="rounded-[2.5rem] border-none bg-white opacity-70 grayscale hover:grayscale-0 hover:opacity-100 transition-all duration-300">
                      <div className="flex items-start justify-between mb-6">
                        <div className="w-14 h-14 rounded-2xl bg-slate-100 text-slate-400 flex items-center justify-center">
                          <Archive size={28} />
                        </div>
                        <Button 
                          onClick={() => handleRestore(loc.id)}
                          className="bg-indigo-600 text-white rounded-xl px-6 text-xs font-black"
                        >
                          RESTORE
                        </Button>
                      </div>
                      <h3 className="text-lg font-black text-slate-900 mb-2 tracking-tight">{loc.name}</h3>
                      <p className="text-sm text-slate-500 font-medium line-clamp-1">{loc.address}</p>
                    </Card>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* ── Bottom: Archived Locations link ─────────────────── */}
        <div
          onClick={() => setViewMode(viewMode === "archived" ? "map" : "archived")}
          className={`px-8 py-4 border-t border-slate-100 flex items-center justify-between cursor-pointer transition-all ${viewMode === 'archived' ? 'bg-indigo-600 text-white' : 'bg-white text-slate-500 hover:bg-slate-50'}`}
        >
          <div className="flex items-center gap-3">
            <Archive size={18} className={viewMode === 'archived' ? 'text-white' : 'text-indigo-500'} />
            <span className="text-sm font-black tracking-tight">
              {viewMode === "archived" ? "Back to Operations Map" : "Access Archived Locations"}
            </span>
          </div>
          <Pill tone={viewMode === 'archived' ? 'success' : 'neutral'} className="font-black">
            {archivedLocations.length} SITES
          </Pill>
        </div>
      </div>

      {/* ── Add New Location Panel (Overlay) ─────────────────── */}
      {showAddPanel && (
        <div className="fixed inset-0 z-[10001] flex items-center justify-center bg-slate-900/60 backdrop-blur-md p-6 animate-in fade-in duration-300">
          <Card 
            title="Configure Site Geofence"
            className="w-full max-w-2xl shadow-[0_30px_70px_-10px_rgba(0,0,0,0.5)] animate-in zoom-in-95 duration-300 rounded-[2.5rem]"
          >
            <div className="flex flex-col gap-8">
              {saveError && (
                <div className="p-4 bg-rose-50 text-rose-700 border-2 border-rose-100 rounded-2xl text-sm font-bold flex items-center gap-3 animate-in shake duration-500">
                  <Activity size={20} className="text-rose-500" /> {saveError}
                </div>
              )}

              <div className="flex flex-col gap-6">
                <Input
                  label="Display Name"
                  placeholder="e.g. Skyline Apartments Construction"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  required
                  className="text-xl font-black tracking-tight"
                />

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <Input
                    label="Coordinates"
                    placeholder="12.89241, 80.03912"
                    value={formData.coordinates}
                    onChange={(e) => setFormData({ ...formData, coordinates: e.target.value })}
                    icon={<Target size={18} className="text-indigo-500" />}
                    required
                  />
                  <div>
                    <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-3">Verification Radius</label>
                    <div className="flex items-center gap-3 bg-slate-50 p-2 rounded-2xl border-2 border-slate-100">
                      <input 
                        type="range" 
                        min="100" 
                        max="2000" 
                        step="100"
                        value={formData.radius}
                        onChange={(e) => setFormData({ ...formData, radius: parseInt(e.target.value) })}
                        className="flex-1 h-2 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-indigo-600"
                      />
                      <span className="w-16 text-center text-sm font-black text-indigo-600">{formData.radius}m</span>
                    </div>
                  </div>
                </div>

                <div className="bg-slate-50 p-6 rounded-3xl border-2 border-slate-100">
                  <div className="flex items-center gap-2 mb-3">
                    <Navigation2 size={16} className="text-indigo-500" />
                    <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Selected Address</span>
                  </div>
                  <div className="text-sm text-slate-700 font-bold leading-relaxed">
                    {formData.address || "Searching address..."}
                  </div>
                </div>

                <div>
                  <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-4">Quick Radius Presets</label>
                  <div className="flex flex-wrap gap-3">
                    {[100, 300, 500, 1000].map((val) => {
                      const isActive = formData.radius === val
                      return (
                        <button
                          key={val}
                          type="button"
                          onClick={() => { setFormData({ ...formData, radius: val }); setCustomRadius(false) }}
                          className={`px-6 py-3 rounded-2xl text-xs font-black transition-all border-2 ${isActive ? 'border-indigo-600 bg-indigo-600 text-white shadow-lg shadow-indigo-100' : 'border-slate-100 text-slate-500 hover:border-slate-200 hover:bg-slate-50'}`}
                        >
                          {val}m
                        </button>
                      )
                    })}
                  </div>
                </div>
              </div>

              <div className="flex gap-4 pt-4">
                <Button variant="ghost" className="flex-1 bg-slate-100 border-none text-slate-500 rounded-2xl py-4" onClick={() => setShowAddPanel(false)}>
                  Cancel
                </Button>
                <Button 
                  className="flex-[1.5] shadow-2xl shadow-indigo-200 rounded-2xl py-4" 
                  onClick={handleSave}
                  disabled={saving}
                >
                  {saving ? <Loader2 size={20} className="animate-spin mr-2" /> : <Save size={20} className="mr-2" />}
                  {saving ? "Deploying Site..." : "DEPLOY SITE GEOFENCE"}
                </Button>
              </div>
            </div>
          </Card>
        </div>
      )}

      <style>{`
        @keyframes locSlideIn {
          from { opacity: 0; transform: translateX(16px); }
          to   { opacity: 1; transform: translateX(0); }
        }
      `}</style>
        </div>
      )}

      {/* ── Phase 4: Polygon geofence editor ──────────────────── */}
      {editingGeofenceFor && (
        <GeofenceEditorModal
          location={editingGeofenceFor}
          onClose={() => setEditingGeofenceFor(null)}
          onSaved={handleGeofenceSaved}
        />
      )}
    </div>
  )
}
