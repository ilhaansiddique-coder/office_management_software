import { useEffect, useState } from "react";
import { Download } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>;
};

export const InstallAppTab = () => {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [isInstalled, setIsInstalled] = useState(false);
  const [isIOS, setIsIOS] = useState(false);

  useEffect(() => {
    const userAgent = navigator.userAgent.toLowerCase();
    setIsIOS(/iphone|ipad|ipod/.test(userAgent));

    const isStandalone =
      window.matchMedia("(display-mode: standalone)").matches ||
      (navigator as any).standalone;
    if (isStandalone) {
      setIsInstalled(true);
    }

    const handleBeforeInstallPrompt = (event: Event) => {
      event.preventDefault();
      setDeferredPrompt(event as BeforeInstallPromptEvent);
    };

    const handleAppInstalled = () => {
      setIsInstalled(true);
      setDeferredPrompt(null);
    };

    window.addEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
    window.addEventListener("appinstalled", handleAppInstalled);

    return () => {
      window.removeEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
      window.removeEventListener("appinstalled", handleAppInstalled);
    };
  }, []);

  const handleInstallClick = async () => {
    if (!deferredPrompt) return;
    await deferredPrompt.prompt();
    const choice = await deferredPrompt.userChoice;
    if (choice.outcome === "accepted") {
      setIsInstalled(true);
    }
    setDeferredPrompt(null);
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Download className="h-5 w-5" />
          Install App
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {isInstalled ? (
          <p className="text-sm text-muted-foreground">
            The app is already installed on this device.
          </p>
        ) : isIOS ? (
          <div className="space-y-2 text-sm text-muted-foreground">
            <p>Install is available on iOS via Safari.</p>
            <p>
              Tap Share, then choose "Add to Home Screen".
            </p>
          </div>
        ) : deferredPrompt ? (
          <div className="space-y-2">
            <p className="text-sm text-muted-foreground">
              Install the app for faster access and offline support.
            </p>
            <Button onClick={handleInstallClick} className="gap-2">
              <Download className="h-4 w-4" />
              Install App
            </Button>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">
            Install is not available yet. Open the app in Chrome over HTTPS and
            wait a moment, then try again.
          </p>
        )}
      </CardContent>
    </Card>
  );
};
