import { expect, test } from '@playwright/test';

test('Bilusocn receivers are coded in blocks and the suggested programming applies', async ({ page }) => {
  page.on('dialog', (d) => d.accept());
  await page.goto('/');
  await page.getByRole('button', { name: 'File ▾' }).click();
  await page.getByRole('button', { name: 'Load demo show' }).click();
  await page.getByRole('button', { name: 'Firing System', exact: true }).click();

  // Receivers pick a block of 4 cues, not a free start cue.
  const m4 = page.getByTestId('module-M4');
  await expect(m4.getByLabel('Receiver coded to')).toHaveValue('13');
  await expect(page.getByText('Receiver starts at cue')).toHaveCount(0);

  // Single cues can't be linked.
  await m4.getByRole('button', { name: /^#1/ }).click();
  await expect(page.getByRole('dialog')).toContainText("single cues can't be linked");
  await expect(page.getByRole('dialog').getByLabel('Fires on controller cue')).toHaveCount(0);
  await page.keyboard.press('Escape');

  await page.getByRole('button', { name: 'Suggest programming' }).click();
  const dialog = page.getByTestId('programming-dialog');
  await expect(dialog).toBeVisible();
  await expect(dialog.getByTestId('plan-M1')).toContainText('Cues 1–4');
  await page.getByRole('button', { name: 'Apply' }).click();
  await expect(dialog).toHaveCount(0);
});
