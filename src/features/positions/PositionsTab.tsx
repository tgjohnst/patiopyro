import clsx from 'clsx';
import { useCallback, useEffect, useMemo, useState, type DragEvent } from 'react';
import {
  Background,
  ConnectionMode,
  Controls,
  MiniMap,
  ReactFlow,
  ReactFlowProvider,
  applyEdgeChanges,
  applyNodeChanges,
  useReactFlow,
  type Connection,
  type Edge,
  type EdgeChange,
  type NodeChange,
} from '@xyflow/react';
import { Badge, Button, EmptyState, Field, NumberInput, Select, TextInput } from '../../components/ui';
import { endpointNamer } from '../../engine/chains';
import { BOARD_PX_PER_IN, boardAt, boardSizePx, placedSizePx } from '../../engine/layout';
import { segmentDelaySec } from '../../engine/timing';
import { displayToInches, formatLengthIn, formatTime, inchesToDisplay, smallUnit } from '../../lib/format';
import { describeAddress, pinAddress } from '../../model/addressing';
import { KIND_LABEL, effectDurationSec, isFuseable } from '../../model/catalog';
import { IGNITER_LEAD_COLOR, endpointFromHandle, endpointHandle, igniterLeadIds, igniterLeadName, parseEndpoint } from '../../model/endpoints';
import type { Board, Show } from '../../model/schema';
import {
  addBoard,
  addIgniter,
  addJunction,
  addSegment,
  applyFuseTypeToAll,
  chainSequential,
  deleteElements,
  fanOut,
  moveCanvasElements,
  placeItem,
  setCueTime,
  setPlacedBoard,
  updateBoard,
  updateIgniter,
  updatePlaced,
  updateSegment,
} from '../../store/actions';
import { derive, getShow, useShow } from '../../store/showStore';
import { DND_CATALOG, useUi } from '../../store/uiStore';
import { edgeTypes, nodeTypes, type CanvasNode, type FuseEdgeData, type ItemNodeT } from './nodes';

const boardSizeLabel = (b: Board, u: Show['settings']['units']) =>
  `${inchesToDisplay(b.widthIn, u)} × ${inchesToDisplay(b.depthIn, u)} ${smallUnit(u)}`;

/** Nodes that are placed items (and so can sit on a board). */
const isPlacedNode = (n: CanvasNode) => n.type === 'item' || n.type === 'rack';
import { RackEditor } from './RackEditor';

export function PositionsTab() {
  const positions = useShow((s) => s.positions);
  const { positionId, setPositionId, rackPlacedId } = useUi();
  const active = positions.find((p) => p.id === positionId) ?? positions[0];

  useEffect(() => {
    if (active && active.id !== positionId) setPositionId(active.id);
  }, [active, positionId, setPositionId]);

  if (!active) return <EmptyState title="No positions" />;

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex flex-wrap items-center gap-1 border-b border-slate-800 px-3 py-1.5">
        {positions.map((p) => (
          <button
            key={p.id}
            onClick={() => setPositionId(p.id)}
            className={clsx(
              'flex items-center gap-2 rounded-md px-3 py-1 text-sm',
              p.id === active.id ? 'bg-slate-800 text-white' : 'text-slate-400 hover:bg-slate-900',
            )}
          >
            <span className="h-2.5 w-2.5 rounded-full" style={{ background: p.color }} />
            {p.name}
          </button>
        ))}
      </div>
      <ReactFlowProvider key={active.id}>
        <PositionCanvas positionId={active.id} />
      </ReactFlowProvider>
      {rackPlacedId && <RackEditor placedId={rackPlacedId} />}
    </div>
  );
}

