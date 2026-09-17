FROM node:20-alpine AS base

# Install deps
FROM base AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm install

# Build
FROM base AS builder
WORKDIR /app

# NEXT_PUBLIC_* vars must be present at build time (inlined by Next.js)
ARG NEXT_PUBLIC_API_URL=/satellite-api
ARG NEXT_PUBLIC_BASE_PATH=
ARG NEXT_PUBLIC_TITILER_URL=http://localhost:8080
ARG NEXT_PUBLIC_PROTOMAPS_URL=http://localhost:9000/openfarm/basemap
ARG NEXT_PUBLIC_SITE_URL=http://localhost:3000
ARG NEXT_PUBLIC_ENABLE_DEMO_LOGIN=false
ARG NEXT_PUBLIC_GLOSSARY_ASSET_BASE=
ARG NEXT_PUBLIC_OSS_URL=
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL
ENV NEXT_PUBLIC_BASE_PATH=$NEXT_PUBLIC_BASE_PATH
ENV NEXT_PUBLIC_TITILER_URL=$NEXT_PUBLIC_TITILER_URL
ENV NEXT_PUBLIC_PROTOMAPS_URL=$NEXT_PUBLIC_PROTOMAPS_URL
ENV NEXT_PUBLIC_SITE_URL=$NEXT_PUBLIC_SITE_URL
ENV NEXT_PUBLIC_ENABLE_DEMO_LOGIN=$NEXT_PUBLIC_ENABLE_DEMO_LOGIN
ENV NEXT_PUBLIC_GLOSSARY_ASSET_BASE=$NEXT_PUBLIC_GLOSSARY_ASSET_BASE
ENV NEXT_PUBLIC_OSS_URL=$NEXT_PUBLIC_OSS_URL

COPY --from=deps /app/node_modules ./node_modules
# The frontend is a standalone repository, so its root is the build context.
COPY . .
# Copy CHANGELOG.md into public/ so the API route can read it at runtime.
COPY CHANGELOG.md ./public/CHANGELOG.md
RUN npm run build

# Production
FROM nginx:alpine AS runner
WORKDIR /app
COPY --from=builder /app/out /usr/share/nginx/html

EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
