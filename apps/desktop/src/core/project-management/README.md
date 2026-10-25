# Project management Core

This domain owns project-page serialization, project/paper relationships, research-graph layout and
overview projections, local/SSH workspace synchronization, and browsing an SSH host's folders to bind one.

Other Core domains import project behavior through `index.ts`. The folder does not own Paper Wiki
pages: a project may reference Wiki pages, but canonical Wiki mutation remains in the Wiki domain.
