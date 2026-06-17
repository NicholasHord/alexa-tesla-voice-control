import { Agent, request } from 'undici';
import { readFile } from 'node:fs/promises';
import { logger } from './logger.js';

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function joinUrl(base, path) {
  return `${base.replace(/\/$/, '')}${path}`;
}

async function readJsonResponse(response, context) {
  const body = await response.body.text();
  let parsed = {};
  if (body) {
    try {
      parsed = JSON.parse(body);
    } catch {
      parsed = { raw: body };
    }
  }

  if (response.statusCode >= 400) {
    const message = parsed?.response?.reason || parsed?.error_description || parsed?.error || parsed?.raw || `${context} failed`;
    const error = new Error(message);
    error.statusCode = response.statusCode;
    error.payload = parsed;
    throw error;
  }

  return parsed;
}

export class TeslaClient {
  constructor({ config, tokenStore, fetchImpl = request }) {
    this.config = config;
    this.tokenStore = tokenStore;
    this.fetchImpl = fetchImpl;
    this.statusCache = null;
    this.proxyDispatcherPromise = null;
  }

  async getAccessToken() {
    const cached = await this.tokenStore.getAccessToken();
    if (cached) return cached;

    const refreshToken = await this.tokenStore.getRefreshToken();
    if (!refreshToken) {
      throw new Error('No Tesla refresh token is configured. Run the OAuth flow first.');
    }

    const form = new URLSearchParams({
      grant_type: 'refresh_token',
      client_id: this.config.tesla.clientId,
      client_secret: this.config.tesla.clientSecret,
      refresh_token: refreshToken,
      audience: this.config.tesla.audience
    });

    const response = await this.fetchImpl(joinUrl(this.config.tesla.authBaseUrl, '/oauth2/v3/token'), {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: form.toString()
    });

    const tokens = await readJsonResponse(response, 'Tesla token refresh');
    await this.tokenStore.save(tokens);
    return tokens.access_token;
  }

  async fleetRequest(path, { method = 'GET', body, live = false } = {}) {
    const accessToken = await this.getAccessToken();
    const response = await this.fetchImpl(joinUrl(this.config.tesla.fleetBaseUrl, path), {
      method,
      headers: {
        authorization: `Bearer ${accessToken}`,
        'content-type': 'application/json'
      },
      body: body ? JSON.stringify(body) : undefined
    });

    const parsed = await readJsonResponse(response, `Tesla Fleet API ${method} ${path}`);
    if (live) this.statusCache = null;
    return parsed;
  }

  async getVehicleSummary() {
    return this.fleetRequest(`/api/1/vehicles/${encodeURIComponent(this.config.tesla.vin)}`);
  }

  async getVehicleData({ useCache = true } = {}) {
    const now = Date.now();
    const ttlMs = this.config.command.statusCacheTtlSeconds * 1000;
    if (useCache && this.statusCache && now - this.statusCache.createdAt < ttlMs) {
      return this.statusCache.payload;
    }

    const payload = await this.fleetRequest(`/api/1/vehicles/${encodeURIComponent(this.config.tesla.vin)}/vehicle_data`, { live: true });
    this.statusCache = { createdAt: now, payload };
    return payload;
  }

  async wakeVehicleIfNeeded() {
    const summary = await this.getVehicleSummary();
    const state = summary?.response?.state;
    if (state === 'online') return summary;

    logger.info({ vehicleState: state }, 'Waking vehicle');
    let last = await this.fleetRequest(`/api/1/vehicles/${encodeURIComponent(this.config.tesla.vin)}/wake_up`, { method: 'POST', live: true });
    const deadline = Date.now() + this.config.command.wakeTimeoutSeconds * 1000;

    while (Date.now() < deadline) {
      if (last?.response?.state === 'online') return last;
      await sleep(3000);
      last = await this.getVehicleSummary();
      if (last?.response?.state === 'online') return last;
    }

    throw new Error('Vehicle did not wake before the command timeout.');
  }

  async getProxyDispatcher() {
    if (!this.config.tesla.commandProxyCaCert) return undefined;
    if (!this.proxyDispatcherPromise) {
      this.proxyDispatcherPromise = readFile(this.config.tesla.commandProxyCaCert).then((ca) => new Agent({ connect: { ca } }));
    }
    return this.proxyDispatcherPromise;
  }

  async command(commandName, body = {}, { wake = true } = {}) {
    if (wake) await this.wakeVehicleIfNeeded();
    const accessToken = await this.getAccessToken();
    const dispatcher = await this.getProxyDispatcher();
    const path = `/api/1/vehicles/${encodeURIComponent(this.config.tesla.vin)}/command/${commandName}`;
    const response = await this.fetchImpl(joinUrl(this.config.tesla.commandProxyUrl, path), {
      method: 'POST',
      headers: {
        authorization: `Bearer ${accessToken}`,
        'content-type': 'application/json'
      },
      body: JSON.stringify(body),
      dispatcher
    });

    const parsed = await readJsonResponse(response, `Tesla command ${commandName}`);
    this.statusCache = null;
    if (parsed?.response?.result === false) {
      throw new Error(parsed.response.reason || `Tesla command ${commandName} was rejected`);
    }
    return parsed;
  }

  async statusSpeech() {
    const data = await this.getVehicleData();
    const vehicle = data?.response || {};
    const charge = vehicle.charge_state || {};
    const climate = vehicle.climate_state || {};
    const drive = vehicle.drive_state || {};
    const vehicleState = vehicle.state || 'unknown';
    const battery = charge.battery_level;
    const insideTemp = climate.inside_temp;
    const locked = vehicle.vehicle_state?.locked;
    const shiftState = drive.shift_state || 'parked';

    const parts = [`Your Tesla is ${vehicleState}`];
    if (Number.isFinite(battery)) parts.push(`battery is ${battery} percent`);
    if (Number.isFinite(insideTemp)) parts.push(`cabin is ${Math.round(insideTemp)} degrees Celsius`);
    if (typeof locked === 'boolean') parts.push(locked ? 'doors are locked' : 'doors are unlocked');
    parts.push(`drive state is ${shiftState}`);
    return `${parts.join(', ')}.`;
  }
}

