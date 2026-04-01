FROM node:20-slim

# Install ffmpeg for video support
RUN apt-get update && \
    apt-get install -y --no-install-recommends ffmpeg && \
    rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package.json tsconfig.json ./
COPY src/ ./src/

RUN npm install --omit=dev && \
    npx tsc

ENTRYPOINT ["node", "/app/dist/action.js"]
