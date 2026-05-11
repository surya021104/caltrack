import { lazy, Suspense } from "react"
import { Navigate, Route, Routes } from "react-router-dom"
import { useAuth } from "../state/auth/useAuth.js"
import { routes } from "./routes.js"
import { AppShell } from "./shell/AppShell.jsx"
import { SessionToast } from "./components/SessionToast.jsx"
import { LoginPage } from "./pages/LoginPage.jsx"

// Lazy-loaded Pages
const DashboardPage = lazy(() =>
  import("./pages/DashboardPage.jsx").then(m => ({ default: m.DashboardPage }))
)

const LocationsPage = lazy(() =>
  import("./pages/LocationsPage.jsx").then(m => ({ default: m.LocationsPage }))
)

const EmployeesPage = lazy(() =>
  import("./pages/EmployeesPage.jsx").then(m => ({ default: m.EmployeesPage }))
)

const LeavesPage = lazy(() =>
  import("./pages/LeavesPage.jsx").then(m => ({ default: m.LeavesPage }))
)

const PayrollPage = lazy(() =>
  import("./pages/PayrollPage.jsx").then(m => ({ default: m.PayrollPage }))
)

const ReportsPage = lazy(() =>
  import("./pages/ReportsPage.jsx").then(m => ({ default: m.ReportsPage }))
)

const SchedulingPage = lazy(() =>
  import("./pages/SchedulingPage.jsx").then(m => ({ default: m.SchedulingPage }))
)

const TasksPage = lazy(() =>
  import("./pages/TasksPage.jsx").then(m => ({ default: m.TasksPage }))
)

const TimePage = lazy(() =>
  import("./pages/TimePage.jsx").then(m => ({ default: m.TimePage }))
)

const SettingsPage = lazy(() =>
  import("./pages/SettingsPage.jsx").then(m => ({ default: m.SettingsPage }))
)

const GetStartedPage = lazy(() =>
  import("./pages/GetStartedPage.jsx").then(m => ({ default: m.GetStartedPage }))
)

const LiveLocationsPage = lazy(() =>
  import("./pages/LiveLocationsPage.jsx").then(m => ({ default: m.LiveLocationsPage }))
)

const PeopleSettingsPage = lazy(() =>
  import("./pages/PeopleSettingsPage.jsx").then(m => ({ default: m.PeopleSettingsPage }))
)

const TimeTrackingSettingsPage = lazy(() =>
  import("./pages/TimeTrackingSettingsPage.jsx").then(m => ({ default: m.TimeTrackingSettingsPage }))
)

const WorkSchedulesSettingsPage = lazy(() =>
  import("./pages/WorkSchedulesSettingsPage.jsx").then(m => ({ default: m.WorkSchedulesSettingsPage }))
)

const HolidaysSettingsPage = lazy(() =>
  import("./pages/HolidaysSettingsPage.jsx").then(m => ({ default: m.HolidaysSettingsPage }))
)

const LocationsSettingsPage = lazy(() =>
  import("./pages/LocationsSettingsPage.jsx").then(m => ({ default: m.LocationsSettingsPage }))
)

const CompliancePage = lazy(() =>
  import("./pages/CompliancePage.jsx").then(m => ({ default: m.CompliancePage }))
)

