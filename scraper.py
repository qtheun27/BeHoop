"""
Scraper Basket Hainaut — v3

Corrige les bugs de la v2-Gemini :
- Chaque appel à l'API est désormais filtré par organization_id + season_id
  (et competition_id / dates selon l'endpoint). La v2-Gemini appelait
  ranking/byMyLeague et game/byMyLeague SANS AUCUN FILTRE : ça renvoie
  l'historique complet de TOUTE la Wallonie/Belgique, toutes saisons
  confondues (d'où un data.json de 70 Mo et des dizaines d'équipes
  fantômes d'anciennes saisons dans l'interface).
- Les équipes "en cours" d'un club viennent directement du champ
  teams_array renvoyé par club/byMyLeague (déjà filtré sur la saison
  demandée) — pas d'une reconstruction fragile à partir des classements.
- L'adresse de la salle vient de venues_array (rue, ville, code postal,
  coordonnées) — pas du siège social administratif du club.
- Les logos utilisent la bonne base d'URL : gestion.awbb.be, pas
  baskethainaut.be (vérifié en inspectant les <img> réellement chargées
  sur le site).
"""

import json
import re
import sys
from datetime import datetime, timedelta

import requests

BASE_SITE = "https://baskethainaut.be"
NONCE_SOURCE_PAGE = f"{BASE_SITE}/clubs/"
API_BASE = f"{BASE_SITE}/wp-json/bpleagues/v1/proxy"
ORGANIZATION_ID = 2  # = Hainaut (fixe pour ce site provincial)
LOGO_BASE_URL = "https://gestion.awbb.be/lms_league_ws/public/img/"

# Fenêtre de calendrier récupérée : le passé récent (résultats) + l'avenir
# proche (prochains matchs). Interroger la saison entière en une fois fait
# planter l'API du site (erreur 502).
JOURS_PASSES = 21
JOURS_FUTURS = 60

HEADERS_BROWSER = {
    "User-Agent": "Mozilla/5.0 (compatible; AWBB-Suivi-Bot/3.0; +https://github.com/)"
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


def nettoyer_club(club: dict) -> dict:
    """Ne garde que les champs publics d'un club.

    L'API renvoie aussi des données administratives (IBAN, n° TVA, n° BCE,
    GSM du dirigeant...) qu'il est hors de question de publier telles
    quelles dans un data.json hébergé sur un dépôt GitHub public.
    """
    venues = club.get("venues_array") or []
    equipes = [
        {"id": t.get("id"), "name": t.get("name"), "short_name": t.get("short_name")}
        for t in (club.get("teams_array") or [])
        if t.get("team_status_id") == 1
    ]
    return {
        "id": club.get("id"),
        "name": club.get("name"),
        "short_name": club.get("short_name"),
        "logo_url": logo_complet(club.get("logo_img_url")),
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
    print(f"✅ Saison : {saison_courante.get('name')} (id={season_id})")

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

    print("🏀 Récupération des clubs (avec équipes et salles de la saison)...")
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
    clubs = [nettoyer_club(c) for c in clubs_resp.get("elements", [])]
    total_equipes = sum(len(c["teams"]) for c in clubs)
    print(f"✅ {len(clubs)} club(s), {total_equipes} équipe(s) actives cette saison.")

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

    aujourdhui = datetime.utcnow().date()
    date_debut = (aujourdhui - timedelta(days=JOURS_PASSES)).isoformat()
    date_fin = (aujourdhui + timedelta(days=JOURS_FUTURS)).isoformat()

    print(f"🗓️ Récupération du calendrier des matchs ({date_debut} → {date_fin})...")
    games_resp = call_api(
        session, nonce, "game/byMyLeague",
        {
            "organization_id": ORGANIZATION_ID,
            "season_id": season_id,
            "competition_id": competition_ids,
            "start_date": date_debut,
            "end_date": date_fin,
            "sort": ["date", "time"],
            "with_referees": "false",
            "no_forfeit": "true",
            "without_in_preparation": "true",
        },
    )
    games = [nettoyer_match(g) for g in games_resp.get("elements", [])]
    print(f"✅ {len(games)} match(s) trouvé(s) sur la période.")

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
