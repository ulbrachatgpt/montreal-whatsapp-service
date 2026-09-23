FROM node:20-bookworm-slim
WORKDIR /app
COPY package*.json ./
RUN npm install
COPY tsconfig.json ./
COPY src ./src
RUN npm run build && npm prune --omit=dev
ENV NODE_ENV=production
ENV PORT=3000
RUN mkdir -p /data/sessions && chown -R node:node /data /app
USER node
EXPOSE 3000
CMD ["npm","start"]