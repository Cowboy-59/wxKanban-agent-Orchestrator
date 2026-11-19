import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "./styles/index.css";
// @ts-expect-error Vite ESM import (no .ts extension needed)
import { applyTheme, initializeTheme } from "./lib/themePreference";
import { I18nProvider } from "./i18n"; // [SCOPE 051] localization framework
import { captureError } from "./lib/errorCapture"; // [SCOPE 061] auto error capture

applyTheme(initializeTheme());

// [SCOPE 061] BEGIN — global error/rejection capture (fail-open, must not break startup)
try {
  window.addEventListener("error", (e) =>
    captureError({
      kind: "windowError",
      name: e.error?.name || "Error",
      message: e.message || String(e.error),
      stack: e.error?.stack,
    }),
  );
  window.addEventListener("unhandledrejection", (e) => {
    const r = e.reason;
    captureError({
      kind: "unhandledRejection",
      name: r?.name || "UnhandledRejection",
      message: r?.message || String(r),
      stack: r?.stack,
    });
  });
} catch {
  // Telemetry registration must never block bootstrap.
}
// [SCOPE 061] END

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <I18nProvider>
      <App />
    </I18nProvider>
  </React.StrictMode>,
);
