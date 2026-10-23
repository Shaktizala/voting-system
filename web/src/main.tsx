import type { ReactNode } from "react";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter } from "react-router-dom";
import App from "./App";
import { AuthProvider } from "./contexts/Auth";
import { ToastProvider } from "./contexts/Toast";
import { RealtimeProvider } from "./contexts/Realtime";
import "./index.css";

const qc = new QueryClient({
  defaultOptions: { queries: { retry: 1, refetchOnWindowFocus: false } },
});

const root = (
  <StrictMode>
    <QueryClientProvider client={qc}>
      <ToastProvider>
        <AuthProvider>
          <RealtimeProvider>
            <BrowserRouter>
              <App />
            </BrowserRouter>
          </RealtimeProvider>
        </AuthProvider>
      </ToastProvider>
    </QueryClientProvider>
  </StrictMode>
);

createRoot(document.getElementById("root")!).render(root as ReactNode);
