import { expect, test } from '@playwright/test';

test('show mode time controls: steps, previous cue, go to a time, cue list and scrubber', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('dialog', (d) => d.accept());
  await page.goto('/');
  await page.getByRole('button', { name: 'File ▾' }).click();
  await page.getByRole('button', { name: 'Load demo show' }).click();
  await page.getByRole('button', { name: /^Reports/ }).click();
  await page.getByRole('button', { name: '▶ Show mode' }).click();

  const clock = page.getByTestId('show-clock');
  await expect(clock).toHaveText('T-0:10.0');

  // Steps of 1s, 10s (Shift) and 0.1s (Alt), by key and button; never before the lead-in.
  await page.keyboard.press('ArrowLeft');
  await expect(clock).toHaveText('T-0:10.0');
  await page.keyboard.press('Shift+ArrowRight');
  await expect(clock).toHaveText('0:00.0');
  await page.keyboard.press('Alt+ArrowRight');
  await expect(clock).toHaveText('0:00.1');
  await page.getByRole('button', { name: '+10s' }).click();
  await page.getByRole('button', { name: '+10s' }).click();
  await page.getByRole('button', { name: '−1s' }).click();
  await expect(clock).toHaveText('0:19.1');
  await page.getByRole('button', { name: '−10s' }).click();
  await expect(clock).toHaveText('0:09.1');

  // Type a time: click the clock (or G), Enter to go, Esc to cancel without leaving show mode.
  await clock.click();
  const box = page.getByTestId('goto-time');
  await box.fill('abc');
  await box.press('Enter');
  await expect(box).toHaveAttribute('aria-invalid', 'true');
  await box.fill('1:05');
  await box.press('Enter');
  await expect(clock).toHaveText('1:05.0');
  await page.keyboard.press('g');
  await box.fill('0:30');
  await box.press('Escape');
  await expect(page.getByTestId('show-mode')).toBeVisible();
  await expect(clock).toHaveText('1:05.0');

  // Previous cue: back to the start of the current cue, then to the one before.
  await page.keyboard.press('Home');
  await expect(clock).toHaveText('T-0:10.0');
  await page.keyboard.press('n');
  const first = await clock.textContent();
  await page.keyboard.press('n');
  const second = await clock.textContent();
  expect(second).not.toBe(first);
  // A couple of seconds into this cue, short of the next one.
  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('p');
  await expect(clock).toHaveText(second!);
  await page.keyboard.press('p');
  await expect(clock).toHaveText(first!);
  await page.getByRole('button', { name: /Prev cue/ }).click();
  await expect(clock).toHaveText('T-0:10.0');

  // Click a cue in the list to jump to it.
  const cue9 = page.getByTestId('show-cue-list').locator('li', { hasText: 'Cue 9' }).first();
  const cue9Time = (await cue9.locator('span').first().textContent())!;
  await cue9.click();
  await expect(clock).toHaveText(cue9Time);
  await expect(page.getByTestId('next-cue')).not.toContainText('Cue 9');

  // The scrubber: its left edge is the lead-in, its right edge the end of the show.
  const bar = page.getByTestId('show-scrubber');
  const b = (await bar.boundingBox())!;
  await page.mouse.click(b.x + 1, b.y + b.height / 2);
  await expect(clock).toHaveText(/^T-0:(10\.0|09\.9)$/);
  await page.mouse.click(b.x + b.width - 1, b.y + b.height / 2);
  await expect(page.getByTestId('next-cue')).toHaveCount(0);
  // Drag back from the end to the middle.
  await page.mouse.move(b.x + b.width - 1, b.y + b.height / 2);
  await page.mouse.down();
  await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2, { steps: 5 });
  await page.mouse.up();
  await expect(page.getByTestId('next-cue')).toBeVisible();
  await page.screenshot({ path: 'test-results/shots/showmode-controls.png' });

  // Space still starts the clock after clicking a button, without clicking it again.
  await page.getByRole('button', { name: 'Reset' }).click();
  await page.getByRole('button', { name: '+10s' }).click();
  await page.keyboard.press('Space');
  await expect(page.getByRole('button', { name: /Pause/ })).toBeVisible();
  await page.waitForTimeout(300);
  await page.keyboard.press('Space');
  await expect(clock).toHaveText(/^0:00\.[2-9]$/);

  expect(errors).toEqual([]);
});
