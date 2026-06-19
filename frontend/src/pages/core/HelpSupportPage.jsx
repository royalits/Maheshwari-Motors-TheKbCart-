import React from "react";
import {
 
  FaLock,
  FaArrowLeft,
  FaFolderOpen,
  FaPlus,
  FaTriangleExclamation,
} from "react-icons/fa6";

const SystemMessages = () => {
  return (
    <div className="flex w-full bg-neutral-50 min-h-screen">
     
       

        {/* Content */}
        <main className="flex-1 overflow-y-auto bg-neutral-50 ">
          <div className="mb-6">
            <h1 className="text-2xl text-neutral-900">
              System Messages & States
            </h1>
            <p className="text-sm text-neutral-500">
              Examples of no-permission, empty state, and error messages.
            </p>
          </div>

          <div className="space-y-8">
            {/* No Permission */}
            <section className="bg-white border border-neutral-200 rounded-lg p-8">
              <div className="flex flex-col items-center text-center max-w-md mx-auto">
                <div className="w-16 h-16 flex items-center justify-center bg-neutral-100 rounded-full mb-4">
                  <FaLock className="text-2xl text-neutral-500" />
                </div>
                <h2 className="text-xl text-neutral-900">Access Denied</h2>
                <p className="mt-2 text-sm text-neutral-600">
                  You do not have the required permissions to view the "User
                  Rights & Roles" page. Please contact your system administrator
                  to request access.
                </p>
                <div className="mt-6 flex items-center gap-4">
                  <button className="px-4 py-2 text-sm border rounded-md flex items-center gap-2">
                    <FaArrowLeft className="text-xs" />
                    Go Back
                  </button>
                  <button className="px-4 py-2 text-sm bg-neutral-900 text-white rounded-md">
                    Request Access
                  </button>
                </div>
              </div>
            </section>

            {/* Empty State */}
            <section className="bg-white border border-neutral-200 rounded-lg p-8">
              <div className="flex flex-col items-center text-center max-w-md mx-auto">
                <div className="w-16 h-16 flex items-center justify-center bg-neutral-100 rounded-full mb-4">
                  <FaFolderOpen className="text-2xl text-neutral-500" />
                </div>
                <h2 className="text-xl text-neutral-900">No Items Found</h2>
                <p className="mt-2 text-sm text-neutral-600">
                  There are no items created in the "Electricals" sub-group yet.
                  Get started by adding a new item.
                </p>
                <div className="mt-6">
                  <button className="px-4 py-2 text-sm bg-neutral-900 text-white rounded-md flex items-center gap-2">
                    <FaPlus className="text-xs" />
                    Add New Item
                  </button>
                </div>
              </div>
            </section>

            {/* Error */}
            <section className="bg-white border border-neutral-200 rounded-lg p-8">
              <div className="flex flex-col items-center text-center max-w-md mx-auto">
                <div className="w-16 h-16 flex items-center justify-center bg-neutral-100 rounded-full mb-4">
                  <FaTriangleExclamation className="text-2xl text-neutral-500" />
                </div>
                <h2 className="text-xl text-neutral-900">
                  Unable to Generate Report
                </h2>
                <p className="mt-2 text-sm text-neutral-600">
                  An unexpected error occurred while generating the GST Summary
                  Report. Please try again in a few moments. If the problem
                  persists, contact support.
                </p>

                <div className="mt-4 p-3 bg-neutral-100 rounded-md text-xs text-neutral-600 text-left w-full">
                  <p>
                    <span className="text-neutral-800">Error Code:</span>{" "}
                    500-GST-RPT-GEN
                  </p>
                  <p>
                    <span className="text-neutral-800">Timestamp:</span>{" "}
                    2025-01-24 15:01:23 UTC
                  </p>
                </div>

                <div className="mt-6 flex items-center gap-4">
                  <button className="px-4 py-2 text-sm border rounded-md">
                    Contact Support
                  </button>
                  <button className="px-4 py-2 text-sm bg-neutral-900 text-white rounded-md">
                    Retry
                  </button>
                </div>
              </div>
            </section>
          </div>
        </main>
    
    </div>
  );
};

export default SystemMessages;
