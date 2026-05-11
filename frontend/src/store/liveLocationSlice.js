/**
 * Redux Toolkit slice for live location tracking.
 *
 * State shape:
 *   connected       – bool: WebSocket connected to admin stream
 *   employees       – { [employee_id]: EmployeeState }
 *   sosAlerts       – SOSAlert[]  (newest first)
 *   geofenceBreaches – GeofenceBreach[]  (newest first, capped at 50)
 *
 * EmployeeState:
 *   employee_id, employee_name, lat, lng, timestamp, status,
 *   worked_seconds, time_log_id, clock_in_photo, job_site_name,
 *   clock_in, last_seen (epoch ms), presence (computed by UI timer)
 */
import { createSlice } from "@reduxjs/toolkit"

const MAX_BREACHES = 50
const MAX_SOS = 100

const initialState = {
  connected: false,
  employees: {},
  sosAlerts: [],
  geofenceBreaches: [],
}

const liveLocationSlice = createSlice({
  name: "liveLocation",
  initialState,
  reducers: {
    setConnected(state, { payload }) {
      state.connected = payload
    },

    /** Replace entire state from WS snapshot on connect */
    applySnapshot(state, { payload }) {
      const { employees = [], sos_alerts = [] } = payload
      state.employees = {}
      for (const emp of employees) {
        state.employees[emp.employee_id] = {
          ...emp,
          last_seen: Date.now(),
        }
      }
      state.sosAlerts = sos_alerts
    },

    /** Merge a single employee ping update */
    applyEmployeePing(state, { payload }) {
      const { employee_id } = payload
      state.employees[employee_id] = {
        ...(state.employees[employee_id] || {}),
        ...payload,
        last_seen: Date.now(),
      }
    },

    /** Add a new SOS alert (keep newest first, cap at MAX_SOS) */
    addSosAlert(state, { payload }) {
      state.sosAlerts.unshift(payload)
      if (state.sosAlerts.length > MAX_SOS) state.sosAlerts.length = MAX_SOS
    },

    /** Mark a SOS alert as acknowledged */
    acknowledgeSos(state, { payload: { sos_id, acknowledged_by } }) {
      const sos = state.sosAlerts.find((s) => s.id === sos_id)
      if (sos) {
        sos.status = "acknowledged"
        sos.acknowledged_by = acknowledged_by
      }
    },

    /** Add a geofence breach event (capped at MAX_BREACHES) */
    addGeofenceBreach(state, { payload }) {
      state.geofenceBreaches.unshift(payload)
      if (state.geofenceBreaches.length > MAX_BREACHES) {
        state.geofenceBreaches.length = MAX_BREACHES
      }
    },

    /** Remove a disconnected / clocked-out employee from the map */
    removeEmployee(state, { payload: employee_id }) {
      delete state.employees[employee_id]
    },

    /** Recompute derived 'presence' field based on last_seen timestamp.
     *  Called by a UI timer every 60 s so idle/offline badges update. */
    refreshPresence(state) {
      const now = Date.now()
      for (const id of Object.keys(state.employees)) {
        const emp = state.employees[id]
        const ageMs = now - (emp.last_seen || 0)
        const ageMin = ageMs / 60_000

        // Don't override on_break or outside_geofence — only refresh active
        if (emp.status === "active") {
          if (ageMin > 30) emp.status = "offline"
          else if (ageMin > 15) emp.status = "idle"
        }
      }
    },
  },
})

export const {
  setConnected,
  applySnapshot,
  applyEmployeePing,
  addSosAlert,
  acknowledgeSos,
  addGeofenceBreach,
  removeEmployee,
  refreshPresence,
} = liveLocationSlice.actions

export default liveLocationSlice.reducer

// ── Selectors ──────────────────────────────────────────────────────────────

export const selectEmployeeList = (state) =>
  Object.values(state.liveLocation.employees)

export const selectActiveSosAlerts = (state) =>
  state.liveLocation.sosAlerts.filter((s) => s.status === "active")

export const selectConnected = (state) => state.liveLocation.connected
