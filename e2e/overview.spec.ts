import { expect, test } from '@playwright/test';

test('show overview: new show fields, sections to choose, prints landscape across pages', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  page.on('dialog', (d) => d.accept());
  await page.addInitScript(() => {
    (window as unknown as { __printed: number }).__printed = 0;
    window.print = () => {
      (window as unknown as { __printed: number }).__printed++;
    };
  });
  await page.goto('/');
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.getByRole('button', { name: 'File ▾' }).click();
  await page.getByRole('button', { name: 'Load demo show' }).click();

  // The new show fields live in Show settings.
  await page.getByRole('button', { name: '⚙ Settings' }).click();
  await page.getByLabel('Designed by').fill('Sam R.');
  await page.getByLabel('Contact on the night').fill('Sam, 555-0100');
  await page.getByRole('button', { name: 'Done' }).click();

  // A product link turns into a link and a QR code.
  await page.getByRole('button', { name: 'Inventory', exact: true }).click();
  await page.getByRole('button', { name: 'Edit Night Owl' }).click();
  await page.getByLabel('Web link').fill('example.com/night-owl');
  await page.getByRole('button', { name: 'Save', exact: true }).click();

  // A site photo shows under the overview's site map.
  await page.getByRole('button', { name: 'Site Map', exact: true }).click();
  const photo = await page.evaluate(() => {
    const c = document.createElement('canvas');
    c.width = 40;
    c.height = 30;
    const g = c.getContext('2d')!;
    g.fillStyle = '#4d7c0f';
    g.fillRect(0, 0, 40, 30);
    return c.toDataURL('image/png').split(',')[1];
  });
  const chooser = page.waitForEvent('filechooser');
  await page.getByRole('button', { name: 'Add background image' }).click();
  await (await chooser).setFiles({ name: 'yard.png', mimeType: 'image/png', buffer: Buffer.from(photo, 'base64') });

  await page.getByRole('button', { name: /^Reports/ }).click();
  await page.getByRole('button', { name: 'Show overview', exact: true }).click();
  const doc = page.getByTestId('overview');
  await expect(doc.getByRole('heading', { level: 1 })).toHaveText('Backyard Fourth (demo)');
  await expect(doc).toContainText('Saturday, July 4, 2026 · Back yard · Designed by Sam R.');
  await expect(doc).toContainText(/starts 9:15 PM, ends about 9:1\d PM/);
  await expect(page.getByTestId('overview-description')).toContainText('Bring a chair');
  await expect(page.getByTestId('overview-chart')).toContainText('Finale');
  await expect(page.getByTestId('overview-peak')).toContainText(/Busiest at \d:\d\d/);
  // Cost over time sits under the shots, as a share while prices are off.
  await expect(page.getByTestId('overview-cost-peak')).toContainText(/Most spent at \d:\d\d/);
  await expect(page.getByTestId('overview-cost-peak')).toContainText('% of the cost');
  await expect(page.getByTestId('overview-brand')).toContainText('PatioPyro');
  await expect(page.getByTestId('overview-stats')).toContainText('Average pace');
  await expect(page.getByTestId('overview-site').getByTestId('site-thumb').locator('image')).toHaveAttribute('href', /^data:image\/png/);
  await expect(page.getByTestId('overview-scene-list')).toContainText('4 scenes');
  await expect(page.getByTestId('overview-scene')).toHaveCount(4);
  await expect(page.getByTestId('overview-scene').first()).toContainText('Two crackling cakes to get everyone looking up.');
  const owl = page.getByTestId('overview-product').filter({ hasText: 'Night Owl' });
  await expect(owl).toContainText('25-shot cake');
  await expect(owl).toContainText('Crackle');
  await expect(owl).toContainText('Golden');
  await expect(owl.getByRole('link', { name: 'Night Owl' })).toHaveAttribute('href', 'https://example.com/night-owl');
  await expect(owl.getByRole('img', { name: /QR code/ })).toBeVisible();
  // Cost is off by default: no prices anywhere, no cost totals and no safety section, but the
  // breakdown by scene and by kind still prints, as shares.
  await expect(doc).not.toContainText('$');
  await expect(page.getByTestId('overview-stats')).toContainText('Busiest moment');
  await expect(page.getByTestId('overview-cost')).toHaveCount(0);
  await expect(page.getByTestId('overview-safety')).toHaveCount(0);
  await expect(page.getByTestId('overview-breakdown').getByRole('heading', { level: 2 })).toHaveText('Breakdown');
  await expect(page.getByTestId('overview-by-scene')).toContainText('Finale');
  await expect(page.getByTestId('overview-by-scene')).toContainText('%');
  await expect(page.getByTestId('overview-by-kind')).toContainText('Cakes');
  await page.screenshot({ path: 'test-results/shots/overview-preview.png', fullPage: true });

  // Choose sections: the preview follows along.
  await page.getByRole('button', { name: '🖨 Show overview PDF' }).click();
  const dialog = page.getByTestId('overview-dialog');
  await dialog.getByLabel(/^Cost/).check();
  await dialog.getByLabel(/^Safety and site/).check();
  await expect(page.getByTestId('overview-cost')).toContainText('Per shot');
  await expect(page.getByTestId('overview-breakdown').getByRole('heading', { level: 2 })).toHaveText('Cost');
  await expect(page.getByTestId('overview-by-kind')).toContainText('$');
  await expect(page.getByTestId('overview-cost-peak')).toContainText('$');
  await expect(page.getByTestId('overview-stats')).toContainText('Fireworks cost');
  await expect(owl).toContainText('$45.00');
  const safety = page.getByTestId('overview-safety');
  await expect(safety).toContainText('Garden hose');
  await expect(safety).toContainText('2 people: one on the remote, one spotter');
  await expect(safety).toContainText('Sam, 555-0100');
  await expect(safety).toContainText(/At least \d+(\.\d)? ft from the nearest firing position/);
  await dialog.getByLabel(/^Scene by scene/).uncheck();
  await expect(page.getByTestId('overview-scenes')).toHaveCount(0);
  await dialog.getByLabel(/^Scene by scene/).check();
  await dialog.getByLabel('A4').check();

  // Print: landscape A4 with a running footer, and the content runs onto as many pages as it needs.
  await page.getByRole('button', { name: /Print \/ save PDF/ }).click();
  await page.waitForFunction(() => (window as unknown as { __printed: number }).__printed === 1);
  const printed = page.locator('.print-root');
  await expect(printed.getByTestId('overview')).toBeAttached();
  expect(await printed.locator('style').textContent()).toContain('size: a4 landscape');
  // Scene tags, color dots and share bars are backgrounds, which browsers drop when printing unless told not to.
  await page.emulateMedia({ media: 'print' });
  const tag = printed.getByTestId('overview-product').filter({ hasText: 'Night Owl' }).locator('span.text-white').first();
  expect(await tag.evaluate((el) => getComputedStyle(el).printColorAdjust)).toBe('exact');
  await page.emulateMedia({ media: 'screen' });
  await page.emulateMedia({ media: 'print' });
  const pdf = await page.pdf({ path: 'test-results/shots/overview.pdf', preferCSSPageSize: true });
  const pages = pdf.toString('latin1').match(/\/Type\s*\/Page[^s]/g)?.length ?? 0;
  expect(pages).toBeGreaterThanOrEqual(4);
  await page.emulateMedia({ media: 'screen' });

  // Portrait: the same sections on taller, narrower pages.
  await page.getByRole('button', { name: '🖨 Show overview PDF' }).click();
  await page.getByTestId('overview-dialog').getByLabel('Portrait').check();
  await page.getByRole('button', { name: /Print \/ save PDF/ }).click();
  await page.waitForFunction(() => (window as unknown as { __printed: number }).__printed === 2);
  expect(await printed.locator('style').textContent()).toContain('size: a4 portrait');
  await page.emulateMedia({ media: 'print' });
  const portraitPdf = await page.pdf({ path: 'test-results/shots/overview-portrait.pdf', preferCSSPageSize: true });
  expect(portraitPdf.toString('latin1').match(/\/Type\s*\/Page[^s]/g)?.length ?? 0).toBeGreaterThanOrEqual(4);
  await page.emulateMedia({ media: 'screen' });

  // The choices are remembered.
  await page.reload();
  await page.getByRole('button', { name: /^Reports/ }).click();
  await page.getByRole('button', { name: '🖨 Show overview PDF' }).click();
  await expect(page.getByTestId('overview-dialog').getByLabel(/^Cost/)).toBeChecked();
  await expect(page.getByTestId('overview-dialog').getByLabel('A4')).toBeChecked();
  await expect(page.getByTestId('overview-dialog').getByLabel('Portrait')).toBeChecked();

  expect(errors).toEqual([]);
});
