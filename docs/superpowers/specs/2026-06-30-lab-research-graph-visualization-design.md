---
type: design
title: "Lab Research Graph Storage and VS Code Visualization Design"
status: draft
created: 2026-06-30
updated: 2026-06-30
tags:
  - lab
  - research-graph
  - vscode
  - visualization
confidence: high
---

# Lab Research Graph Storage and VS Code Visualization Design

## Problem

Meridian Lab currently stores research state in `.meridian/` Markdown files:

```text
.meridian/state.md
.meridian/threads/index.md
.meridian/threads/<thread>.md
.meridian/experiments/<experiment>.md
.meridian/proposals/<proposal>.md
```

This keeps the workflow auditable and human-readable, but two product gaps are
showing up in real use:

1. Research graph updates are not timely or structured enough. Agents can edit
   Markdown in ways that look reasonable but fail to preserve a crisp graph
   mutation, active path, evidence attachment, or node state transition.
2. There is no visual surface for understanding the current research path.
   Users must read Markdown files to recover active directions, dead paths,
   repairable nodes, and local findings.

The desired behavior is a stricter graph update path plus a read-only VS Code
viewer that renders the current research graph in real time.

## Goals

- Keep `.meridian/threads/*.md` as the human-readable research control plane.
- Add a generated JSON graph view for tooling and visualization.
- Require strict structured updates for Lab state changes.
- Render only core research points as graph nodes.
- Keep experiments, papers, implementation links, and wiki priors as supporting
  artifacts attached to research points, not first-class graph nodes.
- Make the VS Code extension read-only in the first version.
- Route all graph writes through Meridian core helpers.
- Add health checks for stale, malformed, or inconsistent graph state.
- Preserve the lightweight Markdown-first Lab boundary.

## Non-Goals

- Do not make VS Code a graph editor in the first version.
- Do not let the extension write `.meridian/` files directly.
- Do not replace Markdown files with a database.
- Do not make experiments or papers default graph nodes.
- Do not add a daemon as a required runtime dependency.
- Do not make Lab a coding workflow, MCP product surface, or project manager.
- Do not solve every graph layout problem before seeing real usage data.

## Recommended Architecture

Use a hybrid Markdown control plane plus generated graph layer:

```text
Lab skill
  -> strict update packet
  -> meridian lab helper
       -> validate packet
       -> update .meridian Markdown control files
       -> materialize .meridian/graph/graph.json
       -> run graph health checks
  -> VS Code extension watches graph.json read-only
```

`threads/*.md` remains the durable place for reasoning, user decisions, active
node descriptions, and research history. `graph.json` is a generated view model
for tools. The VS Code extension consumes only the generated JSON graph and
links back to the Markdown source for audit.

The main protocol is strict update packets. A Markdown resync command remains
available as a repair path so existing `.meridian/` projects can migrate and so
`graph.json` can be rebuilt when generated state is stale.

## File Layout

Add generated graph files under `.meridian/graph/`:

```text
.meridian/
  graph/
    graph.json
    graph-health.json
    graph.schema.json
```

`graph.json` is the extension-facing view model. `graph-health.json` is the
latest deterministic health summary. `graph.schema.json` documents the JSON
contract for external inspection and tests.

These files are generated artifacts. Agents and the VS Code extension must not
hand-edit them. If `graph.json` disagrees with Markdown, the repair path is to
run the Meridian refresh/materialize command, not to patch JSON manually.

## Graph JSON Model

`graph.json` should have a stable, explicit schema:

```json
{
  "schema": "meridian.lab.graph.v1",
  "generated_at": "2026-06-30T00:00:00Z",
  "lab_root": ".meridian",
  "source_files": [],
  "active_thread": "kv-compression",
  "active_path": ["idea-seed", "repair-scoring", "active-probe"],
  "nodes": [],
  "edges": [],
  "node_details": {},
  "supporting_artifacts": {},
  "health": {}
}
```

### Nodes

