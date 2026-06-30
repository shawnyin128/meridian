import React from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import type { LabGraph } from "./graphTypes";

declare global {
  interface Window {
    __MERIDIAN_GRAPH__?: LabGraph | null;
  }
}

const root = document.getElementById("root");

if (root) {
  createRoot(root).render(
    <React.StrictMode>
      <App graph={window.__MERIDIAN_GRAPH__ ?? null} />
    </React.StrictMode>
  );
}
