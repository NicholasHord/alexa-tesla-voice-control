import 'dotenv/config';

function intFromEnv(name, fallback) {
  const raw = process.env[name];
  if (!raw) return fallback;
  const value = Number.parseInt(raw, 10);
  if (!Number.isFinite(value) || value < 0) {
    throw new Error(`${name} must be a non-negative integer`);
  }
  return value;
}

function boolFromEnv(name, fallback = false) {
  const raw = process.env[name];
  if (raw === undefined) return fallback;
  return ['1', 'true', 'yes', 'on'].includes(raw.toLowerCase());
}

function required(name) {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
}

export function loadConfig({ strict = true } = {}) {
  const get = strict ? required : (name) => process.env[name] || '';

  return {
    nodeEnv: process.env.NODE_ENV || 'development',
    port: intFromEnv('PORT', 3000),
    publicBaseUrl: process.env.PUBLIC_BASE_URL || '',
    appEnvFile: process.env.APP_ENV_FILE || './.env',
    setup: {
      enabled: boolFromEnv('SETUP_ENABLED'),
      adminToken: process.env.SETUP_ADMIN_TOKEN || ''
    },
    alexa: {
      skillId: get('ALEXA_SKILL_ID'),
      disableSignatureVerification: boolFromEnv('DISABLE_ALEXA_SIGNATURE_VERIFICATION')
    },
    tesla: {
      clientId: get('TESLA_CLIENT_ID'),
      clientSecret: get('TESLA_CLIENT_SECRET'),
      refreshToken: process.env.TESLA_REFRESH_TOKEN || '',
      tokenFile: process.env.TESLA_TOKEN_FILE || './data/tesla-tokens.json',
      vin: get('TESLA_VIN'),
      audience: process.env.TESLA_AUDIENCE || 'https://fleet-api.prd.na.vn.cloud.tesla.com',
      authBaseUrl: process.env.TESLA_AUTH_BASE_URL || 'https://fleet-auth.prd.vn.cloud.tesla.com',
      fleetBaseUrl: process.env.TESLA_FLEET_BASE_URL || 'https://fleet-api.prd.na.vn.cloud.tesla.com',
      commandProxyUrl: process.env.TESLA_COMMAND_PROXY_URL || 'https://tesla-command-proxy:4443',
      commandProxyCaCert: process.env.TESLA_COMMAND_PROXY_CA_CERT || '',
      publicKeyFile: process.env.TESLA_PUBLIC_KEY_FILE || './public/com.tesla.3p.public-key.pem',
      oauthRedirectUri: process.env.TESLA_OAUTH_REDIRECT_URI || '',
      oauthScopes: process.env.TESLA_OAUTH_SCOPES || 'openid offline_access vehicle_device_data vehicle_cmds'
    },
    command: {
      pin: process.env.COMMAND_PIN || '',
      statusCacheTtlSeconds: intFromEnv('STATUS_CACHE_TTL_SECONDS', 45),
      wakeTimeoutSeconds: intFromEnv('COMMAND_WAKE_TIMEOUT_SECONDS', 45),
      coolTargetCelsius: Number.parseFloat(process.env.COOL_TARGET_CELSIUS || '19')
    }
  };
}
