# Recova — single-container production image.
# Builds the frontend (into backend/dist-frontend) and the compiled backend,
# then serves both from Express. Postgres/Redis come from your infra
# (docker compose, managed DB, etc.).

# ---------- build ----------
FROM node:20-alpine AS build
WORKDIR /app

COPY package.json package-lock.json ./
COPY backend/package.json backend/
COPY frontend/package.json frontend/
RUN npm ci

COPY backend/ backend/
COPY frontend/ frontend/

RUN npm run build --workspace=frontend \
  && npm run typecheck --workspace=backend \
  && npx --workspace=backend prisma generate \
  && npm run build --workspace=backend

# ---------- run ----------
FROM node:20-alpine
WORKDIR /app
ENV NODE_ENV=production

COPY package.json package-lock.json ./
COPY backend/package.json backend/
RUN npm ci --workspace=backend --include-workspace-root=true

COPY --from=build /app/backend/dist backend/dist
COPY --from=build /app/backend/dist-frontend backend/dist-frontend
COPY --from=build /app/backend/prisma backend/prisma
COPY backend/tsconfig.json backend/

EXPOSE 8080
WORKDIR /app/backend

# Apply migrations, then serve API + built frontend.
CMD ["sh", "-c", "npx prisma migrate deploy && node dist/server.js"]
