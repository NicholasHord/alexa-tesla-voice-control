# Testing Checklist

## Static Checks

```bash
npm install
npm test
```

## Local Alexa Request Test

For local tests only, set:

```text
DISABLE_ALEXA_SIGNATURE_VERIFICATION=true
ALEXA_SKILL_ID=amzn1.ask.skill.local-test
```

Start:

```bash
npm start
```

Send a launch request:

```bash
curl -s http://localhost:18765/alexa \
  -H 'content-type: application/json' \
  -d '{
    "session": { "application": { "applicationId": "amzn1.ask.skill.local-test" } },
    "request": { "type": "LaunchRequest", "requestId": "local-launch" }
  }'
```

Expected: a JSON Alexa response saying Tesla control is ready.

## PIN Flow Test

Use this without real Tesla calls by running unit tests:

```bash
npm test -- test/alexa.test.js
```

Expected:

- Unlock intent prompts for PIN when `COMMAND_PIN` is set.
- Correct `ConfirmPinIntent` executes the pending command.
- Wrong skill IDs are rejected.

## Alexa Developer Console

Test utterances:

- "ask Tesla for vehicle status"
- "ask Tesla to lock my car"
- "ask Tesla to start climate"
- "ask Tesla to cool the car"
- "ask Tesla to unlock my car"
- "ask Tesla to open the trunk"
- "ask Tesla to open the frunk"

For sensitive commands, confirm Alexa prompts for the PIN and cancels on the wrong PIN.

## Live Vehicle Test Order

Use this sequence to minimize wake-ups:

1. Health check the service.
2. Ask for status once.
3. Wait at least `STATUS_CACHE_TTL_SECONDS`, then ask for status again.
4. Test `lock` before `unlock`.
5. Test `start climate`, then `stop climate`.
6. Test `unlock` only when the car is physically secure.
7. Test trunk/frunk only when you can see the vehicle.

## Command Proxy Test

Check containers:

```bash
docker compose ps
docker compose logs tesla-command-proxy
```

A command failure mentioning virtual-key authorization usually means the public key is not hosted at the required path, the virtual key was not enrolled, or the wrong private key is mounted.
