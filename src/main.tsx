import { createRoot } from 'react-dom/client'
import App from './App.tsx'
import ErrorBoundary from './components/ErrorBoundary.tsx'
import './index.css'
import { initPwa } from "@/pwa";
import { applyThemeToDocument, getStoredTheme, resolveTheme } from "@/lib/themePreferences";

if (!import.meta.env.DEV) {
  console.log = () => { };
  console.info = () => { };
  console.warn = () => { };
  console.error = () => { };
  console.debug = () => { };
}

initPwa();

// Apply the persisted DaisyUI theme before React mounts to avoid theme flash/override.
const bootTheme = resolveTheme(getStoredTheme());
applyThemeToDocument(bootTheme);

createRoot(document.getElementById("root")!).render(
  <ErrorBoundary>
    <App />
  </ErrorBoundary>
);
