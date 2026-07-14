FROM node:22-alpine

WORKDIR /app

COPY package*.json ./
RUN npm install --omit=dev

COPY client/package*.json client/
RUN cd client && npm install

COPY . .
RUN cd client && npm run build && rm -rf node_modules src

ENV NODE_ENV=production
EXPOSE 8090

CMD ["node", "server/index.js"]
