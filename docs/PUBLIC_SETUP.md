# Public Setup Guide

This project is safe to publish as source code because it contains templates only. Do not commit generated local files.

## One-Shot Server Install

```bash
curl -fsSL https://raw.githubusercontent.com/NicholasHord/alexa-tesla-voice-control/master/scripts/install-home-server.sh | bash
```

Optional Docker install path:

```bash
curl -fsSL https://raw.githubusercontent.com/NicholasHord/alexa-tesla-voice-control/master/scripts/install-home-server.sh | INSTALL_DOCKER=1 bash
```

The installer:

- clones the repo into `/opt/alexa-tesla`
- creates `.env` from `.env.example`
- generates a local setup token
- creates local `data/`, `keys/`, `certs/`, and `public/` directories
- checks that `HOST_PORT` is available
- starts Docker Compose for the setup UI
- prints the setup URL

The Tesla command proxy starts only after `scripts/generate-tesla-virtual-key.sh` creates keys and enables `COMPOSE_PROFILES=vehicle-commands`.

## Setup Page

Open:

```text
http://SERVER_IP:18765/setup?token=SETUP_TOKEN
```

The setup page can save local configuration, show setup status cards, validate the public-key URL, request a Tesla partner token, register/check the Tesla partner domain, build Tesla OAuth links, exchange a pasted OAuth code, and provide Alexa setup files.

It intentionally does not mount the Docker socket or execute arbitrary shell commands from the browser. Key generation and service restart are shown as copyable commands.

## Tesla Deep Links

After `PUBLIC_BASE_URL` and `TESLA_VIN` are configured, the setup page builds:

```text
https://tesla.com/_ak/YOUR_DOMAIN?vin=YOUR_VIN
```

This is the official virtual-key enrollment flow.

## Tesla Partner Registration

After the public key URL check succeeds, use the setup page to:

1. Check the partner token request.
2. Register the domain from `PUBLIC_BASE_URL`.
3. Check Tesla's public-key registration endpoint.

Each developer app/domain still has to be valid in Tesla's developer portal. The setup page cannot bypass Tesla approval or account ownership checks.

## Alexa Links

The setup page links to:

```text
https://developer.amazon.com/alexa/console/ask
```

Create a Custom Skill, set the endpoint to:

```text
https://YOUR_DOMAIN/alexa
```

Then import the interaction model from the setup page or from:

```text
alexa/interaction-model.json
```

You can also download a customized `skill.json` from the setup page after `PUBLIC_BASE_URL` is set.

## What This Cannot Automate

- Tesla developer app creation and approval.
- Tesla account consent and vehicle virtual-key enrollment.
- Alexa developer console skill creation, build, and testing enablement.
- Public HTTPS setup for your domain or tunnel.

## Disable Setup

After configuration succeeds:

1. Click `Disable setup` on the setup page, or set `SETUP_ENABLED=false` in `.env`.
2. Restart:

   ```bash
   docker compose up -d
   ```

The Alexa endpoint remains active after setup is disabled.
