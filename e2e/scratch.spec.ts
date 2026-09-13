import { expect, test } from '@playwright/test';

test('build a show from scratch, undo, autosave and print', async ({ page }) => {
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

  // Inventory: add a cake
  await page.getByRole('button', { name: 'Inventory', exact: true }).click();
  await page.getByRole('button', { name: '+ Cake' }).click();
  await page.getByRole('dialog').getByLabel('Name').fill('Test Cake');
  await page.getByRole('dialog').getByLabel('Cost (each)').fill('50');
  await page.getByRole('dialog').getByLabel('Web link').fill('example.com/test-cake');
  await page.getByRole('button', { name: 'Save' }).click();
  await expect(page.getByRole('cell', { name: /^Test Cake/ })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Open link for Test Cake' })).toHaveAttribute(
    'href',
    'https://example.com/test-cake',
  );

  // Delete, then undo
  await page.getByRole('row', { name: /Test Cake/ }).getByRole('button', { name: 'Delete' }).click();
  await expect(page.getByRole('cell', { name: /^Test Cake/ })).toHaveCount(0);
  await page.getByRole('button', { name: /Undo/ }).click();
  await expect(page.getByRole('cell', { name: /^Test Cake/ })).toBeVisible();

  // Firing system: one receiver
  await page.getByRole('button', { name: 'Firing System', exact: true }).click();
  await page.getByRole('button', { name: '+ Generic 12-cue receiver' }).click();
  await expect(page.getByTestId('module-M1')).toBeVisible();

  // Position: place the cake, add an igniter, wire it
  await page.getByRole('button', { name: 'Positions', exact: true }).click();
  await page.getByTestId('inv-Test Cake').dragTo(page.getByTestId('position-canvas'), { targetPosition: { x: 500, y: 400 } });
  await page.getByRole('button', { name: '⚡ Add igniter' }).click();
  const a = (await page.locator('.react-flow__node-igniter .react-flow__handle').boundingBox())!;
  const b = (await page.getByTestId('node-Test Cake').locator('[data-handleid="in"]').boundingBox())!;
  await page.mouse.move(a.x + a.width / 2, a.y + a.height / 2);
  await page.mouse.down();
  await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2, { steps: 12 });
  await page.mouse.up();
  await expect(page.locator('.react-flow__edge')).toHaveCount(1);
  await expect(page.getByTestId('node-Test Cake')).toContainText('Cue 1');

  // Reports reflect it
  await page.getByRole('button', { name: /^Reports/ }).click();
  await expect(page.getByTestId('cost-table')).toContainText('Test Cake');
  await expect(page.getByText('1 wired + 1 spare').first()).toBeVisible();

  // Print buttons render the print view and call window.print
  await page.getByRole('button', { name: '🖨 Worksheet PDF' }).click();
  await page.waitForFunction(() => (window as unknown as { __printed: number }).__printed === 1);
  await expect(page.locator('.print-root')).toContainText('Setup worksheet');

  // Autosave survives a reload
  await page.reload();
  await page.getByRole('button', { name: 'Inventory', exact: true }).click();
  await expect(page.getByRole('cell', { name: /^Test Cake/ })).toBeVisible();

  expect(errors).toEqual([]);
});
