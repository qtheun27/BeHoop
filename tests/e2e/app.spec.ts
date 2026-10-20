import { test, expect, type Page } from '@playwright/test';
import users from '../../ops/fixtures/demo-users.json' with { type: 'json' };

async function login(page: Page, who: 'responsable' | 'parent' | 'visiteur') {
  await page.goto('/app/#/profil');
  await page.getByRole('button', { name: 'Se connecter ou créer un compte' }).click();
  await page.getByRole('button', { name: 'Mot de passe' }).click();
  await page.getByLabel('E-mail').fill(users[who].email);
  await page.getByLabel('Mot de passe').fill(users[who].password);
  await page.getByRole('button', { name: 'Se connecter', exact: true }).click();
  // Après connexion depuis Profil : direction le fil
  await expect(page).toHaveURL(/#\/fil$/);
  await expect(page.getByRole('link', { name: 'Mon profil' })).toBeVisible();
}

test('sans compte : Explorer fonctionne et invite à créer un compte', async ({ page }) => {
  await page.goto('/app/#/explorer');
  await page.getByLabel('Rechercher', { exact: true }).fill('AMLL');
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
  await expect(page.locator('.lock', { hasText: 'Équipe' }).first()).toBeVisible();
  // réaction optimiste
  const r = page.getByRole('button', { name: 'Réagir 🔥' }).first();
  await r.click();
  await expect(r).toHaveAttribute('aria-pressed', 'true');
  await page.goto('/app/#/video/demo');
  await expect(page.getByRole('button', { name: /Q2/ })).toBeVisible(); // chapitres cliquables
});

test('commentaires : un compte commente une actu, le compteur suit', async ({ page }) => {
  await login(page, 'visiteur');
  await page.goto('/app/#/actus');
  const card = page.locator('article.card.news').first();
  await card.getByRole('button', { name: 'Commentaires' }).click();
  await page.getByLabel('Ton commentaire…').fill('Belle victoire !');
  await page.getByRole('button', { name: 'Envoyer' }).click();
  await expect(page.getByText('Belle victoire !')).toBeVisible();
  await page.reload();
  await expect(page.locator('article.card.news').first().getByRole('button', { name: 'Commentaires' })).toContainText('1');
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

test.describe('langues', () => {
  test.use({ locale: 'nl-BE' });
  test('téléphone en néerlandais : appli en néerlandais, puis anglais depuis l’en-tête', async ({ page }) => {
    await page.goto('/app/#/fil');
    await expect(page.getByRole('button', { name: 'Mijn account aanmaken' })).toBeVisible();
    await page.getByLabel('Taal').selectOption('en');
    await expect(page.getByRole('button', { name: 'Create my account' })).toBeVisible();
    await page.reload();
    await expect(page.getByRole('button', { name: 'Create my account' })).toBeVisible(); // choix mémorisé
  });
});
