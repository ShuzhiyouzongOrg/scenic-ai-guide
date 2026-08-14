#!/usr/bin/env bash
set -Eeuo pipefail

SERVICE_NAME="${SCENIC_SERVICE_NAME:-scenic-ai-guide.service}"
APP_ROOT="${SCENIC_APP_ROOT:-/opt/scenic-ai-guide}"
PAYLOAD_ROOT="${1:-}"

if [[ "${EUID}" -ne 0 ]]; then
  echo "Run this script as root." >&2
  exit 1
fi
if [[ -z "${PAYLOAD_ROOT}" || ! -d "${PAYLOAD_ROOT}/server/src" ]]; then
  echo "Usage: sudo bash $0 /path/to/payload-root" >&2
  exit 1
fi

required_files=(
  server/src/app.mjs
  server/src/config.mjs
  server/src/http/request.mjs
  server/src/services/voice.mjs
)
for relative_path in "${required_files[@]}"; do
  [[ -f "${PAYLOAD_ROOT}/${relative_path}" ]] || {
    echo "Missing payload file: ${relative_path}" >&2
    exit 1
  }
done

old_release="$(readlink -f "${APP_ROOT}/current")"
[[ -d "${old_release}/server" ]] || {
  echo "The current release cannot be resolved." >&2
  exit 1
}

release_id="$(date -u +%Y%m%d-%H%M%S)-visitor-backend"
new_release="${APP_ROOT}/releases/${release_id}"
install -d -m 0755 "${new_release}"
cp -a --reflink=auto "${old_release}/." "${new_release}/"

for relative_path in "${required_files[@]}"; do
  target="${new_release}/${relative_path}"
  install -o scenic-ai -g scenic-ai -m 0644 "${PAYLOAD_ROOT}/${relative_path}" "${target}"
  /usr/local/bin/node --check "${target}"
done

for name in XFYUN_APP_ID XFYUN_API_KEY XFYUN_API_SECRET; do
  grep -Eq "^${name}=.+" "${new_release}/server/.env" || {
    echo "${name} is missing or empty in the copied production environment." >&2
    exit 1
  }
done
grep -qx 'ASR_PROVIDER=xfyun' "${new_release}/server/.env" || {
  echo "The copied production environment is not configured for XFYUN ASR." >&2
  exit 1
}

next_link="${APP_ROOT}/.current-${release_id}"
ln -s "${new_release}" "${next_link}"
mv -Tf "${next_link}" "${APP_ROOT}/current"

rollback() {
  rollback_link="${APP_ROOT}/.current-rollback-${release_id}"
  ln -s "${old_release}" "${rollback_link}"
  mv -Tf "${rollback_link}" "${APP_ROOT}/current"
  systemctl restart "${SERVICE_NAME}" || true
}

systemctl restart "${SERVICE_NAME}"
healthy=0
for _attempt in 1 2 3 4 5 6 7 8 9 10 11 12 13 14 15; do
  health="$(curl -fsS --max-time 5 http://127.0.0.1:5178/api/health 2>/dev/null || true)"
  if grep -Eq '"asr"[[:space:]]*:[[:space:]]*"xfyun"' <<< "${health}"; then
    healthy=1
    break
  fi
  sleep 1
done
if [[ "${healthy}" -ne 1 ]]; then
  rollback
  echo "The new backend did not become healthy; current was rolled back to ${old_release}." >&2
  exit 1
fi

echo "PASS backend release: ${new_release}"
echo "ROLLBACK target: ${old_release}"