function buildGraph(show: Show, positionId: string) {
  const { timing } = derive(show);
  const catalog = new Map(show.catalog.map((c) => [c.id, c]));
  const fuse = new Map(show.fuseTypes.map((f) => [f.id, f]));
  const ctrl = show.firing.controller;
  const name = endpointNamer(show, positionId);
  const nodes: CanvasNode[] = [];

  // Boards first so they draw underneath everything on them.
  for (const b of show.boards) {
    if (b.positionId !== positionId) continue;
    const { w, h } = boardSizePx(b);
    nodes.push({
      id: b.id,
      type: 'board',
      position: { x: b.x, y: b.y },
      width: w,
      height: h,
      zIndex: -1,
      data: {
        board: b,
        sizeLabel: boardSizeLabel(b, show.settings.units),
        itemCount: show.placed.filter((p) => p.boardId === b.id).length,
      },
    });
  }

  for (const p of show.placed) {
    if (p.positionId !== positionId) continue;
    const item = catalog.get(p.catalogId);
    const displayName = name(`in:${p.id}`).replace(/ lead fuse$/, '');
    if (isFuseable(item)) {
      const t = timing.effects.find((e) => e.placedId === p.id);
      nodes.push({
        id: p.id,
        type: 'item',
        position: { x: p.x, y: p.y },
        data: {
          placed: p,
          item,
          timing: t,
          cueLabel: t ? describeAddress(ctrl, show.firing.modules, t.addressId).label : undefined,
          displayName,
        },
      });
    } else if (item?.kind === 'rack') {
      const tubes = p.tubes ?? [];
      const runs = show.fuseSegments.flatMap((s) => {
        const a = parseEndpoint(s.from);
        const b = parseEndpoint(s.to);
        return a?.kind === 'tube' && b?.kind === 'tube' && a.placedId === p.id && b.placedId === p.id
          ? [{ a: a.index, b: b.index, color: fuse.get(s.fuseTypeId)?.color ?? '#64748b' }]
          : [];
      });
      nodes.push({
        id: p.id,
        type: 'rack',
        position: { x: p.x, y: p.y },
        data: {
          placed: p,
          rack: item,
          displayName,
          shellNames: tubes.map((id) => (id ? (catalog.get(id)?.name ?? '?') : null)),
          tubeTimes: tubes.map((_, i) => timing.effects.find((e) => e.placedId === p.id && e.tubeIndex === i)?.startSec ?? null),
          runs,
        },
      });
    }
  }

  let jn = 0;
  for (const n of show.fuseNodes) {
    if (n.positionId !== positionId) continue;
    if (n.kind === 'junction') {
      nodes.push({ id: n.id, type: 'junction', position: { x: n.x, y: n.y }, data: { label: `J${++jn}` } });
    } else {
      const mod = show.firing.modules.find((m) => m.id === n.moduleId);
      const addr = mod ? pinAddress(ctrl, mod, n.pin) : null;
      const t = addr ? show.cueTimes[addr] : undefined;
      nodes.push({
        id: n.id,
        type: 'igniter',
        position: { x: n.x, y: n.y },
        data: {
          title: mod ? `${mod.name} #${n.pin}` : 'Missing module',
          subtitle: addr ? `${describeAddress(ctrl, show.firing.modules, addr).label} @ ${t !== undefined ? formatTime(t) : '—'}` : '',
          ok: !!mod && t !== undefined && mod.positionId === positionId,
          kind: ctrl.igniterKind,
        },
      });
    }
  }

  const edges: Edge<FuseEdgeData>[] = [];
  const leads = igniterLeadIds(show);
  for (const s of show.fuseSegments) {
    if (s.positionId !== positionId) continue;
    const a = endpointHandle(s.from);
    const b = endpointHandle(s.to);
    if (!a || !b) continue;
    if (a.nodeId === b.nodeId && s.from.startsWith('t:')) continue; // drawn inside the rack node
    const ft = fuse.get(s.fuseTypeId);
    edges.push({
      id: s.id,
      type: 'fuse',
      source: a.nodeId,
      sourceHandle: a.handle,
      target: b.nodeId,
      targetHandle: b.handle,
      data: leads.has(s.id)
        ? { color: IGNITER_LEAD_COLOR, label: `${igniterLeadName(ctrl.igniterKind)} · instant`, lead: true }
        : {
            color: ft?.color ?? '#64748b',
            label: `${formatLengthIn(s.lengthIn, show.settings.units)} ${ft?.name.split(' ')[0] ?? ''} · ${segmentDelaySec(s.lengthIn, ft).toFixed(1)}s`,
          },
    });
  }
  return { nodes, edges };
}

