# Alexa Tesla Voice Control

Personal-use Alexa Custom Skill service for Tesla voice commands using Tesla Fleet API, official Tesla OAuth, and Tesla virtual-key command authorization.

## Where It Runs

The intended install target is a Docker-capable home server:

```text
git clone -> edit .env -> enroll Tesla virtual key -> complete Tesla OAuth -> docker compose up
```

The Alexa skill is configured separately in the Alexa developer console. Echo devices do not install this Git repo directly; they invoke your Alexa development skill, which calls the HTTPS endpoint running on your server.

## Architecture

```text
Alexa device
  -> Alexa Custom Skill
  -> HTTPS endpoint on your domain
  -> alexa-tesla Node.js service
       -> validates Alexa request signature and skill id
       -> checks optional command PIN for sensitive commands
       -> refreshes Tesla OAuth tokens as needed
       -> reads vehicle state/status via Tesla Fleet API
       -> sends command requests to tesla-http-proxy
  -> Tesla official vehicle-command proxy container
       -> signs commands with virtual-key private key
       -> forwards commands to Tesla Fleet API
  -> Tesla vehicle
```

The lowest-cost recommended deployment is Docker on your home server behind a free HTTPS reverse proxy such as Caddy with Let's Encrypt, nginx with Let's Encrypt, or a free Cloudflare Tunnel. AWS Lambda is not the primary path here because the official command proxy and vehicle private key are simpler and safer to run on your own host.

## One-Shot Install

On a Linux server with Docker and Git:

```bash
curl -fsSL https://raw.githubusercontent.com/NicholasHord/alexa-tesla-voice-control/master/scripts/install-home-server.sh | bash
```

The installer clones this repo into `/opt/alexa-tesla`, prepares local secret directories, starts Docker Compose, and prints a setup URL like:

```text
http://SERVER_IP:18765/setup?token=SETUP_TOKEN
```

For manual install:

```bash
sudo mkdir -p /opt/alexa-tesla
sudo chown "$USER:$USER" /opt/alexa-tesla
git clone https://github.com/NicholasHord/alexa-tesla-voice-control.git /opt/alexa-tesla
cd /opt/alexa-tesla
./scripts/home-server-setup.sh
docker compose up -d --build
```

## Web Setup

Open the setup URL printed by the installer. The page is protected by `SETUP_ADMIN_TOKEN`.

The setup page can:

- save local `.env` values
- show the Tesla public-key URL
- check whether the Tesla public key is reachable
- build the Tesla OAuth authorization link
- exchange the pasted Tesla OAuth code for a local token file
- download the Alexa interaction model
- show copyable commands for key generation and Docker restart

Tesla developer app creation, Tesla virtual-key enrollment, and Alexa skill creation still require account-owner confirmation in Tesla and Amazon.

Detailed steps are in [docs/HOME_SERVER_INSTALL.md](docs/HOME_SERVER_INSTALL.md), [docs/TESLA_SETUP.md](docs/TESLA_SETUP.md), [docs/ALEXA_SKILL.md](docs/ALEXA_SKILL.md), and [docs/PUBLIC_SETUP.md](docs/PUBLIC_SETUP.md).

## Folder Structure

