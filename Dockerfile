FROM node:24-bookworm-slim

ARG TARGETARCH

RUN set -eux; \
    apt-get update; \
    apt-get install -y --no-install-recommends ca-certificates curl unzip; \
    case "$TARGETARCH" in \
      amd64) aws_arch="x86_64" ;; \
      arm64) aws_arch="aarch64" ;; \
      *) echo "Unsupported architecture for AWS CLI: $TARGETARCH" >&2; exit 1 ;; \
    esac; \
    curl --fail --show-error --silent --location \
      "https://awscli.amazonaws.com/awscli-exe-linux-${aws_arch}.zip" \
      --output /tmp/awscliv2.zip; \
    unzip -q /tmp/awscliv2.zip -d /tmp; \
    /tmp/aws/install; \
    aws --version; \
    rm -rf /tmp/aws /tmp/awscliv2.zip /var/lib/apt/lists/*

WORKDIR /app

ENV NODE_ENV=development
ENV NEXT_TELEMETRY_DISABLED=1

COPY . .

EXPOSE 3000

# Install directly into the container's dependency volume to save disk space.
CMD ["sh", "-c", "npm ci --cache /tmp/npm-cache && rm -rf /tmp/npm-cache && npm run dev"]
