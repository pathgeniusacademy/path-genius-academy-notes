import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { Toaster } from "react-hot-toast";
import App from "./App";
import { AuthProvider } from "@/context/AuthContext";
import "./styles.css";
import { CANONICAL_MAIN_SITE_URL } from "@/lib/config";

const mounted = /^\/notes(?:\/|$)/.test(window.location.pathname);
const canonical = new URL(CANONICAL_MAIN_SITE_URL);
// Old standalone Notes links converge on the one login origin. No credentials
// are transferred through URLs, native bridges or third-party cookies.
if (!import.meta.env.DEV && window.location.origin !== canonical.origin) {
  const path = mounted ? window.location.pathname : `/notes${window.location.pathname}`;
  window.location.replace(`${canonical.origin}${path}${window.location.search}`);
} else {
ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <BrowserRouter basename={mounted ? "/notes" : "/"}>
      <AuthProvider>
        <App />
        <Toaster position="top-center" />
      </AuthProvider>
    </BrowserRouter>
  </React.StrictMode>
);

}
