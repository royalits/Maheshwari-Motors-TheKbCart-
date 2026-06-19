# Frontend RBAC Implementation Guide

## Overview

This guide explains how to implement Role-Based Access Control (RBAC) in the React frontend.

## Files Created

1. **hooks/usePermission.js** - Permission checking hook
2. **components/PermissionGate.jsx** - Permission gate components
3. **components/RoleBadge.jsx** - Role display components
4. **examples/RBACExamples.jsx** - Usage examples

## Store Changes

The Zustand store has been updated to include RBAC state:

```javascript
// store/index.js
{
  // RBAC State
  firmRole: null,        // admin, accountant, salesman, client
  contactId: null,       // For client role
  
  // Updated setUser action
  setUser: (user) => set({ 
    user, 
    isAuthenticated: !!user,
    firmRole: user?.firm_data?.firm_role || null,
    contactId: user?.firm_data?.contact_id || null
  }),
}
```

## Usage Guide

### 1. Using usePermission Hook

```javascript
import { usePermission } from "../hooks/usePermission";

function MyComponent() {
  const { can, isRole, canAccessReports, isClient } = usePermission();
  
  return (
    <div>
      {/* Check permission */}
      {can("create") && <button>Add New</button>}
      {can("update") && <button>Edit</button>}
      {can("delete") && <button>Delete</button>}
      
      {/* Check role */}
      {isRole("admin", "accountant") && <div>Payment Section</div>}
      
      {/* Check report access */}
      {canAccessReports() && <div>Reports</div>}
      
      {/* Check if client */}
      {isClient() && <div>Client View</div>}
    </div>
  );
}
```

### 2. Using PermissionGate Component

```javascript
import { PermissionGate } from "../components/PermissionGate";

function MyComponent() {
  return (
    <div>
      {/* Show only if user can create */}
      <PermissionGate action="create">
        <button>Add New Item</button>
      </PermissionGate>
      
      {/* Show only if user can update */}
      <PermissionGate action="update">
        <button>Edit Item</button>
      </PermissionGate>
      
      {/* Show only if user can delete */}
      <PermissionGate action="delete">
        <button>Delete Item</button>
      </PermissionGate>
      
      {/* With fallback */}
      <PermissionGate 
        action="delete" 
        fallback={<p>You cannot delete</p>}
      >
        <button>Delete</button>
      </PermissionGate>
    </div>
  );
}
```

### 3. Using RoleGate Component

```javascript
import { RoleGate } from "../components/PermissionGate";

function MyComponent() {
  return (
    <div>
      {/* Show for admin and accountant only */}
      <RoleGate roles={["admin", "accountant"]}>
        <div>Payment Management</div>
      </RoleGate>
      
      {/* Show for all except client */}
      <RoleGate roles={["admin", "accountant", "salesman"]}>
        <div>Reports Dashboard</div>
      </RoleGate>
      
      {/* Show for client only */}
      <RoleGate roles={["client"]}>
        <div>Your Outstanding</div>
      </RoleGate>
    </div>
  );
}
```

### 4. Using ReportAccessGate

```javascript
import { ReportAccessGate } from "../components/PermissionGate";

function MyComponent() {
  return (
    <div>
      {/* Show only if user can access reports */}
      <ReportAccessGate>
        <div>
          <h1>Reports Dashboard</h1>
          <button>Sales Report</button>
          <button>Outstanding Report</button>
        </div>
      </ReportAccessGate>
    </div>
  );
}
```

### 5. Using RoleBadge

```javascript
import { RoleBadge, RoleInfo } from "../components/RoleBadge";

function Header() {
  return (
    <header className="flex items-center justify-between">
      <h1>Dashboard</h1>
      <RoleBadge />
    </header>
  );
}

function ProfilePage() {
  return (
    <div>
      <h1>Profile</h1>
      <RoleInfo />
    </div>
  );
}
```

## Complete Example

