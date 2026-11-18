FROM node:22-alpine
WORKDIR /app
RUN npm install --omit=dev --ignore-scripts --no-audit --no-fund jsqr@1.4.0
COPY server.mjs .
COPY public ./public
USER node
EXPOSE 8080
CMD ["node", "server.mjs"]
