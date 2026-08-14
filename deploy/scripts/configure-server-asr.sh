#!/usr/bin/env bash
set -Eeuo pipefail

SERVICE_NAME="${SCENIC_SERVICE_NAME:-scenic-ai-guide.service}"

if [[ "${EUID}" -ne 0 ]]; then
  echo "Run this script as root." >&2
  exit 1
fi

workdir="$(systemctl show "${SERVICE_NAME}" -p WorkingDirectory --value)"
env_file="${workdir}/.env"
[[ -n "${workdir}" && -f "${env_file}" ]] || {
  echo "Cannot find the service .env file." >&2
  exit 1
}

for name in XFYUN_APP_ID XFYUN_API_KEY XFYUN_API_SECRET; do
  grep -Eq "^${name}=.+" "${env_file}" || {
    echo "${name} is missing or empty; no change was made." >&2
    exit 1
  }
done

backup="${env_file}.bak-asr-$(date -u +%Y%m%dT%H%M%SZ)"
cp -p -- "${env_file}" "${backup}"
rollback_file="${backup}"

# If an interrupted earlier run already changed the file, prefer the newest
# known mock-provider backup as the rollback source.
if grep -qx 'ASR_PROVIDER=xfyun' "${env_file}"; then
  while IFS= read -r candidate; do
    if grep -qx 'ASR_PROVIDER=mock' "${candidate}"; then
      rollback_file="${candidate}"
      break
    fi
  done < <(find "$(dirname "${env_file}")" -maxdepth 1 -type f -name '.env.bak-asr-*' -printf '%T@ %p\n' \
    | sort -rn | cut -d' ' -f2-)
else
  grep -Eq '^ASR_PROVIDER=' "${env_file}" || {
    echo "ASR_PROVIDER is missing; backup: ${backup}" >&2
    exit 1
  }
  sed -i 's/^ASR_PROVIDER=.*/ASR_PROVIDER=xfyun/' "${env_file}"
  chown --reference="${backup}" "${env_file}"
  chmod --reference="${backup}" "${env_file}"
fi

rollback() {
  cp -p -- "${rollback_file}" "${env_file}"
  systemctl restart "${SERVICE_NAME}" || true
}

probe="$(cd "${workdir}" && runuser -u "$(systemctl show "${SERVICE_NAME}" -p User --value)" -- \
  /usr/local/bin/node --input-type=module -e \
  'import("./src/config.mjs").then(({ config }) => console.log(config.providers.asr))')"
if [[ "${probe}" != "xfyun" ]]; then
  rollback
  echo "The application did not resolve ASR_PROVIDER=xfyun; rollback completed." >&2
  exit 1
fi

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
  echo "The service did not become healthy with XFYUN ASR; rollback completed." >&2
  exit 1
fi

echo "PASS ${SERVICE_NAME}: ASR_PROVIDER=xfyun; backup: ${backup}"
