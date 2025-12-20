#!/usr/bin/env bash
set -e

Dir=$PWD
BASE_URL="$1"
SUBTITLES="${2:-vostfr}"  # argument optionnel, défaut "vostfr"

if [[ -z "$BASE_URL" ]]; then
  echo "Usage: $0 <url_de_la_serie> [subtitles]"
  exit 1
fi

# Nom de la série depuis l'URL
SERIES_NAME=$(basename "$BASE_URL")
echo "[+] Série détectée : $SERIES_NAME"

# Créer dossier série
mkdir -p "$SERIES_NAME"
cd "$SERIES_NAME"

SEASON=1

while true; do
  SEASON_URL="${BASE_URL}saison${SEASON}/${SUBTITLES}/"

  # Vérifier si la page existe
  STATUS=$(curl -s -o /dev/null -w "%{http_code}" "$SEASON_URL")
  if [[ "$STATUS" != "200" ]]; then
    echo "[+] Plus de saisons trouvées après la saison $((SEASON-1))."
    break
  fi

  # Créer dossier saison et lancer capture.js
  SEASON_DIR="Saison_$SEASON"
  mkdir -p "$SEASON_DIR"
  cd "$SEASON_DIR"

  echo "[+] Téléchargement de la saison $SEASON depuis $SEASON_URL"
  node "$Dir/fullSaison.js" "$SEASON_URL"

  cd ..
  ((SEASON++))
done

echo "[+] Toutes les saisons disponibles ont été traitées."

