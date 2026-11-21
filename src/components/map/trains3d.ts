// Live train animation + three.js custom MapLibre layer that draws every car as a 3D model.
import * as THREE from "three";
import { MercatorCoordinate } from "maplibre-gl";
import type { CustomLayerInterface, CustomRenderMethodInput, Map as MlMap } from "maplibre-gl";
import type { Train } from "@/lib/types";
import { TrackNetwork, TrackPos, LineName, toXY, toLngLat } from "./track";
import { carSpecs } from "./trainModels";

interface Anchor {
  x: number;
  y: number;
  pos: TrackPos | null;
}

export interface Anim {
  id: string;
  line: LineName;
  info: Train;
  from: Anchor;
  to: Anchor;
  t0: number;
  t1: number;
  dir: 1 | -1; // travel direction along the polyline at `to`
  bridge: number | null; // track distance from `from` to `to` when they are on connected polylines
  missing: number;
}

export interface TrainNow {
  id: string;
  line: LineName;
  info: Train;
  lng: number;
  lat: number;
  heading: number; // radians, 0 = east, ccw
}

const ease = (t: number) => t * t * (3 - 2 * t);

export class TrainAnimator {
  anims = new Map<string, Anim>();
  constructor(public net: TrackNetwork) {}

  private current(a: Anim, now: number): { x: number; y: number; pos: TrackPos | null; dir: 1 | -1 } {
    const t = a.t1 > a.t0 ? Math.max(0, Math.min(1, (now - a.t0) / (a.t1 - a.t0))) : 1;
    const k = ease(t);
    if (a.from.pos && a.to.pos) {
      const d = this.net.delta(a.from.pos, a.to.pos);
      if (d !== null) {
        const along = a.from.pos.along + d * k;
        const p = this.net.pointAt(a.from.pos.poly, along);
        return { x: p.x, y: p.y, pos: { poly: a.from.pos.poly, along }, dir: a.dir };
      }
      if (a.bridge !== null) {
        const w = this.net.walk(a.from.pos.poly, a.from.pos.along, a.bridge * k, this.fromDir(a));
        const p = this.net.pointAt(w.poly, w.along);
        return { x: p.x, y: p.y, pos: { poly: w.poly, along: w.along }, dir: w.dir };
      }
    }
    const x = a.from.x + (a.to.x - a.from.x) * k;
    const y = a.from.y + (a.to.y - a.from.y) * k;
    return { x, y, pos: k < 0.5 ? a.from.pos : a.to.pos, dir: a.dir };
  }

  private fromDirs = new Map<string, 1 | -1>();
  private fromDir(a: Anim): 1 | -1 {
    return this.fromDirs.get(a.id) ?? a.dir;
  }

  /** Feed a new snapshot. Trains glide from where they are now to the new spot over `durationMs`. */
  ingest(trains: Train[], durationMs: number, now = performance.now()) {
    const seen = new Set<string>();
    for (const tr of trains) {
      if (tr.lat == null || tr.lon == null) continue;
      const line = tr.line as LineName;
      seen.add(tr.id);
      const [x, y] = toXY(tr.lon, tr.lat);
      const snap = this.net.snap(x, y, line);
      const to: Anchor = snap ? { ...this.net.pointAt(snap.poly, snap.along), pos: { poly: snap.poly, along: snap.along } } : { x, y, pos: null };
      const prev = this.anims.get(tr.id);
      if (!prev) {
        let dir: 1 | -1 = 1;
        if (snap && tr.bearing != null) {
          const heading = Math.PI / 2 - (tr.bearing * Math.PI) / 180;
          dir = Math.cos(heading - snap.tangent) >= 0 ? 1 : -1;
        }
        this.anims.set(tr.id, { id: tr.id, line, info: tr, from: to, to, t0: now, t1: now, dir, bridge: null, missing: 0 });
        continue;
      }
      const cur = this.current(prev, now);
      const from: Anchor = { x: cur.x, y: cur.y, pos: cur.pos };
      let dir = cur.dir;
      let bridge: number | null = null;
      if (from.pos && to.pos) {
        const d = this.net.delta(from.pos, to.pos);
        if (d !== null) {
          if (Math.abs(d) > 2) dir = d > 0 ? 1 : -1;
        } else {
          // different polylines: find a path along the track (try both directions)
          const gap = Math.hypot(to.x - from.x, to.y - from.y);
          for (const sd of [cur.dir, (-cur.dir) as 1 | -1]) {
            for (const mult of [1, 1.15, 1.35]) {
              const w = this.net.walk(from.pos.poly, from.pos.along, gap * mult, sd);
              const p = this.net.pointAt(w.poly, w.along);
              if (w.poly === to.pos.poly && Math.hypot(p.x - to.x, p.y - to.y) < 40) {
                bridge = gap * mult;
                this.fromDirs.set(tr.id, sd);
                dir = w.dir;
                break;
              }
            }
            if (bridge !== null) break;
          }
        }
      }
      this.anims.set(tr.id, { ...prev, info: tr, from, to, t0: now, t1: now + durationMs, dir, bridge, missing: 0 });
    }
    for (const [id, a] of this.anims) {
      if (seen.has(id)) continue;
      a.missing++;
      if (a.missing >= 2) this.anims.delete(id);
    }
  }