Nodes represent core research points only:

- idea seed
- research direction
- approach point
- repair point
- blocked/dead path
- active probe point
- local reusable finding point

Example:

```json
{
  "id": "kv-compression.active-probe",
  "thread_id": "kv-compression",
  "title": "Active probe",
  "kind": "research_point",
  "state": "unresolved",
  "active": true,
  "on_active_path": true,
  "markdown_path": ".meridian/threads/kv-compression.md",
  "markdown_anchor": "active-probe",
  "updated": "2026-06-30"
}
```

Allowed node states follow the Lab state model where applicable:

- `unresolved`
- `repairable`
- `supported`
- `dead`

The graph model may add display-only state flags such as `active`,
`on_active_path`, `stale`, or `needs_attention`, but those flags must be derived
from Markdown and update packets.

### Edges

Edges connect research points, not supporting artifacts:

- `continues`
- `branches_from`
- `related_to`
- `blocks`
- `supersedes`
- `contradicts`
- `supports_direction`

Edges should carry display strength:

```json
{
  "id": "edge.repair-scoring.active-probe",
  "source": "kv-compression.repair-scoring",
  "target": "kv-compression.active-probe",
  "kind": "continues",
  "strength": "strong",
  "on_active_path": true
}
```

### Node Details

`node_details` stores compact content for the read-only detail panel:

```json
{
  "kv-compression.active-probe": {
    "doing": "Run a focused probe on amortized KV scoring.",
    "why": "Repair scoring is plausible but not yet supported.",
    "next_action": "Implement one linear probe script and return metric/output identity.",
    "research_prior": {
      "status": "checked",
      "summary": "Paper Wiki grounding found relevant KV eviction and compression priors."
    },
    "return_signal": {
      "command": "",
      "metric": "",
      "validity_criteria": ""
    }
  }
}
```

### Supporting Artifacts

Artifacts are attached to research points and shown in the detail panel:

- experiments
- Paper Wiki pages
- paper implementation links
- code references
- local finding proposals
- Research Grounding Injections

They are not default graph nodes.

Example:

```json
{
  "kv-compression.active-probe": [
    {
      "type": "experiment",
      "id": "exp-04",
      "title": "Scoring sanity check",
      "validity": "valid",
      "impact": "supports",
      "path": ".meridian/experiments/exp-04.md"
    },
    {
      "type": "wiki_prior",
      "id": "paper-wiki:kv-eviction-prior",
      "title": "KV eviction prior packet",
      "trust_state": "source_verified"
    }
  ]
}
```

## Strict Update Packet

Lab state changes should be expressed as strict packets before being applied.

Example:

```json
{
  "schema": "meridian.lab.update.v1",
  "intent": "record_experiment_result",
  "target_thread": "kv-compression",
  "changes": [
    {
      "op": "update_node",
      "node_id": "kv-compression.repair-scoring",
      "fields": {
        "state": "repairable",
        "next_action": "Run amortized scoring probe"
      }
    },
    {
      "op": "attach_artifact",
      "node_id": "kv-compression.repair-scoring",
      "artifact": {
        "type": "experiment",
        "id": "exp-04",
        "validity": "valid",
        "impact": "supports"
      }
    }
  ],
  "user_confirmation": {
    "required_for": ["state:repairable"],
    "status": "accepted"
  }
}
```

Supported operations for the first version:

- `create_node`
- `update_node`
- `create_edge`
- `update_edge`
- `attach_artifact`
- `detach_artifact`
- `set_active_thread`
- `set_active_path`
- `record_history`

The helper must validate:

- schema version
- target thread existence
- node ID format and uniqueness
- edge endpoint existence
- allowed node state
- allowed edge kind
- allowed artifact type
- user-confirmation requirements for boundary-changing moves
- no unsupported direct mutation of generated files

If validation fails, no files are written.

## CLI And Core Helpers

Add Lab graph commands under the existing `meridian` CLI without making Lab a
separate product daemon:

