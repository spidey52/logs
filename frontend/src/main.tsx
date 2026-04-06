import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import { QueryProvider } from "./providers/QueryProvider";

const el = document.getElementById("root");
if (!el) throw new Error("root missing");

createRoot(el).render(
  <StrictMode>
    <QueryProvider>
      <App />
    </QueryProvider>
  </StrictMode>,
);
