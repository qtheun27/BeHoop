// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';

vi.mock('idb', () => ({ openDB: () => new Promise(() => {}) }));
vi.mock('../../web/src/lib/api', () => ({ api: vi.fn() }));
(globalThis as any).document = { addEventListener: () => {}, visibilityState: 'visible' };
Object.defineProperty(globalThis, 'navigator', { value: { onLine: true }, configurable: true });
(globalThis as any).window = { addEventListener: () => {} };

/** Faux XHR : la 1re requête reste figée (aucun octet, aucune erreur), la 2e réussit */
let n = 0;
class FakeXHR {
  upload: { onprogress?: (e: { loaded: number }) => void } = {};
  onload?: () => void; onerror?: () => void; onabort?: () => void; status = 0;
  open() {}
  getResponseHeader() { return '"etag-ok"'; }
  abort() { this.onabort?.(); }
  send() { if (++n === 1) return; setTimeout(() => { this.upload.onprogress?.({ loaded: 5 }); this.status = 200; this.onload?.(); }, 10); }
}
(globalThis as any).XMLHttpRequest = FakeXHR;

describe('envoi : connexion figée', () => {
  it('coupe après 45 s sans mouvement et réessaie', async () => {
    vi.useFakeTimers();
    const { putWithRetry } = await import('../../web/src/lib/upload');
    const bytes: number[] = [];
    const p = putWithRetry('https://r2/x', new Blob(['hello']), undefined, (b) => bytes.push(b));
    await vi.advanceTimersByTimeAsync(46_000); // figé → abandon
    await vi.advanceTimersByTimeAsync(2_000);  // attente avant nouvel essai, puis succès
    await expect(p).resolves.toBe('etag-ok');
    expect(n).toBe(2);
    expect(bytes).toContain(5);
    vi.useRealTimers();
  });
});
