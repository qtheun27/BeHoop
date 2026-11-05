"""
Copie locale des logos de clubs (lancé par update.yml après le scraper, qui n'est pas modifié).
- logos/<id>.webp : logo réduit à 256 px, servi par behoop.be (un fichier supprimé chez l'AWBB ne casse plus l'affichage) ;
- logos/overrides/<id>.(png|jpg|webp) : logo de secours, utilisé seulement si l'officiel est introuvable ;
- si le téléchargement échoue, la copie précédente est conservée.
"""
import io, json, os, sys
from concurrent.futures import ThreadPoolExecutor
import requests
from PIL import Image

Image.MAX_IMAGE_PIXELS = None
ROOT = sys.argv[1] if len(sys.argv) > 1 else '.'
OUT = os.path.join(ROOT, 'logos')
os.makedirs(OUT, exist_ok=True)

def harmonize(im):
    """Logo prêt pour un disque rond : fond uni retiré (depuis les bords), recadrage, centrage optique, marge identique."""
    from PIL import ImageDraw
    im = im.convert('RGBA')
    im.thumbnail((600, 600))
    def close(a, b, t=38):
        return abs(a[0] - b[0]) + abs(a[1] - b[1]) + abs(a[2] - b[2]) <= t * 3 and abs(a[3] - b[3]) < 60
    # Fond uni (blanc ou coloré) : les coins opaques se ressemblent → on l'efface par remplissage depuis les bords.
    # Deux passes : une marge blanche peut entourer un fond coloré (ex. carré jaune d'Oostende).
    for _ in range(2):
        w, h = im.size
        px = im.load()
        k = max(2, min(w, h) // 20)   # un peu à l'intérieur : coins arrondis
        corners = [px[k, k], px[w - 1 - k, k], px[k, h - 1 - k], px[w - 1 - k, h - 1 - k]]
        opaque = [c for c in corners if c[3] > 200]
        if not (len(opaque) >= 3 and all(close(opaque[0], c) for c in opaque)): break
        bgc = opaque[0]
        if not all(ch > 225 for ch in bgc[:3]):
            # Fond coloré (ex. carré jaune d'Oostende) : il fait partie de l'identité → DISQUE de cette couleur (et non un carré,
            # qui se voyait dans les ronds blancs de l'appli), logo entier à l'intérieur du cercle
            S = 256
            lw, lh = im.size
            k2 = min(0.86 * S / ((lw * lw + lh * lh) ** 0.5), 0.70 * S / max(lw, lh))
            im = im.resize((max(1, round(lw * k2)), max(1, round(lh * k2))), Image.LANCZOS)
            out = Image.new('RGBA', (S, S), (0, 0, 0, 0))
            ImageDraw.Draw(out).ellipse((0, 0, S - 1, S - 1), fill=(bgc[0], bgc[1], bgc[2], 255))
            out.paste(im, ((S - im.size[0]) // 2, (S - im.size[1]) // 2), im)
            return out
        seeds = [(x, 0) for x in range(0, w, max(1, w // 40))] + [(x, h - 1) for x in range(0, w, max(1, w // 40))] + \
                [(0, y) for y in range(0, h, max(1, h // 40))] + [(w - 1, y) for y in range(0, h, max(1, h // 40))]
        for sx, sy in seeds:
            if px[sx, sy][3] > 0 and close(px[sx, sy], opaque[0]):
                ImageDraw.floodfill(im, (sx, sy), (0, 0, 0, 0), thresh=60)
        # le fond peut ne commencer qu'après des coins arrondis transparents : on remplit aussi depuis les points de contrôle
        for sx, sy in [(k, k), (w - 1 - k, k), (k, h - 1 - k), (w - 1 - k, h - 1 - k)]:
            if px[sx, sy][3] > 0 and close(px[sx, sy], opaque[0]):
                ImageDraw.floodfill(im, (sx, sy), (0, 0, 0, 0), thresh=60)
        b2 = im.getchannel('A').point(lambda a: 255 if a > 16 else 0).getbbox()
        if not b2: return None
        im = im.crop(b2)
    alpha = im.getchannel('A').point(lambda a: 255 if a > 16 else 0)
    box = alpha.getbbox()
    if not box: return None
    im = im.crop(box); alpha = alpha.crop(box)
    w, h = im.size
    # Centre du cadre du logo (centrage géométrique) : le centre de masse décalait les logos asymétriques
    # (ex. Montagnard, dont la main à droite tirait tout le logo vers la droite)
    cx, cy = w / 2, h / 2
    S = 256; scale = (0.93 * S) / ((w * w + h * h) ** 0.5)      # le logo tient dans le cercle
    scale = min(scale, 0.80 * S / max(w, h))                     # et ne paraît pas énorme quand il est rond
    im = im.resize((max(1, round(w * scale)), max(1, round(h * scale))), Image.LANCZOS)
    out = Image.new('RGBA', (S, S), (0, 0, 0, 0))
    out.paste(im, (round(S / 2 - cx * scale), round(S / 2 - cy * scale)), im)
    return out

def small(full, dest):
    """Petite version (96 px, ~3 Ko) pour les logos affichés petits (listes, bandeau des résultats) : logos/s/{id}.webp"""
    d = os.path.join(os.path.dirname(dest), 's'); os.makedirs(d, exist_ok=True)
    full.resize((96, 96), Image.LANCZOS).save(os.path.join(d, os.path.basename(dest)), 'WEBP', quality=90, method=6)

def save(img_bytes, dest):
    im = Image.open(io.BytesIO(img_bytes))
    h = harmonize(im)
    full = h or im.convert('RGBA')
    full.save(dest, 'WEBP', quality=88, method=6)
    small(full if full.size == (256, 256) else full.resize((256, 256), Image.LANCZOS), dest)

def one(club):
    """Logo officiel retéléchargé à chaque passage (suit les changements des clubs) ;
    logo de remplacement seulement si l'officiel est introuvable ; sinon la dernière bonne copie est gardée."""
    cid, url = club
    if url and url.startswith('/'): return 'local'   # déjà servi par behoop.be (drapeaux des sélections…)
    dest = os.path.join(OUT, f'{cid}.webp')
    if url:
        try:
            r = requests.get(url, timeout=30, headers={'User-Agent': 'BeHoop/1.0 (+https://behoop.be)'})
            if r.status_code == 200 and len(r.content) <= 15_000_000:
                save(r.content, dest); return 'ok'
        except Exception:
            pass
    for ext in ('png', 'jpg', 'jpeg', 'webp'):
        o = os.path.join(OUT, 'overrides', f'{cid}.{ext}')
        if os.path.exists(o):
            save(open(o, 'rb').read(), dest); return 'remplacé'
    return 'gardé' if os.path.exists(dest) else ('aucun' if not url else 'absent')

clubs = [(c['id'], c.get('logo_url')) for c in json.load(open(os.path.join(ROOT, 'data.json')))['clubs']]
vbl = os.path.join(ROOT, 'vbl.json')
if os.path.exists(vbl):
    v = json.load(open(vbl))
    clubs += [(c['id'], c.get('logo')) for c in v['clubs'] + v.get('national', [])]
pro = os.path.join(ROOT, 'pro.json')
if os.path.exists(pro):
    clubs += [(c['id'], c.get('logo')) for c in json.load(open(pro))['clubs']]
with ThreadPoolExecutor(12) as ex:
    res = list(ex.map(one, clubs))
print('logos :', {k: res.count(k) for k in set(res)})
