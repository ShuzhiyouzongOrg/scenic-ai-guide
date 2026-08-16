#!/usr/bin/env bash
set -Eeuo pipefail

DOMAIN="api.shuzhiyouzong.cn"
UPSTREAM_HEALTH="http://127.0.0.1:5178/api/health"
SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd -- "${SCRIPT_DIR}/../.." && pwd)"
NGINX_SOURCE="${REPO_ROOT}/deploy/nginx"
SITE_AVAILABLE="/etc/nginx/sites-available/${DOMAIN}"
SITE_ENABLED="/etc/nginx/sites-enabled/${DOMAIN}"
UPGRADE_MAP="/etc/nginx/conf.d/scenic-ai-guide-upgrade-map.conf"
CERTBOT_DEPLOY_HOOK="/etc/letsencrypt/renewal-hooks/deploy/scenic-ai-guide-reload-nginx"
ACME_ROOT="/var/www/letsencrypt"
BACKUP_ROOT="/var/backups/scenic-ai-guide/nginx-$(date -u +%Y%m%dT%H%M%SZ)"

if [[ "${EUID}" -ne 0 ]]; then
  echo "Run this script as root: sudo CERTBOT_EMAIL=you@example.com bash $0" >&2
  exit 1
fi

for command_name in nginx certbot curl openssl install readlink; do
  command -v "${command_name}" >/dev/null 2>&1 || {
    echo "Missing required command: ${command_name}" >&2
    exit 1
  }
done

health_headers="$(mktemp)"
health_body="$(mktemp)"
verification_log="$(mktemp)"
cleanup() {
  rm -f "${health_headers}" "${health_body}" "${verification_log}"
}
trap cleanup EXIT

curl --fail --silent --show-error --max-time 10 \
  --dump-header "${health_headers}" \
  --output "${health_body}" \
  "${UPSTREAM_HEALTH}"

grep -Eiq '^content-type:[[:space:]]*application/json' "${health_headers}" || {
  echo "The loopback upstream did not return JSON from ${UPSTREAM_HEALTH}; nginx was not changed." >&2
  exit 1
}
grep -Eq '"(success|ok)"[[:space:]]*:[[:space:]]*true' "${health_body}" || {
  echo "The loopback upstream health body is not successful; nginx was not changed." >&2
  exit 1
}

install -d -m 0755 "${BACKUP_ROOT}" "${ACME_ROOT}" /etc/nginx/sites-available /etc/nginx/sites-enabled /etc/nginx/conf.d /etc/letsencrypt/renewal-hooks/deploy

if [[ -e "${SITE_AVAILABLE}" || -L "${SITE_AVAILABLE}" ]]; then
  cp -a "${SITE_AVAILABLE}" "${BACKUP_ROOT}/site-available"
fi
if [[ -e "${SITE_ENABLED}" || -L "${SITE_ENABLED}" ]]; then
  cp -a --no-dereference "${SITE_ENABLED}" "${BACKUP_ROOT}/site-enabled"
fi
if [[ -e "${UPGRADE_MAP}" ]]; then
  cp -a "${UPGRADE_MAP}" "${BACKUP_ROOT}/upgrade-map.conf"
fi
if [[ -e "${CERTBOT_DEPLOY_HOOK}" ]]; then
  cp -a "${CERTBOT_DEPLOY_HOOK}" "${BACKUP_ROOT}/certbot-deploy-hook"
fi

# Refuse to silently override an unrelated explicit vhost. A default catch-all
# is safe and will be superseded by this exact server_name.
duplicate_sites="$(grep -RIlE "server_name[[:space:]]+([^;[:space:]]+[[:space:]]+)*${DOMAIN}([[:space:];])" /etc/nginx/sites-enabled 2>/dev/null || true)"
while IFS= read -r duplicate_site; do
  [[ -z "${duplicate_site}" ]] && continue
  [[ "$(readlink -f "${duplicate_site}")" == "$(readlink -m "${SITE_AVAILABLE}")" ]] && continue
  echo "Refusing to modify nginx: ${duplicate_site} already declares ${DOMAIN}. Disable or merge it manually." >&2
  exit 1
done <<< "${duplicate_sites}"

install -m 0644 "${NGINX_SOURCE}/conf.d/scenic-ai-guide-upgrade-map.conf" "${UPGRADE_MAP}"
install -m 0755 "${REPO_ROOT}/deploy/certbot/reload-nginx.sh" "${CERTBOT_DEPLOY_HOOK}"
install -m 0644 "${NGINX_SOURCE}/sites-available/${DOMAIN}.http-bootstrap.conf" "${SITE_AVAILABLE}"
ln -sfn "${SITE_AVAILABLE}" "${SITE_ENABLED}"
nginx -t
systemctl reload nginx

certbot_args=(
  certonly
  --non-interactive
  --agree-tos
  --webroot --webroot-path "${ACME_ROOT}"
  --cert-name "${DOMAIN}"
  --domain "${DOMAIN}"
  --keep-until-expiring
)
if [[ -n "${CERTBOT_EMAIL:-}" ]]; then
  certbot_args+=(--email "${CERTBOT_EMAIL}")
fi
certbot "${certbot_args[@]}"

install -m 0644 "${NGINX_SOURCE}/sites-available/${DOMAIN}.conf" "${SITE_AVAILABLE}"
nginx -t
systemctl reload nginx

verified=0
for _attempt in 1 2 3 4 5 6 7 8 9 10; do
  if bash "${SCRIPT_DIR}/verify-public-api.sh" >"${verification_log}" 2>&1; then
    cat "${verification_log}"
    verified=1
    break
  fi
  sleep 1
done
if [[ "${verified}" -ne 1 ]]; then
  cat "${verification_log}" >&2
  echo "nginx was reloaded, but public verification did not pass within 10 seconds." >&2
  exit 1
fi
echo "API TLS and reverse proxy are active. Backup: ${BACKUP_ROOT}"
