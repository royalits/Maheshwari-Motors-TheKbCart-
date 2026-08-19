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

  extractKey(fileUrlOrKey) {
    if (!fileUrlOrKey || typeof fileUrlOrKey !== "string") return "";
    const trimmed = fileUrlOrKey.trim();
    if (trimmed.startsWith("http://") || trimmed.startsWith("https://")) {
      try {
        const url = new URL(trimmed);
        return decodeURIComponent(url.pathname.replace(/^\/+/, ""));
      } catch {
        return trimmed.replace(/^\/+/, "");
      }
    }
    return trimmed.replace(/^\/+/, "");
  }

  async uploadFile(fileBuffer, originalName, mimeType, folder = "items") {
    try {
      const region = env.AWS_REGION || "ap-south-1";
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

      const command = new PutObjectCommand({
        Bucket: this.bucketName,
        Key: key,
        Body: fileBuffer,
        ContentType: mimeType,
      });

      await this.client.send(command);

      const url = `https://${this.bucketName}.s3.${region}.amazonaws.com/${key}`;
      return url;
    } catch (error) {
      console.error("[S3Service.uploadFile] FAILED:", {
        message: error?.message,
        name: error?.name,
        code: error?.code,
      });
      if (error instanceof ApiError) throw error;
      throw ApiError.internal(`Failed to upload file: ${error?.message}`);
    }
  }

  async deleteFile(fileUrlOrKey) {
    try {
      const key = this.extractKey(fileUrlOrKey);
      if (!key) return;

      const command = new DeleteObjectCommand({
        Bucket: this.bucketName,
        Key: key,
      });
      await this.client.send(command);
    } catch (error) {
      console.error("S3 delete error:", error?.message);
    }
  }

  async getSignedUrl(fileUrlOrKey, expiresIn = 3600) {
    try {
      const key = this.extractKey(fileUrlOrKey);
      const command = new GetObjectCommand({
        Bucket: this.bucketName,
        Key: key,
      });
      return await getSignedUrl(this.client, command, { expiresIn });
    } catch (error) {
      console.error("S3 signed URL error:", error?.message);
      throw ApiError.internal("Failed to generate signed URL");
    }
  }

  async getFileStream(fileUrlOrKey) {
    try {
      const key = this.extractKey(fileUrlOrKey);
      if (!key) {
        throw ApiError.notFound("File key is required");
      }
      const response = await this.client.send(
        new GetObjectCommand({
          Bucket: this.bucketName,
          Key: key,
        }),
      );
      return {
        stream: response.Body,
        contentType: response.ContentType || "application/octet-stream",
        contentLength: response.ContentLength,
        key,
      };
    } catch (error) {
      if (error?.name === "NoSuchKey" || error?.$metadata?.httpStatusCode === 404) {
        throw ApiError.notFound("File not found in storage");
      }
      console.error("S3 get file stream error:", error?.message);
      throw ApiError.internal("Failed to load file stream");
    }
  }

  async getFile(fileUrlOrKey) {
    try {
      const key = this.extractKey(fileUrlOrKey);
      if (!key) {
        throw ApiError.notFound("File key is required");
      }
      const response = await this.client.send(
        new GetObjectCommand({
          Bucket: this.bucketName,
          Key: key,
        }),
      );
      const bytes = await response.Body.transformToByteArray();
      return {
        buffer: Buffer.from(bytes),
        contentType: response.ContentType || "application/octet-stream",
        key,
      };
    } catch (error) {
      if (error?.name === "NoSuchKey" || error?.$metadata?.httpStatusCode === 404) {
        throw ApiError.notFound("File not found in storage");
      }
      console.error("S3 get file error:", error?.message);
      throw ApiError.internal("Failed to load file");
    }
  }
}

export default new S3Service();
