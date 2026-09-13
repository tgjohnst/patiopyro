import type { Addressing, Controller, FuseType } from './schema';

export interface ModuleModel {
  name: string;
  cueCount: number;
  /** Number of independently addressable banks (COBRA 36M has 2). */
  banks: number;
}

export interface FiringSystemPreset {
  id: string;
  name: string;
  addressing: Addressing;
  channels: number;
  cuesPerChannel: number;
  maxModules: number | null;
  igniterKind: 'ematch' | 'talon';
  maxIgnitersPerCue: number;
  moduleModels: ModuleModel[];
  notes: string;
}

/**
 * Starting points for common consumer/prosumer systems. Specs vary by firmware and
 * hardware revision, so every value is editable in the app; verify against your gear.
 */
export const FIRING_SYSTEM_PRESETS: FiringSystemPreset[] = [
  {
    id: 'generic',
    name: 'Generic wireless system',
    addressing: 'flat',
    channels: 1,
    cuesPerChannel: 48,
    maxModules: null,
    igniterKind: 'ematch',
    maxIgnitersPerCue: 4,
    moduleModels: [
      { name: 'Generic 4-cue receiver', cueCount: 4, banks: 1 },
      { name: 'Generic 12-cue receiver', cueCount: 12, banks: 1 },
      { name: 'Generic 24-cue receiver', cueCount: 24, banks: 1 },
    ],
    notes: 'Cue numbers on receivers map directly to controller cue buttons.',
  },
  {
    id: 'cobra',
    name: 'COBRA 18R2',
    addressing: 'channels',
    channels: 100,
    cuesPerChannel: 18,
    maxModules: null,
    igniterKind: 'ematch',
    maxIgnitersPerCue: 8,
    moduleModels: [
      { name: 'COBRA 18M', cueCount: 18, banks: 1 },
      { name: 'COBRA 36M', cueCount: 36, banks: 2 },
    ],
    notes:
      '18R2 fires 18 cues per channel; 100 channels (200 on firmware 6+). Each module bank is set to a channel — banks sharing a channel fire together.',
  },
  {
    id: 'ignite',
    name: 'IGNITE (app)',
    addressing: 'module',
    channels: 1,
    cuesPerChannel: 36,
    maxModules: 6,
    igniterKind: 'talon',
    maxIgnitersPerCue: 2,
    moduleModels: [
      { name: 'IGNITE i18', cueCount: 18, banks: 1 },
      { name: 'IGNITE i36', cueCount: 36, banks: 1 },
    ],
    notes:
      'Up to 6 modules (216 cues) from the app. Talon/clip igniters: max 2 per cue; e-match initiators: up to 10 per cue.',
  },
  {
    id: 'bilusocn',
    name: 'Bilusocn (BL1200 / BL12TC)',
    addressing: 'flat',
    channels: 1,
    cuesPerChannel: 60,
    maxModules: null,
    igniterKind: 'ematch',
    maxIgnitersPerCue: 2,
    moduleModels: [
      { name: 'Bilusocn 4-cue receiver', cueCount: 4, banks: 1 },
      { name: 'Bilusocn 12-cue receiver', cueCount: 12, banks: 1 },
      { name: 'Bilusocn 24-cue receiver', cueCount: 24, banks: 1 },
    ],
    notes:
      'Receivers are coded to remote cue numbers. Receivers coded to the same cue fire together.',
  },
  {
    id: 'p1200',
    name: 'P1200-style remote',
    addressing: 'flat',
    channels: 1,
    cuesPerChannel: 72,
    maxModules: null,
    igniterKind: 'ematch',
    maxIgnitersPerCue: 2,
    moduleModels: [
      { name: '4-cue receiver', cueCount: 4, banks: 1 },
      { name: 'R12 12-cue receiver', cueCount: 12, banks: 1 },
    ],
    notes: 'Budget 433 MHz systems. Remote cue count varies by kit — set it to match yours.',
  },
];

export function presetById(presetId: string): FiringSystemPreset {
  return FIRING_SYSTEM_PRESETS.find((p) => p.id === presetId) ?? FIRING_SYSTEM_PRESETS[0];
}

export function controllerFromPreset(p: FiringSystemPreset): Controller {
  return {
    presetId: p.id,
    name: p.name,
    addressing: p.addressing,
    channels: p.channels,
    cuesPerChannel: p.cuesPerChannel,
    maxModules: p.maxModules,
    igniterKind: p.igniterKind,
    maxIgnitersPerCue: p.maxIgnitersPerCue,
  };
}

/**
 * Typical burn rates. Real fuse varies by batch, humidity and brand — time a
 * measured length of your own stock and edit these.
 */
export const DEFAULT_FUSE_TYPES: FuseType[] = [
  {
    id: 'fuse-green-visco',
    name: 'Green visco (3 mm)',
    burnRateSecPerFt: 30,
    rollLengthFt: 100,
    rollCost: 18,
    color: '#22c55e',
    notes: '~2.5 s/in. The usual consumer safety fuse.',
  },
  {
    id: 'fuse-fast-visco',
    name: 'Fast visco',
    burnRateSecPerFt: 12,
    rollLengthFt: 50,
    rollCost: 14,
    color: '#f97316',
    notes: '~1 s/in.',
  },
  {
    id: 'fuse-time',
    name: 'Time fuse',
    burnRateSecPerFt: 40,
    rollLengthFt: 50,
    rollCost: 20,
    color: '#a855f7',
    notes: 'Slow and consistent; good for precise delays.',
  },
  {
    id: 'fuse-black-match',
    name: 'Black match',
    burnRateSecPerFt: 6,
    rollLengthFt: 50,
    rollCost: 15,
    color: '#64748b',
    notes: 'Unpiped; burns roughly 2 in/s.',
  },
  {
    id: 'fuse-quickmatch',
    name: 'Quickmatch',
    burnRateSecPerFt: 0.02,
    rollLengthFt: 50,
    rollCost: 25,
    color: '#ef4444',
    notes: 'Piped black match — effectively instant.',
  },
];

export const POSITION_COLORS = ['#f43f5e', '#3b82f6', '#eab308', '#10b981', '#a855f7'];
