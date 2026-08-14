# Public API TLS and reverse proxy

This directory contains an isolated nginx vhost for the visitor application's
public API. It does not replace the `www.shuzhiyouzong.cn` or
`docs.shuzhiyouzong.cn` vhosts and it does not change any GitHub workflow.

## Prerequisites on the Ubuntu server

- `api.shuzhiyouzong.cn` resolves to the server (`106.14.12.227`).
- The Node service is healthy at `http://127.0.0.1:5178/api/health` and returns
  JSON with a successful API envelope.
- Ports 80 and 443 are open.
- nginx, Certbot, curl and OpenSSL are installed.
- The operator has root access. A Let's Encrypt account must already exist, or
  `CERTBOT_EMAIL` must be provided to register one.

The installer first verifies the loopback Node service, backs up only the API
vhost files it owns, installs a temporary ACME vhost, requests a certificate
whose SAN is `api.shuzhiyouzong.cn`, then enables the final reverse proxy. It
refuses to overwrite an unrelated vhost that already declares the API domain.
It also installs a Certbot deploy hook that validates and reloads nginx after
successful certificate renewals.

```bash
cd /path/to/scenic-ai-guide
sudo CERTBOT_EMAIL=operator@example.com bash deploy/scripts/install-api-proxy.sh
```

On a server that already has a Certbot account, `CERTBOT_EMAIL` can be omitted.

The final `/api/` proxy supports normal JSON requests, uploads up to 64 MiB,
SSE without buffering, long-running TTS/ASR requests and WebSocket upgrade
headers. Plain HTTP redirects to HTTPS. Other paths on the API hostname return
a JSON 404 instead of leaking the main website.

Run the read-only public verification at any time:

```bash
bash deploy/scripts/verify-public-api.sh
```

The following optional smoke test performs one real multipart voice request
and therefore consumes a small amount of configured LLM/TTS quota:

```bash
bash deploy/scripts/verify-public-upload.sh
```

If the server already contains the XFYUN AppID/APIKey/APISecret used by TTS,
enable the same provider for ASR without printing or copying those credentials:

```bash
sudo bash deploy/scripts/configure-server-asr.sh
```

The ASR helper backs up `.env`, changes only `ASR_PROVIDER`, probes the resolved
Node configuration, restarts the service and automatically rolls back if the
strict local health check does not report `asr=xfyun`.

When the production server predates the visitor upload/XFYUN-ASR endpoints,
prepare a payload containing only the four committed server files named by the
script, then deploy them as a new immutable release:

```bash
sudo bash deploy/scripts/deploy-visitor-backend.sh /path/to/payload-root
```

This copies the current release, replaces only `app.mjs`, `config.mjs`,
`http/request.mjs` and `services/voice.mjs`, atomically switches `current`, and
rolls back the symlink if the service health check fails. It does not copy an
environment file or database from the operator machine.

For testing before public DNS propagation, the verification script pins curl
to the current production IP. Override or disable that pin when the server IP
changes:

```bash
API_EXPECTED_IP=203.0.113.10 bash deploy/scripts/verify-public-api.sh
API_EXPECTED_IP= bash deploy/scripts/verify-public-api.sh
```

## Rollback

The installer prints a timestamped backup directory under
`/var/backups/scenic-ai-guide/`. Restore `site-available`, `site-enabled` and
`upgrade-map.conf` from that directory, run `sudo nginx -t`, then
`sudo systemctl reload nginx`. The certificate can remain installed; it does
not affect another vhost unless nginx references it.
