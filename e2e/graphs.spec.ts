import { expect, test } from '@playwright/test';

test('timeline shots and cost graphs: bin size, hide and show, remembered on reload', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('dialog', (d) => d.accept());
  await page.goto('/');
  await page.getByRole('button', { name: 'File ▾' }).click();
  await page.getByRole('button', { name: 'Load demo show' }).click();
  await page.getByRole('button', { name: 'Timeline', exact: true }).click();

  const shots = page.getByTestId('graph-shots');
  const cost = page.getByTestId('graph-cost');
  await expect(shots).toBeVisible();
  await expect(cost).toBeVisible();
  await expect(shots).toContainText('per 5s');
  await expect(shots.locator('path').first()).toBeVisible();
  await page.screenshot({ path: 'test-results/shots/timeline-graphs.png' });

  const barsAt5 = await shots.locator('path').count();
  await page.getByLabel('Bin').selectOption('1');
  await expect(shots).toContainText('per 1s');
  expect(await shots.locator('path').count()).toBeGreaterThan(barsAt5);

  await page.getByRole('button', { name: 'Hide Cost graph' }).click();
  await expect(cost).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Cost', exact: true })).toHaveAttribute('aria-pressed', 'false');

  await page.reload();
  await expect(page.getByTestId('graph-shots')).toContainText('per 1s');
  await expect(page.getByTestId('graph-cost')).toHaveCount(0);

  await page.getByRole('button', { name: 'Cost', exact: true }).click();
  await page.getByRole('button', { name: 'Shots', exact: true }).click();
  await expect(page.getByTestId('graph-cost')).toBeVisible();
  await expect(page.getByTestId('graph-shots')).toHaveCount(0);
  expect(errors).toEqual([]);
});
