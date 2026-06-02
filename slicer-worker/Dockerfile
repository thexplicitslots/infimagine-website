FROM debian:bookworm

RUN apt-get update && apt-get install -y \
  ca-certificates \
  nodejs \
  npm \
  prusa-slicer \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package.json package-lock.json* ./
RUN npm install --omit=dev

COPY . .

CMD ["npm", "start"]
