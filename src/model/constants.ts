export const CAKE_WEIGHT_CLASSES = ['200g', '350g', '500g', '1000g+'] as const;

/** How a cake fires: size, pacing and role in the show. */
export const CAKE_TAGS = [
  'Big breaks',
  'Small',
  'Medium',
  'Long',
  'Finale',
  'Zipper',
  'NOAB',
  'Fan',
  'Barrage',
  'Transition',
  'Fast',
  'Slow',
] as const;

/** What the shots look like in the sky. */
export const CAKE_EFFECTS = [
  'Crackle',
  'Strobe',
  'Willow',
  'Comets',
  'Mines',
  'Ghost',
  'Dahlia',
  'Peony',
  'Chrysanthemum',
  'Brocade',
  'Palm',
  'Flying fish',
  'Ring',
  'Crossette',
  'Special',
  'Tourbillion',
  'Pistil',
  'Coconut',
  'Girandola',
  'Horsetail',
  'Nishiki',
  'Salute',
  'Spider',
  'Chasers',
] as const;

/** What color the shots are. */
export const CAKE_COLORS = ['Red', 'Orange', 'Golden', 'Green', 'Neon', 'Blue', 'Purple', 'Silver'] as const;

/** The supplies checklist older show files started with (see migrateWorksheetSupplies). */
export const LEGACY_DEFAULT_WORKSHEET_SUPPLIES = [
  'Fuse tape',
  'Fuse cutter',
  'Cling film (weatherproof fuse and tube tops)',
  'PPE: safety glasses, gloves, hearing protection',
  'Stabilization: boards, stakes, sandbags, screws or zip ties',
];
