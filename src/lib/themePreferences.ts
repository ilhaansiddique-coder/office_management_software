export type DaisyThemeName =
  | "light"
  | "dark"
  | "cupcake"
  | "bumblebee"
  | "emerald"
  | "corporate"
  | "synthwave"
  | "retro"
  | "cyberpunk"
  | "valentine"
  | "halloween"
  | "garden"
  | "forest"
  | "aqua"
  | "lofi"
  | "pastel"
  | "fantasy"
  | "wireframe"
  | "black"
  | "luxury"
  | "dracula"
  | "cmyk"
  | "autumn"
  | "business"
  | "acid"
  | "lemonade"
  | "night"
  | "coffee"
  | "winter"
  | "dim"
  | "nord"
  | "sunset"
  | "caramellatte"
  | "abyss"
  | "silk";

export interface DaisyThemeOption {
  name: DaisyThemeName;
  label: string;
  dark: boolean;
  swatch: [string, string, string];
}

export const DAISY_THEMES: DaisyThemeOption[] = [
  { name: "light", label: "Light", dark: false, swatch: ["#ffffff", "#f1f5f9", "#2563eb"] },
  { name: "dark", label: "Dark", dark: true, swatch: ["#1e293b", "#334155", "#8b5cf6"] },
  { name: "cupcake", label: "Cupcake", dark: false, swatch: ["#faf7f5", "#f5d0fe", "#67e8f9"] },
  { name: "bumblebee", label: "Bumblebee", dark: false, swatch: ["#fff8d6", "#facc15", "#f59e0b"] },
  { name: "emerald", label: "Emerald", dark: false, swatch: ["#ecfdf5", "#34d399", "#6366f1"] },
  { name: "corporate", label: "Corporate", dark: false, swatch: ["#f8fafc", "#93c5fd", "#334155"] },
  { name: "synthwave", label: "Synthwave", dark: true, swatch: ["#1a1033", "#ff5db1", "#60a5fa"] },
  { name: "retro", label: "Retro", dark: false, swatch: ["#f9f4e8", "#f59e0b", "#86efac"] },
  { name: "cyberpunk", label: "Cyberpunk", dark: false, swatch: ["#fef08a", "#f43f5e", "#22d3ee"] },
  { name: "valentine", label: "Valentine", dark: false, swatch: ["#fff1f2", "#fb7185", "#ec4899"] },
  { name: "halloween", label: "Halloween", dark: true, swatch: ["#1f1b16", "#f97316", "#a855f7"] },
  { name: "garden", label: "Garden", dark: false, swatch: ["#f9fafb", "#ef4444", "#84cc16"] },
  { name: "forest", label: "Forest", dark: true, swatch: ["#1f2622", "#22c55e", "#14b8a6"] },
  { name: "aqua", label: "Aqua", dark: true, swatch: ["#1d3557", "#22d3ee", "#c084fc"] },
  { name: "lofi", label: "Lofi", dark: false, swatch: ["#ffffff", "#e5e7eb", "#111827"] },
  { name: "pastel", label: "Pastel", dark: false, swatch: ["#fff7ed", "#f9a8d4", "#86efac"] },
  { name: "fantasy", label: "Fantasy", dark: false, swatch: ["#f8fafc", "#d946ef", "#0ea5e9"] },
  { name: "wireframe", label: "Wireframe", dark: false, swatch: ["#ffffff", "#d4d4d8", "#52525b"] },
  { name: "black", label: "Black", dark: true, swatch: ["#000000", "#1f2937", "#4b5563"] },
  { name: "luxury", label: "Luxury", dark: true, swatch: ["#1a1a1a", "#ffffff", "#d4af37"] },
  { name: "dracula", label: "Dracula", dark: true, swatch: ["#282a36", "#ff79c6", "#f1fa8c"] },
  { name: "cmyk", label: "CMYK", dark: false, swatch: ["#ffffff", "#2563eb", "#ef4444"] },
  { name: "autumn", label: "Autumn", dark: false, swatch: ["#fafaf9", "#b45309", "#dc2626"] },
  { name: "business", label: "Business", dark: true, swatch: ["#1f2937", "#3b82f6", "#14b8a6"] },
  { name: "acid", label: "Acid", dark: false, swatch: ["#f8fafc", "#d946ef", "#84cc16"] },
  { name: "lemonade", label: "Lemonade", dark: false, swatch: ["#fffde7", "#84cc16", "#65a30d"] },
  { name: "night", label: "Night", dark: true, swatch: ["#0f172a", "#60a5fa", "#f43f5e"] },
  { name: "coffee", label: "Coffee", dark: true, swatch: ["#2a211b", "#c08457", "#6b7280"] },
  { name: "winter", label: "Winter", dark: false, swatch: ["#f8fafc", "#3b82f6", "#ec4899"] },
  { name: "dim", label: "Dim", dark: true, swatch: ["#2a303c", "#60a5fa", "#eab308"] },
  { name: "nord", label: "Nord", dark: false, swatch: ["#eceff4", "#5e81ac", "#88c0d0"] },
  { name: "sunset", label: "Sunset", dark: true, swatch: ["#1f2937", "#fb923c", "#f472b6"] },
  { name: "caramellatte", label: "Caramellatte", dark: false, swatch: ["#fff7ed", "#92400e", "#ea580c"] },
  { name: "abyss", label: "Abyss", dark: true, swatch: ["#0f172a", "#84cc16", "#38bdf8"] },
  { name: "silk", label: "Silk", dark: false, swatch: ["#f8fafc", "#334155", "#f59e0b"] },
];

const DEFAULT_THEME: DaisyThemeName = "forest";

const themeExists = (theme: string): theme is DaisyThemeName =>
  DAISY_THEMES.some((item) => item.name === theme);

const storageKey = (userId?: string) => (userId ? `daisy-theme:${userId}` : "daisy-theme");

export const resolveTheme = (value: string | null | undefined): DaisyThemeName =>
  value && themeExists(value) ? value : DEFAULT_THEME;

export const getStoredTheme = (userId?: string): DaisyThemeName | null => {
  if (typeof window === "undefined") return null;
  const savedForUser = userId ? window.localStorage.getItem(storageKey(userId)) : null;
  if (savedForUser && themeExists(savedForUser)) {
    return savedForUser;
  }

  const savedGlobal = window.localStorage.getItem(storageKey());
  return savedGlobal && themeExists(savedGlobal) ? savedGlobal : null;
};

export const setStoredTheme = (theme: DaisyThemeName, userId?: string) => {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(storageKey(userId), theme);
  if (userId) {
    window.localStorage.setItem(storageKey(), theme);
  }
};

export const applyThemeToDocument = (theme: DaisyThemeName) => {
  if (typeof document === "undefined") return;
  document.documentElement.setAttribute("data-theme", theme);
};

export const isDarkTheme = (theme: DaisyThemeName) =>
  DAISY_THEMES.find((item) => item.name === theme)?.dark ?? true;
