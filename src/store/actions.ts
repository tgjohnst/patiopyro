import { pinAddress } from '../model/addressing';
import { tubeCount } from '../model/catalog';
import { MAX_POSITIONS, newPosition, uid } from '../model/defaults';
import { endpointPlacedId, inKey, nodeKey, outKey, tubeKey } from '../model/endpoints';
import { controllerFromPreset, presetById, type ModuleModel } from '../model/presets';
import type {
  CatalogItem,
  Controller,
  FiringModule,
  FuseType,
  PlacedItem,
  Position,
  Settings,
  Show,
  SiteMap,
} from '../model/schema';
import { mutate } from './showStore';

// ---------- helpers (operate on drafts) ----------

function removeSegmentsTouching(s: Show, predicate: (endpointKey: string) => boolean) {
  s.fuseSegments = s.fuseSegments.filter((seg) => !predicate(seg.from) && !predicate(seg.to));
}

function removePlaced(s: Show, ids: Set<string>) {
  s.placed = s.placed.filter((p) => !ids.has(p.id));
  removeSegmentsTouching(s, (k) => {
    const pid = endpointPlacedId(k);
    return pid !== null && ids.has(pid);
  });
}

function removeNodes(s: Show, ids: Set<string>) {
  s.fuseNodes = s.fuseNodes.filter((n) => !ids.has(n.id));
  removeSegmentsTouching(s, (k) => ids.has(k.slice(2)) && k.startsWith('n:'));
}

/** Pin -> fire time snapshot, so cue times survive addressing changes. */
function pinTimes(s: Show) {
  const out: { moduleId: string; pin: number; time?: number; note?: string }[] = [];
  for (const n of s.fuseNodes) {
    if (n.kind !== 'igniter') continue;
    const mod = s.firing.modules.find((m) => m.id === n.moduleId);
    if (!mod) continue;
    const addr = pinAddress(s.firing.controller, mod, n.pin);
    out.push({ moduleId: mod.id, pin: n.pin, time: s.cueTimes[addr], note: s.cueNotes[addr] });
  }
  return out;
}

function restorePinTimes(s: Show, snapshot: ReturnType<typeof pinTimes>) {
  const times: Record<string, number> = {};
  const notes: Record<string, string> = {};
  for (const p of snapshot) {
    const mod = s.firing.modules.find((m) => m.id === p.moduleId);
    if (!mod) continue;
    const addr = pinAddress(s.firing.controller, mod, p.pin);
    if (p.time !== undefined) times[addr] = Math.min(times[addr] ?? Infinity, p.time);
    if (p.note) notes[addr] = p.note;
  }
  s.cueTimes = times;
  s.cueNotes = notes;
}

function withAddressingChange(s: Show, change: () => void) {
  const snap = pinTimes(s);
  change();
  restorePinTimes(s, snap);
}

// ---------- meta & settings ----------

export function updateMeta(patch: Partial<Show['meta']>) {
  mutate((s) => void Object.assign(s.meta, patch));
}

export function updateSettings(patch: Partial<Settings>) {
  mutate((s) => void Object.assign(s.settings, patch));
}

// ---------- catalog ----------

export function upsertCatalogItem(item: CatalogItem) {
  mutate((s) => {
    const i = s.catalog.findIndex((c) => c.id === item.id);
    if (i >= 0) {
      const prev = s.catalog[i];
      s.catalog[i] = item;
      if (prev.kind === 'rack' && item.kind === 'rack') {
        const n = tubeCount(item);
        for (const p of s.placed) {
          if (p.catalogId !== item.id) continue;
          const tubes = p.tubes ?? [];
          p.tubes = Array.from({ length: n }, (_, t) => tubes[t] ?? null);
        }
        removeSegmentsTouching(s, (k) => {
          const m = /^t:(.+):(\d+)$/.exec(k);
          return !!m && s.placed.some((p) => p.id === m[1] && p.catalogId === item.id) && Number(m[2]) >= n;
        });
      }
    } else {
      s.catalog.push(item);
    }
  });
}

export function deleteCatalogItem(id: string) {
  mutate((s) => {
    s.catalog = s.catalog.filter((c) => c.id !== id);
    removePlaced(s, new Set(s.placed.filter((p) => p.catalogId === id).map((p) => p.id)));
    for (const p of s.placed) {
      if (p.tubes) p.tubes = p.tubes.map((t) => (t === id ? null : t));
    }
  });
}

// ---------- fuse types ----------

export function upsertFuseType(ft: FuseType) {
  mutate((s) => {
    const i = s.fuseTypes.findIndex((f) => f.id === ft.id);
    if (i >= 0) s.fuseTypes[i] = ft;
    else s.fuseTypes.push(ft);
  });
}

