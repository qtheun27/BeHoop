"""
Scraper Basket national — v10

Nouveauté par rapport à la v9 :
- Couvre maintenant les 5 provinces de l'AWBB (Bruxelles-Brabant Wallon,
  Hainaut, Liège, Luxembourg, Namur), pas seulement le Hainaut. Le site
  awbb.be utilise exactement la même infrastructure (plugin bpleagues,
  backend gestion.awbb.be) que baskethainaut.be — seul l'organization_id
  change d'une province à l'autre. On peut donc tout interroger via le
  même point d'entrée (proxy de baskethainaut.be), juste en bouclant sur
  les 5 identifiants de province.
- Les classements (l'étape la plus lente, un appel par série) sont
  récupérés avec un peu de parallélisme (5 en même temps) pour compenser
  le volume ~5x plus important, tout en restant modéré : le site a déjà
  montré une instabilité passagère (503) sous charge normale.

Nouveautés héritées des versions précédentes : voir les scrapers v3 à v9.
"""

import io
import json
import re
import sys
import time
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timedelta

import requests
from PIL import Image

# Certains logos de clubs sont des images énormes (un cas observé : 170
# mégapixels) — ce ne sont pas des fichiers malveillants, juste des photos
# non redimensionnées par leur club. On désactive la protection
# "decompression bomb" de Pillow (bruyante, sans intérêt ici puisqu'on
# redimensionne systématiquement en 40x40 juste après) et on ignore les
# fichiers vraiment trop volumineux pour rester rapide.
Image.MAX_IMAGE_PIXELS = None
TAILLE_MAX_LOGO_OCTETS = 15_000_000

BASE_SITE = "https://baskethainaut.be"
NONCE_SOURCE_PAGE = f"{BASE_SITE}/clubs/"
API_BASE = f"{BASE_SITE}/wp-json/bpleagues/v1/proxy"

# Les 5 provinces couvertes (le Hainaut restait le point d'entrée du site,
# mais l'API dessert toute la Belgique francophone via ce même proxy).
PROVINCES = {
    1: "Bruxelles - Brabant Wallon",
    2: "Hainaut",
    3: "Liège",
    4: "Luxembourg",
    5: "Namur",
}
ORGANIZATION_ID_AWBB = 6  # = AWBB national (pour la Coupe AWBB, équipes "R...")
LOGO_BASE_URL = "https://gestion.awbb.be/lms_league_ws/public/img/"

# Taille des tranches pour parcourir la saison complète sans faire planter
# l'API (une requête sur toute la saison en une fois renvoie une 502).
TAILLE_TRANCHE_JOURS = 55

SITE_URL = "https://qtheun27.github.io/basket-awbb"

