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

def save(img_bytes, dest):
    im = Image.open(io.BytesIO(img_bytes)).convert('RGBA')
    im.thumbnail((256, 256))
    im.save(dest, 'WEBP', quality=86, method=6)

def one(club):
    """Logo officiel retéléchargé à chaque passage (suit les changements des clubs) ;
    logo de remplacement seulement si l'officiel est introuvable ; sinon la dernière bonne copie est gardée."""
    cid, url = club
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
