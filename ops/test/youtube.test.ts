import { describe, expect, it } from 'vitest';
import { parseYoutube, parseChannelPage, ageSeconds } from '../news';

const xml = `<feed><entry><yt:videoId>abc123XYZ_-</yt:videoId><title>Belgian Cats &amp; Lions</title><link rel="alternate" href="https://www.youtube.com/shorts/abc123XYZ_-"/><published>2026-10-24T10:00:00+00:00</published><media:group><media:description>basket</media:description></media:group></entry>
<entry><yt:videoId>zzz</yt:videoId><title>Météo</title><link rel="alternate" href="https://www.youtube.com/watch?v=zzz"/><published>2026-10-24T09:00:00+00:00</published><media:description>pluie</media:description></entry></feed>`;

describe('vidéos YouTube', () => {
  it('lit le flux, repère les shorts et filtre les chaînes généralistes', () => {
    expect(parseYoutube(xml, { name: 'BB', id: 'x', cat: 'belgique', lang: 'fr' }).map((v) => [v.id, v.title, v.short])).toEqual([['abc123XYZ_-', 'Belgian Cats & Lions', true], ['zzz', 'Météo', false]]);
    expect(parseYoutube(xml, { name: 'TéléMB', id: 'x', cat: 'regional', lang: 'fr', keep: /basket/i }).map((v) => v.id)).toEqual(['abc123XYZ_-']);
  });
});

describe('page de chaîne (quand le flux RSS est refusé)', () => {
  const lock = (id: string, title: string, ago: string) => ({ lockupViewModel: { contentId: id, metadata: { lockupMetadataViewModel: { title: { content: title },
    metadata: { contentMetadataViewModel: { metadataRows: [{ metadataParts: [{ text: { content: '243' }, accessibilityLabel: '243 views' }, { text: { content: ago }, accessibilityLabel: ago }] }] } } } } } });
  const html = (items: unknown[]) => `<script>var ytInitialData = ${JSON.stringify({ contents: { items } })};</script>`;
  const now = Date.parse('2026-11-06T12:00:00Z');
  it('lit identifiant, titre et date (« il y a 8 heures », « 2 days ago », « 3 dagen geleden »)', () => {
    const v = parseChannelPage(html([lock('a1', 'Spirou - Rotterdam', 'il y a 8 heures'), lock('b2', 'Highlights', '2 days ago'), lock('c3', 'Samenvatting', '3 dagen geleden')]), { name: 'X', id: 'x', cat: 'belgique', lang: 'fr' }, now);
    expect(v.map((x) => [x.id, x.title, x.date])).toEqual([['a1', 'Spirou - Rotterdam', '2026-11-06T04:00:00.000Z'], ['b2', 'Highlights', '2026-11-04T12:00:00.000Z'], ['c3', 'Samenvatting', '2026-11-03T12:00:00.000Z']]);
  });
  it('filtre des chaînes multisports', () => {
    const v = parseChannelPage(html([lock('a1', 'Boxe : le combat de l’année', 'il y a 1 jour'), lock('b2', 'Basket : Mons gagne', 'il y a 1 jour')]), { name: 'TéléMB', id: 'x', cat: 'regional', lang: 'fr', keep: /basket/i }, now);
    expect(v.map((x) => x.id)).toEqual(['b2']);
  });
  it('âges', () => {
    expect(ageSeconds('il y a 1\u00a0h')).toBe(3600); expect(ageSeconds('1 uur geleden')).toBe(3600); expect(ageSeconds('5 weeks ago')).toBe(5 * 604800); expect(ageSeconds('243 views')).toBeNull();
  });
});
