# Route Protection Implementation Guide

## Overview

This guide explains how to protect routes from unauthorized access using the ProtectedRoute component.

## Components Created

1. **ProtectedRoute** - Base component for route protection
2. **AdminRoute** - Only admin can access
3. **NonClientRoute** - Admin, Accountant, Salesman can access
4. **ReportRoute** - Admin, Accountant, Salesman can access reports
5. **CreateRoute** - Admin, Accountant can create
6. **UpdateRoute** - Only Admin can update
7. **DeleteRoute** - Only Admin can delete

## Usage in Routes

### Example: Protecting Routes in App.jsx or Router

```javascript
import { 
  ProtectedRoute, 
  AdminRoute, 
  NonClientRoute, 
  ReportRoute,
  CreateRoute,
  UpdateRoute 
} from "./components/ProtectedRoute";

// In your routes configuration
<Routes>
  {/* Public routes */}
  <Route path="/login" element={<Login />} />
  
  {/* Dashboard - All authenticated users */}
  <Route path="/dashboard" element={<Dashboard />} />
  
  {/* Masters - Hidden from Client and Salesman */}
  <Route 
    path="/masters/*" 
    element={
      <NonClientRoute>
        <MastersLayout />
      </NonClientRoute>
    }
  />
  
  {/* Inventory - Limited for Client */}
  <Route path="/inventory/item-view" element={<ItemView />} />
  <Route 
    path="/inventory/item-master" 
    element={
      <NonClientRoute>
        <ItemMaster />
      </NonClientRoute>
    }
  />
  
  {/* Transactions - Hidden from Client and Salesman */}
  <Route 
    path="/transactions/*" 
    element={
      <ProtectedRoute requireRole={["admin", "accountant"]}>
        <TransactionsLayout />
      </ProtectedRoute>
    }
  />
  
  {/* Reports - Admin, Accountant, Salesman only */}
  <Route 
    path="/reports/*" 
    element={
      <ReportRoute>
        <ReportsLayout />
      </ReportRoute>
    }
  />
  
  {/* Setup - Admin only */}
  <Route 
    path="/setup/*" 
    element={
      <AdminRoute>
        <SetupLayout />
      </AdminRoute>
    }
  />
  
  {/* Create routes - Admin and Accountant */}
  <Route 
    path="/inventory/item-master/create" 
    element={
      <CreateRoute>
        <CreateItem />
      </CreateRoute>
    }
  />
  
  {/* Update routes - Admin only */}
  <Route 
    path="/inventory/item-master/edit/:id" 
    element={
      <UpdateRoute>
        <EditItem />
      </UpdateRoute>
    }
  />
  
  {/* Fallback */}
  <Route path="*" element={<Navigate to="/dashboard" />} />
</Routes>
```

## Sidebar Integration

The sidebar has been updated with role-based visibility:

### Admin Role
- ✅ Dashboard
- ✅ Masters (all)
- ✅ Inventory (all)
- ✅ Transactions (all)
- ✅ Reports (all)
- ✅ Setup & Tools

### Accountant Role
- ✅ Dashboard
- ✅ Masters (all)
- ✅ Inventory (all)
- ✅ Transactions (all)
- ✅ Reports (all)
- ❌ Setup & Tools

### Salesman Role
- ✅ Dashboard
- ❌ Masters
- ❌ Inventory
- ❌ Transactions
- ✅ Reports (all)
- ❌ Setup & Tools

### Client Role
- ✅ Dashboard
- ❌ Masters
- ✅ Inventory (Item View only)
- ✅ My Account (My Outstanding only)
- ❌ Reports
- ❌ Setup & Tools

## Navigation Protection

### Automatic Redirect

If a user tries to access a route they don't have permission for:

1. **Via URL** - ProtectedRoute redirects to /dashboard
2. **Via Sidebar** - Links are hidden, no navigation possible
3. **Via Code** - Navigate calls are blocked by ProtectedRoute

### Example Scenarios

#### Scenario 1: Accountant tries to access Setup
```
URL: /setup/backup-restore
Result: Redirected to /dashboard
Reason: Setup requires admin role
```

#### Scenario 2: Salesman tries to access Transactions
```
URL: /transactions/challan-list
Result: Redirected to /dashboard
Reason: Transactions require admin or accountant role
```

#### Scenario 3: Client tries to access Masters
```
URL: /masters/brand-master
Result: Redirected to /dashboard
Reason: Masters hidden from client role
```

## Custom Protection

### Protect Specific Actions

```javascript
// Protect create action
<Route 
  path="/items/create" 
  element={
    <ProtectedRoute requirePermission="create">
      <CreateItem />
    </ProtectedRoute>
  }
/>

// Protect update action
<Route 
  path="/items/edit/:id" 
  element={
    <ProtectedRoute requirePermission="update">
      <EditItem />
    </ProtectedRoute>
  }
/>

// Protect delete action
<Route 
  path="/items/delete/:id" 
  element={
    <ProtectedRoute requirePermission="delete">
      <DeleteItem />
    </ProtectedRoute>
  }
/>
```

### Protect by Multiple Roles

```javascript
<Route 
  path="/payments" 
  element={
    <ProtectedRoute requireRole={["admin", "accountant"]}>
      <Payments />
    </ProtectedRoute>
  }
/>
```

### Custom Redirect

```javascript
<Route 
  path="/admin-panel" 
  element={
    <ProtectedRoute requireRole="admin" redirectTo="/unauthorized">
      <AdminPanel />
    </ProtectedRoute>
  }
/>
```

## Testing

### Test Each Role

1. **Login as Admin**
   - Navigate to all routes → Should work
   - Check sidebar → All sections visible

2. **Login as Accountant**
   - Navigate to /setup → Redirected to /dashboard
   - Navigate to /masters → Should work
   - Check sidebar → Setup hidden

3. **Login as Salesman**
   - Navigate to /transactions → Redirected to /dashboard
   - Navigate to /reports → Should work
   - Check sidebar → Only Dashboard and Reports visible

4. **Login as Client**
   - Navigate to /masters → Redirected to /dashboard
   - Navigate to /inventory/item-view → Should work
   - Navigate to /inventory/item-master → Redirected to /dashboard
   - Check sidebar → Only Dashboard, Item View, My Outstanding visible

## Best Practices

1. **Always protect routes** - Don't rely on sidebar hiding alone
2. **Use semantic components** - Use AdminRoute, ReportRoute for clarity
3. **Consistent redirects** - Use /dashboard as default redirect
4. **Test all roles** - Verify each role can/cannot access routes
5. **Document protected routes** - Keep this guide updated

## Summary

- ✅ Sidebar updated with role-based visibility
- ✅ ProtectedRoute component created
- ✅ Specialized route components created
- ✅ Navigation automatically blocked
- ✅ URL access automatically redirected
- ✅ Complete protection at both UI and route level

## Next Steps

1. Update your route configuration with ProtectedRoute
2. Test all roles
3. Verify redirects work correctly
4. Update any programmatic navigation to respect permissions
