import pino from 'pino';

const redactions = [
  'TESLA_CLIENT_SECRET',
  'TESLA_REFRESH_TOKEN',
  'COMMAND_PIN',
  'SETUP_ADMIN_TOKEN',
  'req.headers.authorization',
  'headers.authorization',
  '*.access_token',
  '*.refresh_token',
  '*.client_secret'
];

export const logger = pino({
  level: process.env.LOG_LEVEL || 'info',
  redact: {
    paths: redactions,
    censor: '[redacted]'
  }
});
