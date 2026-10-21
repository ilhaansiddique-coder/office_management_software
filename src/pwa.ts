import { registerSW } from "virtual:pwa-register";
import { toast } from "@/utils/toast";

let updateSW: ((reload?: boolean) => Promise<void>) | null = null;

const clearBrowserCaches = async () => {
  if (!("caches" in window)) return;
  const keys = await caches.keys();
  await Promise.all(keys.map((key) => caches.delete(key)));
};

const hardReload = () => {
  const url = new URL(window.location.href);
  url.searchParams.set("pwa_refresh", String(Date.now()));
  window.location.replace(url.toString());
};

export const applyUpdate = async () => {
  try {
    if ("serviceWorker" in navigator) {
      const registrations = await navigator.serviceWorker.getRegistrations();
      await Promise.all(registrations.map((registration) => registration.unregister()));
    }
    await clearBrowserCaches();
    if (updateSW) {
      await updateSW(true);
      hardReload();
      return;
    }
  } catch (error) {
    console.warn("PWA update failed:", error);
  }

  hardReload();
};

export const promptUpdate = (message = "Update available. Refresh to get the latest version.") => {
  const event = new CustomEvent("pwa-update-available", { detail: { message } });
  window.dispatchEvent(event);
};

export const initPwa = () => {
  if (typeof window === "undefined" || updateSW) return;
  if (import.meta.env.DEV) {
    const cleanupDevPwa = async () => {
      try {
        if ("serviceWorker" in navigator) {
          const registrations = await navigator.serviceWorker.getRegistrations();
          await Promise.all(registrations.map((registration) => registration.unregister()));
        }
        await clearBrowserCaches();

        // If a stale service worker is still controlling localhost, force one clean reload.
        if (navigator.serviceWorker?.controller && !sessionStorage.getItem("dev-pwa-cleanup-done")) {
          sessionStorage.setItem("dev-pwa-cleanup-done", "1");
          window.location.reload();
        }
      } catch {
        // Ignore cleanup errors in dev
      }
    };

    void cleanupDevPwa();
    return;
  }

  updateSW = registerSW({
    immediate: true,
    onNeedRefresh() {
      promptUpdate();
    },
    onOfflineReady() {
      toast.info("App ready for offline use.", { duration: 4000 });
    },
  });

  const checkUpdate = async () => {
    if ("serviceWorker" in navigator) {
      try {
        const r = await navigator.serviceWorker.getRegistration();
        if (r) {
          await r.update();
        }
      } catch (err) {
        console.warn("SW update check failed", err);
      }
    }
  };

  // Check for updates when the app comes back to the foreground
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") {
      void checkUpdate();
    }
  });
};
