import { S3Client } from "@aws-sdk/client-s3";
import env from "./env.js";

class S3Config {
  constructor() {
    this.client = null;
    console.log("[S3Config] Initializing...");
  }

  getClient() {
    if (!this.client) {
      const hasStaticCreds = env.AWS_ACCESS_KEY_ID && env.AWS_SECRET_ACCESS_KEY;

      const clientConfig = {
        region: env.AWS_REGION,
      };

      if (hasStaticCreds) {
        clientConfig.credentials = {
          accessKeyId: env.AWS_ACCESS_KEY_ID,
          secretAccessKey: env.AWS_SECRET_ACCESS_KEY,
          ...(env.AWS_SESSION_TOKEN ?
            { sessionToken: env.AWS_SESSION_TOKEN }
          : {}),
        };
      }

      console.log("[S3Config.getClient] Creating S3Client with config:", {
        region: clientConfig.region,
        hasCredentials: !!clientConfig.credentials,
      });

      this.client = new S3Client(clientConfig);
    }
    return this.client;
  }

  getBucketName() {
    return env.AWS_S3_BUCKET_NAME;
  }
}

export default new S3Config();
