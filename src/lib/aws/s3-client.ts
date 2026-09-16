import "server-only";

import { S3Client } from "@aws-sdk/client-s3";
import { getAwsConfig } from "./aws-config.ts";

const config = getAwsConfig();

export const s3Client = new S3Client({
  region: config.region,
});
