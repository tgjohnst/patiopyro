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
  await page.getByRole('dialog').getByLabel('Weight class').selectOption('500g');
  await page.getByRole('dialog').getByRole('button', { name: 'Finale' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Zipper' }).click();
  await page.getByRole('dialog').getByRole('textbox', { name: 'Notes', exact: true }).fill('Bought at the tent sale');
  await page.getByRole('button', { name: 'Save' }).click();
  const cakeRow = page.getByRole('row', { name: /Test Cake/ });
  await expect(cakeRow).toContainText('500g');
  await expect(cakeRow.getByTestId('cake-tags')).toHaveText('FinaleZipper');
  await expect(cakeRow).toContainText('Bought at the tent sale');
  await expect(page.getByRole('cell', { name: /^Test Cake/ })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Open link for Test Cake' })).toHaveAttribute(
    'href',
    'https://example.com/test-cake',
  );

  // Compound cake broken into two sub cakes
  await page.getByRole('button', { name: '+ Cake' }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('Name').fill('Combo Cake');
  await dialog.getByLabel('Cost (each)').fill('66');
  await dialog.getByRole('button', { name: 'Ghost', exact: true }).click(); // an effect
  await dialog.getByRole('button', { name: 'Transition', exact: true }).click(); // a tag
  await dialog.getByRole('button', { name: '+ Sub cake' }).click();
  await dialog.getByRole('button', { name: '+ Sub cake' }).click();
  const sub1 = dialog.getByTestId('sub-cake-1');
  await sub1.getByLabel('Sub cake name').fill('Ghost section');
  await sub1.getByLabel('Shots').fill('20');
  await sub1.getByLabel('Duration').fill('10');
  const sub2 = dialog.getByTestId('sub-cake-2');
  await sub2.getByLabel('Sub cake name').fill('Golden section');
  await sub2.getByLabel('Shots').fill('13');
  await sub2.getByLabel('Duration').fill('12');
  await sub2.getByRole('button', { name: 'Golden', exact: true }).click();
  await dialog.getByRole('button', { name: 'Lay end to end' }).click();
  await expect(sub2.getByLabel('Starts at')).toHaveValue('10');
  await expect(dialog.getByLabel('Shots').first()).toHaveValue('33');
  await page.getByRole('button', { name: 'Save' }).click();
  const comboRow = page.getByRole('row', { name: /Combo Cake/ });
  await expect(comboRow.getByTestId('cake-tags')).toHaveText('Transition');
  await expect(comboRow.getByTestId('cake-effects')).toHaveText('Ghost');
  await expect(comboRow).toContainText('Compound ×2');
  await expect(comboRow).toContainText('0:22');
  await expect(comboRow).toContainText('$2.00'); // $66 / 33 shots
  await expect(comboRow).toContainText('$3.00'); // $66 / 22 s
  await expect(page.getByTestId('sub-row-Combo Cake-2')).toContainText('Golden section');
  await expect(page.getByTestId('sub-row-Combo Cake-2')).toContainText('0:10.0–0:22.0');

  // A pack of rockets and a pack of roman candles
  await page.getByRole('button', { name: '+ Rocket' }).click();
  await dialog.getByLabel('Name').fill('Test Rocket');
  await dialog.getByLabel('Pack cost').fill('24');
  await page.getByRole('button', { name: 'Save' }).click();
  await expect(page.getByRole('row', { name: /Test Rocket/ })).toContainText('$24.00 / pack of 12');
  await expect(page.getByRole('row', { name: /Test Rocket/ })).toContainText('$2.00');
  await page.getByRole('button', { name: '+ Roman candle' }).click();
  await dialog.getByLabel('Name').fill('Test Candle');
  await dialog.getByLabel('Pack cost').fill('30');
  await page.getByRole('button', { name: 'Save' }).click();
  const candleRow = page.getByRole('row', { name: /Test Candle/ });
  await expect(candleRow).toContainText('$5.00'); // per candle
  await expect(candleRow).toContainText('$0.50'); // 10 shots
  await expect(candleRow).toContainText('$0.33'); // 15 s

  // Delete, then undo
  await page.getByRole('row', { name: /Test Cake/ }).getByRole('button', { name: 'Delete' }).click();
  await expect(page.getByRole('cell', { name: /^Test Cake/ })).toHaveCount(0);
  await page.getByRole('button', { name: /Undo/ }).click();
  await expect(page.getByRole('cell', { name: /^Test Cake/ })).toBeVisible();

  // Supplies: start from the common list, then set what this show needs
  await expect(page.getByText('No supplies yet.')).toBeVisible();
  await page.getByRole('button', { name: 'Add common supplies' }).click();
  const tape = page.getByTestId('supply-Fuse tape');
  await tape.getByLabel('Needed').fill('3');
  await tape.getByLabel('Needed').press('Tab');
  await tape.getByLabel('Owned').fill('1');
  await tape.getByLabel('Owned').press('Tab');
  await tape.getByLabel('Cost each').fill('4');
  await tape.getByLabel('Cost each').press('Tab');
  await expect(tape).toContainText('$12.00');
  await expect(tape.getByRole('cell').nth(3)).toHaveText('2'); // to buy
  await page.getByRole('button', { name: '+ Supply' }).click();
  await page.getByTestId('supply-New supply').getByLabel('Supply name').fill('Sandbags');
  await page.getByTestId('supply-Sandbags').getByLabel('Needed').fill('0');
  await page.getByTestId('supply-Sandbags').getByLabel('Needed').press('Tab');

  // Firing system: one receiver
  await page.getByRole('button', { name: 'Firing System', exact: true }).click();
  await page.getByRole('button', { name: '+ Generic 12-cue receiver' }).click();
  await expect(page.getByTestId('module-M1')).toBeVisible();
  await page.getByLabel('Cues per district').fill('6');
  await page.getByLabel('Cues per district').press('Enter');
  await expect(page.getByTestId('district-summary')).toContainText('District 2');
  await expect(page.getByTestId('module-M1')).toContainText('Cue 7 · D2');

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
  await page.getByTestId('inv-Test Rocket').dragTo(page.getByTestId('position-canvas'), { targetPosition: { x: 900, y: 500 } });
  await expect(page.getByTestId('node-Test Rocket')).toContainText('Rocket');
  await expect(page.locator('.react-flow__edge')).toHaveCount(1);

  // A board: resize it, then put the cake on it from the inspector and drag the board
  await page.getByRole('button', { name: '▭ Board' }).click();
  const board = page.getByTestId('board-Board 1');
  await expect(board).toBeVisible();
  // A new board starts out selected
  await page.getByLabel('Width').fill('36');
  await page.getByLabel('Width').press('Tab');
  await page.getByLabel('Depth').fill('18');
  await page.getByLabel('Depth').press('Tab');
  await expect(board).toContainText('36 × 18 in');
  await page.getByTestId('node-Test Cake').click();
  await page.getByRole('combobox', { name: 'Board' }).selectOption({ label: 'Board 1' });
  await expect(board).toContainText('1 item');
  await page.screenshot({ path: 'test-results/shots/board-canvas.png' });
  const cakeBefore = (await page.getByTestId('node-Test Cake').boundingBox())!;
  const bb = (await board.boundingBox())!;
  await page.mouse.move(bb.x + bb.width - 30, bb.y + 8);
  await page.mouse.down();
  await page.mouse.move(bb.x + bb.width + 30, bb.y + 48, { steps: 8 });
  await page.mouse.up();
  const cakeAfter = (await page.getByTestId('node-Test Cake').boundingBox())!;
  expect(cakeAfter.x - cakeBefore.x).toBeGreaterThan(20); // rode along with the board
  await expect(board).toContainText('1 item');

  // Reports reflect it
  await page.getByRole('button', { name: /^Reports/ }).click();
  await expect(page.getByTestId('cost-table')).toContainText('Test Cake');
  await expect(page.getByText('1 wired + 1 spare').first()).toBeVisible();

  // Print buttons render the print view and call window.print
  await page.getByRole('button', { name: '🖨 Worksheet PDF' }).click();
  await page.waitForFunction(() => (window as unknown as { __printed: number }).__printed === 1);
  await expect(page.locator('.print-root')).toContainText('Setup worksheet');
  const sheet = page.locator('.print-root');
  // Supplies come from the inventory; one not needed for this show is left off
  await expect(sheet).toContainText('Fuse tape3 (buy 2)');
  await expect(sheet).toContainText('Fuse cutter');
  await expect(sheet).not.toContainText('Sandbags');
  await expect(sheet).toContainText('Board 1: 3 ft wide × 18 in deep · holds Test Cake');
  await expect(sheet.getByTestId('position-layout')).toHaveCount(1);
  await expect(sheet.getByTestId('position-layout')).toContainText('Board 1');
  await expect(sheet.getByTestId('position-layout')).toContainText('Test Cake');
  await expect(sheet).toContainText('Operators are wearing PPE');
  await expect(sheet).toContainText('Operator designated for firewatch');

  // Autosave survives a reload
  await page.reload();
  await page.getByRole('button', { name: 'Inventory', exact: true }).click();
  await expect(page.getByRole('cell', { name: /^Test Cake/ })).toBeVisible();

  expect(errors).toEqual([]);
});
