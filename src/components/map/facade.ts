// Game-style building look, drawn in the shader so it costs no extra geometry or textures:
// rows of windows with light trim and sills, floor bands, shop windows on the ground floor,
// glass curtain walls on towers, shingle lines on sloped roofs, gravel on flat roofs, and a few lit windows.
// Works on any mesh whose local units * uUnit = meters, with y up and each building's ground at y = 0.
import * as THREE from "three";

const VERT_DECL = /* glsl */ `
uniform float uUnit;
varying vec3 vLocal;
`;
const VERT_MAIN = /* glsl */ `
#include <begin_vertex>
vLocal = position * uUnit;
`;

const FRAG_DECL = /* glsl */ `
uniform float uSeed;
uniform float uNight;   // 0 = day, 1 = night (more windows lit, glowing)
varying vec3 vLocal;
float obHash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7)) + uSeed) * 43758.5453); }
vec3 obWin;   // emissive from lit windows
// anti-aliased "lo < x < hi" (w = filter width), so window edges don't sparkle
float obBox(float x, float lo, float hi, float w) { return smoothstep(lo - w, lo + w, x) * (1.0 - smoothstep(hi - w, hi + w, x)); }
`;

const FRAG_COLOR = /* glsl */ `
#include <color_fragment>
{
  obWin = vec3(0.0);
  vec3 fn = normalize(cross(dFdx(vLocal), dFdy(vLocal)));
  float up = abs(fn.y);
  vec3 base = diffuseColor.rgb;
  float sat = max(base.r, max(base.g, base.b)) - min(base.r, min(base.g, base.b));
  bool glassy = base.b > base.r + 0.04;          // towers are tinted blue in the data
  float h = vLocal.y;

  if (up < 0.35) {
    // ---- wall ----
    vec2 t = normalize(vec2(-fn.z, fn.x) + 1e-6);
    float u = dot(vLocal.xz, t);
    float fh = glassy ? 3.8 : 3.4;
    float fw = glassy ? 1.6 : 2.9;
    vec2 cell = vec2(u / fw, h / fh);
    vec2 f = fract(cell);
    vec2 id = floor(cell);
    float px = max(fwidth(cell.x), fwidth(cell.y));
    float detail = 1.0 - smoothstep(0.1, 0.32, px);   // fade the pattern out far away (no shimmer)
    float wx = fwidth(cell.x) * 0.7, wy = fwidth(cell.y) * 0.7;
    vec3 c = base;
    if (glassy) {
      // curtain wall: tall glass panes, thin mullions, spandrel band per floor
      float mull = smoothstep(0.08 - wx, 0.08 + wx, f.x) * (1.0 - smoothstep(0.86 - wy, 0.86 + wy, f.y));
      vec3 glass = mix(vec3(0.33, 0.48, 0.62), vec3(0.72, 0.84, 0.93), clamp(f.y * 0.8 + 0.15 * sin(u * 0.05), 0.0, 1.0));
      c = mix(base * 0.92, glass, mull);
      if (obHash(id) > mix(0.9, 0.5, uNight)) obWin = vec3(0.9, 0.75, 0.45) * mix(0.22, 0.8, uNight) * mull;
    } else if (id.y < 1.0 && h > 0.0) {
      // ground floor: big shop windows with a colored awning strip on top
      float shop = obBox(f.x, 0.08, 0.92, wx) * obBox(f.y, 0.08, 0.72, wy);
      float awn = obBox(f.y, 0.74, 0.86, wy);
      vec3 awnCol = obHash(vec2(floor(u / 9.0), 7.0)) > 0.5 ? vec3(0.72, 0.18, 0.16) : vec3(0.16, 0.38, 0.30);
      c = mix(base * 0.88, vec3(0.25, 0.32, 0.38), shop);
      c = mix(c, awnCol, awn * step(0.45, obHash(vec2(floor(u / 9.0), 3.0))));
      obWin = vec3(1.0, 0.82, 0.5) * mix(0.18, 0.9, uNight) * shop * step(mix(0.55, 0.2, uNight), obHash(id));
    } else {
      // punched windows with light trim, a sill, and a band at each floor
      float trim = obBox(f.x, 0.16, 0.84, wx) * obBox(f.y, 0.2, 0.88, wy);
      float win = obBox(f.x, 0.22, 0.78, wx) * obBox(f.y, 0.27, 0.83, wy);
      float sill = obBox(f.x, 0.16, 0.84, wx) * obBox(f.y, 0.2, 0.25, wy);
      float band = 1.0 - smoothstep(0.06 - wy, 0.06 + wy, f.y);
      vec3 trimCol = mix(base * 1.35, vec3(0.96, 0.94, 0.9), 0.55);
      vec3 glass = mix(vec3(0.2, 0.27, 0.36), vec3(0.56, 0.68, 0.8), smoothstep(0.27, 0.83, f.y));
      float lit = step(mix(0.94, 0.55, uNight), obHash(id));
      glass = mix(glass, vec3(1.0, 0.86, 0.55), lit * 0.85);
      c = mix(base, base * 0.82, band);
      c = mix(c, trimCol, trim);
      c = mix(c, trimCol * 1.05, sill);
      c = mix(c, glass, win);
      obWin = vec3(1.0, 0.8, 0.45) * mix(0.2, 0.9, uNight) * win * lit;
    }
    c *= mix(0.72, 1.0, smoothstep(0.0, 2.5, h));   // soft contact shadow at the base
    diffuseColor.rgb = mix(base * mix(0.72, 1.0, smoothstep(0.0, 2.5, h)) * (glassy ? 0.95 : 0.93), c, detail);
    obWin *= max(detail, uNight * 0.7 * (1.0 - smoothstep(0.3, 1.2, px)));   // at night lit windows read from further away, like city lights
  } else if (up < 0.97) {
    // ---- sloped roof: colored shingles in rows ----
    float pick = fract(dot(base, vec3(13.1, 7.7, 3.3)) * 9.0);
    vec3 roof = pick < 0.34 ? vec3(0.44, 0.38, 0.52) : pick < 0.67 ? vec3(0.32, 0.52, 0.56) : vec3(0.74, 0.44, 0.38);
    float row = fract(h / 0.45);
    float px = fwidth(h / 0.45);
    float lines = mix(1.0, 0.82 + 0.18 * smoothstep(0.0, 0.25, row), 1.0 - smoothstep(0.3, 0.7, px));
    diffuseColor.rgb = roof * lines;
  } else {
    // ---- flat roof: light gravel with a darker parapet look near edges is left to the walls ----
    float n = obHash(floor(vLocal.xz * 1.5));
    diffuseColor.rgb = mix(vec3(0.8, 0.78, 0.84), base, 0.35) * (0.95 + 0.05 * n);
  }
}
`;

