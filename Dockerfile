FROM oven/bun:1 AS build
WORKDIR /app

# Install dependencies
COPY package.json bun.lock* ./
RUN bun install

# Copy source
COPY . .

# Build args for VITE_ env vars (injected at build time)
ARG VITE_SERVER_URL
ARG VITE_TON_NETWORK
ARG VITE_TON_MASTER_ADDRESS
ARG VITE_TONCENTER_API_KEY
ARG VITE_TONCONNECT_MANIFEST_URL

ENV VITE_SERVER_URL=$VITE_SERVER_URL
ENV VITE_TON_NETWORK=$VITE_TON_NETWORK
ENV VITE_TON_MASTER_ADDRESS=$VITE_TON_MASTER_ADDRESS
ENV VITE_TONCENTER_API_KEY=$VITE_TONCENTER_API_KEY
ENV VITE_TONCONNECT_MANIFEST_URL=$VITE_TONCONNECT_MANIFEST_URL

RUN bun run build

# Serve with nginx
FROM nginx:alpine
COPY --from=build /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
