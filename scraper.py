import json
import time
import cloudscraper
from bs4 import BeautifulSoup

def charger_awbb():
    print("⏳ Connexion à la page officielle de l'AWBB...")
    
    # Création du navigateur virtuel anti-blocage
    scraper = cloudscraper.create_scraper(
        browser={
            'browser': 'chrome',
            'platform': 'windows',
            'desktop': True
        }
    )
    
    # URL officielle des compétitions AWBB
    url_base = "https://www.awbb.be/competitions-awbb/"
    
    donnees_finales = {
        "clubs": {},
        "donnees_clubs": {}
    }

    try:
        res = scraper.get(url_base, timeout=20)
        soup = BeautifulSoup(res.content, 'html.parser')
        
        # 1. Extraction des clubs dans les balises <option> et <a>
        for opt in soup.find_all('option'):
            val = opt.get('value', '')
            nom = opt.text.strip()
            if 'club_id=' in val:
                cid = val.split('club_id=')[1].split('&')[0]
                if nom and cid:
                    donnees_finales["clubs"][nom] = cid
            elif val.isdigit() and nom and nom != "Tous":
                donnees_finales["clubs"][nom] = val

        for a in soup.find_all('a', href=True):
            href = a['href']
            if 'club_id=' in href:
                cid = href.split('club_id=')[1].split('&')[0]
                nom = a.text.strip()
                if nom and cid and cid.isdigit():
                    donnees_finales["clubs"][nom] = cid

        total_clubs = len(donnees_finales['clubs'])
        print(f"✅ {total_clubs} clubs identifiés !")

        # 2. Récupération des données pour chaque club
        count = 0
        for nom, club_id in donnees_finales["clubs"].items():
            try:
                url_club = f"https://www.awbb.be/competitions-awbb/?club_id={club_id}"
                res_club = scraper.get(url_club, timeout=15)
                
                if res_club.status_code == 200:
                    soup_club = BeautifulSoup(res_club.content, 'html.parser')
                    # Extraction des tableaux (calendrier / classement)
                    tableaux = [str(t) for t in soup_club.find_all('table')]
                    donnees_finales["donnees_clubs"][club_id] = tableaux
                
                count += 1
                print(f"[{count}/{total_clubs}] Récupéré : {nom} (ID: {club_id})")
                time.sleep(0.1)
            except Exception as e:
                print(f"⚠️ Erreur sur {nom}: {e}")

    except Exception as e:
        print(f"❌ Erreur globale lors du scraping : {e}")

    # 3. Sauvegarde dans data.json
    with open('data.json', 'w', encoding='utf-8') as f:
        json.dump(donnees_finales, f, ensure_ascii=False, indent=2)

    print("🎉 Mises à jour terminées avec succès dans data.json !")

if __name__ == "__main__":
    charger_awbb()
