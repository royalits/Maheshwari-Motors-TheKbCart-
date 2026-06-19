# Role-Based Access Control (RBAC) Implementation Plan

## Overview

Implement role-based access control for sub-users within each main user account to enable SaaS multi-user functionality with granular permissions.

## Role Definitions

### 1. Admin (Owner)

- Full access to all features
- Can create/edit/delete sub-users
- Can manage all data and settings

### 2. Accounts

- **Allowed**: Add new records (items, challans, bills, contacts, etc.)
- **Allowed**: View all data including outstanding, reports
- **Allowed**: Record cash/bank payments
- **Restricted**: Cannot edit existing records
- **Restricted**: Cannot delete any records

### 3. Salesman

- **Allowed**: View outstanding reports
- **Allowed**: View all reports
- **Restricted**: Cannot add/edit/delete any data
- **Restricted**: Cannot access master data management

### 4. Client

- **Allowed**: View only their own outstanding
- **Allowed**: Search items and view MRP + images only
- **Restricted**: Cannot view purchase price, dealer price
- **Restricted**: Cannot access any other data

---

## Database Schema Changes

### 1. User Model - Add Sub-Users Array

```javascript
// Add to user.model.js
const subUserSchema = new Schema(
  {
    username: { type: String, required: true },
    password: { type: String, required: true },
    name: { type: String, required: true },
    role: {
      type: String,
      enum: ["admin", "accounts", "salesman", "client"],
      required: true,
    },
    firm_access: {
      type: String,
      enum: ["gst", "nongst", "both"],
      default: "both",
    },
    contact_id: { type: ObjectId, ref: "Contact", default: null }, // For client role
    is_active: { type: Boolean, default: true },
    created_by: { type: ObjectId, ref: "User" },
    created_at: { type: Date, default: Date.now },
  },
  { _id: true },
);

// Add to userSchema
const userSchema = new Schema({
  // ... existing fields
  sub_users: [subUserSchema],
});

// Add compound unique index
userSchema.index({ _id: 1, "sub_users.username": 1 }, { unique: true });
```

### 2. Session Model - Track Sub-User Sessions

```javascript
// Modify session.model.js
const sessionSchema = new Schema({
  user_id: { type: ObjectId, ref: "User", required: true },
  sub_user_id: { type: ObjectId, default: null }, // null for main user
  role: { type: String, required: true }, // admin/firm/accounts/salesman/client
  firm_type: { type: String, enum: ["GST", "NON_GST"], default: null },
  // ... existing fields
});
```

## Backend Implementation

### 1. Authentication Flow Changes

#### A. Login Method - Support Sub-User Login

```javascript
// auth.service.js - Modify login method
async login(username, password, deviceInfo) {
  // Try main user admin login
  let user = await User.findOne({ "admin.username": username, type: "main" });
  if (user?.admin) {
    const isMatch = await bcrypt.compare(password, user.admin.password);
    if (isMatch) {
      const token = user.generateAdminToken();
      await Session.create({ user_id: user._id, role: "admin", token, ...deviceInfo });
      return { token, user: user.toSafeObject(), role: "admin" };
    }
  }

  // Try firm login (existing logic)
  const firmResult = await User.findByFirmCredentials(username, password);
  if (firmResult) {
    const { user, firmType } = firmResult;
    const token = user.generateFirmToken(firmType);
    await Session.create({ user_id: user._id, role: "firm", firm_type: firmType, token, ...deviceInfo });
    return { token, user: user.toSafeObject(), role: "firm", firmType };
  }

  // Try sub-user login
  user = await User.findOne({ "sub_users.username": username, "sub_users.is_active": true });
  if (user) {
    const subUser = user.sub_users.find(su => su.username === username);
    const isMatch = await bcrypt.compare(password, subUser.password);
    if (!isMatch) throw ApiError.unauthorized("Invalid credentials");

    const token = jwt.sign(
      { _id: user._id, sub_user_id: subUser._id, role: subUser.role, firm_access: subUser.firm_access },
      env.JWT_SECRET,
      { expiresIn: env.JWT_EXPIRES_IN }
    );

    await Session.create({
      user_id: user._id,
      sub_user_id: subUser._id,
      role: subUser.role,
      token,
      ...deviceInfo
    });

    return {
      token,
      user: { ...user.toSafeObject(), sub_user: { ...subUser.toObject(), password: undefined } },
      role: subUser.role,
      contact_id: subUser.contact_id
    };
  }

  throw ApiError.unauthorized("Invalid credentials");
}
```

#### B. Auth Middleware - Support Sub-User Context

