import React, { useState, useEffect, useCallback, useRef, useMemo } from "react"
import { MapContainer, TileLayer, Marker, Popup, Circle, useMap } from "react-leaflet"
import L from "leaflet"
import "leaflet/dist/leaflet.css"
import { Search, MapPin, X, ChevronDown, Info, Archive } from "lucide-react"

import { apiRequest, unwrapResults } from "../../api/client.js"
import { getAddress } from "../../api/geocoding"

/* ── Fix default Leaflet marker icons ─────────────────────────── */
delete L.Icon.Default.prototype._getIconUrl
L.Icon.Default.mergeOptions({
  iconRetinaUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
  iconUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
  shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
})

/* ── Orange pin icon for selected location ────────────────────── */
const createOrangePin = () =>
  L.divIcon({
    className: "custom-orange-pin",
    html: `<div style="
      width: 30px; height: 30px;
      background: #F97316;
      border: 3px solid white;
      border-radius: 50% 50% 50% 0;
      transform: rotate(-45deg);
      box-shadow: 0 3px 10px rgba(249,115,22,0.5);
      display: flex; align-items: center; justify-content: center;
    ">
      <div style="
        width: 10px; height: 10px;
        background: white;
        border-radius: 50%;
        transform: rotate(45deg);
      "></div>
    </div>`,
    iconSize: [30, 30],
    iconAnchor: [15, 30],
    popupAnchor: [0, -30],
  })

/* ── Saved location icon (blue building) ──────────────────────── */
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
    if (center) map.setView(center, zoom || 15, { animate: true })
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
   MAIN COMPONENT
   ═══════════════════════════════════════════════════════════════ */
