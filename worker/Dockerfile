FROM node:20-alpine

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --omit=dev

COPY src ./src

# IMPORTANT: always run the CLI
ENTRYPOINT ["node", "src/cli.js"]