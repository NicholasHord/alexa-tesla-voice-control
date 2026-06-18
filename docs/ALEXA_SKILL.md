# Personal Alexa Skill Setup

The server installs from Git on a Docker-capable server. The Alexa skill itself is configured in the Amazon Alexa developer console or with ASK CLI. Your Echo devices do not install this Git repo directly.

For a personal development skill, use the same Amazon account that your Alexa devices use. Leave the skill in development mode and do not submit it for certification.

## Manual Console Setup

1. Open the Alexa developer console.
2. Create a new skill.
3. Skill name: `Tesla Personal Control`.
4. Primary locale: `English (US)`.
5. Model: `Custom`.
6. Hosting: choose your own/provision your own endpoint, not Alexa-hosted.
7. Invocation name: `tesla`.
8. Go to `Build > Interaction Model > JSON Editor`.
9. Paste the contents of:

   ```text
   alexa/interaction-model.json
   ```

10. Save and build the model.
11. Go to `Endpoint`.
12. Select `HTTPS`.
13. Default region endpoint:

   ```text
   https://YOUR_DOMAIN/alexa
   ```

   The setup page shows this endpoint after `PUBLIC_BASE_URL` is saved.

14. For the SSL certificate option, choose the trusted-certificate-authority option if you are using Let's Encrypt, Cloudflare, or another normal public CA certificate.
15. Copy the skill ID from the developer console and set it in the server `.env`:

   ```text
   ALEXA_SKILL_ID=amzn1.ask.skill.xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
   ```

16. Restart the service:

   ```bash
   docker compose up -d
   ```

17. In the developer console `Test` tab, enable testing for the skill.
18. Try:

   ```text
   ask Tesla for vehicle status
   ask Tesla to start climate
   ask Tesla to lock my car
   ```

When testing is enabled, Alexa devices signed into the same Amazon account should be able to invoke the development skill with:

```text
Alexa, ask Tesla for vehicle status
```

## ASK CLI Package

This repo also includes an ASK CLI package:

```text
ask-resources.json
skill-package/
```

Before deploying with ASK CLI, edit:

```text
skill-package/skill.json
```

Replace:

```text
https://YOUR_DOMAIN/alexa
```

The setup page can download a customized `skill.json` with this endpoint already set from `PUBLIC_BASE_URL`.

Then deploy metadata:

```bash
npm install -g ask-cli
ask configure
ask deploy
```

The ASK CLI path manages the Alexa skill metadata and interaction model. It does not deploy the Tesla service; your server still runs the Docker stack.

## Important Notes

- Do not configure public account linking for this personal-only skill.
- Do not publish or certify the skill unless you redesign the system for multi-user production security.
- Keep `COMMAND_PIN` enabled for unlock and trunk/frunk commands.
- If Alexa says the skill cannot reach the endpoint, check public HTTPS, reverse proxy routing, and `ALEXA_SKILL_ID`.
