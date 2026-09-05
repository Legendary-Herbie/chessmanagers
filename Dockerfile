FROM node:22-alpine AS frontend
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM node:22-alpine AS production
WORKDIR /app/server
ENV NODE_ENV=production
ENV SERVE_FRONTEND=true
ENV PORT=5000
COPY server/package.json server/package-lock.json ./
RUN npm ci --omit=dev
COPY server/ ./
COPY --from=frontend /app/dist /app/dist
RUN mkdir -p /app/server/uploads && chown -R node:node /app/server/uploads
USER node
EXPOSE 5000
CMD ["node", "index.js"]
