// Where the sun is over Boston right now, so the 3D city is lit like the real time of day.
const RAD = Math.PI / 180;

/** Sun elevation and azimuth (degrees; azimuth clockwise from north) for a place and time. NOAA approximation. */
export function sunPosition(date: Date, lat = 42.36, lng = -71.06) {
  const doy = (Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()) - Date.UTC(date.getUTCFullYear(), 0, 0)) / 864e5;
  const hours = date.getUTCHours() + date.getUTCMinutes() / 60 + date.getUTCSeconds() / 3600;
  const g = ((2 * Math.PI) / 365) * (doy - 1 + (hours - 12) / 24);
  const eqTime = 229.18 * (0.000075 + 0.001868 * Math.cos(g) - 0.032077 * Math.sin(g) - 0.014615 * Math.cos(2 * g) - 0.040849 * Math.sin(2 * g));
  const decl = 0.006918 - 0.399912 * Math.cos(g) + 0.070257 * Math.sin(g) - 0.006758 * Math.cos(2 * g) + 0.000907 * Math.sin(2 * g) - 0.002697 * Math.cos(3 * g) + 0.00148 * Math.sin(3 * g);
  const trueSolar = hours * 60 + eqTime + 4 * lng;
  const ha = (trueSolar / 4 - 180) * RAD;
  const phi = lat * RAD;
  const cosZen = Math.sin(phi) * Math.sin(decl) + Math.cos(phi) * Math.cos(decl) * Math.cos(ha);
  const zen = Math.acos(Math.max(-1, Math.min(1, cosZen)));
  const az = Math.atan2(Math.sin(ha), Math.cos(ha) * Math.sin(phi) - Math.tan(decl) * Math.cos(phi)) + Math.PI;
  return { elevation: 90 - zen / RAD, azimuth: ((az / RAD) % 360 + 360) % 360 };
}

/** Light for our 3D layers (x east, y up, z south). night: 0 day .. 1 full night. */
export function sunLight(date = new Date()) {
  const { elevation, azimuth } = sunPosition(date);
  const el = Math.max(elevation, 8) * RAD; // keep some shape on buildings even at dusk/night (moonlight)
  const az = azimuth * RAD;
  const dir: [number, number, number] = [Math.sin(az) * Math.cos(el), Math.sin(el), -Math.cos(az) * Math.cos(el)];
  const night = Math.min(1, Math.max(0, (2 - elevation) / 10)); // fades in from 2 deg above to 8 deg below horizon
  const golden = Math.min(1, Math.max(0, 1 - (elevation - 2) / 15)) * (1 - night); // warm low sun
  return { dir, night, golden, elevation };
}
