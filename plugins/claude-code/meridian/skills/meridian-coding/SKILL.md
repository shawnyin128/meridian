---
name: meridian-coding
description: Use when implementing, debugging, or testing code in a repository connected to a Meridian project. Read the incremental Meridian change cursor first, then expand only relevant project, idea, or Lab-node context.
---

# Meridian Coding Context

Use Meridian as a small pre-coding context layer, not as a replacement for the
normal coding workflow. The goal is to notice user and research-state changes
without rereading the whole project, graph, or Paper Wiki.

## Default path

When the repository has `.meridian/` and Meridian MCP is available:

1. Call `meridian.workspace_changes` with the last `next_cursor` held in the
   current task. Omit `cursor` only when this task has no prior cursor.
2. Compare the returned change summaries with the coding request.
3. Follow only relevant `expand` entries:
   - `meridian.workspace_plan` for a project/task/milestone change;
   - `meridian.workspace_idea` for one changed idea;
   - `meridian.lab_node` for one referenced research node.
4. Keep the new `next_cursor` in task context for the next check.
5. When the work is for a Lab node, make that node the active path before the
   first real step, as described in Keeping the graph current in the `lab`
   skill: the user's instruction to work on it is the confirmation. When it is
   for a planned task, first link the task to its node (Tasks in the same
   section).
6. Implement and verify the requested code through the normal coding workflow.
7. Before finishing, or before moving to another node, put the node's result
   into Lab: `meridian.lab_result` for an experiment (pass `experiment` to
   write a new record), otherwise `doing` and `next_action` through
   `meridian.lab_update` plus a `kind: complete` event. A node that ends
   `supported` or `dead` also gets its conclusion (Conclusion in the `lab`
   skill).

Do not call `meridian.lab_graph`, reread every idea, or retrieve the whole Paper
Wiki unless the task actually requires discovery beyond the referenced entities.

## Cursor states

- `ok`: consume only returned changes.
- `initialized`: this is a bounded recent baseline; expand only relevant items.
- `reset_required`: treat the returned page as a fresh bounded baseline. Do not
  reconstruct discarded history unless the user asks for an audit.
- `unavailable`: use `meridian.workspace_plan` once as the compatibility
  fallback. Continue without inventing a cursor.

The cursor is client state. Do not create or edit a repository cursor file, and
do not edit `.meridian/control/changes.json`.

## Boundaries

- App-owned plan, changes, and linked ideas are read-only to the coding agent.
- Lab Markdown remains authoritative for research nodes and experiment evidence.
- Use `lab` before coding when the request still needs research placement,
  feasibility review, or a Research Grounding Injection.
- Use `wiki` only when implementation depends on paper knowledge not already in
  the selected idea/node context.
- After code or an experiment completes, use the Return Signal from the Lab
  injection when one exists. Do not manufacture Lab evidence for ordinary
  mechanical changes.

## Keeping the App informed

The Meridian App shows the user what the agent has been doing and what it
found. Two calls feed it; neither needs the user's confirmation.

**Research record.** Call `meridian.workspace_event_add` (or, without MCP,
`python -m meridian workspace event-add` with `--kind`, `--text` as the
title, and `--detail`) at these
boundaries, one event each. Pass a structured `kind`, a one-line `title`
(the conclusion, not a formatted sentence), and an optional `detail` for
key numbers or parameters — do not fold the boundary's verb into the title
text:

- work starts on a target: the first real step toward a research node, a
  linked idea, or a planned task (reading its context, writing code for it,
  running it). `kind: start`, title: `<target>`.
- the target changes: work moves to a different node, idea or task, or the
  conversation turns to a topic other than the current target. `kind: note`,
  title: `转向 <new target>：<one-line reason>`.
- the target lands: after an experiment use `meridian.lab_result` instead;
  for other finished work, `kind: complete`, title: `<target>：<one-line outcome>`.

Do not add an event for steps inside the same target. Use a stable `event_id`
such as `<date>-start-<target-slug>`. `source` must be an existing file that
anchors the target: the node's thread file under `.meridian/threads/`, the
experiment record, or the main file being changed. Pass `node` when the target
is a Lab node.

**Ideas.** When the discussion produces a new research direction, hypothesis
or mechanism worth revisiting later, and it is not already a linked idea or a
Lab node, call `meridian.workspace_idea_add` once (or
`python -m meridian workspace idea-add`) with a stable `idea_id`, a one-line `title`, a
`body` that states the idea itself, and a `context` naming the work it came up
in. Pass `node` when it grows out of a Lab node. The App adds it to the
project's idea list marked as coming from a coding agent. Do not record
implementation details, TODOs, bug notes, or restatements of an existing idea.

For a long-running task where App edits could invalidate the implementation,
call `meridian.workspace_changes` once more with the current cursor before
finalizing. Continue until the requested implementation and its relevant
verification are complete; stop only for a real decision boundary or blocker.
