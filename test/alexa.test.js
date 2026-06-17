import test from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { createAlexaHandler, testInternals } from '../src/alexa.js';
import { createApp } from '../src/server.js';

function baseRequest(intentName, { slots = {}, attributes = {} } = {}) {
  const slotObject = Object.fromEntries(Object.entries(slots).map(([name, value]) => [name, { name, value }]));
  return {
    session: {
      application: { applicationId: 'amzn1.ask.skill.test' },
      attributes
    },
    request: {
      type: 'IntentRequest',
      intent: {
        name: intentName,
        slots: slotObject
      }
    }
  };
}

test('normalizes spoken PIN values', () => {
  assert.equal(testInternals.normalizePin('one two three four'), '1234');
  assert.equal(testInternals.normalizePin('1234'), '1234');
  assert.equal(testInternals.normalizePin('oh nine 8 seven'), '0987');
});

test('sensitive command prompts for pin', async () => {
  const handler = createAlexaHandler({
    config: {
      alexa: { skillId: 'amzn1.ask.skill.test' },
      command: { pin: '1234', coolTargetCelsius: 19 }
    },
    teslaClient: {}
  });

  const response = await handler(baseRequest('UnlockVehicleIntent'));
  assert.equal(response.response.shouldEndSession, false);
  assert.equal(response.sessionAttributes.pendingCommand, 'unlock');
});

test('pending command runs after correct pin', async () => {
  const calls = [];
  const handler = createAlexaHandler({
    config: {
      alexa: { skillId: 'amzn1.ask.skill.test' },
      command: { pin: '1234', coolTargetCelsius: 19 }
    },
    teslaClient: {
      async command(name, body) {
        calls.push({ name, body });
        return { response: { result: true } };
      }
    }
  });

  const response = await handler(baseRequest('ConfirmPinIntent', {
    slots: { pin: '1234' },
    attributes: { pendingCommand: 'unlock' }
  }));

  assert.equal(response.response.outputSpeech.text, 'Unlocked.');
  assert.deepEqual(calls, [{ name: 'door_unlock', body: {} }]);
});

test('frunk intent actuates the front trunk', async () => {
  const calls = [];
  const handler = createAlexaHandler({
    config: {
      alexa: { skillId: 'amzn1.ask.skill.test' },
      command: { pin: '', coolTargetCelsius: 19 }
    },
    teslaClient: {
      async command(name, body) {
        calls.push({ name, body });
        return { response: { result: true } };
      }
    }
  });

  const response = await handler(baseRequest('OpenFrunkIntent'));
  assert.equal(response.response.outputSpeech.text, 'Frunk opened.');
  assert.deepEqual(calls, [{ name: 'actuate_trunk', body: { which_trunk: 'front' } }]);
});

test('trunk intent defaults to rear trunk', async () => {
  const calls = [];
  const handler = createAlexaHandler({
    config: {
      alexa: { skillId: 'amzn1.ask.skill.test' },
      command: { pin: '', coolTargetCelsius: 19 }
    },
    teslaClient: {
      async command(name, body) {
        calls.push({ name, body });
        return { response: { result: true } };
      }
    }
  });

  const response = await handler(baseRequest('OpenTrunkIntent'));
  assert.equal(response.response.outputSpeech.text, 'Trunk opened.');
  assert.deepEqual(calls, [{ name: 'actuate_trunk', body: { which_trunk: 'rear' } }]);
});


test('rejects wrong Alexa skill id', async () => {
  const handler = createAlexaHandler({
    config: {
      alexa: { skillId: 'expected' },
      command: { pin: '', coolTargetCelsius: 19 }
    },
    teslaClient: {}
  });

  const response = await handler(baseRequest('VehicleStatusIntent'));
  assert.equal(response.response.outputSpeech.text, 'This request is not authorized.');
});

test('http endpoint handles local unsigned Alexa request when explicitly disabled', async () => {
  const app = createApp({
    port: 0,
    alexa: {
      skillId: 'amzn1.ask.skill.local-test',
      disableSignatureVerification: true
    },
    tesla: {
      tokenFile: './data/test-tokens.json',
      refreshToken: '',
      vin: '',
      clientId: '',
      clientSecret: '',
      audience: '',
      authBaseUrl: '',
      fleetBaseUrl: '',
      commandProxyUrl: '',
      commandProxyCaCert: ''
    },
    command: {
      pin: '',
      statusCacheTtlSeconds: 45,
      wakeTimeoutSeconds: 45,
      coolTargetCelsius: 19
    }
  });

  const response = await request(app)
    .post('/alexa')
    .send({
      session: { application: { applicationId: 'amzn1.ask.skill.local-test' } },
      request: { type: 'LaunchRequest', requestId: 'local-launch' }
    })
    .expect(200);

  assert.equal(response.body.response.shouldEndSession, false);
});
