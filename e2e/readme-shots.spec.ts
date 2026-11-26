// Annotated screenshots for the README and docs/TOUR.md. Not part of `npm run e2e`:
// run `npm run shots` to regenerate docs/screenshots/.
import { expect, test, type Locator, type Page } from '@playwright/test';

const OUT = 'docs/screenshots';

type Side = 'tl' | 'tr' | 'bl' | 'br' | 't' | 'b' | 'l' | 'r' | 'c';
type Mark = {
  n: number;
  /** One element, or several to outline together. */
  at: Locator | Locator[];
  /** Where the number sits on the outline. */
  side?: Side;
  dx?: number;
  dy?: number;
  /** Draw a dashed outline round the element as well as the number. */
  ring?: boolean;
};
type Rect = { x: number; y: number; width: number; height: number };

async function boxOf(at: Locator | Locator[]): Promise<Rect> {
  const boxes = await Promise.all(
    (Array.isArray(at) ? at : [at]).map(async (l) => (await l.boundingBox())!),
  );
  const x = Math.min(...boxes.map((b) => b.x));
  const y = Math.min(...boxes.map((b) => b.y));
  const right = Math.max(...boxes.map((b) => b.x + b.width));
  const bottom = Math.max(...boxes.map((b) => b.y + b.height));
  return { x, y, width: right - x, height: bottom - y };
}

/** Overlay numbered circles (and optional outlines) on the page, ready for a screenshot. */
async function annotate(page: Page, marks: Mark[]) {
  const items = await Promise.all(
    marks.map(async (m) => ({
      n: m.n,
      side: m.side ?? 'tl',
      dx: m.dx ?? 0,
      dy: m.dy ?? 0,
      ring: m.ring ?? true,
      box: await boxOf(m.at),
    })),
  );
  await page.evaluate((items) => {
    document.getElementById('readme-marks')?.remove();
    const layer = document.createElement('div');
    layer.id = 'readme-marks';
    layer.style.cssText = 'position:fixed;inset:0;pointer-events:none;z-index:2147483647';
    const PAD = 4;
    const R = 15;
    for (const { n, side, dx, dy, ring, box } of items) {
      const x0 = box.x - PAD;
      const y0 = box.y - PAD;
      const x1 = box.x + box.width + PAD;
      const y1 = box.y + box.height + PAD;
      if (ring) {
        const o = document.createElement('div');
        o.style.cssText = `position:absolute;left:${x0}px;top:${y0}px;width:${x1 - x0}px;height:${y1 - y0}px;border:2px dashed #ff3d8b;border-radius:8px;box-shadow:0 0 0 1px rgba(0,0,0,.35)`;
        layer.appendChild(o);
      }
      const cx = side.includes('l') ? x0 : side.includes('r') ? x1 : (x0 + x1) / 2;
      const cy = side.startsWith('t') ? y0 : side.startsWith('b') ? y1 : (y0 + y1) / 2;
      const b = document.createElement('div');
      b.textContent = String(n);
      b.style.cssText = `position:absolute;left:${cx + dx - R}px;top:${cy + dy - R}px;width:${2 * R}px;height:${2 * R}px;border-radius:50%;background:#ff3d8b;color:#fff;border:2px solid #fff;box-sizing:border-box;font:700 16px/26px system-ui,sans-serif;text-align:center;box-shadow:0 2px 6px rgba(0,0,0,.5)`;
      layer.appendChild(b);
    }
    document.body.appendChild(layer);
  }, items);
}

async function shot(page: Page, name: string, marks: Mark[], clip?: Rect) {
  await annotate(page, marks);
  await page.screenshot({ path: `${OUT}/${name}.png`, clip });
  await page.evaluate(() => document.getElementById('readme-marks')?.remove());
}

async function loadDemo(page: Page) {
  await page.goto('/');
  await page.getByRole('button', { name: 'File ▾' }).click();
  await page.getByRole('button', { name: 'Load demo show' }).click();
  await expect(page.getByText('Night Owl').first()).toBeVisible();
}

test.beforeEach(async ({ page }) => {
  page.on('dialog', (d) => d.accept());
  // Print views open the print dialog; stub it so they stay on screen.
  await page.addInitScript(() => {
    window.print = () => {};
  });
});

test('01 inventory', async ({ page }) => {
  await loadDemo(page);
  const owl = page.getByRole('row', { name: /^Night Owl/ });
  await shot(
    page,
    '01-inventory',
    [
      { n: 1, at: [owl.getByTestId('cake-tags'), owl.getByTestId('cake-colors')], side: 'bl' },
      {
        n: 2,
        at: [
          page.getByTestId('sub-row-Triple Threat Compound-1').locator('td').first(),
          page.getByTestId('sub-row-Triple Threat Compound-3').locator('td').nth(-1),
        ],
        side: 'l',
      },
      {
        n: 3,
        at: [
          page.getByRole('columnheader', { name: 'Cost / shot' }).first(),
          page.getByRole('columnheader', { name: 'Cost / sec' }).first(),
        ],
        side: 'tr',
      },
    ],
    { x: 0, y: 0, width: 1600, height: 560 },
  );
});

