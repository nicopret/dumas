FROM node:24-bookworm-slim

WORKDIR /app

ENV NODE_ENV=development
ENV NEXT_TELEMETRY_DISABLED=1

COPY . .

EXPOSE 3000

# Install directly into the container's dependency volume to save disk space.
CMD ["sh", "-c", "npm ci --cache /tmp/npm-cache && rm -rf /tmp/npm-cache && npm run dev"]
