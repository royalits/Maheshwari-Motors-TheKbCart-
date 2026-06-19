import React, { useState, useRef, useCallback } from "react";
import { NavLink } from "react-router-dom";
import {
  FaHouse,
  FaDatabase,
  FaChartPie,
  FaBuilding,
  FaListCheck,
  FaChevronDown,
  FaChevronRight,
  FaUsers,
  FaEye,
  FaTags,
  FaList,
  FaUserPlus,
  FaUsersGear,
  FaBell,
  FaFileInvoice,
  FaClockRotateLeft as FaHistory,
  FaDownload,
  FaCalendarXmark,
  FaMoneyBillTransfer,
} from "react-icons/fa6";
import useStore from "../../store";
import { usePermission } from "../../hooks/usePermission";
import { RoleBadge } from "../RoleBadge";

const SidebarSection = ({ title, children, defaultOpen = false }) => {
  const [isOpen, setIsOpen] = useState(defaultOpen);

  return (
    <div className="mb-2">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="w-full flex h-full items-center justify-between px-3 py-2 text-sm text-[#CBD5E1] hover:bg-neutral-100 hover:text-neutral-900 rounded-md transition"
      >
        <span className="font-medium">{title}</span>
        {isOpen ? (
          <FaChevronDown className="w-3 h-3" />
        ) : (
          <FaChevronRight className="w-3 h-3" />
        )}
      </button>
      {isOpen && <div className="ml-4 mt-1 space-y-1">{children}</div>}
    </div>
  );
};

