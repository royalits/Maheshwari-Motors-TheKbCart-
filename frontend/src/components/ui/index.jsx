import React, { useState, useRef, useEffect } from 'react';
import {  FaSort, FaSortUp, FaSortDown, FaTrash, FaPlus } from 'react-icons/fa';
import {
  normalizeDisplayDateInput,
  toDisplayDate,
  toISODate,
} from '../../utils/dateHelpers';

// Data Table Component
export const DataTable = ({ 
  data, 
  columns, 
  onEdit, 
  onDelete, 
  onAdd, 
  searchable = true,
  sortable = true,
  selectable = false,
  onSelectionChange,
  className = ""
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [sortConfig, setSortConfig] = useState({ key: null, direction: 'asc' });
  const [selectedRows, setSelectedRows] = useState(new Set());

  const filteredData = data.filter(row =>
    columns.some(col => 
      String(row[col.key]).toLowerCase().includes(searchTerm.toLowerCase())
    )
  );

  const sortedData = sortable && sortConfig.key
    ? [...filteredData].sort((a, b) => {
        const aVal = a[sortConfig.key];
        const bVal = b[sortConfig.key];
        if (sortConfig.direction === 'asc') {
          return aVal > bVal ? 1 : -1;
        }
        return aVal < bVal ? 1 : -1;
      })
    : filteredData;

  const handleSort = (key) => {
    setSortConfig(prev => ({
      key,
      direction: prev.key === key && prev.direction === 'asc' ? 'desc' : 'asc'
    }));
  };

  const handleSelectAll = (checked) => {
    if (checked) {
      setSelectedRows(new Set(sortedData.map((_, index) => index)));
    } else {
      setSelectedRows(new Set());
    }
    onSelectionChange?.(checked ? sortedData : []);
  };

  const handleSelectRow = (index, checked) => {
    const newSelected = new Set(selectedRows);
    if (checked) {
      newSelected.add(index);
    } else {
      newSelected.delete(index);
    }
    setSelectedRows(newSelected);
    onSelectionChange?.(sortedData.filter((_, i) => newSelected.has(i)));
  };

  return (
    <div className={`bg-white rounded-lg border ${className}`}>
      {/* Header */}
      <div className="p-4 border-b flex justify-between items-center">
        {searchable && (
          <div className="relative">
            <FaPlus className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 text-sm" />
            <input
              type="text"
              placeholder="Search..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-10 pr-4 py-2 border rounded-md text-sm w-64"
            />
          </div>
        )}
        {onAdd && (
          <button
            onClick={onAdd}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 text-sm"
          >
            <FaPlus className="text-xs" />
            Add New
          </button>
        )}
      </div>

      {/* Table */}
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead className="bg-gray-50">
            <tr>
              {selectable && (
                <th className="px-4 py-3 text-left">
                  <input
                    type="checkbox"
                    onChange={(e) => handleSelectAll(e.target.checked)}
                    checked={selectedRows.size === sortedData.length && sortedData.length > 0}
                  />
                </th>
              )}
              {columns.map(col => (
                <th
                  key={col.key}
                  className={`px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider ${
                    sortable && col.sortable !== false ? 'cursor-pointer hover:bg-gray-100' : ''
                  }`}
                  onClick={() => sortable && col.sortable !== false && handleSort(col.key)}
                >
                  <div className="flex items-center gap-2">
                    {col.label}
                    {sortable && col.sortable !== false && (
                      <span className="text-gray-400">
                        {sortConfig.key === col.key ? (
                          sortConfig.direction === 'asc' ? <FaSortUp /> : <FaSortDown />
                        ) : (
                          <FaSort />
                        )}
                      </span>
                    )}
                  </div>
                </th>
              ))}
              {(onEdit || onDelete) && (
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Actions
                </th>
              )}
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {sortedData.map((row, index) => (
              <tr key={index} className="hover:bg-gray-50">
                {selectable && (
                  <td className="px-4 py-3">
                    <input
                      type="checkbox"
                      checked={selectedRows.has(index)}
                      onChange={(e) => handleSelectRow(index, e.target.checked)}
                    />
                  </td>
                )}
                {columns.map(col => (
                  <td key={col.key} className="px-4 py-3 text-sm text-gray-900">
                    {col.render ? col.render(row[col.key], row) : row[col.key]}
                  </td>
                ))}
                {(onEdit || onDelete) && (
                  <td className="px-4 py-3 text-sm">
                    <div className="flex gap-2">
                      {onEdit && (
                        <button
                          onClick={() => onEdit(row)}
                          className="text-blue-600 hover:text-blue-800"
                        >
                          {/* <FaEdit /> */}
                        </button>
                      )}
                      {onDelete && (
                        <button
                          onClick={() => onDelete(row)}
                          className="text-red-600 hover:text-red-800"
                        >
                          <FaTrash />
                        </button>
                      )}
                    </div>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {sortedData.length === 0 && (
        <div className="p-8 text-center text-gray-500">
          No data found
        </div>
      )}
    </div>
  );
};

// Form Field Component
export const FormField = ({ 
  label, 
  error, 
  required, 
  children, 
  className = "" 
}) => (
  <div className={`space-y-1 ${className}`}>
    {label && (
      <label className="block text-sm font-medium text-gray-700">
        {label}
        {required && <span className="text-red-500 ml-1">*</span>}
      </label>
    )}
    {children}
    {error && (
      <p className="text-sm text-red-600">{error}</p>
    )}
  </div>
);

// Input Component
export const Input = React.forwardRef(({
  type = "text",
  value,
  onChange,
  onBlur,
  placeholder,
  disabled,
  className = "",
  allowSpaces = true,
  allowZero = true,
  allowNegative = false,
  trimSpaces = true,
  error,
  ...props
	}, ref) => {
	  const handleChange = (e) => {
	    if (!onChange) return;
	    if (type === "date") {
	      const displayValue = normalizeDisplayDateInput(e.target.value);
	      onChange(toISODate(displayValue) || displayValue, e);
	      return;
	    }
	    // If onChange expects a plain value (AddItem style), detect by checking arity hint
    // We always call with the event so callers using e.target.value still work,
    // but we also support callers expecting a plain string by passing e.target.value.
    // To stay backward-compatible with both patterns, call onChange with the event
    // AND provide e.target.value as second arg — but the real fix is:
    // Call onChange(e.target.value) so all callers get a plain string.
    onChange(e.target.value, e);
  };

  return (
	    <input
	      ref={ref}
	      type={type === "date" ? "text" : type}
	      value={type === "date" ? toDisplayDate(value) || value || "" : value}
	      onChange={handleChange}
	      onBlur={onBlur}
	      placeholder={type === "date" ? placeholder || "dd/mm/yyyy" : placeholder}
      disabled={disabled}
      className={`w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:bg-gray-100 ${error ? 'border-red-300' : ''} ${className}`}
      {...props}
    />
  );
});
Input.displayName = "Input";

const normalizeOptionValue = (option) => {
  if (option === null || option === undefined) return "";
  if (typeof option === "object") {
    return String(option.value ?? option._id ?? option.id ?? "");
  }
  return String(option);
};

const normalizeOptionLabel = (option) => {
  if (option === null || option === undefined) return "";
  if (typeof option === "object") {
    return String(option.label ?? option.name ?? option.title ?? option.value ?? "");
  }
  return String(option);
};

const buildOptionsFromChildren = (children, placeholder) => {
  const parsed = [];
  if (placeholder) {
    parsed.push({ value: "", label: placeholder });
  }

  React.Children.forEach(children, (child) => {
    if (!React.isValidElement(child)) return;
    if (child.type !== "option") return;
    parsed.push({
      value: child.props.value ?? "",
      label: child.props.children,
      disabled: child.props.disabled,
    });
  });

  return parsed;
};

export const SearchableSelect = React.forwardRef(({
  value,
  onChange,
  options = [],
  placeholder = "",
  disabled,
  name,
  id,
  required,
  className = "",
  searchPlaceholder = "Search...",
  emptyText = "No results found",
  buttonClassName = "",
  dropdownClassName = "",
  children,
  ...props
}, ref) => {
  const [isOpen, setIsOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [focusedIndex, setFocusedIndex] = useState(-1);
  const [placement, setPlacement] = useState("bottom");

  const containerRef = useRef(null);
  const searchInputRef = useRef(null);
  const listRef = useRef(null);

  const normalizedOptions =
    children ?
      buildOptionsFromChildren(children, placeholder)
    : [
        ...(placeholder ? [{ value: "", label: placeholder }] : []),
        ...options.map((option) => ({
          value: normalizeOptionValue(option),
          label: normalizeOptionLabel(option),
          disabled: option?.disabled || false,
          searchText:
            option && typeof option === "object" ?
              option.searchText || option.label || option.name || option.value
            : option,
        })),
      ];

  const selectedOption =
    normalizedOptions.find((option) => String(option.value) === String(value)) ||
    null;

  const filteredOptions = normalizedOptions.filter((option) => {
    const haystack = String(
      option.searchText ?? option.label ?? option.value ?? "",
    ).toLowerCase();
    return haystack.includes(searchTerm.toLowerCase());
  });

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (!containerRef.current?.contains(event.target)) {
        setIsOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  useEffect(() => {
    if (!isOpen || !containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const spaceBelow = window.innerHeight - rect.bottom;
    const spaceAbove = rect.top;
    if (spaceBelow < 260 && spaceAbove > spaceBelow) {
      setPlacement("top");
    } else {
      setPlacement("bottom");
    }
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) {
      setSearchTerm("");
      setFocusedIndex(-1);
      return;
    }
    const timer = window.setTimeout(() => {
      searchInputRef.current?.focus();
      searchInputRef.current?.select?.();
    }, 20);
    return () => window.clearTimeout(timer);
  }, [isOpen]);

  useEffect(() => {
    setFocusedIndex(-1);
  }, [searchTerm]);

  useEffect(() => {
    if (focusedIndex >= 0 && listRef.current) {
      const item = listRef.current.children[focusedIndex];
      item?.scrollIntoView({ block: 'nearest' });
    }
  }, [focusedIndex]);

  const handleSearchKeyDown = (e) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setFocusedIndex((i) => Math.min(i + 1, filteredOptions.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setFocusedIndex((i) => Math.max(i - 1, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const opt = filteredOptions[focusedIndex];
      if (opt && !opt.disabled) {
        onChange?.(opt.value);
        setIsOpen(false);
      }
    } else if (e.key === 'Escape') {
      setIsOpen(false);
    }
  };

  return (
    <div ref={containerRef} className={`relative ${className}`}>
      {name ? <input type="hidden" name={name} value={value ?? ""} required={required} /> : null}
      <button
        ref={ref}
        id={id}
        type="button"
        disabled={disabled}
        onClick={() => !disabled && setIsOpen((prev) => !prev)}
        className={`flex w-full items-center justify-between rounded-md border border-gray-300 bg-white px-3 py-2 text-left focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:bg-gray-100 disabled:cursor-not-allowed ${buttonClassName}`}
        {...props}
      >
        <span className={selectedOption?.value !== "" ? "text-gray-900" : "text-gray-500"}>
          {selectedOption?.label || placeholder}
        </span>
        <svg
          className={`h-4 w-4 text-gray-400 transition-transform ${isOpen ? "rotate-180" : ""}`}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {isOpen && (
        <div
          className={`absolute z-50 ${placement === "top" ? "bottom-full mb-1" : "top-full mt-1"} w-full rounded-md border border-gray-200 bg-white shadow-xl ${dropdownClassName}`}
        >
          <div className="border-b p-2">
            <input
              ref={searchInputRef}
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              onKeyDown={handleSearchKeyDown}
              placeholder={searchPlaceholder}
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div
            ref={listRef}
            className="max-h-60 sm:max-h-64 overflow-y-auto py-1"
          >
            {filteredOptions.length > 0 ? (
              filteredOptions.map((option, idx) => (
                <button
                  key={`${option.value}-${idx}`}
                  type="button"
                  disabled={option.disabled}
                  onClick={() => {
                    if (option.disabled) return;
                    onChange?.(option.value);
                    setIsOpen(false);
                  }}
                  className={`w-full px-3 py-2 text-left text-sm ${
                    idx === focusedIndex
                      ? 'bg-blue-100 text-blue-800'
                      : String(option.value) === String(value)
                      ? 'bg-blue-50 text-blue-700'
                      : 'text-gray-700 hover:bg-gray-50'
                  } ${option.disabled ? 'cursor-not-allowed opacity-50' : ''}`}
                >
                  {option.label}
                </button>
              ))
            ) : (
              <div className="px-3 py-4 text-center text-sm text-gray-500">{emptyText}</div>
            )}
          </div>
        </div>
      )}
    </div>
  );
});
SearchableSelect.displayName = "SearchableSelect";

// Select Component
export const Select = (props) => <SearchableSelect {...props} />;

// Modal Component
export const Modal = ({ 
  isOpen, 
  onClose, 
  title, 
  children, 
  size = "md",
  className = "" 
}) => {
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = 'unset';
    }
    return () => {
      document.body.style.overflow = 'unset';
    };
  }, [isOpen]);

  if (!isOpen) return null;

  const sizeClasses = {
    sm: "max-w-md",
    md: "max-w-lg",
    lg: "max-w-2xl",
    xl: "max-w-4xl",
    full: "max-w-7xl"
  };

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto">
      <div className="flex items-center justify-center min-h-screen px-4 pt-4 pb-20 text-center sm:block sm:p-0">
        <div 
          className="fixed inset-0 transition-opacity bg-gray-500 bg-opacity-75"
          onClick={onClose}
        />
        
        <div className={`inline-block w-full ${sizeClasses[size]} p-6 my-8 overflow-visible text-left align-middle transition-all transform bg-white shadow-xl rounded-lg ${className}`}>
          {title && (
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-medium text-gray-900">{title}</h3>
              <button
                onClick={onClose}
                className="text-gray-400 hover:text-gray-600"
              >
                ×
              </button>
            </div>
          )}
          {children}
        </div>
      </div>
    </div>
  );
};

// Button Component
export const Button = ({ 
  children, 
  variant = "primary", 
  size = "md", 
  disabled, 
  loading,
  onClick,
  className = "",
  ...props 
}) => {
  const baseClasses = "inline-flex items-center justify-center font-medium rounded-md focus:outline-none focus:ring-2 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed";
  
  const variants = {
    primary: "bg-blue-600 text-white hover:bg-blue-700 focus:ring-blue-500",
    secondary: "bg-gray-200 text-gray-900 hover:bg-gray-300 focus:ring-gray-500",
    danger: "bg-red-600 text-white hover:bg-red-700 focus:ring-red-500",
    outline: "border border-gray-300 bg-white text-gray-700 hover:bg-gray-50 focus:ring-blue-500"
  };
  
  const sizes = {
    sm: "px-3 py-1.5 text-sm",
    md: "px-4 py-2 text-sm",
    lg: "px-6 py-3 text-base"
  };

  return (
    <button
      onClick={onClick}
      disabled={disabled || loading}
      className={`${baseClasses} ${variants[variant]} ${sizes[size]} ${className}`}
      {...props}
    >
      {loading && (
        <svg className="animate-spin -ml-1 mr-2 h-4 w-4" fill="none" viewBox="0 0 24 24">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
        </svg>
      )}
      {children}
    </button>
  );
};

// Textarea Component
export const Textarea = ({ 
  value, 
  onChange, 
  onBlur,
  placeholder, 
  disabled, 
  rows = 3,
  className = "",
  ...props 
}) => (
  <textarea
    value={value}
    onChange={(e) => onChange?.(e.target.value)}
    onBlur={onBlur}
    placeholder={placeholder}
    disabled={disabled}
    rows={rows}
    className={`w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:bg-gray-100 resize-vertical ${className}`}
    {...props}
  />
);
