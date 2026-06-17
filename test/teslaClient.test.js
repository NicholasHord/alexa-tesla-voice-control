import test from 'node:test';
import assert from 'node:assert/strict';
import { TeslaClient } from '../src/teslaClient.js';

function makeResponse(statusCode, payload) {
  return {
    statusCode,
    body: {
      async text() {
        return JSON.stringify(payload);
      }
    }
  };
}

test('refreshes and saves rotated Tesla tokens', async () => {
  const saved = [];
  const tokenStore = {
    async getAccessToken() {
      return '';
    },
    async getRefreshToken() {
      return 'old-refresh';
    },
    async save(tokens) {
      saved.push(tokens);
    }
  };

  const calls = [];
  const client = new TeslaClient({
    config: {
      tesla: {
        clientId: 'client',
        clientSecret: 'secret',
        audience: 'https://fleet-api.prd.na.vn.cloud.tesla.com',
        authBaseUrl: 'https://fleet-auth.prd.vn.cloud.tesla.com'
      },
      command: { statusCacheTtlSeconds: 45 }
    },
    tokenStore,
    fetchImpl: async (url, options) => {
      calls.push({ url, options });
      return makeResponse(200, {
        access_token: 'new-access',
        refresh_token: 'new-refresh',
        expires_in: 28800
      });
    }
  });

  const token = await client.getAccessToken();
  assert.equal(token, 'new-access');
  assert.equal(saved[0].refresh_token, 'new-refresh');
  assert.equal(calls[0].options.method, 'POST');
  assert.match(calls[0].options.body, /grant_type=refresh_token/);
});

