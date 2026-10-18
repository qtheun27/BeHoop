"""
Copie locale des logos de clubs (lancé par update.yml après le scraper, qui n'est pas modifié).
- logos/<id>.webp : logo réduit à 256 px, servi par behoop.be (un fichier supprimé chez l'AWBB ne casse plus l'affichage) ;
- logos/overrides/<id>.(png|jpg|webp) : logo imposé manuellement, prioritaire ;
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
    cid, url = club
    dest = os.path.join(OUT, f'{cid}.webp')
    for ext in ('png', 'jpg', 'jpeg', 'webp'):
        o = os.path.join(OUT, 'overrides', f'{cid}.{ext}')
        if os.path.exists(o):
            save(open(o, 'rb').read(), dest); return 'remplacé'
    if not url: return 'aucun'
    try:
        r = requests.get(url, timeout=30, headers={'User-Agent': 'BeHoop/1.0 (+https://behoop.be)'})
        if r.status_code != 200 or len(r.content) > 15_000_000: raise ValueError(r.status_code)
        save(r.content, dest); return 'ok'
    except Exception:
        return 'gardé' if os.path.exists(dest) else 'absent'

clubs = [(c['id'], c.get('logo_url')) for c in json.load(open(os.path.join(ROOT, 'data.json')))['clubs']]
vbl = os.path.join(ROOT, 'vbl.json')
if os.path.exists(vbl):
    clubs += [(c['id'], c.get('logo')) for c in json.load(open(vbl))['clubs']]
with ThreadPoolExecutor(12) as ex:
    res = list(ex.map(one, clubs))
print('logos :', {k: res.count(k) for k in set(res)})