test('02 site map', async ({ page }) => {
  await loadDemo(page);
  await page.getByRole('button', { name: 'Site Map', exact: true }).click();
  const map = page.getByTestId('site-map');
  await expect(map).toBeVisible();
  await shot(page, '02-site-map', [
    { n: 1, at: map.getByTestId('site-pos-Center'), side: 'tr' },
    {
      n: 2,
      at: map.locator('circle[stroke-dasharray="1 1"]').nth(2),
      side: 'br',
      ring: false,
      dx: -90,
      dy: -120,
    },
    { n: 3, at: map.getByText('48 ft'), side: 'r', ring: false, dx: 30 },
    { n: 4, at: map.getByText('Audience line'), side: 'r', ring: false, dx: 60 },
  ]);
});

test('03 position canvas', async ({ page }) => {
  await loadDemo(page);
  await page.getByRole('button', { name: 'Positions', exact: true }).click();
  await expect(page.getByTestId('node-Night Owl')).toBeVisible();
  const labels = page.locator('.react-flow__edgelabel-renderer');
  await shot(page, '03-positions', [
    { n: 1, at: page.locator('.react-flow__node-igniter', { hasText: 'M1 #1' }), side: 'tl' },
    { n: 2, at: labels.locator('div', { hasText: 'Green' }).first(), side: 't' },
    { n: 3, at: page.locator('[data-testid^="board-"]').first(), side: 'bl', ring: false },
    { n: 4, at: page.getByTestId('node-Night Owl').getByText(/0:04\.0/), side: 'bl' },
    { n: 5, at: page.getByTestId('node-HDPE 3×3 rack'), side: 'tr' },
  ]);
});

test('04 rack editor', async ({ page }) => {
  await loadDemo(page);
  await page.getByRole('button', { name: 'Positions', exact: true }).click();
  await page.getByTestId('node-HDPE 3×3 rack').getByRole('button', { name: 'Open' }).click();
  const grid = page.getByTestId('rack-grid');
  await expect(grid).toBeVisible();
  await shot(
    page,
    '04-rack-editor',
    [
      { n: 1, at: page.getByRole('button', { name: /Red Peony Canister/ }), side: 'l' },
      { n: 2, at: grid.getByTestId('tube-5'), side: 'tr' },
      { n: 3, at: page.getByRole('button', { name: 'Lay fuse' }), side: 'tr' },
    ],
    { x: 100, y: 40, width: 1400, height: 440 },
  );
});

