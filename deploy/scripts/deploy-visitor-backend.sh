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
  server/src/contracts/openapi.json
  server/src/http/request.mjs
  server/src/services/auth.mjs
  server/src/services/digitalHumanWeb.mjs
  server/src/services/profileAvatar.mjs
  server/src/services/voice.mjs
  server/src/web/digital-human/index.html
  server/src/web/digital-human/app.js
  server/src/web/digital-human/styles.css
  web/src/vm-sdk/avatar-sdk-web_3.1.1.1011/index.js
  web/src/vm-sdk/avatar-sdk-web_3.1.1.1011/index-_37811BO.js
  web/src/vm-sdk/avatar-sdk-web_3.1.1.1011/webrtc-player-6-MVvVqH.js
  web/src/vm-sdk/avatar-sdk-web_3.1.1.1011/xrtc-player-BDn4MFE-.js
)
required_directories=(
  server/src/web/live2d
)
for relative_path in "${required_files[@]}"; do
  [[ -f "${PAYLOAD_ROOT}/${relative_path}" ]] || {
    echo "Missing payload file: ${relative_path}" >&2
    exit 1
  }
done
for relative_path in "${required_directories[@]}"; do
  [[ -d "${PAYLOAD_ROOT}/${relative_path}" ]] || {
    echo "Missing payload directory: ${relative_path}" >&2
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
  install -d -o scenic-ai -g scenic-ai -m 0755 "$(dirname "${target}")"
  install -o scenic-ai -g scenic-ai -m 0644 "${PAYLOAD_ROOT}/${relative_path}" "${target}"
  case "${relative_path}" in
    *.mjs|server/src/web/digital-human/app.js)
      /usr/local/bin/node --check "${target}"
      ;;
  esac
done

for relative_path in "${required_directories[@]}"; do
  target="${new_release}/${relative_path}"
  install -d -o scenic-ai -g scenic-ai -m 0755 "${target}"
  cp -a "${PAYLOAD_ROOT}/${relative_path}/." "${target}/"
  chown -R scenic-ai:scenic-ai "${target}"
done
/usr/local/bin/node --check "${new_release}/server/src/web/live2d/runtime.js"

for name in XFYUN_APP_ID XFYUN_API_KEY XFYUN_API_SECRET; do
  grep -Eq "^${name}=.+" "${new_release}/server/.env" || {
    echo "${name} is missing or empty in the copied production environment." >&2
    exit 1
  }
done
avatar_session_secret="$(sed -n 's/^XFYUN_AVATAR_SESSION_SECRET=//p' "${new_release}/server/.env" | tail -n 1)"
if [[ -z "${avatar_session_secret}" ]]; then
  avatar_session_secret="$(sed -n 's/^JWT_SECRET=//p' "${new_release}/server/.env" | tail -n 1)"
fi
if [[ "${#avatar_session_secret}" -lt 32 ]]; then
  echo "XFYUN_AVATAR_SESSION_SECRET (or JWT_SECRET fallback) must contain at least 32 characters." >&2
  exit 1
fi
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

avatar_page="$(curl -fsS --max-time 5 http://127.0.0.1:5178/digital-human/ 2>/dev/null || true)"
if ! grep -q '启动动态数字人' <<< "${avatar_page}"; then
  rollback
  echo "The controlled digital-human page did not become healthy; current was rolled back to ${old_release}." >&2
  exit 1
fi

live2d_page="$(curl -fsS --max-time 5 http://127.0.0.1:5178/live2d/ 2>/dev/null || true)"
live2d_model="$(curl -fsS --max-time 5 http://127.0.0.1:5178/live2d/characters/Haru/Haru.model3.json 2>/dev/null || true)"
if ! grep -q 'live2dCanvas' <<< "${live2d_page}" || ! grep -q 'haru.moc3' <<< "${live2d_model}"; then
  rollback
  echo "The controlled Live2D runtime did not become healthy; current was rolled back to ${old_release}." >&2
  exit 1
fi

echo "PASS backend release: ${new_release}"
echo "ROLLBACK target: ${old_release}"