```javascript
// auth.middleware.js - Modify auth middleware
const auth = asyncHandler(async (req, res, next) => {
  const token = req.headers.authorization?.split(" ")[1];
  if (!token) throw ApiError.unauthorized("No token provided");

  const decoded = jwt.verify(token, env.JWT_SECRET);
  const session = await Session.findOne({ token });
  if (!session) throw ApiError.unauthorized("Session expired");

  session.last_active = new Date();
  session.save().catch(() => {});

  const user = await User.findById(decoded._id);
  if (!user || !user.is_active) throw ApiError.unauthorized("User inactive");

  req.user = user;
  req.role = decoded.role;
  req.token = token;
  req.session_id = session._id;

  // Sub-user context
  if (decoded.sub_user_id) {
    const subUser = user.sub_users.id(decoded.sub_user_id);
    if (!subUser || !subUser.is_active)
      throw ApiError.unauthorized("Sub-user inactive");
    req.sub_user = subUser;
    req.firm_access = subUser.firm_access;
    req.contact_id = subUser.contact_id; // For client role
  }

  if (decoded.role === "firm") {
    req.firmType = decoded.firm_type;
    req.isGst = decoded.firm_type === "GST" ? 1 : 0;
  }

  next();
});
```

### 2. Permission Middleware

```javascript
// Create: middlewares/permission.middleware.js
import { ApiError, asyncHandler } from "../utils/index.js";

const PERMISSIONS = {
  admin: {
    create: true,
    read: true,
    update: true,
    delete: true,
  },
  accounts: {
    create: true,
    read: true,
    update: false,
    delete: false,
  },
  salesman: {
    create: false,
    read: true, // Only reports
    update: false,
    delete: false,
  },
  client: {
    create: false,
    read: true, // Only own data
    update: false,
    delete: false,
  },
};

export const requirePermission = (action) =>
  asyncHandler(async (req, res, next) => {
    const role = req.role;

    // Main admin and firm users have full access
    if (role === "admin" || role === "firm") {
      return next();
    }

    // Check sub-user permissions
    const hasPermission = PERMISSIONS[role]?.[action];
    if (!hasPermission) {
      throw ApiError.forbidden(
        `${role} role does not have ${action} permission`,
      );
    }

    next();
  });

export const requireRole = (...allowedRoles) =>
  asyncHandler(async (req, res, next) => {
    if (!allowedRoles.includes(req.role)) {
      throw ApiError.forbidden(`Access denied for role: ${req.role}`);
    }
    next();
  });

// Client-specific: Filter data to own records only
export const filterClientData = asyncHandler(async (req, res, next) => {
  if (req.role === "client" && req.contact_id) {
    req.clientFilter = { contact_id: req.contact_id };
  }
  next();
});
```

### 3. Route Protection Examples

```javascript
// routers/transaction/bill.routes.js
import {
  requirePermission,
  requireRole,
  filterClientData,
} from "../../middlewares/permission.middleware.js";

router.get("/", filterClientData, billController.getAll); // Client sees only their bills
router.post("/", requirePermission("create"), billController.create); // Accounts can create
router.put("/:id", requirePermission("update"), billController.update); // Only admin/firm
router.delete("/:id", requirePermission("delete"), billController.delete); // Only admin/firm

// routers/report/report.routes.js
router.get(
  "/outstanding",
  requireRole("admin", "firm", "accounts", "salesman"),
  reportController.getOutstanding,
);
router.get(
  "/sales",
  requireRole("admin", "firm", "accounts", "salesman"),
  reportController.getSales,
);

// routers/master/item.routes.js
router.get("/search", itemController.searchItems); // All roles, but client sees limited fields
router.post("/", requirePermission("create"), itemController.create);
```

### 4. Controller Modifications - Client Data Filtering

```javascript
// controllers/transaction/bill.controller.js
getAll = asyncHandler(async (req, res) => {
  const filters = { user_id: req.user._id, ...req.clientFilter }; // Apply client filter
  const bills = await billService.getAll(filters, req.isGst);
  res.status(200).json(new ApiResponse(200, bills, "Bills fetched"));
});

// controllers/master/item.controller.js
searchItems = asyncHandler(async (req, res) => {
  const items = await itemService.search(req.query, req.user._id);

  // Client role: Return only MRP and images
  if (req.role === "client") {
    const clientItems = items.map((item) => ({
      _id: item._id,
      name: item.name,
      brand: item.brand,
      mrp: item.mrp,
      images: item.images,
      hsn: item.hsn,
    }));
    return res
      .status(200)
      .json(new ApiResponse(200, clientItems, "Items fetched"));
  }

  res.status(200).json(new ApiResponse(200, items, "Items fetched"));
});
```

### 5. Sub-User Management APIs

