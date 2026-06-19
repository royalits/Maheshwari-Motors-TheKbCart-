import React, { useState, useEffect, useRef } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  FaChevronDown,
  FaBars,
  FaUser,
  FaSignOutAlt,
  FaBuilding,
} from "react-icons/fa";
import useStore from "../../store";
import api, { invalidateClientCache } from "../../services/axiosInstance";

const getFirmName = (user, selectedFirm) => {
  const type = String(
    selectedFirm?.firm_type || user?.current_firm_type || localStorage.getItem("firm_type") || ""
  ).trim().toUpperCase().replace(/[-\s]/g, "_");
  const profileFirm =
    type === "GST" ? user?.gst_firm :
    type === "NON_GST" || type === "NONGST" ? user?.nongst_firm :
    user?.gst_firm || user?.nongst_firm || {};
  return (
    profileFirm?.name ||
    profileFirm?.firm_name ||
    selectedFirm?.name ||
    user?.firm_data?.name ||
    user?.firm_data?.firm_name ||
    "MAHESHWARI MOTORS"
  );
};

const Header = ({ onMenuClick }) => {
  const user = useStore((s) => s.user);
  const selectedFirm = useStore((s) => s.selectedFirm);
  const firmName = getFirmName(user, selectedFirm);
  const financialYears = useStore((s) => s.financialYears);
  const selectedFinancialYear = useStore((s) => s.selectedFinancialYear);
  const selectedFinancialYearId = useStore((s) => s.selectedFinancialYearId);
  const setFinancialYears = useStore((s) => s.setFinancialYears);
  const setSelectedFinancialYear = useStore((s) => s.setSelectedFinancialYear);
  const setFinancialYearSwitching = useStore((s) => s.setFinancialYearSwitching);
  const [showUserMenu, setShowUserMenu] = useState(false);

  // Determine email based on user type
  const getUserEmail = () => {
    if (!user) return 'user@example.com';
    if (user.current_firm_type === 'GST') {
      return user.gst_firm?.email || user.email || 'user@example.com';
    }
    return user.nongst_firm?.email || user.email || 'user@example.com';
  };

  const navigate = useNavigate();
  const userMenuRef = useRef(null);
  const yearSwitchFallbackRef = useRef(null);

  useEffect(() => {
    if (!user) return;

    let cancelled = false;
    const loadFinancialYears = async () => {
      try {
        const response = await api.get("/financial-years", { skipCache: true });
        const years = response?.data?.data || [];
        if (!cancelled) setFinancialYears(Array.isArray(years) ? years : []);
      } catch {
        if (!cancelled) setFinancialYears([]);
      }
    };

    loadFinancialYears();
    return () => {
      cancelled = true;
    };
  }, [user, setFinancialYears]);

  useEffect(() => () => {
    if (yearSwitchFallbackRef.current) {
      window.clearTimeout(yearSwitchFallbackRef.current);
    }
  }, []);

  // Close dropdowns when clicking outside
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (userMenuRef.current && !userMenuRef.current.contains(event.target)) {
        setShowUserMenu(false);
      }
      // Date picker removed — no-op kept for ref cleanup
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  // const handlePurchaseClick = () => {
  //   navigate('/transactions');
  // };

  // const handleSaleClick = () => {
  //   navigate('/sale-entry');
  // };

  const handleLogout = async () => {
    try {
      // Call the API to invalidate the session on the server
      await api.post('/auth/logout');
    } catch (error) {
      console.error("Logout API failed", error);
    } finally {
      // Always clear local storage and redirect
      localStorage.removeItem('token');
      localStorage.removeItem('userRole');
      localStorage.removeItem('firm_type');
      localStorage.removeItem('firm_role');
      localStorage.removeItem('financial_year_id');
      localStorage.removeItem('financial_year_start');
      localStorage.removeItem('financial_year_end');
      localStorage.removeItem('financial_year_label');
      navigate('/login');
    }
  };

  const handleFinancialYearChange = (event) => {
    const selected = financialYears.find(
      (year) => String(year._id) === String(event.target.value),
    );
    if (String(selected?._id || "") === String(selectedFinancialYearId || "")) {
      return;
    }

    setFinancialYearSwitching(true);
    setSelectedFinancialYear(selected || null);
    invalidateClientCache();

    if (yearSwitchFallbackRef.current) {
      window.clearTimeout(yearSwitchFallbackRef.current);
    }

    yearSwitchFallbackRef.current = window.setTimeout(() => {
      setFinancialYearSwitching(false);
    }, 5000);
  };
  return (
    <header className="flex flex-col  sm:flex-row sm:items-center sm:justify-between h-auto sm:h-16 px-4 sm:px-6 py-4 sm:py-0 bg-white border-b border-neutral-200">
      {/* Top row on mobile, left section on desktop */}
      <div className="flex items-center justify-between sm:justify-start gap-2 sm:gap-4">
        {/* Menu toggle button - visible on all screens */}
        <button
          onClick={onMenuClick}
          className="p-2 rounded-md hover:bg-neutral-100"
        >
          <FaBars className="text-neutral-700" />
        </button>

        {user && (
          <div
            className="flex max-w-[220px] items-center gap-2 rounded-md border border-neutral-200 bg-neutral-50 px-3 py-1.5 text-xs text-neutral-800"
            title={firmName}
          >
            <FaBuilding className="shrink-0 text-neutral-500" />
            <span className="truncate font-medium">{firmName}</span>
          </div>
        )}



        {/* User avatar - moved to top right on mobile */}
        <div className="sm:hidden relative" ref={userMenuRef}>
          <button
            onClick={() => setShowUserMenu(!showUserMenu)}
            className="flex items-center gap-2 p-1 rounded-full hover:bg-neutral-100"
          >
            <img
              src="https://api.dicebear.com/7.x/notionists/svg?seed=251"
              className="w-8 h-8 rounded-full border"
              alt="User"
            />
          </button>

          {showUserMenu && (
            <div className="absolute top-full right-0 mt-1 w-48 bg-white border border-neutral-300 rounded-md shadow-lg z-50">
              {/* <Link to="/settings" onClick={() => setShowUserMenu(false)} className="flex items-center gap-2 px-3 py-2 text-xs hover:bg-neutral-50">
                <FaCog className="text-neutral-500" />
                Settings
              </Link> */}
             <Link to="/user-profile" onClick={() => setShowUserMenu(false)} className="flex items-center gap-2 px-3 py-2 text-xs hover:bg-neutral-50">
  <FaUser className="text-neutral-500" />
  User Profile
</Link>

              <button onClick={handleLogout} className="w-full flex items-center gap-2 px-3 py-2 text-xs hover:bg-neutral-50 text-left">
                <FaSignOutAlt className="text-neutral-500" />
                Logout
              </button>
            </div>
          )}
        </div>

        {/* <div className="hidden lg:flex items-center gap-2 text-xs sm:text-sm relative" ref={datePickerRef}>
          <FaRegCalendarAlt className="text-neutral-500" />
          <button
            onClick={() => setShowDatePicker(!showDatePicker)}
            className="text-neutral-800 truncate hover:text-neutral-600"
          >
            01 Apr 2025 - 31 Mar 2026
          </button>

          {showDatePicker && (
            <div className="absolute top-full left-0 mt-1 w-64 bg-white border border-neutral-300 rounded-md shadow-lg z-50 p-3">
              <p className="text-xs text-neutral-600 mb-2">Financial Year</p>
              <select className="w-full text-xs border border-neutral-300 rounded-md px-2 py-1">
                <option>2024-25 (01 Apr 2024 - 31 Mar 2025)</option>
                <option>2025-26 (01 Apr 2025 - 31 Mar 2026)</option>
              </select>
            </div>
          )}
        </div> */}
      </div>

      {/* Bottom row on mobile, right section on desktop */}
      <div className="flex items-center justify-between sm:justify-end gap-2 sm:gap-4 mt-2 sm:mt-0">
        {/* <div className="lg:hidden flex items-center gap-2 text-xs sm:text-sm relative">
          <FaRegCalendarAlt className="text-neutral-500" />
          <button
            onClick={() => setShowDatePicker(!showDatePicker)}
            className="text-neutral-800 truncate hover:text-neutral-600"
          >
            01 Apr 2025 - 31 Mar 2026
          </button>

          {showDatePicker && (
            <div className="absolute top-full left-0 mt-1 w-64 bg-white border border-neutral-300 rounded-md shadow-lg z-50 p-3">
              <p className="text-xs text-neutral-600 mb-2">Financial Year</p>
              <select className="w-full text-xs border border-neutral-300 rounded-md px-2 py-1">
                <option>2024-25 (01 Apr 2024 - 31 Mar 2025)</option>
                <option>2025-26 (01 Apr 2025 - 31 Mar 2026)</option>
              </select>
            </div>
          )}
        </div> */}

        <div className="flex items-center gap-2 sm:gap-4">
          {/* <div className="flex gap-1 sm:gap-2">
            <button
              onClick={handlePurchaseClick}
              className="px-2 sm:px-3 py-1.5 text-xs sm:text-sm border rounded-md hover:bg-neutral-50"
            >
              Purchase
            </button>
            <button
              onClick={handleSaleClick}
              className="px-2 sm:px-3 py-1.5 text-xs sm:text-sm bg-neutral-900 text-white rounded-md hover:bg-neutral-800"
            >
              Sale
            </button>
          </div> */}

          <div className="w-px h-6 bg-[#F1F5F9] hidden sm:block" />

          {financialYears.length > 0 && (
            <select
              value={selectedFinancialYear?._id || ""}
              onChange={handleFinancialYearChange}
              className="h-9 max-w-[150px] rounded-md border border-neutral-300 bg-white px-2 text-xs text-neutral-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
              title="Financial Year"
            >
              {financialYears.map((year) => (
                <option key={year._id} value={year._id}>
                  {year.label}
                </option>
              ))}
            </select>
          )}

          {/* User avatar - hidden on mobile, shown on desktop */}
          <div className="hidden sm:flex items-center relative" ref={userMenuRef}>
            <button
              onClick={() => setShowUserMenu(!showUserMenu)}
              className="flex items-center gap-2 p-1 rounded-full hover:bg-neutral-100"
            >
              <img
                src="https://api.dicebear.com/7.x/notionists/svg?seed=251"
                className="w-8 h-8 rounded-full border"
                alt="User"
              />
              <FaChevronDown className="text-xs text-neutral-500" />
            </button>

            {showUserMenu && (
              <div className="absolute top-full right-0 mt-1 w-48 bg-white border border-neutral-300 rounded-md shadow-lg z-50">
                <div className="px-3 py-2 border-b border-neutral-200">
                  <p className="text-xs font-medium text-neutral-800">{user?.name || 'User'}</p>
                  <p className="text-xs text-neutral-500">{getUserEmail()}</p>
                </div>


                {/* <Link to="/settings" onClick={() => setShowUserMenu(false)} className="flex items-center gap-2 px-3 py-2 text-xs hover:bg-neutral-50">
                  <FaCog className="text-neutral-500" />
                  Settings
                </Link> */}
                <Link to="/user-profile" onClick={() => setShowUserMenu(false)} className="flex items-center gap-2 px-3 py-2 text-xs hover:bg-neutral-50">
                  <FaUser className="text-neutral-500" />
                  User Profile
                </Link>
                <button onClick={handleLogout} className="w-full flex items-center gap-2 px-3 py-2 text-xs hover:bg-neutral-50 text-left border-t border-neutral-200">
                  <FaSignOutAlt className="text-neutral-500" />
                  Logout
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </header>
  );
};

export default Header;
