---
type: lab-wiki-transfer-packet
created: YYYY-MM-DD
updated: YYYY-MM-DD
local_proposal: ""
proposal_state: ready
source_experiments: []
target_wiki_pages: []
---

# Wiki Transfer Packet: <Proposal Title>

## Local Finding

Summarize the reusable finding exactly as supported by local experiments.

## Evidence Identity

| Experiment | Command / Config / Output | Validity | Scope |
| --- | --- | --- | --- |
|  |  | `valid | invalid | uncertain` |  |

## Paper Wiki Grounding

| Wiki Page | Role | Boundary |
| --- | --- | --- |
|  | `paper | method | concept | claim | evidence | synthesis` | `source fact | wiki synthesis | user insight | uncertainty` |

## Proposed Claim Ops

- target page (aggregation, e.g. `topics/<slug>`):
- op: `addClaim | reviseClaim | addEvidence | markConflict | resolveConflict | retractClaim`
- claim id / text:
- experiment evidence: `{kind: experiment, project, node}` (required for a non-human addClaim/reviseClaim)

## Boundary Mapping

- source facts:
- wiki synthesis:
- local experiment evidence:
- user insight:
- uncertainty:

## Submission Gate

- [ ] local proposal state is `ready`
- [ ] source experiments are linked and valid for the claimed scope
- [ ] Paper Wiki grounding has been retrieved or explicitly judged unnecessary
- [ ] source facts are not rewritten from local experiment evidence
- [ ] submitted through `meridian.wiki_propose` and queued for the user's review in the App (an agent never publishes a wiki page directly)
