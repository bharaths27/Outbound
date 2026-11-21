// Current weather in Boston (Open-Meteo: free, no key) so the 3D city's light, clouds, rain and snow match outside.
export interface Weather {
  tempF: number;
  code: number; // WMO weather code
  cloud: number; // 0..1
  kind: "clear" | "cloudy" | "fog" | "rain" | "snow" | "storm";
  /** 0..1, how hard it is raining or snowing */
  intensity: number;
}

export function kindOf(code: number): Weather["kind"] {
  if (code >= 95) return "storm";
  if ((code >= 71 && code <= 77) || code === 85 || code === 86) return "snow";
  if ((code >= 51 && code <= 67) || (code >= 80 && code <= 82)) return "rain";
  if (code === 45 || code === 48) return "fog";
  if (code >= 2) return "cloudy";
  return "clear";
}

export async function fetchWeather(lat = 42.36, lng = -71.06): Promise<Weather | null> {
  try {
    const u = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lng}&current=temperature_2m,weather_code,cloud_cover,precipitation&temperature_unit=fahrenheit`;
    const r = await fetch(u);
    if (!r.ok) return null;
    const c = (await r.json()).current;
    const code = Number(c.weather_code ?? 0);
    const kind = kindOf(code);
    const precip = Number(c.precipitation ?? 0);
    return {
      tempF: Math.round(c.temperature_2m),
      code,
      cloud: Math.min(1, Math.max(0, Number(c.cloud_cover ?? 0) / 100)),
      kind,
      intensity: kind === "rain" || kind === "snow" || kind === "storm" ? Math.min(1, 0.35 + precip / 4) : 0,
    };
  } catch {
    return null; // offline (e.g. the artifact): keep the clear-sky light
  }
}
