import { useEffect, useRef } from "react";
import { useBusinessSettings } from "@/hooks/useBusinessSettings";

const DEFAULT_MANIFEST = "/manifest.webmanifest";
const DEFAULT_APPLE_ICON = "/icons/apple-touch-icon.png";
const FALLBACK_NAME = "Sales Management System";
const FALLBACK_SHORT_NAME = "Rahestock";

type IconSpec = {
  src: string;
  sizes: string;
  type: string;
  purpose?: string;
};

const ensureLink = (rel: string, href: string) => {
  let link = document.querySelector<HTMLLinkElement>(`link[rel="${rel}"]`);
  if (!link) {
    link = document.createElement("link");
    link.rel = rel;
    document.head.appendChild(link);
  }
  link.href = href;
  return link;
};

const createIconDataUrl = (src: string, size: number, paddingRatio: number) =>
  new Promise<string>((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      try {
        const canvas = document.createElement("canvas");
        canvas.width = size;
        canvas.height = size;
        const ctx = canvas.getContext("2d");
        if (!ctx) {
          reject(new Error("Canvas not supported"));
          return;
        }
        ctx.fillStyle = "white";
        ctx.fillRect(0, 0, size, size);

        const padding = size * paddingRatio;
        const maxSize = size - padding * 2;
        const scale = Math.min(maxSize / img.width, maxSize / img.height);
        const drawWidth = img.width * scale;
        const drawHeight = img.height * scale;
        const dx = (size - drawWidth) / 2;
        const dy = (size - drawHeight) / 2;
        ctx.drawImage(img, dx, dy, drawWidth, drawHeight);
        resolve(canvas.toDataURL("image/png"));
      } catch (error) {
        reject(error as Error);
      }
    };
    img.onerror = () => reject(new Error("Failed to load logo"));
    img.src = src;
  });

export const PwaBranding = () => {
  const { businessSettings } = useBusinessSettings();
  const objectUrlRef = useRef<string | null>(null);

  useEffect(() => {
    const userAgent = typeof navigator !== "undefined" ? navigator.userAgent.toLowerCase() : "";
    const logoUrl = businessSettings?.logo_url?.trim();

    const manifestLink = ensureLink("manifest", DEFAULT_MANIFEST);
    const appleLink = ensureLink("apple-touch-icon", DEFAULT_APPLE_ICON);
    const faviconLink = ensureLink("icon", "/favicon.ico");

    const revokeObjectUrl = () => {
      if (objectUrlRef.current) {
        URL.revokeObjectURL(objectUrlRef.current);
        objectUrlRef.current = null;
      }
    };

    if (!logoUrl) {
      revokeObjectUrl();
      manifestLink.href = DEFAULT_MANIFEST;
      appleLink.href = DEFAULT_APPLE_ICON;
      faviconLink.href = "/favicon.ico";
      return;
    }

    let isCancelled = false;

    const updateManifest = async () => {
      try {
        const [icon192, icon512, mask192, mask512, apple180, favicon] = await Promise.all([
          createIconDataUrl(logoUrl, 192, 0.12),
          createIconDataUrl(logoUrl, 512, 0.12),
          createIconDataUrl(logoUrl, 192, 0.22),
          createIconDataUrl(logoUrl, 512, 0.22),
          createIconDataUrl(logoUrl, 180, 0.12),
          createIconDataUrl(logoUrl, 64, 0.12),
        ]);

        if (isCancelled) return;

        revokeObjectUrl();
        manifestLink.href = DEFAULT_MANIFEST;
        appleLink.href = apple180;
        faviconLink.href = favicon;
      } catch {
        revokeObjectUrl();
        manifestLink.href = DEFAULT_MANIFEST;
        appleLink.href = DEFAULT_APPLE_ICON;
        faviconLink.href = "/favicon.ico";
      }
    };

    updateManifest();

    return () => {
      isCancelled = true;
      revokeObjectUrl();
    };
  }, [businessSettings?.business_name, businessSettings?.logo_url]);

  return null;
};
