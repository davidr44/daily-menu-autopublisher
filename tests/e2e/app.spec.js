import { test, expect } from '@playwright/test';

const PIN = '1234';   // test PIN of the local server
const make = (page) => page.request.get('/__make').then((r) => r.json());

async function enterPin(page, pin = PIN) {
  for (const d of pin) await page.locator(`.pin-btn[data-k="${d}"]`).click();
}
async function unlock(page) {
  await page.goto('/');
  await enterPin(page);
  await expect(page.locator('#pinScreen')).toBeHidden();
}

test.beforeEach(async ({ page }) => {
  await page.request.get('/__make/reset');
});

test('wrong PIN is rejected; correct PIN unlocks without selecting a location', async ({ page }) => {
  await page.goto('/');
  await enterPin(page, '0000');
  await expect(page.locator('#pinErro')).toHaveText('PIN incorreto. Tenta de novo.');
  await expect(page.locator('#pinScreen')).toBeVisible();
  await page.waitForTimeout(1000);
  await enterPin(page);
  await expect(page.locator('#pinScreen')).toBeHidden();
  await expect(page.getByRole('heading', { name: 'De onde é a ementa?' })).toBeVisible();
  await expect(page.locator('.local.on')).toHaveCount(0);
  await expect(page.locator('#btnMain')).toBeDisabled();
});

test('full flow: Make receives exactly the menu that was picked', async ({ page }) => {
  await unlock(page);
  await page.locator('#btnO').click();
  await page.locator('#btnMain').click();                       // Next: soups
  await expect(page.locator('#sopasTiles .tile.on')).toHaveText(['Canja']);   // Canja is preselected
  await page.locator('#sopasTiles .tile[data-v="Juliana"]').click();
  await page.locator('#btnMain').click();                       // Next: dishes
  await page.locator('#pratosTiles .tile[data-v="Bacalhau com natas"]').click();
  await page.locator('#pratosTiles .tile[data-v="Cozido à portuguesa"]').click();
  await page.locator('#btnMain').click();                       // Review
  await expect(page.locator('#receipt')).toContainText('Odivelas');
  await page.locator('#btnMain').click();                       // Publish
  await expect(page.locator('#sheetTxt')).toHaveText('A ementa de Odivelas vai ser publicada no Instagram e no Facebook.');
  await page.locator('#btnConfirm').click();                    // Confirm

  await expect(page.locator('.stamp')).toContainText('ENVIADA');
  expect(await make(page)).toEqual([
    { local: 'Odivelas', sopas: ['Canja', 'Juliana'], pratos: ['Bacalhau com natas', 'Cozido à portuguesa'] },
  ]);
  // back to the start, ready for the next one
  await expect(page.getByRole('heading', { name: 'De onde é a ementa?' })).toBeVisible({ timeout: 6000 });
  await expect(page.locator('#sopasTiles .tile.on')).toHaveText(['Canja']);
});

test('at most 2 soups', async ({ page }) => {
  await unlock(page);
  await page.locator('#btnI').click();
  await page.locator('#btnMain').click();
  await page.locator('#sopasTiles .tile[data-v="Juliana"]').click();
  await page.locator('#sopasTiles .tile[data-v="Portuguesa"]').click();
  await expect(page.locator('#toast')).toHaveText('Máximo 2 sopas. Tira uma para escolher outra.');
  await expect(page.locator('#sopasTiles .tile.on')).toHaveCount(2);
});

test('search: finds dishes, adds a new one and deletes it', async ({ page }) => {
  await unlock(page);
  await page.locator('#btnI').click();
  await page.locator('#btnMain').click();
  await page.locator('#btnMain').click();
  await page.locator('.step.active .search-btn').click();
  await page.locator('#pkSearch').fill('polvo');
  await expect(page.locator('#pkList .all-row:not(.add)')).toHaveCount(3);
  await page.locator('#pkSearch').fill('Bifanas no pão');
  await page.locator('#pkList .all-row.add').click();
  await expect(page.locator('#toast')).toHaveText('“Bifanas no pão” adicionado à lista');
  await page.locator('#pkSearch').fill('bifanas');
  const added = page.locator('#pkList .all-row.meu');
  await added.locator('.del').click();
  await expect(added.locator('.del')).toHaveText('Apagar?');
  await added.locator('.del').click();
  await expect(page.locator('#pkList .all-row.meu')).toHaveCount(0);
  await page.locator('#pkDone').click();
  await expect(page.locator('#pratosTiles .tile[data-v="Bifanas no pão"]')).toHaveCount(0);
});

test('draft: restored after closing mid-way; starts fresh after 15 minutes', async ({ page }) => {
  await unlock(page);
  await page.locator('#btnI').click();
  await page.locator('#btnMain').click();
  await page.locator('#btnMain').click();
  await page.locator('#pratosTiles .tile[data-v="Empadão"]').click();
  await page.reload();
  await enterPin(page);
  await expect(page.getByRole('heading', { name: 'Que pratos há hoje?' })).toBeVisible();
  await expect(page.locator('#pratosTiles .tile.on')).toHaveText(['Empadão']);
  await expect(page.locator('#localPillTxt')).toHaveText('Infantado');

  // older than 15 minutes: start fresh
  await page.evaluate(() => {
    const r = JSON.parse(localStorage.getItem('sr_rascunho'));
    r.quando -= 16 * 60 * 1000;
    localStorage.setItem('sr_rascunho', JSON.stringify(r));
  });
  await page.reload();
  await enterPin(page);
  await expect(page.getByRole('heading', { name: 'De onde é a ementa?' })).toBeVisible();
});

test('if Make fails, the app warns and keeps the menu', async ({ page }) => {
  await page.request.get('/__make/fail?v=1');
  await unlock(page);
  await page.locator('#btnI').click();
  await page.locator('#btnMain').click();
  await page.locator('#btnMain').click();
  await page.locator('#pratosTiles .tile[data-v="Empadão"]').click();
  await page.locator('#btnMain').click();
  await page.locator('#btnMain').click();
  await page.locator('#btnConfirm').click();
  await expect(page.locator('#toast')).toHaveText('Não foi possível enviar. Verifica a internet e tenta de novo.');
  await expect(page.locator('#btnMain')).toHaveText('Publicar ementa');
  await expect(page.locator('#receipt')).toContainText('Empadão');
  expect(await make(page)).toEqual([]);
});

test('the page contains no secrets', async ({ page }) => {
  const html = await (await page.request.get('/')).text();
  expect(html).not.toMatch(/hook\.[a-z0-9-]+\.make\.com/i);
  expect(html).not.toMatch(/PINS_VALIDOS/);
});
