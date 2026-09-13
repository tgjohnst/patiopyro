import { z } from 'zod';
import { CAKE_CATEGORIES, CAKE_WEIGHT_CLASSES, DEFAULT_WORKSHEET_SUPPLIES } from './constants';

export const SCHEMA_VERSION = 1;

const id = z.string().min(1);
const nonNeg = z.number().min(0);

const catalogBase = {
  id,
  name: z.string(),
  qtyOwned: z.number().int().min(0),
  notes: z.string().default(''),
  /** Product page or retailer link. */
  url: z.string().default(''),
};

export const cakeSchema = z.object({
  ...catalogBase,
  kind: z.literal('cake'),
  brand: z.string().default(''),
  shots: z.number().int().min(0),
  durationSec: nonNeg,
  effectNotes: z.string().default(''),
  grade: z.enum(['1.4G', '1.4G Pro-line']),
  unitCost: nonNeg,
  /** Seconds from fuse ignition to first shot. */
  leadDelaySec: nonNeg,
  /** Cake has an exit fuse that lights after the last shot. */
  hasExitFuse: z.boolean(),
  /** Net explosive weight class; null when unclassified. */
  weightClass: z.enum(CAKE_WEIGHT_CLASSES).nullable().default(null),
  categories: z.array(z.enum(CAKE_CATEGORIES)).default([]),
});

export const shellPricingSchema = z.discriminatedUnion('mode', [
  z.object({ mode: z.literal('unit'), unitCost: nonNeg }),
  z.object({ mode: z.literal('case'), caseQty: z.number().int().min(1), caseCost: nonNeg }),
]);

export const shellSchema = z.object({
  ...catalogBase,
  kind: z.literal('shell'),
  brand: z.string().default(''),
  effect: z.string().default(''),
  sizeIn: nonNeg,
  /** Seconds from fuse ignition to burst (lead fuse + lift). */
  leadDelaySec: nonNeg,
  burstDurationSec: nonNeg,
  pricing: shellPricingSchema,
});

export const rackSchema = z.object({
  ...catalogBase,
  kind: z.literal('rack'),
  rows: z.number().int().min(1),
  cols: z.number().int().min(1),
  tubeSizeIn: nonNeg,
  tubeSpacingIn: nonNeg,
  unitCost: nonNeg,
});

export const catalogItemSchema = z.discriminatedUnion('kind', [cakeSchema, shellSchema, rackSchema]);

export const fuseTypeSchema = z.object({
  id,
  name: z.string(),
  burnRateSecPerFt: nonNeg,
  rollLengthFt: z.number().positive(),
  rollCost: nonNeg,
  color: z.string(),
  notes: z.string().default(''),
});

export const positionSchema = z.object({
  id,
  name: z.string(),
  color: z.string(),
  /** Site map coordinates in feet. */
  x: z.number(),
  y: z.number(),
  safetyRadiusFt: nonNeg,
});

export const siteMapSchema = z.object({
  widthFt: z.number().positive(),
  heightFt: z.number().positive(),
  audience: z.object({ x1: z.number(), y1: z.number(), x2: z.number(), y2: z.number() }),
  backgroundDataUrl: z.string().nullable(),
  backgroundOpacity: z.number().min(0).max(1),
});

export const placedItemSchema = z.object({
  id,
  catalogId: id,
  positionId: id,
  /** Position canvas coordinates (px). */
  x: z.number(),
  y: z.number(),
  label: z.string().default(''),
  /** Racks only: shell catalog id loaded in each tube (row-major order). */
  tubes: z.array(z.string().nullable()).optional(),
});

export const fuseNodeSchema = z.discriminatedUnion('kind', [
  z.object({
    id,
    kind: z.literal('igniter'),
    positionId: id,
    x: z.number(),
    y: z.number(),
    moduleId: id,
    pin: z.number().int().min(1),
  }),
  z.object({ id, kind: z.literal('junction'), positionId: id, x: z.number(), y: z.number() }),
]);

/**
 * Endpoint keys:
 *  n:<nodeId>            igniter or junction
 *  in:<placedId>         cake lead fuse
 *  out:<placedId>        cake exit fuse
 *  t:<placedId>:<index>  rack tube (0-based)
 */
export const fuseSegmentSchema = z.object({
  id,
  positionId: id,
  from: z.string(),
  to: z.string(),
  fuseTypeId: id,
  lengthIn: nonNeg,
});

export const addressingSchema = z.enum(['flat', 'channels', 'module']);

