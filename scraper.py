import json
import re
import requests
import io
from PIL import Image

BASE_URL = "https://baskethainaut.be/clubs/"
API_URL = "https://baskethainaut.be/wp-json/bpleagues/v1/proxy"

HEADERS = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
}

def extraire_couleurs_logo(logo_url, session):
    """Analyse l'image du logo pour extraire les 2 couleurs dominantes."""
    try:
        if not logo_url.startswith('http'):
            logo_url = 'https://baskethainaut.be/' + logo_url.lstrip('/')
        
        resp = session.get(logo_url, timeout=5)
        if resp.status_code == 200:
            img = Image.open(io.BytesIO(resp.content)).convert('RGB')
            img = img.resize((50, 50))
            
            # Compter les couleurs
            colors = img.getcolors(50 * 50)
            if not colors:
                return "#1e293b", "#d32f2f"

            colors.sort(key=lambda x: x[0], reverse=True)
            valid_colors = []

            for count, (r, g, b) in colors:
                # Ignorer les nuances proches du blanc pur ou du noir pur
                if (r > 235 and g > 235 and b > 235) or (r < 20 and g < 20 and b < 20):
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
    except Exception as e:
        print(f"⚠️ Erreur extraction couleur logo: {e}")
    
    return "#1e293b", "#d32f2f" # Thème par défaut


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

    # 2. Identification de la SAISON EN COURS
    print("2. 🗓️ Détection de la saison en cours...")
    saison_active_id = None
    try:
        res_seasons = session.get(API_URL, headers=api_headers, params={'_path': 'season/byMyLeague'}, timeout=15)
        if res_seasons.status_code == 200:
            seasons = res_seasons.json()
            # Chercher la saison marquée par défaut ou la plus récente
            for s in seasons:
                if s.get('default') or s.get('is_default') or s.get('current'):
                    saison_active_id = s.get('id')
                    break
            if not saison_active_id and len(seasons) > 0:
                saison_active_id = seasons[0].get('id')
            print(f"   --> Saison active ID : {saison_active_id}")
    except Exception as e:
        print(f"⚠️ Erreur détection saison: {e}")

    donnees = {
        "saison_id": saison_active_id,
        "clubs": {},
        "donnees_clubs": {},
        "classements": [],
        "matchs": []
    }

    # 3. Récupération des CLASSEMENTS de la saison en cours
    print("3. 📊 Récupération des classements de la saison...")
    try:
        res_rank = session.get(API_URL, headers=api_headers, params={'_path': 'ranking/byMyLeague'}, timeout=15)
        if res_rank.status_code == 200:
            raw = res_rank.json()
            elements = raw.get('elements', raw) if isinstance(raw, dict) else raw
            
            # Filtrer pour ne garder QUE la saison actuelle si l'ID est disponible
            if saison_active_id:
                donnees["classements"] = [item for item in elements if item.get('season_id') == saison_active_id or not item.get('season_id')]
            else:
                donnees["classements"] = elements
            
            print(f"   --> {len(donnees['classements'])} entrées de classement retenues.")
    except Exception as e:
        print(f"⚠️ Erreur classements: {e}")

    # 4. Récupération des CLUBS ACTIFS (basé sur les équipes en compétition cette saison)
    print("4. 🏀 Extraction des clubs actifs & analyse des couleurs des logos...")
    active_club_ids = set()
    for item in donnees["classements"]:
        if item.get('club_id'):
            active_club_ids.add(str(item['club_id']))

    try:
        res_clubs = session.get(API_URL, headers=api_headers, params={'_path': 'club/byMyLeague'}, timeout=15)
        if res_clubs.status_code == 200:
            for c in res_clubs.json():
                cid = str(c.get('id', ''))
                nom = c.get('name') or c.get('title') or ''
                
                # Seuls les clubs participant à la saison actuelle sont retenus !
                if cid in active_club_ids and nom:
                    logo = c.get('logo_img_url') or c.get('logo') or ''
                    p_color, a_color = extraire_couleurs_logo(logo, session)
                    
                    c['primary_color'] = p_color
                    c['accent_color'] = a_color
                    
                    donnees["clubs"][nom.strip()] = cid
                    donnees["donnees_clubs"][cid] = c

            print(f"   --> {len(donnees['clubs'])} clubs actifs filtrés et configurés !")
    except Exception as e:
        print(f"⚠️ Erreur clubs: {e}")

    # 5. Récupération des MATCHS
    print("5. 📅 Récupération du calendrier des matchs...")
    try:
        res_games = session.get(API_URL, headers=api_headers, params={'_path': 'game/byMyLeague'}, timeout=15)
        if res_games.status_code == 200:
            raw_g = res_games.json()
            donnees["matchs"] = raw_g.get('elements', raw_g) if isinstance(raw_g, dict) else raw_g
            print(f"   --> {len(donnees['matchs'])} matchs récupérés.")
    except Exception as e:
        print(f"⚠️ Erreur matchs: {e}")

    # Enregistrement
    with open('data.json', 'w', encoding='utf-8') as f:
        json.dump(donnees, f, ensure_ascii=False, indent=2)

    print("🎉 data.json généré avec succès !")

if __name__ == "__main__":
    mettre_a_jour_donnees()