  clear() {
    this.anims.clear();
  }

  /** Lead-car positions right now (for 2D dots, hit testing and popups). */
  snapshot(now = performance.now()): TrainNow[] {
    const out: TrainNow[] = [];
    for (const a of this.anims.values()) {
      const c = this.current(a, now);
      let heading = 0;
      if (c.pos) heading = this.net.pointAt(c.pos.poly, c.pos.along).heading + (c.dir < 0 ? Math.PI : 0);
      else if (a.info.bearing != null) heading = Math.PI / 2 - (a.info.bearing * Math.PI) / 180;
      const [lng, lat] = toLngLat(c.x, c.y);
      out.push({ id: a.id, line: a.line, info: a.info, lng, lat, heading });
    }
    return out;
  }

  /** Every car of every train: center lng/lat + heading. `scale` stretches spacing when models are enlarged. */
  cars(now: number, scale: number) {
    const specs = carSpecs();
    const out: { line: LineName; lng: number; lat: number; heading: number }[] = [];
    for (const a of this.anims.values()) {
      const spec = specs[a.line];
      if (!spec) continue;
      const c = this.current(a, now);
      const step = (spec.length + spec.gap) * scale;
      for (let k = 0; k < spec.cars; k++) {
        if (c.pos) {
          // walk backwards from the lead car, against the direction of travel
          const back = (-c.dir) as 1 | -1;
          const w = k === 0 ? { ...c.pos, dir: back } : this.net.walk(c.pos.poly, c.pos.along, k * step, back);
          const p = this.net.pointAt(w.poly, w.along);
          const travelDir = -w.dir;
          const [lng, lat] = toLngLat(p.x, p.y);
          out.push({ line: a.line, lng, lat, heading: p.heading + (travelDir < 0 ? Math.PI : 0) });
        } else {
          const h = a.info.bearing != null ? Math.PI / 2 - (a.info.bearing * Math.PI) / 180 : 0;
          const [lng, lat] = toLngLat(c.x - Math.cos(h) * k * step, c.y - Math.sin(h) * k * step);
          out.push({ line: a.line, lng, lat, heading: h });
        }
      }
    }
    return out;
  }
}

const EARTH_RADIUS = 6371008.8; // meters, same sphere MapLibre uses for the globe
const _a = new THREE.Matrix4();

/**
 * Matrix that places a model (meters, y-up, -z = north) at lng/lat, for MapLibre's custom-layer mainMatrix.
 * Mercator: mainMatrix takes 0..1 mercator coords. Globe: mainMatrix takes a unit-sphere planet.
 * (Same math as MapLibre 5's transform.getMatrixForModel, which MapLibre 6 no longer exposes.)
 */
function modelMatrix(out: THREE.Matrix4, lng: number, lat: number, globe: boolean) {
  if (globe) {
    const s = 1 / EARTH_RADIUS;
    out.makeRotationY((lng * Math.PI) / 180);
    out.multiply(_a.makeRotationX((-lat * Math.PI) / 180));
    out.multiply(_a.makeTranslation(0, 0, 1));
    out.multiply(_a.makeRotationX(Math.PI / 2));
    out.multiply(_a.makeScale(s, s, s));
  } else {
    const mc = MercatorCoordinate.fromLngLat([lng, lat], 0);
    const s = mc.meterInMercatorCoordinateUnits();
    out.makeTranslation(mc.x, mc.y, mc.z);
    out.multiply(_a.makeRotationZ(Math.PI));
    out.multiply(_a.makeRotationX(Math.PI / 2));
    out.multiply(_a.makeScale(-s, s, s));
  }
  return out;
}

function shadowTexture() {
  const c = document.createElement("canvas");
  c.width = 64;
  c.height = 64;
  const g = c.getContext("2d")!;
  const grd = g.createRadialGradient(32, 32, 4, 32, 32, 32);
  grd.addColorStop(0, "rgba(0,0,0,0.55)");
  grd.addColorStop(1, "rgba(0,0,0,0)");
  g.fillStyle = grd;
  g.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(c);
}

/** MapLibre custom layer: renders all cars with one InstancedMesh per car type. Works on globe and mercator. */
export class Trains3DLayer implements CustomLayerInterface {
  id = "trains-3d";
  type = "custom" as const;
  renderingMode = "3d" as const;
  visible = true;
  minZoom = 12.3;

