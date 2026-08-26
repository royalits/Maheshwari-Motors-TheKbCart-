import React, { useEffect, useState } from "react";
import { Outlet } from "react-router-dom";
import Sidebar from "./Sidebar";
import Header from "./Header";
import useStore from "../../store";
import { ErrorBoundary } from "../common";

const Layout = () => {
  const [sidebarOpen, setSidebarOpen] = useState(
    () => typeof window !== "undefined" && window.innerWidth >= 1024,
  );
  const selectedFirm = useStore((s) => s.selectedFirm);
  const user = useStore((s) => s.user);
  const selectedFinancialYearId = useStore((s) => s.selectedFinancialYearId);

  const firmType =
    selectedFirm?.firm_type ||
    user?.firm_data?.firm_type ||
    selectedFirm?.type ||
    user?.current_firm_type ||
    "";
  const normalizedFirmType = String(firmType).toUpperCase().replace(/[-\s]/g, "_");
  const isGstFirm = normalizedFirmType === "GST";
  const sidebarBgClass = isGstFirm ? "bg-[#0F172A]" : "bg-emerald-950";

  useEffect(() => {
    const handleKeyDown = (e) => {
      const tag = e.target.tagName;
      const isInput = tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT";
      const ctrl = e.ctrlKey || e.metaKey;
      const key = e.key.toLowerCase();

      // Ctrl+Shift+S — sidebar toggle
      if (ctrl && e.shiftKey && key === "s") {
        e.preventDefault();
        setSidebarOpen((prev) => !prev);
        return;
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  return (
    <div className="flex min-h-screen bg-[#F8FAFC]">
      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-black/40 z-40 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}
      <div
        className={`fixed inset-y-0 left-0 z-50 w-60 ${sidebarBgClass} transform transition-transform duration-300 ease-in-out ${sidebarOpen ? "translate-x-0" : "-translate-x-full"}`}
      >
        <Sidebar onClose={() => setSidebarOpen(false)} />
      </div>
      <div className={`flex-1 flex flex-col min-w-0 transition-all ${sidebarOpen ? "lg:pl-60" : ""}`}>
        <Header onMenuClick={() => setSidebarOpen((prev) => !prev)} />
        <main className="flex-1 overflow-y-auto p-4 sm:p-6">
          <ErrorBoundary>
            <Outlet key={selectedFinancialYearId || "no-financial-year"} />
          </ErrorBoundary>
        </main>
      </div>
    </div>
  );
};

export default Layout;
