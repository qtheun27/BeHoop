"""
Scraper Basket Hainaut — v4

Nouveautés par rapport à la v3 :
- Calendrier de la SAISON COMPLÈTE (plus une fenêtre de 81 jours) : la saison
  est découpée en tranches de ~55 jours pour rester sous la limite qui fait
  planter l'API en une seule requête (testé : une requête sur toute la
  saison renvoie une erreur 502 ou plusieurs Mo de JSON).
- Catégorie visible par équipe (ex. "P1D A", "U14H B") : extraite du champ
  `name` de l'équipe en retirant le nom du club, pour distinguer les
  équipes d'un même club dans l'interface (avant, tout s'appelait juste
  "Nom du club").
- Couleurs dominantes du logo de chaque club (2 couleurs), extraites
  côté serveur avec Pillow, pour thémer dynamiquement l'interface. Fait
  côté serveur car gestion.awbb.be ne renvoie pas d'en-têtes CORS : le
  navigateur ne peut pas lire les pixels d'une image chargée depuis un
  autre domaine (canvas "tainted"). Comme les clubs sont maintenant
  correctement filtrés sur le Hainaut (~60, pas des milliers), ça prend
  quelques secondes, pas plusieurs minutes.
"""

import io
import json
import re
import sys
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timedelta

import requests
from PIL import Image

BASE_SITE = "https://baskethainaut.be"
NONCE_SOURCE_PAGE = f"{BASE_SITE}/clubs/"
API_BASE = f"{BASE_SITE}/wp-json/bpleagues/v1/proxy"
ORGANIZATION_ID = 2  # = Hainaut (fixe pour ce site provincial)
LOGO_BASE_URL = "https://gestion.awbb.be/lms_league_ws/public/img/"

# Taille des tranches pour parcourir la saison complète sans faire planter
# l'API (une requête sur toute la saison en une fois renvoie une 502).
TAILLE_TRANCHE_JOURS = 55

HEADERS_BROWSER = {
    "User-Agent": "Mozilla/5.0 (compatible; AWBB-Suivi-Bot/4.0; +https://github.com/)"
}


def get_nonce(session: requests.Session) -> str:
    resp = session.get(NONCE_SOURCE_PAGE, headers=HEADERS_BROWSER, timeout=30)
    resp.raise_for_status()
    match = re.search(r'"rest_nonce":"([a-f0-9]+)"', resp.text)
    if not match:
        raise RuntimeError(
            "Impossible de trouver le rest_nonce dans la page. "
            "Le site a peut-être changé de structure (plugin mis à jour ?)."
        )
    return match.group(1)


def call_api(session: requests.Session, nonce: str, path: str, params: dict | None = None) -> dict:
    query = {"_path": path}
    for key, value in (params or {}).items():
        if isinstance(value, (list, tuple)):
            for i, v in enumerate(value):
                query[f"{key}[{i}]"] = v
        else:
            query[key] = value

    resp = session.get(
        API_BASE, params=query,
        headers={**HEADERS_BROWSER, "X-WP-Nonce": nonce},
        timeout=30,
    )
    resp.raise_for_status()
    data = resp.json()
    if isinstance(data, dict) and data.get("code") == "rest_forbidden":
        raise RuntimeError(f"Accès refusé par l'API pour {path} — le nonce a peut-être expiré.")
    return data


def logo_complet(logo_img_url: str | None) -> str | None:
    if not logo_img_url:
        return None
    if logo_img_url.startswith("http"):
        return logo_img_url
    return LOGO_BASE_URL + logo_img_url.lstrip("/")


def categorie_equipe(team_name: str | None, club_name: str | None, club_short_name: str | None) -> str:
    """Extrait la catégorie d'une équipe (ex. "P1D A") depuis son nom complet.

    L'API renvoie par ex. name="P1D ABC B Péronnes A" pour un club dont le
    nom est "ABC B Péronnes" : en retirant le nom du club, il reste "P1D A"
    — la catégorie suivie du suffixe d'équipe (A/B/C...).
    """
    if not team_name:
        return ""
    label = team_name
    for candidat in (club_name, club_short_name):
        if candidat and candidat in label:
            label = label.replace(candidat, " ")
            break
    return re.sub(r"\s+", " ", label).strip()