const FRAG_EMISSIVE = /* glsl */ `
#include <emissivemap_fragment>
totalEmissiveRadiance += obWin;
`;

/** Shared by every facade material; set from the sun position each frame. */
export const FACADE_NIGHT = { value: 0 };

/** Lambert material with the facade/roof detail. `unit` = meters per position unit of the meshes that use it. */
export function makeFacadeMaterial(unit: number, seed = 0) {
  const m = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true });
  m.onBeforeCompile = (shader) => {
    shader.uniforms.uUnit = { value: unit };
    shader.uniforms.uSeed = { value: seed };
    shader.uniforms.uNight = FACADE_NIGHT;
    shader.vertexShader = VERT_DECL + shader.vertexShader.replace("#include <begin_vertex>", VERT_MAIN);
    shader.fragmentShader = FRAG_DECL + shader.fragmentShader
      .replace("#include <color_fragment>", FRAG_COLOR)
      .replace("#include <emissivemap_fragment>", FRAG_EMISSIVE);
  };
  m.customProgramCacheKey = () => `ob-facade-${unit}-${seed}`;
  return m;
}

/** Pastel, illustrated versions of the building palette used in the BPDA tiles (matches the Outbound mockup). */
const REMAP: [number[], number[]][] = [
  [[185, 143, 118], [226, 172, 172]], // brick -> dusty pink
  [[191, 174, 154], [240, 224, 198]], // sand -> cream
  [[200, 196, 189], [243, 237, 227]], // limestone
  [[227, 221, 211], [250, 246, 238]], // white
  [[217, 207, 194], [212, 192, 228]], // peach -> lavender
  [[214, 195, 168], [242, 216, 162]], // mustard -> soft yellow
  [[169, 112, 90], [204, 124, 132]],  // red brick -> rose
  [[205, 191, 174], [180, 210, 194]], // sage -> mint
  [[169, 184, 200], [160, 186, 224]], // tower glass
  [[159, 176, 194], [138, 164, 208]],
  [[201, 210, 219], [198, 216, 238]],
  [[185, 198, 211], [176, 200, 236]], // gray glass -> sky blue
];
export function brightenPalette(col: Uint8Array) {
  const lut = new Map(REMAP.map(([a, b]) => [(a[0] << 16) | (a[1] << 8) | a[2], b]));
  for (let i = 0; i < col.length; i += 3) {
    const b = lut.get((col[i] << 16) | (col[i + 1] << 8) | col[i + 2]);
    if (b) col.set(b, i);
  }
}