function PositionCanvas({ positionId }: { positionId: string }) {
  const show = useShow((s) => s);
  const { screenToFlowPosition, fitView } = useReactFlow();
  const graph = useMemo(() => buildGraph(show, positionId), [show, positionId]);
  // Local copy for in-progress drags and selection; re-synced whenever the store graph changes.
  const [local, setLocal] = useState(() => ({ graph, nodes: graph.nodes, edges: graph.edges }));
  // A node to select once it appears (e.g. a board just added), replacing the current selection.
  const [selectNext, setSelectNext] = useState<string | null>(null);
  let current = local;
  if (local.graph !== graph) {
    const pending = selectNext && graph.nodes.some((n) => n.id === selectNext) ? selectNext : null;
    if (pending) setSelectNext(null);
    const selN = new Set(pending ? [pending] : local.nodes.filter((n) => n.selected).map((n) => n.id));
    const selE = new Set(pending ? [] : local.edges.filter((e) => e.selected).map((e) => e.id));
    current = {
      graph,
      nodes: graph.nodes.map((n) => ({ ...n, selected: selN.has(n.id) }) as CanvasNode),
      edges: graph.edges.map((e) => ({ ...e, selected: selE.has(e.id) })),
    };
    setLocal(current);
  }
  const { nodes, edges } = current;

  const onNodesChange = useCallback(
    (changes: NodeChange<CanvasNode>[]) =>
      setLocal((l) => {
        const kept = changes.filter((c) => c.type !== 'remove');
        // Items on a board ride along while the board is dragged.
        const moving = new Set(kept.flatMap((c) => (c.type === 'position' ? [c.id] : [])));
        const carried: NodeChange<CanvasNode>[] = [];
        for (const c of kept) {
          if (c.type !== 'position' || !c.position) continue;
          const board = l.nodes.find((n) => n.id === c.id && n.type === 'board');
          if (!board) continue;
          const [dx, dy] = [c.position.x - board.position.x, c.position.y - board.position.y];
          if (!dx && !dy) continue;
          for (const n of l.nodes) {
            if (!isPlacedNode(n) || moving.has(n.id) || n.data.placed.boardId !== board.id) continue;
            carried.push({ id: n.id, type: 'position', position: { x: n.position.x + dx, y: n.position.y + dy } });
          }
        }
        return { ...l, nodes: applyNodeChanges([...kept, ...carried], l.nodes) };
      }),
    [],
  );
  const onEdgesChange = useCallback(
    (changes: EdgeChange<Edge<FuseEdgeData>>[]) =>
      setLocal((l) => ({ ...l, edges: applyEdgeChanges(changes.filter((c) => c.type !== 'remove'), l.edges) })),
    [],
  );

  const onConnect = useCallback(
    (c: Connection) => {
      const s = getShow();
      const isFuseNode = (id: string) => s.fuseNodes.some((n) => n.id === id);
      const from = endpointFromHandle(c.source, c.sourceHandle ?? null, isFuseNode(c.source));
      const to = endpointFromHandle(c.target, c.targetHandle ?? null, isFuseNode(c.target));
      if (from && to) addSegment(positionId, from, to);
    },
    [positionId],
  );

  const selectedNodes = nodes.filter((n) => n.selected);
  const selectedEdges = edges.filter((e) => e.selected);

  const deleteNodes = (dn: CanvasNode[], edgeIds: string[]) =>
    deleteElements(
      dn.filter(isPlacedNode).map((n) => n.id),
      dn.filter((n) => n.type === 'igniter' || n.type === 'junction').map((n) => n.id),
      edgeIds,
      dn.filter((n) => n.type === 'board').map((n) => n.id),
    );
  const deleteSelection = () => deleteNodes(selectedNodes, selectedEdges.map((e) => e.id));

  /** Persist a drag. An item lands on whichever board is under its centre, or comes off. */
  const onDragStop = (dragged: CanvasNode[]) => {
    const boards = getShow().boards;
    moveCanvasElements(
      dragged.map((n) => {
        const x = Math.round(n.position.x);
        const y = Math.round(n.position.y);
        if (!isPlacedNode(n)) return { id: n.id, x, y };
        const est = placedSizePx(n.type === 'rack' ? n.data.rack : n.data.item);
        const w = n.measured?.width ?? est.w;
        const h = n.measured?.height ?? est.h;
        return { id: n.id, x, y, boardId: boardAt(boards, positionId, x + w / 2, y + h / 2)?.id ?? null };
      }),
    );
  };

  const onDrop = (e: DragEvent) => {
    const catalogId = e.dataTransfer.getData(DND_CATALOG);
    if (!catalogId) return;
    e.preventDefault();
    const item = getShow().catalog.find((c) => c.id === catalogId);
    if (item?.kind === 'shell') {
      window.alert('Drop shells onto a rack tube, or open a rack to load it.');
      return;
    }
    const p = screenToFlowPosition({ x: e.clientX, y: e.clientY });
    placeItem(catalogId, positionId, p.x - 80, p.y - 30, boardAt(getShow().boards, positionId, p.x, p.y)?.id ?? null);
  };

  const viewCenter = () => {
    const el = document.querySelector('.react-flow');
    const r = el?.getBoundingClientRect();
    return screenToFlowPosition({ x: (r?.left ?? 0) + (r?.width ?? 600) / 2, y: (r?.top ?? 0) + 80 });
  };

  return (
    <div className="flex min-h-0 flex-1">
      <div className="relative flex min-w-0 flex-1 flex-col">
        <Toolbar
          positionId={positionId}
          viewCenter={viewCenter}
          selectedNodes={selectedNodes}
          onDelete={deleteSelection}
          onBoardAdded={setSelectNext}
        />
        <div className="min-h-0 flex-1" onDragOver={(e) => e.dataTransfer.types.includes(DND_CATALOG) && e.preventDefault()} onDrop={onDrop} data-testid="position-canvas">
          <ReactFlow
            nodes={nodes}
            edges={edges}
            nodeTypes={nodeTypes}
            edgeTypes={edgeTypes}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onConnect={onConnect}
            connectionMode={ConnectionMode.Loose}
            connectionLineStyle={{ stroke: '#f59e0b', strokeWidth: 3 }}
            onNodeDragStop={(_, __, dragged) => onDragStop(dragged)}
            onDelete={({ nodes: dn, edges: de }) => deleteNodes(dn, de.map((e) => e.id))}
            elevateNodesOnSelect={false}
            deleteKeyCode={['Backspace', 'Delete']}
            multiSelectionKeyCode={['Shift', 'Meta', 'Control']}
            fitView
            minZoom={0.2}
            maxZoom={2.5}
            snapToGrid
            snapGrid={[10, 10]}
            colorMode="dark"
          >
            <Background gap={20} color="#1e293b" />
            <Controls />
            <MiniMap pannable zoomable nodeColor="#334155" maskColor="rgb(2 6 23 / 0.7)" />
          </ReactFlow>
        </div>
        {nodes.length === 0 && (
          <div className="pointer-events-none absolute inset-x-0 top-1/2 text-center text-sm text-slate-500">
            Drag cakes, rockets, roman candles and racks here from the inventory. Add boards to set them on, then add igniters and
            draw fuse between the handles.
          </div>
        )}
      </div>
      <Inspector
        positionId={positionId}
        selectedNodes={selectedNodes}
        selectedEdges={selectedEdges}
        onFit={() => fitView({ padding: 0.2 })}
      />
    </div>
  );
}

