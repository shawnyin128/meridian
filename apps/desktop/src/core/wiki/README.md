# Wiki Core

This domain owns the desktop projection of the compiled Paper Wiki: canonical page models, reads,
proposal application, generated regions, and line-preserving page writes.

Raw sources are never mutated here. Durable Wiki changes remain proposal-driven and auditable, and
line-level page edits preserve user-owned Markdown. Other Core domains import Wiki behavior through
`index.ts`; vault primitives provide atomic filesystem operations but do not own Wiki semantics.
