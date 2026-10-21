import React, { useEffect, useState } from "react";
import { applyUpdate } from "@/pwa";
import { DownloadCloud } from "lucide-react";

export const PwaUpdateModal = () => {
  const [show, setShow] = useState(false);
  const [message, setMessage] = useState("A new version of the app is available.");

  useEffect(() => {
    const handleUpdate = (e: Event) => {
      const customEvent = e as CustomEvent<{ message?: string }>;
      if (customEvent.detail?.message) {
        setMessage(customEvent.detail.message);
      }
      setShow(true);
    };

    window.addEventListener("pwa-update-available", handleUpdate);
    return () => {
      window.removeEventListener("pwa-update-available", handleUpdate);
    };
  }, []);

  if (!show) return null;

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-background/80 backdrop-blur-md">
      <div className="flex flex-col items-center justify-center p-8 bg-card border border-border rounded-xl shadow-2xl max-w-sm w-full mx-4 animate-in fade-in zoom-in duration-300">
        <div className="h-16 w-16 bg-primary/10 text-primary rounded-full flex items-center justify-center mb-6">
          <DownloadCloud className="h-8 w-8" />
        </div>
        <h2 className="text-2xl font-bold text-card-foreground mb-2 text-center">Update Available</h2>
        <p className="text-muted-foreground text-center mb-8">
          {message}
        </p>
        <button
          onClick={() => void applyUpdate()}
          className="w-full bg-primary text-primary-foreground hover:bg-primary/90 h-12 rounded-lg font-medium transition-colors flex items-center justify-center gap-2"
        >
          <DownloadCloud className="h-5 w-5" />
          Update Now
        </button>
      </div>
    </div>
  );
};
