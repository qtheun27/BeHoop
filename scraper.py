import json
import time
import cloudscraper
from bs4 import BeautifulSoup

def charger_awbb():
    print("⏳ Connexion sécurisée à l'AWBB...")
    
    # Création d'un navigateur virtuel anti-blocage
    scraper = cloudscraper.create_scraper(
        browser={
            'browser': 'chrome',
            'platform': 'windows',
            'desktop': True
        }
    )
    
    url_base = "https://resultats.awbb.be/"
    
    donnees_finales = {
        "clubs": {},
        "donnees_clubs": {}
    }

    try:
        res = scraper.get(url_base)
        soup = BeautifulSoup(res.content, 'html.parser')
        
        options = soup.find_all('option')
        for opt in options:
            club_id = opt.get('value')
            nom = opt.text.strip()
            if club_id and club_id.isdigit() and nom and nom != "Tous":
                donnees_finales["clubs"][nom] = club_id

        print(f"✅ {len(donnees_finales['clubs'])} clubs identifiés.")

        count = 0
        for nom, club_id in donnees_finales["clubs"].items():
            try:
                url_club = f"https://resultats.awbb.be/equipe/{club_id}"
                res_club = scraper.get(url_club)
                if res_club.status_code == 200:
                    soup_club = BeautifulSoup(res_club.content, 'html.parser')
                    tableaux = [str(t) for t in soup_club.find_all('table')]
                    donnees_finales["donnees_clubs"][club_id] = tableaux
                
                count += 1
                print(f"[{count}/{len(donnees_finales['clubs'])}] Récupéré : {nom}")
                time.sleep(0.3)
            except Exception as e:
                print(f"⚠️ Erreur sur {nom}: {e}")

    except Exception as e:
        print(f"❌ Erreur globale : {e}")

    # Sauvegarde du fichier
    with open('data.json', 'w', encoding='utf-8') as f:
        json.dump(donnees_finales, f, ensure_ascii=False, indent=2)

    print("🎉 Opération terminée avec succès !")

if __name__ == "__main__":
    charger_awbb()
