import { expect, test, type Page } from '@playwright/test';

const shot = (page: Page, name: string) => page.screenshot({ path: `test-results/shots/${name}.png` });

test('demo show: layout, fuse, timeline, reports and exports', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  page.on('dialog', (d) => d.accept());

  await page.goto('/');
  await page.getByRole('button', { name: 'File ▾' }).click();
  await page.getByRole('button', { name: 'Load demo show' }).click();
  await expect(page.getByText('Night Owl').first()).toBeVisible();
  await expect(page.getByRole('row', { name: /Sky Whistler Rocket/ })).toContainText('$3.00');
  await expect(page.getByRole('row', { name: /10-Ball Roman Candle/ })).toContainText('$0.40'); // $4 / 10 shots
  await expect(page.getByRole('row', { name: /Triple Threat Compound/ })).toContainText('Compound ×3');
  await expect(page.getByTestId('sub-row-Triple Threat Compound-1')).toContainText('Ghost fans');
  await expect(page.getByRole('row', { name: /^Night Owl/ })).toContainText('$1.80'); // $45 / 25 shots
  await shot(page, '1-inventory');

  await page.getByRole('button', { name: 'Site Map', exact: true }).click();
  await expect(page.getByTestId('site-map')).toBeVisible();
  await shot(page, '2-site');

  await page.getByRole('button', { name: 'Positions', exact: true }).click();
  await expect(page.locator('.react-flow__node').first()).toBeVisible();
  await shot(page, '3-positions');

  // Drag a cake from the inventory onto the canvas
  const nodesBefore = await page.locator('.react-flow__node').count();
  await page.getByTestId('inv-Blue Comets').dragTo(page.getByTestId('position-canvas'), { targetPosition: { x: 300, y: 520 } });
  await expect(page.locator('.react-flow__node')).toHaveCount(nodesBefore + 1);

  // Add an igniter on M2 (M1's four cues are all wired) and draw fuse from it to the new cake's lead fuse
  await page.getByRole('combobox', { name: 'Module', exact: true }).first().selectOption({ label: 'M2' });
  await page.getByRole('button', { name: '⚡ Add igniter' }).click();
  await expect(page.locator('.react-flow__node')).toHaveCount(nodesBefore + 2);
  const edgesBefore = await page.locator('.react-flow__edge').count();
  const igniter = page.locator('.react-flow__node-igniter', { hasText: 'M2 #2' }).locator('.react-flow__handle');
  const lead = page.getByTestId('node-Blue Comets').locator('[data-handleid="in"]');
  const a = (await igniter.boundingBox())!;
  const b = (await lead.boundingBox())!;
  await page.mouse.move(a.x + a.width / 2, a.y + a.height / 2);
  await page.mouse.down();
  await page.mouse.move(b.x + b.width / 2 + 5, b.y + b.height / 2 + 5, { steps: 10 });
  await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2, { steps: 5 });
  await page.mouse.up();
  await expect(page.locator('.react-flow__edge')).toHaveCount(edgesBefore + 1);
  await expect(page.getByTestId('node-Blue Comets')).toContainText('Cue 6');
  await shot(page, '4-positions-wired');

  // Rack editor
  await page.getByTestId('node-HDPE 3×3 rack').getByRole('button', { name: 'Open' }).click();
  await expect(page.getByTestId('rack-grid')).toBeVisible();
  await shot(page, '5-rack');
  await page.getByRole('button', { name: 'Close' }).click();

  await page.getByRole('button', { name: 'Firing System', exact: true }).click();
  await expect(page.getByTestId('module-M1')).toBeVisible();
  await expect(page.getByLabel('Cues per district')).toHaveValue('4');
  await expect(page.getByTestId('district-summary')).toContainText('District 4');
  await shot(page, '6-firing');

  // Timeline: drag cue 9 right by ~10 s
  await page.getByRole('button', { name: 'Timeline', exact: true }).click();
  const cue = page.getByTestId('cue-Cue 9');
  await expect(cue).toBeVisible();
  const c = (await cue.boundingBox())!;
  await page.mouse.move(c.x + c.width / 2, c.y + 20);
  await page.mouse.down();
  await page.mouse.move(c.x + c.width / 2 + 140, c.y + 20, { steps: 10 });
  await page.mouse.up();
  // 140 px at the default 14 px/s = +10 s, from 1:10 to 1:20
  await expect(page.getByLabel('Time (s)')).toHaveValue('80');
  await shot(page, '7-timeline');

  await page.getByRole('button', { name: /^Reports/ }).click();
  await expect(page.getByTestId('cost-table')).toBeVisible();
  await expect(page.getByTestId('cost-table')).toContainText('Roman candles');
  await expect(page.getByTestId('cost-table')).toContainText('Rockets');
  await shot(page, '8-reports');

  const [xlsx] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: /Cost spreadsheet/ }).click(),
  ]);
  expect(xlsx.suggestedFilename()).toMatch(/\.xlsx$/);
  const [csv] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: /Cost \.csv/ }).click()]);
  expect(csv.suggestedFilename()).toMatch(/\.csv$/);

  await page.getByRole('button', { name: 'Setup worksheet' }).click();
  await expect(page.getByText('Fuse chains, in cue order').first()).toBeVisible();
  // One fuse diagram per rack: the shell rack on Left and the rocket rack in Center.
  await expect(page.getByTestId('rack-fuse-diagram')).toHaveCount(2);
  await expect(page.getByText('fire enters the rack here').first()).toBeVisible();
  await shot(page, '9-worksheet');
  await page.getByRole('button', { name: 'Show plan', exact: true }).click();
  await expect(page.getByText('End of show').first()).toBeVisible();
  await expect(page.getByText('Switch the remote to District 3').first()).toBeVisible();
  await shot(page, '10-plan');

  await page.getByRole('button', { name: '▶ Show mode' }).click();
  await expect(page.getByTestId('show-mode')).toBeVisible();
  await expect(page.getByTestId('next-cue')).toContainText('Cue 1');
  await expect(page.getByTestId('district-callout')).toHaveText('START ON DISTRICT 1');
  await expect(page.getByTestId('district-track')).toContainText('District 3');
  // Jump through cues 1–4 (0:42, 0:50, 0:58): the willow chained off Night Owl is bursting at Left.
  for (let i = 0; i < 4; i++) await page.keyboard.press('n');
  await expect(page.getByTestId('show-clock')).toHaveText('0:58.0');
  await expect(page.getByTestId('next-cue')).toContainText('Cue 9');
  await expect(page.getByTestId('district-callout')).toHaveText('SWITCH TO DISTRICT 3');
  await expect(page.getByTestId('remote-district')).toContainText('District 1');
  await expect(page.getByTestId('now-Left')).toContainText('Crackling Willow');
  await page.getByRole('button', { name: /Next cue/ }).click();
  await expect(page.getByTestId('show-clock')).toHaveText('1:20.0');
  await shot(page, '11-showmode');
  await page.keyboard.press('Escape');

  expect(errors).toEqual([]);
});
