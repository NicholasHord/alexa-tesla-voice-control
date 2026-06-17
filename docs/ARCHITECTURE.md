# Architecture Decision

## Chosen Infrastructure

Use self-hosted Docker on your home server.

```text
Alexa Custom Skill
  -> public HTTPS endpoint on your domain or tunnel
  -> alexa-tesla Node.js container
  -> Tesla official vehicle-command HTTP proxy container
  -> Tesla Fleet API
  -> vehicle
```

## Why This Is the Best Fit

- Modern Tesla commands require virtual-key command authorization. Tesla's official `vehicle-command` proxy is built for that job.
- A home server already gives you free compute, persistent local secrets, and a stable place to mount the vehicle private key.
- Docker Compose keeps the Alexa webhook and command signer isolated but easy to deploy together.
- AWS Lambda is excellent for Alexa skills, but it is less attractive here because you would still need command signing, private-key storage, token rotation, and the proxy lifecycle.
- The only internet-exposed service is the Alexa webhook and static Tesla public-key URL. The command proxy stays internal to Docker.

## Cost

Expected ongoing cost can be zero if you already have:

- A domain, or a free tunnel that satisfies Alexa HTTPS requirements.
- A home server that is already running.

Tesla Fleet API usage should stay low because:

- Status calls are cached briefly.
- Commands wake the vehicle only when a command requires the car to be online.
- The service does not poll in the background.

## AWS Free-Tier Variant

You can put only the Alexa webhook in Lambda, but this project does not implement that as the primary path. The Lambda function would need to securely reach a command-signing service or embed equivalent signing capability, which makes it less simple and less clearly free than the Docker deployment.

