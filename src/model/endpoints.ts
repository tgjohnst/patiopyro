export type Endpoint =
  | { kind: 'node'; nodeId: string }
  | { kind: 'in'; placedId: string }
  | { kind: 'out'; placedId: string }
  | { kind: 'tube'; placedId: string; index: number };

export const nodeKey = (nodeId: string) => `n:${nodeId}`;
export const inKey = (placedId: string) => `in:${placedId}`;
export const outKey = (placedId: string) => `out:${placedId}`;
export const tubeKey = (placedId: string, index: number) => `t:${placedId}:${index}`;

export function parseEndpoint(key: string): Endpoint | null {
  const [kind, a, b] = key.split(':');
  switch (kind) {
    case 'n':
      return a ? { kind: 'node', nodeId: a } : null;
    case 'in':
      return a ? { kind: 'in', placedId: a } : null;
    case 'out':
      return a ? { kind: 'out', placedId: a } : null;
    case 't':
      return a && b !== undefined ? { kind: 'tube', placedId: a, index: Number(b) } : null;
    default:
      return null;
  }
}

/** Placed item id an endpoint belongs to, if any. */
export function endpointPlacedId(key: string): string | null {
  const e = parseEndpoint(key);
  return e && e.kind !== 'node' ? e.placedId : null;
}

/** React Flow handle id for an endpoint on its node. */
export function endpointHandle(key: string): { nodeId: string; handle: string } | null {
  const e = parseEndpoint(key);
  if (!e) return null;
  switch (e.kind) {
    case 'node':
      return { nodeId: e.nodeId, handle: 'f' };
    case 'in':
      return { nodeId: e.placedId, handle: 'in' };
    case 'out':
      return { nodeId: e.placedId, handle: 'out' };
    case 'tube':
      return { nodeId: e.placedId, handle: `t${e.index}` };
  }
}

export function endpointFromHandle(nodeId: string, handle: string | null, isFuseNode: boolean) {
  if (isFuseNode) return nodeKey(nodeId);
  if (handle === 'in') return inKey(nodeId);
  if (handle === 'out') return outKey(nodeId);
  if (handle?.startsWith('t')) return tubeKey(nodeId, Number(handle.slice(1)));
  return null;
}
