import type { Controller, FiringModule } from './schema';

export interface CueAddress {
  id: string;
  label: string;
  /** Sort key: channel/cue order, or module order then pin. */
  order: number;
}

export function flatAddressId(cue: number) {
  return `c${cue}`;
}

export function channelAddressId(channel: number, cue: number) {
  return `ch${channel}-c${cue}`;
}

export function moduleAddressId(moduleId: string, pin: number) {
  return `m:${moduleId}:${pin}`;
}

/** Default address for a module pin before any manual override. */
export function defaultPinAddress(ctrl: Controller, mod: FiringModule, pin: number): string {
  switch (ctrl.addressing) {
    case 'flat':
      return flatAddressId(mod.startCue + pin - 1);
    case 'channels': {
      const banks = mod.bankChannels.length;
      const perBank = Math.ceil(mod.cueCount / banks);
      const bank = Math.min(banks - 1, Math.floor((pin - 1) / perBank));
      const cue = ((pin - 1) % perBank) + 1;
      return channelAddressId(mod.bankChannels[bank], cue);
    }
    case 'module':
      return moduleAddressId(mod.id, pin);
  }
}

export function pinAddress(ctrl: Controller, mod: FiringModule, pin: number): string {
  return mod.pinOverrides[String(pin)] ?? defaultPinAddress(ctrl, mod, pin);
}

export function parseAddress(
  id: string,
):
  | { kind: 'flat'; cue: number }
  | { kind: 'channels'; channel: number; cue: number }
  | { kind: 'module'; moduleId: string; pin: number }
  | null {
  let m = /^c(\d+)$/.exec(id);
  if (m) return { kind: 'flat', cue: Number(m[1]) };
  m = /^ch(\d+)-c(\d+)$/.exec(id);
  if (m) return { kind: 'channels', channel: Number(m[1]), cue: Number(m[2]) };
  m = /^m:(.+):(\d+)$/.exec(id);
  if (m) return { kind: 'module', moduleId: m[1], pin: Number(m[2]) };
  return null;
}

export function describeAddress(id: string, modules: FiringModule[]): CueAddress {
  const p = parseAddress(id);
  if (!p) return { id, label: id, order: Number.MAX_SAFE_INTEGER };
  switch (p.kind) {
    case 'flat':
      return { id, label: `Cue ${p.cue}`, order: p.cue };
    case 'channels':
      return { id, label: `Ch ${p.channel} · Cue ${p.cue}`, order: p.channel * 1000 + p.cue };
    case 'module': {
      const idx = modules.findIndex((m) => m.id === p.moduleId);
      const name = idx >= 0 ? modules[idx].name : '?';
      return { id, label: `${name} · Cue ${p.pin}`, order: (idx + 1) * 1000 + p.pin };
    }
  }
}

/** Whether an address can be fired by the controller as configured. */
export function addressInRange(ctrl: Controller, modules: FiringModule[], id: string): boolean {
  const p = parseAddress(id);
  if (!p) return false;
  switch (p.kind) {
    case 'flat':
      return ctrl.addressing === 'flat' && p.cue >= 1 && p.cue <= ctrl.cuesPerChannel;
    case 'channels':
      return (
        ctrl.addressing === 'channels' &&
        p.channel >= 1 &&
        p.channel <= ctrl.channels &&
        p.cue >= 1 &&
        p.cue <= ctrl.cuesPerChannel
      );
    case 'module': {
      const mod = modules.find((m) => m.id === p.moduleId);
      return ctrl.addressing === 'module' && !!mod && p.pin >= 1 && p.pin <= mod.cueCount;
    }
  }
}

export function controllerCapacity(ctrl: Controller, modules: FiringModule[]): number {
  switch (ctrl.addressing) {
    case 'flat':
      return ctrl.cuesPerChannel;
    case 'channels':
      return ctrl.channels * ctrl.cuesPerChannel;
    case 'module':
      return modules.reduce((n, m) => n + m.cueCount, 0);
  }
}

/** All addresses selectable for a pin override. Channel systems list only channels in use. */
export function selectableAddresses(ctrl: Controller, modules: FiringModule[]): CueAddress[] {
  const ids: string[] = [];
  switch (ctrl.addressing) {
    case 'flat':
      for (let c = 1; c <= ctrl.cuesPerChannel; c++) ids.push(flatAddressId(c));
      break;
    case 'channels': {
      const used = new Set<number>();
      modules.forEach((m) => m.bankChannels.forEach((ch) => used.add(ch)));
      if (used.size === 0) used.add(1);
      [...used]
        .sort((a, b) => a - b)
        .forEach((ch) => {
          for (let c = 1; c <= ctrl.cuesPerChannel; c++) ids.push(channelAddressId(ch, c));
        });
      break;
    }
    case 'module':
      modules.forEach((m) => {
        for (let p = 1; p <= m.cueCount; p++) ids.push(moduleAddressId(m.id, p));
      });
      break;
  }
  return ids.map((id) => describeAddress(id, modules));
}
