import { expect, test, type Locator, type Page } from '@playwright/test';

/** Default zoom: 14 px per second. */
const PPS = 14;

async function dragBy(page: Page, target: Locator, dx: number, grabX?: number) {
  await target.scrollIntoViewIfNeeded();
  const b = (await target.boundingBox())!;
  const fromX = b.x + (grabX ?? b.width / 2);
  const y = b.y + b.height / 2;
  await page.mouse.move(fromX, y);
  await page.mouse.down();
  await page.mouse.move(fromX + dx, y, { steps: 8 });
  await page.mouse.up();
}

async function openTimeline(page: Page) {
  page.on('dialog', (d) => d.accept());
  await page.goto('/');
  await page.getByRole('button', { name: 'File ▾' }).click();
  await page.getByRole('button', { name: 'Load demo show' }).click();
  await page.getByRole('button', { name: 'Timeline', exact: true }).click();
  await expect(page.getByTestId('scene-strip')).toBeVisible();
}

test('scenes: move, resize, rename, remove and create', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  await openTimeline(page);
  await page.screenshot({ path: 'test-results/shots/scenes-timeline.png' });

  const startField = page.getByLabel('Start (s)');
  const cueTime = async (label: string) => {
    await page.getByTestId(`cue-${label}`).dispatchEvent('pointerdown', { clientX: 0, clientY: 0, bubbles: true });
    await page.mouse.up();
    return page.getByLabel('Time (s)').inputValue();
  };

  // Finale (125-150) holds Cue 5 at 125; moving it later carries the cue and leaves others alone.
  await dragBy(page, page.getByTestId('scene-Finale'), 5 * PPS);
  await expect(startField).toHaveValue('130');
  await expect(page.getByTestId('scene-cues')).toContainText('1 cue in this scene');
  await expect(page.getByTestId('scene-cues')).toContainText('Cue 5');
  expect(await cueTime('Cue 5 (2-1)')).toBe('130');
  expect(await cueTime('Cue 15 (4-3)')).toBe('112');

  // Undo restores the scene and its cue in one step.
  await page.keyboard.press('Control+z');
  expect(await cueTime('Cue 5 (2-1)')).toBe('125');

  // Crescendo (98-120) stops against Finale at 125 when dragged further than the 5 s gap.
  await dragBy(page, page.getByTestId('scene-Crescendo'), 15 * PPS);
  await expect(startField).toHaveValue('103');
  await expect(page.getByLabel('End (s)')).toHaveValue('125');

  // Arrow keys nudge a selected scene and its cues (default snap 0.5 s).
  await dragBy(page, page.getByTestId('scene-Crescendo'), -2 * PPS);
  await expect(startField).toHaveValue('101');
  await page.keyboard.press('ArrowRight');
  await expect(startField).toHaveValue('101.5');
  expect(await cueTime('Cue 10 (3-2)')).toBe('101.5');

  // Dragging an edge resizes without moving cues.
  await dragBy(page, page.getByTestId('scene-Opening-end'), -5 * PPS, 3);
  await page.getByTestId('scene-Opening').click({ position: { x: 30, y: 5 } });
  await expect(page.getByLabel('End (s)')).toHaveValue('35');
  expect(await cueTime('Cue 1 (1-1)')).toBe('0');

  // Rename from a double-click.
  await page.getByTestId('scene-Opening').dblclick({ position: { x: 30, y: 5 } });
  await expect(page.getByLabel('Scene name')).toBeFocused();
  await page.keyboard.type('Overture');
  await expect(page.getByTestId('scene-Overture')).toBeVisible();

  // Removing a scene leaves its cues where they are.
  await page.getByRole('button', { name: 'Remove scene' }).click();
  await expect(page.getByTestId('scene-Overture')).toHaveCount(0);
  expect(await cueTime('Cue 1 (1-1)')).toBe('0');

  // Cue 1 now has no scene, so it can seed a new one from the selection.
  await page.getByRole('button', { name: /Scene from selection/ }).click();
  await expect(startField).toHaveValue('0');
  await expect(page.getByTestId('scene-cues')).toContainText('Cue 1');
  await page.getByRole('button', { name: 'Remove scene' }).click();

  // Draw a scene in the empty stretch at the start.
  await page.getByTestId('timeline').evaluate((el) => (el.scrollLeft = 0));
  const strip = page.getByTestId('scene-strip');
  const s = (await strip.boundingBox())!;
  await page.mouse.move(s.x + 16 + 2 * PPS, s.y + 10);
  await page.mouse.down();
  await page.mouse.move(s.x + 16 + 12 * PPS, s.y + 10, { steps: 6 });
  await page.mouse.up();
  await expect(startField).toHaveValue('2');
  await expect(page.getByLabel('End (s)')).toHaveValue('12');
  await page.getByLabel('Scene name').fill('Hello');
  await expect(page.getByTestId('scene-Hello')).toBeVisible();

  // A cue selected inside a scene can't seed another scene.
  await page.getByTestId('cue-Cue 5 (2-1)').dispatchEvent('pointerdown', { clientX: 0, clientY: 0, bubbles: true });
  await page.mouse.up();
  await expect(page.getByRole('button', { name: /Scene from selection/ })).toBeDisabled();

  expect(errors).toEqual([]);
});

test('scenes appear in show mode and the show plan', async ({ page }) => {
  await openTimeline(page);

  await page.getByRole('button', { name: /^Reports/ }).click();
  await page.getByRole('button', { name: /Show mode/i }).click();
  await expect(page.getByTestId('current-scene')).toContainText('—');
  await expect(page.getByTestId('next-scene')).toHaveText('Starts scene: Opening');
  await expect(page.getByTestId('list-scene')).toHaveText(['Opening', 'Build', 'Crescendo', 'Finale']);
  await page.keyboard.press('n');
  await expect(page.getByTestId('current-scene')).toContainText('Opening');
  await expect(page.getByTestId('next-cue')).toContainText('Cue 2 (1-2)');
  await expect(page.getByTestId('show-cue-list')).toContainText('Cue 14 (4-2)');
  await page.screenshot({ path: 'test-results/shots/scenes-show-mode.png' });
  await page.keyboard.press('Escape');

  await page.getByRole('button', { name: 'Show plan', exact: true }).click();
  await expect(page.getByTestId('plan-scene')).toHaveCount(4);
  await expect(page.getByTestId('plan-scene').first()).toContainText('Opening');
  await expect(page.getByText('Cue 9 (3-1)', { exact: true })).toBeVisible();
});
