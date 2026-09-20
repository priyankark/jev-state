import React, { lazy, Suspense } from "react";
import { createRoot } from "react-dom/client";
const App = lazy(() => import("./App.js").then((m) => ({ default: m.App })));
const Product = lazy(() =>
  import("./Product.js").then((m) => ({ default: m.Product })),
);
const LegalPage = lazy(() =>
  import("./Legal.js").then((m) => ({ default: m.LegalPage })),
);
import "@xyflow/react/dist/style.css";
import "./style.css";
createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <Suspense
      fallback={
        <div className="p-loading" role="status">
          Opening Jev State…
        </div>
      }
    >
      {["/privacy", "/terms"].includes(location.pathname) ? (
        <LegalPage />
      ) : location.pathname === "/legacy" ? (
        <App />
      ) : (
        <Product />
      )}
    </Suspense>
  </React.StrictMode>,
);
