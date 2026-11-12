import { expect, test } from '@playwright/test';

const SHOTS = 'test-results/shots';

test('cakes bought in an assortment are priced across the whole assortment', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  page.on('dialog', (d) => d.accept());

  await page.goto('/');
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.getByRole('button', { name: 'Inventory', exact: true }).click();

  // The assortment: $100 for the pack
  await page.getByRole('button', { name: '+ Assortment' }).click();
  let dialog = page.getByRole('dialog');
  await dialog.getByLabel('Name').fill('Party Pack');
  await dialog.getByLabel('Cost (each assortment)').fill('100');
  await dialog.getByRole('button', { name: 'Save' }).click();
  const packRow = page.getByRole('row', { name: /^Party Pack/ });
  await expect(packRow).toContainText('$100.00');

  // A 30-shot cake tagged from the cake dialog
  await page.getByRole('button', { name: '+ Cake' }).first().click();
  dialog = page.getByRole('dialog');
  await dialog.getByLabel('Name').fill('Pack Cake A');
  await dialog.getByRole('combobox', { name: 'Assortment' }).selectOption({ label: 'Party Pack' });
  await dialog.getByLabel('Shots').first().fill('30');
  await dialog.getByLabel('Duration').first().fill('30');
  await expect(dialog.getByLabel('Cost (share)')).toBeDisabled();
  await page.screenshot({ path: `${SHOTS}/assortment-cake-dialog.png` });
  await dialog.getByRole('button', { name: 'Save' }).click();

  // Two of a 10-shot cake, added from the assortment row
  await packRow.getByRole('button', { name: '+ Cake' }).click();
  dialog = page.getByRole('dialog');
  await expect(dialog.getByRole('combobox', { name: 'Assortment' })).toHaveValue(/asst_/);
  await dialog.getByLabel('Name').fill('Pack Cake B');
  await dialog.getByLabel('Shots').first().fill('10');
  await dialog.getByLabel('Duration').first().fill('10');
  await dialog.getByLabel('Per assortment').fill('2');
  await dialog.getByRole('button', { name: 'Save' }).click();

  // 30 + 2 × 10 = 50 shots and 50 s for $100: $2 a shot and a second for every cake in it
  await expect(packRow).toContainText('50');
  await expect(packRow).toContainText('$2.00');
  const cakeA = page.getByRole('row', { name: /^Pack Cake A/ });
  await expect(cakeA).toContainText('Party Pack');
  await expect(cakeA).toContainText('$60.00share'); // its share: 30 of 50 shots
  await expect(cakeA).toContainText('$2.00');
  const cakeB = page.getByRole('row', { name: /^Pack Cake B/ });
  await expect(cakeB).toContainText('Party Pack ×2');
  await expect(cakeB).toContainText('$20.00share');

  await page.screenshot({ path: `${SHOTS}/assortment-inventory.png` });

  // The assortment dialog lists its cakes and totals
  await packRow.getByRole('button', { name: 'Edit', exact: true }).click();
  const members = page.getByTestId('assortment-members');
  await expect(members).toContainText('Pack Cake A');
  await expect(members).toContainText('3 cakes');
  await page.screenshot({ path: `${SHOTS}/assortment-dialog.png` });
  await page.getByRole('dialog').getByRole('button', { name: 'Cancel' }).click();

  // Deleting the assortment keeps the cakes at their share of its price
  await packRow.getByRole('button', { name: 'Delete' }).click();
  await expect(page.getByRole('row', { name: /^Party Pack/ })).toHaveCount(0);
  await expect(cakeA).toContainText('$60.00');
  await expect(cakeA).not.toContainText('share');

  expect(errors).toEqual([]);
});