function Toolbar({
  positionId,
  viewCenter,
  selectedNodes,
  onDelete,
  onBoardAdded,
}: {
  positionId: string;
  viewCenter: () => { x: number; y: number };
  selectedNodes: CanvasNode[];
  onDelete: () => void;
  onBoardAdded: (id: string) => void;
}) {
  const modules = useShow((s) => s.firing.modules);
  const fuseTypes = useShow((s) => s.fuseTypes);
  const settings = useShow((s) => s.settings);
  const fuseNodes = useShow((s) => s.fuseNodes);
  const here = modules.filter((m) => m.positionId === positionId);
  const [moduleId, setModuleId] = useState<string>('');
  const mod = modules.find((m) => m.id === moduleId) ?? here[0] ?? modules[0];
  const usedPins = new Set(fuseNodes.filter((n) => n.kind === 'igniter' && n.moduleId === mod?.id).map((n) => n.kind === 'igniter' && n.pin));
  const firstFree = mod ? (Array.from({ length: mod.cueCount }, (_, i) => i + 1).find((p) => !usedPins.has(p)) ?? 1) : 1;
  const [pin, setPin] = useState<number | null>(null);
  const [runType, setRunType] = useState(settings.defaultFuseTypeId);
  const [runLen, setRunLen] = useState(settings.defaultSegmentLengthIn);
  const u = settings.units;
  const sel = selectedNodes.filter(isPlacedNode);
  const orderedSel = [...sel].sort((a, b) => a.position.x - b.position.x || a.position.y - b.position.y);

  return (
    <div className="flex flex-wrap items-end gap-2 border-b border-slate-800 bg-slate-950 px-3 py-2">
      <div className="flex items-end gap-1 rounded-lg border border-slate-800 p-1.5">
        <Field label="Module">
          <Select
            className="w-36"
            value={mod?.id ?? ''}
            onChange={(v) => {
              setModuleId(v);
              setPin(null);
            }}
            options={
              modules.length
                ? modules.map((m) => ({ value: m.id, label: `${m.name}${m.positionId === positionId ? '' : ' (elsewhere)'}` }))
                : [{ value: '', label: 'No modules' }]
            }
          />
        </Field>
        <Field label="Cue">
          <Select
            className="w-24"
            value={String(pin ?? firstFree)}
            onChange={(v) => setPin(Number(v))}
            options={Array.from({ length: mod?.cueCount ?? 0 }, (_, i) => ({
              value: String(i + 1),
              label: `#${i + 1}${usedPins.has(i + 1) ? ' •' : ''}`,
            }))}
          />
        </Field>
        <Button
          size="md"
          variant="primary"
          disabled={!mod}
          onClick={() => {
            const c = viewCenter();
            addIgniter(positionId, mod!.id, pin ?? firstFree, c.x, c.y);
            setPin(null);
          }}
          title={modules.length ? 'Add an igniter on this module cue' : 'Add firing modules on the Firing System tab first'}
        >
          ⚡ Add igniter
        </Button>
      </div>
      <Button
        onClick={() => {
          const c = viewCenter();
          addJunction(positionId, c.x, c.y + 60);
        }}
        title="A split point so one fuse lights several items"
      >
        ◆ Junction
      </Button>
      <Button
        onClick={() => {
          const c = viewCenter();
          onBoardAdded(addBoard(positionId, c.x - 24 * BOARD_PX_PER_IN, c.y + 40));
        }}
        title="A board to set items on. Items dragged onto it move with it."
      >
        ▭ Board
      </Button>

      <div className="flex items-end gap-1 rounded-lg border border-slate-800 p-1.5">
        <Field label="Fuse for helpers">
          <Select className="w-40" value={runType} onChange={setRunType} options={fuseTypes.map((f) => ({ value: f.id, label: f.name }))} />
        </Field>
        <Field label="Length">
          <NumberInput
            className="w-20"
            min={0}
            suffix={smallUnit(u)}
            value={inchesToDisplay(runLen, u)}
            onChange={(v) => setRunLen(displayToInches(v, u))}
          />
        </Field>
        <Button
          disabled={orderedSel.length < 2}
          onClick={() => chainSequential(orderedSel.map((n) => n.id), runType, runLen)}
          title="Connect each selected cake's exit fuse to the next one's lead fuse (left to right)"
        >
          Chain in sequence
        </Button>
        <Button
          disabled={sel.length < 1}
          onClick={() => fanOut(sel.map((n) => n.id), runType, runLen)}
          title="Add a junction feeding every selected item at once"
        >
          Fan out
        </Button>
        <Button
          variant="ghost"
          onClick={() =>
            window.confirm('Set every fuse run at this position to the selected fuse type?') && applyFuseTypeToAll(runType, positionId)
          }
        >
          Apply type to all
        </Button>
      </div>
      <Button variant="ghost" className="ml-auto text-rose-300" disabled={!selectedNodes.length} onClick={onDelete}>
        Delete selected
      </Button>
    </div>
  );
}

