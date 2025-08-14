# Base image
FROM node:20-alpine

# Install dependencies
RUN apk add --no-cache docker-cli

# Set working directory
WORKDIR /app

# Copy package files
COPY package.json pnpm-lock.yaml ./

# Install pnpm and dependencies
RUN npm install -g pnpm
RUN pnpm install

# Copy source files
COPY . .

# Build the UI
RUN pnpm run build:ui

# Expose ports
EXPOSE 3000

# Start UI server
CMD ["pnpm", "run", "start:ui"]