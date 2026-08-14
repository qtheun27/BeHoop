import json
import time
import requests
from bs4 import BeautifulSoup

HEADERS = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
}

def charger_awbb():
    print("⏳ Connexion à l'AWBB...")
    url_base = "https://resultats.awbb.be/"
    
    donnees_finales = {
        "clubs": {},
        "donnees_clubs": {}
    }

    try:
        res = requests.get(url_base, headers=HEADERS, timeout=15)
        soup = BeautifulSoup(res.content, 'html.parser')
        
        options = soup.find_all('option')
        for opt in options:
            club_id = opt.get('value')
            nom = opt.text.strip()
            if club_id and club_id.isdigit() and nom and nom != "Tous":
                donnees_finales["clubs"][nom] = club_id

        print(f"✅ {len(donnees_finales['clubs'])} clubs trouvés.")

        count = 0
        for nom, club_id in donnees_finales["clubs"].items():
            try:
                url_club = f"https://resultats.awbb.be/equipe/{club_id}"
                res_club = requests.get(url_club, headers=HEADERS, timeout=10)
                if res_club.status_code == 200:
                    soup_club = BeautifulSoup(res_club.content, 'html.parser')
                    tableaux = [str(t) for t in soup_club.find_all('table')]
                    donnees_finales["donnees_clubs"][club_id] = tableaux
                count += 1
                print(f"[{count}/{len(donnees_finales['clubs'])}] Récupéré : {nom}")
                time.sleep(0.2)
            except Exception as e:
                print(f"⚠️ Erreur pour {nom}: {e}")
    except Exception as e:
        print(f"❌ Erreur principale : {e}")

    # Toujours écrire le fichier pour éviter que Git plante
    with open('data.json', 'w', encoding='utf-8') as f:
        json.dump(donnees_finales, f, ensure_ascii=False, indent=2)

    print("🎉 Sauvegarde terminée dans data.json !")

if __name__ == "__main__":
    charger_awbb()