function Inspector({
  positionId,
  selectedNodes,
  selectedEdges,
  onFit,
}: {
  positionId: string;
  selectedNodes: CanvasNode[];
  selectedEdges: Edge<FuseEdgeData>[];
  onFit: () => void;
}) {
  const show = useShow((s) => s);
  const { timing } = derive(show);
  const openRack = useUi((u) => u.openRack);
  const u = show.settings.units;
  const name = endpointNamer(show, positionId);
  const single = selectedNodes.length === 1 && selectedEdges.length === 0 ? selectedNodes[0] : null;
  const seg = selectedEdges.length === 1 && selectedNodes.length === 0 ? show.fuseSegments.find((s) => s.id === selectedEdges[0].id) : null;

  const counts = {
    igniters: show.fuseNodes.filter((n) => n.positionId === positionId && n.kind === 'igniter').length,
    runs: show.fuseSegments.filter((s) => s.positionId === positionId).length,
  };

  return (
    <aside className="flex w-72 shrink-0 flex-col gap-3 overflow-y-auto border-l border-slate-800 bg-slate-950 p-3 text-sm">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold">Inspector</h3>
        <Button size="sm" variant="ghost" onClick={onFit}>
          Fit view
        </Button>
      </div>

      {!single && !seg && (
        <div className="flex flex-col gap-2 text-xs text-slate-400">
          {selectedNodes.length + selectedEdges.length > 1 ? (
            <p>{selectedNodes.length} items and {selectedEdges.length} fuse runs selected.</p>
          ) : (
            <p>Select an item, igniter or fuse run to edit it.</p>
          )}
          <ul className="list-disc space-y-1 pl-4 text-slate-500">
            <li>Drag from one handle to another to lay fuse.</li>
            <li>Cake: left handle is the lead fuse, right is the exit fuse. Rockets and roman candles have a lead fuse only.</li>
            <li>Rack: every tube is a handle. Open the rack to load shells and fuse tubes in series.</li>
            <li>Board: drop or drag items onto a board to set them on it. They move with the board.</li>
            <li>Shift-click or drag a box to select several, then use Chain or Fan out.</li>
            <li>Press Delete to remove the selection.</li>
          </ul>
          <div className="flex gap-1">
            <Badge tone="sky">{counts.igniters} igniters</Badge>
            <Badge>{counts.runs} fuse runs</Badge>
          </div>
        </div>
      )}

      {single?.type === 'item' && <ItemInspector node={single} positionId={positionId} />}

      {single?.type === 'rack' && (
        <div className="flex flex-col gap-2">
          <p className="font-medium text-slate-100">{single.data.rack.name}</p>
          <Field label="Label">
            <TextInput value={single.data.placed.label} onChange={(label) => updatePlaced(single.id, { label })} />
          </Field>
          <BoardSelect placedId={single.id} boardId={single.data.placed.boardId ?? null} positionId={positionId} />
          <p className="text-xs text-slate-400">
            {single.data.shellNames.filter(Boolean).length} of {single.data.shellNames.length} tubes loaded,{' '}
            {single.data.tubeTimes.filter((t) => t !== null).length} timed.
          </p>
          <Button variant="primary" onClick={() => openRack(single.id)}>
            Open rack editor
          </Button>
        </div>
      )}

      {single?.type === 'board' && <BoardInspector boardId={single.id} />}

      {single?.type === 'igniter' && <IgniterInspector nodeId={single.id} positionId={positionId} />}

      {single?.type === 'junction' && (
        <div className="text-xs text-slate-400">
          <p className="font-medium text-slate-100">Junction {single.data.label}</p>
          <p className="mt-1">
            A split point. Fire reaching it continues down every connected run. Lit at{' '}
            {timing.arrivals.get(`n:${single.id}`) ? formatTime(timing.arrivals.get(`n:${single.id}`)!.t) : '—'}.
          </p>
        </div>
      )}

      {seg && igniterLeadIds(show).has(seg.id) && (
        <div className="flex flex-col gap-2" data-testid="igniter-lead">
          <p className="font-medium text-slate-100">{igniterLeadName(show.firing.controller.igniterKind)}</p>
          <p className="text-xs text-slate-400">
            {name(seg.from)} ↔ {name(seg.to)}
          </p>
          <p className="text-xs text-slate-400">
            The igniter is attached straight to what it lights, so it fires instantly at the cue time. No fuse is used or
            timed here.
          </p>
          <Button variant="danger" size="sm" onClick={() => deleteElements([], [], [seg.id])}>
            Disconnect
          </Button>
        </div>
      )}

      {seg && !igniterLeadIds(show).has(seg.id) && (
        <div className="flex flex-col gap-2">
          <p className="font-medium text-slate-100">Fuse run</p>
          <p className="text-xs text-slate-400">
            {name(seg.from)} ↔ {name(seg.to)}
          </p>
          <Field label="Fuse type">
            <Select
              value={seg.fuseTypeId}
              onChange={(fuseTypeId) => updateSegment(seg.id, { fuseTypeId })}
              options={show.fuseTypes.map((f) => ({ value: f.id, label: f.name }))}
            />
          </Field>
          <Field label="Length">
            <NumberInput
              min={0}
              suffix={smallUnit(u)}
              value={inchesToDisplay(seg.lengthIn, u)}
              onChange={(v) => updateSegment(seg.id, { lengthIn: displayToInches(v, u) })}
            />
          </Field>
          <p className="text-xs text-slate-400">
            Burn time {segmentDelaySec(seg.lengthIn, show.fuseTypes.find((f) => f.id === seg.fuseTypeId)).toFixed(1)} s
          </p>
          <Button variant="danger" size="sm" onClick={() => deleteElements([], [], [seg.id])}>
            Delete run
          </Button>
        </div>
      )}
    </aside>
  );
}

