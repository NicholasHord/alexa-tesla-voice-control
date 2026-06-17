FROM node:22-alpine

WORKDIR /app

COPY package*.json ./
RUN npm ci --omit=dev

COPY src ./src
COPY scripts ./scripts
COPY alexa ./alexa
COPY docs ./docs
COPY skill-package ./skill-package

ENV NODE_ENV=production
EXPOSE 3000

CMD ["node", "src/server.js"]
