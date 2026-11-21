// Hand-made landmark models that the city data doesn't have or doesn't show well:
//   - the Massachusetts State House's gold dome (fitted over the BPDA model's dome: radius ~10 m, base at 36 m)
//   - the Zakim Bridge (outside the BPDA area): two inverted-Y towers, deck and fanned cables, placed on I-93's path
// Each part is one mesh (no children) so it can use the same per-frame placement as the other 3D parts.
import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";

export interface LandmarkPart {
  obj: THREE.Object3D;
  center: [number, number];
}

/** Local frame of the BPDA tile BOS_H_4 (meters, x east, y up, z south); the dome sits at (151.2, -134.9). */
const STATE_HOUSE_TILE: [number, number] = [-71.06552098503126, 42.35694791603567];
/** Middle of the Zakim's main span, from I-93's route over the Charles. Deck runs to the NW at ~130° from east. */
const ZAKIM_CENTER: [number, number] = [-71.0629, 42.3684];

function painted(g: THREE.BufferGeometry, rgb: [number, number, number]) {
  g = g.index ? g.toNonIndexed() : g;
  const n = g.getAttribute("position").count;
  const c = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) c.set(rgb, i * 3);
  g.setAttribute("color", new THREE.BufferAttribute(c, 3));
  g.deleteAttribute("uv");
  return g;
}

/** a beam (box) from a to b */
function beam(a: THREE.Vector3, b: THREE.Vector3, w: number, d: number, rgb: [number, number, number]) {
  const len = a.distanceTo(b);
  const g = new THREE.BoxGeometry(w, len, d);
  const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), b.clone().sub(a).normalize());
  g.applyMatrix4(new THREE.Matrix4().compose(a.clone().add(b).multiplyScalar(0.5), q, new THREE.Vector3(1, 1, 1)));
  return painted(g, rgb);
}

export function makeLandmarks(): LandmarkPart[] {
  const mat = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true });
  const parts: LandmarkPart[] = [];

  // ---- State House gold dome ----
  const gold: [number, number, number] = [0.93, 0.7, 0.22];
  const dome = new THREE.SphereGeometry(10.4, 28, 10, 0, Math.PI * 2, 0, Math.PI / 2);
  dome.scale(1, 1.18, 1);
  dome.translate(151.2, 36.0, -134.9);
  const lantern = new THREE.CylinderGeometry(2.3, 2.6, 4.6, 12);
  lantern.translate(151.2, 50.4, -134.9);
  const cap = new THREE.SphereGeometry(2.4, 12, 6, 0, Math.PI * 2, 0, Math.PI / 2);
  cap.translate(151.2, 52.6, -134.9);
  const domeMat = new THREE.MeshLambertMaterial({ vertexColors: true, emissive: new THREE.Color(0x4a3000) });
  parts.push({ obj: new THREE.Mesh(mergeGeometries([painted(dome, gold), painted(lantern, [0.96, 0.93, 0.86]), painted(cap, gold)]), domeMat), center: STATE_HOUSE_TILE });

  // ---- Zakim Bridge ----
  // built along +x (deck length), y up; then turned to follow I-93 (NW across the Charles)
  const white: [number, number, number] = [0.95, 0.95, 0.96], deckCol: [number, number, number] = [0.78, 0.78, 0.8];
  const geos: THREE.BufferGeometry[] = [];
  const DECK_Y = 16, HALF = 215, TOWER_X = 113, WIDTH = 40;
  const deck = new THREE.BoxGeometry(HALF * 2, 2.2, WIDTH);
  deck.translate(0, DECK_Y, 0);
  geos.push(painted(deck, deckCol));
  for (const sx of [-1, 1]) {
    const x = sx * TOWER_X;
    const top = new THREE.Vector3(x, 64, 0);
    // inverted Y: two legs from either side of the deck meet above it, then a tapered spire
    geos.push(beam(new THREE.Vector3(x, 0, -WIDTH / 2 - 4), top, 4.5, 4.5, white));
    geos.push(beam(new THREE.Vector3(x, 0, WIDTH / 2 + 4), top, 4.5, 4.5, white));
    const spire = new THREE.CylinderGeometry(1.4, 3.2, 36, 4);
    spire.translate(x, 64 + 18, 0);
    geos.push(painted(spire, white));
  }
  const rot = new THREE.Matrix4().makeRotationY((130 * Math.PI) / 180);
  const bridge = mergeGeometries(geos);
  bridge.applyMatrix4(rot);
  parts.push({ obj: new THREE.Mesh(bridge, mat), center: ZAKIM_CENTER });

  // cables: fans from each spire down to both deck edges
  const pts: number[] = [];
  for (const sx of [-1, 1]) {
    const x = sx * TOWER_X;
    for (let k = 0; k < 12; k++) {
      const yTop = 70 + k * 2.2;
      for (const dir of [-1, 1]) {
        const reach = (dir === sx ? HALF - TOWER_X - 6 : TOWER_X - 8) * ((k + 1) / 12);
        for (const z of [-WIDTH / 2 + 3, WIDTH / 2 - 3]) pts.push(x, yTop, 0, x + dir * reach, DECK_Y + 1, z);
      }
    }
  }
  const cg = new THREE.BufferGeometry();
  cg.setAttribute("position", new THREE.Float32BufferAttribute(pts, 3));
  cg.applyMatrix4(rot);
  parts.push({ obj: new THREE.LineSegments(cg, new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.85 })), center: ZAKIM_CENTER });
  return parts;
}
