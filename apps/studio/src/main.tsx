import React from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App.js";
import { Product } from "./Product.js";
import "@xyflow/react/dist/style.css";
import "./style.css";
createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    {location.pathname === "/legacy" ? <App /> : <Product />}
  </React.StrictMode>,
);
