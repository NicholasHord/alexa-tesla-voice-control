import test from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { mkdtemp, readFile, writeFile, rm, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createApp } from '../src/server.js';

async function setupApp() {
  const dir = await mkdtemp(join(tmpdir(), 'alexa-tesla-setup-'));
  const envFile = join(dir, '.env');
  const publicDir = join(dir, 'public');
  await mkdir(publicDir);
  await writeFile(envFile, [
    'SETUP_ENABLED=true',
    'SETUP_ADMIN_TOKEN=test-token',
    'PUBLIC_BASE_URL=https://tesla.example.com',
    'TESLA_CLIENT_SECRET=existing-secret',
    `TESLA_PUBLIC_KEY_FILE=${join(publicDir, 'com.tesla.3p.public-key.pem')}`,
    ''
  ].join('\n'));

  const app = createApp({
    nodeEnv: 'test',
    port: 0,
    publicBaseUrl: '',
    appEnvFile: envFile,
    setup: { enabled: true, adminToken: 'test-token' },
    alexa: { skillId: 'amzn1.ask.skill.test', disableSignatureVerification: true },
    tesla: {
      clientId: '',
      clientSecret: '',
      refreshToken: '',
      tokenFile: join(dir, 'tokens.json'),
      vin: '',
      audience: '',
      authBaseUrl: '',
      fleetBaseUrl: '',
      commandProxyUrl: '',
      commandProxyCaCert: '',
      publicKeyFile: join(publicDir, 'com.tesla.3p.public-key.pem'),
      oauthRedirectUri: '',
      oauthScopes: 'openid offline_access vehicle_device_data vehicle_cmds'
    },
    command: {
      pin: '',
      statusCacheTtlSeconds: 45,
      wakeTimeoutSeconds: 45,
      coolTargetCelsius: 19
    }
  });
  return { app, dir, envFile };
}

test('setup API rejects requests without token', async () => {
  const { app, dir } = await setupApp();
  try {
    await request(app).get('/setup/api/state').expect(401);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('setup token login sets session cookie without requiring https on local http', async () => {
  const { app, dir } = await setupApp();
  try {
    const response = await request(app)
      .get('/setup?token=test-token')
      .expect(302);
    const cookie = response.headers['set-cookie'].join(';');
    assert.match(cookie, /setup_token=test-token/);
    assert.doesNotMatch(cookie, /;\s*Secure/i);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});


test('setup state does not echo saved secrets', async () => {
  const { app, dir } = await setupApp();
  try {
    const response = await request(app)
      .get('/setup/api/state')
      .set('x-setup-token', 'test-token')
      .expect(200);

    assert.equal(response.body.fields.TESLA_CLIENT_SECRET.value, '');
    assert.equal(response.body.fields.TESLA_CLIENT_SECRET.hasValue, true);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('setup page renders with a CSP nonce', async () => {
  const { app, dir } = await setupApp();
  try {
    const response = await request(app)
      .get('/setup')
      .set('x-setup-token', 'test-token')
      .expect(200);

    assert.match(response.headers['content-security-policy'], /script-src 'self' 'nonce-/);
    assert.match(response.text, /<script nonce="/);
    assert.match(response.text, /<style nonce="/);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});


test('setup config writes non-empty secrets and leaves blank secrets unchanged', async () => {
  const { app, dir, envFile } = await setupApp();
  try {
    await request(app)
      .post('/setup/api/config')
      .set('x-setup-token', 'test-token')
      .send({
        values: {
          TESLA_CLIENT_SECRET: '',
          TESLA_CLIENT_ID: 'client-id',
          TESLA_VIN: 'vin-value',
          SETUP_ENABLED: 'false'
        }
      })
      .expect(200);

    const body = await readFile(envFile, 'utf8');
    assert.match(body, /^TESLA_CLIENT_SECRET=existing-secret/m);
    assert.match(body, /^TESLA_CLIENT_ID=client-id/m);
    assert.match(body, /^TESLA_VIN=vin-value/m);
    assert.match(body, /^SETUP_ENABLED=false/m);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
