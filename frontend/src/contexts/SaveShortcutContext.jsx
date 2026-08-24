import { createContext, useContext, useRef, useEffect } from "react";

const SaveShortcutContext = createContext(null);

export const SaveShortcutProvider = ({ children }) => {
  const handlerRef = useRef(null);

  useEffect(() => {
    const handleKeyDown = async (e) => {
      const isSKey =
        e.key === "s" ||
        e.key === "S" ||
        e.code === "KeyS" ||
        e.keyCode === 83;

      if ((e.ctrlKey || e.metaKey) && isSKey) {
        e.preventDefault();
        e.stopPropagation();
        if (typeof handlerRef.current === "function") {
          try {
            await handlerRef.current(e);
          } catch (err) {
            console.error("Save shortcut execution error:", err);
          }
        }
      }
    };

    window.addEventListener("keydown", handleKeyDown, true);
    return () => window.removeEventListener("keydown", handleKeyDown, true);
  }, []);

  return (
    <SaveShortcutContext.Provider value={handlerRef}>
      {children}
    </SaveShortcutContext.Provider>
  );
};

export const useRegisterSaveShortcut = (handler) => {
  const handlerRef = useContext(SaveShortcutContext);

  useEffect(() => {
    if (!handlerRef) return;
    if (typeof handler === "function") {
      handlerRef.current = handler;
    }
    return () => {
      if (handlerRef.current === handler) {
        handlerRef.current = null;
      }
    };
  }, [handler, handlerRef]);
};
