/**
 * Cleanway CLW-08v2 based OHT: the shared OHT layout math (rail path, hoist extension, carrier seat in the
 * hoist frame) on the current bay's rail config (config/geometry/clw08v2-oht-v1.json).
 */
import rawConfig from "../../../config/geometry/clw08v2-oht-v1.json";
import { deriveOhtLayout, type OhtGeometryConfig, type OhtLayout } from "../oht/layout";

export const CLW_CONFIG = rawConfig as unknown as OhtGeometryConfig;
export const CLW_LAYOUT: OhtLayout = deriveOhtLayout(CLW_CONFIG);
