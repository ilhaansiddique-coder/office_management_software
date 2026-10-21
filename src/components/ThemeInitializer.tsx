import { useEffect } from "react";
import { useTheme } from "next-themes";
import { useUserPreferences } from "@/hooks/useUserPreferences";
import { useAuth } from "@/hooks/useAuth";
import {
  applyThemeToDocument,
  getStoredTheme,
  isDarkTheme,
  resolveTheme,
  setStoredTheme,
} from "@/lib/themePreferences";

export const ThemeInitializer = () => {
  const { theme, setTheme } = useTheme();
  const { preferences, isLoading } = useUserPreferences();
  const { user } = useAuth();

  // Initialize theme from user preferences once loaded
  useEffect(() => {
    if (isLoading) return;

    const persisted = getStoredTheme(user?.id);
    const fallback = preferences.dark_mode ? "dark" : "light";
    const nextTheme = resolveTheme(persisted || fallback);

    applyThemeToDocument(nextTheme);
    setStoredTheme(nextTheme, user?.id);

    const nextMode = isDarkTheme(nextTheme) ? "dark" : "light";
    if (theme !== nextMode) {
      setTheme(nextMode);
    }
  }, [isLoading, preferences.dark_mode, theme, setTheme, user?.id]);

  // Apply compact view from user preferences
  useEffect(() => {
    if (isLoading) return;
    
    if (preferences.compact_view) {
      document.body.classList.add("compact-view");
    } else {
      document.body.classList.remove("compact-view");
    }
  }, [isLoading, preferences.compact_view]);

  return null;
};
