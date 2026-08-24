import { useEffect } from "react";

/**
 * Ctrl+S  — trigger "Save" action (works in inputs too)
 * Ctrl+A  — trigger "Add" button (open add modal)
 * Ctrl+B  — trigger "Convert to Bill" (challan list)
 * Ctrl+R  — refresh current page data
 * Ctrl+Shift+R / Ctrl+Shift+C — reset filters
 */
const useKeyboardShortcuts = ({
  onSave,
  onAdd,
  onConvertToBill,
  onRefresh,
  onResetFilters,
  enabled = true,
} = {}) => {
  useEffect(() => {
    if (!enabled) return;

    const handleKeyDown = (e) => {
      if (!e.ctrlKey && !e.metaKey) return;

      const tag = e.target.tagName;
      const isInput = tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT";

      const key = e.key ? e.key.toLowerCase() : "";
      const isSKey = key === "s" || e.code === "KeyS" || e.keyCode === 83;
      const shift = e.shiftKey;

      // Ctrl+S — Save (works everywhere including inside inputs)
      if (isSKey && !shift && onSave) {
        e.preventDefault();
        e.stopPropagation();
        onSave(e);
        return;
      }

      // Ctrl+A — Add (skip if inside input)
      if (key === "a" && !shift && !isInput && onAdd) {
        e.preventDefault();
        onAdd();
        return;
      }

      // Ctrl+Shift+B — Convert to Bill
      if (key === "b" && shift && onConvertToBill) {
        e.preventDefault();
        onConvertToBill();
        return;
      }

      // Ctrl+R — Refresh (fallback to page reload if no handler)
      if (key === "r" && !shift) {
        e.preventDefault();
        if (onRefresh) onRefresh();
        else window.location.reload();
        return;
      }

      // Ctrl+Shift+R or Ctrl+Shift+C — Reset Filters
      if (shift && (key === "r" || key === "c") && onResetFilters) {
        e.preventDefault();
        onResetFilters();
        return;
      }
    };

    window.addEventListener("keydown", handleKeyDown, true);
    return () => window.removeEventListener("keydown", handleKeyDown, true);
  }, [enabled, onSave, onAdd, onConvertToBill, onRefresh, onResetFilters]);
};

export default useKeyboardShortcuts;
