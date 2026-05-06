FROM node:20-alpine

# Install ping utility for online detection
RUN apk add --no-cache iputils

WORKDIR /app

# Copy backend
COPY backend/package*.json ./
RUN npm install --production

COPY backend/server.js ./
COPY frontend/ ./frontend/

# Create data directory
RUN mkdir -p /data

EXPOSE 3000

CMD ["node", "server.js"]
