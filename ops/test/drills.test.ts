import { describe, expect, it } from 'vitest';
import { DRILLS } from '../../web/src/drills/library';
import { TACTICS } from '../../web/src/drills/tactics';
import { AGES, THEMES, CATS } from '../../web/src/drills/types';

describe('bibliothèque d’exercices collectifs', () => {
  it('ids uniques, âges cohérents, contenu complet', () => {
    expect(new Set(DRILLS.map((d) => d.id)).size).toBe(DRILLS.length);
    for (const d of DRILLS) {
      expect(THEMES).toContain(d.theme);
      expect(AGES.indexOf(d.minAge)).toBeLessThanOrEqual(AGES.indexOf(d.maxAge));
      expect(d.min).toBeGreaterThan(0);
      expect(d.steps.length && d.points.length && d.goal && d.setup).toBeTruthy();
    }
  });
  it('chaque catégorie d’âge a de quoi remplir une séance dans chaque grand thème', () => {
    for (const a of AGES) {
      const i = AGES.indexOf(a);
      const ok = DRILLS.filter((d) => AGES.indexOf(d.minAge) <= i && i <= AGES.indexOf(d.maxAge));
      for (const th of ['echauffement', 'dribble', 'passe', 'tir', 'finition', 'collectif', 'retour'] as const) expect(ok.some((d) => d.theme === th), `${a} ${th}`).toBe(true);
    }
  });
});

describe('bibliothèque de tactiques', () => {
  it('ids uniques, catégories connues, étapes sur le terrain', () => {
    expect(new Set(TACTICS.map((x) => x.id)).size).toBe(TACTICS.length);
    for (const x of TACTICS) {
      expect(CATS).toContain(x.cat);
      expect(x.frames.length).toBeGreaterThanOrEqual(2);
      const h = x.mode === 'full' ? 890 : 470;
      const ids = x.frames[0].tokens.map((k) => k.id).join();
      for (const f of x.frames) {
        expect(f.t).toBeTruthy();
        // mêmes joueurs d'une étape à l'autre (l'animation déplace les jetons)
        expect(f.tokens.map((k) => k.id).join(), `${x.id} : ${f.t}`).toBe(ids);
        for (const k of f.tokens) { expect(k.x).toBeGreaterThanOrEqual(0); expect(k.x).toBeLessThanOrEqual(500); expect(k.y).toBeGreaterThanOrEqual(0); expect(k.y).toBeLessThanOrEqual(h); }
      }
    }
  });
});
