# Deployment Guide

## Recommended Infrastructure

Use the self-hosted Docker deployment:

```text
Alexa Custom Skill -> HTTPS reverse proxy/tunnel -> alexa-tesla container -> Tesla command proxy container -> Tesla Fleet API
```

This is the best fit for personal use because:

- It uses only official Tesla OAuth, Fleet API, and virtual-key signing.
- It avoids paid services such as Tessie, IFTTT, Zapier, Home Assistant Cloud, or Voice Monkey.
- It keeps the virtual-key private key on your server instead of inside a cloud function.
- It runs within free infrastructure if you already have a home server and a domain or free tunnel.

## Prerequisites

- Docker and Docker Compose.
- Node.js 20 or newer for helper scripts and local tests.
- A domain or HTTPS tunnel reachable by Alexa.
- A Tesla developer app, OAuth refresh token, VIN, and enrolled virtual key.

For a Git-based home-server trial run, start with [HOME_SERVER_INSTALL.md](HOME_SERVER_INSTALL.md). For Alexa console setup, use [ALEXA_SKILL.md](ALEXA_SKILL.md).

## Environment

Copy and edit:

```bash
cp .env.example .env
```

Required variables:

| Variable | Purpose |
| --- | --- |
| `PUBLIC_BASE_URL` | Public HTTPS base URL for docs and reverse-proxy setup. |
| `ALEXA_SKILL_ID` | Rejects requests from other Alexa skills. |
| `TESLA_CLIENT_ID` | Tesla developer app client ID. |
| `TESLA_CLIENT_SECRET` | Tesla developer app client secret. |
| `TESLA_REFRESH_TOKEN` | Optional bootstrap refresh token. Prefer `TESLA_TOKEN_FILE` after first exchange. |
| `TESLA_VIN` | Vehicle VIN used by API paths. |
| `TESLA_TOKEN_FILE` | Writable JSON file for rotated tokens. |
| `TESLA_COMMAND_PROXY_URL` | Internal URL for Tesla's official command proxy. |
| `TESLA_COMMAND_PROXY_CA_CERT` | CA/cert file trusted by the app for the proxy TLS cert. |
| `HOST_PORT` | Host port bound by Docker Compose. Defaults to `18765` to avoid common conflicts. |
| `COMMAND_PIN` | Optional PIN for unlock and trunk/frunk commands. |

## Generate Local Proxy TLS Certificate

The app connects to the command proxy over HTTPS on Docker's internal network. For a private deployment, a self-signed certificate is fine if the app trusts it:

```bash
mkdir -p certs
openssl req -x509 -newkey rsa:2048 -nodes \
  -keyout certs/proxy-key.pem \
  -out certs/proxy-cert.pem \
  -days 3650 \
  -subj "/CN=tesla-command-proxy" \
  -addext "subjectAltName=DNS:tesla-command-proxy"
```

Keep `certs/proxy-key.pem` out of Git.

## Start

```bash
docker compose up -d --build
docker compose logs -f alexa-tesla
```

Health check:

```bash
curl http://localhost:18765/health
```

## HTTPS Exposure

Alexa requires a public HTTPS endpoint. Good free options:

- Caddy with Let's Encrypt on your own domain.
- nginx with certbot.
- Cloudflare Tunnel free tier.

Example Caddyfile:

```caddyfile
tesla.example.com {
  reverse_proxy 127.0.0.1:18765

  handle /.well-known/appspecific/com.tesla.3p.public-key.pem {
    root * /srv/tesla-public-key
    file_server
  }
}
```

Set the Alexa skill endpoint to:

```text
https://tesla.example.com/alexa
```

## Alexa Skill Setup

1. Create an Alexa Custom Skill.
2. Use the invocation name `tesla`, or adjust `alexa/interaction-model.json`.
3. Import `alexa/interaction-model.json`.
4. Set endpoint type to HTTPS.
5. Endpoint URL: `https://YOUR_DOMAIN/alexa`.
6. Build the interaction model.
7. Test in the Alexa developer console.

Because this is personal-use only, leave the skill in development and do not submit for certification.

## AWS Lambda Alternative

Lambda is not the recommended default for this project. It can be free-tier-friendly for the Alexa webhook, but you would still need the official command signing proxy or equivalent signing environment. That adds more operational complexity than a single self-hosted Docker Compose stack.
