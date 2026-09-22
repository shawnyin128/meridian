# Core domains

Core is organized by complete product capabilities rather than by technical utility type.

- A capability with its own orchestration, rules, providers, fixtures, and tests lives in one named
  subfolder.
- Other domains import it through that folder's `index.ts`; internal provider and scoring files are
  not cross-domain APIs.
- Renderer code calls Core contracts. It never calls a domain provider or writes the vault.
- The owning domain may depend on the narrow `VaultStore` interface, while only Core store
  implementations perform durable writes.
- Shared code is limited to genuinely cross-domain contracts and primitives. Similar-looking logic
  is not copied into route or store files.

Current capability domains:

- `recommendation/`: project-seeded discovery, provider adapters, ranking, feedback, and evaluation.
- `project-management/`: project pages, relations, research graphs, and workspace synchronization.
- `paper-library/`: PDF admission, metadata, paper pages, table/query rules, and reading state.
- `wiki/`: canonical Wiki models, reads, generated regions, proposal application, and page writes.
- `harness/`: one-shot user authorization, immutable run scopes, and the only Core boundary allowed
  to start cost-bearing model work.

Each domain exposes only `index.ts` across domain boundaries. ESLint rejects imports of a domain's
internal files from the rest of the application.