/** Which board a placed item sits on. Picking a board moves the item onto it if it is outside. */
function BoardSelect({ placedId, boardId, positionId }: { placedId: string; boardId: string | null; positionId: string }) {
  const allBoards = useShow((s) => s.boards);
  const boards = allBoards.filter((b) => b.positionId === positionId);
  if (boards.length === 0) return null;
  const onChange = (id: string) => {
    const s = getShow();
    const board = boards.find((b) => b.id === id);
    const placed = s.placed.find((p) => p.id === placedId);
    if (!board || !placed) return setPlacedBoard(placedId, null);
    const { w, h } = placedSizePx(s.catalog.find((c) => c.id === placed.catalogId));
    const inside = boardAt([board], positionId, placed.x + w / 2, placed.y + h / 2);
    // Step new arrivals down and across so they don't stack exactly on top of each other.
    const step = (s.placed.filter((p) => p.boardId === board.id).length % 4) * 20;
    setPlacedBoard(placedId, board.id, inside ? undefined : { x: board.x + 16 + step, y: board.y + 30 + step });
  };
  return (
    <Field label="Board">
      <Select
        value={boardId && boards.some((b) => b.id === boardId) ? boardId : ''}
        onChange={onChange}
        options={[{ value: '', label: 'Not on a board' }, ...boards.map((b) => ({ value: b.id, label: b.name }))]}
      />
    </Field>
  );
}

