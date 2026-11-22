// Google Photorealistic 3D Tiles (real photo-textured buildings, trees and ground for all of Massachusetts),
// streamed with 3DTilesRendererJS into a MapLibre custom layer. Needs NEXT_PUBLIC_GOOGLE_MAPS_KEY with the
// Map Tiles API enabled; without a key this layer is never added and the game-style city is used instead.
import * as THREE from "three";
import { DRACOLoader } from "three/examples/jsm/loaders/DRACOLoader.js";
import { TilesRenderer } from "3d-tiles-renderer";
import { GoogleCloudAuthPlugin, GLTFExtensionsPlugin, TileCompressionPlugin, UnloadTilesPlugin } from "3d-tiles-renderer/plugins";
import type { CustomLayerInterface, CustomRenderMethodInput, Map as MlMap } from "maplibre-gl";
import { modelMatrix } from "./trains3d";

export const GOOGLE_KEY = process.env.NEXT_PUBLIC_GOOGLE_MAPS_KEY ?? "";
/** Google heights are above the ellipsoid; around Boston the ground is ~29 m below it. Lift so streets sit at 0. */
const GEOID_LIFT = 29;
/** Below this zoom the flat-map approximation bends too much; the basemap and globe show instead. */
export const GOOGLE_MIN_ZOOM = 11.5;

/** TilesRenderer whose screen-space error uses MapLibre's real field of view (our camera matrix is pre-multiplied). */
class MapTilesRenderer extends TilesRenderer {
  fovY = (36.87 * Math.PI) / 180;
  viewHeight = 1;
  prepareForTraversal() {
    (TilesRenderer.prototype as unknown as { prepareForTraversal: () => void }).prepareForTraversal.call(this);
    for (const info of (this as unknown as { cameraInfo: { isOrthographic: boolean; sseDenominator: number }[] }).cameraInfo) {
      info.isOrthographic = false;
      info.sseDenominator = (2 * Math.tan(this.fovY / 2)) / this.viewHeight;
    }
  }
}

export class GoogleTilesLayer implements CustomLayerInterface {
  id = "google-3d";
  type = "custom" as const;
  renderingMode = "3d" as const;
  visible = true;

  private map!: MlMap;
  private renderer!: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera = new THREE.Camera();
  private tiles!: MapTilesRenderer;
  private enu = new THREE.Matrix4();
  private wFromEnu = new THREE.Matrix4().set(1, 0, 0, 0, 0, 0, 1, GEOID_LIFT, 0, -1, 0, 0, 0, 0, 0, 1);
  private mvp = new THREE.Matrix4();
  onError: (msg: string) => void = () => {};

  onAdd(map: MlMap, gl: WebGLRenderingContext | WebGL2RenderingContext) {
    this.map = map;
    this.renderer = new THREE.WebGLRenderer({ canvas: map.getCanvas(), context: gl, antialias: true });
    this.renderer.autoClear = false;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.camera.matrixWorldAutoUpdate = false;

    const tiles = new MapTilesRenderer("https://tile.googleapis.com/v1/3dtiles/root.json");
    tiles.registerPlugin(new GoogleCloudAuthPlugin({ apiToken: GOOGLE_KEY, autoRefreshToken: true }));
    tiles.registerPlugin(new GLTFExtensionsPlugin({ dracoLoader: new DRACOLoader().setDecoderPath("https://www.gstatic.com/draco/versioned/decoders/1.5.7/") }));
    tiles.registerPlugin(new TileCompressionPlugin());
    tiles.registerPlugin(new UnloadTilesPlugin());
    tiles.errorTarget = 10; // bigger = fewer, coarser tiles = faster
    tiles.setCamera(this.camera);
    tiles.group.matrixAutoUpdate = false;
    let loadedAny = false;
    tiles.addEventListener("load-model", () => {
      loadedAny = true;
      map.triggerRepaint();
    });
    tiles.addEventListener("tile-visibility-change", () => map.triggerRepaint());
    tiles.addEventListener("load-error", (e: unknown) => {
      const err = (e as { error?: Error }).error;
      console.warn("[google 3d] load error", err);
      // nothing loaded yet = key refused or Google unreachable: go back to the built-in 3D city
      if (!loadedAny) this.onError(String(err?.message).match(/40[0-3]/) ? "Google 3D tiles refused the key (is the Map Tiles API enabled?)" : "Google 3D tiles unreachable");
    });
    this.scene.add(tiles.group);
    this.tiles = tiles;
  }

  onRemove() {
    this.tiles?.dispose();
  }

  render(_gl: WebGLRenderingContext | WebGL2RenderingContext, args: CustomRenderMethodInput) {
    const zoom = this.map.getZoom();
    if (!this.visible || zoom < GOOGLE_MIN_ZOOM) return;
    const pd = args.defaultProjectionData;
    const globe = pd.fallbackMatrix !== pd.mainMatrix && pd.projectionTransition > 0.5;
    const c = this.map.getCenter();

    // local frame W at the map center: meters, x east, y up, z south (same as our other 3D layers)
    const origin = modelMatrix(new THREE.Matrix4(), c.lng, c.lat, globe);
    const main = new THREE.Matrix4().fromArray((globe ? pd.mainMatrix : pd.fallbackMatrix) as unknown as number[]);
    this.mvp.multiplyMatrices(main, origin);
    this.camera.projectionMatrix.copy(this.mvp);
    this.camera.projectionMatrixInverse.copy(this.mvp).invert();

    // camera position in W: the point where clip x = y = w = 0
    const e = this.mvp.elements; // column-major
    const row = (r: number) => [e[r], e[4 + r], e[8 + r], e[12 + r]];
    const [r0, r1, r3] = [row(0), row(1), row(3)];
    const A = new THREE.Matrix3().set(r0[0], r0[1], r0[2], r1[0], r1[1], r1[2], r3[0], r3[1], r3[2]);
    const eye = new THREE.Vector3(-r0[3], -r1[3], -r3[3]).applyMatrix3(A.invert());
    this.camera.matrixWorld.makeTranslation(eye.x, eye.y, eye.z);
    this.camera.matrixWorldInverse.identity();

    // ECEF -> W
    this.tiles.ellipsoid.getEastNorthUpFrame((c.lat * Math.PI) / 180, (c.lng * Math.PI) / 180, 0, this.enu);
    this.tiles.group.matrix.copy(this.wFromEnu).multiply(this.enu.invert());
    this.tiles.group.matrixWorld.copy(this.tiles.group.matrix);
    this.tiles.group.matrixWorldInverse = this.tiles.group.matrixWorldInverse ?? new THREE.Matrix4();
    this.tiles.group.matrixWorldInverse.copy(this.tiles.group.matrixWorld).invert();

    const canvas = this.map.getCanvas();
    this.tiles.fovY = (this.map.getVerticalFieldOfView() * Math.PI) / 180;
    this.tiles.viewHeight = canvas.height;
    this.tiles.setResolution(this.camera, canvas.width, canvas.height);
    this.tiles.update();

    this.renderer.resetState();
    this.renderer.render(this.scene, this.camera);
    if (this.tiles.loadProgress < 1) this.map.triggerRepaint();
  }
}
