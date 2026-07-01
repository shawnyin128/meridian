import React from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import { normalizeLabGraph } from "./graphTypes";

declare global {
  interface Window {
    __MERIDIAN_GRAPH__?: unknown;
  }
}

const root = document.getElementById("root");
const graph = normalizeLabGraph(window.__MERIDIAN_GRAPH__ ?? null);

if (root) {
  createRoot(root).render(
    <React.StrictMode>
      <App graph={graph} />
    </React.StrictMode>
  );
}
