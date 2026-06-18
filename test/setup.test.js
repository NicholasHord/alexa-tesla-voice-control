import test from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { mkdtemp, readFile, writeFile, rm, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createApp } from '../src/server.js';

function mockResponse(statusCode, payload) {
  return {
    statusCode,
    body: {
      async text() {
        return typeof payload === 'string' ? payload : JSON.stringify(payload);
      }
    }
  };
}

async function setupApp({ envValues = {}, setupRequestImpl } = {}) {
  const dir = await mkdtemp(join(tmpdir(), 'alexa-tesla-setup-'));
  const envFile = join(dir, '.env');
  const publicDir = join(dir, 'public');
  await mkdir(publicDir);
  const tokenFile = join(dir, 'tokens.json');
  const publicKeyFile = join(publicDir, 'com.tesla.3p.public-key.pem');
  const values = {
    SETUP_ENABLED: 'true',
    SETUP_ADMIN_TOKEN: 'test-token',
    PUBLIC_BASE_URL: 'https://tesla.example.com',
    HOST_PORT: '18765',
    ALEXA_SKILL_ID: 'amzn1.ask.skill.test',
    TESLA_CLIENT_ID: 'client-id',
    TESLA_CLIENT_SECRET: 'existing-secret',
    TESLA_VIN: 'vin-value',
    TESLA_AUDIENCE: 'https://fleet-api.prd.na.vn.cloud.tesla.com',
    TESLA_AUTH_BASE_URL: 'https://fleet-auth.prd.vn.cloud.tesla.com',
    TESLA_FLEET_BASE_URL: 'https://fleet-api.prd.na.vn.cloud.tesla.com',
    TESLA_TOKEN_FILE: tokenFile,
    TESLA_COMMAND_PROXY_URL: 'https://tesla-command-proxy:4443',
    TESLA_COMMAND_PROXY_CA_CERT: join(dir, 'certs', 'proxy-cert.pem'),
    TESLA_PUBLIC_KEY_FILE: publicKeyFile,
    ...envValues
  };
  await writeFile(envFile, `${Object.entries(values).map(([key, value]) => `${key}=${value}`).join('\n')}\n`);

  const config = {
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
      tokenFile,
      vin: '',
      audience: '',
      authBaseUrl: '',
      fleetBaseUrl: '',
      commandProxyUrl: '',
      commandProxyCaCert: '',
      publicKeyFile,
      oauthRedirectUri: '',
      oauthScopes: 'openid offline_access vehicle_device_data vehicle_cmds'
    },
    command: {
      pin: '',
      statusCacheTtlSeconds: 45,
      wakeTimeoutSeconds: 45,
      coolTargetCelsius: 19
    }
  };
  const app = createApp(config, { setupRequestImpl });
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
    assert.equal(response.body.fields.HOST_PORT.value, '18765');
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
    assert.match(response.text, /Register Tesla domain/);
    assert.match(response.text, /Download skill package/);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('setup skill package download fills in the Alexa endpoint', async () => {
  const { app, dir } = await setupApp();
  try {
    const response = await request(app)
      .get('/setup/api/skill-json')
      .set('x-setup-token', 'test-token')
      .expect(200);

    assert.equal(response.body.manifest.apis.custom.endpoint.uri, 'https://tesla.example.com/alexa');
    assert.equal(response.body.manifest.apis.custom.endpoint.sslCertificateType, 'Trusted');
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
    assert.match(body, /^SETUP_ENABLED=true/m);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('setup disable action writes SETUP_ENABLED=false', async () => {
  const { app, dir, envFile } = await setupApp();
  try {
    await request(app)
      .post('/setup/api/disable-setup')
      .set('x-setup-token', 'test-token')
      .send({})
      .expect(200);

    const body = await readFile(envFile, 'utf8');
    assert.match(body, /^SETUP_ENABLED=false/m);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('invalid PUBLIC_BASE_URL is reported in setup state', async () => {
  const { app, dir } = await setupApp({ envValues: { PUBLIC_BASE_URL: 'not-a-url' } });
  try {
    const response = await request(app)
      .get('/setup/api/state')
      .set('x-setup-token', 'test-token')
      .expect(200);

    assert.equal(response.body.links.publicKeyUrl, '');
    assert.equal(response.body.checks.ready, false);
    assert.match(response.body.checks.warnings.join('\n'), /PUBLIC_BASE_URL is not a valid URL/);
    assert.equal(response.body.statuses.find((status) => status.label === 'Public HTTPS URL').level, 'fail');
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('public key check succeeds only for reachable PEM content', async () => {
  const calls = [];
  const { app, dir } = await setupApp({
    setupRequestImpl: async (url, options) => {
      calls.push({ url, options });
      return mockResponse(200, '-----BEGIN PUBLIC KEY-----\nabc\n-----END PUBLIC KEY-----\n');
    }
  });
  try {
    const response = await request(app)
      .post('/setup/api/check-public-key')
      .set('x-setup-token', 'test-token')
      .send({})
      .expect(200);

    assert.equal(response.body.ok, true);
    assert.equal(calls[0].url, 'https://tesla.example.com/.well-known/appspecific/com.tesla.3p.public-key.pem');
    assert.equal(calls[0].options.method, 'GET');
  } finally {
    await rm(dir, { recursive: true, force: true });
  }

  const failing = await setupApp({
    setupRequestImpl: async () => mockResponse(200, 'not a pem')
  });
  try {
    const response = await request(failing.app)
      .post('/setup/api/check-public-key')
      .set('x-setup-token', 'test-token')
      .send({})
      .expect(400);

    assert.equal(response.body.ok, false);
    assert.match(response.body.message, /does not look like a PEM/);
  } finally {
    await rm(failing.dir, { recursive: true, force: true });
  }
});

test('partner token request uses Tesla client credentials payload without returning token', async () => {
  const calls = [];
  const { app, dir } = await setupApp({
    setupRequestImpl: async (url, options) => {
      calls.push({ url, options });
      return mockResponse(200, {
        access_token: 'partner-token',
        token_type: 'Bearer',
        expires_in: 300,
        scope: 'openid vehicle_device_data vehicle_cmds'
      });
    }
  });
  try {
    const response = await request(app)
      .post('/setup/api/partner-token')
      .set('x-setup-token', 'test-token')
      .send({})
      .expect(200);

    assert.equal(response.body.ok, true);
    assert.equal(response.body.access_token, undefined);
    assert.equal(calls[0].url, 'https://fleet-auth.prd.vn.cloud.tesla.com/oauth2/v3/token');
    assert.equal(calls[0].options.method, 'POST');
    assert.equal(calls[0].options.headers['content-type'], 'application/x-www-form-urlencoded');

    const body = new URLSearchParams(calls[0].options.body);
    assert.equal(body.get('grant_type'), 'client_credentials');
    assert.equal(body.get('client_id'), 'client-id');
    assert.equal(body.get('client_secret'), 'existing-secret');
    assert.equal(body.get('audience'), 'https://fleet-api.prd.na.vn.cloud.tesla.com');
    assert.equal(body.get('scope'), 'openid vehicle_device_data vehicle_cmds');
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('partner domain registration checks public key and posts the public host', async () => {
  const calls = [];
  const { app, dir } = await setupApp({
    setupRequestImpl: async (url, options) => {
      calls.push({ url, options });
      if (url === 'https://tesla.example.com/.well-known/appspecific/com.tesla.3p.public-key.pem') {
        return mockResponse(200, '-----BEGIN PUBLIC KEY-----\nabc\n-----END PUBLIC KEY-----\n');
      }
      if (url === 'https://fleet-auth.prd.vn.cloud.tesla.com/oauth2/v3/token') {
        return mockResponse(200, { access_token: 'partner-token' });
      }
      return mockResponse(200, { response: { domain: 'tesla.example.com' } });
    }
  });
  try {
    const response = await request(app)
      .post('/setup/api/register-partner')
      .set('x-setup-token', 'test-token')
      .send({})
      .expect(200);

    assert.equal(response.body.domain, 'tesla.example.com');
    const registration = calls[2];
    assert.equal(registration.url, 'https://fleet-api.prd.na.vn.cloud.tesla.com/api/1/partner_accounts');
    assert.equal(registration.options.method, 'POST');
    assert.equal(registration.options.headers.authorization, 'Bearer partner-token');
    assert.deepEqual(JSON.parse(registration.options.body), { domain: 'tesla.example.com' });
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('partner registration check requests Tesla public-key endpoint for the public host', async () => {
  const calls = [];
  const { app, dir } = await setupApp({
    setupRequestImpl: async (url, options) => {
      calls.push({ url, options });
      if (url === 'https://fleet-auth.prd.vn.cloud.tesla.com/oauth2/v3/token') {
        return mockResponse(200, { access_token: 'partner-token' });
      }
      return mockResponse(200, { response: { public_key: 'registered' } });
    }
  });
  try {
    await request(app)
      .post('/setup/api/check-partner-registration')
      .set('x-setup-token', 'test-token')
      .send({})
      .expect(200);

    assert.equal(calls[1].url, 'https://fleet-api.prd.na.vn.cloud.tesla.com/api/1/partner_accounts/public_key?domain=tesla.example.com');
    assert.equal(calls[1].options.method, 'GET');
    assert.equal(calls[1].options.headers.authorization, 'Bearer partner-token');
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('partner registration check reports Tesla public-key failures', async () => {
  const { app, dir } = await setupApp({
    setupRequestImpl: async (url) => {
      if (url === 'https://fleet-auth.prd.vn.cloud.tesla.com/oauth2/v3/token') {
        return mockResponse(200, { access_token: 'partner-token' });
      }
      return mockResponse(404, { error: 'not_registered' });
    }
  });
  try {
    const response = await request(app)
      .post('/setup/api/check-partner-registration')
      .set('x-setup-token', 'test-token')
      .send({})
      .expect(400);

    assert.equal(response.body.ok, false);
    assert.equal(response.body.error, 'not_registered');
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
