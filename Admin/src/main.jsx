import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AuthProvider } from "./auth/AuthContext.jsx";
import { ToastProvider } from "./components/Toast.jsx";
import App from "./App.jsx";
import StartupScreen from "./components/BrandLoadingScreen.jsx";
import "@fontsource/geist/400.css";
import "@fontsource/geist/500.css";
import "@fontsource/geist/600.css";
import "@fontsource/geist/700.css";
import "@fontsource/geist-mono/400.css";
import "@fontsource/plus-jakarta-sans/400.css";
import "@fontsource/plus-jakarta-sans/500.css";
import "@fontsource/plus-jakarta-sans/600.css";
import "@fontsource/plus-jakarta-sans/700.css";
import "./styles/tokens.css";
import "./styles/layout.css";
import "./styles/editors.css";
import "./styles/cells.css";
import "./styles/table.css";
import "./styles/dashboard.css";
import "./styles/analytics.css";
import "./styles/analytics-enhancements.css";
import "./styles/website.css";
import "./styles/links.css";
import "./styles/section-tabs.css";
import "./styles/forms.css";
import "./styles/inbox.css";
import "./styles/access.css";
import "./styles/profile.css";
import "./styles/weekly-report.css";
import "./styles/edge-insets.css";
import "./styles/system-health.css";
import "./styles/analytics-health.css";
import "./styles/dashboard-health-override.css";
import "./styles/density.css";
import faviconUrl from "../../Website/assets/images/kc_logo_small_icon.ico";

const emailBodySelector = ".inbox-message-body-viewport";
const isEmailBodyTarget = target => target instanceof Element && Boolean(target.closest(emailBodySelector));
const preventZoomOutsideEmailBody = event => {
  if (!isEmailBodyTarget(event.target)) event.preventDefault();
};
const preventPinchOutsideEmailBody = event => {
  if (event.touches?.length > 1 && !isEmailBodyTarget(event.target)) event.preventDefault();
};
document.addEventListener("touchmove", preventPinchOutsideEmailBody, { passive:false });
document.addEventListener("gesturestart", preventZoomOutsideEmailBody, { passive:false });
document.addEventListener("gesturechange", preventZoomOutsideEmailBody, { passive:false });
document.addEventListener("gestureend", preventZoomOutsideEmailBody, { passive:false });
document.addEventListener("wheel", event => {
  if (event.ctrlKey && !isEmailBodyTarget(event.target)) event.preventDefault();
}, { passive:false });

const appVersion = __APP_VERSION__;
try {
  const previousVersion = localStorage.getItem("karamah-admin-version");
  if (previousVersion && previousVersion !== appVersion && "caches" in window) {
    caches.keys().then((names) => Promise.all(names.map((name) => caches.delete(name)))).catch(() => {});
  }
  localStorage.setItem("karamah-admin-version", appVersion);
} catch {}

const favicon = document.querySelector('link[rel="icon"]') || document.createElement("link");
favicon.rel = "icon";
favicon.href = faviconUrl;
document.head.appendChild(favicon);

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: 1, staleTime: 15_000 } },
});

createRoot(document.getElementById("root")).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <ToastProvider>
          <StartupScreen />
          <App />
        </ToastProvider>
      </AuthProvider>
    </QueryClientProvider>
  </StrictMode>,
);
