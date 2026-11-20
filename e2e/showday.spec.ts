import { expect, test } from '@playwright/test';

test('show night: mark a misfire and a dud, print the sweep list, then practise in a dry run', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('dialog', (d) => d.accept());
  await page.addInitScript(() => {
    (window as unknown as { __printed: number }).__printed = 0;
    window.print = () => {
      (window as unknown as { __printed: number }).__printed++;
    };
  });
  await page.goto('/');
  await page.getByRole('button', { name: 'File ▾' }).click();
  await page.getByRole('button', { name: 'Load demo show' }).click();
  await page.getByRole('button', { name: /^Reports/ }).click();
  await page.getByRole('button', { name: '▶ Show mode' }).click();

  await expect(page.getByTestId('wake-lock')).toBeVisible();
  // Run the clock across the first cue with each kind of callout.
  const clockText = page.getByTestId('show-clock');
  for (const mode of ['beeps', 'voice'] as const) {
    await page.getByLabel('Cue callouts').selectOption(mode);
    await page.keyboard.press('Home');
    await page.keyboard.press('Shift+ArrowRight');
    await page.keyboard.press('Alt+ArrowLeft');
    await page.keyboard.press('Space');
    await expect(clockText).not.toHaveText('T-0:00.1');
    await expect(clockText).toHaveText(/^0:00\.[3-9]|^0:01/);
    await page.keyboard.press('Space');
  }
  await page.keyboard.press('Home');

  // The first cue fires; it didn't go off on the night, so mark it (M).
  const clock = page.getByTestId('show-clock');
  await page.keyboard.press('n');
  await expect(clock).toHaveText('0:00.0');
  await page.keyboard.press('m');
  await expect(page.getByRole('button', { name: '✗ Didn’t fire' }).first()).toBeVisible();

  // Something else at a later cue was lit but didn't go off.
  await clock.click();
  await page.getByTestId('goto-time').fill('1:12');
  await page.getByTestId('goto-time').press('Enter');
  const dud = page
    .getByTestId('now-firing')
    .getByRole('button', { name: 'Dud', exact: true })
    .first();
  // Step forward until something there is lit or going off.
  for (let i = 0; i < 30 && (await dud.count()) === 0; i++) await page.keyboard.press('ArrowRight');
  await dud.click();
  await expect(page.getByTestId('now-firing').getByRole('button', { name: '✗ Dud' })).toHaveCount(
    1,
  );

  await page.getByRole('button', { name: /Sweep list \(2 marked\)/ }).click();
  await page.waitForFunction(() => (window as unknown as { __printed: number }).__printed === 1);
  const sweep = page.getByTestId('sweep-list');
  await expect(sweep).toContainText('Post-show sweep list');
  await expect(sweep).toContainText('Cue didn’t fire');
  await expect(sweep).toContainText('Dud: lit, didn’t go off');
  // The misfired cue's chained cake is listed too, by position.
  expect(await sweep.getByTestId('sweep-row').count()).toBeGreaterThanOrEqual(3);

  // Dry run: practise without marking anything; taps are scored against the plan.
  await page.getByRole('button', { name: 'Dry run' }).click();
  await expect(page.getByTestId('dry-run-bar')).toBeVisible();
  await expect(clock).toHaveText('T-0:10.0');
  await expect(page.getByRole('button', { name: /Didn’t fire/ })).toHaveCount(0);
  await page.keyboard.press('n');
  await page.keyboard.press('f');
  await expect(page.getByTestId('dry-offset').first()).toHaveText('+0.0s');
  // Skip the next cue and press the one after it on time: it is scored on its own cue.
  await page.keyboard.press('n');
  await page.keyboard.press('n');
  await page.keyboard.press('f');
  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('ArrowRight');
  const results = page.getByTestId('dry-run-results');
  await expect(results).toContainText('2 of 3');
  await expect(results.getByText('Missed').locator('..')).toContainText('1');

  // Leaving the dry run keeps the show-night marks; Reports can clear them.
  await page.getByRole('button', { name: '✓ Dry run' }).click();
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'Clear show-night marks (2)' }).click();
  await expect(page.getByRole('button', { name: /Clear show-night marks/ })).toHaveCount(0);

  expect(errors).toEqual([]);
});
