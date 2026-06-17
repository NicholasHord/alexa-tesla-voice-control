import { randomBytes } from 'node:crypto';
import { loadConfig } from '../src/config.js';

const config = loadConfig({ strict: false });

if (!config.tesla.clientId || !config.tesla.oauthRedirectUri) {
  throw new Error('TESLA_CLIENT_ID and TESLA_OAUTH_REDIRECT_URI are required.');
}

const state = randomBytes(24).toString('hex');
const nonce = randomBytes(24).toString('hex');
const url = new URL('https://auth.tesla.com/oauth2/v3/authorize');
url.searchParams.set('response_type', 'code');
url.searchParams.set('client_id', config.tesla.clientId);
url.searchParams.set('redirect_uri', config.tesla.oauthRedirectUri);
url.searchParams.set('scope', config.tesla.oauthScopes);
url.searchParams.set('state', state);
url.searchParams.set('nonce', nonce);
url.searchParams.set('prompt_missing_scopes', 'true');
url.searchParams.set('require_requested_scopes', 'true');
url.searchParams.set('show_keypair_step', 'true');

console.log(url.toString());
console.log('');
console.log(`Save this state and verify it in the callback: ${state}`);

