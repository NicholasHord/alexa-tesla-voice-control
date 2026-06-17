# Public Setup Guide

This project is safe to publish as source code because it contains templates only. Do not commit generated local files.

## One-Shot Server Install

```bash
curl -fsSL https://raw.githubusercontent.com/NicholasHord/alexa-tesla-voice-control/master/scripts/install-home-server.sh | bash
```

The installer:

- clones the repo into `/opt/alexa-tesla`
- creates `.env` from `.env.example`
- generates a local setup token
- creates local `data/`, `keys/`, `certs/`, and `public/` directories
- starts Docker Compose
- prints the setup URL

## Setup Page

Open:

```text
http://SERVER_IP:18765/setup?token=SETUP_TOKEN
```

The setup page can save local configuration, build Tesla OAuth links, exchange a pasted OAuth code, validate the public-key URL, and provide Alexa setup files.

It intentionally does not mount the Docker socket or execute arbitrary shell commands from the browser. Key generation and service restart are shown as copyable commands.

## Tesla Deep Links

After `PUBLIC_BASE_URL` and `TESLA_VIN` are configured, the setup page builds:

```text
https://tesla.com/_ak/YOUR_DOMAIN?vin=YOUR_VIN
```

This is the official virtual-key enrollment flow.

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

## Disable Setup

After configuration succeeds:

1. Set `SETUP_ENABLED=false` in `.env`, or use the setup page field.
2. Restart:

   ```bash
   docker compose up -d
   ```

The Alexa endpoint remains active after setup is disabled.
