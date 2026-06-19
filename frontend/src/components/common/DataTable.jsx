import React, { useEffect, useMemo, useRef, useState } from "react";
import { FaSort, FaSortUp, FaSortDown, FaSearch } from "react-icons/fa";

const DataTable = ({
  columns,
  data,
  searchable = true,
  searchPlaceholder = "Search...",
  sortable = true,
  pagination = true,
  pageSize = 10,
  onRowClick,
  actions,
  density = "normal",
  className = "",
  minWidth,
  selectable = false,
  selectedRowIds,
  onSelectedRowIdsChange,
  getRowId,
  loading = false,
}) => {
  const [searchTerm, setSearchTerm] = useState("");
  const [sortConfig, setSortConfig] = useState({ key: null, direction: "asc" });
  const [currentPage, setCurrentPage] = useState(1);
  const [internalSelectedRowIds, setInternalSelectedRowIds] = useState([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [highlightedIndex, setHighlightedIndex] = useState(-1);
  const searchRef = useRef(null);
  const suggestionsRef = useRef(null);
  const selectAllRef = useRef(null);
  const isCompact = density === "compact";

  const resolvedSelectedRowIds = selectedRowIds ?? internalSelectedRowIds;
  const selectedRowIdSet = useMemo(
    () => new Set((resolvedSelectedRowIds || []).map((value) => String(value))),
    [resolvedSelectedRowIds],
  );

  const resolveRowId = (row, index) =>
    String(getRowId ? getRowId(row, index) : (row?.id ?? row?._id ?? index));

  const updateSelectedRowIds = (nextIds) => {
    const normalizedIds = Array.from(
      new Set((nextIds || []).map((value) => String(value))),
    );

    if (selectedRowIds === undefined) {
      setInternalSelectedRowIds(normalizedIds);
    }

    onSelectedRowIdsChange?.(normalizedIds);
  };

  // Suggestions: unique values from all searchable columns matching current input
  const suggestions = useMemo(() => {
    if (!searchable || !searchTerm.trim()) return [];
    const term = searchTerm.toLowerCase();
    const seen = new Set();
    const results = [];
    for (const row of data) {
      for (const col of columns) {
        const val = String(row[col.key] || "").trim();
        if (val && val.toLowerCase().includes(term) && !seen.has(val)) {
          seen.add(val);
          results.push(val);
          if (results.length >= 8) return results;
        }
      }
    }
    return results;
  }, [searchTerm, data, columns, searchable]);

  // Close suggestions on outside click
  useEffect(() => {
    const handler = (e) => {
      if (
        searchRef.current && !searchRef.current.contains(e.target) &&
        suggestionsRef.current && !suggestionsRef.current.contains(e.target)
      ) {
        setShowSuggestions(false);
        setHighlightedIndex(-1);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const handleSearchKeyDown = (e) => {
    if (!showSuggestions || suggestions.length === 0) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setHighlightedIndex((prev) => Math.min(prev + 1, suggestions.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlightedIndex((prev) => Math.max(prev - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (highlightedIndex >= 0 && suggestions[highlightedIndex]) {
        setSearchTerm(suggestions[highlightedIndex]);
      }
      setShowSuggestions(false);
      setHighlightedIndex(-1);
    } else if (e.key === "Escape") {
      setShowSuggestions(false);
      setHighlightedIndex(-1);
    }
  };

  // Filter data based on search
  const filteredData = searchable
    ? data.filter((row) =>
        columns.some((col) =>
          String(row[col.key] || "")
            .toLowerCase()
            .includes(searchTerm.toLowerCase()),
        ),
      )
    : data;

  // Sort data
  const sortedData =
    sortable && sortConfig.key
      ? [...filteredData].sort((a, b) => {
          const aVal = a[sortConfig.key];
          const bVal = b[sortConfig.key];
          if (aVal < bVal) return sortConfig.direction === "asc" ? -1 : 1;
          if (aVal > bVal) return sortConfig.direction === "asc" ? 1 : -1;
          return 0;
        })
      : filteredData;

  // Paginate data
  const totalPages = Math.ceil(sortedData.length / pageSize);
  const safeCurrentPage =
    totalPages > 0 ? Math.min(currentPage, totalPages) : 1;
  const paginatedData = pagination
    ? sortedData.slice(
        (safeCurrentPage - 1) * pageSize,
        safeCurrentPage * pageSize,
      )
    : sortedData;
  const filteredRowIds = sortedData.map((row, index) =>
    resolveRowId(row, index),
  );
  const allFilteredSelected =
    filteredRowIds.length > 0 &&
    filteredRowIds.every((rowId) => selectedRowIdSet.has(rowId));
  const someFilteredSelected = filteredRowIds.some((rowId) =>
    selectedRowIdSet.has(rowId),
  );

  useEffect(() => {
    if (selectAllRef.current) {
      selectAllRef.current.indeterminate =
        !allFilteredSelected && someFilteredSelected;
    }
  }, [allFilteredSelected, someFilteredSelected]);

  const handleSort = (key) => {
    if (!sortable) return;
    setSortConfig((prev) => ({
      key,
      direction: prev.key === key && prev.direction === "asc" ? "desc" : "asc",
    }));
  };

  const getSortIcon = (key) => {
    if (sortConfig.key !== key) return <FaSort className="text-gray-400" />;
    return sortConfig.direction === "asc" ? (
      <FaSortUp className="text-blue-600" />
    ) : (
      <FaSortDown className="text-blue-600" />
    );
  };

  const handleSelectAll = (checked) => {
    const nextSelection = new Set(
      (resolvedSelectedRowIds || []).map((value) => String(value)),
    );

    filteredRowIds.forEach((rowId) => {
      if (checked) {
        nextSelection.add(rowId);
      } else {
        nextSelection.delete(rowId);
      }
    });

    updateSelectedRowIds(Array.from(nextSelection));
  };

  const handleRowSelection = (rowId, checked) => {
    const nextSelection = new Set(
      (resolvedSelectedRowIds || []).map((value) => String(value)),
    );

    if (checked) {
      nextSelection.add(rowId);
    } else {
      nextSelection.delete(rowId);
    }

    updateSelectedRowIds(Array.from(nextSelection));
  };

  return (
    <div className={`bg-white rounded-lg border ${className} relative`}>
      {/* Loading Overlay */}
      {loading && (
        <div className="absolute inset-0 bg-white bg-opacity-75 flex items-center justify-center z-10 rounded-lg">
          <div className="flex flex-col items-center gap-3">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
            <span className="text-sm text-gray-600">Loading...</span>
          </div>
        </div>
      )}

      {/* Search */}
      {searchable && (
        <div className={`${isCompact ? "p-2" : "p-4"} border-b`}>
          <div className="relative">
            <FaSearch className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 z-10" />
            <input
              ref={searchRef}
              type="text"
              placeholder={searchPlaceholder}
              value={searchTerm}
              onChange={(e) => {
                setSearchTerm(e.target.value);
                setShowSuggestions(true);
                setHighlightedIndex(-1);
                setCurrentPage(1);
              }}
              onFocus={() => searchTerm && setShowSuggestions(true)}
              onKeyDown={handleSearchKeyDown}
              className={`w-full pl-10 pr-4 ${isCompact ? "py-1 text-sm" : "py-2"} border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500`}
              disabled={loading}
              autoComplete="off"
            />

            {/* Suggestions Dropdown */}
            {showSuggestions && suggestions.length > 0 && (
              <ul
                ref={suggestionsRef}
                className="absolute z-50 left-0 right-0 top-full mt-1 bg-white border border-gray-200 rounded-lg shadow-lg overflow-hidden"
              >
                {suggestions.map((suggestion, idx) => (
                  <li
                    key={idx}
                    onMouseDown={(e) => {
                      e.preventDefault();
                      setSearchTerm(suggestion);
                      setShowSuggestions(false);
                      setHighlightedIndex(-1);
                    }}
                    className={`px-4 py-2 text-sm cursor-pointer flex items-center gap-2 ${
                      idx === highlightedIndex
                        ? "bg-blue-50 text-blue-700 font-medium"
                        : "text-gray-700 hover:bg-gray-50"
                    }`}
                  >
                    <FaSearch className="text-gray-300 text-xs shrink-0" />
                    {/* Highlight matching part */}
                    {(() => {
                      const lower = suggestion.toLowerCase();
                      const termLower = searchTerm.toLowerCase();
                      const start = lower.indexOf(termLower);
                      if (start === -1) return suggestion;
                      return (
                        <span>
                          {suggestion.slice(0, start)}
                          <span className="font-semibold text-blue-600">
                            {suggestion.slice(start, start + searchTerm.length)}
                          </span>
                          {suggestion.slice(start + searchTerm.length)}
                        </span>
                      );
                    })()}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}

      {/* Table */}
      <div className="overflow-x-auto">
        <table className="w-full" style={minWidth ? { minWidth } : undefined}>
          <thead className="bg-gray-50">
            <tr>
              {selectable && (
                <th className={`${isCompact ? "px-2 py-2" : "px-4 py-3"} w-10`}>
                  <input
                    ref={selectAllRef}
                    type="checkbox"
                    checked={allFilteredSelected}
                    onChange={(e) => handleSelectAll(e.target.checked)}
                    aria-label="Select all rows"
                    disabled={loading}
                  />
                </th>
              )}
              {columns.map((col) => (
                <th
                  key={col.key}
                  className={`${isCompact ? "px-2 py-2 text-[11px]" : "px-4 py-3 text-xs"} text-left font-medium text-gray-500 uppercase tracking-wider ${
                    sortable && !loading
                      ? "cursor-pointer hover:bg-gray-100"
                      : ""
                  }`}
                  onClick={() => !loading && handleSort(col.key)}
                >
                  <div className="flex items-center gap-2">
                    {col.label}
                    {sortable && getSortIcon(col.key)}
                  </div>
                </th>
              ))}
              {actions && (
                <th
                  className={`${isCompact ? "px-2 py-2" : "px-4 py-3"} text-right`}
                >
                  Actions
                </th>
              )}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200">
            {loading ? (
              <tr>
                <td
                  colSpan={
                    columns.length + (selectable ? 1 : 0) + (actions ? 1 : 0)
                  }
                  className="px-4 py-8 text-center text-gray-500"
                >
                  {/* Loading handled by overlay */}
                </td>
              </tr>
            ) : paginatedData.length === 0 ? (
              <tr>
                <td
                  colSpan={
                    columns.length + (selectable ? 1 : 0) + (actions ? 1 : 0)
                  }
                  className="px-4 py-8 text-center text-gray-500"
                >
                  No data available
                </td>
              </tr>
            ) : (
              paginatedData.map((row, index) => {
                const absoluteIndex = (safeCurrentPage - 1) * pageSize + index;
                const rowId = resolveRowId(row, absoluteIndex);

                return (
                  <tr
                    key={index}
                    className={`hover:bg-gray-50 ${onRowClick && !loading ? "cursor-pointer" : ""} ${loading ? "opacity-50" : ""}`}
                    onClick={() => !loading && onRowClick?.(row)}
                  >
                    {selectable && (
                      <td
                        className={`${isCompact ? "px-2 py-2" : "px-4 py-3"} w-10`}
                      >
                        <input
                          type="checkbox"
                          checked={selectedRowIdSet.has(rowId)}
                          onChange={(e) =>
                            handleRowSelection(rowId, e.target.checked)
                          }
                          onClick={(e) => e.stopPropagation()}
                          aria-label="Select row"
                          disabled={loading}
                        />
                      </td>
                    )}
                    {columns.map((col) => (
                      <td
                        key={col.key}
                        className={`${isCompact ? "px-2 py-2" : "px-4 py-3"} text-sm text-gray-900`}
                      >
                        {col.render
                          ? col.render(row[col.key], row, absoluteIndex)
                          : row[col.key]}
                      </td>
                    ))}
                    {actions && (
                      <td
                        className={`${isCompact ? "px-2 py-2" : "px-4 py-3"} text-right`}
                      >
                        <div className="flex justify-end gap-2">
                          {actions
                            .filter((action) =>
                              typeof action.show === "function"
                                ? action.show(row)
                                : action.show !== false,
                            )
                            .map((action, actionIndex) => (
                              <button
                                key={actionIndex}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  !loading && action.onClick(row);
                                }}
                                className={`${isCompact ? "px-2 py-0.5" : "px-3 py-1"} text-xs rounded ${action.className || "bg-blue-600 text-white hover:bg-blue-700"} ${loading ? "opacity-50 cursor-not-allowed" : ""}`}
                                disabled={loading}
                              >
                                {action.label}
                              </button>
                            ))}
                        </div>
                      </td>
                    )}
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {pagination && totalPages > 1 && (
        <div
          className={`${isCompact ? "px-2 py-2" : "px-4 py-3"} border-t flex items-center justify-between`}
        >
          <div className={`${isCompact ? "text-xs" : "text-sm"} text-gray-700`}>
            Showing {(safeCurrentPage - 1) * pageSize + 1} to{" "}
            {Math.min(safeCurrentPage * pageSize, sortedData.length)} of{" "}
            {sortedData.length} results
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => setCurrentPage(Math.max(safeCurrentPage - 1, 1))}
              disabled={safeCurrentPage === 1 || loading}
              className={`${isCompact ? "px-2 py-0.5 text-xs" : "px-3 py-1 text-sm"} border rounded disabled:opacity-50`}
            >
              Previous
            </button>
            <span
              className={`${isCompact ? "px-2 py-0.5 text-xs" : "px-3 py-1 text-sm"}`}
            >
              Page {safeCurrentPage} of {totalPages}
            </span>
            <button
              onClick={() =>
                setCurrentPage(Math.min(safeCurrentPage + 1, totalPages))
              }
              disabled={safeCurrentPage === totalPages || loading}
              className={`${isCompact ? "px-2 py-0.5 text-xs" : "px-3 py-1 text-sm"} border rounded disabled:opacity-50`}
            >
              Next
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default DataTable;
