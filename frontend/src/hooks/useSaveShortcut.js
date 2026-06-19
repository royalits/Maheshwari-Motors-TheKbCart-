import { useRegisterSaveShortcut } from "../contexts/SaveShortcutContext";

/**
 * Register a Ctrl+S save handler for the current page/component.
 * Pass `enabled = false` to temporarily disable (e.g. when form is invalid).
 */
const useSaveShortcut = (onSave, enabled = true) => {
  useRegisterSaveShortcut(enabled ? onSave : null);
};

export default useSaveShortcut;
