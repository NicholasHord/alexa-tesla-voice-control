const SENSITIVE_COMMANDS = new Set(['unlock', 'open_trunk', 'open_frunk']);

function speechResponse(outputSpeech, { shouldEndSession = true, reprompt, sessionAttributes = {} } = {}) {
  const response = {
    version: '1.0',
    sessionAttributes,
    response: {
      outputSpeech: {
        type: 'PlainText',
        text: outputSpeech
      },
      shouldEndSession
    }
  };

  if (reprompt) {
    response.response.reprompt = {
      outputSpeech: {
        type: 'PlainText',
        text: reprompt
      }
    };
  }

  return response;
}

function getSlot(intent, name) {
  return intent?.slots?.[name]?.value || '';
}

function normalizePin(raw) {
  const words = {
    zero: '0',
    oh: '0',
    one: '1',
    two: '2',
    three: '3',
    four: '4',
    five: '5',
    six: '6',
    seven: '7',
    eight: '8',
    nine: '9'
  };

  return String(raw)
    .toLowerCase()
    .split(/[\s-]+/)
    .map((part) => words[part] ?? part)
    .join('')
    .replace(/\D/g, '');
}

function applicationId(requestBody) {
  return requestBody?.session?.application?.applicationId || requestBody?.context?.System?.application?.applicationId || '';
}

export function createAlexaHandler({ config, teslaClient }) {
  async function runCommand(command, slots = {}) {
    switch (command) {
      case 'unlock':
        await teslaClient.command('door_unlock', {});
        return 'Unlocked.';
      case 'lock':
        await teslaClient.command('door_lock', {});
        return 'Locked.';
      case 'open_trunk':
        await teslaClient.command('actuate_trunk', { which_trunk: slots.whichTrunk || 'rear' });
        return slots.whichTrunk === 'front' ? 'Frunk opened.' : 'Trunk opened.';
      case 'open_frunk':
        await teslaClient.command('actuate_trunk', { which_trunk: 'front' });
        return 'Frunk opened.';
      case 'start_climate':
        await teslaClient.command('auto_conditioning_start', {});
        return 'Climate started.';
      case 'stop_climate':
        await teslaClient.command('auto_conditioning_stop', {});
        return 'Climate stopped.';
      case 'cool_car':
        await teslaClient.command('set_temps', {
          driver_temp: config.command.coolTargetCelsius,
          passenger_temp: config.command.coolTargetCelsius
        });
        await teslaClient.command('auto_conditioning_start', {}, { wake: false });
        return `Cooling the car to ${config.command.coolTargetCelsius} degrees Celsius.`;
      case 'status':
        return teslaClient.statusSpeech();
      default:
        throw new Error(`Unknown command: ${command}`);
    }
  }

  function requirePinIfNeeded(command, request, slots = {}) {
    if (!config.command.pin || !SENSITIVE_COMMANDS.has(command)) return null;

    const providedPin = normalizePin(slots.pin || getSlot(request.intent, 'pin'));
    if (providedPin === config.command.pin) return null;

    return speechResponse('What is your Tesla command PIN?', {
      shouldEndSession: false,
      reprompt: 'Please say your Tesla command PIN.',
      sessionAttributes: {
        pendingCommand: command,
        pendingSlots: slots
      }
    });
  }

  async function handleIntent(requestBody) {
    const request = requestBody.request;
    const intent = request.intent || {};
    const intentName = intent.name;
    const sessionAttributes = requestBody.session?.attributes || {};

    if (intentName === 'UnlockVehicleIntent') {
      const pinResponse = requirePinIfNeeded('unlock', request);
      if (pinResponse) return pinResponse;
      return speechResponse(await runCommand('unlock'));
    }

    if (intentName === 'LockVehicleIntent') {
      return speechResponse(await runCommand('lock'));
    }

    if (intentName === 'OpenTrunkIntent') {
      const requested = getSlot(intent, 'trunkType').toLowerCase();
      const command = requested.includes('frunk') || requested.includes('front') ? 'open_frunk' : 'open_trunk';
      const slots = { whichTrunk: command === 'open_frunk' ? 'front' : 'rear' };
      const pinResponse = requirePinIfNeeded(command, request, slots);
      if (pinResponse) return pinResponse;
      return speechResponse(await runCommand(command, slots));
    }

    if (intentName === 'OpenFrunkIntent') {
      const slots = { whichTrunk: 'front' };
      const pinResponse = requirePinIfNeeded('open_frunk', request, slots);
      if (pinResponse) return pinResponse;
      return speechResponse(await runCommand('open_frunk', slots));
    }

    if (intentName === 'StartClimateIntent') {
      return speechResponse(await runCommand('start_climate'));
    }

    if (intentName === 'StopClimateIntent') {
      return speechResponse(await runCommand('stop_climate'));
    }

    if (intentName === 'CoolCarIntent') {
      return speechResponse(await runCommand('cool_car'));
    }

    if (intentName === 'VehicleStatusIntent') {
      return speechResponse(await runCommand('status'));
    }

    if (intentName === 'ConfirmPinIntent') {
      const pendingCommand = sessionAttributes.pendingCommand;
      const pendingSlots = sessionAttributes.pendingSlots || {};
      if (!pendingCommand) {
        return speechResponse('There is no pending Tesla command.');
      }

      const providedPin = normalizePin(getSlot(intent, 'pin'));
      if (providedPin !== config.command.pin) {
        return speechResponse('That PIN was not accepted. Command canceled.');
      }

      return speechResponse(await runCommand(pendingCommand, pendingSlots));
    }

    if (intentName === 'AMAZON.HelpIntent') {
      return speechResponse('You can ask me to lock the car, unlock the car, open the trunk, start climate, cool the car, or get vehicle status.', {
        shouldEndSession: false,
        reprompt: 'What Tesla command would you like?'
      });
    }

    if (['AMAZON.CancelIntent', 'AMAZON.StopIntent'].includes(intentName)) {
      return speechResponse('Canceled.');
    }

    return speechResponse('I did not understand that Tesla command.');
  }

  return async function handleAlexaRequest(requestBody) {
    if (config.alexa.skillId && applicationId(requestBody) !== config.alexa.skillId) {
      return speechResponse('This request is not authorized.');
    }

    const requestType = requestBody?.request?.type;
    if (requestType === 'LaunchRequest') {
      return speechResponse('Tesla control is ready. What would you like to do?', {
        shouldEndSession: false,
        reprompt: 'You can say lock my car, start climate, or vehicle status.'
      });
    }

    if (requestType === 'IntentRequest') {
      try {
        return await handleIntent(requestBody);
      } catch (error) {
        return speechResponse(`Tesla command failed: ${error.message}`);
      }
    }

    if (requestType === 'SessionEndedRequest') {
      return { version: '1.0', response: {} };
    }

    return speechResponse('Unsupported Alexa request.');
  };
}

export const testInternals = {
  normalizePin,
  speechResponse
};
