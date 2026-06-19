import React from "react";
import {
  FaMagnifyingGlass,
  FaFileExport,
  FaPrint,
  FaSort,
  FaChevronLeft,
  FaChevronRight,
} from "react-icons/fa6";

const UniversalReportViewer = () => {
  return (
    <div className="w-full bg-neutral-50 min-h-screen">
      <main className="w-full">
        {/* Header */}
        <div className="mb-4">
          <h1 className="text-xl md:text-2xl text-neutral-900">
            Universal Report Viewer
          </h1>
          <p className="text-sm text-neutral-500">
            Analyze and export financial and inventory data.
          </p>
        </div>

        {/* Search & Actions */}
        <div className="bg-white p-4 border rounded-lg mb-4 flex flex-col md:flex-row gap-4 md:items-center md:justify-between">
          {/* Search */}
          <div className="relative w-full md:w-72">
            <FaMagnifyingGlass className="absolute left-3 top-1/2 -translate-y-1/2 text-neutral-400 text-xs" />
            <input
              type="text"
              placeholder="Search by voucher, party, item..."
              className="w-full text-sm border rounded-md pl-8 pr-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-neutral-800"
            />
          </div>

          {/* Actions */}
          <div className="flex gap-2 flex-wrap justify-end">
            <button className="px-3 py-1.5 border rounded-md flex items-center gap-2 text-sm hover:bg-neutral-50">
              <FaFileExport className="text-xs" />
              Export
            </button>
            <button className="px-3 py-1.5 border rounded-md flex items-center gap-2 text-sm hover:bg-neutral-50">
              <FaPrint className="text-xs" />
              Print
            </button>
          </div>
        </div>

        {/* Table */}
        <div className="bg-white border rounded-lg overflow-x-auto">
          <table className="min-w-[720px] w-full text-sm">
            <thead className="bg-neutral-50">
              <tr>
                <th className="px-4 py-2 text-left">
                  <span className="flex items-center gap-1">
                    Date
                    <FaSort className="text-neutral-400 text-xs" />
                  </span>
                </th>
                <th className="px-4 py-2 text-left">Voucher No.</th>
                <th className="px-4 py-2 text-left">Party Name</th>
                <th className="px-4 py-2 text-left">GSTIN</th>
                <th className="px-4 py-2 text-right">Taxable</th>
                <th className="px-4 py-2 text-right">Tax</th>
                <th className="px-4 py-2 text-right">Total</th>
                <th className="px-4 py-2 text-center">Status</th>
              </tr>
            </thead>

            <tbody>
              <tr className="border-b hover:bg-neutral-50">
                <td className="px-4 py-2">22 Jan 2025</td>
                <td className="px-4 py-2">INV-0158</td>
                <td className="px-4 py-2">Global Tech Inc.</td>
                <td className="px-4 py-2">27AAFCE1234F1Z5</td>
                <td className="px-4 py-2 text-right">15,000</td>
                <td className="px-4 py-2 text-right">2,700</td>
                <td className="px-4 py-2 text-right">17,700</td>
                <td className="px-4 py-2 text-center">
                  <span className="px-2 py-0.5 text-xs bg-neutral-100 rounded-full">
                    Filed
                  </span>
                </td>
              </tr>
            </tbody>
          </table>

          {/* Footer / Pagination */}
          <div className="p-4 flex flex-col sm:flex-row gap-3 sm:items-center sm:justify-between text-sm">
            <span className="text-neutral-600">
              Showing 1–5 of 48 results
            </span>

            <div className="flex items-center gap-2">
              <button className="px-2 py-1 border rounded-md hover:bg-neutral-100">
                <FaChevronLeft className="text-xs" />
              </button>
              <span className="px-2">Page 1 of 10</span>
              <button className="px-2 py-1 border rounded-md hover:bg-neutral-100">
                <FaChevronRight className="text-xs" />
              </button>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
};

export default UniversalReportViewer;
