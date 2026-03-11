FROM node:20-bookworm-slim AS base
WORKDIR /app

COPY package.json tsconfig.base.json ./
COPY apps/api/package.json apps/api/package.json
COPY packages/db/package.json packages/db/package.json
COPY packages/billing-engine/package.json packages/billing-engine/package.json
COPY packages/types/package.json packages/types/package.json
COPY packages/utils/package.json packages/utils/package.json

RUN npm install

COPY . .
RUN npm run db:generate -w @meteria/db
RUN npm run build -w @meteria/types && npm run build -w @meteria/utils && npm run build -w @meteria/billing-engine && npm run build -w @meteria/db && npm run build -w @meteria/api

EXPOSE 4000
CMD ["npm", "run", "start", "-w", "@meteria/api"]
