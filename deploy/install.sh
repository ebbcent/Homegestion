#!/usr/bin/env bash
# Installe ou met à jour Homegestion sur un VPS Debian/Ubuntu, sans Docker.
# Usage (depuis le dossier décompressé) : sudo ./deploy/install.sh
# Relancer le même script après avoir décompressé une nouvelle version suffit pour mettre à jour.
set -euo pipefail

APP_DIR=/opt/homegestion
DATA_DIR=/var/lib/homegestion
ENV_FILE=/etc/homegestion.env
APP_USER=homegestion
PORT=3000
SRC="$(cd "$(dirname "$0")/.." && pwd)"

say() { printf '\n\033[1;34m==> %s\033[0m\n' "$*"; }
die() { printf '\n\033[1;31mErreur : %s\033[0m\n' "$*" >&2; exit 1; }

[ "$(id -u)" -eq 0 ] || die "lance ce script avec sudo."
command -v apt-get >/dev/null || die "ce script vise Debian ou Ubuntu (apt-get introuvable)."
[ -f "$SRC/server/dist/index.js" ] && [ -f "$SRC/web/dist/index.html" ] || die "lance le script depuis le dossier homegestion décompressé."

# ---------- Configuration (demandée une seule fois) ----------
if [ -f "$ENV_FILE" ]; then
  say "Configuration existante conservée ($ENV_FILE)"
  DOMAIN="$(grep -E '^DOMAIN=' "$ENV_FILE" | cut -d= -f2-)"
else
  read -rp "Nom de domaine qui pointe vers ce VPS (ex. maison.mondomaine.fr) : " DOMAIN
  [ -n "$DOMAIN" ] || die "domaine obligatoire (le HTTPS en dépend)."
  while :; do
    read -rsp "Mot de passe de l'application (12 caractères minimum) : " PW1; echo
    read -rsp "Confirme le mot de passe : " PW2; echo
    [ "$PW1" = "$PW2" ] || { echo "Les deux saisies diffèrent."; continue; }
    [ "${#PW1}" -ge 12 ] || { echo "Trop court."; continue; }
    break
  done
  umask 077
  printf 'DOMAIN=%s\nAPP_PASSWORD=%s\n' "$DOMAIN" "$PW1" > "$ENV_FILE"
  umask 022
fi

# ---------- Vérifications ----------
CADDYFILE=/etc/caddy/Caddyfile
if ! command -v caddy >/dev/null; then
  for p in 80 443; do
    if ss -ltnH "sport = :$p" | grep -q .; then
      die "le port $p est déjà utilisé (nginx ou apache ?). Dis-le à Claude : il faudra brancher Homegestion sur ce serveur existant."
    fi
  done
elif [ -f "$CADDYFILE" ] && ! grep -q '# homegestion' "$CADDYFILE" && ! grep -q '/usr/share/caddy' "$CADDYFILE"; then
  die "Caddy est déjà configuré pour d'autres sites ($CADDYFILE). Ajoute à la main le bloc de deploy/Caddyfile.example."
fi

# ---------- Paquets ----------
say "Paquets système"
apt-get update -qq
apt-get install -y -qq curl ca-certificates gnupg debian-keyring debian-archive-keyring apt-transport-https >/dev/null

NODE_MAJOR="$(node -v 2>/dev/null | sed -E 's/^v([0-9]+).*/\1/' || true)"
NODE_MINOR="$(node -v 2>/dev/null | sed -E 's/^v[0-9]+\.([0-9]+).*/\1/' || true)"
if [ -z "$NODE_MAJOR" ] || [ "$NODE_MAJOR" -lt 22 ] || { [ "$NODE_MAJOR" -eq 22 ] && [ "$NODE_MINOR" -lt 13 ]; }; then
  say "Installation de Node.js 22"
  curl -fsSL https://deb.nodesource.com/setup_22.x | bash - >/dev/null
  apt-get install -y -qq nodejs >/dev/null
fi
echo "Node $(node -v)"

if ! command -v caddy >/dev/null; then
  say "Installation de Caddy (HTTPS automatique)"
  curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | gpg --dearmor --yes -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
  curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' > /etc/apt/sources.list.d/caddy-stable.list
  apt-get update -qq
  apt-get install -y -qq caddy >/dev/null
fi

# ---------- Application ----------
say "Copie de l'application dans $APP_DIR"
id "$APP_USER" >/dev/null 2>&1 || useradd --system --home "$DATA_DIR" --shell /usr/sbin/nologin "$APP_USER"
mkdir -p "$APP_DIR" "$DATA_DIR"
chown "$APP_USER:$APP_USER" "$DATA_DIR"
chmod 750 "$DATA_DIR"
rm -rf "$APP_DIR/server" "$APP_DIR/web"
mkdir -p "$APP_DIR/server" "$APP_DIR/web"
cp -a "$SRC/package.json" "$SRC/package-lock.json" "$APP_DIR/"
cp -a "$SRC/server/dist" "$APP_DIR/server/"
cp -a "$SRC/web/dist" "$APP_DIR/web/"
(cd "$APP_DIR" && npm ci --omit=dev --no-audit --no-fund --loglevel=error)

cat > /etc/systemd/system/homegestion.service <<UNIT
[Unit]
Description=Homegestion (factures et budget de la maison)
After=network.target

[Service]
User=$APP_USER
WorkingDirectory=$APP_DIR
EnvironmentFile=$ENV_FILE
Environment=NODE_ENV=production DATA_DIR=$DATA_DIR PORT=$PORT HOST=127.0.0.1
ExecStart=/usr/bin/node --disable-warning=ExperimentalWarning server/dist/index.js
Restart=always
RestartSec=3
NoNewPrivileges=true
ProtectSystem=strict
ProtectHome=true
PrivateTmp=true
ReadWritePaths=$DATA_DIR

[Install]
WantedBy=multi-user.target
UNIT

# Sauvegarde quotidienne de la base à 3 h 30, conservée 30 jours.
cat > /etc/cron.d/homegestion <<CRON
30 3 * * * $APP_USER cd $APP_DIR && DATA_DIR=$DATA_DIR /usr/bin/node --disable-warning=ExperimentalWarning server/dist/backup.js >/dev/null && find $DATA_DIR/backups -name '*.db' -mtime +30 -delete
CRON

# ---------- HTTPS ----------
say "Configuration de Caddy pour $DOMAIN"
cat > "$CADDYFILE" <<CADDY
# homegestion
$DOMAIN {
	encode zstd gzip
	reverse_proxy 127.0.0.1:$PORT
	header Strict-Transport-Security "max-age=31536000"
}
CADDY

if command -v ufw >/dev/null && ufw status | grep -q "Status: active"; then
  ufw allow 80/tcp >/dev/null; ufw allow 443/tcp >/dev/null
fi

systemctl daemon-reload
systemctl enable --now homegestion >/dev/null 2>&1
systemctl restart homegestion
systemctl enable caddy >/dev/null 2>&1
systemctl reload caddy 2>/dev/null || systemctl restart caddy

sleep 2
if curl -fsS "http://127.0.0.1:$PORT/api/auth/status" >/dev/null; then
  say "C'est en ligne : https://$DOMAIN"
  echo "(Le certificat HTTPS peut prendre une minute à la première visite.)"
else
  die "le service ne répond pas. Regarde : journalctl -u homegestion -n 50"
fi