function BoardInspector({ boardId }: { boardId: string }) {
  const board = useShow((s) => s.boards.find((b) => b.id === boardId));
  const show = useShow((s) => s);
  const u = show.settings.units;
  if (!board) return null;
  const name = endpointNamer(show, board.positionId);
  const items = show.placed.filter((p) => p.boardId === board.id);
  return (
    <div className="flex flex-col gap-2">
      <p className="font-medium text-slate-100">Board</p>
      <Field label="Name">
        <TextInput value={board.name} onChange={(n) => updateBoard(board.id, { name: n })} />
      </Field>
      <div className="grid grid-cols-2 gap-2">
        <Field label="Width" hint="Left to right">
          <NumberInput
            min={1}
            suffix={smallUnit(u)}
            value={inchesToDisplay(board.widthIn, u)}
            onChange={(v) => v > 0 && updateBoard(board.id, { widthIn: displayToInches(v, u) })}
          />
        </Field>
        <Field label="Depth" hint="Front to back">
          <NumberInput
            min={1}
            suffix={smallUnit(u)}
            value={inchesToDisplay(board.depthIn, u)}
            onChange={(v) => v > 0 && updateBoard(board.id, { depthIn: displayToInches(v, u) })}
          />
        </Field>
      </div>
      <div className="text-xs">
        <div className="mb-1 font-medium text-slate-300">On this board ({items.length})</div>
        {items.length === 0 ? (
          <p className="text-slate-500">Drag items onto the board, or pick it in an item's Board setting.</p>
        ) : (
          <ul className="list-disc pl-4 text-slate-400">
            {items.map((p) => (
              <li key={p.id}>{name(`in:${p.id}`).replace(/ lead fuse$/, '')}</li>
            ))}
          </ul>
        )}
      </div>
      <Button variant="danger" size="sm" onClick={() => deleteElements([], [], [], [board.id])}>
        Delete board
      </Button>
      <p className="text-[11px] text-slate-500">Deleting a board keeps the items that were on it.</p>
    </div>
  );
}

