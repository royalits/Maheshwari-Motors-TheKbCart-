import { authService } from "../../services/index.js";
import { asyncHandler, ApiResponse } from "../../utils/index.js";

class AuthController {
  registerMainUser = asyncHandler(async (req, res) => {
    const result = await authService.registerMainUser(req.body);
    res
      .status(201)
      .json(new ApiResponse(201, result, "Main user registered successfully"));
  });

  login = asyncHandler(async (req, res) => {
    const { username, password, firm_type, device_name, device_type } = req.body;
    const ip_address =
      req.headers["x-forwarded-for"] || req.socket.remoteAddress || "";
    const result = await authService.login(username, password, firm_type, {
      device_name,
      device_type,
      ip_address,
    });
    res.status(200).json(new ApiResponse(200, result, "Login successful"));
  });

  logout = asyncHandler(async (req, res) => {
    await authService.logout(req.token);
    res.status(200).json(new ApiResponse(200, null, "Logout successful"));
  });

  getProfile = asyncHandler(async (req, res) => {
    const profile = await authService.getProfile(
      req.user,
      req.role,
      req.firmType,
      req.firmRole,
      req.credentialKey,
      req.contactId,
    );
    res
      .status(200)
      .json(new ApiResponse(200, profile, "Profile fetched successfully"));
  });

  changePassword = asyncHandler(async (req, res) => {
    const { current_password, new_password } = req.body;
    await authService.changePassword(
      req.user._id,
      req.role,
      req.firmType,
      current_password,
      new_password,
      req.credentialKey,
    );
    res
      .status(200)
      .json(new ApiResponse(200, null, "Password changed successfully"));
  });

  updateCredentials = asyncHandler(async (req, res) => {
    const result = await authService.updateCredentials(
      req.user._id,
      req.role,
      req.firmType,
      req.firmRole,
      req.body,
    );
    res
      .status(200)
      .json(new ApiResponse(200, result, "Credentials updated successfully"));
  });

  getSessions = asyncHandler(async (req, res) => {
    const sessions = await authService.getSessions(
      req.user._id,
      req.role,
      req.firmType,
      req.token,
      req.credentialKey,
    );
    res
      .status(200)
      .json(new ApiResponse(200, sessions, "Sessions fetched successfully"));
  });

  revokeSession = asyncHandler(async (req, res) => {
    await authService.revokeSession(req.params.sessionId, req.user._id);
    res
      .status(200)
      .json(new ApiResponse(200, null, "Session revoked successfully"));
  });

  revokeAllOtherSessions = asyncHandler(async (req, res) => {
    await authService.revokeAllOtherSessions(
      req.user._id,
      req.role,
      req.firmType,
      req.token,
      req.credentialKey,
    );
    res
      .status(200)
      .json(
        new ApiResponse(200, null, "All other sessions revoked successfully"),
      );
  });

  uploadSignature = asyncHandler(async (req, res) => {
    const result = await authService.uploadSignature(
      req.user._id,
      req.file,
      req.role,
      req.firmType
    );
    res
      .status(201)
      .json(new ApiResponse(201, result, "Signature uploaded successfully"));
  });

  updateSignature = asyncHandler(async (req, res) => {
    const result = await authService.updateSignature(
      req.user._id,
      req.file,
      req.role,
      req.firmType
    );
    res
      .status(200)
      .json(new ApiResponse(200, result, "Signature updated successfully"));
  });

  getSignature = asyncHandler(async (req, res) => {
    const signature = await authService.getSignature(
      req.user._id,
      req.role,
      req.firmType,
      req.query.firmType
    );
    res.setHeader("Content-Type", signature.contentType);
    res.setHeader("Cache-Control", "private, max-age=300");
    res.status(200).send(signature.buffer);
  });

  updateCashOpeningBalance = asyncHandler(async (req, res) => {
    const { amount } = req.body;
    const result = await authService.updateCashOpeningBalance(
      req.user._id,
      req.firmType,
      amount
    );
    res
      .status(200)
      .json(new ApiResponse(200, result, "Cash opening balance updated successfully"));
  });

  getLoginBranding = asyncHandler(async (_req, res) => {
    const result = await authService.getLoginBranding();
    res
      .status(200)
      .json(new ApiResponse(200, result, "Login branding fetched successfully"));
  });
}

export default new AuthController();
