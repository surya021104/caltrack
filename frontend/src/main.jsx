import { StrictMode } from "react"
import { createRoot } from "react-dom/client"
import { BrowserRouter } from "react-router-dom"
import { GoogleOAuthProvider } from "@react-oauth/google"
import { Provider as ReduxProvider } from "react-redux"

import { store } from "./store/store.js"
import { AuthProvider } from "./state/auth/AuthProvider.jsx"
import { App } from "./ui/App.jsx"
import { initTheme } from "./ui/theme.js"
import "./ui/styles.css"

initTheme()

const googleClientId = import.meta.env.VITE_GOOGLE_CLIENT_ID || "mock-client-id.apps.googleusercontent.com"

createRoot(document.getElementById("root")).render(
  <StrictMode>
    <ReduxProvider store={store}>
      <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <GoogleOAuthProvider clientId={googleClientId}>
          <AuthProvider>
            <App />
          </AuthProvider>
        </GoogleOAuthProvider>
      </BrowserRouter>
    </ReduxProvider>
  </StrictMode>
)