```javascript
// Create: controllers/auth/subuser.controller.js
class SubUserController {
  create = asyncHandler(async (req, res) => {
    const result = await subUserService.create(req.user._id, req.body);
    res.status(201).json(new ApiResponse(201, result, "Sub-user created"));
  });

  getAll = asyncHandler(async (req, res) => {
    const subUsers = req.user.sub_users.map((su) => ({
      ...su.toObject(),
      password: undefined,
    }));
    res.status(200).json(new ApiResponse(200, subUsers, "Sub-users fetched"));
  });

  update = asyncHandler(async (req, res) => {
    const result = await subUserService.update(
      req.user._id,
      req.params.id,
      req.body,
    );
    res.status(200).json(new ApiResponse(200, result, "Sub-user updated"));
  });

  delete = asyncHandler(async (req, res) => {
    await subUserService.delete(req.user._id, req.params.id);
    res.status(200).json(new ApiResponse(200, null, "Sub-user deleted"));
  });

  toggleStatus = asyncHandler(async (req, res) => {
    const result = await subUserService.toggleStatus(
      req.user._id,
      req.params.id,
    );
    res
      .status(200)
      .json(new ApiResponse(200, result, "Sub-user status updated"));
  });
}

// Create: services/subuser.service.js
class SubUserService {
  async create(userId, data) {
    const { username, password, name, role, firm_access, contact_id } = data;

    const user = await User.findById(userId);
    if (user.type !== "main")
      throw ApiError.forbidden("Only main users can create sub-users");

    // Check username uniqueness
    const exists = user.sub_users.some((su) => su.username === username);
    if (exists) throw ApiError.badRequest("Username already exists");

    const hashedPassword = await bcrypt.hash(password, 10);

    user.sub_users.push({
      username,
      password: hashedPassword,
      name,
      role,
      firm_access,
      contact_id: role === "client" ? contact_id : null,
      created_by: userId,
    });

    await user.save();
    return user.sub_users[user.sub_users.length - 1];
  }

  async update(userId, subUserId, data) {
    const user = await User.findById(userId);
    const subUser = user.sub_users.id(subUserId);
    if (!subUser) throw ApiError.notFound("Sub-user not found");

    if (data.password) {
      data.password = await bcrypt.hash(data.password, 10);
    }

    Object.assign(subUser, data);
    await user.save();
    return subUser;
  }

  async delete(userId, subUserId) {
    const user = await User.findById(userId);
    user.sub_users.pull(subUserId);
    await user.save();
    await Session.deleteMany({ sub_user_id: subUserId }); // Revoke sessions
  }

  async toggleStatus(userId, subUserId) {
    const user = await User.findById(userId);
    const subUser = user.sub_users.id(subUserId);
    if (!subUser) throw ApiError.notFound("Sub-user not found");

    subUser.is_active = !subUser.is_active;
    await user.save();

    if (!subUser.is_active) {
      await Session.deleteMany({ sub_user_id: subUserId }); // Revoke sessions
    }

    return subUser;
  }
}

// Create: routers/auth/subuser.routes.js
import { Router } from "express";
import { subUserController } from "../../controllers/index.js";
import authMiddleware, {
  requireAdmin,
} from "../../middlewares/auth.middleware.js";

const router = Router();

router.use(authMiddleware);
router.use(requireAdmin); // Only main admin can manage sub-users

router.post("/", subUserController.create);
router.get("/", subUserController.getAll);
router.put("/:id", subUserController.update);
router.delete("/:id", subUserController.delete);
router.patch("/:id/toggle-status", subUserController.toggleStatus);

export default router;
```

---

## Frontend Implementation

### 1. Store - Add Sub-User State

```javascript
// store/index.js
const useStore = create((set) => ({
  // ... existing state
  subUser: null,
  permissions: null,

  setSubUser: (subUser) => set({ subUser }),
  setPermissions: (permissions) => set({ permissions }),

  // Helper to check permissions
  hasPermission: (action) => {
    const state = get();
    if (state.user?.role === "admin" || state.user?.role === "firm")
      return true;
    return state.permissions?.[action] || false;
  },
}));
```

### 2. Auth Service - Handle Sub-User Login

```javascript
// services/authService.js
export const login = async (username, password, deviceInfo) => {
  const response = await axiosInstance.post("/auth/login", {
    username,
    password,
    ...deviceInfo,
  });

  const { token, user, role, contact_id } = response.data.data;

  localStorage.setItem("token", token);
  localStorage.setItem("role", role);

  if (user.sub_user) {
    localStorage.setItem("sub_user", JSON.stringify(user.sub_user));
  }

  if (contact_id) {
    localStorage.setItem("contact_id", contact_id);
  }

  return response.data;
};
```

### 3. Permission Hook

