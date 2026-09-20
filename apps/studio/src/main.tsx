import React from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App.js";
import { Product } from "./Product.js";
import { LegalPage } from "./Legal.js";
import "@xyflow/react/dist/style.css";
import "./style.css";
createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    {["/privacy", "/terms"].includes(location.pathname) ? (
      <LegalPage />
    ) : location.pathname === "/legacy" ? (
      <App />
    ) : (
      <Product />
    )}
  </React.StrictMode>,
);
