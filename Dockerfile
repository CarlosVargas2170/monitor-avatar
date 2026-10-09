# ---- Build ----
FROM node:22-alpine AS build
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY . .

# Las variables VITE_* se incrustan en el bundle en build time.
# En Dokploy: definirlas como Build Args (o en Environment, con "Build-time").
ARG VITE_SESSION_WS_URL
ARG VITE_MONITOR_WS_URL
ARG VITE_ORCHESTRATOR_WS_URL
ARG VITE_ORCHESTRATOR_HTTP_URL
ENV VITE_SESSION_WS_URL=$VITE_SESSION_WS_URL \
    VITE_MONITOR_WS_URL=$VITE_MONITOR_WS_URL \
    VITE_ORCHESTRATOR_WS_URL=$VITE_ORCHESTRATOR_WS_URL \
    VITE_ORCHESTRATOR_HTTP_URL=$VITE_ORCHESTRATOR_HTTP_URL

RUN npm run build

# ---- Runtime ----
FROM nginx:1.27-alpine
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
