import { test, expect } from '@playwright/test';

const PIN = '1234';   // PIN de teste do servidor local
const make = (page) => page.request.get('/__make').then((r) => r.json());

async function entrar(page, pin = PIN) {
  for (const d of pin) await page.locator(`.pin-btn[data-k="${d}"]`).click();
}
async function abrir(page) {
  await page.goto('/');
  await entrar(page);
  await expect(page.locator('#pinScreen')).toBeHidden();
}

test.beforeEach(async ({ page }) => {
  await page.request.get('/__make/limpar');
});

test('PIN errado não entra; PIN certo entra e não escolhe local sozinho', async ({ page }) => {
  await page.goto('/');
  await entrar(page, '0000');
  await expect(page.locator('#pinErro')).toHaveText('PIN incorreto. Tenta de novo.');
  await expect(page.locator('#pinScreen')).toBeVisible();
  await page.waitForTimeout(1000);
  await entrar(page);
  await expect(page.locator('#pinScreen')).toBeHidden();
  await expect(page.getByRole('heading', { name: 'De onde é a ementa?' })).toBeVisible();
  await expect(page.locator('.local.on')).toHaveCount(0);
  await expect(page.locator('#btnMain')).toBeDisabled();
});

test('fluxo completo: o Make recebe exatamente a ementa escolhida', async ({ page }) => {
  await abrir(page);
  await page.locator('#btnO').click();
  await page.locator('#btnMain').click();                       // Seguinte: sopas
  await expect(page.locator('#sopasTiles .tile.on')).toHaveText(['Canja']);   // a Canja vem marcada
  await page.locator('#sopasTiles .tile[data-v="Juliana"]').click();
  await page.locator('#btnMain').click();                       // Seguinte: pratos
  await page.locator('#pratosTiles .tile[data-v="Bacalhau com natas"]').click();
  await page.locator('#pratosTiles .tile[data-v="Cozido à portuguesa"]').click();
  await page.locator('#btnMain').click();                       // Rever ementa
  await expect(page.locator('#receipt')).toContainText('Odivelas');
  await page.locator('#btnMain').click();                       // Publicar ementa
  await expect(page.locator('#sheetTxt')).toHaveText('A ementa de Odivelas vai ser publicada no Instagram e no Facebook.');
  await page.locator('#btnConfirm').click();                    // Sim, publicar

  await expect(page.locator('.stamp')).toContainText('ENVIADA');
  expect(await make(page)).toEqual([
    { local: 'Odivelas', sopas: ['Canja', 'Juliana'], pratos: ['Bacalhau com natas', 'Cozido à portuguesa'] },
  ]);
  // volta ao início, pronta para a próxima
  await expect(page.getByRole('heading', { name: 'De onde é a ementa?' })).toBeVisible({ timeout: 6000 });
  await expect(page.locator('#sopasTiles .tile.on')).toHaveText(['Canja']);
});

test('no máximo 2 sopas', async ({ page }) => {
  await abrir(page);
  await page.locator('#btnI').click();
  await page.locator('#btnMain').click();
  await page.locator('#sopasTiles .tile[data-v="Juliana"]').click();
  await page.locator('#sopasTiles .tile[data-v="Portuguesa"]').click();
  await expect(page.locator('#toast')).toHaveText('Máximo 2 sopas. Tira uma para escolher outra.');
  await expect(page.locator('#sopasTiles .tile.on')).toHaveCount(2);
});

test('pesquisa: encontra, adiciona um prato novo e apaga-o', async ({ page }) => {
  await abrir(page);
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
  const novo = page.locator('#pkList .all-row.meu');
  await novo.locator('.del').click();
  await expect(novo.locator('.del')).toHaveText('Apagar?');
  await novo.locator('.del').click();
  await expect(page.locator('#pkList .all-row.meu')).toHaveCount(0);
  await page.locator('#pkDone').click();
  await expect(page.locator('#pratosTiles .tile[data-v="Bifanas no pão"]')).toHaveCount(0);
});

test('rascunho: se a app fechar a meio volta tudo; passados 15 minutos começa do zero', async ({ page }) => {
  await abrir(page);
  await page.locator('#btnI').click();
  await page.locator('#btnMain').click();
  await page.locator('#btnMain').click();
  await page.locator('#pratosTiles .tile[data-v="Empadão"]').click();
  await page.reload();
  await entrar(page);
  await expect(page.getByRole('heading', { name: 'Que pratos há hoje?' })).toBeVisible();
  await expect(page.locator('#pratosTiles .tile.on')).toHaveText(['Empadão']);
  await expect(page.locator('#localPillTxt')).toHaveText('Infantado');

  // com mais de 15 minutos, começa do zero
  await page.evaluate(() => {
    const r = JSON.parse(localStorage.getItem('sr_rascunho'));
    r.quando -= 16 * 60 * 1000;
    localStorage.setItem('sr_rascunho', JSON.stringify(r));
  });
  await page.reload();
  await entrar(page);
  await expect(page.getByRole('heading', { name: 'De onde é a ementa?' })).toBeVisible();
});

test('se o Make falhar, avisa e não perde a ementa', async ({ page }) => {
  await page.request.get('/__make/falhar?v=1');
  await abrir(page);
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

test('a app não tem segredos no código', async ({ page }) => {
  const html = await (await page.request.get('/')).text();
  expect(html).not.toMatch(/hook\.[a-z0-9-]+\.make\.com/i);
  expect(html).not.toMatch(/PINS_VALIDOS/);
});
