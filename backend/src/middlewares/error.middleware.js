import { ApiError } from "../utils/index.js";
import env from "../config/env.js";

const errorHandler = (err, _, res, next) => {
  let error = err;

  if (err.name === "CastError") {
    error = ApiError.badRequest(`Invalid ${err.path}: ${err.value}`);
  }

  if (err.code === 11000) {
    const field = Object.keys(err.keyValue)[0];
    error = ApiError.conflict(`'${field}' already exists`);
  }

  if (err.name === "ValidationError") {
    const errors = Object.values(err.errors).map((e) => e.message);
    error = ApiError.badRequest("Validation failed", errors);
  }

  if (err.name === "JsonWebTokenError") {
    error = ApiError.unauthorized("Invalid token");
  }

  if (err.name === "TokenExpiredError") {
    error = ApiError.unauthorized("Token expired");
  }

  const statusCode = error.statusCode || 500;
  const message = error.message || "Internal Server Error";

  const response = {
    success: false,
    message,
    ...(error.errors?.length && { errors: error.errors }),
    ...(env.MODE === "development" && { stack: error.stack }),
  };

  res.status(statusCode).json(response);
};

const notFoundHandler = (req, _, next) => {
  next(ApiError.notFound(`Route '${req.originalUrl}' not found`));
};

export { errorHandler, notFoundHandler };
