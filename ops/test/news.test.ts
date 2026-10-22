import { describe, it, expect } from 'vitest';
import { classify, pageImage, clubMatcher, isBasketNews, clubTagger, compTagger, isSpam, cleanImg, frameAllowed } from '../news';
import { detectLang } from '../news-lang';
describe('classement des actualités', () => {
  it.each([
    ['Droomaffiche voor Basket Willebroek: tweedeklasser krijgt in beker bezoek', 'belgique'],
    ['Belgian Cats komen op 12 november opnieuw in actie na het WK', 'international'],
    ['BNXT League : Louvain impose ses vues à Courtrai', 'belgique'],
    ['Pourquoi vous ne devez pas rater les Finales WNBA', 'nba'],
    ['Les Knicks sacrifient Bruce Brown pour garder James Wiseman', 'nba'],
    ['EuroBasket 2027 : la Belgique connaît ses adversaires', 'international'],
  ])('%s → %s', (t, c) => expect(classify(t, 'auto', 'Sporza')).toBe(c));
});

describe("image d'aperçu des articles", () => {
  it('lit og:image, quel que soit l’ordre des attributs', () => {
    expect(pageImage('<meta content="/img/a.jpg" property="og:image">', 'https://site.be/art/1')).toBe('https://site.be/img/a.jpg');
    expect(pageImage('<meta name="twitter:image" content="https://cdn.be/b.jpg?w=1&amp;h=2"/>', 'https://site.be')).toBe('https://cdn.be/b.jpg?w=1&h=2');
  });
  it('ignore les logos génériques du site', () => {
    expect(pageImage('<meta property="og:image" content="https://site.be/logoSeo.svg">', 'https://site.be')).toBeNull();
    expect(pageImage('<meta property="og:image" content="https://site.be/1638_sudinfo_opengraph.png">', 'https://site.be')).toBeNull();
  });
});

describe('actus régionales : uniquement le basket', () => {
  const hit = clubMatcher([{ name: 'Okapi Aalst', short: 'Okapi Aalst' }, { name: 'BC Pelt', short: 'Pelt' }]);
  const n = (title: string) => ({ title, excerpt: '', url: 'https://news.google.com/x' });
  it.each([
    ['Basket | Les U18 d’Orp Jauche font sensation', true],
    ['Okapi Aalst wint met 79-94 tegen Kangoeroes Mechelen', true],
    ['Noorderhart in Pelt investeert 26,7 miljoen euro', false],
    ['FOOT - P2B : Mesvin sort vainqueur du derby', false],
  ])('%s → %s', (t, ok) => expect(isBasketNews(n(t), hit)).toBe(ok));
});

describe('clubs cités par une actu', () => {
  const clubs = [
    { id: 1, name: 'Mons Basketball', short: 'Mons Basketball' }, { id: 2, name: 'CityX Mons', short: 'CityX Mons' },
    { id: 3, name: 'BC Mons Capitale', short: 'BC Mons Capitale' }, { id: 4, name: 'Wibac BBC Sint-Eloois-Winkel', short: 'Wibac BBC Sint-Eloois-Winkel' },
    { id: 5, name: 'Partena Professional Okapi Aalst', short: 'Okapi Aalst', teams: [{ id: 20000000557 }] },
    { id: 6, name: 'Partena Professional DBC Okapi Aalst', short: 'DBC Okapi Aalst', teams: [{ id: 1 }] },
  ];
  const tag = clubTagger(clubs);
  it.each([
    ['Le BC Mons-Capitale sort la copie parfaite à Haneffe', [3]],
    ['Mons Basket-ball est sur la bonne voie face à Estaimpuis', [1]],
    ['Du mieux pour CityX Mons face au champion', [2]],
    ['Antwerp wint in Mons: “Maar er is nog veel werk aan de winkel”', []],
    ['ZZ Leiden smeert Okapi Aalst eerste nederlaag aan', [5]],
  ])('%s → %j', (t, ids) => expect(tag(t as string).sort()).toEqual(ids));
});

describe('langue des actus', () => {
  it.each([
    ['Le BC Mons-Capitale sort la copie parfaite à Haneffe en Régionale 2 dames', 'fr'],
    ['Okapi Aalst wint met 79-94 tegen Kangoeroes Mechelen', 'nl'],
    ['KD fires back at Mat Ishbia for framing of Suns tenure', 'en'],
  ])('%s → %s', (t, l) => expect(detectLang(t)).toBe(l));
  it('sans mot courant : la langue du site', () => expect(detectLang('Antwerp Giants verpletteren Den Bosch: 86-125', 'https://www.hln.be/sport/x')).toBe('nl'));
});

describe('compétitions citées par une actu', () => {
  const tag = compTagger([{ id: 'bnxt', kw: ['bnxt'] }, { id: 'nba', kw: ['nba'] }, { id: 'beker-heren', kw: ['coupe de belgique', 'beker van belgië'] }, { id: 's1' }]);
  it.each([
    ['BNXT League : Louvain impose ses vues à Courtrai', ['bnxt']],
    ['Droomaffiche in de Beker van België voor Willebroek', ['beker-heren']],
    ['Wembanyama, la NBA à ses pieds', ['nba']],
    ['Le BC Hannut signe un mini-hold-up', []],
  ])('%s → %j', (t, ids) => expect(tag(t as string)).toEqual(ids));
});

