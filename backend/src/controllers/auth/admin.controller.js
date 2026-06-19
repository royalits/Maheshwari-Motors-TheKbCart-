import {
  adminService,
  roleService,
  subscriptionService,
} from "../../services/index.js";
import { asyncHandler, ApiResponse } from "../../utils/index.js";

class AdminController {
  createSecondaryUser = asyncHandler(async (req, res) => {
    const result = await adminService.createSecondaryUser(req.body);
    res
      .status(201)
      .json(
        new ApiResponse(201, result, "Secondary user created successfully"),
      );
  });

  getSecondaryUsers = asyncHandler(async (req, res) => {
    const result = await adminService.getSecondaryUsers(req.query);
    res
      .status(200)
      .json(new ApiResponse(200, result, "Users fetched successfully"));
  });

  getSecondaryUserById = asyncHandler(async (req, res) => {
    const result = await adminService.getSecondaryUserById(req.params.userId);
    res
      .status(200)
      .json(new ApiResponse(200, result, "User fetched successfully"));
  });

  updateSecondaryUser = asyncHandler(async (req, res) => {
    const result = await adminService.updateSecondaryUser(
      req.params.userId,
      req.body,
    );
    res
      .status(200)
      .json(new ApiResponse(200, result, "User updated successfully"));
  });

  deactivateSecondaryUser = asyncHandler(async (req, res) => {
    await adminService.deactivateSecondaryUser(req.params.userId);
    res
      .status(200)
      .json(new ApiResponse(200, null, "User deactivated successfully"));
  });

  reactivateSecondaryUser = asyncHandler(async (req, res) => {
    const result = await adminService.reactivateSecondaryUser(
      req.params.userId,
    );
    res
      .status(200)
      .json(new ApiResponse(200, result, "User reactivated successfully"));
  });

  deleteSecondaryUser = asyncHandler(async (req, res) => {
    await adminService.deleteSecondaryUser(req.params.userId);
    res
      .status(200)
      .json(new ApiResponse(200, null, "User deleted successfully"));
  });

  getSubscriptions = asyncHandler(async (req, res) => {
    const result = await subscriptionService.getSubscriptions(req.query);
    res
      .status(200)
      .json(new ApiResponse(200, result, "Subscriptions fetched successfully"));
  });

  getRoles = asyncHandler(async (_req, res) => {
    const result = await roleService.getRoles();
    res
      .status(200)
      .json(new ApiResponse(200, result, "Roles fetched successfully"));
  });

  getSubscriptionByUserId = asyncHandler(async (req, res) => {
    const result = await subscriptionService.getSubscriptionByUserId(
      req.params.userId,
    );
    res
      .status(200)
      .json(new ApiResponse(200, result, "Subscription fetched successfully"));
  });

  setSubscription = asyncHandler(async (req, res) => {
    let userId = req.params.userId;
    if (!userId && req.body.username) {
      userId = await subscriptionService.resolveUserId(req.body.username);
    }
    const result = await subscriptionService.setSubscription(
      userId,
      req.body,
      req.user._id,
    );
    res
      .status(200)
      .json(new ApiResponse(200, result, "Subscription updated successfully"));
  });

  getExpiringToday = asyncHandler(async (_req, res) => {
    const result = await subscriptionService.getExpiringToday(new Date());
    res
      .status(200)
      .json(
        new ApiResponse(
          200,
          result,
          "Expiring subscriptions fetched successfully",
        ),
      );
  });

  runExpiryCheck = asyncHandler(async (_req, res) => {
    const result = await subscriptionService.markExpiredSubscriptions(
      new Date(),
    );
    res
      .status(200)
      .json(
        new ApiResponse(200, result, "Subscription expiry check completed"),
      );
  });

  uploadSignature = asyncHandler(async (req, res) => {
    const result = await adminService.uploadSignature(
      req.params.userId,
      req.file,
    );
    res
      .status(201)
      .json(new ApiResponse(201, result, "Signature uploaded successfully"));
  });

  updateSignature = asyncHandler(async (req, res) => {
    const result = await adminService.updateSignature(
      req.params.userId,
      req.file,
    );
    res
      .status(200)
      .json(new ApiResponse(200, result, "Signature updated successfully"));
  });
}

const adminController = new AdminController();

export const createSecondaryUser = adminController.createSecondaryUser;
export const getSecondaryUsers = adminController.getSecondaryUsers;
export const getSecondaryUserById = adminController.getSecondaryUserById;
export const updateSecondaryUser = adminController.updateSecondaryUser;
export const deactivateSecondaryUser = adminController.deactivateSecondaryUser;
export const reactivateSecondaryUser = adminController.reactivateSecondaryUser;
export const deleteSecondaryUser = adminController.deleteSecondaryUser;
export const getSubscriptions = adminController.getSubscriptions;
export const getRoles = adminController.getRoles;
export const getSubscriptionByUserId = adminController.getSubscriptionByUserId;
export const setSubscription = adminController.setSubscription;
export const getExpiringToday = adminController.getExpiringToday;
export const runExpiryCheck = adminController.runExpiryCheck;
export const uploadSignature = adminController.uploadSignature;
export const updateSignature = adminController.updateSignature;

export default adminController;