function ItemInspector({ node, positionId }: { node: ItemNodeT; positionId: string }) {
  const { item, placed, timing, cueLabel } = node.data;
  const notes = item.kind === 'cake' ? item.effectNotes : item.effect;
  return (
    <div className="flex flex-col gap-2">
      <p className="font-medium text-slate-100">{item.name}</p>
      <Field label="Label (e.g. “left of rack”)">
        <TextInput value={placed.label} onChange={(label) => updatePlaced(node.id, { label })} />
      </Field>
      <BoardSelect placedId={node.id} boardId={placed.boardId ?? null} positionId={positionId} />
      <dl className="grid grid-cols-2 gap-x-2 gap-y-1 text-xs">
        <dt className="text-slate-500">Type</dt>
        <dd>{item.kind === 'cake' && item.subCakes.length ? 'Compound cake' : KIND_LABEL[item.kind]}</dd>
        <dt className="text-slate-500">Brand</dt>
        <dd>{item.brand || '—'}</dd>
        {item.kind !== 'rocket' && (
          <>
            <dt className="text-slate-500">Shots</dt>
            <dd>{item.shots}</dd>
          </>
        )}
        <dt className="text-slate-500">{item.kind === 'rocket' ? 'Burst' : 'Duration'}</dt>
        <dd>{effectDurationSec(item)}s</dd>
        <dt className="text-slate-500">{item.kind === 'rocket' ? 'Light to burst' : 'Lead delay'}</dt>
        <dd>{item.leadDelaySec}s</dd>
        {timing && (
          <>
            <dt className="text-slate-500">Lit at</dt>
            <dd>{formatTime(timing.igniteSec)}</dd>
            <dt className="text-slate-500">Effect</dt>
            <dd>
              {formatTime(timing.startSec)} – {formatTime(timing.endSec)}
            </dd>
            <dt className="text-slate-500">Cue</dt>
            <dd>{cueLabel}</dd>
          </>
        )}
      </dl>
      {item.kind === 'cake' && item.subCakes.length > 0 && (
        <div className="text-xs">
          <div className="mb-1 font-medium text-slate-300">Sub cakes</div>
          <ol className="flex flex-col gap-1">
            {item.subCakes.map((sub, i) => {
              const section = timing?.sections[i];
              return (
                <li key={sub.id} className="rounded border border-slate-800 px-2 py-1">
                  <div className="text-slate-200">
                    {i + 1}. {sub.name}
                  </div>
                  <div className="text-slate-500">
                    {sub.shots} shots ·{' '}
                    {section
                      ? `${formatTime(section.startSec)} – ${formatTime(section.endSec)}`
                      : `+${sub.offsetSec}s for ${sub.durationSec}s`}
                  </div>
                  {sub.effectNotes && <div className="text-slate-400">{sub.effectNotes}</div>}
                </li>
              );
            })}
          </ol>
        </div>
      )}
      {notes && <p className="text-xs text-slate-400">{notes}</p>}
    </div>
  );
}

function IgniterInspector({ nodeId, positionId }: { nodeId: string; positionId: string }) {
  const node = useShow((s) => s.fuseNodes.find((n) => n.id === nodeId));
  const modules = useShow((s) => s.firing.modules);
  const ctrl = useShow((s) => s.firing.controller);
  const cueTimes = useShow((s) => s.cueTimes);
  if (node?.kind !== 'igniter') return null;
  const mod = modules.find((m) => m.id === node.moduleId);
  const addr = mod ? pinAddress(ctrl, mod, node.pin) : null;

  return (
    <div className="flex flex-col gap-2">
      <p className="font-medium text-slate-100">{ctrl.igniterKind === 'talon' ? 'Talon igniter' : 'E-match'}</p>
      <Field label="Module">
        <Select
          value={node.moduleId}
          onChange={(v) => updateIgniter(node.id, v, Math.min(node.pin, modules.find((m) => m.id === v)?.cueCount ?? 1))}
          options={modules.map((m) => ({ value: m.id, label: `${m.name}${m.positionId === positionId ? '' : ' (elsewhere)'}` }))}
        />
      </Field>
      <Field label="Module cue">
        <Select
          value={String(node.pin)}
          onChange={(v) => updateIgniter(node.id, node.moduleId, Number(v))}
          options={Array.from({ length: mod?.cueCount ?? 0 }, (_, i) => ({ value: String(i + 1), label: `#${i + 1}` }))}
        />
      </Field>
      {addr && (
        <>
          <p className="text-xs text-slate-400">Fires on {describeAddress(ctrl, modules, addr).label}</p>
          <Field label="Cue time (seconds from show start)">
            <NumberInput min={0} value={cueTimes[addr] ?? 0} onChange={(t) => setCueTime(addr, t)} />
          </Field>
        </>
      )}
      {mod && mod.positionId !== positionId && (
        <Badge tone="amber">This module is assigned to another position</Badge>
      )}
    </div>
  );
}
