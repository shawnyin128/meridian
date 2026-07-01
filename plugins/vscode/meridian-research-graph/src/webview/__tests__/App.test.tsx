import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { renderToString } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { App } from "../App";
import { normalizeLabGraph, type LabGraph } from "../graphTypes";

describe("App", () => {
  const consoleError = console.error;
  let root: Root | null = null;
  let container: HTMLDivElement | null = null;

  afterEach(() => {
    act(() => {
      root?.unmount();
    });
    container?.remove();
    root = null;
    container = null;
    Reflect.deleteProperty(globalThis, "acquireVsCodeApi");
    Reflect.deleteProperty(window, "matchMedia");
    vi.restoreAllMocks();
  });

  it("renders core research node details without treating artifacts as graph nodes", () => {
    vi.spyOn(console, "error").mockImplementation((message?: unknown, ...args: unknown[]) => {
      if (typeof message === "string" && message.includes("useLayoutEffect does nothing on the server")) {
        return;
      }
      consoleError(message, ...args);
    });

    const graph: LabGraph = {
      schema: "meridian.lab.graph.v1",
      generated_at: "2026-06-30T00:00:00Z",
      lab_root: ".meridian",
      source_files: [".meridian/state.md", ".meridian/threads/kv-compression.md"],
      active_thread: "kv-compression",
      active_path: ["kv-compression.A"],
      nodes: [
        {
          id: "kv-compression.A",
          thread_id: "kv-compression",
          title: "Active probe",
          kind: "research_point",
          state: "unresolved",
          active: true,
          on_active_path: true,
          markdown_path: ".meridian/threads/kv-compression.md",
          markdown_anchor: "active-probe"
        }
      ],
      edges: [],
      node_details: {
        "kv-compression.A": {
          doing: "Run a probe",
          next_action: "Collect metrics"
        }
      },
      supporting_artifacts: {
        "kv-compression.A": [
          {
            type: "experiment",
            id: "exp-04",
            title: "Scoring probe",
            impact: "supports"
          }
        ]
      },
      health: { status: "pass" }
    };

    const html = renderToString(<App graph={graph} />);
    const staticGraphNodes = html.match(/<button[^>]*class="staticGraphNode[^"]*"[\s\S]*?<\/button>/g) ?? [];

    expect(html).toContain("Active probe");
    expect(html).toContain("Scoring probe");
    expect(html).toContain("Run a probe");
    expect(html).toContain("Refresh");
    expect(html).toContain("Health Check");
    expect(html).toContain("Open Markdown");
    expect(staticGraphNodes).toHaveLength(1);
    expect(staticGraphNodes[0]).toContain("Active probe");
    expect(staticGraphNodes[0]).not.toContain("Scoring probe");
    expect(staticGraphNodes[0]).not.toContain("exp-04");
  });

  it("posts toolbar and selected-node messages to VS Code", () => {
    const postMessage = vi.fn();
    Object.defineProperty(globalThis, "acquireVsCodeApi", {
      configurable: true,
      value: () => ({ postMessage })
    });

    renderClient(<App graph={sampleGraph()} />);

    clickButton("Refresh");
    clickButton("Health Check");
    clickButton("Open Markdown");
    clickButton("Active probe");

    expect(postMessage).toHaveBeenCalledWith({ type: "refreshGraph" });
    expect(postMessage).toHaveBeenCalledWith({ type: "checkGraph" });
    expect(postMessage).toHaveBeenCalledWith({ type: "revealMarkdown" });
    expect(postMessage).toHaveBeenCalledWith({ type: "selectedNode", nodeId: "kv-compression.A" });
  });

  it("normalizes malformed graph payloads to the empty state", () => {
    expect(normalizeLabGraph({})).toBeNull();
    expect(normalizeLabGraph([])).toBeNull();

    const html = renderToString(<App graph={normalizeLabGraph({})} />);

    expect(html).toContain("No Meridian graph loaded");
  });

  function renderClient(element: React.ReactElement) {
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    Object.defineProperty(window, "matchMedia", {
      configurable: true,
      value: vi.fn().mockImplementation((query: string) => ({
        matches: false,
        media: query,
        onchange: null,
        addListener: vi.fn(),
        removeListener: vi.fn(),
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        dispatchEvent: vi.fn()
      }))
    });
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);

    act(() => {
      root?.render(element);
    });
  }

  function clickButton(label: string) {
    const button = Array.from(container?.querySelectorAll("button") ?? []).find(
      (element) => element.textContent?.includes(label)
    );
    expect(button, `button "${label}"`).toBeTruthy();

    act(() => {
      button?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
  }

  function sampleGraph(): LabGraph {
    return {
      schema: "meridian.lab.graph.v1",
      generated_at: "2026-06-30T00:00:00Z",
      lab_root: ".meridian",
      source_files: [".meridian/state.md", ".meridian/threads/kv-compression.md"],
      active_thread: "kv-compression",
      active_path: ["kv-compression.A"],
      nodes: [
        {
          id: "kv-compression.A",
          thread_id: "kv-compression",
          title: "Active probe",
          kind: "research_point",
          state: "unresolved",
          active: true,
          on_active_path: true,
          markdown_path: ".meridian/threads/kv-compression.md",
          markdown_anchor: "active-probe"
        }
      ],
      edges: [],
      node_details: {
        "kv-compression.A": {
          doing: "Run a probe",
          next_action: "Collect metrics"
        }
      },
      supporting_artifacts: {
        "kv-compression.A": [
          {
            type: "experiment",
            id: "exp-04",
            title: "Scoring probe",
            impact: "supports"
          }
        ]
      },
      health: { status: "pass" }
    };
  }
});
