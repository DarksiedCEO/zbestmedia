import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AuthGate } from "./auth/AuthGate";
import { enableMocking } from "./mocks/enable";
import App from "./routes/App";
import { RuntimeProvider } from "./state/runtime";

const qc = new QueryClient();

async function bootstrap() {
  await enableMocking();

  ReactDOM.createRoot(document.getElementById("root")!).render(
    <React.StrictMode>
      <QueryClientProvider client={qc}>
        <RuntimeProvider>
          <AuthGate>
            <BrowserRouter>
              <App />
            </BrowserRouter>
          </AuthGate>
        </RuntimeProvider>
      </QueryClientProvider>
    </React.StrictMode>,
  );
}

void bootstrap();
