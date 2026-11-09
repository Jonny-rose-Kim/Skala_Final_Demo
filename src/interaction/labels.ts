/**
 * DOM label overlay for key assemblies: projected each frame, overlap-pruned by priority, and hidden
 * when the anchor is behind the camera, outside the viewport or occluded (low-rate ray test).
 */
import type { Scene } from "@babylonjs/core/scene";
import type { Camera } from "@babylonjs/core/Cameras/camera";
import { Vector3, Matrix } from "@babylonjs/core/Maths/math.vector";
import { Viewport } from "@babylonjs/core/Maths/math.viewport";
import { Ray } from "@babylonjs/core/Culling/ray";
import type { AbstractMesh } from "@babylonjs/core/Meshes/abstractMesh";

export interface LabelItem {
  id: string;
  text: string;
  anchor: () => Vector3 | null;
  priority: number;
  /** Mesh predicate identifying the label's own meshes (not counted as occluders). */
  ownMeshes: () => Set<AbstractMesh>;
}

export class LabelsOverlay {
  private readonly layer: HTMLDivElement;
  private items: LabelItem[] = [];
  private els = new Map<string, HTMLDivElement>();
  private occluded = new Map<string, boolean>();
  private frame = 0;
  private visible = false;
  private readonly tmp = new Vector3();
  private readonly identity = Matrix.Identity();

  constructor(
    private readonly container: HTMLElement,
    private readonly scene: Scene,
  ) {
    this.layer = document.createElement("div");
    this.layer.className = "pointer-events-none absolute inset-0 overflow-hidden";
    this.layer.setAttribute("data-testid", "labels-layer");
    container.appendChild(this.layer);
  }

  setItems(items: LabelItem[]): void {
    this.items = items.slice().sort((a, b) => b.priority - a.priority);
    for (const [id, el] of this.els) {
      if (!items.some((i) => i.id === id)) {
        el.remove();
        this.els.delete(id);
      }
    }
    for (const it of items) {
      if (!this.els.has(it.id)) {
        const el = document.createElement("div");
        el.className = "absolute -translate-x-1/2 -translate-y-full whitespace-nowrap rounded border border-slate-500/60 bg-slate-900/80 px-1.5 py-0.5 text-[11px] text-slate-100 shadow";
        el.textContent = it.text;
        el.style.display = "none";
        this.layer.appendChild(el);
        this.els.set(it.id, el);
      }
    }
  }

  setVisible(v: boolean): void {
    this.visible = v;
    if (!v) for (const el of this.els.values()) el.style.display = "none";
  }

  update(camera: Camera, occluderPredicate: (m: AbstractMesh) => boolean): void {
    if (!this.visible) return;
    this.frame++;
    const w = this.container.clientWidth;
    const h = this.container.clientHeight;
    const viewport = new Viewport(0, 0, w, h);
    const transform = camera.getTransformationMatrix();
    const placed: { x: number; y: number; w: number; h: number }[] = [];
    const camPos = camera.globalPosition;
    for (const it of this.items) {
      const el = this.els.get(it.id)!;
      const anchor = it.anchor();
      if (!anchor) {
        el.style.display = "none";
        continue;
      }
      Vector3.ProjectToRef(anchor, this.identity, transform, viewport, this.tmp);
      const behind = this.tmp.z < 0 || this.tmp.z > 1;
      if (behind || this.tmp.x < 10 || this.tmp.x > w - 10 || this.tmp.y < 24 || this.tmp.y > h - 10) {
        el.style.display = "none";
        continue;
      }
      // occlusion test at ~12 Hz staggered per label
      if ((this.frame + it.priority) % 5 === 0) {
        const dir = anchor.subtract(camPos);
        const dist = dir.length();
        dir.normalize();
        const ray = new Ray(camPos, dir, dist - 0.01);
        const own = it.ownMeshes();
        const hit = this.scene.pickWithRay(ray, (m) => occluderPredicate(m) && !own.has(m), true);
        this.occluded.set(it.id, !!hit?.hit && (hit.distance ?? Infinity) < dist - 0.02);
      }
      if (this.occluded.get(it.id)) {
        el.style.display = "none";
        continue;
      }
      const rect = { x: this.tmp.x - 60, y: this.tmp.y - 26, w: 120, h: 26 };
      if (placed.some((p) => rect.x < p.x + p.w && rect.x + rect.w > p.x && rect.y < p.y + p.h && rect.y + rect.h > p.y)) {
        el.style.display = "none";
        continue;
      }
      placed.push(rect);
      el.style.display = "block";
      el.style.left = `${this.tmp.x.toFixed(1)}px`;
      el.style.top = `${(this.tmp.y - 6).toFixed(1)}px`;
    }
  }

  dispose(): void {
    this.layer.remove();
    this.els.clear();
  }
}