export const controllerSchema = z.object({
  presetId: z.string(),
  name: z.string(),
  /**
   * flat: cues 1..cuesPerChannel on the controller; receivers pick a start cue.
   * channels: channels x cuesPerChannel (e.g. COBRA); module banks pick a channel.
   * module: every module pin is its own address (e.g. IGNITE app).
   */
  addressing: addressingSchema,
  channels: z.number().int().min(1),
  cuesPerChannel: z.number().int().min(1),
  maxModules: z.number().int().min(1).nullable(),
  igniterKind: z.enum(['ematch', 'talon']),
  maxIgnitersPerCue: z.number().int().min(1),
});

export const moduleSchema = z.object({
  id,
  name: z.string(),
  modelName: z.string(),
  cueCount: z.number().int().min(1),
  positionId: z.string().nullable(),
  /** flat addressing: controller cue for pin 1. */
  startCue: z.number().int().min(1),
  /** channels addressing: one channel per bank; pins are split evenly across banks. */
  bankChannels: z.array(z.number().int().min(1)).min(1),
  /** Manual pin -> address id overrides (used to link pins across modules). */
  pinOverrides: z.record(z.string(), z.string()),
});

export const settingsSchema = z.object({
  units: z.enum(['imperial', 'metric']),
  defaultFuseTypeId: z.string(),
  defaultSegmentLengthIn: nonNeg,
  /** Extra fuse per segment for overlap/tie-in at both ends. */
  connectionAllowanceIn: nonNeg,
  fuseWastePct: nonNeg,
  igniterSparePct: nonNeg,
  igniterUnitCost: nonNeg,
  includeRacksInCost: z.boolean(),
  snapSec: z.number().positive(),
  /** Extra checklist lines printed under shopping & prep on the setup worksheet. */
  worksheetSupplies: z.array(z.string()).default(() => [...DEFAULT_WORKSHEET_SUPPLIES]),
});

export const showSchema = z.object({
  schemaVersion: z.literal(SCHEMA_VERSION),
  meta: z.object({
    name: z.string(),
    date: z.string(),
    location: z.string(),
    notes: z.string(),
  }),
  settings: settingsSchema,
  catalog: z.array(catalogItemSchema),
  fuseTypes: z.array(fuseTypeSchema),
  siteMap: siteMapSchema,
  positions: z.array(positionSchema).max(5),
  placed: z.array(placedItemSchema),
  fuseNodes: z.array(fuseNodeSchema),
  fuseSegments: z.array(fuseSegmentSchema),
  firing: z.object({ controller: controllerSchema, modules: z.array(moduleSchema) }),
  /** Address id -> fire time in seconds from show start. */
  cueTimes: z.record(z.string(), z.number()),
  cueNotes: z.record(z.string(), z.string()),
});

export type Cake = z.infer<typeof cakeSchema>;
export type Shell = z.infer<typeof shellSchema>;
export type Rack = z.infer<typeof rackSchema>;
export type CatalogItem = z.infer<typeof catalogItemSchema>;
export type ShellPricing = z.infer<typeof shellPricingSchema>;
export type FuseType = z.infer<typeof fuseTypeSchema>;
export type Position = z.infer<typeof positionSchema>;
export type SiteMap = z.infer<typeof siteMapSchema>;
export type PlacedItem = z.infer<typeof placedItemSchema>;
export type FuseNode = z.infer<typeof fuseNodeSchema>;
export type FuseSegment = z.infer<typeof fuseSegmentSchema>;
export type Addressing = z.infer<typeof addressingSchema>;
export type Controller = z.infer<typeof controllerSchema>;
export type FiringModule = z.infer<typeof moduleSchema>;
export type Settings = z.infer<typeof settingsSchema>;
export type Show = z.infer<typeof showSchema>;

/** Migrate older show files to the current schema, then validate. */
export function parseShow(raw: unknown): Show {
  const obj = (raw ?? {}) as { schemaVersion?: number };
  if (typeof obj.schemaVersion !== 'number') {
    throw new Error('Not a PatioPyro show file (missing schemaVersion).');
  }
  if (obj.schemaVersion > SCHEMA_VERSION) {
    throw new Error(
      `This show was saved by a newer version of PatioPyro (schema ${obj.schemaVersion}).`,
    );
  }
  // Future migrations: if (obj.schemaVersion === 1) raw = migrate1to2(raw) ...
  const result = showSchema.safeParse(raw);
  if (!result.success) {
    const issue = result.error.issues[0];
    throw new Error(`Invalid show file at ${issue.path.join('.')}: ${issue.message}`);
  }
  return result.data;
}
