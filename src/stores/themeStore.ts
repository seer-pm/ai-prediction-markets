import { create } from "zustand";

export type Theme = "light" | "dark";

/**
 * Read by the inline script in `index.html` too, which applies the theme before the bundle loads
 * so a dark page never paints light first. Change both together.
 */
const STORAGE_KEY = "theme";

const darkQuery =
  typeof window !== "undefined" && typeof window.matchMedia === "function"
    ? window.matchMedia("(prefers-color-scheme: dark)")
    : null;

function readChoice(): Theme | null {
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    return stored === "light" || stored === "dark" ? stored : null;
  } catch {
    return null;
  }
}

type ThemeStore = {
  /** What the reader picked with the toggle. Null until they pick, and the system decides. */
  choice: Theme | null;
  system: Theme;
  toggle: () => void;
};

export const resolveTheme = (state: Pick<ThemeStore, "choice" | "system">): Theme =>
  state.choice ?? state.system;

/**
 * Light or dark, following the system until the reader picks one. The kit's tokens switch on
 * `data-theme` on `<html>`, so writing that attribute is all applying a theme takes; code that
 * paints outside CSS (the charts, the wallet modal) subscribes here.
 */
export const useThemeStore = create<ThemeStore>()((set, get) => ({
  choice: readChoice(),
  system: darkQuery?.matches ? "dark" : "light",
  toggle: () => {
    const next: Theme = resolveTheme(get()) === "dark" ? "light" : "dark";
    try {
      window.localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // Private mode or blocked storage: the choice still holds for this visit.
    }
    set({ choice: next });
  },
}));

export const useTheme = () => useThemeStore(resolveTheme);

if (typeof document !== "undefined") {
  const apply = () => {
    document.documentElement.dataset.theme = resolveTheme(useThemeStore.getState());
  };
  apply();
  useThemeStore.subscribe(apply);
  darkQuery?.addEventListener("change", (event) =>
    useThemeStore.setState({ system: event.matches ? "dark" : "light" }),
  );
}