```text
python -m meridian lab graph-refresh --lab-root <repo>
python -m meridian lab graph-check --lab-root <repo>
python -m meridian lab apply-update <packet.json> --lab-root <repo>
python -m meridian lab export-graph --lab-root <repo> --json-out <path>
```

Command behavior:

- `graph-refresh`: parse Markdown control files and materialize `graph.json`.
- `graph-check`: validate Markdown, generated graph consistency, active path,
  dangling edges, missing anchors, missing artifact targets, and stale
  generated timestamps.
- `apply-update`: validate a strict packet, update Markdown control files,
  refresh `graph.json`, write `graph-health.json`, and print a concise result.
- `export-graph`: write graph JSON to a requested path for tools/tests.

`framework-check --lab-root <repo>` should include graph health once a graph
layer exists.

## VS Code Extension

The first extension is a read-only local viewer.

### Features

- Detect `.meridian/graph/graph.json` in the workspace.
- Watch `graph.json` and refresh the webview when it changes.
- Render a two-pane layout:
  - left: research graph canvas
  - right: selected research point details
- Show only core research points as graph nodes.
- Highlight active path with a clear color.
- Use stable spatial graph layout rather than a strict left-to-right tree.
- Clicking a node updates the right detail panel.
- Detail panel shows:
  - doing
  - why
  - state
  - next action
  - Research Prior summary
  - supporting experiments
  - Paper Wiki grounding
  - implementation/code links
  - Markdown source link
- Provide commands:
  - `Meridian: Open Research Graph`
  - `Meridian: Refresh Research Graph`
  - `Meridian: Run Research Graph Health Check`
  - `Meridian: Reveal Selected Node Markdown`

### UI Toolkit

Use React plus Ant Design for the webview UI. Ant Design is a good fit for a
dense research workbench because the first version needs reliable tabs, tags,
lists, descriptions, buttons, empty states, and alerts more than a bespoke
visual style.

Use a graph rendering library rather than hand-drawn SVG for the real
implementation. The first design should prefer a stable layout and explicit
position persistence over a fully dynamic force layout that rearranges every
refresh.

Candidate graph renderers:

- React Flow for interactive node/edge canvas and detail integration.
- Cytoscape.js for graph layout algorithms and larger graph support.

The implementation plan should choose one after checking extension bundling
size and layout needs. The design preference is stable spatial graph layout:
positions should change slowly, and active path should remain visually
traceable.

### Read-Only Boundary

The extension must not create, edit, delete, or mutate Lab graph state in the
first version. It may call Meridian commands to refresh or check generated
state, but all writes are performed by Meridian core helpers.

## Layout Direction

The default graph should be a two-dimensional spatial graph, not a tree and not
a left-to-right process diagram.

Initial layout rules:

- Active path receives color and edge emphasis.
- Core research points are positioned in a stable space.
- Newly discovered or weakly related nodes appear near their strongest related
  research point.
- Dead, repairable, supported, and unresolved states use distinct but restrained
  visual treatment.
- Layout should avoid excessive movement between refreshes.
- If positions are absent, use deterministic initial placement based on active
  path, relation strength, and stable node IDs.
- Later versions may persist manual positions in generated graph metadata only
  if the write path still goes through Meridian.

## Health Checks

Graph health should report:

- missing `.meridian/graph/graph.json`
- graph schema mismatch
- stale graph generated before source Markdown changed
- dangling edge endpoint
- missing node detail for a rendered node
- artifact target path missing
- invalid active path node
- active path edge not present
- node state outside allowed set
- generated graph manually edited or not reproducible from source
- Markdown anchor missing for node

Health findings should be machine-readable and concise enough for VS Code to
show in an alert or health panel.

## Migration

Existing `.meridian/` projects should migrate without destructive rewrites:

