# Dockerfile
FROM node:18-alpine

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm ci --only=production

# Copy source code
COPY . .

# Create non-root user
RUN addgroup -g 1001 -S nodejs && \
    adduser -S cronsync -u 1001

# Change ownership
RUN chown -R cronsync:nodejs /app
USER cronsync

EXPOSE 5500

CMD ["npm", "start"]