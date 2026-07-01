import React from "react";
import { renderToString } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { App } from "../App";
import { normalizeLabGraph, type LabGraph } from "../graphTypes";

describe("App", () => {
  const consoleError = console.error;

  afterEach(() => {
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
    expect(staticGraphNodes).toHaveLength(1);
    expect(staticGraphNodes[0]).toContain("Active probe");
    expect(staticGraphNodes[0]).not.toContain("Scoring probe");
    expect(staticGraphNodes[0]).not.toContain("exp-04");
  });

  it("normalizes malformed graph payloads to the empty state", () => {
    expect(normalizeLabGraph({})).toBeNull();
    expect(normalizeLabGraph([])).toBeNull();

    const html = renderToString(<App graph={normalizeLabGraph({})} />);

    expect(html).toContain("No Meridian graph loaded");
  });
});
