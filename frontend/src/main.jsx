import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { QueryClientProvider } from "@tanstack/react-query";
import "./index.css";
import App from "./App.jsx";
import { queryClient } from "./services/queryClient";
import { SaveShortcutProvider } from "./contexts/SaveShortcutContext";

createRoot(document.getElementById("root")).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <SaveShortcutProvider>
        <App />
      </SaveShortcutProvider>
    </QueryClientProvider>
  </StrictMode>,
);
