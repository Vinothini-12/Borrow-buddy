FROM node:22-alpine

WORKDIR /app
ENV NODE_ENV=production

COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force

COPY . .
# Uploads live on a volume; create it owned by the non-root user so the volume inherits that.
RUN mkdir -p uploads && chown node:node uploads

USER node
EXPOSE 5050

# Migrate, seed demo data if the database is empty, then start the API.
CMD ["sh", "-c", "node scripts/migrate.js && node scripts/seedIfEmpty.js && exec node src/index.js"]
