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
   - `meridian.workspace_plan` for a project/task/milestone change; with a
     `task_id` or `milestone_id` it returns only that one, and empty lists
     mean it was removed;
   - `meridian.workspace_idea` for one changed idea, with the files it holds
     (`files`: name, size and absolute path), which you can open;
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
   `meridian.lab_update` plus a `kind: complete` event. In that call, decide
   the node's state: `supported` when valid evidence supports it; when it
   needs repair or has failed, ask the user, then `repairable` or `dead`. A
   node that ends `supported` or `dead` also gets its experiment conclusion
   (Experiment conclusion in the `lab` skill).

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
found. Three calls feed it; none needs the user's confirmation.

**Research record.** Call `meridian.workspace_event_add` (or, without MCP,
`meridian workspace event-add` with `--kind`, `--text` as the
title, and `--detail`) at these
boundaries, one event each. Pass a structured `kind`, a one-line `title`
(the outcome, not a formatted sentence), and an optional `detail` for
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

**Tasks.** When you and the user settle on a clear, concrete next step, one
piece of work with a recognizable end ("rerun the width sweep at B=16", "add
the per-channel key quantizer and its unit test"), call
`meridian.workspace_task_add` once (or `meridian workspace task-add`)
with a stable `task_id`, a one-line `title`, and a `note` saying what done
means. The App puts it in the project plan at once, marked as added by an
agent; the user deletes what they do not want, so do not ask first. A general
direction or hypothesis ("prefix reuse may matter more than width", "look into
dynamic thresholds") is not a task: place it as a Lab node, or as an idea only
when it could stand alone (see Ideas). Once the App has taken the task,
`meridian.workspace_plan` lists its plan task id under `agent_tasks[<task_id>]`;
use that id to link it to its node.

**Ideas.** Record an idea only when it could stand alone as a research
contribution: a method, hypothesis or question a project of its own could start
from. An observation, result or design choice from the current work is not an
idea; record it on its Lab node or as a research record. For a new idea that is
not already a linked idea or a Lab node, call `meridian.workspace_idea_add` once
(or `meridian workspace idea-add`) with a stable `idea_id`, a `title`
of at most 80 characters that names the idea on its own, a `body` that states
it, and a `context` of at most 60 characters naming the work it came up in,
without dates, times or agent names; the App records those. Pass `node` when it
grows out of a Lab node. Do not record implementation details, TODOs, bug
notes, or restatements of an existing idea. When you write a file in the
repository for an idea, such as a proposal, call
`meridian.workspace_idea_file_add` once (or `meridian workspace
idea-file-add`) with a stable `file_id`, the idea's `idea_id` (the one you gave
`meridian.workspace_idea_add`, or an App idea id from
`meridian.workspace_changes`) and the file's `path` relative to the repository;
the App shows the file with the idea and keeps it where it is.
`meridian.workspace_idea` lists the files an idea holds under `files`, each with
its absolute `path`; read them there before writing another.

For a long-running task where App edits could invalidate the implementation,
call `meridian.workspace_changes` once more with the current cursor before
finalizing. Continue until the requested implementation and its relevant
verification are complete; stop only for a real decision boundary or blocker.