```javascript
// Create: hooks/usePermission.js
import { useStore } from "../store";

export const usePermission = () => {
  const user = useStore((state) => state.user);
  const subUser = useStore((state) => state.subUser);

  const role = subUser?.role || user?.role;

  const can = (action) => {
    if (role === "admin" || role === "firm") return true;

    const permissions = {
      admin: { create: true, read: true, update: true, delete: true },
      accounts: { create: true, read: true, update: false, delete: false },
      salesman: { create: false, read: true, update: false, delete: false },
      client: { create: false, read: true, update: false, delete: false },
    };

    return permissions[role]?.[action] || false;
  };

  const isRole = (...roles) => roles.includes(role);

  return { can, isRole, role };
};
```

### 4. Protected Components

```javascript
// Create: components/PermissionGate.jsx
import { usePermission } from "../hooks/usePermission";

export const PermissionGate = ({ action, children, fallback = null }) => {
  const { can } = usePermission();
  return can(action) ? children : fallback;
};

export const RoleGate = ({ roles, children, fallback = null }) => {
  const { isRole } = usePermission();
  return isRole(...roles) ? children : fallback;
};

// Usage in pages
<PermissionGate action="create">
  <Button onClick={handleCreate}>Add New Item</Button>
</PermissionGate>

<PermissionGate action="delete">
  <Button onClick={handleDelete}>Delete</Button>
</PermissionGate>

<RoleGate roles={["admin", "firm", "accounts", "salesman"]}>
  <ReportsSection />
</RoleGate>
```

### 5. Sub-User Management Page

```javascript
// Create: pages/setup/SubUsers.jsx
import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { subUserService } from "../../services/subUserService";

export const SubUsersPage = () => {
  const { data: subUsers, refetch } = useQuery({
    queryKey: ["subUsers"],
    queryFn: subUserService.getAll,
  });

  const createMutation = useMutation({
    mutationFn: subUserService.create,
    onSuccess: () => refetch(),
  });

  const deleteMutation = useMutation({
    mutationFn: subUserService.delete,
    onSuccess: () => refetch(),
  });

  return (
    <div>
      <h1>Sub-User Management</h1>
      <button onClick={() => setShowForm(true)}>Add Sub-User</button>

      <table>
        <thead>
          <tr>
            <th>Username</th>
            <th>Name</th>
            <th>Role</th>
            <th>Firm Access</th>
            <th>Status</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          {subUsers?.map((su) => (
            <tr key={su._id}>
              <td>{su.username}</td>
              <td>{su.name}</td>
              <td>{su.role}</td>
              <td>{su.firm_access}</td>
              <td>{su.is_active ? "Active" : "Inactive"}</td>
              <td>
                <button onClick={() => handleEdit(su)}>Edit</button>
                <button onClick={() => deleteMutation.mutate(su._id)}>
                  Delete
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};
```

---

## Migration Strategy

### Phase 1: Database Migration

1. Add `sub_users` array to existing User documents (empty array)
2. Add `sub_user_id` field to Session collection (null for existing sessions)
3. Create indexes

### Phase 2: Backend Implementation

1. Update User model with sub-user schema
2. Modify auth service and middleware
3. Create permission middleware
4. Create sub-user management APIs
5. Update existing controllers with permission checks

### Phase 3: Frontend Implementation

1. Update store with sub-user state
2. Create permission hooks and components
3. Add sub-user management page
4. Update existing pages with permission gates

### Phase 4: Testing

1. Test all role permissions
2. Test client data isolation
3. Test session management for sub-users
4. Test firm access restrictions

---

## Security Considerations

1. **Password Security**: All sub-user passwords hashed with bcrypt
2. **Session Isolation**: Sub-user sessions tracked separately
3. **Data Isolation**: Client role can only access their own data via contact_id
4. **Permission Validation**: Both frontend and backend enforce permissions
5. **Audit Trail**: Track sub-user actions via created_by field

---

## API Endpoints Summary

### Sub-User Management (Admin Only)

- `POST /api/auth/sub-users` - Create sub-user
- `GET /api/auth/sub-users` - List all sub-users
- `PUT /api/auth/sub-users/:id` - Update sub-user
- `DELETE /api/auth/sub-users/:id` - Delete sub-user
- `PATCH /api/auth/sub-users/:id/toggle-status` - Activate/deactivate

### Modified Endpoints

- `POST /api/auth/login` - Now supports sub-user login
- All protected routes now check sub-user permissions

---

## Testing Checklist

- [ ] Admin can create/edit/delete sub-users
- [ ] Accounts can create but not edit/delete
- [ ] Salesman can only view reports
- [ ] Client can only view own outstanding and item MRP
- [ ] Sub-user sessions are tracked correctly
- [ ] Inactive sub-users cannot login
- [ ] Firm access restrictions work (gst/nongst/both)
- [ ] Client data filtering works correctly
- [ ] Permission gates hide UI elements correctly
- [ ] API returns 403 for unauthorized actions
