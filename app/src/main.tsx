import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { App } from "./App";
import { configureAmplify } from "./shared/auth/auth-config";
import { AuthProvider } from "./shared/auth/auth-provider";
import "./styles/app.css";

// Amplify se configura UNA sola vez al boot, antes de montar el árbol.
configureAmplify();

const rootEl = document.getElementById("root");
if (!rootEl) throw new Error("Missing #root element in index.html");

createRoot(rootEl).render(
  <StrictMode>
    <BrowserRouter>
      <AuthProvider>
        <App />
      </AuthProvider>
    </BrowserRouter>
  </StrictMode>,
);
