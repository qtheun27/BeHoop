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
    
    # 1. Récupération de la liste des clubs
    res = requests.get(url_base, headers=HEADERS)
    soup = BeautifulSoup(res.content, 'html.parser')
    
    clubs = {}
    options = soup.find_all('option')
    
    for opt in options:
        club_id = opt.get('value')
        nom = opt.text.strip()
        if club_id and club_id.isdigit() and nom and nom != "Tous":
            clubs[nom] = club_id

    print(f"✅ {len(clubs)} clubs trouvés.")

    # 2. Structure finale des données
    donnees_finales = {
        "clubs": clubs,
        "donnees_clubs": {}
    }

    # 3. Récupération des résultats pour chaque club (limité aux clubs actifs)
    count = 0
    for nom, club_id in clubs.items():
        try:
            url_club = f"https://resultats.awbb.be/equipe/{club_id}"
            res_club = requests.get(url_club, headers=HEADERS)
            soup_club = BeautifulSoup(res_club.content, 'html.parser')
            
            # On extrait tous les tableaux (calendriers / classements)
            tableaux = [str(t) for t in soup_club.find_all('table')]
            
            donnees_finales["donnees_clubs"][club_id] = tableaux
            count += 1
            print(f"[{count}/{len(clubs)}] Récupéré : {nom}")
            
            # Petite pause pour ne pas surcharger le serveur
            time.sleep(0.5)
        except Exception as e:
            print(f"❌ Erreur pour {nom}: {e}")

    # 4. Sauvegarde dans le fichier JSON
    with open('data.json', 'w', encoding='utf-8') as f:
        json.dump(donnees_finales, f, ensure_ascii=False, indent=2)

    print("🎉 Mises à jour terminées avec succès dans data.json !")

if __name__ == "__main__":
    charger_awbb()
