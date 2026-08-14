import json
import re
import requests

BASE_URL = "https://baskethainaut.be/clubs/"
API_URL = "https://baskethainaut.be/wp-json/bpleagues/v1/proxy"

HEADERS = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
}

def mettre_a_jour_donnees():
    session = requests.Session()
    session.headers.update(HEADERS)

    print("1. 🔑 Récupération du jeton de sécurité (Nonce)...")
    try:
        res = session.get(BASE_URL, timeout=15)
        match = re.search(r'"rest_nonce"\s*:\s*"([^"]+)"', res.text)
        
        if not match:
            print("❌ Jeton rest_nonce introuvable dans la page.")
            return

        nonce = match.group(1)
        print(f"   --> Jeton extrait : {nonce}")
    except Exception as e:
        print(f"❌ Erreur lors du chargement de la page initiale: {e}")
        return

    api_headers = {'X-WP-Nonce': nonce}

    donnees_finales = {
        "clubs": {},
        "donnees_clubs": {},
        "matchs": [],
        "classements": []
    }

    # 2. Récupération des clubs
    print("2. 🏀 Récupération de la liste des clubs...")
    try:
        res_clubs = session.get(API_URL, headers=api_headers, params={'_path': 'club/byMyLeague'}, timeout=15)
        if res_clubs.status_code == 200:
            clubs_raw = res_clubs.json()
            for c in clubs_raw:
                club_id = str(c.get('id', ''))
                nom = c.get('name') or c.get('title') or c.get('shortName') or ''
                if nom and club_id:
                    donnees_finales["clubs"][nom.strip()] = club_id
                    donnees_finales["donnees_clubs"][club_id] = c
            print(f"   --> {len(donnees_finales['clubs'])} clubs récupérés !")
        else:
            print(f"⚠️ Erreur API clubs: {res_clubs.status_code}")
    except Exception as e:
        print(f"⚠️ Erreur lors de la récupération des clubs: {e}")

    # 3. Récupération des classements
    print("3. 📊 Récupération des classements...")
    try:
        res_rank = session.get(API_URL, headers=api_headers, params={'_path': 'ranking/byMyLeague'}, timeout=15)
        if res_rank.status_code == 200:
            donnees_finales["classements"] = res_rank.json()
            print("   --> Classements récupérés !")
    except Exception as e:
        print(f"⚠️ Erreur classements: {e}")

    # 4. Récupération du calendrier des matchs
    print("4. 📅 Récupération des matchs...")
    try:
        res_games = session.get(API_URL, headers=api_headers, params={'_path': 'game/byMyLeague'}, timeout=15)
        if res_games.status_code == 200:
            donnees_finales["matchs"] = res_games.json()
            print("   --> Matchs récupérés !")
    except Exception as e:
        print(f"⚠️ Erreur matchs: {e}")

    # 5. Enregistrement dans data.json
    with open('data.json', 'w', encoding='utf-8') as f:
        json.dump(donnees_finales, f, ensure_ascii=False, indent=2)

    print("🎉 Le fichier data.json a été mis à jour avec succès !")

if __name__ == "__main__":
    mettre_a_jour_donnees()
