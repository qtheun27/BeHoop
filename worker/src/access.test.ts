import { describe, it, expect } from 'vitest';
import { signCookie, verifyCookie, canAccess, readCookie } from './access';

describe('accès médias', () => {
  const c = { uid: 'u1', teams: [51653], exp: Math.floor(Date.now() / 1000) + 6 * 3600 };
  it('cookie signé valide / falsifié / expiré', async () => {
    const v = await signCookie(c, 'secret');
    expect(await verifyCookie(v, 'secret')).toEqual(c);
    expect(await verifyCookie(v, 'autre')).toBeNull();
    expect(await verifyCookie(v.replace(/^./, 'x'), 'secret')).toBeNull();
    expect(await verifyCookie(v, 'secret', Date.now() + 7 * 3600e3)).toBeNull();
  });
  it('règles par préfixe', () => {
    expect(canAccess('videos/team-51653/abc/v1/master.m3u8', c)).toBe(true);
    expect(canAccess('videos/team-99/abc/v1/master.m3u8', c)).toBe(false); // non membre de l'Équipe 🔒
    expect(canAccess('videos/public/abc/v1/master.m3u8', c)).toBe(true);
    // vidéo d'explication perso : seulement son propriétaire
    expect(canAccess(`clips/${c.uid}/abc123.mp4`, c)).toBe(true);
    expect(canAccess('clips/quelquunautre/abc123.mp4', c)).toBe(false);
    expect(canAccess(`clips/${c.uid}/abc123.mp4`, null)).toBe(false);
    expect(canAccess('videos/public/abc/v1/master.m3u8', null)).toBe(false);
    expect(canAccess('logos/1.png', null)).toBe(true);
    expect(canAccess('rushes/abc/x.mov', c)).toBe(false);
    expect(canAccess('videos/team-51653/../../rushes/x', c)).toBe(false);
  });
  it('lecture du cookie', () => expect(readCookie('a=1; bh_media=xyz.abc; b=2')).toBe('xyz.abc'));
});
