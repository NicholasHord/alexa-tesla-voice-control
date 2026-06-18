import express from 'express';
import helmet from 'helmet';
import verifier from 'alexa-verifier-middleware';
import { randomBytes } from 'node:crypto';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadConfig } from './config.js';
import { logger } from './logger.js';
import { TokenStore } from './tokenStore.js';
import { TeslaClient } from './teslaClient.js';
import { createAlexaHandler } from './alexa.js';
import { createSetupRouter, publicKeyHandler } from './setup.js';

export function createApp(config = loadConfig({ strict: false }), options = {}) {
  const app = express();
  const tokenStore = new TokenStore({
    tokenFile: config.tesla.tokenFile,
    initialRefreshToken: config.tesla.refreshToken
  });
  const teslaClient = new TeslaClient({ config, tokenStore });
  const alexaHandler = createAlexaHandler({ config, teslaClient });

  app.disable('x-powered-by');
  app.use((req, res, next) => {
    res.locals.cspNonce = randomBytes(16).toString('base64');
    next();
  });
  const defaultCspDirectives = helmet.contentSecurityPolicy.getDefaultDirectives();
  delete defaultCspDirectives['script-src'];
  delete defaultCspDirectives['style-src'];
  app.use(helmet({
    contentSecurityPolicy: {
      directives: {
        ...defaultCspDirectives,
        scriptSrc: ["'self'", (req, res) => `'nonce-${res.locals.cspNonce}'`],
        styleSrc: ["'self'", (req, res) => `'nonce-${res.locals.cspNonce}'`],
        connectSrc: ["'self'"]
      }
    }
  }));

  app.get('/health', (req, res) => {
    res.json({ ok: true });
  });

  app.get('/.well-known/appspecific/com.tesla.3p.public-key.pem', publicKeyHandler(config));
  app.use('/setup', createSetupRouter({ config, requestImpl: options.setupRequestImpl }));

  const alexaMiddleware = config.alexa.disableSignatureVerification
    ? [express.json({ type: 'application/json' })]
    : [verifier];

  app.post('/alexa', alexaMiddleware, async (req, res) => {
    const requestId = req.body?.request?.requestId;
    try {
      const response = await alexaHandler(req.body);
      logger.info({ requestId, requestType: req.body?.request?.type }, 'Handled Alexa request');
      res.json(response);
    } catch (error) {
      logger.error({ requestId, err: error }, 'Unhandled Alexa request failure');
      res.status(500).json({
        version: '1.0',
        response: {
          outputSpeech: {
            type: 'PlainText',
            text: 'Tesla control had an internal error.'
          },
          shouldEndSession: true
        }
      });
    }
  });

  return app;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  const config = loadConfig({ strict: false });
  createApp(config).listen(config.port, () => {
    logger.info({ port: config.port }, 'Alexa Tesla service listening');
  });
}