```text
.
|-- alexa/
|   `-- interaction-model.json
|-- skill-package/
|   |-- skill.json
|   `-- interactionModels/custom/en-US.json
|-- docs/
|   |-- ALEXA_SKILL.md
|   |-- ARCHITECTURE.md
|   |-- DEPLOYMENT.md
|   |-- HOME_SERVER_INSTALL.md
|   |-- PUBLIC_SETUP.md
|   |-- TESLA_SETUP.md
|   |-- TESTING.md
|   `-- TROUBLESHOOTING.md
|-- scripts/
|   |-- build-authorize-url.js
|   |-- exchange-code.js
|   |-- generate-tesla-virtual-key.sh
|   |-- home-server-setup.sh
|   |-- install-home-server.sh
|   |-- update-home-server.sh
|   `-- validate-home-server.sh
|-- src/
|   |-- alexa.js
|   |-- config.js
|   |-- logger.js
|   |-- server.js
|   |-- teslaClient.js
|   `-- tokenStore.js
|-- test/
|   |-- alexa.test.js
|   |-- packaging.test.js
|   `-- teslaClient.test.js
|-- .env.example
|-- ask-resources.json
|-- Dockerfile
|-- docker-compose.yml
|-- package.json
|-- SECURITY.md
`-- README.md
```

## Supported Voice Commands

- "Alexa, ask Tesla to unlock my car"
- "Alexa, ask Tesla to lock my car"
- "Alexa, ask Tesla to open the trunk"
- "Alexa, ask Tesla to open the frunk"
- "Alexa, ask Tesla to start climate"
- "Alexa, ask Tesla to stop climate"
- "Alexa, ask Tesla to cool the car"
- "Alexa, ask Tesla for vehicle status"

Unlocking and trunk/frunk commands require the configured command PIN when `COMMAND_PIN` is set.

## Setup Overview

1. Create a Tesla developer application and configure OAuth redirect URLs.
2. Generate a Tesla virtual-key pair and host the public key at:

   ```text
   https://YOUR_DOMAIN/.well-known/appspecific/com.tesla.3p.public-key.pem
   ```

3. Add the virtual key to your vehicle with:

   ```text
   https://tesla.com/_ak/YOUR_DOMAIN?vin=YOUR_VIN
   ```

4. Copy `.env.example` to `.env` and fill in your values.
5. Run the OAuth helper scripts to obtain and store an initial refresh token.
6. Start Docker Compose.
7. Create an Alexa Custom Skill using `alexa/interaction-model.json`, or use the included ASK CLI package under `skill-package/`.
8. Set the skill endpoint to `https://YOUR_DOMAIN/alexa`.

See [docs/HOME_SERVER_INSTALL.md](docs/HOME_SERVER_INSTALL.md), [docs/TESLA_SETUP.md](docs/TESLA_SETUP.md), [docs/ALEXA_SKILL.md](docs/ALEXA_SKILL.md), and [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) for complete steps.

## Personal Alexa Skill

Manual setup is the most straightforward path:

1. Use the Amazon account tied to your Alexa devices.
2. Create a Custom Skill in the Alexa developer console.
3. Paste `alexa/interaction-model.json` into the JSON editor.
4. Set the HTTPS endpoint to `https://YOUR_DOMAIN/alexa`.
5. Copy the skill ID into the server `.env` as `ALEXA_SKILL_ID`.
6. Enable testing in the Alexa developer console.
7. Try `Alexa, ask Tesla for vehicle status` on a device signed into the same Amazon account.

ASK CLI packaging is also included:

```bash
npm install -g ask-cli
ask configure
# edit skill-package/skill.json and replace https://YOUR_DOMAIN/alexa
ask deploy
```

## Security Notes

- Never commit `.env`, refresh tokens, TLS certificates, or virtual-key private keys.
- Use HTTPS for the Alexa endpoint.
- Keep the Tesla command proxy bound to Docker's internal network only.
- Configure `ALEXA_SKILL_ID` so requests from other skills are rejected.
- Set `COMMAND_PIN` for unlock and trunk/frunk commands.
- The token file is stored under `data/` and excluded from Git.
- Disable `SETUP_ENABLED` after configuration is complete.
- `HOST_PORT` defaults to `18765` to avoid common home-server port conflicts. The container still listens on `PORT=3000` internally.

## References

- Tesla Fleet API authentication: https://developer.tesla.com/docs/fleet-api/authentication/third-party-tokens
- Tesla vehicle commands: https://developer.tesla.com/docs/fleet-api/endpoints/vehicle-commands
- Tesla virtual keys: https://developer.tesla.com/docs/fleet-api/virtual-keys/developer-guide
- Tesla official vehicle-command proxy: https://github.com/teslamotors/vehicle-command
- Alexa Custom Skill Lambda hosting notes: https://developer.amazon.com/en-US/docs/alexa/custom-skills/host-a-custom-skill-as-an-aws-lambda-function.html
