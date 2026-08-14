import json
import re
import requests
import io
from PIL import Image

BASE_URL = "https://baskethainaut.be/clubs/"
API_URL = "https://baskethainaut.be/wp-json/bpleagues/v1/proxy"

HEADERS = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
}

def extraire_couleurs_logo(logo_url, session):
    """Analyse l'image du logo pour extraire les 2 couleurs principales."""
    if not logo_url:
        return "#1e293b", "#d32f2f"
    try:
        if not logo_url.startswith('http'):
            logo_url = 'https://baskethainaut.be/' + logo_url.lstrip('/')
        
        resp = session.get(logo_url, timeout=5)
        if resp.status_code == 200:
            img = Image.open(io.BytesIO(resp.content)).convert('RGB')
            img = img.resize((50, 50))
            colors = img.getcolors(50 * 50)
            if colors:
                colors.sort(key=lambda x: x[0], reverse=True)
                valid_colors = []
                for count, (r, g, b) in colors:
                    if (r > 230 and g > 235 and b > 235) or (r < 25 and g < 25 and b < 25):
                        continue
                    hex_color = f"#{r:02x}{g:02x}{b:02x}"
                    if hex_color not in valid_colors:
                        valid_colors.append(hex_color)
                    if len(valid_colors) >= 2:
                        break
                if len(valid_colors) >= 2:
                    return valid_colors[0], valid_colors[1]
                elif len(valid_colors) == 1:
                    return valid_colors[0], valid_colors[0]
    except Exception:
        pass
    return "#1e293b", "#d32f2f"

def mettre_a_jour_donnees():
    session = requests.Session()
    session.headers.update(HEADERS)

    print("1. 🔑 Récupération du jeton (Nonce)...")
    try:
        res = session.get(BASE_URL, timeout=15)
        match = re.search(r'"rest_nonce"\s*:\s*"([^"]+)"', res.text)
        if not match:
            print("❌ Jeton rest_nonce introuvable.")
            return
        nonce = match.group(1)
        print(f"   --> Jeton extrait : {nonce}")
    except Exception as e:
        print(f"❌ Erreur connexion: {e}")
        return

    api_headers = {'X-WP-Nonce': nonce}

    donnees = {
        "clubs": {},
        "donnees_clubs": {},
        "classements": [],
        "matchs": []
    }

    # 2. Récupération des MATCHS
    print("2. 📅 Récupération du calendrier des matchs...")
    try:
        res_games = session.get(API_URL, headers=api_headers, params={'_path': 'game/byMyLeague'}, timeout=15)
        if res_games.status_code == 200:
            raw_g = res_games.json()
            donnees["matchs"] = raw_g.get('elements', raw_g) if isinstance(raw_g, dict) else raw_g
            print(f"   --> {len(donnees['matchs'])} matchs récupérés.")
    except Exception as e:
        print(f"⚠️ Erreur matchs: {e}")

    # 3. Récupération des CLASSEMENTS
    print("3. 📊 Récupération des classements...")
    try:
        res_rank = session.get(API_URL, headers=api_headers, params={'_path': 'ranking/byMyLeague'}, timeout=15)
        if res_rank.status_code == 200:
            raw = res_rank.json()
            donnees["classements"] = raw.get('elements', raw) if isinstance(raw, dict) else raw
            print(f"   --> {len(donnees['classements'])} entrées de classement récupérées.")
    except Exception as e:
        print(f"⚠️ Erreur classements: {e}")

    # 4. Identification des CLUBS ACTIFS CETTE SAISON
    active_club_ids = set()

    # Repérage depuis les classements récents
    for r in donnees["classements"]:
        cid = r.get('club_id')
        updated = str(r.get('updated_at', ''))
        # Seules les entrées récentes sont conservées
        if cid and ('2024' in updated or '2025' in updated or '2026' in updated or not updated):
            active_club_ids.add(str(cid))

    # Repérage depuis les matchs
    for g in donnees["matchs"]:
        for key in ['home_club_id', 'away_club_id', 'club_id']:
            if g.get(key):
                active_club_ids.add(str(g[key]))

    print(f"   --> {len(active_club_ids)} clubs actifs identifiés pour cette saison.")

    # 5. Récupération & Filtrage des CLUBS
    print("5. 🏀 Récupération des infos clubs & logos...")
    try:
        res_clubs = session.get(API_URL, headers=api_headers, params={'_path': 'club/byMyLeague'}, timeout=15)
        if res_clubs.status_code == 200:
            raw_clubs = res_clubs.json()
            clubs_list = raw_clubs.get('elements', raw_clubs) if isinstance(raw_clubs, dict) else raw_clubs
            
            for c in clubs_list:
                cid = str(c.get('id', ''))
                nom = c.get('name') or c.get('title') or c.get('shortName') or ''
                
                # Conserver uniquement les clubs actifs de la saison
                if nom and cid and (cid in active_club_ids or len(active_club_ids) == 0):
                    logo = c.get('logo_img_url') or c.get('logo') or ''
                    p_color, a_color = extraire_couleurs_logo(logo, session)
                    c['primary_color'] = p_color
                    c['accent_color'] = a_color

                    donnees["clubs"][nom.strip()] = cid
                    donnees["donnees_clubs"][cid] = c

            print(f"   --> {len(donnees['clubs'])} clubs retenus pour la saison en cours !")
    except Exception as e:
        print(f"⚠️ Erreur clubs: {e}")

    # Sauvegarde dans data.json
    with open('data.json', 'w', encoding='utf-8') as f:
        json.dump(donnees, f, ensure_ascii=False, indent=2)

    print("🎉 Fichier data.json généré avec succès !")

if __name__ == "__main__":
    mettre_a_jour_donnees()