export function LocationsSettingsPage() {
  /* ── Search state ──────────────────────────────────────────── */
  const [searchQuery, setSearchQuery] = useState("")
  const [searchResults, setSearchResults] = useState([])
  const [searching, setSearching] = useState(false)
  const [showDropdown, setShowDropdown] = useState(false)
  const searchRef = useRef(null)

  /* ── Selected place state ──────────────────────────────────── */
  const [selectedPlace, setSelectedPlace] = useState(null) // { name, address, lat, lng }

  /* ── Add Location form state ───────────────────────────────── */
  const [showAddPanel, setShowAddPanel] = useState(false)
  const [formData, setFormData] = useState({
    name: "",
    coordinates: "",
    address: "",
    radius: 300,
  })
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState("")

  /* ── Saved locations ───────────────────────────────────────── */
  const [savedLocations, setSavedLocations] = useState([])
  const [loadingSaved, setLoadingSaved] = useState(true)

  /* ── View toggle ───────────────────────────────────────────── */
  const [viewMode, setViewMode] = useState("map") // "map" | "list"

  /* ── Map center ────────────────────────────────────────────── */
  const defaultCenter = [12.7550337, 77.8376261] // Samathuvapuram, Hosur
  const [mapCenter, setMapCenter] = useState(defaultCenter)
  const [mapZoom, setMapZoom] = useState(5)

  /* ── User Geolocation ──────────────────────────────────────── */
  useEffect(() => {
    if ("geolocation" in navigator) {
      navigator.geolocation.getCurrentPosition(
        async (position) => {
          const lat = position.coords.latitude
          const lng = position.coords.longitude
          setMapCenter([lat, lng])
          setMapZoom(16) // Zoom in closer once we have accurate location
          
          // Reverse geocode to show as text
          const address = await getAddress(lat, lng)
          if (address) {
            setSearchQuery(address)
          }
        },
        (error) => {
          console.warn("Could not get user location:", error)
          setMapCenter(defaultCenter)
          setMapZoom(16)
        },
        { enableHighAccuracy: true, timeout: 10000 }
      )
    } else {
      setMapCenter(defaultCenter)
      setMapZoom(16)
    }
  }, [])

  /* ── Load saved locations on mount ─────────────────────────── */
  useEffect(() => {
    loadSavedLocations()
  }, [])

  const loadSavedLocations = async () => {
    setLoadingSaved(true)
    try {
      const res = await apiRequest("/time/locations/")
      setSavedLocations(unwrapResults(res) || [])
    } catch {
      setSavedLocations([])
    } finally {
      setLoadingSaved(false)
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
    if (window.google?.maps?.places) {
      autocompleteService.current = new window.google.maps.places.AutocompleteService()
      if (!dummyDiv.current) dummyDiv.current = document.createElement("div")
      placesService.current = new window.google.maps.places.PlacesService(dummyDiv.current)
      return
    }
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
  }, [GOOGLE_API_KEY])

  /* ── Google Places Autocomplete search (debounced) ─────────── */
  const debouncedQuery = useDebouncedValue(searchQuery, 300)

  useEffect(() => {
    if (debouncedQuery.trim().length < 2) {
      setSearchResults([])
      return
    }
    /* ── Nominatim Fallback function ───────────────────────────── */
    const runNominatimFallback = () => {
      let cancelled = false
      setSearching(true)
      fetch(
        `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(debouncedQuery)}&format=json&limit=8&addressdetails=1`,
        { headers: { "Accept-Language": "en" } }
      )
        .then((r) => r.json())
        .then((data) => {
          if (cancelled) return
          setSearching(false)
          setSearchResults(
            data.map((d) => ({
              id: d.place_id, placeId: null,
              name: d.display_name.split(",")[0],
              secondaryText: d.display_name.split(",").slice(1).join(",").trim(),
              fullAddress: d.display_name,
              lat: parseFloat(d.lat), lng: parseFloat(d.lon),
            }))
          )
          setShowDropdown(true)
        })
        .catch((err) => {
          if (cancelled) return
          console.error("Nominatim search error:", err)
          setSearching(false)
          setSearchResults([])
        })
      return () => { cancelled = true }
    }

    if (autocompleteService.current) {
      setSearching(true)
      try {
        autocompleteService.current.getPlacePredictions(
          {
            input: debouncedQuery,
          },
          (predictions, status) => {
            if (status !== window.google.maps.places.PlacesServiceStatus.OK || !predictions) {
              console.warn("Google Places failed (Status:", status, ") — Using Nominatim fallback")
              runNominatimFallback()
              return
            }
            setSearching(false)
            setSearchResults(
              predictions.map((p) => ({
                id: p.place_id,
                placeId: p.place_id,
                name: p.structured_formatting?.main_text || p.description.split(",")[0],
                secondaryText: p.structured_formatting?.secondary_text || "",
                fullAddress: p.description,
                lat: null,
                lng: null,
              }))
            )
            setShowDropdown(true)
          }
        )
      } catch (err) {
        console.error("Autocomplete error:", err)
        runNominatimFallback()
      }
      return
    }

    /* ── If no Google key, run Nominatim directly ──────────────── */
    return runNominatimFallback()
  }, [debouncedQuery])

  /* ── Close dropdown on outside click ───────────────────────── */
  useEffect(() => {
    const handler = (e) => {
      if (searchRef.current && !searchRef.current.contains(e.target)) {
        setShowDropdown(false)
      }
    }
    document.addEventListener("mousedown", handler)
    return () => document.removeEventListener("mousedown", handler)
  }, [])

  /* ── Select a search result ────────────────────────────────── */
  const handleSelectPlace = (place) => {
    setSearchQuery(place.fullAddress || place.name)
    setShowDropdown(false)
    setShowAddPanel(false)
    if (place.placeId && placesService.current) {
      placesService.current.getDetails(
        { placeId: place.placeId, fields: ["geometry", "formatted_address", "name", "address_components"] },
        (result, status) => {
          if (status === window.google.maps.places.PlacesServiceStatus.OK && result?.geometry?.location) {
            const lat = result.geometry.location.lat()
            const lng = result.geometry.location.lng()
            const resolvedAddress = result.formatted_address || place.fullAddress
            const resolved = { ...place, lat, lng, fullAddress: resolvedAddress, name: result.name || place.name }
            setSelectedPlace(resolved)
            setSearchQuery(resolvedAddress)
            setMapCenter([lat, lng])
            setMapZoom(17)
          }
        }
      )
      return
    }
    if (place.lat && place.lng) {
      setSelectedPlace(place)
      setMapCenter([place.lat, place.lng])
      setMapZoom(16)
    }
  }


  /* ── Open "Add New Location" panel ─────────────────────────── */
  const handleOpenAddPanel = () => {
    if (!selectedPlace) return
    setFormData({
      name: selectedPlace.name,
      coordinates: `${selectedPlace.lat},${selectedPlace.lng}`,
      address: selectedPlace.fullAddress,
      radius: 300,
    })
    setSaveError("")
    setShowAddPanel(true)
  }

  /* ── Save location ─────────────────────────────────────────── */
  const handleSave = async () => {
    if (!formData.name.trim()) {
      setSaveError("Location name is required.")
      return
    }

    setSaving(true)
    setSaveError("")

    try {
      const [lat, lng] = formData.coordinates.split(",").map((s) => parseFloat(s.trim()))

      // Check for duplicates
      const isDuplicate = savedLocations.some(loc => {
        const nameMatch = loc.name?.toLowerCase().trim() === formData.name.toLowerCase().trim();
        const addressMatch = loc.address?.toLowerCase().trim() === formData.address.toLowerCase().trim();
        const latMatch = Math.abs(parseFloat(loc.lat) - lat) < 0.00001;
        const lngMatch = Math.abs(parseFloat(loc.lng) - lng) < 0.00001;

        return (nameMatch && latMatch && lngMatch) || (nameMatch && addressMatch);
      });

      if (isDuplicate) {
        setSaveError("This location is already available in your saved locations.")
        setSaving(false)
        return
      }

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

  /* ── Delete saved location ─────────────────────────────────── */
  const handleDelete = async (id) => {
    if (!window.confirm("Are you sure you want to delete this location?")) return
    try {
      await apiRequest(`/time/locations/${id}/`, { method: "DELETE" })
      setSavedLocations((prev) => prev.filter((l) => l.id !== id))
    } catch {
      alert("Failed to delete location.")
    }
  }

  /* ── Radius options ────────────────────────────────────────── */
  const radiusOptions = [
    { value: 300, label: "300 Meters", recommended: true },
    { value: 400, label: "400 Meters" },
    { value: 500, label: "500 Meters" },
    { value: 1000, label: "1000 Meters" },
  ]
  const [customRadius, setCustomRadius] = useState(false)
  const [customRadiusValue, setCustomRadiusValue] = useState("")

  return (
    <div style={{ display: "flex", height: "calc(100vh - 110px)", width: "100%", backgroundColor: "var(--bg)", border: "1px solid var(--stroke)", borderRadius: "var(--radius-lg)", overflow: "hidden", boxShadow: "var(--shadow)" }}>

      {/* ── LEFT: Search + Map ────────────────────────────────── */}
      <div style={{ flex: 1, display: "flex", flexDirection: "column", position: "relative" }}>

        {/* Top Search Bar */}
        <div style={{
          position: "relative", zIndex: 1000,
          padding: "12px 16px",
          display: "flex", gap: "12px", alignItems: "center",
          borderBottom: "1px solid var(--stroke)",
          backgroundColor: "var(--surface)",
        }}>
          {/* Search Input */}
          <div ref={searchRef} style={{ position: "relative", flex: 1, maxWidth: 360 }}>
            <div style={{
              display: "flex", alignItems: "center", gap: "8px",
              background: "var(--bg)", border: "1px solid var(--stroke)",
              borderRadius: "8px", padding: "8px 12px",
            }}>
              <Search size={16} color="var(--muted)" />
              <input
                id="location-search-input"
                type="text"
                placeholder="Search all"
                value={searchQuery}
                onChange={(e) => {
                  setSearchQuery(e.target.value)
                  if (e.target.value.length >= 2) setShowDropdown(true)
                }}
                onFocus={() => { if (searchResults.length > 0) setShowDropdown(true) }}
                style={{
                  border: "none", outline: "none", background: "transparent",
                  fontSize: "14px", fontWeight: 500, color: "var(--fg)",
                  width: "100%", fontFamily: "inherit",
                }}
              />
              {searchQuery && (
                <button
                  onClick={() => { setSearchQuery(""); setSearchResults([]); setShowDropdown(false); setSelectedPlace(null) }}
                  style={{ background: "none", border: "none", cursor: "pointer", display: "flex", padding: 0 }}
                >
                  <X size={14} color="var(--muted)" />
                </button>
              )}
            </div>
            <ChevronDown size={14} color="var(--muted)" style={{ position: "absolute", right: 12, top: "50%", transform: "translateY(-50%)", pointerEvents: "none" }} />

            {/* Dropdown */}
            {showDropdown && searchResults.length > 0 && (
              <div style={{
                position: "absolute", top: "calc(100% + 4px)", left: 0, right: 0,
                background: "var(--surface)", border: "1px solid var(--stroke)",
                borderRadius: "10px", boxShadow: "0 12px 28px rgba(0,0,0,0.12)",
                zIndex: 9999, overflow: "hidden",
                maxHeight: 320, overflowY: "auto",
              }}>
                {searchResults.map((r) => (
                  <button
                    key={r.id}
                    onClick={() => handleSelectPlace(r)}
                    style={{
                      display: "flex", alignItems: "center", gap: "12px",
                      width: "100%", padding: "12px 16px",
                      border: "none", borderBottom: "1px solid var(--stroke)",
                      background: "transparent", cursor: "pointer",
                      textAlign: "left", transition: "background 0.15s",
                    }}
                    onMouseEnter={(e) => (e.currentTarget.style.background = "var(--bg)")}
                    onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
                  >
                    <div style={{
                      width: 32, height: 32, borderRadius: "50%",
                      background: "rgba(249,115,22,0.1)",
                      display: "flex", alignItems: "center", justifyContent: "center",
                      flexShrink: 0,
                    }}>
                      <MapPin size={16} color="#F97316" />
                    </div>
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontSize: "14px", fontWeight: 600, color: "var(--fg)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                        {r.name}
                      </div>
                      <div style={{ fontSize: "12px", color: "var(--muted)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", marginTop: 2, maxWidth: '400px' }}>
                        {r.fullAddress}
                      </div>
                    </div>
                  </button>
                ))}
                <button
                  style={{
                    display: "flex", alignItems: "center", gap: "8px",
                    padding: "12px 16px", width: "100%",
                    border: "none", background: "transparent",
                    color: "#F97316", fontSize: "13px", fontWeight: 600,
                    cursor: "pointer",
                  }}
                >
                  + Add missing location
                </button>
              </div>
            )}
          </div>

          {/* Radius dropdown placeholder */}
          <div style={{
            display: "flex", alignItems: "center", gap: "6px",
            padding: "8px 14px", border: "1px solid var(--stroke)",
            borderRadius: "8px", fontSize: "13px", fontWeight: 600,
            color: "var(--fg2)", cursor: "pointer", background: "var(--bg)",
          }}>
            Radius <ChevronDown size={12} />
          </div>

          <div style={{ flex: 1 }} />

          {/* Map/List toggle */}
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

        {/* Map View */}
        {viewMode === "map" ? (
          <div style={{ flex: 1, position: "relative" }}>
            <MapContainer
              center={mapCenter}
              zoom={mapZoom}
              style={{ width: "100%", height: "100%", zIndex: 0 }}
              zoomControl={true}
              maxZoom={22}
            >
              <MapUpdater center={mapCenter} zoom={mapZoom} />
              <TileLayer
                url="https://mt1.google.com/vt/lyrs=m&x={x}&y={y}&z={z}"
                attribution='&copy; <a href="https://maps.google.com/">Google Maps</a>'
                maxNativeZoom={20}
                maxZoom={22}
              />

              {/* Selected search result pin */}
              {selectedPlace && (
                <>
                  <Marker
                    position={[selectedPlace.lat, selectedPlace.lng]}
                    icon={createOrangePin()}
                  >
                    <Popup maxWidth={300} minWidth={240}>
                      <div style={{ padding: "8px 4px", textAlign: "center" }}>
                        <div style={{
                          fontWeight: 800, fontSize: "16px",
                          color: "#1a1a2e", marginBottom: "6px",
                          fontFamily: "var(--font-display, Inter, sans-serif)",
                        }}>
                          {selectedPlace.name}
                        </div>
                        <div style={{
                          fontSize: "13px", color: "#6b7280",
                          marginBottom: "14px", lineHeight: 1.5,
                        }}>
                          {selectedPlace.fullAddress}
                        </div>
                        <button
                          onClick={handleOpenAddPanel}
                          style={{
                            background: "linear-gradient(135deg, #F97316 0%, #ea580c 100%)",
                            color: "white",
                            border: "none",
                            padding: "10px 24px",
                            borderRadius: "8px",
                            fontSize: "14px",
                            fontWeight: 700,
                            cursor: "pointer",
                            boxShadow: "0 4px 14px rgba(249,115,22,0.35)",
                            transition: "all 0.2s",
                            width: "100%",
                          }}
                          onMouseEnter={(e) => (e.currentTarget.style.transform = "translateY(-1px)")}
                          onMouseLeave={(e) => (e.currentTarget.style.transform = "none")}
                        >
                          Add New Location
                        </button>
                        <div style={{ fontSize: "11px", color: "#9ca3af", marginTop: "8px" }}>
                          {savedLocations.length} of {savedLocations.length + 2} locations remaining.{" "}
                          <span style={{ color: "#F97316", cursor: "pointer" }}>Upgrade for more</span>
                        </div>
                      </div>
                    </Popup>
                  </Marker>
                  <Circle
                    center={[selectedPlace.lat, selectedPlace.lng]}
                    radius={formData.radius || 300}
                    pathOptions={{
                      color: "#F97316",
                      fillColor: "#F97316",
                      fillOpacity: 0.1,
                      weight: 1.5,
                    }}
                  />
                </>
              )}

              {/* Saved locations */}
              {savedLocations.map((loc) => (
                <React.Fragment key={loc.id}>
                  <Marker
                    position={[parseFloat(loc.lat), parseFloat(loc.lng)]}
                    icon={createSavedPin()}
                  >
                    <Popup>
                      <div style={{ fontWeight: 700, color: "#4F46E5" }}>{loc.name}</div>
                      <div style={{ fontSize: "12px", color: "#6b7280", marginTop: "2px" }}>{loc.address}</div>
                      <div style={{ fontSize: "11px", fontWeight: 600, marginTop: "4px" }}>
                        Radius: {loc.geofence_radius}m
                      </div>
                    </Popup>
                  </Marker>
                  <Circle
                    center={[parseFloat(loc.lat), parseFloat(loc.lng)]}
                    radius={loc.geofence_radius || 300}
                    pathOptions={{ color: "#4F46E5", fillColor: "#4F46E5", fillOpacity: 0.08, weight: 1.5 }}
                  />
                </React.Fragment>
              ))}
            </MapContainer>

            {/* Left sidebar overlay — GPS info card */}
            {!selectedPlace && !showAddPanel && (
              <div style={{
                position: "absolute", top: 12, left: 12, zIndex: 500,
                width: 240, background: "var(--surface)",
                borderRadius: "12px", padding: "24px 20px",
                boxShadow: "0 8px 24px rgba(0,0,0,0.12)",
                border: "1px solid var(--stroke)",
                textAlign: "center",
              }}>
                <div style={{
                  width: 72, height: 72, borderRadius: "14px",
                  background: "linear-gradient(135deg, #e0e7ff, #c7d2fe)",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  margin: "0 auto 16px",
                }}>
                  <MapPin size={32} color="#4F46E5" />
                </div>
                <div style={{ fontSize: "15px", fontWeight: 700, color: "var(--fg)", marginBottom: "6px" }}>
                  Add locations to track time with GPS
                </div>
                <div style={{ fontSize: "12px", color: "var(--muted)", lineHeight: 1.6 }}>
                  Search for a location on the map to begin.
                </div>
                <a
                  href="#"
                  style={{ fontSize: "13px", color: "#F97316", fontWeight: 600, marginTop: "12px", display: "inline-block", textDecoration: "none" }}
                >
                  Learn more about Locations ↗
                </a>
              </div>
            )}
          </div>
        ) : (
          /* List View */
          <div style={{ flex: 1, padding: "24px", overflowY: "auto" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "20px" }}>
              <h3 style={{ margin: 0, fontSize: "18px", fontWeight: 800, color: "var(--fg)" }}>
                Saved Locations ({savedLocations.length})
              </h3>
            </div>
            {savedLocations.length === 0 ? (
              <div style={{ textAlign: "center", padding: "64px 20px", color: "var(--muted)" }}>
                <MapPin size={40} opacity={0.2} style={{ marginBottom: 12 }} />
                <div style={{ fontWeight: 600 }}>No locations saved yet</div>
                <div style={{ fontSize: "13px", marginTop: "4px" }}>
                  Search for a location and pin it to add.
                </div>
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
                {savedLocations.map((loc) => (
                  <div
                    key={loc.id}
                    style={{
                      display: "flex", alignItems: "center", gap: "16px",
                      padding: "16px 20px",
                      background: "var(--surface)",
                      border: "1px solid var(--stroke)",
                      borderRadius: "10px",
                      cursor: "pointer",
                      transition: "all 0.2s",
                    }}
                    onClick={() => {
                      setMapCenter([parseFloat(loc.lat), parseFloat(loc.lng)])
                      setMapZoom(15)
                      setViewMode("map")
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.borderColor = "#4F46E5"
                      e.currentTarget.style.boxShadow = "0 4px 12px rgba(79,70,229,0.08)"
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.borderColor = "var(--stroke)"
                      e.currentTarget.style.boxShadow = "none"
                    }}
                  >
                    <div style={{
                      width: 40, height: 40, borderRadius: "10px",
                      background: "rgba(79,70,229,0.08)",
                      display: "flex", alignItems: "center", justifyContent: "center",
                      flexShrink: 0,
                    }}>
                      <MapPin size={18} color="#4F46E5" />
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontWeight: 700, fontSize: "14px", color: "var(--fg)" }}>{loc.name}</div>
                      <div style={{ fontSize: "12px", color: "var(--muted)", marginTop: "2px", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{loc.address}</div>
                    </div>
                    <div style={{ fontSize: "12px", color: "var(--muted)", fontWeight: 600, flexShrink: 0 }}>
                      {loc.geofence_radius}m
                    </div>
                    <button
                      onClick={(e) => { e.stopPropagation(); handleDelete(loc.id) }}
                      style={{
                        background: "none", border: "none", cursor: "pointer",
                        color: "#EF4444", fontSize: "12px", fontWeight: 600,
                        padding: "4px 8px", borderRadius: "6px",
                      }}
                    >
                      Delete
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Bottom: Archived Locations link */}
        <div style={{
          padding: "10px 16px",
          borderTop: "1px solid var(--stroke)",
          backgroundColor: "var(--surface)",
          display: "flex", alignItems: "center", gap: "8px",
          color: "var(--fg2)", fontSize: "13px", fontWeight: 600,
          cursor: "pointer",
        }}>
          <Archive size={16} /> Archived Locations
        </div>
      </div>

      {/* ── RIGHT PANEL: Add New Location ─────────────────────── */}
      {showAddPanel && (
        <div
          style={{
            width: 400,
            borderLeft: "1px solid var(--stroke)",
            backgroundColor: "var(--surface)",
            display: "flex", flexDirection: "column",
            animation: "stSlideIn .3s ease-out",
            zIndex: 10,
          }}
        >
          {/* Panel Header */}
          <div style={{
            padding: "20px 24px",
            display: "flex", alignItems: "center", justifyContent: "space-between",
            borderBottom: "1px solid var(--stroke)",
          }}>
            <h2 style={{ margin: 0, fontSize: "20px", fontWeight: 800, color: "var(--fg)", fontFamily: "var(--font-display, Inter, sans-serif)" }}>
              Add New Location
            </h2>
            <button
              onClick={() => setShowAddPanel(false)}
              style={{
                background: "none", border: "none", cursor: "pointer",
                color: "var(--muted)", display: "flex", padding: "6px",
                borderRadius: "6px",
              }}
              onMouseEnter={(e) => (e.currentTarget.style.background = "var(--bg)")}
              onMouseLeave={(e) => (e.currentTarget.style.background = "none")}
            >
              <X size={20} />
            </button>
          </div>

          {/* Panel Body */}
          <div style={{ flex: 1, overflowY: "auto", padding: "24px" }}>
            {saveError && (
              <div style={{
                padding: "10px 14px", marginBottom: "16px",
                background: "#FEF2F2", border: "1px solid #FECACA",
                borderRadius: "8px", fontSize: "13px", color: "#DC2626",
                fontWeight: 600,
              }}>
                {saveError}
              </div>
            )}

            {/* Location Name */}
            <div style={{ marginBottom: "24px" }}>
              <label style={{
                display: "block", fontSize: "13px", fontWeight: 700,
                color: "#1e3a5f", marginBottom: "8px",
              }}>
                Location Name
              </label>
              <input
                id="location-name-input"
                type="text"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                style={{
                  width: "100%", padding: "12px 14px",
                  border: "1px solid var(--stroke)", borderRadius: "8px",
                  fontSize: "14px", fontWeight: 500,
                  color: "var(--fg)", background: "var(--bg)",
                  outline: "none", fontFamily: "inherit",
                  boxSizing: "border-box",
                }}
                onFocus={(e) => (e.target.style.borderColor = "#F97316")}
                onBlur={(e) => (e.target.style.borderColor = "var(--stroke)")}
              />
            </div>

            {/* Coordinates */}
            <div style={{ marginBottom: "24px" }}>
              <label style={{
                display: "flex", alignItems: "center", gap: "6px",
                fontSize: "13px", fontWeight: 700,
                color: "#1e3a5f", marginBottom: "8px",
              }}>
                Coordinates
                <Info size={14} color="var(--muted)" style={{ cursor: "help" }} title="Latitude,Longitude" />
              </label>
              <input
                id="location-coords-input"
                type="text"
                value={formData.coordinates}
                onChange={(e) => setFormData({ ...formData, coordinates: e.target.value })}
                style={{
                  width: "100%", padding: "12px 14px",
                  border: "1px solid var(--stroke)", borderRadius: "8px",
                  fontSize: "14px", fontWeight: 500,
                  color: "var(--fg)", background: "var(--bg)",
                  outline: "none", fontFamily: "inherit",
                  boxSizing: "border-box",
                }}
                placeholder="12.892, 80.039"
                onFocus={(e) => (e.target.style.borderColor = "#F97316")}
                onBlur={(e) => (e.target.style.borderColor = "var(--stroke)")}
              />
            </div>

            {/* Address (read-only display) */}
            <div style={{ marginBottom: "28px" }}>
              <label style={{
                display: "block", fontSize: "13px", fontWeight: 700,
                color: "#1e3a5f", marginBottom: "8px",
              }}>
                Address
              </label>
              <div style={{ fontSize: "14px", fontWeight: 700, color: "var(--fg)" }}>
                {formData.name}
              </div>
              <div style={{ fontSize: "13px", color: "var(--muted)", marginTop: "4px", lineHeight: 1.5 }}>
                {formData.address}
              </div>
            </div>

            {/* Radius */}
            <div style={{ marginBottom: "24px" }}>
              <div style={{
                display: "flex", alignItems: "center", justifyContent: "space-between",
                marginBottom: "14px",
              }}>
                <label style={{
                  fontSize: "13px", fontWeight: 700,
                  color: "#1e3a5f",
                }}>
                  Radius
                </label>
                <Info size={14} color="var(--muted)" style={{ cursor: "help" }} title="Geofence radius for the location" />
              </div>

              <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
                {radiusOptions.map((opt) => (
                  <label
                    key={opt.value}
                    style={{
                      display: "flex", alignItems: "center", gap: "12px",
                      cursor: "pointer", padding: "4px 0",
                    }}
                  >
                    <div
                      onClick={() => { setFormData({ ...formData, radius: opt.value }); setCustomRadius(false) }}
                      style={{
                        width: 22, height: 22, borderRadius: "50%",
                        border: formData.radius === opt.value && !customRadius
                          ? "2px solid #059669"
                          : "2px solid var(--stroke2)",
                        background: formData.radius === opt.value && !customRadius
                          ? "#059669"
                          : "transparent",
                        display: "flex", alignItems: "center", justifyContent: "center",
                        cursor: "pointer", transition: "all 0.15s",
                        flexShrink: 0,
                      }}
                    >
                      {formData.radius === opt.value && !customRadius && (
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                          <polyline points="20 6 9 17 4 12" />
                        </svg>
                      )}
                    </div>
                    <span style={{ fontSize: "14px", fontWeight: 600, color: "var(--fg)" }}>
                      {opt.label}
                    </span>
                    {opt.recommended && (
                      <span style={{
                        fontSize: "10px", fontWeight: 800,
                        color: "#F97316", border: "1px solid #F97316",
                        padding: "2px 8px", borderRadius: "4px",
                        letterSpacing: "0.5px",
                      }}>
                        RECOMMENDED
                      </span>
                    )}
                  </label>
                ))}

                {/* Custom radius */}
                <label style={{
                  display: "flex", alignItems: "center", gap: "12px",
                  cursor: "pointer", padding: "4px 0",
                }}>
                  <div
                    onClick={() => setCustomRadius(true)}
                    style={{
                      width: 22, height: 22, borderRadius: "50%",
                      border: customRadius ? "2px solid #059669" : "2px solid var(--stroke2)",
                      background: customRadius ? "#059669" : "transparent",
                      display: "flex", alignItems: "center", justifyContent: "center",
                      cursor: "pointer", transition: "all 0.15s",
                      flexShrink: 0,
                    }}
                  >
                    {customRadius && (
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                        <polyline points="20 6 9 17 4 12" />
                      </svg>
                    )}
                  </div>
                  <span style={{ fontSize: "14px", fontWeight: 600, color: "var(--fg)" }}>Custom radius</span>
                </label>
                {customRadius && (
                  <div style={{ marginLeft: 34 }}>
                    <input
                      type="number"
                      value={customRadiusValue}
                      onChange={(e) => {
                        setCustomRadiusValue(e.target.value)
                        setFormData({ ...formData, radius: parseInt(e.target.value) || 300 })
                      }}
                      placeholder="Enter radius in meters"
                      style={{
                        width: "100%", padding: "10px 12px",
                        border: "1px solid var(--stroke)", borderRadius: "8px",
                        fontSize: "13px", fontWeight: 500,
                        color: "var(--fg)", background: "var(--bg)",
                        outline: "none", fontFamily: "inherit",
                        boxSizing: "border-box",
                      }}
                      onFocus={(e) => (e.target.style.borderColor = "#F97316")}
                      onBlur={(e) => (e.target.style.borderColor = "var(--stroke)")}
                    />
                    {formData.radius < 300 && (
                      <div style={{ marginTop: 8, fontSize: 11, color: "#EF4444", fontWeight: 600, display: "flex", gap: 4, alignItems: "flex-start" }}>
                        <span style={{ fontSize: 14, lineHeight: "14px" }}>⚠️</span>
                        <span>Radius below 300 meters disables automatic clock in/out and GPS reminders.</span>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Panel Footer */}
          <div style={{
            padding: "16px 24px",
            borderTop: "1px solid var(--stroke)",
            display: "flex", justifyContent: "center", gap: "16px",
          }}>
            <button
              onClick={() => setShowAddPanel(false)}
              style={{
                padding: "10px 28px", borderRadius: "8px",
                border: "none", background: "transparent",
                color: "#059669", fontSize: "14px", fontWeight: 700,
                cursor: "pointer",
              }}
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              disabled={saving}
              style={{
                padding: "10px 32px", borderRadius: "8px",
                border: "none",
                background: saving
                  ? "#9ca3af"
                  : "linear-gradient(135deg, #F97316 0%, #ea580c 100%)",
                color: "white", fontSize: "14px", fontWeight: 700,
                cursor: saving ? "not-allowed" : "pointer",
                boxShadow: "0 4px 14px rgba(249,115,22,0.3)",
                transition: "all 0.2s",
                minWidth: 100,
              }}
              onMouseEnter={(e) => {
                if (!saving) e.currentTarget.style.transform = "translateY(-1px)"
              }}
              onMouseLeave={(e) => (e.currentTarget.style.transform = "none")}
            >
              {saving ? "Saving..." : "Save"}
            </button>
          </div>
        </div>
      )}

      <style>{`
        @keyframes stSlideIn {
          from { opacity: 0; transform: translateX(16px); }
          to   { opacity: 1; transform: translateX(0); }
        }
      `}</style>
    </div>
  )
}