test('05 firing system', async ({ page }) => {
  await loadDemo(page);
  await page.getByRole('button', { name: 'Firing System', exact: true }).click();
  const m1 = page.getByTestId('module-M1');
  await expect(m1).toBeVisible();
  await shot(page, '05-firing-system', [
    { n: 1, at: page.getByTestId('district-summary'), side: 'tl' },
    { n: 2, at: page.getByRole('button', { name: 'Suggest programming' }), side: 'tl' },
    { n: 3, at: [m1.getByLabel('Position'), m1.getByLabel('Receiver coded to')], side: 'tr' },
    { n: 4, at: m1.getByRole('button', { name: /^#1/ }), side: 'bl' },
  ]);
});

test('06 timeline', async ({ page }) => {
  await loadDemo(page);
  await page.getByRole('button', { name: 'Timeline', exact: true }).click();
  await expect(page.getByTestId('graph-shots')).toBeVisible();
  await shot(page, '06-timeline', [
    { n: 1, at: page.getByTestId('scene-Build'), side: 'tl' },
    {
      n: 2,
      at: [page.getByTestId('graph-shots'), page.getByTestId('graph-cost')],
      side: 'l',
      ring: false,
      dx: 215,
    },
    { n: 3, at: page.getByTestId('cue-Cue 3 (1-3)'), side: 'l', dx: -12 },
    { n: 4, at: page.getByText('Crackling Willow').first(), side: 'tr' },
  ]);
});

test('07 reports', async ({ page }) => {
  await loadDemo(page);
  // Place one more Blue Comets than the inventory holds, unfused, so the checks have something to say.
  await page.getByRole('button', { name: 'Positions', exact: true }).click();
  await page
    .getByTestId('inv-Blue Comets')
    .dragTo(page.getByTestId('position-canvas'), { targetPosition: { x: 300, y: 520 } });
  await page.getByRole('button', { name: /^Reports/ }).click();
  await expect(page.getByTestId('issues')).toBeVisible();
  await shot(page, '07-reports', [
    {
      n: 1,
      at: page.getByText('Show length').locator('xpath=ancestor::div[contains(@class,"grid")][1]'),
      side: 'tl',
    },
    { n: 2, at: page.getByTestId('issues'), side: 'tl' },
    { n: 3, at: page.getByTestId('fuse-totals'), side: 'tl' },
    { n: 4, at: page.getByRole('button', { name: /Cost spreadsheet/ }), side: 'tr' },
  ]);
});

test('08 setup worksheet', async ({ page }) => {
  await loadDemo(page);
  await page.getByRole('button', { name: /^Reports/ }).click();
  await page.getByRole('button', { name: 'Setup worksheet' }).click();
  await page.setViewportSize({ width: 1600, height: 1500 });
  const layout = page.getByTestId('position-layout').first();
  await page.getByText('Modules: M1, M2').evaluate((el) => el.scrollIntoView({ block: 'start' }));
  await page.mouse.wheel(0, -20);
  await shot(
    page,
    '08-setup-worksheet',
    [
      { n: 1, at: layout, side: 'tl' },
      { n: 2, at: page.getByText('1. Place items').first(), side: 'l', ring: false },
      { n: 3, at: page.getByTestId('rack-fuse-diagram').first(), side: 'tl' },
      { n: 4, at: page.getByText('3. Fuse chains, in cue order').first(), side: 'l', ring: false },
    ],
    { x: 0, y: 0, width: 1600, height: 1300 },
  );
});

test('09 show overview', async ({ page }) => {
  await loadDemo(page);
  await page.getByRole('button', { name: /^Reports/ }).click();
  await page.getByRole('button', { name: 'Show overview', exact: true }).click();
  await expect(page.getByTestId('overview-runtime')).toBeVisible();
  await page.setViewportSize({ width: 1600, height: 1400 });
  await page.getByTestId('overview-brand').evaluate((el) => el.scrollIntoView({ block: 'start' }));
  await page.mouse.wheel(0, -40);
  await shot(
    page,
    '09-show-overview',
    [
      { n: 1, at: page.getByTestId('overview-runtime'), side: 'tl' },
      { n: 2, at: page.getByTestId('overview-chart'), side: 'tl' },
    ],
    { x: 0, y: 0, width: 1600, height: 1190 },
  );
});

test('10 show mode', async ({ page }) => {
  await loadDemo(page);
  await page.getByRole('button', { name: /^Reports/ }).click();
  await page.getByRole('button', { name: '▶ Show mode' }).click();
  for (let i = 0; i < 4; i++) await page.keyboard.press('n');
  await page.keyboard.press('ArrowRight');
  await expect(page.getByTestId('district-callout')).toHaveText('SWITCH TO DISTRICT 3');
  await shot(page, '10-show-mode', [
    { n: 1, at: page.getByTestId('next-cue'), side: 'tl' },
    { n: 2, at: page.getByTestId('district-callout'), side: 'r' },
    { n: 3, at: page.getByTestId('now-firing'), side: 'l' },
    { n: 4, at: page.getByLabel('Cue callouts'), side: 'b' },
  ]);
});

test('11 dry run', async ({ page }) => {
  await loadDemo(page);
  await page.getByRole('button', { name: /^Reports/ }).click();
  await page.getByRole('button', { name: '▶ Show mode' }).click();
  await page.getByRole('button', { name: 'Dry run' }).click();
  await expect(page.getByTestId('dry-run-bar')).toBeVisible();
  // Press each cue a little early or late, and switch district between cue 4 and cue 9.
  // Only ever seek forward: going back in a dry run drops the taps after that point.
  const goTo = async (t: string) => {
    await page.getByTestId('show-clock').click();
    await page.getByTestId('goto-time').fill(t);
    await page.getByTestId('goto-time').press('Enter');
  };
  for (const [t, key] of [
    ['0:00.2', 'f'],
    ['0:41.8', 'f'],
    ['0:50.4', 'f'],
    ['0:58.1', 'f'],
    ['1:03.0', 's'],
    ['1:09.7', 'f'],
    ['1:24.6', 'f'],
  ] as const) {
    await goTo(t);
    await page.keyboard.press(key);
  }
  await goTo('1:26.0');
  await expect(page.getByTestId('dry-run-results')).toBeVisible();
  await shot(page, '11-dry-run', [
    { n: 1, at: page.getByTestId('dry-offset').nth(1), side: 'l', dx: -14 },
    { n: 2, at: page.getByTestId('dry-run-results'), side: 'tl' },
  ]);
});
