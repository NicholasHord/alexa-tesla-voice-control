# Troubleshooting

## Alexa Says the Endpoint Is Invalid

- Confirm the endpoint is public HTTPS, not plain HTTP.
- Confirm `/alexa` accepts POST requests.
- Confirm your certificate chain is trusted by Alexa.
- Confirm the skill endpoint is exactly `https://YOUR_DOMAIN/alexa`.

## Requests Are Rejected as Unauthorized

- Confirm `ALEXA_SKILL_ID` matches the skill ID in the Alexa developer console.
- Confirm request signature verification is enabled in production.
- Do not use `DISABLE_ALEXA_SIGNATURE_VERIFICATION=true` outside local testing.

## Tesla Token Refresh Fails

- Confirm `TESLA_CLIENT_ID` and `TESLA_CLIENT_SECRET`.
- Confirm the refresh token was granted with `offline_access`.
- Confirm `TESLA_AUDIENCE` matches your Fleet API region.
- Re-run `npm run oauth:url` and `npm run oauth:exchange` if the refresh token was revoked.

## Tesla Partner Registration Fails

- Confirm `PUBLIC_BASE_URL` is public HTTPS and uses the same domain registered in the Tesla developer portal.
- Confirm the setup page public-key check succeeds before clicking `Register domain`.
- Confirm `TESLA_CLIENT_ID`, `TESLA_CLIENT_SECRET`, `TESLA_AUDIENCE`, `TESLA_AUTH_BASE_URL`, and `TESLA_FLEET_BASE_URL`.
- Confirm the Tesla developer app has the required Fleet API scopes and domain configuration.

## Vehicle Commands Fail

- Confirm the car supports Fleet API commands.
- Confirm the public key is reachable at:

  ```text
  https://YOUR_DOMAIN/.well-known/appspecific/com.tesla.3p.public-key.pem
  ```

- Confirm the virtual key was installed on the vehicle.
- Confirm `keys/private-key.pem` matches the hosted public key.
- Confirm `COMPOSE_PROFILES=vehicle-commands` is set after key generation and Docker Compose has been restarted.
- Confirm `tesla-command-proxy` can read the private key and TLS cert.
- Confirm the command proxy logs do not show TLS or key parsing errors.

## Vehicle Does Not Wake

- Commands wake the vehicle only when needed.
- If wake-up times out, increase `COMMAND_WAKE_TIMEOUT_SECONDS`.
- Avoid repeated manual testing; Tesla may rate-limit or the vehicle may remain asleep for battery protection.

## Status Is Stale

- Status responses are cached for `STATUS_CACHE_TTL_SECONDS` to reduce API usage.
- Set a lower TTL if you want fresher responses, but expect more vehicle wake-ups.

## Docker Image Pull Fails

- Confirm Docker can pull from the registry.
- If `tesla/vehicle-command:latest` is unavailable in your environment, build Tesla's official image from https://github.com/teslamotors/vehicle-command and update `docker-compose.yml`.

## Logs

The app logs request IDs and action outcomes but redacts OAuth tokens, client secrets, and PINs. Avoid enabling debug logs when sharing output.

## Future Enhancements

- Add a read-only web dashboard for token and vehicle health.
- Add per-command allowlists for household Alexa profiles.
- Add a local-only mTLS admin endpoint for manual commands.
- Add configurable status templates.
- Add garage geofence checks before trunk/frunk commands.
- Add metrics for wake-up count and command success rate.
