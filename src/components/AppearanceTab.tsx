import { Check, Palette } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import { useUserPreferences } from "@/hooks/useUserPreferences";
import { useAuth } from "@/hooks/useAuth";
import { useTheme } from "next-themes";
import { cn } from "@/lib/utils";
import {
  applyThemeToDocument,
  DAISY_THEMES,
  DaisyThemeName,
  getStoredTheme,
  isDarkTheme,
  resolveTheme,
  setStoredTheme,
} from "@/lib/themePreferences";
import { useEffect, useMemo, useState } from "react";

export const AppearanceTab = () => {
  const { preferences, updatePreferences, isUpdating } = useUserPreferences();
  const { user } = useAuth();
  const { setTheme } = useTheme();
  const [selectedTheme, setSelectedTheme] = useState<DaisyThemeName>("forest");

  useEffect(() => {
    const persisted = getStoredTheme(user?.id);
    const fallback = preferences.dark_mode ? "dark" : "light";
    const resolved = resolveTheme(persisted || fallback);
    setSelectedTheme(resolved);
  }, [preferences.dark_mode, user?.id]);

  const activeThemeLabel = useMemo(
    () => DAISY_THEMES.find((theme) => theme.name === selectedTheme)?.label || selectedTheme,
    [selectedTheme]
  );

  const handleThemeChange = (themeName: DaisyThemeName) => {
    const previousTheme = selectedTheme;
    setSelectedTheme(themeName);
    applyThemeToDocument(themeName);
    setStoredTheme(themeName, user?.id);

    const darkMode = isDarkTheme(themeName);
    setTheme(darkMode ? "dark" : "light");

    updatePreferences(
      { dark_mode: darkMode },
      {
        onError: () => {
          // Preserve the user's previous theme choice instead of collapsing to dark/light.
          setSelectedTheme(previousTheme);
          applyThemeToDocument(previousTheme);
          setStoredTheme(previousTheme, user?.id);
          setTheme(isDarkTheme(previousTheme) ? "dark" : "light");
        },
      }
    );
  };

  const handleCompactViewToggle = (value: boolean) => {
    // Optimistically apply compact view class
    if (value) {
      document.body.classList.add("compact-view");
    } else {
      document.body.classList.remove("compact-view");
    }

    updatePreferences(
      { compact_view: value },
      {
        onError: () => {
          // Revert compact view class on failure
          if (preferences.compact_view) {
            document.body.classList.add("compact-view");
          } else {
            document.body.classList.remove("compact-view");
          }
        },
      }
    );
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Palette className="h-5 w-5" />
          Appearance Settings
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label>Theme</Label>
              <p className="text-sm text-muted-foreground">
                Pick a theme. Changes apply instantly and are saved to your preference.
              </p>
            </div>
            <div className="badge badge-outline text-xs">{activeThemeLabel}</div>
          </div>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
            {DAISY_THEMES.map((themeOption) => {
              const isActive = selectedTheme === themeOption.name;
              return (
                <button
                  key={themeOption.name}
                  type="button"
                  onClick={() => handleThemeChange(themeOption.name)}
                  disabled={isUpdating}
                  className={cn(
                    "group relative rounded-xl border bg-base-100 p-2 text-left transition-all",
                    "hover:border-primary/50 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50",
                    isActive && "border-primary shadow-md ring-1 ring-primary/40",
                    isUpdating && "cursor-not-allowed opacity-70"
                  )}
                >
                  <div className="mb-2 flex h-5 items-center justify-between">
                    <span className="text-xs font-medium text-base-content/90">{themeOption.label}</span>
                    {isActive && (
                      <span className="inline-flex h-4 w-4 items-center justify-center rounded-full bg-primary text-primary-content">
                        <Check className="h-3 w-3" />
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-1.5">
                    {themeOption.swatch.map((color) => (
                      <span
                        key={`${themeOption.name}-${color}`}
                        className="h-4 flex-1 rounded-md border border-base-300/50"
                        style={{ backgroundColor: color }}
                      />
                    ))}
                  </div>
                </button>
              );
            })}
          </div>
        </div>
        <Separator />
        <div className="flex items-center justify-between">
          <div className="space-y-0.5">
            <Label>Compact View</Label>
            <p className="text-sm text-muted-foreground">
              Use a more compact layout for tables and lists
            </p>
          </div>
          <Switch 
            checked={preferences.compact_view}
            onCheckedChange={handleCompactViewToggle}
            disabled={isUpdating}
          />
        </div>
      </CardContent>
    </Card>
  );
};
