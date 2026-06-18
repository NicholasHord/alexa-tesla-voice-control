# Home Server Install

Use this guide to install the project on a Docker-capable Linux server.

## Recommended Layout

```text
/opt/alexa-tesla/
  .env
  certs/
  data/
  keys/
  public/
  docker-compose.yml
```

## 1. One-Shot Install

```bash
curl -fsSL https://raw.githubusercontent.com/NicholasHord/alexa-tesla-voice-control/master/scripts/install-home-server.sh | bash
```

The installer requires Docker by default. If Docker is not installed and you want to use Docker's official Linux convenience installer, opt in explicitly:

```bash
curl -fsSL https://raw.githubusercontent.com/NicholasHord/alexa-tesla-voice-control/master/scripts/install-home-server.sh | INSTALL_DOCKER=1 bash
```

The installer checks that `HOST_PORT` is available, starts the setup UI, and prints a setup URL with a local setup token. Keep that URL private.

## 2. Manual Clone from Git

Manual install:

```bash
sudo mkdir -p /opt/alexa-tesla
sudo chown "$USER:$USER" /opt/alexa-tesla
git clone https://github.com/NicholasHord/alexa-tesla-voice-control.git /opt/alexa-tesla
cd /opt/alexa-tesla
```

Use `git@github.com:NicholasHord/alexa-tesla-voice-control.git` instead if your server uses SSH keys.

## 3. Prepare Local Files

```bash
./scripts/home-server-setup.sh
```

This creates:

- `.env` from `.env.example` if one does not already exist.
- `data/` for refreshed Tesla tokens and command-session cache.
- `keys/` for Tesla virtual-key material.
- `public/` for the Tesla public key served by the app.
- `certs/` for the internal TLS certificate used by Tesla's command proxy.

The setup script does not overwrite existing secrets.

## 4. Open Web Setup

Start the setup UI:

```bash
docker compose up -d --build
```

Open:

```text
http://SERVER_IP:18765/setup?token=SETUP_TOKEN
```

The setup token is in `.env` as `SETUP_ADMIN_TOKEN`. The host port is in `.env` as `HOST_PORT`; the default is `18765`.

## 5. Generate the Tesla Virtual Key

```bash
./scripts/generate-tesla-virtual-key.sh
```

This uses Tesla's official `tesla/vehicle-command` Docker image and writes:

```text
keys/private-key.pem
keys/public-key.pem
public/com.tesla.3p.public-key.pem
```

Keep `keys/private-key.pem` private. The app serves only `public/com.tesla.3p.public-key.pem`.

The script also writes `COMPOSE_PROFILES=vehicle-commands` to `.env` so the Tesla command proxy starts after the next Docker Compose restart. Before this key step, only the setup UI runs.

## 6. Configure `.env`

Edit:

```bash
nano .env
```

Minimum values to set:

```text
PUBLIC_BASE_URL=https://tesla.example.com
ALEXA_SKILL_ID=amzn1.ask.skill.xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
TESLA_CLIENT_ID=your_tesla_client_id
TESLA_CLIENT_SECRET=your_tesla_client_secret
TESLA_VIN=your_vehicle_vin
COMMAND_PIN=1234
```

Leave these defaults unless your Tesla Fleet API region is different:

```text
TESLA_AUDIENCE=https://fleet-api.prd.na.vn.cloud.tesla.com
TESLA_AUTH_BASE_URL=https://fleet-auth.prd.vn.cloud.tesla.com
TESLA_FLEET_BASE_URL=https://fleet-api.prd.na.vn.cloud.tesla.com
TESLA_PARTNER_SCOPES=openid vehicle_device_data vehicle_cmds
TESLA_TOKEN_FILE=/app/data/tesla-tokens.json
TESLA_COMMAND_PROXY_URL=https://tesla-command-proxy:4443
TESLA_COMMAND_PROXY_CA_CERT=/app/certs/proxy-cert.pem
HOST_PORT=18765
```

## 7. Publish the Tesla Public Key

The app serves this URL:

```text
https://YOUR_DOMAIN/.well-known/appspecific/com.tesla.3p.public-key.pem
```

With Caddy, one straightforward reverse-proxy pattern is:

```caddyfile
tesla.example.com {
  reverse_proxy 127.0.0.1:18765
}
```

Use the setup page `Check` button to confirm the public HTTPS URL returns PEM public-key content.

## 8. Register the Tesla Partner Domain

In the setup page:

1. Click `Check partner token` to verify the Tesla client credentials can request a short-lived partner token.
2. Click `Register domain` after the public key URL check passes.
3. Click `Check registration` to confirm Tesla can read the public key for your domain.

These actions call Tesla's partner endpoints with the public host from `PUBLIC_BASE_URL`. They do not expose the partner access token in the browser.

## 9. Enroll the Key on the Car

Open this on your phone while signed into the Tesla app:

```text
https://tesla.com/_ak/YOUR_DOMAIN?vin=YOUR_VIN
```

Approve the key enrollment. The vehicle must be reachable.

## 10. Complete Tesla OAuth

The setup page can build the Tesla authorization URL and exchange a pasted code for a local token file.

Manual script path:

Build the Tesla authorization URL:

```bash
docker compose run --rm alexa-tesla node scripts/build-authorize-url.js
```

Open the URL, approve scopes, then copy the `code` query parameter from the redirect.

Exchange it:

```bash
docker compose run --rm alexa-tesla node scripts/exchange-code.js "PASTE_CODE_HERE"
```

The token file is written under `data/` through the Docker volume.

## 11. Create the Alexa Skill

Open the Alexa developer console from the setup page or directly:

```text
https://developer.amazon.com/alexa/console/ask
```

Use the interaction model download and set the HTTPS endpoint to:

```text
https://YOUR_DOMAIN/alexa
```

The setup page also provides a customized `skill.json` download with the endpoint filled in from `PUBLIC_BASE_URL`.

## 12. Start or Restart the Service

```bash
docker compose up -d --build
docker compose ps
curl http://localhost:18765/health
```

Follow logs:

```bash
docker compose logs -f alexa-tesla tesla-command-proxy
```

## 13. Validate Before Alexa

```bash
./scripts/validate-home-server.sh
```

This checks that required files, Docker, and required `.env` values are present. It does not call Tesla or expose secrets.

## 14. Disable Setup

After the status cards are green enough for your setup and Alexa is working, click `Disable setup` on the setup page and restart:

```bash
docker compose up -d
```

The `/alexa` and `/health` endpoints remain active.

## 15. Update Later

```bash
./scripts/update-home-server.sh
```

This pulls Git changes, pulls container updates, rebuilds the app, and restarts the stack.
