// Free "Blender-style" camera on top of MapLibre's mouse controls:
//   W/S forward/back, A/D strafe, Q/E turn, R/F tilt up/down, Space/Shift (or Z/X) rise/sink (zoom).
// Moves are smooth while a key (or an on-screen pad button) is held. Mouse: drag pans, right-drag or
// Ctrl-drag orbits and tilts (MapLibre), wheel zooms.
import type { Map as MlMap } from "maplibre-gl";

export type FlyAction = "fwd" | "back" | "left" | "right" | "turnL" | "turnR" | "tiltUp" | "tiltDown" | "up" | "down";

const KEYS: Record<string, FlyAction> = {
  KeyW: "fwd", KeyS: "back", KeyA: "left", KeyD: "right",
  KeyQ: "turnL", KeyE: "turnR", KeyR: "tiltUp", KeyF: "tiltDown",
  Space: "up", KeyZ: "up", ShiftLeft: "down", ShiftRight: "down", KeyX: "down",
};

export class FlyControls {
  private held = new Set<FlyAction>();
  private raf = 0;
  private last = 0;

  constructor(private map: MlMap) {
    window.addEventListener("keydown", this.down);
    window.addEventListener("keyup", this.up);
    window.addEventListener("blur", this.clear);
  }

  dispose() {
    window.removeEventListener("keydown", this.down);
    window.removeEventListener("keyup", this.up);
    window.removeEventListener("blur", this.clear);
    cancelAnimationFrame(this.raf);
  }

  /** for the on-screen pad */
  press(a: FlyAction) {
    this.held.add(a);
    this.start();
  }
  release(a: FlyAction) {
    this.held.delete(a);
  }

  private typing(e: KeyboardEvent) {
    const t = e.target as HTMLElement | null;
    return !!t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable);
  }
  private down = (e: KeyboardEvent) => {
    const a = KEYS[e.code];
    if (!a || this.typing(e) || e.metaKey || e.ctrlKey || e.altKey) return;
    e.preventDefault();
    this.press(a);
  };
  private up = (e: KeyboardEvent) => {
    const a = KEYS[e.code];
    if (a) this.release(a);
  };
  private clear = () => this.held.clear();

  private start() {
    if (this.raf) return;
    this.last = performance.now();
    this.raf = requestAnimationFrame(this.tick);
  }

  private tick = (t: number) => {
    const dt = Math.max(0, Math.min(0.2, (t - this.last) / 1000)); // rAF time can be a bit before start();
    this.last = t;
    if (!this.held.size) {
      this.raf = 0;
      return;
    }
    const m = this.map;
    const h = (a: FlyAction) => (this.held.has(a) ? 1 : 0);
    const fwd = h("fwd") - h("back"), side = h("right") - h("left");
    const turn = h("turnR") - h("turnL"), tilt = h("tiltUp") - h("tiltDown"), rise = h("up") - h("down");
    // screen pixels per second; at a steep tilt "forward" moves further on the ground, which feels right
    const speed = 520 * dt;
    if (fwd || side) {
      // panBy is in screen space: up on screen = forward along the view direction
      m.panBy([side * speed, -fwd * speed], { duration: 0 });
    }
    if (turn) m.setBearing(m.getBearing() + turn * 70 * dt);
    if (tilt) m.setPitch(Math.max(0, Math.min(m.getMaxPitch(), m.getPitch() + tilt * 40 * dt)));
    if (rise) m.setZoom(m.getZoom() - rise * 1.2 * dt);
    this.raf = requestAnimationFrame(this.tick);
  };
}
