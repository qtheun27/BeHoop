// Capture fixe des 5 planches du match test (t = fin d'animation) pour comparaison avec docs/planches/*.png
import { chromium } from '@playwright/test';
const base = process.argv[2] ?? 'http://localhost:5173';
const out = process.argv[3] ?? 'out/compare';
const types = ['pre', 'q1', 'q2', 'q3', 'fin'];
const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: 1920, height: 1080 } });
for (const t of types) {
  await p.goto(`${base}/app/render/planche.html?demo=1&type=${t}`);
  await p.evaluate(() => window.plancheReady);
  await p.evaluate((d) => window.setT(d), 10);
  await p.screenshot({ path: `${out}/${t}.png` });
}
await b.close();
console.log('ok');