HEADERS_BROWSER = {
    "User-Agent": "Mozilla/5.0 (compatible; AWBB-Suivi-Bot/6.0; +https://github.com/)"
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


def call_api(session: requests.Session, nonce: str, path: str, params: dict | None = None,
             tentatives: int = 4) -> dict:
    """Appelle un endpoint de l'API bpleagues, avec réessais automatiques.

    Le site fait parfois tomber la connexion en cours de route (constaté :
    'Connection aborted / RemoteDisconnected') sans lien avec les données
    demandées — un simple incident réseau transitoire. On réessaie avec un
    délai croissant plutôt que de faire planter tout le run pour ça.
    """
    query = {"_path": path}
    for key, value in (params or {}).items():
        if isinstance(value, (list, tuple)):
            for i, v in enumerate(value):
                query[f"{key}[{i}]"] = v
        else:
            query[key] = value

    derniere_erreur = None
    for tentative in range(1, tentatives + 1):
        try:
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
        except (requests.exceptions.ConnectionError, requests.exceptions.Timeout,
                requests.exceptions.ChunkedEncodingError) as e:
            derniere_erreur = e
        except requests.exceptions.HTTPError as e:
            # On ne réessaie que les erreurs SERVEUR (502/503/504 : le site
            # est temporairement indisponible, constaté en usage réel) —
            # jamais les erreurs 4xx (client), qui ne se résoudront pas en
            # réessayant et méritent d'échouer immédiatement.
            code = e.response.status_code if e.response is not None else None
            if code is None or code < 500:
                raise
            derniere_erreur = e

        if tentative < tentatives:
            attente = 2 * tentative
            print(f"   ⚠️ Incident réseau sur {path} (tentative {tentative}/{tentatives}) : "
                  f"{derniere_erreur} — nouvel essai dans {attente}s...")
            time.sleep(attente)
        else:
            raise derniere_erreur
    raise derniere_erreur


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
        if resp.status_code == 200 and len(resp.content) <= TAILLE_MAX_LOGO_OCTETS:
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


def preparer_club(session: requests.Session, club: dict, province: str) -> dict:
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
        "province": province,
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


def nettoyer_match(match: dict, lieux: dict) -> dict:
    champs_publics = (
        "id", "date", "time", "serie_id", "serie_name", "serie_short_name",
        "home_team_id", "away_team_id", "home_team_name", "away_team_name",
        "home_team_short_name", "away_team_short_name",
        "home_score", "away_score", "game_status_id",
        "venue_name", "venue_city",
    )
    m = {k: match.get(k) for k in champs_publics if k in match}

    lieu = lieux.get(match.get("venue_id"))
    if lieu:
        m["venue_street"] = lieu.get("street")
        m["venue_zip"] = lieu.get("zip")
        m["venue_lat"] = lieu.get("lat")
        m["venue_lng"] = lieu.get("lng")
    return m


def recuperer_calendrier_saison(session, nonce, competition_ids, organization_id, season_id,
                                 date_debut_saison, date_fin_saison, lieux: dict) -> list[dict]:
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
                tous_les_matchs.append(nettoyer_match(g, lieux))
        print(f"   ... {debut.isoformat()} → {fin_tranche.isoformat()} : "
              f"{len(resp.get('elements', []))} match(s)")
        debut = fin_tranche + timedelta(days=1)

    return tous_les_matchs


def recuperer_coupe_awbb(session, nonce, season_id, ids_equipes_hainaut, date_debut_saison, date_fin_saison, lieux: dict):
    """Récupère les séries/classements/matchs de la Coupe AWBB (équipes 'R...').

    Organisée au niveau national (organization_id=6), pas par la province.
    On filtre ensuite pour ne garder que ce qui concerne une équipe du
    Hainaut déjà connue — le reste, ce sont des clubs d'autres provinces.
    """
    print("🏆 Récupération des compétitions Coupe AWBB (national)...")
    competitions_resp = call_api(
        session, nonce, "competition/byMyLeague",
        {"organization_id": ORGANIZATION_ID_AWBB, "season_id": season_id},
    )
    competitions_coupe = [
        c for c in competitions_resp.get("elements", [])
        if "coupe" in (c.get("name") or "").lower()
    ]
    competition_ids = [c["id"] for c in competitions_coupe]
    if not competition_ids:
        print("⚠️ Aucune compétition Coupe AWBB trouvée.")
        return [], {}, []

    print(f"✅ {len(competitions_coupe)} compétition(s) Coupe AWBB : "
          + ", ".join(c.get("short_name", "?") for c in competitions_coupe))

    series_resp = call_api(
        session, nonce, "serie/byMyLeague",
        {
            "organization_id": ORGANIZATION_ID_AWBB,
            "season_id": season_id,
            "competition_id": competition_ids,
            "sort": ["competition", "division", "order"],
            "serie_status_id": [0, 1],
        },
    )
    toutes_series = series_resp.get("elements", [])
    print(f"   {len(toutes_series)} série(s) Coupe AWBB au total (toutes provinces).")

    print("   Récupération du calendrier Coupe AWBB — saison complète, par tranches...")
    tous_les_matchs = recuperer_calendrier_saison(
        session, nonce, competition_ids, ORGANIZATION_ID_AWBB, season_id,
        date_debut_saison, date_fin_saison, lieux,
    )

    # On ne garde que les matchs impliquant une équipe du Hainaut déjà connue
    matchs_hainaut = [
        g for g in tous_les_matchs
        if g.get("home_team_id") in ids_equipes_hainaut or g.get("away_team_id") in ids_equipes_hainaut
    ]
    print(f"   ✅ {len(matchs_hainaut)}/{len(tous_les_matchs)} match(s) Coupe AWBB concernent le Hainaut.")

    # On ne garde que les séries qui contiennent au moins un de ces matchs
    series_ids_utiles = {g["serie_id"] for g in matchs_hainaut if g.get("serie_id")}
    series_utiles = [s for s in toutes_series if s["id"] in series_ids_utiles]

    print(f"   Récupération des classements pour {len(series_utiles)} série(s) Coupe AWBB utile(s)...")
    classements_coupe = {}
    for serie in series_utiles:
        serie_id = serie["id"]
        try:
            ranking_resp = call_api(
                session, nonce, "ranking/byMyLeague",
                {"serie_id": serie_id, "organization_id": ORGANIZATION_ID_AWBB, "season_id": season_id},
            )
            # Le classement reste complet (pas filtré) pour situer l'équipe
            # du Hainaut parmi tous ses adversaires de poule.
            classements_coupe[str(serie_id)] = ranking_resp.get("elements", [])
        except Exception as e:
            print(f"   ⚠️ Classement Coupe AWBB indisponible pour {serie.get('name', serie_id)}: {e}")
            classements_coupe[str(serie_id)] = []

    return series_utiles, classements_coupe, matchs_hainaut


def type_de_match(competition_name: str | None) -> str:
    """Classe un match en 'championnat' / 'coupe' / 'amical' selon sa compétition."""
    nom = (competition_name or "").lower()
    if "coupe" in nom:
        return "coupe"
    if "amical" in nom or "tournoi" in nom:
        return "amical"
    return "championnat"


def enrichir_matchs_avec_type(games: list[dict], series: list[dict]) -> None:
    """Ajoute le champ 'match_type' à chaque match, en place."""
    competition_par_serie = {s["id"]: s.get("competition_name") for s in series}
    for g in games:
        g["match_type"] = type_de_match(competition_par_serie.get(g.get("serie_id")))


# --- Génération des agendas .ics (un par équipe) -----------------------

EMOJI_PAR_TYPE = {"coupe": "🏆", "amical": "🤝", "championnat": "🏀"}


def echapper_ics(texte: str) -> str:
    return (
        (texte or "")
        .replace("\\", "\\\\")
        .replace(";", "\\;")
        .replace(",", "\\,")
        .replace("\n", "\\n")
    )


def plier_ligne_ics(ligne: str) -> str:
    """Plie une ligne ICS à 75 octets, comme l'exige la RFC 5545."""
    donnees = ligne.encode("utf-8")
    if len(donnees) <= 75:
        return ligne
    morceaux = []
    reste = ligne
    limite = 75
    while len(reste.encode("utf-8")) > limite:
        coupe = reste[:limite]
        while len(coupe.encode("utf-8")) > limite:
            coupe = coupe[:-1]
        morceaux.append(coupe)
        reste = reste[len(coupe):]
    morceaux.append(reste)
    return ("\r\n ".join(morceaux))


def construire_evenement_ics(match: dict, id_equipe: int) -> str:
    domicile = match.get("home_team_id") == id_equipe
    nom_nous = match.get("home_team_name") if domicile else match.get("away_team_name")
    nom_adversaire = match.get("away_team_name") if domicile else match.get("home_team_name")
    emoji = EMOJI_PAR_TYPE.get(match.get("match_type"), "🏀")

    date_str = match.get("date")
    heure_str = match.get("time") or "00:00:00"
    if not date_str:
        return ""
    dtstart = f"{date_str.replace('-', '')}T{heure_str.replace(':', '')}"

    from datetime import datetime as _dt, timedelta as _td
    debut = _dt.strptime(f"{date_str} {heure_str}", "%Y-%m-%d %H:%M:%S")
    fin = debut + _td(hours=2)
    dtend = fin.strftime("%Y%m%dT%H%M%S")

    lieu = ", ".join(filter(None, [
        match.get("venue_name"), match.get("venue_street"),
        match.get("venue_zip"), match.get("venue_city"),
    ]))

    if domicile:
        resume = f"{emoji} {nom_nous} vs {nom_adversaire}"
    else:
        resume = f"{emoji} {nom_adversaire} vs {nom_nous}"
    description_lignes = [f"Compétition : {match.get('serie_name') or ''}"]
    if match.get("home_score") is not None and match.get("game_status_id") == 2:
        description_lignes.append(f"Score : {match.get('home_score')} - {match.get('away_score')}")
    description = "\n".join(description_lignes)

    dtstamp = datetime.utcnow().strftime("%Y%m%dT%H%M%SZ")

    lignes = [
        "BEGIN:VEVENT",
        f"UID:match-{match.get('id')}@basket-awbb",
        f"DTSTAMP:{dtstamp}",
        f"DTSTART;TZID=Europe/Brussels:{dtstart}",
        f"DTEND;TZID=Europe/Brussels:{dtend}",
        f"SUMMARY:{echapper_ics(resume)}",
    ]
    if lieu:
        lignes.append(f"LOCATION:{echapper_ics(lieu)}")

    lat, lng = match.get("venue_lat"), match.get("venue_lng")
    if lat and lng:
        # GEO (standard RFC 5545) : sépare lat/lng par un point-virgule
        lignes.append(f"GEO:{lat};{lng}")
        # X-APPLE-STRUCTURED-LOCATION : propriété non-standard mais reconnue par
        # Apple Calendrier pour afficher la carte cliquable et calculer le temps
        # de trajet — sans elle, LOCATION reste du texte simple non cliquable.
        titre = (match.get("venue_name") or "Salle").replace('"', "'")
        adresse = lieu.replace('"', "'")
        lignes.append(
            f'X-APPLE-STRUCTURED-LOCATION;VALUE=URI;X-ADDRESS="{adresse}";'
            f'X-APPLE-RADIUS=70;X-TITLE="{titre}":geo:{lat},{lng}'
        )

    lignes.append(f"DESCRIPTION:{echapper_ics(description)}")
    lignes.append("END:VEVENT")
    return "\r\n".join(plier_ligne_ics(l) for l in lignes)


def generer_ics_equipe(nom_equipe: str, matchs: list[dict], id_equipe: int) -> str:
    entete = [
        "BEGIN:VCALENDAR",
        "VERSION:2.0",
        "PRODID:-//Suivi Basket Hainaut//FR",
        "CALSCALE:GREGORIAN",
        "METHOD:PUBLISH",
        f"X-WR-CALNAME:{echapper_ics(nom_equipe)}",
        "X-WR-TIMEZONE:Europe/Brussels",
        "REFRESH-INTERVAL;VALUE=DURATION:PT12H",
        "X-PUBLISHED-TTL:PT12H",
    ]
    evenements = [construire_evenement_ics(m, id_equipe) for m in matchs if m.get("date")]
    return "\r\n".join(entete) + "\r\n" + "\r\n".join(e for e in evenements if e) + "\r\nEND:VCALENDAR\r\n"


def generer_tous_les_agendas(clubs: list[dict], games: list[dict]) -> int:
    """Écrit un fichier calendars/team-<id>.ics par équipe ayant au moins un match.

    Régénéré à chaque passage du robot : un utilisateur ABONNÉ (pas juste
    importé une fois) depuis Apple Calendrier ou Google Agenda verra donc
    les changements du site source apparaître automatiquement.
    """
    import os
    import shutil

    dossier = "calendars"
    if os.path.isdir(dossier):
        shutil.rmtree(dossier)
    os.makedirs(dossier, exist_ok=True)

    compte = 0
    for club in clubs:
        for equipe in club["teams"]:
            id_equipe = equipe["id"]
            matchs_equipe = [
                g for g in games
                if g.get("home_team_id") == id_equipe or g.get("away_team_id") == id_equipe
            ]
            if not matchs_equipe:
                continue
            matchs_equipe.sort(key=lambda g: (g.get("date") or "", g.get("time") or ""))
            contenu = generer_ics_equipe(equipe["name"], matchs_equipe, id_equipe)
            with open(f"{dossier}/team-{id_equipe}.ics", "w", encoding="utf-8", newline="") as f:
                f.write(contenu)
            equipe["ics_url"] = f"{SITE_URL}/calendars/team-{id_equipe}.ics"
            compte += 1
    return compte


def recuperer_classements(session, nonce, series, organization_id, season_id):
    """Récupère le classement de chaque série, avec un peu de parallélisme.

    C'est l'étape la plus lente (un appel par série) — un pool modéré (5 en
    simultané) accélère sans trop solliciter le site, qui a déjà montré une
    instabilité passagère (503) en usage normal ; les tentatives automatiques
    de call_api restent la protection principale contre ça.
    """
    classements = {}

    def recuperer_une_serie(serie):
        try:
            resp = call_api(
                session, nonce, "ranking/byMyLeague",
                {"serie_id": serie["id"], "organization_id": organization_id, "season_id": season_id},
            )
            return serie["id"], resp.get("elements", [])
        except Exception as e:
            print(f"⚠️ Classement indisponible pour la série {serie.get('name', serie['id'])}: {e}")
            return serie["id"], []

    with ThreadPoolExecutor(max_workers=5) as executor:
        for i, (serie_id, lignes) in enumerate(executor.map(recuperer_une_serie, series), start=1):
            classements[str(serie_id)] = lignes
            if i % 20 == 0:
                print(f"   ... {i}/{len(series)} classements récupérés")

    return classements


def recuperer_province(session, nonce, organization_id, nom_province, season_id, saison_courante):
    """Récupère clubs/séries/classements/matchs d'UNE province."""
    print(f"\n=== {nom_province} (organization_id={organization_id}) ===")

    print("🏆 Récupération des compétitions...")
    competitions_resp = call_api(
        session, nonce, "competition/byMyLeague",
        {"organization_id": organization_id, "season_id": season_id},
    )
    competitions = competitions_resp.get("elements", [])
    competition_ids = [c["id"] for c in competitions]
    print(f"✅ {len(competitions)} compétition(s) trouvée(s).")

    if not competition_ids:
        print("❌ Aucune compétition trouvée pour cette province, on passe à la suivante.")
        return [], [], [], {}, [], {}

    print("🏀 Récupération des clubs (équipes, salles, couleurs de logo)...")
    clubs_resp = call_api(
        session, nonce, "club/byMyLeague",
        {
            "organization_id": organization_id,
            "season_id": season_id,
            "competition_id": competition_ids,
            "sort": ["short_name", "reference", "order"],
            "club_status_id": 1,
        },
    )
    clubs_bruts = clubs_resp.get("elements", [])

    lieux = {}
    for c in clubs_bruts:
        for v in (c.get("venues_array") or []):
            if v.get("id") is not None:
                lieux[v["id"]] = {
                    "street": v.get("street"),
                    "zip": v.get("zip"),
                    "lat": v.get("lat"),
                    "lng": v.get("lng"),
                }

    with ThreadPoolExecutor(max_workers=10) as executor:
        clubs = list(executor.map(lambda c: preparer_club(session, c, nom_province), clubs_bruts))
    total_equipes = sum(len(c["teams"]) for c in clubs)
    print(f"✅ {len(clubs)} club(s), {total_equipes} équipe(s) actives cette saison.")

    print("📊 Récupération des séries (divisions)...")
    series_resp = call_api(
        session, nonce, "serie/byMyLeague",
        {
            "organization_id": organization_id,
            "season_id": season_id,
            "competition_id": competition_ids,
            "sort": ["competition", "division", "order"],
            "serie_status_id": [0, 1],
        },
    )
    series = series_resp.get("elements", [])
    print(f"✅ {len(series)} série(s)/division(s) trouvée(s).")

    print("🏆 Récupération des classements par série...")
    classements = recuperer_classements(session, nonce, series, organization_id, season_id)

    print("🗓️ Récupération du calendrier — saison complète, par tranches...")
    games = recuperer_calendrier_saison(
        session, nonce, competition_ids, organization_id, season_id,
        saison_courante.get("start_date"), saison_courante.get("end_date"), lieux,
    )
    print(f"✅ {len(games)} match(s) trouvé(s) sur la saison complète.")

    return clubs, series, competitions, classements, games, lieux


def charger_basket_national():
    session = requests.Session()

    print("🔑 Récupération du jeton de sécurité (nonce)...")
    nonce = get_nonce(session)
    print("✅ Nonce obtenu.")

    print("📅 Détection de la saison en cours...")
    seasons = call_api(session, nonce, "season/byMyLeague", {"organization_id": 2})
    season_list = seasons.get("elements", [])
    saison_courante = next((s for s in season_list if s.get("default") == 1), None)
    if not saison_courante:
        saison_courante = max(season_list, key=lambda s: s.get("end_date", ""))
    season_id = saison_courante["id"]
    print(f"✅ Saison : {saison_courante.get('name')} (id={season_id}, "
          f"{saison_courante.get('start_date')} → {saison_courante.get('end_date')})")

    tous_clubs, toutes_series, toutes_competitions, tous_classements, tous_games = [], [], [], {}, []
    tous_lieux = {}
    ids_matchs_vus = set()

    for organization_id, nom_province in PROVINCES.items():
        clubs, series, competitions, classements, games, lieux = recuperer_province(
            session, nonce, organization_id, nom_province, season_id, saison_courante,
        )
        tous_clubs += clubs
        toutes_series += series
        toutes_competitions += competitions
        tous_classements.update(classements)
        tous_lieux.update(lieux)
        for g in games:
            if g["id"] not in ids_matchs_vus:
                ids_matchs_vus.add(g["id"])
                tous_games.append(g)

    print(f"\n=== National : {len(tous_clubs)} clubs, {len(toutes_series)} séries, "
          f"{len(tous_games)} matchs (avant Coupe AWBB) ===")

    print("🏢 Récupération des infos AWBB (national)...")
    organisation = call_api(session, nonce, f"organization/{ORGANIZATION_ID_AWBB}")

    ids_equipes_connues = {t["id"] for c in tous_clubs for t in c["teams"]}
    series_coupe, classements_coupe, matchs_coupe = recuperer_coupe_awbb(
        session, nonce, season_id, ids_equipes_connues,
        saison_courante.get("start_date"), saison_courante.get("end_date"), tous_lieux,
    )
    toutes_series += series_coupe
    tous_classements.update(classements_coupe)
    for g in matchs_coupe:
        if g["id"] not in ids_matchs_vus:
            ids_matchs_vus.add(g["id"])
            tous_games.append(g)
    print(f"✅ {len(matchs_coupe)} match(s) Coupe AWBB ajouté(s) — total {len(tous_games)} matchs.")

    print("🏷️ Classification des matchs (championnat / coupe / amical)...")
    enrichir_matchs_avec_type(tous_games, toutes_series)

    print("📆 Génération des agendas .ics par équipe...")
    nb_agendas = generer_tous_les_agendas(tous_clubs, tous_games)
    print(f"✅ {nb_agendas} agenda(s) .ics généré(s) dans calendars/.")

    donnees_finales = {
        "generated_at": datetime.utcnow().isoformat() + "Z",
        "organization": organisation.get("data", organisation),
        "season": saison_courante,
        "provinces": list(PROVINCES.values()),
        "competitions": toutes_competitions,
        "clubs": tous_clubs,
        "series": toutes_series,
        "classements": tous_classements,
        "games": tous_games,
    }

    with open("data.json", "w", encoding="utf-8") as f:
        json.dump(donnees_finales, f, ensure_ascii=False, indent=2)

    total_equipes = sum(len(c["teams"]) for c in tous_clubs)
    taille_mo = len(json.dumps(donnees_finales)) / 1_000_000
    print("\n💾 Le fichier data.json a été généré avec succès !")
    print(f"   → {len(tous_clubs)} clubs, {total_equipes} équipes, {len(toutes_series)} séries, "
          f"{len(tous_games)} matchs — {taille_mo:.1f} Mo")


if __name__ == "__main__":
    try:
        charger_basket_national()
    except Exception as exc:
        print(f"❌ Erreur fatale : {exc}", file=sys.stderr)
        sys.exit(1)
