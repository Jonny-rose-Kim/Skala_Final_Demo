/**
 * Scene-side effect factories per template id (plasma volumes, schematic overlays). Kept apart from the
 * domain registry so domain/config modules never import the renderer.
 */
import type { Scene } from "@babylonjs/core/scene";
import type { MaterialLibrary } from "../materials/materialLibrary";
import type { VisualSettings } from "../presentation/store";
import type { EffectSet, EquipmentInstance } from "./equipmentInstance";

export interface EffectFactoryContext {
  scene: Scene;
  instance: EquipmentInstance;
  materials: MaterialLibrary;
  isWebGPU: boolean;
  visual: VisualSettings;
  /** Transport equipment: load-port stations projected onto its rail (s, seat height, label). */
  stationMarkers?: { s: number; seatY: number; label: string }[];
}

export type EffectFactory = (ctx: EffectFactoryContext) => EffectSet;

const factories = new Map<string, EffectFactory>();

export function registerEffects(templateId: string, factory: EffectFactory): void {
  factories.set(templateId, factory);
}

export function createEffects(templateId: string, ctx: EffectFactoryContext): EffectSet | null {
  const f = factories.get(templateId);
  return f ? f(ctx) : null;
}