describe('compTagger : compétitions au nom voisin', () => {
  const tag = compTagger([{ id: 'euroleague', kw: ['euroleague'], not: ['euroleague women'] }, { id: 'elw', kw: ['euroleague women'] }, { id: 'nba', kw: ['nba'], not: ['wnba'] }]);
  it('EuroLeague Women n’est pas l’EuroLeague', () => expect(tag('Castors Braine en EuroLeague Women')).toEqual(['elw']));
  it('les deux cités : les deux repérés', () => expect(tag('EuroLeague : le Real gagne ; en EuroLeague Women, Mechelen aussi')).toEqual(['euroleague', 'elw']));
  it('WNBA n’est pas la NBA', () => expect(tag('Finale WNBA : Atlanta égalise')).toEqual([]));
});

describe('spam et images', () => {
  it('écarte les faux streams, paris et casinos ; garde les vraies actus', () => {
    expect(isSpam({ title: '【LIVESTREAMS】FREE]Olympiacos Piraeus vs FC Barcelona Live Free Euroleague Basketball', source: 'Universidad de Córdoba (UCO)', url: 'https://news.google.com/x' })).toBe(true);
    expect(isSpam({ title: 'HERE’S!* WAY TO WATCH Hapoel Tel Aviv vs Panathinaikos LIVE STREAMS', source: 'X', url: 'https://x.y' })).toBe(true);
    expect(isSpam({ title: 'NBA – Portland en Camara verliezen laatste oefenduel', source: 'Golden Palace News', url: 'https://www.goldenpalacenews.be/nl/x' })).toBe(true);
    expect(isSpam({ title: 'Brussels vs BC Oostende scores & predictions', source: 'Sofascore', url: 'https://www.sofascore.com/x' })).toBe(true);
    expect(isSpam({ title: 'Mons Basket-ball est sur la bonne voie !', source: 'Sudinfo', url: 'https://www.sudinfo.be/x' })).toBe(false);
    expect(isSpam({ title: 'Les Spurs vont reprendre sans Tobias Harris', source: 'BasketUSA', url: 'https://www.basketusa.com/x' })).toBe(false);
    // Paris sportifs : retirés ; « pari » au sens figuré : gardé
    const u = { source: 'BasketUSA', url: 'https://www.basketusa.com/x' };
    for (const title of ['Pronostics NBA du 21 octobre : nos paris pour la soirée', 'Lakers – Warriors : paris joueurs, état des blessures et pronostic',
      'Code promo Unibet BASKET110 : Detroit à 1,93 pour Pistons-Celtics', 'Comment parier sur le basket ?', 'MMBets: the Mavericks are interesting', 'Les pronos de la rédac'])
      expect(isSpam({ title, ...u })).toBe(true);
    expect(isSpam({ title: 'Antwerp Giants pakken tweede zege', source: 'Circus Daily', url: 'https://x.y' })).toBe(true);
    expect(isSpam({ title: 'LeBron James aux Sixers, un dernier pari pour un nouveau titre', ...u })).toBe(false);
    expect(isSpam({ title: 'Ryan Conwell, le dernier pari du Heat', ...u })).toBe(false);
  });
  it('liens d’image : entités décodées (même deux fois), https', () => {
    expect(cleanImg('https://www.dhnet.be/resizer/v2/A.jpg?auth=1&amp;amp;smart=true&amp;width=1200')).toBe('https://www.dhnet.be/resizer/v2/A.jpg?auth=1&smart=true&width=1200');
    expect(cleanImg('//cdn.x/y.jpg')).toBe('https://cdn.x/y.jpg');
    expect(cleanImg('javascript:alert(1)')).toBeNull();
  });
  it('image de la page : JSON-LD et première grande image si pas d’og:image', () => {
    expect(pageImage('<script type="application/ld+json">{"image":{"@type":"ImageObject","url":"https://a.b/photo.jpg"}}</script>', 'https://a.b/')).toBe('https://a.b/photo.jpg');
    expect(pageImage('<article><img src="/logo.png"><img src="/uploads/2026/match.jpg"></article>', 'https://a.b/n/1')).toBe('https://a.b/uploads/2026/match.jpg');
  });
  it('lecteur intégré : on respecte toujours l’interdiction d’affichage dans un cadre', () => {
    expect(frameAllowed(200, null, null)).toBe(true);
    expect(frameAllowed(200, 'SAMEORIGIN', null)).toBe(false);
    expect(frameAllowed(200, 'DENY', null)).toBe(false);
    expect(frameAllowed(200, null, "default-src 'self'; frame-ancestors 'self' *.cbssports.com")).toBe(false);
    expect(frameAllowed(200, null, "frame-ancestors *")).toBe(true);
    expect(frameAllowed(200, null, "upgrade-insecure-requests")).toBe(true);
    expect(frameAllowed(403, null, null)).toBe(false); // vérification impossible : on n'affiche pas
  });
});
