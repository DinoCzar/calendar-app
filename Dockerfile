FROM node:20-bookworm-slim

WORKDIR /app

RUN apt-get update && apt-get install -y python3 make g++ \
    && rm -rf /var/lib/apt/lists/*

COPY server/package*.json ./server/
RUN npm ci --prefix server --omit=dev

COPY client/package*.json ./client/
RUN npm ci --prefix client

COPY server ./server
COPY client ./client
RUN npm run build --prefix client

ENV NODE_ENV=production

CMD ["node", "server/index.js"]