export function deleteFuseType(id: string) {
  mutate((s) => {
    if (s.fuseTypes.length <= 1) return;
    s.fuseTypes = s.fuseTypes.filter((f) => f.id !== id);
    if (s.settings.defaultFuseTypeId === id) s.settings.defaultFuseTypeId = s.fuseTypes[0].id;
    for (const seg of s.fuseSegments) {
      if (seg.fuseTypeId === id) seg.fuseTypeId = s.settings.defaultFuseTypeId;
    }
  });
}

/** Apply one fuse type to every segment (optionally only within a position). */
export function applyFuseTypeToAll(fuseTypeId: string, positionId?: string) {
  mutate((s) => {
    for (const seg of s.fuseSegments) {
      if (!positionId || seg.positionId === positionId) seg.fuseTypeId = fuseTypeId;
    }
  });
}

// ---------- site map & positions ----------

export function updateSiteMap(patch: Partial<SiteMap>) {
  mutate((s) => void Object.assign(s.siteMap, patch));
}

export function addPosition(): string | null {
  let id: string | null = null;
  mutate((s) => {
    if (s.positions.length >= MAX_POSITIONS) return;
    const used = new Set(s.positions.map((p) => p.name));
    let i = 0;
    let pos = newPosition(i, s.siteMap.widthFt);
    while (used.has(pos.name) && i < 26) pos = newPosition(++i, s.siteMap.widthFt);
    pos.x = Math.min(pos.x, s.siteMap.widthFt);
    s.positions.push(pos);
    id = pos.id;
  });
  return id;
}

export function updatePosition(id: string, patch: Partial<Position>) {
  mutate((s) => {
    const p = s.positions.find((x) => x.id === id);
    if (p) Object.assign(p, patch);
  });
}

export function deletePosition(id: string) {
  mutate((s) => {
    if (s.positions.length <= 1) return;
    s.positions = s.positions.filter((p) => p.id !== id);
    removePlaced(s, new Set(s.placed.filter((p) => p.positionId === id).map((p) => p.id)));
    removeNodes(s, new Set(s.fuseNodes.filter((n) => n.positionId === id).map((n) => n.id)));
    for (const m of s.firing.modules) if (m.positionId === id) m.positionId = null;
  });
}

// ---------- placed items ----------

export function placeItem(catalogId: string, positionId: string, x?: number, y?: number): string {
  const id = uid('pl');
  mutate((s) => {
    const item = s.catalog.find((c) => c.id === catalogId);
    if (!item || item.kind === 'shell') return;
    const count = s.placed.filter((p) => p.positionId === positionId).length;
    const placed: PlacedItem = {
      id,
      catalogId,
      positionId,
      x: x ?? 80 + (count % 4) * 220,
      y: y ?? 60 + Math.floor(count / 4) * 180,
      label: '',
    };
    if (item.kind === 'rack') placed.tubes = Array(tubeCount(item)).fill(null);
    s.placed.push(placed);
  });
  return id;
}

export function updatePlaced(id: string, patch: Partial<Pick<PlacedItem, 'x' | 'y' | 'label'>>) {
  mutate((s) => {
    const p = s.placed.find((x) => x.id === id);
    if (p) Object.assign(p, patch);
  });
}

export function movePlacedToPosition(id: string, positionId: string) {
  mutate((s) => {
    const p = s.placed.find((x) => x.id === id);
    if (!p || p.positionId === positionId) return;
    p.positionId = positionId;
    removeSegmentsTouching(s, (k) => endpointPlacedId(k) === id);
  });
}

export function deleteElements(placedIds: string[], nodeIds: string[], segmentIds: string[]) {
  mutate((s) => {
    removePlaced(s, new Set(placedIds));
    removeNodes(s, new Set(nodeIds));
    const segs = new Set(segmentIds);
    s.fuseSegments = s.fuseSegments.filter((x) => !segs.has(x.id));
  });
}

export function setTubeShell(placedId: string, index: number, shellId: string | null) {
  mutate((s) => {
    const p = s.placed.find((x) => x.id === placedId);
    if (!p?.tubes || index < 0 || index >= p.tubes.length) return;
    p.tubes[index] = shellId;
  });
}

export function fillEmptyTubes(placedId: string, shellId: string) {
  mutate((s) => {
    const p = s.placed.find((x) => x.id === placedId);
    if (p?.tubes) p.tubes = p.tubes.map((t) => t ?? shellId);
  });
}

// ---------- fuse graph ----------

