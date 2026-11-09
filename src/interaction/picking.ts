/**
 * Picking: pointer -> semantic asset via mesh metadata (never by parsing names). Disabled meshes are
 * not pickable, so hidden or cutaway-removed parts never block picks. Decorative meshes resolve to
 * their owning asset through metadata.
 */
import type { Scene } from "@babylonjs/core/scene";
import type { AbstractMesh } from "@babylonjs/core/Meshes/abstractMesh";
import { PointerEventTypes, type PointerInfo } from "@babylonjs/core/Events/pointerEvents";
import type { Observer } from "@babylonjs/core/Misc/observable";
import type { InstanceMeshMetadata } from "../scene/chamberInstance";

export interface PickResult {
  instanceId: string;
  assetId: string;
}

export interface PickingCallbacks {
  onSelect(result: PickResult | null): void;
  onHover(result: PickResult | null): void;
}

export function resolveMeshToAsset(mesh: AbstractMesh | null | undefined): PickResult | null {
  if (!mesh) return null;
  const meta = mesh.metadata as InstanceMeshMetadata | undefined;
  if (!meta || !meta.assetId || !meta.instanceId || meta.isPlasma) return null;
  return { instanceId: meta.instanceId, assetId: meta.assetId };
}

export class PickingController {
  private observer: Observer<PointerInfo> | null = null;
  private downX = 0;
  private downY = 0;
  private downTime = 0;
  private lastHoverTime = 0;
  private lastHover: string | null = null;

  constructor(
    private readonly scene: Scene,
    private readonly callbacks: PickingCallbacks,
  ) {
    scene.pointerDownPredicate = (m) => this.predicate(m);
    scene.pointerMovePredicate = (m) => this.predicate(m);
    scene.pointerUpPredicate = (m) => this.predicate(m);
    scene.skipPointerMovePicking = true; // we throttle hover picks ourselves
    this.observer = scene.onPointerObservable.add((info) => this.handle(info));
  }

  private predicate(m: AbstractMesh): boolean {
    const meta = m.metadata as InstanceMeshMetadata | undefined;
    return m.isPickable && m.isEnabled() && m.isVisible && !!meta && !meta.isPlasma;
  }

  private handle(info: PointerInfo): void {
    const ev = info.event as PointerEvent;
    switch (info.type) {
      case PointerEventTypes.POINTERDOWN:
        this.downX = ev.clientX;
        this.downY = ev.clientY;
        this.downTime = performance.now();
        break;
      case PointerEventTypes.POINTERUP: {
        const moved = Math.hypot(ev.clientX - this.downX, ev.clientY - this.downY);
        const dt = performance.now() - this.downTime;
        if (moved < 6 && dt < 600 && ev.button === 0) {
          const pick = this.scene.pick(this.scene.pointerX, this.scene.pointerY, (m) => this.predicate(m), false);
          this.callbacks.onSelect(pick?.hit ? resolveMeshToAsset(pick.pickedMesh) : null);
        }
        break;
      }
      case PointerEventTypes.POINTERMOVE: {
        const now = performance.now();
        if (now - this.lastHoverTime < 50) return;
        this.lastHoverTime = now;
        const pick = this.scene.pick(this.scene.pointerX, this.scene.pointerY, (m) => this.predicate(m), true);
        const res = pick?.hit ? resolveMeshToAsset(pick.pickedMesh) : null;
        const key = res ? `${res.instanceId}:${res.assetId}` : null;
        if (key !== this.lastHover) {
          this.lastHover = key;
          this.callbacks.onHover(res);
        }
        break;
      }
    }
  }

  dispose(): void {
    if (this.observer) this.scene.onPointerObservable.remove(this.observer);
    this.observer = null;
  }
}
