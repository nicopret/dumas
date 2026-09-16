#!/bin/sh
set -eu

aws --version
aws sts get-caller-identity

if [ -z "${DUMAS_S3_BUCKET:-}" ]; then
  echo "DUMAS_S3_BUCKET is not configured." >&2
  exit 1
fi

aws s3api head-bucket --bucket "$DUMAS_S3_BUCKET"
