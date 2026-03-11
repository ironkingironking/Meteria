FROM node:20-bookworm-slim AS base
WORKDIR /app

COPY package.json tsconfig.base.json ./
COPY apps/worker/package.json apps/worker/package.json
COPY packages/db/package.json packages/db/package.json

RUN npm install

COPY . .
RUN npm run db:generate -w @meteria/db
RUN npm run build -w @meteria/db && npm run build -w @meteria/worker

CMD ["npm", "run", "start", "-w", "@meteria/worker"]
