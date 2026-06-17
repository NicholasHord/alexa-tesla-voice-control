import express from 'express';
import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { request } from 'undici';
import { readEnvValues, writeEnvValues } from './envFile.js';
import { TokenStore } from './tokenStore.js';

const WELL_KNOWN_KEY_PATH = '/.well-known/appspecific/com.tesla.3p.public-key.pem';

const FIELDS = [
  { key: 'PUBLIC_BASE_URL', label: 'Public HTTPS base URL', placeholder: 'https://tesla.example.com' },
  { key: 'ALEXA_SKILL_ID', label: 'Alexa skill ID', placeholder: 'amzn1.ask.skill.xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx' },
  { key: 'TESLA_CLIENT_ID', label: 'Tesla client ID', sensitive: true },
  { key: 'TESLA_CLIENT_SECRET', label: 'Tesla client secret', sensitive: true },
  { key: 'TESLA_VIN', label: 'Vehicle VIN', sensitive: true },
  { key: 'COMMAND_PIN', label: 'Command PIN', sensitive: true, placeholder: 'Optional' },
  { key: 'TESLA_AUDIENCE', label: 'Tesla audience URL' },
  { key: 'TESLA_AUTH_BASE_URL', label: 'Tesla auth base URL' },
  { key: 'TESLA_FLEET_BASE_URL', label: 'Tesla Fleet API base URL' },
  { key: 'TESLA_OAUTH_REDIRECT_URI', label: 'Tesla OAuth redirect URI', placeholder: 'https://tesla.example.com/oauth/callback' },
  { key: 'TESLA_TOKEN_FILE', label: 'Tesla token file' },
  { key: 'TESLA_COMMAND_PROXY_URL', label: 'Command proxy URL' },
  { key: 'TESLA_COMMAND_PROXY_CA_CERT', label: 'Command proxy CA certificate' },
  { key: 'TESLA_PUBLIC_KEY_FILE', label: 'Tesla public key file' },
  { key: 'SETUP_ENABLED', label: 'Setup UI enabled' }
];

const SENSITIVE_KEYS = new Set(FIELDS.filter((field) => field.sensitive).map((field) => field.key));

const DEFAULTS = {
  TESLA_AUDIENCE: 'https://fleet-api.prd.na.vn.cloud.tesla.com',
  TESLA_AUTH_BASE_URL: 'https://fleet-auth.prd.vn.cloud.tesla.com',
  TESLA_FLEET_BASE_URL: 'https://fleet-api.prd.na.vn.cloud.tesla.com',
  TESLA_TOKEN_FILE: '/app/data/tesla-tokens.json',
  TESLA_COMMAND_PROXY_URL: 'https://tesla-command-proxy:4443',
  TESLA_COMMAND_PROXY_CA_CERT: '/app/certs/proxy-cert.pem',
  TESLA_PUBLIC_KEY_FILE: '/app/public/com.tesla.3p.public-key.pem',
  SETUP_ENABLED: 'true'
};

const REQUIRED_KEYS = [
  'PUBLIC_BASE_URL',
  'ALEXA_SKILL_ID',
  'TESLA_CLIENT_ID',
  'TESLA_CLIENT_SECRET',
  'TESLA_VIN',
  'TESLA_AUDIENCE',
  'TESLA_AUTH_BASE_URL',
  'TESLA_FLEET_BASE_URL',
  'TESLA_TOKEN_FILE',
  'TESLA_COMMAND_PROXY_URL',
  'TESLA_COMMAND_PROXY_CA_CERT',
  'TESLA_PUBLIC_KEY_FILE'
];

