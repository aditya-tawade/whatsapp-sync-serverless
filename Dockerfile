FROM node:20-slim

# Install Chromium and runtime dependencies for Puppeteer
RUN apt-get update && apt-get install -y --no-install-recommends \
    chromium \
    fonts-liberation \
    ca-certificates \
    && rm -rf /var/lib/apt/lists/*

ENV RUNNING_IN_DOCKER="true"
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD="true"
ENV PUPPETEER_EXECUTABLE_PATH="/usr/bin/chromium"

WORKDIR /app

# Install dependencies
COPY package*.json ./
RUN npm install

# Copy application source code
COPY . .

# Default command: runs the weekly cron daemon
CMD ["npm", "run", "daemon"]