See `examples/RBACExamples.jsx` for a complete working example.

## Integration Steps

### Step 1: Update Login Flow

The store automatically extracts firmRole and contactId from login response. No changes needed.

### Step 2: Update Existing Pages

Add permission gates to your existing pages:

```javascript
// Before
<button onClick={handleDelete}>Delete</button>

// After
<PermissionGate action="delete">
  <button onClick={handleDelete}>Delete</button>
</PermissionGate>
```

### Step 3: Update Navigation

Hide menu items based on permissions:

```javascript
import { usePermission } from "../hooks/usePermission";

function Navigation() {
  const { canAccessReports, isRole } = usePermission();
  
  return (
    <nav>
      <Link to="/">Dashboard</Link>
      
      {canAccessReports() && (
        <Link to="/reports">Reports</Link>
      )}
      
      {isRole("admin", "accountant") && (
        <Link to="/payments">Payments</Link>
      )}
      
      {isRole("client") && (
        <Link to="/my-outstanding">My Outstanding</Link>
      )}
    </nav>
  );
}
```

### Step 4: Update Forms

Disable fields based on permissions:

```javascript
function ItemForm() {
  const { can } = usePermission();
  
  return (
    <form>
      <input 
        type="text" 
        disabled={!can("create") && !can("update")}
      />
      
      <PermissionGate action="create">
        <button type="submit">Create</button>
      </PermissionGate>
      
      <PermissionGate action="update">
        <button type="submit">Update</button>
      </PermissionGate>
    </form>
  );
}
```

## Permission Matrix

| Role | Create | Read | Update | Delete |
|------|--------|------|--------|--------|
| Admin | ✅ | ✅ | ✅ | ✅ |
| Accountant | ✅ | ✅ | ❌ | ❌ |
| Salesman | ❌ | ✅ | ❌ | ❌ |
| Client | ❌ | ✅ | ❌ | ❌ |

## Best Practices

1. **Always use gates for UI elements** - Don't rely on backend alone
2. **Use semantic gates** - Use RoleGate for role-specific content, PermissionGate for actions
3. **Provide fallbacks** - Show helpful messages when access is denied
4. **Test all roles** - Test your UI with each role
5. **Keep it simple** - Don't over-complicate permission logic

## Common Patterns

### Pattern 1: Action Buttons

```javascript
<div className="actions">
  <button>View</button>
  <PermissionGate action="update">
    <button>Edit</button>
  </PermissionGate>
  <PermissionGate action="delete">
    <button>Delete</button>
  </PermissionGate>
</div>
```

### Pattern 2: Conditional Sections

```javascript
<div className="dashboard">
  <div>Common Section</div>
  
  <RoleGate roles={["admin", "accountant"]}>
    <div>Management Section</div>
  </RoleGate>
  
  <ReportAccessGate>
    <div>Reports Section</div>
  </ReportAccessGate>
</div>
```

### Pattern 3: Form Fields

```javascript
<form>
  <input type="text" />
  
  <NonClientGate>
    <input type="number" placeholder="Purchase Price" />
    <input type="number" placeholder="Dealer Price" />
  </NonClientGate>
  
  <input type="number" placeholder="MRP" />
</form>
```

## Testing

Test each role:

1. **Admin**: Should see all buttons and sections
2. **Accountant**: Should see create buttons but not edit/delete
3. **Salesman**: Should only see reports
4. **Client**: Should see limited view with own data only

## Troubleshooting

### Issue: Permission gates not working
**Solution**: Check if firmRole is set in store after login

### Issue: All users see everything
**Solution**: Verify backend is returning firm_role in login response

### Issue: Client sees all data
**Solution**: Ensure API calls include contact_id filter

## Summary

- ✅ Store updated with RBAC state
- ✅ usePermission hook created
- ✅ Permission gate components created
- ✅ Role badge components created
- ✅ Complete examples provided
- ✅ Integration guide documented

Ready to integrate into your pages!
