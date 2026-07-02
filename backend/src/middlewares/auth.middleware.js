import jwt from "jsonwebtoken";
import User from "../models/auth/user.model.js";
import Session from "../models/auth/session.model.js";
import Subscription from "../models/common/subscription.model.js";
import { ApiError, asyncHandler } from "../utils/index.js";
import { normalizeRole } from "../utils/role.utils.js";
import env from "../config/env.js";

const auth = asyncHandler(async (req, res, next) => {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    throw ApiError.unauthorized("No token provided");
  }

  const token = authHeader.split(" ")[1];

  try {
    const decoded = jwt.verify(token, env.JWT_SECRET);

    const session = await Session.findOne({ token });
    if (!session) {
      throw ApiError.unauthorized("Session expired or revoked");
    }

    session.last_active = new Date();
    session.save().catch(() => {});

    const user = await User.findById(decoded._id);
    if (!user || !user.is_active) {
      throw ApiError.unauthorized("User not found or inactive");
    }

    req.user = user;
    req.role = decoded.role;
    req.token = token;
    req.session_id = session._id;
    req.credentialKey =
      decoded.credential_key || session.credential_key || null;
    req.authScope = decoded.auth_scope || "super_admin";

    if (decoded.role === "firm") {
      req.firmType = decoded.firm_type;
      req.isGst = decoded.firm_type === "GST" ? 1 : 0;
      req.firmRole = normalizeRole(decoded.firm_role || "admin");
      req.contactId = decoded.contact_id || null;

      // Verify that firm's subscription is not expired
      const subscription = await Subscription.findOne({ user_id: decoded._id });
      if (subscription) {
        if (
          subscription.status === "expired" ||
          (subscription.expiry_date && new Date(subscription.expiry_date) < new Date())
        ) {
          if (subscription.status !== "expired") {
            subscription.status = "expired";
            await subscription.save().catch(() => {});
          }
          throw ApiError.paymentRequired("Subscription has expired");
        }
      }
    }

    next();
  } catch (error) {
    if (error instanceof ApiError) throw error;
    throw ApiError.unauthorized("Invalid token");
  }
});

export const requireAdmin = asyncHandler(async (req, res, next) => {
  if (req.role !== "admin") {
    throw ApiError.forbidden("Admin access required");
  }
  next();
});

export const requireFirm = asyncHandler(async (req, res, next) => {
  if (req.role !== "firm") {
    throw ApiError.forbidden("Firm access required");
  }
  next();
});

export default auth;
