# Tesla Developer Setup

## 1. Create a Tesla Developer App

1. Sign in to the Tesla developer portal.
2. Create an application for personal use.
3. Add your redirect URI from `.env`:

   ```text
   TESLA_OAUTH_REDIRECT_URI=https://YOUR_DOMAIN/oauth/callback
   ```

4. Enable scopes needed by this project:

   ```text
   openid offline_access vehicle_device_data vehicle_cmds
   ```

5. Copy the client ID and client secret into `.env`.

## 2. Configure Fleet API Region

The default `.env.example` uses North America:

```text
TESLA_AUDIENCE=https://fleet-api.prd.na.vn.cloud.tesla.com
TESLA_FLEET_BASE_URL=https://fleet-api.prd.na.vn.cloud.tesla.com
TESLA_AUTH_BASE_URL=https://fleet-auth.prd.vn.cloud.tesla.com
```

If your Tesla account is in another Fleet API region, update `TESLA_AUDIENCE` and `TESLA_FLEET_BASE_URL` to the official regional endpoint shown in Tesla's Fleet API docs.

## 3. Generate a Virtual-Key Pair

Install or run Tesla's official `vehicle-command` tooling, then generate a private key and public key with `tesla-keygen`.

If you use the official Docker image:

```bash
mkdir -p keys certs data
docker run --rm \
  -v "$PWD/keys:/keys" \
  --entrypoint tesla-keygen \
  tesla/vehicle-command:latest \
  -key-file /keys/private-key.pem \
  create > keys/public-key.pem
```

If you build from source instead:

```bash
git clone https://github.com/teslamotors/vehicle-command.git
cd vehicle-command
go install ./cmd/tesla-keygen
tesla-keygen -key-file ../keys/private-key.pem create > ../keys/public-key.pem
```

Host that public key at:

```text
https://YOUR_DOMAIN/.well-known/appspecific/com.tesla.3p.public-key.pem
```

Your web server, Cloudflare Tunnel origin, or reverse proxy can serve `keys/public-key.pem` at that path. Do not serve or upload `keys/private-key.pem`.

## 4. Enroll the Vehicle

After the public key is reachable, install the virtual key on your vehicle:

```text
https://tesla.com/_ak/YOUR_DOMAIN?vin=YOUR_VIN
```

Open that URL on your phone while signed into the Tesla account that owns or can control the vehicle. Complete Tesla's authorization flow. The car may ask for confirmation.

## 5. Obtain OAuth Tokens

Create an authorization URL:

```bash
npm run oauth:url
```

Open the printed URL, sign in to Tesla, approve the requested scopes, and copy the `code` query parameter from the redirect back to your redirect URI.

Exchange the code:

```bash
npm run oauth:exchange -- "PASTE_CODE_HERE"
```

The refreshed token set is saved to `TESLA_TOKEN_FILE`, usually `./data/tesla-tokens.json`. That file is excluded from Git.

## 6. Confirm Vehicle Access

Start the service and test status:

```bash
docker compose up -d --build
curl http://localhost:18765/health
```

Use the Alexa developer console or the JSON fixtures in `docs/TESTING.md` to send a status intent. Status may wake the vehicle because Tesla's live `vehicle_data` endpoint requires the car to be reachable.