def extraire_couleurs(image_bytes: bytes) -> tuple[str, str]:
    """Renvoie 2 couleurs dominantes (hex) d'une image, en ignorant le blanc/noir."""
    try:
        img = Image.open(io.BytesIO(image_bytes)).convert("RGB")
        img = img.resize((40, 40))
        colors = img.getcolors(40 * 40) or []
        colors.sort(key=lambda x: x[0], reverse=True)
        trouvees = []
        for _count, (r, g, b) in colors:
            if (r > 225 and g > 225 and b > 225) or (r < 30 and g < 30 and b < 30):
                continue
            hexcolor = f"#{r:02x}{g:02x}{b:02x}"
            if hexcolor not in trouvees:
                trouvees.append(hexcolor)
            if len(trouvees) >= 2:
                break
        if len(trouvees) == 2:
            return trouvees[0], trouvees[1]
        if len(trouvees) == 1:
            return trouvees[0], trouvees[0]
    except Exception:
        pass
    return "#0b5cab", "#d32f2f"


def recuperer_couleurs_logo(session: requests.Session, logo_url: str | None) -> tuple[str, str]:
    if not logo_url:
        return "#0b5cab", "#d32f2f"
    try:
        resp = session.get(logo_url, headers=HEADERS_BROWSER, timeout=8)
        if resp.status_code == 200:
            return extraire_couleurs(resp.content)
    except Exception:
        pass
    return "#0b5cab", "#d32f2f"


def nettoyer_venue(venue: dict | None) -> dict | None:
    if not venue:
        return None
    return {
        "name": venue.get("name"),
        "street": venue.get("street"),
        "street2": venue.get("street2"),
        "zip": venue.get("zip"),
        "city": venue.get("city"),
        "lat": venue.get("lat"),
        "lng": venue.get("lng"),
    }


def preparer_club(session: requests.Session, club: dict) -> dict:
    """Ne garde que les champs publics d'un club.

    L'API renvoie aussi des données administratives (IBAN, n° TVA, n° BCE,
    GSM du dirigeant...) qu'il est hors de question de publier telles
    quelles dans un data.json hébergé sur un dépôt GitHub public.
    """
    venues = club.get("venues_array") or []
    nom_club = club.get("name")
    nom_court_club = club.get("short_name")

    equipes = [
        {
            "id": t.get("id"),
            "name": t.get("name"),
            "category": categorie_equipe(t.get("name"), nom_club, nom_court_club),
        }
        for t in (club.get("teams_array") or [])
        if t.get("team_status_id") == 1
    ]

    logo_url = logo_complet(club.get("logo_img_url"))
    primary_color, accent_color = recuperer_couleurs_logo(session, logo_url)

    return {
        "id": club.get("id"),
        "name": nom_club,
        "short_name": nom_court_club,
        "logo_url": logo_url,
        "primary_color": primary_color,
        "accent_color": accent_color,
        "street": club.get("street"),
        "street2": club.get("street2"),
        "zip": club.get("zip"),
        "city": club.get("city"),
        "email": club.get("email"),
        "venue": nettoyer_venue(venues[0] if venues else None),
        "teams": equipes,
    }


def nettoyer_match(match: dict) -> dict:
    champs_publics = (
        "id", "date", "time", "serie_id", "serie_name", "serie_short_name",
        "home_team_id", "away_team_id", "home_team_name", "away_team_name",
        "home_team_short_name", "away_team_short_name",
        "home_score", "away_score", "game_status_id",
        "venue_name", "venue_city", "venue_street",
    )
    return {k: match.get(k) for k in champs_publics if k in match}


def recuperer_calendrier_saison(session, nonce, competition_ids, organization_id, season_id,
                                 date_debut_saison, date_fin_saison) -> list[dict]:
    """Récupère tous les matchs de la saison en la découpant en tranches.

    Interroger la saison entière en une seule requête fait planter l'API
    du site (erreur 502) car la réponse est trop volumineuse.
    """
    debut = datetime.fromisoformat(date_debut_saison).date()
    fin_saison = datetime.fromisoformat(date_fin_saison).date()
    vus = set()
    tous_les_matchs = []

    while debut <= fin_saison:
        fin_tranche = min(debut + timedelta(days=TAILLE_TRANCHE_JOURS), fin_saison)
        resp = call_api(
            session, nonce, "game/byMyLeague",
            {
                "organization_id": organization_id,
                "season_id": season_id,
                "competition_id": competition_ids,
                "start_date": debut.isoformat(),
                "end_date": fin_tranche.isoformat(),
                "sort": ["date", "time"],
                "with_referees": "false",
                "no_forfeit": "true",
                "without_in_preparation": "true",
            },
        )
        for g in resp.get("elements", []):
            if g.get("id") not in vus:
                vus.add(g.get("id"))
                tous_les_matchs.append(nettoyer_match(g))
        print(f"   ... {debut.isoformat()} → {fin_tranche.isoformat()} : "
              f"{len(resp.get('elements', []))} match(s)")
        debut = fin_tranche + timedelta(days=1)

    return tous_les_matchs


