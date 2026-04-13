FROM node:20-slim

RUN apt-get update && apt-get install -y \
    chromium \
    fonts-liberation \
    fonts-noto-color-emoji \
    libgbm-dev \
    libnss3 \
    libatk-bridge2.0-0 \
    libx11-xcb1 \
    libxcomposite1 \
    libxdamage1 \
    libxrandr2 \
    libcups2 \
    libdrm2 \
    libpango-1.0-0 \
    libcairo2 \
    libasound2 \
    --no-install-recommends \
    && rm -rf /var/lib/apt/lists/*

ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium

RUN groupadd -r appuser && useradd -r -g appuser -d /app appuser

WORKDIR /app

COPY package.json package-lock.json* ./
RUN npm ci --omit=dev && npm cache clean --force

COPY tsconfig.json ./
COPY src/ ./src/
RUN npx tsc && rm -rf src tsconfig.json

RUN chown -R appuser:appuser /app
USER appuser

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --retries=3 \
  CMD node -e "fetch('http://localhost:3000/health').then(r=>{if(!r.ok)throw 1}).catch(()=>process.exit(1))"

CMD ["node", "dist/index.js"]
