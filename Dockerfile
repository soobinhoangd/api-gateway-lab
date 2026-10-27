FROM node:24-alpine
WORKDIR /app
COPY package.json ./
COPY src ./src
COPY public ./public
USER node
CMD ["node", "src/gateway.js"]