export function App() {
  const { isReady, user } = useAuth()

  const PageLoader = () => (
    <div className="flex items-center justify-center min-h-[400px] w-full">
      <div className="w-8 h-8 border-4 border-slate-200 border-t-indigo-600 rounded-full animate-spin" />
    </div>
  )

  if (!isReady)
    return (
      <div
        style={{
          position: "fixed",
          inset: 0,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "var(--bg, #f8fafc)",
        }}
      >
        <div
          style={{
            width: 36,
            height: 36,
            borderRadius: "50%",
            border: "3px solid var(--stroke, #e2e8f0)",
            borderTopColor: "#4F46E5",
            animation: "spin 0.8s linear infinite",
          }}
        />
        <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
      </div>
    )

  return (
    <>
      <Suspense fallback={<PageLoader />}>
        <Routes>
          <Route
            path={routes.login}
            element={
              user ? (
                user.companyId ? (
                  <Navigate to={routes.get_started} replace />
                ) : (
                  <Navigate to={routes.onboarding} replace />
                )
              ) : (
                <LoginPage />
              )
            }
          />

          <Route
            path={routes.onboarding}
            element={<Navigate to={routes.login} replace />}
          />

          <Route
            element={
              user ? (
                user.companyId ? (
                  <AppShell />
                ) : (
                  <Navigate to={routes.onboarding} replace />
                )
              ) : (
                <Navigate to={routes.login} replace />
              )
            }
          >
            <Route path={routes.get_started} element={<GetStartedPage />} />
            <Route path={routes.dashboard} element={<DashboardPage />} />
            <Route path={routes.locations} element={<LocationsPage />} />
            <Route path={routes.live_locations} element={<LiveLocationsPage />} />
            <Route path={routes.time} element={<TimePage />} />
            <Route path={routes.tasks} element={<TasksPage />} />
            <Route path={routes.leaves} element={<LeavesPage />} />
            <Route path={routes.payroll} element={<PayrollPage />} />
            <Route path={routes.scheduling} element={<SchedulingPage />} />
            <Route path={routes.employees} element={<EmployeesPage />} />
            <Route path={routes.reports} element={<ReportsPage />} />
            <Route path={routes.compliance} element={<CompliancePage />} />

            {/* Settings Routes */}
            <Route path={routes.settings} element={<SettingsPage />} />
            <Route path={routes.settings_profile} element={<SettingsPage section="profile" />} />
            <Route path={routes.settings_preferences} element={<SettingsPage section="preferences" />} />
            <Route path={routes.settings_people} element={<PeopleSettingsPage />} />
            <Route path={routes.settings_timetracking} element={<TimeTrackingSettingsPage />} />
            <Route path={routes.settings_attendance} element={<SettingsPage section="attendance" />} />
            <Route path={routes.settings_schedules} element={<WorkSchedulesSettingsPage />} />
            <Route path={routes.settings_shiftplanner} element={<SettingsPage section="shift-planner" />} />
            <Route path={routes.settings_holidays} element={<HolidaysSettingsPage />} />
            <Route path={routes.settings_payroll} element={<SettingsPage section="payroll" />} />
            <Route path={routes.settings_expenses} element={<SettingsPage section="expenses" />} />
            <Route path={routes.settings_workflows} element={<SettingsPage section="workflows" />} />
            <Route path={routes.settings_productivity} element={<SettingsPage section="productivity" />} />
            <Route path={routes.settings_reports} element={<SettingsPage section="reports" />} />
            <Route path={routes.settings_notifications} element={<SettingsPage section="notifications" />} />
            <Route path={routes.settings_security} element={<SettingsPage section="security" />} />
            <Route path={routes.settings_rbac} element={<SettingsPage section="rbac" />} />
            <Route path={routes.settings_audit} element={<SettingsPage section="audit" />} />
            <Route path={routes.settings_devices} element={<SettingsPage section="devices" />} />
            <Route path={routes.settings_location} element={<LocationsSettingsPage />} />
            <Route path={routes.settings_branding} element={<SettingsPage section="branding" />} />
            <Route path={routes.settings_organization} element={<SettingsPage section="organization" />} />
            <Route path={routes.settings_integrations} element={<SettingsPage section="integrations" />} />
            <Route path={routes.settings_developer} element={<SettingsPage section="developer" />} />
            <Route path={routes.settings_billing} element={<SettingsPage section="billing" />} />
            <Route path={routes.settings_data} element={<SettingsPage section="data" />} />
          </Route>

          <Route path="*" element={<Navigate to={routes.dashboard} replace />} />
        </Routes>
      </Suspense>
      <SessionToast />
    </>
  )
}