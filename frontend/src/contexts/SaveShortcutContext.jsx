import { createContext, useContext, useRef, useEffect } from "react";

const SaveShortcutContext = createContext(null);

export const SaveShortcutProvider = ({ children }) => {
  const handlerRef = useRef(null);

  useEffect(() => {
    const handleKeyDown = async (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "s") {
        e.preventDefault();
        if (typeof handlerRef.current === "function") {
          await handlerRef.current();
        }
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
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
    handlerRef.current = typeof handler === "function" ? handler : null;
    return () => {
      handlerRef.current = null;
    };
  }, [handler, handlerRef]);
};
