FROM node:20-bookworm-slim AS base
WORKDIR /app

COPY package.json tsconfig.base.json ./
COPY apps/web/package.json apps/web/package.json
RUN npm install

COPY . .
RUN npm run build -w @meteria/web

EXPOSE 3000
CMD ["npm", "run", "start", "-w", "@meteria/web"]
