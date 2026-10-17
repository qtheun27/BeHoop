import { test, expect, type Page } from '@playwright/test';
import users from '../../ops/fixtures/demo-users.json' with { type: 'json' };

async function login(page: Page, who: 'responsable' | 'parent' | 'visiteur') {
  await page.goto('/app/#/profil');
  await page.getByRole('button', { name: 'Se connecter ou créer un compte' }).click();
  await page.getByRole('button', { name: 'Mot de passe' }).click();
  await page.getByLabel('E-mail').fill(users[who].email);
  await page.getByLabel('Mot de passe').fill(users[who].password);
  await page.getByRole('button', { name: 'Se connecter', exact: true }).click();
  await expect(page.getByText(users[who].name).first()).toBeVisible();
}

test('sans compte : Explorer fonctionne et invite à créer un compte', async ({ page }) => {
  await page.goto('/app/#/explorer');
  await page.getByLabel('Rechercher un club').fill('AMLL');
  await expect(page.getByRole('link', { name: /BC AMLL/ })).toBeVisible();
  await expect(page.getByText('Crée ton compte')).toBeVisible();
  await page.goto('/app/#/fil');
  await expect(page.getByRole('button', { name: 'Créer mon compte' })).toBeVisible();
});

test('parent membre : carte de score, photos 🔒 et vidéo du match', async ({ page }) => {
  await login(page, 'parent');
  await page.goto('/app/#/fil');
  await expect(page.locator('.scorecard').first()).toContainText('94');
  await expect(page.getByText('Quelques photos du match de samedi')).toBeVisible();
  await expect(page.getByText('🔒 Équipe').first()).toBeVisible();
  // réaction optimiste
  const r = page.getByRole('button', { name: 'Réagir 🔥' }).first();
  await r.click();
  await expect(r).toHaveAttribute('aria-pressed', 'true');
  await page.goto('/app/#/video/demo');
  await expect(page.getByRole('button', { name: /Q2/ })).toBeVisible(); // chapitres cliquables
});

test('visiteur non membre : ni photos 🔒 ni vidéo Jeunes', async ({ page }) => {
  await login(page, 'visiteur');
  await page.goto('/app/#/fil');
  await expect(page.locator('.scorecard').first()).toContainText('94');
  await expect(page.getByText('Quelques photos du match de samedi')).toHaveCount(0);
  await page.goto('/app/#/video/demo');
  await expect(page.getByText(/réservée aux membres/)).toBeVisible();
});

test('planche de rendu du match test', async ({ page }) => {
  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.goto('/app/render/planche.html?demo=1&type=fin&t=8');
  await expect(page.getByText('Score final')).toBeVisible();
  await expect(page.getByText("Victoire de l'Union Mons Hainaut")).toBeVisible();
});