export function addIgniter(positionId: string, moduleId: string, pin: number, x: number, y: number) {
  const id = uid('ig');
  mutate((s) => {
    const mod = s.firing.modules.find((m) => m.id === moduleId);
    if (!mod) return;
    s.fuseNodes.push({ id, kind: 'igniter', positionId, moduleId, pin, x, y });
    const addr = pinAddress(s.firing.controller, mod, pin);
    if (s.cueTimes[addr] === undefined) {
      const times = Object.values(s.cueTimes);
      s.cueTimes[addr] = times.length ? Math.ceil(Math.max(...times)) + 5 : 0;
    }
  });
  return id;
}

export function updateIgniter(id: string, moduleId: string, pin: number) {
  mutate((s) => {
    const n = s.fuseNodes.find((x) => x.id === id);
    if (n?.kind !== 'igniter') return;
    n.moduleId = moduleId;
    n.pin = pin;
    const mod = s.firing.modules.find((m) => m.id === moduleId);
    if (!mod) return;
    const addr = pinAddress(s.firing.controller, mod, pin);
    if (s.cueTimes[addr] === undefined) {
      const times = Object.values(s.cueTimes);
      s.cueTimes[addr] = times.length ? Math.ceil(Math.max(...times)) + 5 : 0;
    }
  });
}

export function addJunction(positionId: string, x: number, y: number) {
  const id = uid('jn');
  mutate((s) => void s.fuseNodes.push({ id, kind: 'junction', positionId, x, y }));
  return id;
}

export function moveNode(id: string, x: number, y: number) {
  mutate((s) => {
    const n = s.fuseNodes.find((x) => x.id === id);
    if (n) Object.assign(n, { x, y });
  });
}

/** Batch position update after dragging several nodes. */
export function moveCanvasElements(moves: { id: string; x: number; y: number }[]) {
  mutate((s) => {
    for (const m of moves) {
      const target = s.placed.find((p) => p.id === m.id) ?? s.fuseNodes.find((n) => n.id === m.id);
      if (target) Object.assign(target, { x: m.x, y: m.y });
    }
  });
}

function pushSegment(
  s: Show,
  positionId: string,
  from: string,
  to: string,
  fuseTypeId?: string,
  lengthIn?: number,
) {
  if (from === to) return;
  const dup = s.fuseSegments.some(
    (x) => (x.from === from && x.to === to) || (x.from === to && x.to === from),
  );
  if (dup) return;
  s.fuseSegments.push({
    id: uid('fz'),
    positionId,
    from,
    to,
    fuseTypeId: fuseTypeId ?? s.settings.defaultFuseTypeId,
    lengthIn: lengthIn ?? s.settings.defaultSegmentLengthIn,
  });
}

export function addSegment(
  positionId: string,
  from: string,
  to: string,
  fuseTypeId?: string,
  lengthIn?: number,
) {
  mutate((s) => pushSegment(s, positionId, from, to, fuseTypeId, lengthIn));
}

export function updateSegment(id: string, patch: { fuseTypeId?: string; lengthIn?: number }) {
  mutate((s) => {
    const seg = s.fuseSegments.find((x) => x.id === id);
    if (seg) Object.assign(seg, patch);
  });
}

/** Cake exit fuse -> next cake lead, in the given order. Cakes without exit fuse are skipped. */
export function chainSequential(placedIds: string[], fuseTypeId: string, lengthIn: number) {
  mutate((s) => {
    for (let i = 0; i < placedIds.length - 1; i++) {
      const a = s.placed.find((p) => p.id === placedIds[i]);
      const b = s.placed.find((p) => p.id === placedIds[i + 1]);
      if (!a || !b) continue;
      pushSegment(s, a.positionId, outKey(a.id), inKey(b.id), fuseTypeId, lengthIn);
    }
  });
}

/** One junction feeding every selected item's lead fuse. Returns the junction id. */
export function fanOut(placedIds: string[], fuseTypeId: string, lengthIn: number) {
  const id = uid('jn');
  mutate((s) => {
    const items = placedIds
      .map((pid) => s.placed.find((p) => p.id === pid))
      .filter((p): p is PlacedItem => !!p);
    if (!items.length) return;
    const x = items.reduce((n, p) => n + p.x, 0) / items.length;
    const y = Math.min(...items.map((p) => p.y)) - 90;
    s.fuseNodes.push({ id, kind: 'junction', positionId: items[0].positionId, x, y });
    for (const p of items) {
      const cat = s.catalog.find((c) => c.id === p.catalogId);
      const target = cat?.kind === 'rack' ? tubeKey(p.id, 0) : inKey(p.id);
      pushSegment(s, p.positionId, nodeKey(id), target, fuseTypeId, lengthIn);
    }
  });
  return id;
}

