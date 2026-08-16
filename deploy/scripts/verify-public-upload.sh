#!/usr/bin/env bash
set -Eeuo pipefail

BASE_URL="${API_BASE_URL:-https://api.shuzhiyouzong.cn}"
tmp_dir="$(mktemp -d)"
cleanup() {
  rm -rf -- "${tmp_dir}"
}
trap cleanup EXIT

printf 'visitor-upload-probe' >"${tmp_dir}/probe.bin"
status="$(curl --silent --show-error --max-time 90 \
  --output "${tmp_dir}/response.json" \
  --write-out '%{http_code}' \
  --form "audio=@${tmp_dir}/probe.bin;type=application/octet-stream" \
  --form 'question=hello' \
  --form 'sessionId=public-upload-probe' \
  --form 'mode=hybrid' \
  --form 'locale=zh-CN' \
  "${BASE_URL}/api/voice/ask-upload")"

[[ "${status}" == "200" ]] || {
  echo "Upload pipeline returned HTTP ${status}." >&2
  exit 1
}

python3 - "${tmp_dir}/response.json" <<'PY'
import json
import sys

with open(sys.argv[1], "r", encoding="utf-8") as stream:
    payload = json.load(stream)

data = payload.get("data") or {}
checks = {
    "success": payload.get("success") is True,
    "direct input": (data.get("asr") or {}).get("provider") == "direct",
    "answer": bool((data.get("answer") or {}).get("answer")),
    "xfyun tts": (data.get("tts") or {}).get("provider") == "xfyun",
    "audio segment": bool((data.get("tts") or {}).get("segments")),
}
failed = [name for name, passed in checks.items() if not passed]
if failed:
    raise SystemExit("Upload pipeline checks failed: " + ", ".join(failed))
print("PASS upload pipeline: multipart, chat answer, XFYUN TTS and audio segment.")
PY
