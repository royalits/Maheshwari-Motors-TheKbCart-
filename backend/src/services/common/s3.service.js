import {
  PutObjectCommand,
  DeleteObjectCommand,
  GetObjectCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import s3Config from "../../config/s3.js";
import env from "../../config/env.js";
import { ApiError } from "../../utils/index.js";
import crypto from "crypto";

class S3Service {
  constructor() {
    this._client = null;
    this._bucketName = null;
  }

  get client() {
    if (!this._client) {
      this._client = s3Config.getClient();
    }
    return this._client;
  }

  get bucketName() {
    if (!this._bucketName) {
      this._bucketName = s3Config.getBucketName();
    }
    return this._bucketName;
  }

  generateFileName(originalName) {
    const ext = originalName.split(".").pop();
    const uniqueId = crypto.randomBytes(16).toString("hex");
    return `${uniqueId}.${ext}`;
  }

  async uploadFile(fileBuffer, originalName, mimeType, folder = "items") {
    try {
      // Get region from environment config, not from client (which is an async function in AWS SDK v3)
      const region = env.AWS_REGION || "ap-south-1";
      console.log("[S3Service.uploadFile] Starting upload", {
        bucket: this.bucketName || "",
        region,
        folder,
        originalName,
        mimeType,
        bufferSize: Buffer.isBuffer(fileBuffer) ? fileBuffer.length : 0,
        isBuffer: Buffer.isBuffer(fileBuffer),
      });
      
      if (!this.bucketName) {
        console.error("[S3Service.uploadFile] ERROR: Bucket name not configured");
        throw ApiError.internal("S3 bucket is not configured");
      }
      
      if (!this.client) {
        console.error("[S3Service.uploadFile] ERROR: S3 client not initialized");
        throw ApiError.internal("S3 client is not configured");
      }
      
      const fileName = this.generateFileName(originalName);
      const key = `${folder}/${fileName}`;

      console.log("[S3Service.uploadFile] Generated key:", key);

      const command = new PutObjectCommand({
        Bucket: this.bucketName,
        Key: key,
        Body: fileBuffer,
        ContentType: mimeType,
      });
      
      console.log("[S3Service.uploadFile] Sending PutObjectCommand to S3");
      await this.client.send(command);

      const url = `https://${this.bucketName}.s3.${region}.amazonaws.com/${key}`;
      console.log("[S3Service.uploadFile] SUCCESS: File uploaded", { key, url });
      return url;
    } catch (error) {
      console.error("[S3Service.uploadFile] FAILED:", {
        message: error?.message,
        name: error?.name,
        code: error?.code,
        state: error?.state,
        stack: error?.stack?.split('\n').slice(0, 5).join('\n'),
      });
      if (error instanceof ApiError) throw error;
      throw ApiError.internal(`Failed to upload file: ${error?.message}`);
    }
  }

  async deleteFile(fileUrl) {
    try {
      const url = new URL(fileUrl);
      const key = url.pathname.substring(1);

      const command = new DeleteObjectCommand({
        Bucket: this.bucketName,
        Key: key,
      });
      await this.client.send(command);
    } catch (error) {
      console.error("S3 delete error:", error);
    }
  }

  async getSignedUrl(key, expiresIn = 3600) {
    try {
      const command = new GetObjectCommand({
        Bucket: this.bucketName,
        Key: key,
      });
      return await getSignedUrl(this.client, command, { expiresIn });
    } catch (error) {
      console.error("S3 signed URL error:", error);
      throw ApiError.internal("Failed to generate signed URL");
    }
  }

  async getFile(fileUrl) {
    try {
      const url = new URL(fileUrl);
      const key = url.pathname.substring(1);
      const response = await this.client.send(
        new GetObjectCommand({
          Bucket: this.bucketName,
          Key: key,
        }),
      );
      const bytes = await response.Body.transformToByteArray();
      return {
        buffer: Buffer.from(bytes),
        contentType: response.ContentType || "image/png",
      };
    } catch (error) {
      console.error("S3 get file error:", error);
      throw ApiError.internal("Failed to load file");
    }
  }
}

export default new S3Service();
