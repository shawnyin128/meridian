import React from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import { normalizeLabGraph } from "./graphTypes";

declare global {
  interface Window {
    __MERIDIAN_GRAPH__?: unknown;
    __MERIDIAN_SELECTED_NODE_ID__?: unknown;
  }
}

const root = document.getElementById("root");
const graph = normalizeLabGraph(window.__MERIDIAN_GRAPH__ ?? null);
const selectedNodeId =
  typeof window.__MERIDIAN_SELECTED_NODE_ID__ === "string" ? window.__MERIDIAN_SELECTED_NODE_ID__ : null;

if (root) {
  createRoot(root).render(
    <React.StrictMode>
      <App graph={graph} initialSelectedNodeId={selectedNodeId} />
    </React.StrictMode>
  );
}
