import { s3Service } from "../services/index.js";
import { asyncHandler, ApiError } from "../utils/index.js";

class MediaController {
  streamItemImage = asyncHandler(async (req, res, next) => {
    const { fileName } = req.params;
    if (!fileName || fileName.includes("..")) {
      throw ApiError.badRequest("Invalid file name");
    }
    const key = `items/${fileName}`;
    const { stream, contentType, contentLength } = await s3Service.getFileStream(key);

    res.setHeader("Content-Type", contentType);
    if (contentLength) {
      res.setHeader("Content-Length", contentLength);
    }
    res.setHeader("Cache-Control", "public, max-age=86400, stale-while-revalidate=3600");
    stream.on("error", (err) => {
      if (!res.headersSent) next(err);
    });
    stream.pipe(res);
  });

  streamSignature = asyncHandler(async (req, res, next) => {
    const { fileName } = req.params;
    if (!fileName || fileName.includes("..")) {
      throw ApiError.badRequest("Invalid file name");
    }
    const key = `users/signatures/${fileName}`;
    const { stream, contentType, contentLength } = await s3Service.getFileStream(key);

    res.setHeader("Content-Type", contentType);
    if (contentLength) {
      res.setHeader("Content-Length", contentLength);
    }
    res.setHeader("Cache-Control", "public, max-age=86400, stale-while-revalidate=3600");
    stream.on("error", (err) => {
      if (!res.headersSent) next(err);
    });
    stream.pipe(res);
  });

  streamFile = asyncHandler(async (req, res, next) => {
    const fileKey = req.query.key;
    if (!fileKey || typeof fileKey !== "string" || fileKey.includes("..")) {
      throw ApiError.badRequest("Invalid file key");
    }
    // Prevent access to sensitive directories like backups through unauthenticated media proxy
    if (fileKey.startsWith("backups/") || fileKey.startsWith("private/")) {
      throw ApiError.forbidden("Access to this file is restricted");
    }

    const { stream, contentType, contentLength } = await s3Service.getFileStream(fileKey);

    res.setHeader("Content-Type", contentType);
    if (contentLength) {
      res.setHeader("Content-Length", contentLength);
    }
    res.setHeader("Cache-Control", "public, max-age=86400, stale-while-revalidate=3600");
    stream.on("error", (err) => {
      if (!res.headersSent) next(err);
    });
    stream.pipe(res);
  });
}

const mediaController = new MediaController();
export default mediaController;
