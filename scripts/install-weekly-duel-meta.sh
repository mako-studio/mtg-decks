#!/bin/zsh
# Programme la mise à jour HEBDOMADAIRE de l'échantillon Duel Commander sur
# le Mac de Ben (25/09/2026, demande de Ben : « mise à jour automatique »).
#
#   zsh scripts/install-weekly-duel-meta.sh             # installe (lundi 8h17)
#   zsh scripts/install-weekly-duel-meta.sh --uninstall # désinstalle
#   zsh scripts/install-weekly-duel-meta.sh --run-now   # lance tout de suite une fois (test)
#
# Mécanisme : un « LaunchAgent » macOS (planificateur intégré au système, pas
# de logiciel à installer). Chaque lundi à 8h17 il lance
#   node scripts/fetch-duel-meta.mjs --weeks 4
# (4 semaines de recouvrement : les decks déjà archivés sont ignorés, seuls
# les nouveaux sont téléchargés), puis affiche une notification.
# Si le Mac dort à 8h17, macOS lance la tâche au réveil ; s'il est éteint,
# elle attend le lundi suivant.
#
# Le script NE COMMITE RIEN : les fichiers mis à jour
# (src/data/duel-*.json, analysis/duelcommander/decks-mtgtop8.json)
# apparaissent dans GitHub Desktop, Ben relit et commite lui-même.
#
# Au premier lancement, macOS peut demander si « node » a le droit d'accéder
# au dossier Documents : il faut accepter, sinon la tâche échoue (voir le
# journal ~/Library/Logs/mtg-opti-duel-meta.log).
set -e

LABEL="io.mtgopti.duelmeta"
PLIST="$HOME/Library/LaunchAgents/$LABEL.plist"
LOG="$HOME/Library/Logs/mtg-opti-duel-meta.log"
REPO="$(cd "$(dirname "$0")/.." && pwd)"
NODE="$(command -v node || true)"

if [[ "$1" == "--uninstall" ]]; then
  launchctl bootout "gui/$(id -u)" "$PLIST" 2>/dev/null || true
  rm -f "$PLIST"
  echo "Tâche hebdomadaire désinstallée."
  exit 0
fi

if [[ -z "$NODE" ]]; then
  echo "Node.js introuvable : installe-le (https://nodejs.org) puis relance ce script."
  exit 1
fi

if [[ "$1" == "--run-now" ]]; then
  cd "$REPO" && "$NODE" scripts/fetch-duel-meta.mjs --weeks 4
  exit $?
fi

mkdir -p "$HOME/Library/LaunchAgents" "$HOME/Library/Logs"
CMD="cd '$REPO' && echo \"--- \$(date) ---\" && '$NODE' scripts/fetch-duel-meta.mjs --weeks 4 && /usr/bin/osascript -e 'display notification \"Nouveaux decks de tournoi ajoutés — relis et commite dans GitHub Desktop.\" with title \"MTG Opti\"' || /usr/bin/osascript -e 'display notification \"Échec de la mise à jour — voir ~/Library/Logs/mtg-opti-duel-meta.log\" with title \"MTG Opti\"'"

# La commande est insérée dans du XML : « & », « < », « > » doivent être échappés.
CMD_XML="$(printf '%s' "$CMD" | sed -e 's/&/\&amp;/g' -e 's/</\&lt;/g' -e 's/>/\&gt;/g')"

cat > "$PLIST" <<PLISTEOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key><string>$LABEL</string>
  <key>ProgramArguments</key>
  <array>
    <string>/bin/zsh</string>
    <string>-lc</string>
    <string>$CMD_XML</string>
  </array>
  <key>StartCalendarInterval</key>
  <dict>
    <key>Weekday</key><integer>1</integer>
    <key>Hour</key><integer>8</integer>
    <key>Minute</key><integer>17</integer>
  </dict>
  <key>StandardOutPath</key><string>$LOG</string>
  <key>StandardErrorPath</key><string>$LOG</string>
</dict>
</plist>
PLISTEOF

launchctl bootout "gui/$(id -u)" "$PLIST" 2>/dev/null || true
launchctl bootstrap "gui/$(id -u)" "$PLIST"
echo "Installé : chaque lundi à 8h17 (journal : $LOG)."
echo "Test immédiat possible : zsh scripts/install-weekly-duel-meta.sh --run-now"
