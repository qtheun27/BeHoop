import json
import time
from bs4 import BeautifulSoup
from playwright.sync_api import sync_playwright

def charger_awbb():
    print("⏳ Lancement du navigateur Chrome virtuel...")
    donnees_finales = {
        "clubs": {},
        "donnees_clubs": {}
    }

    with sync_playwright() as p:
        # Lancement de Chrome en arrière-plan
        browser = p.chromium.launch(headless=True)
        page = browser.new_page()

        print("⏳ Connexion au site de l'AWBB...")
        try:
            # On navigue sur la page officielle
            page.goto("https://www.awbb.be/competitions-awbb/", wait_until="networkidle", timeout=60000)
            
            # Récupération du code HTML une fois chargé
            soup = BeautifulSoup(page.content(), 'html.parser')

            # 1. Extraction de la liste des clubs
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
            print(f"✅ {total_clubs} clubs trouvés !")

            # 2. Récupération des tableaux pour chaque club
            count = 0
            for nom, club_id in donnees_finales["clubs"].items():
                try:
                    url_club = f"https://www.awbb.be/competitions-awbb/?club_id={club_id}"
                    page.goto(url_club, wait_until="domcontentloaded", timeout=20000)
                    
                    soup_club = BeautifulSoup(page.content(), 'html.parser')
                    tableaux = [str(t) for t in soup_club.find_all('table')]
                    donnees_finales["donnees_clubs"][club_id] = tableaux
                    
                    count += 1
                    print(f"[{count}/{total_clubs}] Récupéré : {nom}")
                    time.sleep(0.2)
                except Exception as e:
                    print(f"⚠️ Erreur sur {nom}: {e}")

        except Exception as e:
            print(f"❌ Erreur lors du chargement : {e}")
        finally:
            browser.close()

    # 3. Sauvegarde dans data.json
    with open('data.json', 'w', encoding='utf-8') as f:
        json.dump(donnees_finales, f, ensure_ascii=False, indent=2)

    print("🎉 Mises à jour terminées avec succès !")

if __name__ == "__main__":
    charger_awbb()
