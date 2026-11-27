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
      // glass picks up the building's tint and a bright sky reflection that sweeps across the facade
      vec3 deep = mix(vec3(0.2, 0.42, 0.68), base * 0.75, 0.35);
      vec3 sky = vec3(0.74, 0.88, 0.99);
      float refl = clamp(f.y * 0.7 + 0.25 * sin(u * 0.045 + h * 0.03) + 0.15, 0.0, 1.0);
      vec3 glass = mix(deep, sky, refl);
      vec3 frameCol = obHash(vec2(floor(base.r * 31.0), floor(base.b * 17.0))) > 0.5 ? vec3(0.86, 0.88, 0.92) : base * 0.8;
      c = mix(frameCol, glass, mull);
      if (obHash(id) > mix(0.9, 0.5, uNight)) obWin = vec3(0.9, 0.75, 0.45) * mix(0.22, 0.8, uNight) * mull;
    } else if (id.y < 1.0 && h > 0.0) {
      // ground floor: big shop windows with a colored awning strip on top
      float shop = obBox(f.x, 0.08, 0.92, wx) * obBox(f.y, 0.08, 0.72, wy);
      float awn = obBox(f.y, 0.74, 0.86, wy);
      vec3 awnCol = obHash(vec2(floor(u / 9.0), 7.0)) > 0.5 ? vec3(0.72, 0.18, 0.16) : vec3(0.16, 0.38, 0.30);
      // some bays are doors (wood with a light frame and a glowing transom) instead of shop windows
      float isDoor = step(obHash(id + vec2(5.0, 1.0)), 0.3);
      float frame = obBox(f.x, 0.3, 0.7, wx) * obBox(f.y, -0.1, 0.8, wy);
      float door = obBox(f.x, 0.34, 0.66, wx) * obBox(f.y, -0.1, 0.62, wy);
      float transom = obBox(f.x, 0.34, 0.66, wx) * obBox(f.y, 0.65, 0.76, wy);
      vec3 doorCol = obHash(id + vec2(2.0, 9.0)) > 0.5 ? vec3(0.42, 0.26, 0.22) : vec3(0.2, 0.32, 0.3);
      vec3 shopC = mix(base * 0.88, vec3(0.25, 0.32, 0.38), shop);
      shopC = mix(shopC, awnCol, awn * step(0.45, obHash(vec2(floor(u / 9.0), 3.0))));
      vec3 doorC = mix(base * 0.9, vec3(0.95, 0.93, 0.88), frame);
      doorC = mix(doorC, doorCol, door);
      doorC = mix(doorC, vec3(0.55, 0.62, 0.7), transom);
      c = mix(shopC, doorC, isDoor);
      obWin = vec3(1.0, 0.82, 0.5) * mix(0.18, 0.9, uNight) * mix(shop * step(mix(0.55, 0.2, uNight), obHash(id)), transom * uNight, isDoor);
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
      // brick walls up close: running-bond courses with light mortar joints
      if (base.r > base.g * 1.3 && base.r > base.b * 1.3) {
        float bv = h / 0.2;
        float bu = u / 0.42 + 0.5 * mod(floor(bv), 2.0);
        float bw = fwidth(bv);
        float joint = max(1.0 - smoothstep(0.0, 0.1 + bw, fract(bv)), 1.0 - smoothstep(0.0, 0.05 + fwidth(bu), fract(bu)));
        float near = 1.0 - smoothstep(0.12, 0.4, bw);
        float tone = 0.92 + 0.16 * obHash(vec2(floor(bu), floor(bv)));
        c = mix(c * mix(1.0, tone, near), mix(c, vec3(0.78, 0.74, 0.68), 0.6), joint * near * 0.7);
      }
      c = mix(c, trimCol, trim);
      c = mix(c, trimCol * 1.05, sill);
      c = mix(c, glass, win);
      // balconies on some columns of windows: a slab with a shadow under it and a railing in front of the window
      if (obHash(vec2(id.x, 17.0)) > 0.74 && id.y > 1.5) {
        float slab = obBox(f.x, 0.08, 0.92, wx) * obBox(f.y, 0.07, 0.13, wy);
        float under = obBox(f.x, 0.08, 0.92, wx) * obBox(f.y, 0.0, 0.07, wy);
        float rail = obBox(f.x, 0.08, 0.92, wx) * obBox(f.y, 0.13, 0.36, wy);
        float bars = rail * (0.35 + 0.65 * max(obBox(f.y, 0.33, 0.36, wy), smoothstep(0.4, 0.6, abs(fract(f.x * 9.0) - 0.5) * 2.0)));
        c = mix(c, base * 0.6, under);
        c = mix(c, trimCol * 0.92, slab);
        c = mix(c, vec3(0.22, 0.22, 0.26), bars * 0.85);
      }
      obWin = vec3(1.0, 0.8, 0.45) * mix(0.2, 0.9, uNight) * win * lit;
    }
    // far away: windows merge into soft floor stripes (still reads as a building, without shimmer)
    float sy = fwidth(cell.y);
    float stripes = (1.0 - smoothstep(0.45, 1.4, sy)) * obBox(f.y, glassy ? 0.12 : 0.3, glassy ? 0.86 : 0.8, max(sy * 0.7, 0.08));
    vec3 winAvg = glassy ? mix(vec3(0.26, 0.48, 0.78), base, 0.3) : base * 0.62 + vec3(0.02, 0.03, 0.05); // keeps the wall's own color
    vec3 far = mix(base * (glassy ? 0.85 : 0.97), winAvg, stripes * (glassy ? 0.85 : 0.6));
    // texture: each bay of the facade is a slightly different shade, like real panels and brick
    float shade = 0.94 + 0.09 * obHash(vec2(id.x, 3.0)) + 0.03 * obHash(id + vec2(1.0, 2.0));
    float contact = mix(0.72, 1.0, smoothstep(0.0, 2.5, h));   // soft contact shadow at the base
    diffuseColor.rgb = mix(far, c, detail) * mix(1.0, shade, detail * 0.8) * contact;
    obWin *= max(detail, uNight * 0.7 * (1.0 - smoothstep(0.3, 1.2, px)));   // at night lit windows read from further away, like city lights
    obWin += vec3(1.0, 0.8, 0.45) * uNight * 0.35 * stripes * (1.0 - detail) * step(0.6, obHash(vec2(id.y, floor(u / 12.0))));
  } else if (up < 0.97) {
    // ---- sloped roof: colored shingles in rows ----
    float pick = fract(dot(base, vec3(13.1, 7.7, 3.3)) * 9.0);
    vec3 roof = pick < 0.34 ? vec3(0.44, 0.38, 0.52) : pick < 0.67 ? vec3(0.32, 0.52, 0.56) : vec3(0.74, 0.44, 0.38);
    float row = fract(h / 0.45);
    float px = fwidth(h / 0.45);
    float lines = mix(1.0, 0.82 + 0.18 * smoothstep(0.0, 0.25, row), 1.0 - smoothstep(0.3, 0.7, px));
    diffuseColor.rgb = roof * lines;
  } else {
    // ---- flat roof: the building's own roof color with a little gravel texture ----
    float n = obHash(floor(vLocal.xz * 1.5));
    diffuseColor.rgb = base * (0.93 + 0.07 * n);
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

/** Game-map versions of the building palette used in the BPDA tiles (matches the Outbound mockup). */
const REMAP: [number[], number[]][] = [
  // Real Boston colors, saturated enough to read on a phone: red brick, brownstone, cream limestone, granite, blue glass.
  [[185, 143, 118], [172, 78, 54]],   // brick -> Boston red brick
  [[191, 174, 154], [214, 170, 118]], // sand -> sandstone
  [[200, 196, 189], [232, 220, 196]], // limestone -> cream limestone
  [[227, 221, 211], [243, 238, 228]], // white -> painted white
  [[217, 207, 194], [128, 80, 60]],   // peach -> Back Bay brownstone
  [[214, 195, 168], [222, 172, 92]],  // mustard -> warm ochre
  [[169, 112, 90], [140, 56, 42]],    // red brick -> deep brick
  [[205, 191, 174], [150, 150, 146]], // sage -> granite gray
  [[169, 184, 200], [72, 130, 182]],  // tower glass -> blue glass
  [[159, 176, 194], [48, 94, 146]],   // dark tower glass
  [[201, 210, 219], [128, 170, 206]], // pale glass
  [[185, 198, 211], [96, 140, 184]],  // gray glass
];
export function brightenPalette(col: Uint8Array) {
  const lut = new Map(REMAP.map(([a, b]) => [(a[0] << 16) | (a[1] << 8) | a[2], b]));
  for (let i = 0; i < col.length; i += 3) {
    const b = lut.get((col[i] << 16) | (col[i + 1] << 8) | col[i + 2]);
    if (b) col.set(b, i);
  }
}