  private map!: MlMap;
  private renderer!: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera = new THREE.Camera();
  private meshes: Partial<Record<LineName, THREE.InstancedMesh>> = {};
  private shadows!: THREE.InstancedMesh;
  private tmp = new THREE.Matrix4();
  private rot = new THREE.Matrix4();
  private scl = new THREE.Matrix4();
  private originInv = new THREE.Matrix4();

  constructor(private animator: TrainAnimator) {}

  onAdd(map: MlMap, gl: WebGLRenderingContext | WebGL2RenderingContext) {
    this.map = map;
    this.renderer = new THREE.WebGLRenderer({ canvas: map.getCanvas(), context: gl, antialias: true });
    this.renderer.autoClear = false;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;

    this.scene.add(new THREE.HemisphereLight(0xffffff, 0x8a8f94, 2.1));
    const sun = new THREE.DirectionalLight(0xfff3e0, 2.0);
    sun.position.set(-60, 120, 80);
    this.scene.add(sun);

    const specs = carSpecs();
    for (const line of Object.keys(specs) as LineName[]) {
      const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.5, metalness: 0.12 });
      const mesh = new THREE.InstancedMesh(specs[line].geometry, mat, 900);
      mesh.count = 0;
      mesh.frustumCulled = false;
      this.meshes[line] = mesh;
      this.scene.add(mesh);
    }
    const sg = new THREE.PlaneGeometry(1, 1);
    sg.rotateX(-Math.PI / 2);
    const sm = new THREE.MeshBasicMaterial({ map: shadowTexture(), transparent: true, depthWrite: false });
    this.shadows = new THREE.InstancedMesh(sg, sm, 3000);
    this.shadows.count = 0;
    this.shadows.frustumCulled = false;
    this.shadows.renderOrder = -1;
    this.scene.add(this.shadows);
  }

  /** Model size multiplier: real size when zoomed in, gently enlarged when zoomed out so trains stay readable. */
  scaleFor(zoom: number) {
    return Math.min(6, Math.max(1, Math.pow(2, (15.6 - zoom) * 0.62)));
  }

  render(_gl: WebGLRenderingContext | WebGL2RenderingContext, args: CustomRenderMethodInput) {
    const zoom = this.map.getZoom();
    if (!this.visible || zoom < this.minZoom) return;
    const now = performance.now();
    const scale = this.scaleFor(zoom);
    const center = this.map.getCenter();
    // While the globe is drawn, MapLibre blends a globe position (mainMatrix) with a mercator one (fallbackMatrix)
    // by projectionTransition. Pick whichever dominates; at train zooms the globe has mostly flattened out.
    const pd = args.defaultProjectionData;
    const globe = pd.fallbackMatrix !== pd.mainMatrix && pd.projectionTransition > 0.5;
    const origin = modelMatrix(new THREE.Matrix4(), center.lng, center.lat, globe);
    this.originInv.copy(origin).invert();
    const main = new THREE.Matrix4().fromArray((globe ? pd.mainMatrix : pd.fallbackMatrix) as unknown as number[]);
    this.camera.projectionMatrix = main.multiply(origin);
    this.camera.projectionMatrixInverse.copy(this.camera.projectionMatrix).invert();

    const counts: Partial<Record<LineName, number>> = {};
    let shadowCount = 0;
    const specs = carSpecs();
    for (const car of this.animator.cars(now, scale)) {
      const mesh = this.meshes[car.line];
      if (!mesh) continue;
      const i = counts[car.line] ?? 0;
      if (i >= mesh.instanceMatrix.count) continue;
      modelMatrix(this.tmp, car.lng, car.lat, globe);
      this.tmp.premultiply(this.originInv);
      this.rot.makeRotationY(car.heading);
      this.scl.makeScale(scale, scale, scale);
      const m = this.tmp.clone().multiply(this.rot).multiply(this.scl);
      mesh.setMatrixAt(i, m);
      counts[car.line] = i + 1;
      if (shadowCount < 3000) {
        const spec = specs[car.line];
        this.scl.makeScale(spec.length * scale * 1.08, 1, 3.6 * scale * 1.3);
        const sm = this.tmp.clone().multiply(this.rot).multiply(this.scl);
        sm.elements[13] += 0.05 * scale; // lift slightly above ground (y-up in model space)
        this.shadows.setMatrixAt(shadowCount++, sm);
      }
    }
    for (const line of Object.keys(this.meshes) as LineName[]) {
      const mesh = this.meshes[line]!;
      mesh.count = counts[line] ?? 0;
      mesh.instanceMatrix.needsUpdate = true;
    }
    this.shadows.count = shadowCount;
    this.shadows.instanceMatrix.needsUpdate = true;

    this.renderer.resetState();
    this.renderer.render(this.scene, this.camera);
    this.map.triggerRepaint();
  }
}
