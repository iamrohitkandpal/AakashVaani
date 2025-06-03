# Stage 1: Build React App
FROM node:18-alpine AS frontend-build
WORKDIR /app
COPY frontend/ /app/

# Install frontend dependencies and build
RUN npm install --legacy-peer-deps
RUN npm run build

# Stage 2: Setup Python Backend
FROM python:3.11-slim as backend
WORKDIR /app
COPY backend/ /app/
RUN pip install --no-cache-dir -r requirements.txt

# Stage 3: Final Image
FROM nginx:alpine
# Copy built frontend
COPY --from=frontend-build /app/build /usr/share/nginx/html
# Copy backend
COPY --from=backend /app /backend
# Copy nginx config
COPY nginx.conf /etc/nginx/nginx.conf
COPY entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

# Install Python and dependencies
RUN apk add --no-cache python3 py3-pip \
    && pip3 install --break-system-packages -r /backend/requirements.txt

# Add env variables
ENV PYTHONUNBUFFERED=1
ENV NODE_ENV=production

# Start both services
CMD ["/entrypoint.sh"]
