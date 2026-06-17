# Security

## Never Commit Local Secrets

The following generated files and directories are excluded from Git:

- `.env`
- `data/`
- `keys/`
- `certs/`
- `public/*.pem`

Do not publish Tesla OAuth tokens, Tesla client secrets, command PINs, private keys, TLS private keys, VINs, or Alexa skill IDs tied to a private deployment.

## Setup UI

The setup UI is protected by `SETUP_ADMIN_TOKEN`. Treat the setup URL as sensitive because it contains that token during first login.

Disable setup after configuration:

```bash
SETUP_ENABLED=false
docker compose up -d
```

## Reporting Issues

If you find a security issue, open a private advisory or contact the repository owner privately instead of filing a public issue with sensitive details.