1. Run `graph-refresh`.
2. Parse current thread Markdown using existing Lab state conventions.
3. Generate graph IDs from thread slug and node headings.
4. Attach experiments and proposals where current templates provide links.
5. Emit warnings for ambiguous nodes, missing anchors, or artifacts that cannot
   be attached.
6. Leave source Markdown unchanged unless the user applies a strict update
   packet later.

The first migration may produce a partial graph with health warnings. That is
acceptable if the warnings are explicit and repairable.

## Skill And Documentation Updates

Update the Lab skill so agents know:

- graph state changes require strict update packets
- generated graph files are not hand-edited
- VS Code is read-only
- experiments and papers support research points instead of becoming default
  graph nodes
- boundary-changing node moves still require user confirmation
- graph health failures should be reported before relying on visual state

Update README Lab documentation with:

- graph refresh/check commands
- VS Code extension overview
- read-only boundary
- generated artifact layout

## Testing Strategy

### Unit Tests

- Parse thread Markdown into research graph nodes.
- Validate strict update packets.
- Reject invalid node states, dangling edges, and missing confirmations.
- Apply a valid update packet and update Markdown deterministically.
- Materialize `graph.json` from Markdown.
- Detect stale graph JSON after Markdown changes.
- Detect missing artifact target paths.
- Preserve generated-file boundaries.

### CLI Tests

- `graph-refresh` creates `.meridian/graph/graph.json`.
- `graph-check` passes on a valid fixture.
- `graph-check` fails with dangling edges or invalid active path.
- `apply-update` writes Markdown and graph JSON on valid packet.
- `apply-update` writes nothing on invalid packet.
- `framework-check --lab-root` includes graph health.

### Extension Tests

- Webview loads a fixture `graph.json`.
- Graph shows only core research nodes.
- Supporting experiments and wiki priors appear in detail panel, not as graph
  nodes.
- Active path receives distinct styling.
- Clicking a node updates the detail panel.
- Refresh command invokes Meridian refresh.
- Health command displays graph health findings.

### Real Scenario Tests

Use real Codex prompts in temporary Lab repos for release confidence:

- New idea creates a research point and refreshes graph JSON.
- Continuing a direction finds the active research point.
- Recording an experiment attaches evidence under a research point.
- Marking a path repairable requires confirmation and then updates graph state.
- A completed local finding appears as a core research point while its
  experiments remain supporting artifacts.
- A coding handoff produces a Research Grounding Injection and expected return
  signal without editing graph JSON directly.
- Negative case: pure mechanical coding does not mutate the research graph.
- Negative case: extension/viewer prompt does not write graph state.

Eval-only rationale can remain in the test harness for diagnosing routing and
update decisions. Normal Lab skill output should not expose debug rationale by
default.

## Acceptance Criteria

- Existing Lab repos can generate a graph JSON view without losing Markdown
  state.
- Lab state changes can be represented as strict update packets.
- Invalid update packets do not write files.
- `graph.json` is generated, reproducible, and read-only to tools.
- Graph health catches stale, dangling, or malformed graph state.
- VS Code extension renders a read-only research graph from `graph.json`.
- The graph shows only core research points.
- Experiments, papers, wiki priors, and code links appear as supporting details.
- Active path is visually clear.
- Clicking a graph node updates a right-side detail panel.
- All graph writes go through Meridian core helpers.
- Tests include unit, CLI, extension, and real Codex scenario coverage.

## Rollout

Target release family: Meridian 0.8.x.

Suggested implementation slices:

1. Graph schema and materializer from existing Markdown.
2. Graph health checks and CLI refresh/check commands.
3. Strict update packet validator and apply command.
4. Lab skill and README updates.
5. Read-only VS Code extension skeleton with fixture graph rendering.
6. Extension integration with real `graph.json`, refresh, health, and Markdown
   reveal commands.
7. Real Codex scenario tests for graph update behavior.

The first shipped version should prefer correctness and stable read-only
inspection over rich editing or perfect layout. Layout can improve after real
graphs expose density, clustering, and active-path readability problems.
