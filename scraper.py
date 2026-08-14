import json
import re
import requests
import io
from PIL import Image
from concurrent.futures import ThreadPoolExecutor

BASE_URL = "https://baskethainaut.be/clubs/"
API_URL = "https://baskethainaut.be/wp-json/bpleagues/v1/proxy"

HEADERS = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
}

logo_cache = {}

def extraire_couleurs_d_image(content):
    """Analyse les pixels pour extraire les 2 couleurs principales du logo."""
    try:
        img = Image.open(io.BytesIO(content)).convert('RGB')
        img = img.resize((30, 30))
        colors = img.getcolors(30 * 30)
        if colors:
            colors.sort(key=lambda x: x[0], reverse=True)
            valid_colors = []
            for count, (r, g, b) in colors:
                # Ignorer le fond blanc ou noir
                if (r > 220 and g > 220 and b > 220) or (r < 35 and g < 35 and b < 35):
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

def traiter_logo(club_tuple):
    """Télécharge et extrait les couleurs de façon isolée pour le multi-threading."""
    club, logo_url = club_tuple
    if not logo_url:
        club['primary_color'] = "#1e293b"
        club['accent_color'] = "#d32f2f"
        return club

    full_url = logo_url if logo_url.startswith('http') else 'https://baskethainaut.be/' + logo_url.lstrip('/')
    club['logo_full_url'] = full_url

    if full_url in logo_cache:
        p, a = logo_cache[full_url]
        club['primary_color'], club['accent_color'] = p, a
        return club

    try:
        resp = requests.get(full_url, headers=HEADERS, timeout=2.5)
        if resp.status_code == 200:
            p, a = extraire_couleurs_d_image(resp.content)
            logo_cache[full_url] = (p, a)
            club['primary_color'], club['accent_color'] = p, a
            return club
    except Exception:
        pass

    club['primary_color'] = "#1e293b"
    club['accent_color'] = "#d32f2f"
    return club

def mettre_a_jour_donnees():
    session = requests.Session()
    session.headers.update(HEADERS)

    print("1. 🔑 Récupération du jeton...")
    try:
        res = session.get(BASE_URL, timeout=10)
        match = re.search(r'"rest_nonce"\s*:\s*"([^"]+)"', res.text)
        if not match:
            print("❌ Nonce introuvable.")
            return
        nonce = match.group(1)
        print(f"   --> Nonce: {nonce}")
    except Exception as e:
        print(f"❌ Erreur connexion: {e}")
        return

    api_headers = {'X-WP-Nonce': nonce}

    # A. Détection de la SAISON EN COURS
    print("2. 🗓️ Détection de la saison active...")
    current_season_id = None
    try:
        res_seasons = session.get(API_URL, headers=api_headers, params={'_path': 'season/byMyLeague'}, timeout=10)
        if res_seasons.status_code == 200:
            seasons = res_seasons.json()
            seasons_list = seasons.get('elements', seasons) if isinstance(seasons, dict) else seasons
            for s in seasons_list:
                if s.get('default') or s.get('is_default') or s.get('current'):
                    current_season_id = s.get('id')
                    break
            if not current_season_id and len(seasons_list) > 0:
                seasons_list.sort(key=lambda x: x.get('id', 0), reverse=True)
                current_season_id = seasons_list[0].get('id')
            print(f"   --> Saison active ID : {current_season_id}")
    except Exception as e:
        print(f"⚠️ Erreur saisons: {e}")

    # B. Récupération des SÉRIES de la saison en cours
    print("3. 🏆 Récupération des séries actives...")
    active_serie_ids = set()
    try:
        res_series = session.get(API_URL, headers=api_headers, params={'_path': 'serie/byMyLeague'}, timeout=10)
        if res_series.status_code == 200:
            series_data = res_series.json()
            series_list = series_data.get('elements', series_data) if isinstance(series_data, dict) else series_data
            for sr in series_list:
                if not current_season_id or sr.get('season_id') == current_season_id:
                    active_serie_ids.add(sr.get('id'))
            print(f"   --> {len(active_serie_ids)} séries actives retenues.")
    except Exception as e:
        print(f"⚠️ Erreur séries: {e}")

    # C. CLASSEMENTS (filtrés sur la saison active)
    print("4. 📊 Récupération des classements actuels...")
    classements_filtres = []
    try:
        res_rank = session.get(API_URL, headers=api_headers, params={'_path': 'ranking/byMyLeague'}, timeout=10)
        if res_rank.status_code == 200:
            raw_rank = res_rank.json()
            all_rankings = raw_rank.get('elements', raw_rank) if isinstance(raw_rank, dict) else raw_rank
            
            if active_serie_ids:
                classements_filtres = [r for r in all_rankings if r.get('serie_id') in active_serie_ids]
            else:
                classements_filtres = all_rankings
            
            print(f"   --> {len(classements_filtres)} classements conservés pour cette saison.")
    except Exception as e:
        print(f"⚠️ Erreur classements: {e}")

    # D. MATCHS (filtrés sur la saison active)
    print("5. 📅 Récupération du calendrier des matchs...")
    matchs_filtres = []
    try:
        res_games = session.get(API_URL, headers=api_headers, params={'_path': 'game/byMyLeague'}, timeout=10)
        if res_games.status_code == 200:
            raw_g = res_games.json()
            all_games = raw_g.get('elements', raw_g) if isinstance(raw_g, dict) else raw_g
            if active_serie_ids:
                matchs_filtres = [g for g in all_games if g.get('serie_id') in active_serie_ids]
            else:
                matchs_filtres = all_games
            print(f"   --> {len(matchs_filtres)} matchs conservés pour cette saison.")
    except Exception as e:
        print(f"⚠️ Erreur matchs: {e}")

    # E. CLUBS ACTIFS
    print("6. 🏀 Traitement parallèle des logos...")
    active_club_ids = {str(r['club_id']) for r in classements_filtres if r.get('club_id')}
    
    donnees_finales = {
        "clubs": {},
        "donnees_clubs": {},
        "classements": classements_filtres,
        "matchs": matchs_filtres
    }

    try:
        res_clubs = session.get(API_URL, headers=api_headers, params={'_path': 'club/byMyLeague'}, timeout=10)
        if res_clubs.status_code == 200:
            raw_clubs = res_clubs.json()
            all_clubs = raw_clubs.get('elements', raw_clubs) if isinstance(raw_clubs, dict) else raw_clubs
            
            clubs_to_process = []
            for c in all_clubs:
                cid = str(c.get('id', ''))
                nom = (c.get('name') or c.get('title') or c.get('shortName') or '').strip()
                if cid in active_club_ids and nom:
                    logo_url = c.get('logo_img_url') or c.get('logo') or ''
                    clubs_to_process.append((c, logo_url))

            with ThreadPoolExecutor(max_workers=10) as executor:
                processed_clubs = list(executor.map(traiter_logo, clubs_to_process))

            for c in processed_clubs:
                cid = str(c.get('id'))
                nom = (c.get('name') or c.get('title') or c.get('shortName')).strip()
                donnees_finales["clubs"][nom] = cid
                donnees_finales["donnees_clubs"][cid] = c

            print(f"   --> {len(donnees_finales['clubs'])} clubs actifs configurés !")
    except Exception as e:
        print(f"⚠️ Erreur clubs: {e}")

    # Enregistrement
    with open('data.json', 'w', encoding='utf-8') as f:
        json.dump(donnees_finales, f, ensure_ascii=False, indent=2)

    print("🎉 data.json mis à jour avec succès !")

if __name__ == "__main__":
    mettre_a_jour_donnees()
