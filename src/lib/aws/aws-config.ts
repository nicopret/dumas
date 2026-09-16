import "server-only";

export interface AwsConfig {
  region: string | undefined;
  bucket: string | undefined;
  prefix: string;
}

const DEFAULT_S3_PREFIX = "projects/";

function optionalValue(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed || undefined;
}

export function getAwsConfig(): AwsConfig {
  return {
    region: optionalValue(process.env.AWS_REGION),
    bucket: optionalValue(process.env.DUMAS_S3_BUCKET),
    prefix: optionalValue(process.env.DUMAS_S3_PREFIX) ?? DEFAULT_S3_PREFIX,
  };
}

export function isS3Configured(config: AwsConfig = getAwsConfig()): boolean {
  return Boolean(config.region && config.bucket);
}
