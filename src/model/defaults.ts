import { nanoid } from 'nanoid';
import {
  DEFAULT_FUSE_TYPES,
  FIRING_SYSTEM_PRESETS,
  POSITION_COLORS,
  controllerFromPreset,
} from './presets';
import { SCHEMA_VERSION, type Position, type Show } from './schema';

export const uid = (prefix: string) => `${prefix}_${nanoid(8)}`;

export const MAX_POSITIONS = 5;

export function newPosition(index: number, siteWidthFt = 100): Position {
  const spacing = siteWidthFt / (MAX_POSITIONS + 1);
  return {
    id: uid('pos'),
    name: `Position ${String.fromCharCode(65 + index)}`,
    color: POSITION_COLORS[index % POSITION_COLORS.length],
    x: Math.round(spacing * (index + 1)),
    y: 20,
    safetyRadiusFt: 35,
  };
}

export function createEmptyShow(): Show {
  return {
    schemaVersion: SCHEMA_VERSION,
    meta: { name: 'Untitled show', date: '', location: '', notes: '' },
    settings: {
      units: 'imperial',
      defaultFuseTypeId: DEFAULT_FUSE_TYPES[0].id,
      defaultSegmentLengthIn: 12,
      connectionAllowanceIn: 2,
      fuseWastePct: 10,
      igniterSparePct: 10,
      igniterUnitCost: 1.25,
      includeRacksInCost: false,
      snapSec: 0.5,
    },
    catalog: [],
    fuseTypes: structuredClone(DEFAULT_FUSE_TYPES),
    siteMap: {
      widthFt: 100,
      heightFt: 70,
      audience: { x1: 5, y1: 60, x2: 95, y2: 60 },
      backgroundDataUrl: null,
      backgroundOpacity: 0.5,
    },
    positions: [newPosition(0)],
    placed: [],
    fuseNodes: [],
    fuseSegments: [],
    firing: { controller: controllerFromPreset(FIRING_SYSTEM_PRESETS[0]), modules: [] },
    cueTimes: {},
    cueNotes: {},
  };
}
