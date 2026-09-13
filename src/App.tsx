import clsx from 'clsx';
import { useEffect, useState } from 'react';
import { Badge, Button } from './components/ui';
import { InventoryPanel } from './features/inventory/InventoryPanel';
import { InventoryTab } from './features/inventory/InventoryTab';
import { FiringTab } from './features/firing/FiringTab';
import { PositionsTab } from './features/positions/PositionsTab';
import { PrintView } from './features/reports/PrintViews';
import { ReportsTab } from './features/reports/ReportsTab';
import { ShowMode } from './features/reports/ShowMode';
import { SettingsDialog } from './features/settings/SettingsDialog';
import { SiteMapTab } from './features/site/SiteMapTab';
import { TimelineTab } from './features/timeline/TimelineTab';
import { openShowFile, saveShowFile } from './lib/file';
import { createDemoShow } from './model/demo';
import { createEmptyShow } from './model/defaults';
import { updateMeta } from './store/actions';
import { getShow, redo, replaceShow, undo, useDerived, useShow, useTemporal } from './store/showStore';
import { useUi, type Tab } from './store/uiStore';

const TABS: { id: Tab; label: string }[] = [
  { id: 'inventory', label: 'Inventory' },
  { id: 'site', label: 'Site Map' },
  { id: 'positions', label: 'Positions' },
  { id: 'firing', label: 'Firing System' },
  { id: 'timeline', label: 'Timeline' },
  { id: 'reports', label: 'Reports' },
];

function isTyping(e: KeyboardEvent) {
  const t = e.target as HTMLElement | null;
  return !!t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable);
}

export default function App() {
  const { tab, setTab, inventoryOpen, toggleInventory, showMode } = useUi();
  const name = useShow((s) => s.meta.name);
  const canUndo = useTemporal((t) => t.pastStates.length > 0);
  const canRedo = useTemporal((t) => t.futureStates.length > 0);
  const { issues } = useDerived();
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [fileMenu, setFileMenu] = useState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey) || isTyping(e)) return;
      const k = e.key.toLowerCase();
      if (k === 'z' && !e.shiftKey) {
        e.preventDefault();
        undo();
      } else if ((k === 'z' && e.shiftKey) || k === 'y') {
        e.preventDefault();
        redo();
      } else if (k === 's') {
        e.preventDefault();
        saveShowFile(getShow());
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const confirmReplace = () =>
    window.confirm('Replace the current show? Save it first if you want to keep it.');

  const fileActions = [
    {
      label: 'New show',
      run: () => confirmReplace() && replaceShow(createEmptyShow()),
    },
    {
      label: 'Open show file…',
      run: async () => {
        try {
          const show = await openShowFile();
          if (show && confirmReplace()) replaceShow(show);
        } catch (err) {
          window.alert((err as Error).message);
        }
      },
    },
    { label: 'Save show file (Ctrl+S)', run: () => saveShowFile(getShow()) },
    { label: 'Load demo show', run: () => confirmReplace() && replaceShow(createDemoShow()) },
  ];

  const errors = issues.filter((i) => i.level === 'error').length;
  const warnings = issues.filter((i) => i.level === 'warning').length;
  const sidePanel = inventoryOpen && (tab === 'site' || tab === 'positions');

  return (
    <>
      <div className="app-root flex h-full flex-col">
        <header className="flex flex-wrap items-center gap-3 border-b border-slate-800 bg-slate-950 px-4 py-2">
          <div className="flex items-center gap-2">
            <span className="text-xl" aria-hidden>
              🎆
            </span>
            <span className="font-bold tracking-tight text-amber-400">PatioPyro</span>
          </div>
          <input
            aria-label="Show name"
            className="w-56 rounded-md border border-transparent bg-transparent px-2 py-1 text-sm font-medium text-slate-100 hover:border-slate-700 focus:border-amber-500 focus:outline-none"
            value={name}
            onChange={(e) => updateMeta({ name: e.target.value })}
          />
          <div className="relative">
            <Button variant="ghost" onClick={() => setFileMenu((v) => !v)}>
              File ▾
            </Button>
            {fileMenu && (
              <>
                <div className="fixed inset-0 z-40" onClick={() => setFileMenu(false)} />
                <div className="absolute left-0 z-50 mt-1 w-56 overflow-hidden rounded-lg border border-slate-700 bg-slate-900 shadow-xl">
                  {fileActions.map((a) => (
                    <button
                      key={a.label}
                      className="block w-full px-3 py-2 text-left text-sm text-slate-200 hover:bg-slate-800"
                      onClick={() => {
                        setFileMenu(false);
                        void a.run();
                      }}
                    >
                      {a.label}
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>
          <Button variant="ghost" onClick={undo} disabled={!canUndo} title="Undo (Ctrl+Z)">
            ↶ Undo
          </Button>
          <Button variant="ghost" onClick={redo} disabled={!canRedo} title="Redo (Ctrl+Shift+Z)">
            ↷ Redo
          </Button>
          <Button variant="ghost" onClick={() => setSettingsOpen(true)}>
            ⚙ Settings
          </Button>
          <nav className="ml-auto flex flex-wrap gap-1">
            {TABS.map((t) => (
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
                className={clsx(
                  'rounded-md px-3 py-1.5 text-sm font-medium transition-colors',
                  tab === t.id
                    ? 'bg-amber-500/15 text-amber-300'
                    : 'text-slate-400 hover:bg-slate-800 hover:text-slate-100',
                )}
              >
                {t.label}
                {t.id === 'reports' && (errors > 0 || warnings > 0) && (
                  <Badge tone={errors ? 'rose' : 'amber'} className="ml-1.5">
                    {errors + warnings}
                  </Badge>
                )}
              </button>
            ))}
          </nav>
        </header>

        <div className="flex min-h-0 flex-1">
          {(tab === 'site' || tab === 'positions') && (
            <div
              className={clsx(
                'flex shrink-0 flex-col border-r border-slate-800 bg-slate-950 transition-all',
                sidePanel ? 'w-72' : 'w-9',
              )}
            >
              <button
                className="flex h-9 items-center justify-center border-b border-slate-800 text-xs text-slate-400 hover:text-white"
                onClick={toggleInventory}
                title={sidePanel ? 'Hide inventory' : 'Show inventory'}
              >
                {sidePanel ? '◀ Inventory' : '▶'}
              </button>
              {sidePanel && <InventoryPanel />}
            </div>
          )}
          <main className="min-w-0 flex-1 overflow-auto">
            {tab === 'inventory' && <InventoryTab />}
            {tab === 'site' && <SiteMapTab />}
            {tab === 'positions' && <PositionsTab />}
            {tab === 'firing' && <FiringTab />}
            {tab === 'timeline' && <TimelineTab />}
            {tab === 'reports' && <ReportsTab />}
          </main>
        </div>
        {settingsOpen && <SettingsDialog onClose={() => setSettingsOpen(false)} />}
        {showMode && <ShowMode />}
      </div>
      <PrintView />
    </>
  );
}
