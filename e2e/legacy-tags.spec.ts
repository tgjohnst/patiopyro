import { expect, test, type Page } from '@playwright/test';

const STORAGE_KEY = 'patiopyro:show';

/** The autosaved demo show, put back in the old format: colors listed as effects, no scenes. */
async function legacyShow(page: Page) {
  page.on('dialog', (d) => d.accept());
  await page.goto('/');
  await page.getByRole('button', { name: 'File ▾' }).click();
  await page.getByRole('button', { name: 'Load demo show' }).click();
  await expect(page.getByRole('row', { name: /^Night Owl/ })).toBeVisible();
  return page.evaluate((key) => {
    const stored = JSON.parse(localStorage.getItem(key)!);
    const toOld = (o: { effects: string[]; colors?: string[] }) => {
      o.effects = [...o.effects, ...(o.colors ?? []).filter((c) => c === 'Golden' || c === 'Neon')];
      delete o.colors;
    };
    for (const item of stored.state.show.catalog) {
      if (item.kind !== 'cake') continue;
      toOld(item);
      item.subCakes.forEach(toOld);
    }
    delete stored.state.show.scenes;
    return stored;
  }, STORAGE_KEY);
}

async function expectMigrated(page: Page) {
  const owl = page.getByRole('row', { name: /^Night Owl/ });
  await expect(owl.getByTestId('cake-effects')).toHaveText('Crackle');
  await expect(owl.getByTestId('cake-colors')).toHaveText('Golden');
  const golden = page.getByTestId('sub-row-Triple Threat Compound-3');
  await expect(golden).toContainText('Willow');
  await expect(golden).toContainText('Golden');
}

test('an old show file with Golden as an effect opens with it as a color', async ({ page }) => {
  const stored = await legacyShow(page);
  await page.evaluate(() => localStorage.clear());
  await page.reload();

  const chooser = page.waitForEvent('filechooser');
  await page.getByRole('button', { name: 'File ▾' }).click();
  await page.getByRole('button', { name: 'Open show file…' }).click();
  await (await chooser).setFiles({
    name: 'old-show.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(stored.state.show)),
  });
  await expectMigrated(page);
});

test('an old autosave with Golden as an effect restores with it as a color', async ({ page }) => {
  const stored = await legacyShow(page);
  // Write the old format before the app starts on reload, so the app can't autosave over it first.
  await page.addInitScript(
    ([key, value]) => {
      if (!sessionStorage.getItem('seeded')) {
        sessionStorage.setItem('seeded', '1');
        localStorage.setItem(key, value);
      }
    },
    [STORAGE_KEY, JSON.stringify(stored)],
  );
  await page.reload();
  await expectMigrated(page);
});