const Sidebar = ({ onClose }) => {
  const navRef = useRef(null);

  const handleKeyDown = useCallback((e) => {
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp' && e.key !== 'Enter') return;
    const focusable = Array.from(
      navRef.current?.querySelectorAll('a, button') ?? []
    );
    if (!focusable.length) return;
    const current = document.activeElement;
    const idx = focusable.indexOf(current);
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      focusable[idx < focusable.length - 1 ? idx + 1 : 0]?.focus();
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      focusable[idx > 0 ? idx - 1 : focusable.length - 1]?.focus();
    } else if (e.key === 'Enter' && current?.tagName === 'A') {
      current.click();
    }
  }, []);
  const selectedFirm = useStore((s) => s.selectedFirm);
  const user = useStore((s) => s.user);
  const { isRole, canAccessReports, canAccessOutstanding, isClient } =
    usePermission();

  // Prefer firm_data.firm_type from login response for color logic
  const firmType =
    selectedFirm?.firm_type ||
    user?.firm_data?.firm_type ||
    selectedFirm?.type ||
    user?.current_firm_type ||
    "";
  const normalizedFirmType = String(firmType)
    .toUpperCase()
    .replace(/[-\s]/g, "_");
  const isGstFirm = normalizedFirmType === "GST";
  const sidebarBgClass = isGstFirm ? "bg-[#0F172A]" : "bg-emerald-950";

  const linkBase =
    "flex items-center gap-3 px-3 py-2 text-sm rounded-md transition";

  const isSalesUser = isRole("sales");
  const canAccessTransactions = !isClient() && !isSalesUser;

  return (
    <aside
      className={`flex flex-col w-60 min-h-screen max-h-full fixed border-r pb-3 border-neutral-200 ${sidebarBgClass}`}
    >
      {/* Header */}
      <div className="flex flex-col gap-2 h-auto px-4 py-4 border-b border-neutral-200">
        <div className="flex items-center gap-2">
          <img
            src="/thekbcart_logo_full.png"
            alt="The KbCart"
            className="h-12 w-44 object-contain"
          />
        </div>
        <RoleBadge className="self-start" />
      </div>

      {/* Navigation */}
      <nav ref={navRef} onKeyDown={handleKeyDown} className="flex-1 p-4 overflow-y-auto pb-16 scrollbar-hide">
        <ul className="space-y-1">
          {/* 1. Dashboard (hidden for client) */}
          {!isClient() && (
            <li>
              <NavLink
                to="/dashboard"
                onClick={onClose}
                className={({ isActive }) =>
                  `${linkBase} ${
                    isActive
                      ? "bg-neutral-100 text-neutral-900"
                      : "text-[#CBD5E1] hover:bg-neutral-100 hover:text-neutral-900"
                  }`
                }
              >
                <FaHouse className="w-4 h-4" />
                Dashboard
              </NavLink>
            </li>
          )}

          {/* 2. Masters - Hidden for Client and Sales */}
          {!isClient() && !isSalesUser && (
            <SidebarSection title="Masters" defaultOpen={true}>
              <NavLink
                to="/masters/debitors-master"
                onClick={onClose}
                className={`${linkBase} text-[#CBD5E1] hover:bg-neutral-100 hover:text-neutral-900`}
              >
                <FaBuilding className="w-4 h-4" />
                Debitors ( Saler) Master
              </NavLink>

              {/* <NavLink
              to="/inventory/category-master"
              onClick={onClose}
              className={({ isActive }) =>
                `${linkBase} ${
                  isActive
                    ? "bg-neutral-100 text-neutral-900"
                    : "text-[#CBD5E1] hover:bg-neutral-100 hover:text-neutral-900"
                }`
              }
            >
              <FaTags className="w-4 h-4" />
              Category Master
            </NavLink> */}

              <NavLink
                to="/inventory/label-master"
                onClick={onClose}
                className={({ isActive }) =>
                  `${linkBase} ${
                    isActive
                      ? "bg-neutral-100 text-neutral-900"
                      : "text-[#CBD5E1] hover:bg-neutral-100 hover:text-neutral-900"
                  }`
                }
              >
                <FaTags className="w-4 h-4" />
                Label Master
              </NavLink>

              <NavLink
                to="/masters/brand-master"
                onClick={onClose}
                className={({ isActive }) =>
                  `${linkBase} ${
                    isActive
                      ? "bg-neutral-100 text-neutral-900"
                      : "text-[#CBD5E1] hover:bg-neutral-100 hover:text-neutral-900"
                  }`
                }
              >
                <FaTags className="w-4 h-4" />
                Brand Master
              </NavLink>
              <NavLink
                to="/masters/discount-master"
                onClick={onClose}
                className={({ isActive }) =>
                  `${linkBase} ${
                    isActive
                      ? "bg-neutral-100 text-neutral-900"
                      : "text-[#CBD5E1] hover:bg-neutral-100 hover:text-neutral-900"
                  }`
                }
              >
                <FaTags className="w-4 h-4" />
                Discount Master
              </NavLink>

              <NavLink
                to="/masters/agent-master"
                onClick={onClose}
                className={({ isActive }) =>
                  `${linkBase} ${
                    isActive
                      ? "bg-neutral-100 text-neutral-900"
                      : "text-[#CBD5E1] hover:bg-neutral-100 hover:text-neutral-900"
                  }`
                }
              >
                <FaUsers className="w-4 h-4" />
                Agent Master
              </NavLink>

              <NavLink
                to="/masters/transport-master"
                onClick={onClose}
                className={({ isActive }) =>
                  `${linkBase} ${
                    isActive
                      ? "bg-neutral-100 text-neutral-900"
                      : "text-[#CBD5E1] hover:bg-neutral-100 hover:text-neutral-900"
                  }`
                }
              >
                <FaUsers className="w-4 h-4" />
                Transport Master
              </NavLink>

              <NavLink
                to="/masters/hsn-master"
                onClick={onClose}
                className={({ isActive }) =>
                  `${linkBase} ${
                    isActive
                      ? "bg-neutral-100 text-neutral-900"
                      : "text-[#CBD5E1] hover:bg-neutral-100 hover:text-neutral-900"
                  }`
                }
              >
                <FaTags className="w-4 h-4" />
                HSN Master
              </NavLink>

              <NavLink
                to="/masters/area-master"
                onClick={onClose}
                className={({ isActive }) =>
                  `${linkBase} ${
                    isActive
                      ? "bg-neutral-100 text-neutral-900"
                      : "text-[#CBD5E1] hover:bg-neutral-100 hover:text-neutral-900"
                  }`
                }
              >
                <FaBuilding className="w-4 h-4" />
                Area Master
              </NavLink>

              <NavLink
                to="/inventory/department-master"
                onClick={onClose}
                className={({ isActive }) =>
                  `${linkBase} ${
                    isActive
                      ? "bg-neutral-100 text-neutral-900"
                      : "text-[#CBD5E1] hover:bg-neutral-100 hover:text-neutral-900"
                  }`
                }
              >
                <FaBuilding className="w-4 h-4" />
                Department Master
              </NavLink>

              <NavLink
                to="/masters/bank-master"
                onClick={onClose}
                className={({ isActive }) =>
                  `${linkBase} ${
                    isActive
                      ? "bg-neutral-100 text-neutral-900"
                      : "text-[#CBD5E1] hover:bg-neutral-100 hover:text-neutral-900"
                  }`
                }
              >
                <FaBuilding className="w-4 h-4" />
                Bank Master
              </NavLink>

              <NavLink
                to="/masters/transaction-master"
                onClick={onClose}
                className={({ isActive }) =>
                  `${linkBase} ${
                    isActive
                      ? "bg-neutral-100 text-neutral-900"
                      : "text-[#CBD5E1] hover:bg-neutral-100 hover:text-neutral-900"
                  }`
                }
              >
                <FaMoneyBillTransfer className="w-4 h-4" />
                Transaction Master
              </NavLink>

              <NavLink
                to="/masters/return-master"
                onClick={onClose}
                className={({ isActive }) =>
                  `${linkBase} ${
                    isActive
                      ? "bg-neutral-100 text-neutral-900"
                      : "text-[#CBD5E1] hover:bg-neutral-100 hover:text-neutral-900"
                  }`
                }
              >
                <FaFileInvoice className="w-4 h-4" />
                Return Master
              </NavLink>

              <NavLink
                to="/inventory/stock-alert-master"
                onClick={onClose}
                className={({ isActive }) =>
                  `${linkBase} ${
                    isActive
                      ? "bg-neutral-100 text-neutral-900"
                      : "text-[#CBD5E1] hover:bg-neutral-100 hover:text-neutral-900"
                  }`
                }
              >
                <FaBell className="w-4 h-4" />
                Stock Alert Master
              </NavLink>
            </SidebarSection>
          )}

          {/* 2. Inventory - Show limited view for Client */}
          {!isSalesUser && (
            <SidebarSection title="Inventory" defaultOpen={true}>
              <NavLink
                to="/inventory/item-view"
                onClick={onClose}
                className={({ isActive }) =>
                  `${linkBase} ${
                    isActive
                      ? "bg-neutral-100 text-neutral-900"
                      : "text-[#CBD5E1] hover:bg-neutral-100 hover:text-neutral-900"
                  }`
                }
              >
                <FaEye className="w-4 h-4" />
                Item View
              </NavLink>

              {/* Hide management features from Client */}
              {!isClient() && (
                <>
                  <NavLink
                    to="/inventory/item-master"
                    onClick={onClose}
                    className={({ isActive }) =>
                      `${linkBase} ${
                        isActive
                          ? "bg-neutral-100 text-neutral-900"
                          : "text-[#CBD5E1] hover:bg-neutral-100 hover:text-neutral-900"
                      }`
                    }
                  >
                    <FaBuilding className="w-4 h-4" />
                    Item Management
                  </NavLink>

                  <NavLink
                    to="/inventory/item-update"
                    onClick={onClose}
                    className={({ isActive }) =>
                      `${linkBase} ${
                        isActive
                          ? "bg-neutral-100 text-neutral-900"
                          : "text-[#CBD5E1] hover:bg-neutral-100 hover:text-neutral-900"
                      }`
                    }
                  >
                    <FaList className="w-4 h-4" />
                    Item Update
                  </NavLink>

                  <NavLink
                    to="/inventory/add-creditors"
                    onClick={onClose}
                    className={({ isActive }) =>
                      `${linkBase} ${
                        isActive
                          ? "bg-neutral-100 text-neutral-900"
                          : "text-[#CBD5E1] hover:bg-neutral-100 hover:text-neutral-900"
                      }`
                    }
                  >
                    <FaUserPlus className="w-4 h-4" />
                    Creditors ( Purchasers) Master
                  </NavLink>

                  {/* <NavLink
                    to="/inventory/view-all-creditors"
                    onClick={onClose}
                    className={({ isActive }) =>
                      `${linkBase} ${
                        isActive ?
                          "bg-neutral-100 text-neutral-900"
                        : "text-[#CBD5E1] hover:bg-neutral-100 hover:text-neutral-900"
                      }`
                    }
                  >
                    <FaUsersGear className="w-4 h-4" />
                    View All Creditors
                  </NavLink> */}
                </>
              )}
            </SidebarSection>
          )}

          {/* 3. Transactions - Hidden for Client and Salesman */}
          {canAccessTransactions && (
            <SidebarSection title="Transactions" defaultOpen={true}>
              <NavLink
                to="/transactions/challan-list"
                onClick={onClose}
                className={({ isActive }) =>
                  `${linkBase} ${
                    isActive
                      ? "bg-neutral-100 text-neutral-900"
                      : "text-[#CBD5E1] hover:bg-neutral-100 hover:text-neutral-900"
                  }`
                }
              >
                <FaListCheck className="w-4 h-4" />
                Challan List
              </NavLink>

              <NavLink
                to="/transactions/bill-list"
                onClick={onClose}
                className={({ isActive }) =>
                  `${linkBase} ${
                    isActive
                      ? "bg-neutral-100 text-neutral-900"
                      : "text-[#CBD5E1] hover:bg-neutral-100 hover:text-neutral-900"
                  }`
                }
              >
                <FaFileInvoice className="w-4 h-4" />
                Bill List
              </NavLink>

              <NavLink
                to="/transactions/bill-automation"
                onClick={onClose}
                className={({ isActive }) =>
                  `${linkBase} ${
                    isActive
                      ? "bg-neutral-100 text-neutral-900"
                      : "text-[#CBD5E1] hover:bg-neutral-100 hover:text-neutral-900"
                  }`
                }
              >
                <FaMoneyBillTransfer className="w-4 h-4" />
                Bill Automation
              </NavLink>

              <NavLink
                to="/transactions/transaction-history"
                onClick={onClose}
                className={({ isActive }) =>
                  `${linkBase} ${
                    isActive
                      ? "bg-neutral-100 text-neutral-900"
                      : "text-[#CBD5E1] hover:bg-neutral-100 hover:text-neutral-900"
                  }`
                }
              >
                <FaHistory className="w-4 h-4" />
                Transaction History
              </NavLink>

              <NavLink
                to="/transactions/outstandings"
                onClick={onClose}
                className={({ isActive }) =>
                  `${linkBase} ${
                    isActive
                      ? "bg-neutral-100 text-neutral-900"
                      : "text-[#CBD5E1] hover:bg-neutral-100 hover:text-neutral-900"
                  }`
                }
              >
                <FaMoneyBillTransfer className="w-4 h-4" />
                OutStandings
              </NavLink>

              <NavLink
                to="/transactions/outstanding-list"
                onClick={onClose}
                className={({ isActive }) =>
                  `${linkBase} ${
                    isActive
                      ? "bg-neutral-100 text-neutral-900"
                      : "text-[#CBD5E1] hover:bg-neutral-100 hover:text-neutral-900"
                  }`
                }
              >
                <FaMoneyBillTransfer className="w-4 h-4" />
                Outstanding List
              </NavLink>
            </SidebarSection>
          )}

          {/* Outstanding for Salesman and Client */}
          {!canAccessTransactions && canAccessOutstanding() && (
            <SidebarSection
              title={isClient() ? "My Account" : "Outstanding"}
              defaultOpen={true}
            >
              <NavLink
                to="/transactions/outstanding-list"
                onClick={onClose}
                className={({ isActive }) =>
                  `${linkBase} ${
                    isActive
                      ? "bg-neutral-100 text-neutral-900"
                      : "text-[#CBD5E1] hover:bg-neutral-100 hover:text-neutral-900"
                  }`
                }
              >
                <FaMoneyBillTransfer className="w-4 h-4" />
                {isClient() ? "My Outstanding" : "Outstanding List"}
              </NavLink>
            </SidebarSection>
          )}

          {/* 4. Reports - Only for Admin, Accountant, Salesman */}
          {canAccessReports() && (
            <SidebarSection title="Reports">
              <NavLink
                to="/reports"
                onClick={onClose}
                className={({ isActive }) =>
                  `${linkBase} ${
                    isActive
                      ? "bg-neutral-100 text-neutral-900"
                      : "text-[#CBD5E1] hover:bg-neutral-100 hover:text-neutral-900"
                  }`
                }
                end
              >
                <FaChartPie className="w-4 h-4" />
                Account Ledger Report
              </NavLink>

              <NavLink
                to="/reports/item-ledger-report"
                onClick={onClose}
                className={({ isActive }) =>
                  `${linkBase} ${
                    isActive
                      ? "bg-neutral-100 text-neutral-900"
                      : "text-[#CBD5E1] hover:bg-neutral-100 hover:text-neutral-900"
                  }`
                }
              >
                <FaChartPie className="w-4 h-4" />
                Item Ledger Report
              </NavLink>

              <NavLink
                to="/reports/purchase-date-wise-report"
                onClick={onClose}
                className={({ isActive }) =>
                  `${linkBase} ${
                    isActive
                      ? "bg-neutral-100 text-neutral-900"
                      : "text-[#CBD5E1] hover:bg-neutral-100 hover:text-neutral-900"
                  }`
                }
              >
                <FaChartPie className="w-4 h-4" />
                Purchase/Sale Date Wise Report
              </NavLink>

              <NavLink
                to="/reports/collection-report"
                onClick={onClose}
                className={({ isActive }) =>
                  `${linkBase} ${
                    isActive
                      ? "bg-neutral-100 text-neutral-900"
                      : "text-[#CBD5E1] hover:bg-neutral-100 hover:text-neutral-900"
                  }`
                }
              >
                <FaChartPie className="w-4 h-4" />
                Collection Report
              </NavLink>

              <NavLink
                to="/reports/profit-loss-report"
                onClick={onClose}
                className={({ isActive }) =>
                  `${linkBase} ${
                    isActive
                      ? "bg-neutral-100 text-neutral-900"
                      : "text-[#CBD5E1] hover:bg-neutral-100 hover:text-neutral-900"
                  }`
                }
              >
                <FaChartPie className="w-4 h-4" />
                Profit / Loss Report
              </NavLink>

              <NavLink
                to="/reports/gst-report-details"
                onClick={onClose}
                className={({ isActive }) =>
                  `${linkBase} ${
                    isActive
                      ? "bg-neutral-100 text-neutral-900"
                      : "text-[#CBD5E1] hover:bg-neutral-100 hover:text-neutral-900"
                  }`
                }
              >
                <FaChartPie className="w-4 h-4" />
                GST Report Details
              </NavLink>

              <NavLink
                to="/reports/damage-item-report"
                onClick={onClose}
                className={({ isActive }) =>
                  `${linkBase} ${
                    isActive
                      ? "bg-neutral-100 text-neutral-900"
                      : "text-[#CBD5E1] hover:bg-neutral-100 hover:text-neutral-900"
                  }`
                }
              >
                <FaChartPie className="w-4 h-4" />
                Damage Item Report
              </NavLink>
            </SidebarSection>
          )}

          {/* 5. Setup & Tools - Only for Admin */}
          {isRole("admin") && (
            <SidebarSection title="Setup & Tools">
              <NavLink
                to="/setup/backup-restore"
                onClick={onClose}
                className={({ isActive }) =>
                  `${linkBase} ${
                    isActive
                      ? "bg-neutral-100 text-neutral-900"
                      : "text-[#CBD5E1] hover:bg-neutral-100 hover:text-neutral-900"
                  }`
                }
              >
                <FaDownload className="w-4 h-4" />
                Backup / Restore
              </NavLink>

              <NavLink
                to="/setup/financial-year-close"
                onClick={onClose}
                className={({ isActive }) =>
                  `${linkBase} ${
                    isActive
                      ? "bg-neutral-100 text-neutral-900"
                      : "text-[#CBD5E1] hover:bg-neutral-100 hover:text-neutral-900"
                  }`
                }
              >
                <FaCalendarXmark className="w-4 h-4" />
                Financial Year Close
              </NavLink>

              <NavLink
                to="/setup/cheque-print-setup"
                onClick={onClose}
                className={({ isActive }) =>
                  `${linkBase} ${
                    isActive
                      ? "bg-neutral-100 text-neutral-900"
                      : "text-[#CBD5E1] hover:bg-neutral-100 hover:text-neutral-900"
                  }`
                }
              >
                <FaFileInvoice className="w-4 h-4" />
                Cheque Print Setup
              </NavLink>
            </SidebarSection>
          )}
        </ul>
      </nav>

      {/* Footer - Fixed to bottom */}
      {/* Logout button removed as requested */}
    </aside>
  );
};

export default Sidebar;
