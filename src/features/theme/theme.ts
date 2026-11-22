// Light / dark mode. The choice lives on <html data-theme="dark"> (globals.css restyles the tokens and the
// map) and in localStorage, so it survives reloads. layout.tsx applies it before the first paint (no flash).
import { useSyncExternalStore } from "react";

import { THEME_KEY } from "./theme-script";

export type Theme = "light" | "dark";

export function currentTheme(): Theme {
  return document.documentElement.dataset.theme === "dark" ? "dark" : "light";
}

export function setTheme(t: Theme) {
  if (t === "dark") document.documentElement.dataset.theme = "dark";
  else delete document.documentElement.dataset.theme;
  document.documentElement.style.colorScheme = t;
  try {
    localStorage.setItem(THEME_KEY, t);
  } catch {
    /* private mode: still switches for this visit */
  }
}

/** The current theme, re-rendering when it changes (from any toggle). */
export function useTheme(): Theme {
  return useSyncExternalStore(
    (onChange) => {
      const obs = new MutationObserver(onChange);
      obs.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
      return () => obs.disconnect();
    },
    currentTheme,
    () => "light",
  );
}