def charger_basket_hainaut():
    session = requests.Session()

    print("🔑 Récupération du jeton de sécurité (nonce)...")
    nonce = get_nonce(session)
    print("✅ Nonce obtenu.")

    print("📅 Détection de la saison en cours...")
    seasons = call_api(session, nonce, "season/byMyLeague", {"organization_id": ORGANIZATION_ID})
    season_list = seasons.get("elements", [])
    saison_courante = next((s for s in season_list if s.get("default") == 1), None)
    if not saison_courante:
        saison_courante = max(season_list, key=lambda s: s.get("end_date", ""))
    season_id = saison_courante["id"]
    print(f"✅ Saison : {saison_courante.get('name')} (id={season_id}, "
          f"{saison_courante.get('start_date')} → {saison_courante.get('end_date')})")

    print("🏢 Récupération des infos de la province...")
    organisation = call_api(session, nonce, f"organization/{ORGANIZATION_ID}")

    print("🏆 Récupération des compétitions...")
    competitions_resp = call_api(
        session, nonce, "competition/byMyLeague",
        {"organization_id": ORGANIZATION_ID, "season_id": season_id},
    )
    competitions = competitions_resp.get("elements", [])
    competition_ids = [c["id"] for c in competitions]
    print(f"✅ {len(competitions)} compétition(s) trouvée(s).")

    if not competition_ids:
        print("❌ Aucune compétition trouvée, arrêt.")
        return

    print("🏀 Récupération des clubs (équipes, salles, couleurs de logo)...")
    clubs_resp = call_api(
        session, nonce, "club/byMyLeague",
        {
            "organization_id": ORGANIZATION_ID,
            "season_id": season_id,
            "competition_id": competition_ids,
            "sort": ["short_name", "reference", "order"],
            "club_status_id": 1,
        },
    )
    clubs_bruts = clubs_resp.get("elements", [])
    with ThreadPoolExecutor(max_workers=10) as executor:
        clubs = list(executor.map(lambda c: preparer_club(session, c), clubs_bruts))
    total_equipes = sum(len(c["teams"]) for c in clubs)
    print(f"✅ {len(clubs)} club(s), {total_equipes} équipe(s) actives cette saison "
          f"(logos et couleurs traités).")

    print("📊 Récupération des séries (divisions)...")
    series_resp = call_api(
        session, nonce, "serie/byMyLeague",
        {
            "organization_id": ORGANIZATION_ID,
            "season_id": season_id,
            "competition_id": competition_ids,
            "sort": ["competition", "division", "order"],
            "serie_status_id": [0, 1],
        },
    )
    series = series_resp.get("elements", [])
    print(f"✅ {len(series)} série(s)/division(s) trouvée(s).")

    print("🏆 Récupération des classements par série...")
    classements = {}
    for i, serie in enumerate(series, start=1):
        serie_id = serie["id"]
        try:
            ranking_resp = call_api(
                session, nonce, "ranking/byMyLeague",
                {"serie_id": serie_id, "organization_id": ORGANIZATION_ID, "season_id": season_id},
            )
            classements[str(serie_id)] = ranking_resp.get("elements", [])
        except Exception as e:
            print(f"⚠️ Classement indisponible pour la série {serie.get('name', serie_id)}: {e}")
            classements[str(serie_id)] = []
        if i % 10 == 0:
            print(f"   ... {i}/{len(series)} classements récupérés")

    print("🗓️ Récupération du calendrier — saison complète, par tranches...")
    games = recuperer_calendrier_saison(
        session, nonce, competition_ids, ORGANIZATION_ID, season_id,
        saison_courante.get("start_date"), saison_courante.get("end_date"),
    )
    print(f"✅ {len(games)} match(s) trouvé(s) sur la saison complète.")

    donnees_finales = {
        "generated_at": datetime.utcnow().isoformat() + "Z",
        "organization": organisation.get("data", organisation),
        "season": saison_courante,
        "competitions": competitions,
        "clubs": clubs,
        "series": series,
        "classements": classements,
        "games": games,
    }

    with open("data.json", "w", encoding="utf-8") as f:
        json.dump(donnees_finales, f, ensure_ascii=False, indent=2)

    taille_ko = len(json.dumps(donnees_finales)) // 1024
    print("\n💾 Le fichier data.json a été généré avec succès !")
    print(f"   → {len(clubs)} clubs, {total_equipes} équipes, {len(series)} séries, "
          f"{len(games)} matchs — {taille_ko} Ko")


if __name__ == "__main__":
    try:
        charger_basket_hainaut()
    except Exception as exc:
        print(f"❌ Erreur fatale : {exc}", file=sys.stderr)
        sys.exit(1)