/** Fuse rack tubes in series in the order given. */
export function fuseTubesSeries(
  placedId: string,
  indices: number[],
  fuseTypeId: string,
  lengthIn: number,
) {
  mutate((s) => {
    const p = s.placed.find((x) => x.id === placedId);
    if (!p) return;
    for (let i = 0; i < indices.length - 1; i++) {
      pushSegment(s, p.positionId, tubeKey(p.id, indices[i]), tubeKey(p.id, indices[i + 1]), fuseTypeId, lengthIn);
    }
  });
}

export function clearTubeFuse(placedId: string) {
  mutate((s) => {
    s.fuseSegments = s.fuseSegments.filter((seg) => {
      const a = /^t:(.+):\d+$/.exec(seg.from)?.[1];
      const b = /^t:(.+):\d+$/.exec(seg.to)?.[1];
      return !(a === placedId && b === placedId);
    });
  });
}

// ---------- firing system ----------

export function setControllerPreset(presetId: string) {
  mutate((s) =>
    withAddressingChange(s, () => {
      const preset = presetById(presetId);
      s.firing.controller = controllerFromPreset(preset);
      for (const m of s.firing.modules) m.pinOverrides = {};
    }),
  );
}

export function updateController(patch: Partial<Controller>) {
  mutate((s) => withAddressingChange(s, () => Object.assign(s.firing.controller, patch)));
}

export function addModule(model: ModuleModel): string {
  const id = uid('mod');
  mutate((s) => {
    const ctrl = s.firing.controller;
    const mods = s.firing.modules;
    const nextFlat = mods.reduce((n, m) => Math.max(n, m.startCue + m.cueCount), 1);
    const usedChannels = mods.flatMap((m) => m.bankChannels);
    let ch = usedChannels.length ? Math.max(...usedChannels) + 1 : 1;
    const bankChannels = Array.from({ length: model.banks }, () => Math.min(ch++, ctrl.channels));
    const mod: FiringModule = {
      id,
      name: `M${mods.length + 1}`,
      modelName: model.name,
      cueCount: model.cueCount,
      positionId: s.positions[0]?.id ?? null,
      startCue: nextFlat,
      bankChannels,
      pinOverrides: {},
    };
    mods.push(mod);
  });
  return id;
}

export function updateModule(id: string, patch: Partial<FiringModule>) {
  mutate((s) =>
    withAddressingChange(s, () => {
      const m = s.firing.modules.find((x) => x.id === id);
      if (!m) return;
      // Igniter wiring stays put when a module moves; validation flags position mismatches.
      Object.assign(m, patch);
    }),
  );
}

export function deleteModule(id: string) {
  mutate((s) => {
    s.firing.modules = s.firing.modules.filter((m) => m.id !== id);
    removeNodes(
      s,
      new Set(s.fuseNodes.filter((n) => n.kind === 'igniter' && n.moduleId === id).map((n) => n.id)),
    );
  });
}

/** Link or unlink a pin to a controller address. Pass null to restore the default. */
export function setPinOverride(moduleId: string, pin: number, addressId: string | null) {
  mutate((s) => {
    const m = s.firing.modules.find((x) => x.id === moduleId);
    if (!m) return;
    const oldAddr = pinAddress(s.firing.controller, m, pin);
    const oldTime = s.cueTimes[oldAddr];
    if (addressId === null) delete m.pinOverrides[String(pin)];
    else m.pinOverrides[String(pin)] = addressId;
    const newAddr = pinAddress(s.firing.controller, m, pin);
    if (s.cueTimes[newAddr] === undefined && oldTime !== undefined) s.cueTimes[newAddr] = oldTime;
  });
}

// ---------- cues ----------

export function setCueTime(addressId: string, t: number) {
  mutate((s) => void (s.cueTimes[addressId] = Math.max(0, t)));
}

export function setCueTimes(times: Record<string, number>) {
  mutate((s) => {
    for (const [k, v] of Object.entries(times)) s.cueTimes[k] = Math.max(0, v);
  });
}

export function setCueNote(addressId: string, note: string) {
  mutate((s) => {
    if (note) s.cueNotes[addressId] = note;
    else delete s.cueNotes[addressId];
  });
}

/** Re-point every wired pin currently firing on `from` so it fires on `to` (links the cues). */
export function moveAddressPins(from: string, to: string) {
  mutate((s) => {
    if (from === to) return;
    const ctrl = s.firing.controller;
    for (const n of s.fuseNodes) {
      if (n.kind !== 'igniter') continue;
      const m = s.firing.modules.find((x) => x.id === n.moduleId);
      if (m && pinAddress(ctrl, m, n.pin) === from) m.pinOverrides[String(n.pin)] = to;
    }
    if (s.cueTimes[to] === undefined && s.cueTimes[from] !== undefined) {
      s.cueTimes[to] = s.cueTimes[from];
    }
  });
}
