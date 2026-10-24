import { describe, expect, it } from 'vitest';
import { parseYoutube } from '../news';

const xml = `<feed><entry><yt:videoId>abc123XYZ_-</yt:videoId><title>Belgian Cats &amp; Lions</title><link rel="alternate" href="https://www.youtube.com/shorts/abc123XYZ_-"/><published>2026-10-24T10:00:00+00:00</published><media:group><media:description>basket</media:description></media:group></entry>
<entry><yt:videoId>zzz</yt:videoId><title>Météo</title><link rel="alternate" href="https://www.youtube.com/watch?v=zzz"/><published>2026-10-24T09:00:00+00:00</published><media:description>pluie</media:description></entry></feed>`;

describe('vidéos YouTube', () => {
  it('lit le flux, repère les shorts et filtre les chaînes généralistes', () => {
    expect(parseYoutube(xml, { name: 'BB', id: 'x', cat: 'belgique' }).map((v) => [v.id, v.title, v.short])).toEqual([['abc123XYZ_-', 'Belgian Cats & Lions', true], ['zzz', 'Météo', false]]);
    expect(parseYoutube(xml, { name: 'TéléMB', id: 'x', cat: 'regional', keep: /basket/i }).map((v) => v.id)).toEqual(['abc123XYZ_-']);
  });
});