function fixedEqual(a, b) {
  const left = Buffer.from(String(a || ''));
  const right = Buffer.from(String(b || ''));
  if (left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}

function parseCookies(header = '') {
  return Object.fromEntries(
    header
      .split(';')
      .map((part) => part.trim())
      .filter(Boolean)
      .map((part) => {
        const index = part.indexOf('=');
        return index === -1 ? [part, ''] : [part.slice(0, index), decodeURIComponent(part.slice(index + 1))];
      })
  );
}

async function setupState(config) {
  const fileValues = await readEnvValues(config.appEnvFile);
  const values = { ...DEFAULTS, ...process.env, ...fileValues };
  return {
    enabled: String(values.SETUP_ENABLED || '').toLowerCase() === 'true',
    adminToken: values.SETUP_ADMIN_TOKEN || config.setup.adminToken || '',
    values
  };
}

function tokenFromRequest(req) {
  const cookies = parseCookies(req.headers.cookie || '');
  return req.headers['x-setup-token'] || req.query.token || cookies.setup_token || '';
}

async function authorize(req, config) {
  const state = await setupState(config);
  if (!state.enabled || !state.adminToken) return { ok: false, state };
  return { ok: fixedEqual(tokenFromRequest(req), state.adminToken), state };
}

function sendUnauthorized(req, res, state) {
  if (!state.enabled) {
    return res.status(403).send(renderDisabledPage(res.locals.cspNonce));
  }
  return res.status(401).send(renderLoginPage(res.locals.cspNonce));
}

function publicBase(values) {
  return String(values.PUBLIC_BASE_URL || '').replace(/\/$/, '');
}

function teslaEnrollUrl(values) {
  const base = publicBase(values);
  const host = base ? new URL(base).host : 'YOUR_DOMAIN';
  const vin = values.TESLA_VIN || 'YOUR_VIN';
  return `https://tesla.com/_ak/${host}?vin=${encodeURIComponent(vin)}`;
}

function oauthRedirect(values) {
  const base = publicBase(values);
  return values.TESLA_OAUTH_REDIRECT_URI || (base ? `${base}/oauth/callback` : '');
}

function safeFieldState(values) {
  return Object.fromEntries(
    FIELDS.map((field) => {
      const value = values[field.key] || DEFAULTS[field.key] || '';
      return [
        field.key,
        {
          ...field,
          value: field.sensitive ? '' : value,
          hasValue: Boolean(value)
        }
      ];
    })
  );
}

function jsonError(res, status, message) {
  return res.status(status).json({ ok: false, error: message });
}

function renderLoginPage(nonce) {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Tesla Voice Setup</title>
  <style nonce="${nonce}">${setupStyles()}</style>
</head>
<body>
  <main class="login">
    <h1>Tesla Voice Setup</h1>
    <form method="get" action="/setup">
      <label for="token">Setup token</label>
      <input id="token" name="token" type="password" autocomplete="current-password" autofocus>
      <button type="submit">Open setup</button>
    </form>
  </main>
</body>
</html>`;
}

function renderDisabledPage(nonce) {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Setup Disabled</title>
  <style nonce="${nonce}">${setupStyles()}</style>
</head>
<body>
  <main class="login">
    <h1>Setup Disabled</h1>
    <p>The setup page is disabled. Set <code>SETUP_ENABLED=true</code> and restart the service to re-enable it.</p>
  </main>
</body>
</html>`;
}

function renderSetupPage(nonce) {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Tesla Voice Setup</title>
  <style nonce="${nonce}">${setupStyles()}</style>
</head>
<body>
  <header class="topbar">
    <div>
      <h1>Tesla Voice Setup</h1>
      <p>Private Alexa skill and Tesla Fleet API configuration.</p>
    </div>
    <a class="button secondary" href="/health" target="_blank" rel="noreferrer">Health</a>
  </header>
  <main class="layout">
    <section class="panel">
      <div class="panel-head">
        <h2>Configuration</h2>
        <button id="saveConfig" type="button">Save</button>
      </div>
      <form id="configForm" class="grid"></form>
      <p class="note">Secret fields are not echoed back. Leave a secret field blank to keep the current value.</p>
    </section>

    <section class="panel">
      <h2>Guided Steps</h2>
      <ol class="steps">
        <li>
          <strong>Install files</strong>
          <code id="installCommand">curl -fsSL https://raw.githubusercontent.com/NicholasHord/alexa-tesla-voice-control/master/scripts/install-home-server.sh | bash</code>
          <button class="copy" data-copy="#installCommand" type="button">Copy</button>
        </li>
        <li>
          <strong>Generate virtual key</strong>
          <code id="keyCommand">./scripts/generate-tesla-virtual-key.sh</code>
          <button class="copy" data-copy="#keyCommand" type="button">Copy</button>
        </li>
        <li>
          <strong>Publish public key</strong>
          <a id="publicKeyUrl" target="_blank" rel="noreferrer"></a>
          <button id="checkPublicKey" type="button">Check</button>
        </li>
        <li>
          <strong>Enroll vehicle key</strong>
          <a id="teslaEnrollUrl" target="_blank" rel="noreferrer">Open Tesla enrollment</a>
        </li>
        <li>
          <strong>Authorize Tesla OAuth</strong>
          <button id="buildOauth" type="button">Create Tesla OAuth link</button>
          <a id="oauthUrl" target="_blank" rel="noreferrer"></a>
        </li>
        <li>
          <strong>Exchange OAuth code</strong>
          <div class="inline">
            <input id="authCode" type="text" autocomplete="off" placeholder="Paste Tesla authorization code">
            <button id="exchangeCode" type="button">Exchange</button>
          </div>
        </li>
        <li>
          <strong>Create Alexa skill</strong>
          <a href="https://developer.amazon.com/alexa/console/ask" target="_blank" rel="noreferrer">Open Alexa developer console</a>
          <button id="downloadModel" type="button">Download interaction model</button>
        </li>
        <li>
          <strong>Start or restart</strong>
          <code id="restartCommand">docker compose up -d --build</code>
          <button class="copy" data-copy="#restartCommand" type="button">Copy</button>
        </li>
      </ol>
    </section>

    <section class="panel">
      <h2>Validation</h2>
      <button id="validateConfig" type="button">Validate configuration</button>
      <pre id="output" aria-live="polite"></pre>
    </section>
  </main>
  <script nonce="${nonce}">${setupScript()}</script>
</body>
</html>`;
}

function setupStyles() {
  return `
:root{color-scheme:light dark;--bg:#f6f7f9;--text:#17202a;--muted:#5d6875;--panel:#fff;--line:#d8dee6;--accent:#0f766e;--danger:#b42318}
@media (prefers-color-scheme:dark){:root{--bg:#101417;--text:#e7edf3;--muted:#a7b2bf;--panel:#171d22;--line:#2d3844;--accent:#2dd4bf;--danger:#ff8a80}}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--text);font:15px/1.5 system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}
.topbar{display:flex;align-items:center;justify-content:space-between;gap:16px;padding:24px clamp(16px,4vw,40px);border-bottom:1px solid var(--line);background:var(--panel)}
h1,h2{margin:0;letter-spacing:0}h1{font-size:24px}h2{font-size:18px}.topbar p,.note{margin:4px 0 0;color:var(--muted)}
.layout{display:grid;grid-template-columns:minmax(0,1.15fr) minmax(320px,.85fr);gap:18px;padding:18px clamp(16px,4vw,40px);max-width:1320px;margin:0 auto}
.panel{background:var(--panel);border:1px solid var(--line);border-radius:8px;padding:18px}.panel-head{display:flex;justify-content:space-between;align-items:center;gap:12px;margin-bottom:12px}
.grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px}.field{display:grid;gap:5px}.field label{font-weight:650}.field span{color:var(--muted);font-size:12px}
input,select{width:100%;min-height:38px;border:1px solid var(--line);border-radius:6px;background:transparent;color:var(--text);padding:8px 10px;font:inherit}
button,.button{min-height:38px;border:0;border-radius:6px;background:var(--accent);color:#fff;padding:8px 12px;font-weight:700;text-decoration:none;cursor:pointer;display:inline-flex;align-items:center;justify-content:center}
button.secondary,.button.secondary{background:transparent;color:var(--text);border:1px solid var(--line)}button.copy{background:transparent;color:var(--accent);border:1px solid var(--line);margin-left:8px}
.steps{display:grid;gap:14px;padding-left:20px}.steps li{padding-left:4px}.steps strong{display:block;margin-bottom:4px}
code{display:inline-block;max-width:100%;overflow:auto;border:1px solid var(--line);border-radius:6px;padding:7px 9px;background:rgba(127,127,127,.08)}
a{color:var(--accent);overflow-wrap:anywhere}.inline{display:flex;gap:8px}.inline input{flex:1}pre{min-height:120px;margin:12px 0 0;white-space:pre-wrap;word-break:break-word;border:1px solid var(--line);border-radius:6px;padding:12px;background:rgba(127,127,127,.08)}
.login{max-width:420px;margin:12vh auto;padding:24px;background:var(--panel);border:1px solid var(--line);border-radius:8px}.login form{display:grid;gap:10px;margin-top:16px}
@media (max-width:900px){.layout{grid-template-columns:1fr}.grid{grid-template-columns:1fr}.topbar{align-items:flex-start;flex-direction:column}.inline{flex-direction:column}}
`;
}

function setupScript() {
  return `
const fields = ${JSON.stringify(FIELDS)};
const form = document.querySelector('#configForm');
const output = document.querySelector('#output');
function show(value){output.textContent = typeof value === 'string' ? value : JSON.stringify(value, null, 2)}
async function api(path, options = {}) {
  const response = await fetch('/setup/api/' + path, { headers: { 'content-type': 'application/json', ...(options.headers || {}) }, ...options });
  const text = await response.text();
  const body = text ? JSON.parse(text) : {};
  if (!response.ok || body.ok === false) throw new Error(body.error || response.statusText);
  return body;
}
function fieldInput(field, state) {
  const wrapper = document.createElement('div');
  wrapper.className = 'field';
  const label = document.createElement('label');
  label.htmlFor = field.key;
  label.textContent = field.label;
  const input = document.createElement(field.key === 'SETUP_ENABLED' ? 'select' : 'input');
  input.id = field.key;
  input.name = field.key;
  if (field.key === 'SETUP_ENABLED') {
    for (const value of ['true','false']) {
      const option = document.createElement('option');
      option.value = value;
      option.textContent = value;
      input.append(option);
    }
    input.value = state.value || 'true';
  } else {
    input.type = field.sensitive ? 'password' : 'text';
    input.placeholder = field.sensitive && state.hasValue ? 'Saved; leave blank to keep' : (field.placeholder || '');
    input.value = state.value || '';
  }
  const hint = document.createElement('span');
  hint.textContent = field.sensitive && state.hasValue ? 'Value saved locally' : ' ';
  wrapper.append(label, input, hint);
  return wrapper;
}
async function loadState() {
  const state = await api('state');
  form.replaceChildren();
  for (const field of fields) form.append(fieldInput(field, state.fields[field.key] || {}));
  document.querySelector('#publicKeyUrl').href = state.links.publicKeyUrl;
  document.querySelector('#publicKeyUrl').textContent = state.links.publicKeyUrl || 'Set PUBLIC_BASE_URL first';
  document.querySelector('#teslaEnrollUrl').href = state.links.teslaEnrollUrl;
  show(state.checks);
}
document.querySelector('#saveConfig').addEventListener('click', async () => {
  const values = Object.fromEntries(new FormData(form).entries());
  show(await api('config', { method: 'POST', body: JSON.stringify({ values }) }));
  await loadState();
});
document.querySelector('#validateConfig').addEventListener('click', async () => show(await api('validate', { method: 'POST', body: '{}' })));
document.querySelector('#checkPublicKey').addEventListener('click', async () => show(await api('check-public-key', { method: 'POST', body: '{}' })));
document.querySelector('#buildOauth').addEventListener('click', async () => {
  const result = await api('oauth-url', { method: 'POST', body: '{}' });
  const link = document.querySelector('#oauthUrl');
  link.href = result.url;
  link.textContent = 'Open Tesla OAuth';
  show({ state: result.state, url: result.url });
});
document.querySelector('#exchangeCode').addEventListener('click', async () => {
  const code = document.querySelector('#authCode').value.trim();
  show(await api('exchange-code', { method: 'POST', body: JSON.stringify({ code }) }));
});
document.querySelector('#downloadModel').addEventListener('click', () => { window.location.href = '/setup/api/alexa-model'; });
document.querySelectorAll('.copy').forEach((button) => button.addEventListener('click', async () => {
  const text = document.querySelector(button.dataset.copy).textContent;
  await navigator.clipboard.writeText(text);
  button.textContent = 'Copied';
  setTimeout(() => { button.textContent = 'Copy'; }, 1200);
}));
loadState().catch((error) => show(error.message));
`;
}

async function tokenConfig(config) {
  const state = await setupState(config);
  return state;
}

export function createSetupRouter({ config }) {
  const router = express.Router();

  router.use(express.json({ limit: '64kb' }));

  router.get('/', async (req, res, next) => {
    try {
      const state = await tokenConfig(config);
      const token = req.query.token || '';
      if (state.enabled && state.adminToken && token && fixedEqual(token, state.adminToken)) {
        res.cookie('setup_token', token, {
          httpOnly: true,
          sameSite: 'strict',
          secure: req.secure || req.headers['x-forwarded-proto'] === 'https',
          maxAge: 60 * 60 * 1000
        });
        return res.redirect('/setup');
      }

      const auth = await authorize(req, config);
      if (!auth.ok) return sendUnauthorized(req, res, auth.state);
      return res.send(renderSetupPage(res.locals.cspNonce));
    } catch (error) {
      next(error);
    }
  });

  router.use('/api', async (req, res, next) => {
    try {
      const auth = await authorize(req, config);
      if (!auth.ok) return jsonError(res, auth.state.enabled ? 401 : 403, auth.state.enabled ? 'Unauthorized setup request.' : 'Setup is disabled.');
      req.setupValues = auth.state.values;
      next();
    } catch (error) {
      next(error);
    }
  });

  router.get('/api/state', async (req, res) => {
    const values = req.setupValues;
    const base = publicBase(values);
    res.json({
      ok: true,
      fields: safeFieldState(values),
      links: {
        publicKeyUrl: base ? `${base}${WELL_KNOWN_KEY_PATH}` : '',
        teslaEnrollUrl: teslaEnrollUrl(values),
        alexaConsoleUrl: 'https://developer.amazon.com/alexa/console/ask',
        teslaDeveloperUrl: 'https://developer.tesla.com/'
      },
      checks: validateValues(values)
    });
  });

  router.post('/api/config', async (req, res) => {
    const incoming = req.body?.values || {};
    const updates = {};
    for (const field of FIELDS) {
      if (!(field.key in incoming)) continue;
      const value = String(incoming[field.key] ?? '').trim();
      if (field.sensitive && value === '') continue;
      updates[field.key] = value;
    }

    if (updates.PUBLIC_BASE_URL && !updates.TESLA_OAUTH_REDIRECT_URI) {
      updates.TESLA_OAUTH_REDIRECT_URI = `${updates.PUBLIC_BASE_URL.replace(/\/$/, '')}/oauth/callback`;
    }

    await writeEnvValues(config.appEnvFile, updates);
    res.json({ ok: true, message: 'Configuration saved. Restart the Docker service after setup is complete.' });
  });

  router.post('/api/validate', async (req, res) => {
    res.json({ ok: true, ...validateValues(req.setupValues) });
  });

  router.post('/api/oauth-url', async (req, res) => {
    const values = req.setupValues;
    const clientId = values.TESLA_CLIENT_ID;
    const redirectUri = oauthRedirect(values);
    if (!clientId || !redirectUri) return jsonError(res, 400, 'Tesla client ID and redirect URI are required.');

    const state = randomBytes(24).toString('hex');
    const nonce = randomBytes(24).toString('hex');
    const url = new URL('https://auth.tesla.com/oauth2/v3/authorize');
    url.searchParams.set('response_type', 'code');
    url.searchParams.set('client_id', clientId);
    url.searchParams.set('redirect_uri', redirectUri);
    url.searchParams.set('scope', values.TESLA_OAUTH_SCOPES || 'openid offline_access vehicle_device_data vehicle_cmds');
    url.searchParams.set('state', state);
    url.searchParams.set('nonce', nonce);
    url.searchParams.set('prompt_missing_scopes', 'true');
    url.searchParams.set('require_requested_scopes', 'true');
    url.searchParams.set('show_keypair_step', 'true');
    res.json({ ok: true, url: url.toString(), state });
  });

  router.post('/api/exchange-code', async (req, res) => {
    const code = String(req.body?.code || '').trim();
    if (!code) return jsonError(res, 400, 'Authorization code is required.');
    const values = req.setupValues;
    for (const key of ['TESLA_CLIENT_ID', 'TESLA_CLIENT_SECRET', 'TESLA_AUDIENCE', 'TESLA_AUTH_BASE_URL']) {
      if (!values[key]) return jsonError(res, 400, `${key} is required.`);
    }

    const form = new URLSearchParams({
      grant_type: 'authorization_code',
      client_id: values.TESLA_CLIENT_ID,
      client_secret: values.TESLA_CLIENT_SECRET,
      code,
      audience: values.TESLA_AUDIENCE,
      redirect_uri: oauthRedirect(values)
    });

    const response = await request(`${values.TESLA_AUTH_BASE_URL.replace(/\/$/, '')}/oauth2/v3/token`, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: form.toString()
    });
    const text = await response.body.text();
    const payload = text ? JSON.parse(text) : {};
    if (response.statusCode >= 400) return jsonError(res, 400, payload.error_description || payload.error || 'Tesla token exchange failed.');

    const tokenStore = new TokenStore({
      tokenFile: values.TESLA_TOKEN_FILE || DEFAULTS.TESLA_TOKEN_FILE,
      initialRefreshToken: values.TESLA_REFRESH_TOKEN || ''
    });
    await tokenStore.save(payload);
    res.json({ ok: true, message: 'Tesla token saved locally.' });
  });

  router.post('/api/check-public-key', async (req, res) => {
    const base = publicBase(req.setupValues);
    if (!base) return jsonError(res, 400, 'PUBLIC_BASE_URL is required.');
    const url = `${base}${WELL_KNOWN_KEY_PATH}`;
    const response = await request(url, { method: 'GET' });
    const body = await response.body.text();
    const fingerprint = createHash('sha256').update(body).digest('hex').slice(0, 16);
    res.json({
      ok: response.statusCode >= 200 && response.statusCode < 300 && body.includes('-----BEGIN PUBLIC KEY-----'),
      statusCode: response.statusCode,
      url,
      fingerprint,
      message: body.includes('-----BEGIN PUBLIC KEY-----') ? 'Public key is reachable.' : 'Public key response does not look like a PEM public key.'
    });
  });

  router.get('/api/alexa-model', async (req, res, next) => {
    try {
      const model = await readFile(resolve('alexa/interaction-model.json'), 'utf8');
      res.setHeader('content-type', 'application/json');
      res.setHeader('content-disposition', 'attachment; filename="interaction-model.json"');
      res.send(model);
    } catch (error) {
      next(error);
    }
  });

  return router;
}

function validateValues(values) {
  const missing = REQUIRED_KEYS.filter((key) => !values[key]);
  const warnings = [];
  if (String(values.SETUP_ENABLED || '').toLowerCase() === 'true') warnings.push('Disable setup after configuration is complete.');
  if (!publicBase(values).startsWith('https://')) warnings.push('Alexa requires a public HTTPS endpoint.');
  return { missing, warnings, ready: missing.length === 0 };
}

export function publicKeyHandler(config) {
  return async (req, res, next) => {
    try {
      const values = { ...DEFAULTS, ...process.env, ...(await readEnvValues(config.appEnvFile)) };
      const keyFile = values.TESLA_PUBLIC_KEY_FILE || config.tesla.publicKeyFile;
      res.type('application/x-pem-file');
      res.sendFile(resolve(keyFile));
    } catch (error) {
      if (error.code === 'ENOENT') return res.status(404).send('Tesla public key is not configured.');
      next(error);
    }
  };
}
