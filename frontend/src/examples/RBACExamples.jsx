/**
 * Example: How to use RBAC in your pages
 * 
 * This file demonstrates all the ways to implement role-based access control
 * in your React components.
 */

import { usePermission } from "../hooks/usePermission";
import { 
  PermissionGate, 
  RoleGate, 
  ReportAccessGate, 
  NonClientGate 
} from "../components/PermissionGate";
import { RoleBadge, RoleInfo } from "../components/RoleBadge";

// ============================================================================
// Example 1: Using the usePermission hook directly
// ============================================================================
export const Example1_DirectHook = () => {
  const { can, isRole, canAccessReports, isClient } = usePermission();

  return (
    <div>
      {/* Show button only if user can create */}
      {can("create") && (
        <button>Add New Item</button>
      )}

      {/* Show edit button only if user can update */}
      {can("update") && (
        <button>Edit Item</button>
      )}

      {/* Show delete button only if user can delete */}
      {can("delete") && (
        <button>Delete Item</button>
      )}

      {/* Show reports section for specific roles */}
      {isRole("admin", "account", "sales") && (
        <div>Reports Section</div>
      )}

      {/* Show payment section for admin and account */}
      {isRole("admin", "account") && (
        <div>Payment Section</div>
      )}

      {/* Show limited view for clients */}
      {isClient() && (
        <div>Limited Client View</div>
      )}

      {/* Show reports if user has access */}
      {canAccessReports() && (
        <div>Reports Dashboard</div>
      )}
    </div>
  );
};

// ============================================================================
// Example 2: Using PermissionGate component
// ============================================================================
export const Example2_PermissionGate = () => {
  return (
    <div>
      {/* Show create button only if user has create permission */}
      <PermissionGate action="create">
        <button className="btn-primary">Add New Item</button>
      </PermissionGate>

      {/* Show edit button only if user has update permission */}
      <PermissionGate action="update">
        <button className="btn-secondary">Edit Item</button>
      </PermissionGate>

      {/* Show delete button only if user has delete permission */}
      <PermissionGate action="delete">
        <button className="btn-danger">Delete Item</button>
      </PermissionGate>

      {/* Show fallback content if no permission */}
      <PermissionGate 
        action="delete" 
        fallback={<p className="text-gray-500">You cannot delete items</p>}
      >
        <button className="btn-danger">Delete Item</button>
      </PermissionGate>
    </div>
  );
};

// ============================================================================
// Example 8: Complete page with RBAC
// ============================================================================
export const Example8_CompletePage = () => {
  const { can, isRole, getCurrentRole } = usePermission();

  const handleCreate = () => {
    console.log("Creating item...");
  };

  const handleEdit = (id) => {
    console.log("Editing item:", id);
  };

  const handleDelete = (id) => {
    console.log("Deleting item:", id);
  };

  return (
    <div className="p-6">
      {/* Header with role badge */}
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">Items Management</h1>
        <RoleBadge />
      </div>

      {/* Action buttons based on permissions */}
      <div className="flex gap-2 mb-6">
        <PermissionGate action="create">
          <button 
            onClick={handleCreate}
            className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
          >
            Add New Item
          </button>
        </PermissionGate>

        <ReportAccessGate>
          <button className="px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700">
            View Reports
          </button>
        </ReportAccessGate>
      </div>

      {/* Items list */}
      <div className="space-y-4">
        {[1, 2, 3].map((item) => (
          <div key={item} className="border rounded p-4 flex items-center justify-between">
            <div>
              <h3 className="font-medium">Item {item}</h3>
              <p className="text-sm text-gray-600">Description of item {item}</p>
            </div>

            <div className="flex gap-2">
              <button className="px-3 py-1 bg-gray-200 rounded hover:bg-gray-300">
                View
              </button>

              <PermissionGate action="update">
                <button 
                  onClick={() => handleEdit(item)}
                  className="px-3 py-1 bg-yellow-500 text-white rounded hover:bg-yellow-600"
                >
                  Edit
                </button>
              </PermissionGate>

              <PermissionGate action="delete">
                <button 
                  onClick={() => handleDelete(item)}
                  className="px-3 py-1 bg-red-500 text-white rounded hover:bg-red-600"
                >
                  Delete
                </button>
              </PermissionGate>
            </div>
          </div>
        ))}
      </div>

      {/* Role-specific sections */}
      <div className="mt-8 grid grid-cols-1 md:grid-cols-2 gap-6">
        <RoleGate roles={["admin", "account"]}>
          <div className="border rounded p-4">
            <h2 className="text-lg font-semibold mb-3">Payment Management</h2>
            <button className="w-full px-4 py-2 bg-blue-600 text-white rounded">
              Record Payment
            </button>
          </div>
        </RoleGate>

        <ReportAccessGate>
          <div className="border rounded p-4">
            <h2 className="text-lg font-semibold mb-3">Reports</h2>
            <div className="space-y-2">
              <button className="w-full px-4 py-2 bg-green-600 text-white rounded">
                Sales Report
              </button>
              <button className="w-full px-4 py-2 bg-green-600 text-white rounded">
                Outstanding Report
              </button>
            </div>
          </div>
        </ReportAccessGate>
      </div>

      <RoleGate roles={["client"]}>
        <div className="mt-6 p-4 bg-blue-50 border border-blue-200 rounded">
          <p className="text-blue-800">
            You are viewing items in client mode. Only MRP prices are visible.
          </p>
        </div>
      </RoleGate>
    </div>
  );
};

export default Example8_CompletePage;
