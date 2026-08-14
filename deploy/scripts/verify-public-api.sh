#!/usr/bin/env bash
set -Eeuo pipefail

DOMAIN="${API_DOMAIN:-api.shuzhiyouzong.cn}"
BASE_URL="https://${DOMAIN}"
EXPECTED_IP="${API_EXPECTED_IP:-106.14.12.227}"

tmp_dir="$(mktemp -d)"
cleanup() {
  rm -rf -- "${tmp_dir}"
}
trap cleanup EXIT

curl_args=(--fail --silent --show-error --max-time 20)
if [[ -n "${EXPECTED_IP}" ]]; then
  curl_args+=(--resolve "${DOMAIN}:443:${EXPECTED_IP}")
fi

certificate_text="$(openssl s_client -connect "${EXPECTED_IP:-${DOMAIN}}:443" -servername "${DOMAIN}" </dev/null 2>/dev/null \
  | openssl x509 -noout -subject -issuer -dates -ext subjectAltName)"
grep -Fq "DNS:${DOMAIN}" <<< "${certificate_text}" || {
  echo "TLS certificate SAN does not contain ${DOMAIN}." >&2
  echo "${certificate_text}" >&2
  exit 1
}

check_json() {
  local path="$1"
  local output_name="$2"
  local headers="${tmp_dir}/${output_name}.headers"
  local body="${tmp_dir}/${output_name}.json"

  curl "${curl_args[@]}" --dump-header "${headers}" --output "${body}" "${BASE_URL}${path}"
  grep -Eiq '^content-type:[[:space:]]*application/json' "${headers}" || {
    echo "${path} did not return application/json." >&2
    sed -n '1,20p' "${headers}" >&2
    exit 1
  }
  grep -Eq '"(success|ok)"[[:space:]]*:[[:space:]]*true' "${body}" || {
    echo "${path} did not return a successful API envelope." >&2
    exit 1
  }
}

check_json "/api/health" "health"
check_json "/api/map-guide/bootstrap?area=lingshan" "map-lingshan"
check_json "/api/map-guide/bootstrap?area=nianhuawan" "map-nianhuawan"
check_json "/api/digital-human/config" "digital-human"

http_status="$(curl --silent --output /dev/null --write-out '%{http_code}' --max-time 10 \
  --resolve "${DOMAIN}:80:${EXPECTED_IP}" "http://${DOMAIN}/api/health")"
[[ "${http_status}" == "301" || "${http_status}" == "308" ]] || {
  echo "HTTP did not redirect to HTTPS (status: ${http_status})." >&2
  exit 1
}

echo "PASS ${DOMAIN}: certificate SAN, HTTPS redirect, health, dual-scenic map and digital-human APIs."
