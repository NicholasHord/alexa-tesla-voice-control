import { request } from 'undici';
import { loadConfig } from '../src/config.js';
import { TokenStore } from '../src/tokenStore.js';

const code = process.argv[2] || process.env.TESLA_AUTH_CODE;
if (!code) {
  throw new Error('Pass the Tesla authorization code as argv[2] or TESLA_AUTH_CODE.');
}

const config = loadConfig({ strict: false });
for (const key of ['clientId', 'clientSecret', 'oauthRedirectUri', 'audience']) {
  if (!config.tesla[key]) throw new Error(`Missing Tesla config value: ${key}`);
}

const form = new URLSearchParams({
  grant_type: 'authorization_code',
  client_id: config.tesla.clientId,
  client_secret: config.tesla.clientSecret,
  code,
  audience: config.tesla.audience,
  redirect_uri: config.tesla.oauthRedirectUri
});

const response = await request(`${config.tesla.authBaseUrl.replace(/\/$/, '')}/oauth2/v3/token`, {
  method: 'POST',
  headers: { 'content-type': 'application/x-www-form-urlencoded' },
  body: form.toString()
});

const text = await response.body.text();
const payload = JSON.parse(text);
if (response.statusCode >= 400) {
  throw new Error(`Token exchange failed: ${text}`);
}

const store = new TokenStore({
  tokenFile: config.tesla.tokenFile,
  initialRefreshToken: config.tesla.refreshToken
});

await store.save(payload);
console.log(`Token saved to ${config.tesla.tokenFile}`);
console.log('Do not commit this file.');

