---
type: "method"
title: "Kraabel et al. - 2025 - StefaLand An Efficient Geoscience Foundation Model That Improves Dynamic Land-Surface Predictions"
status: "draft"
sources:
  - "[[papers/Kraabel-et-al-2025-StefaLand-An-Efficient-Geoscience-Foundation-Model-That-Improves-Dynamic-Land-Surface-Predictions|Kraabel et al. - 2025 - StefaLand An Efficient Geoscience Foundation Model That Improves Dynamic Land-Surface Predictions]]"
confidence: "medium"
review_state: "auto_extracted"
candidate_id: "method-001"
created: "2026-05-20"
updated: "2026-05-20"
aliases:
source_papers:
  - "papers/Kraabel-et-al-2025-StefaLand-An-Efficient-Geoscience-Foundation-Model-That-Improves-Dynamic-Land-Surface-Predictions.md"
related_papers:
  - "papers/Kraabel-et-al-2025-StefaLand-An-Efficient-Geoscience-Foundation-Model-That-Improves-Dynamic-Land-Surface-Predictions.md"
related_methods:
related_topics:
supports:
contradicts:
supersedes:
superseded_by:
evolution_state: "active"
revision_id: "knowledge-23e92ac199"
---
# Kraabel et al. - 2025 - StefaLand An Efficient Geoscience Foundation Model That Improves Dynamic Land-Surface Predictions

- Source paper: [[papers/Kraabel-et-al-2025-StefaLand-An-Efficient-Geoscience-Foundation-Model-That-Improves-Dynamic-Land-Surface-Predictions|Kraabel et al. - 2025 - StefaLand An Efficient Geoscience Foundation Model That Improves Dynamic Land-Surface Predictions]]
- Summary: We introduce StefaLand, a generative spatiotemporal earth foundation model centered on landscape interac- tions. The model builds on a masked autoen- coder backbone that learns deep joint representations of landscape attributes, with a location-aware architecture fusing static and time-series inputs, attribute-based rep- resentations that drastically reduce compute, and residual fine-tuning adapters that enhance transfer. Traditional hydrologic research on "prediction in ungauged basins" (PUB) have examined region- alization and spatial interpolation approaches including clustering or classifying catchments and transferring parameters from donor catchments in the same class (Hrachowitz et al., 2013; Yang et al., 2023).
- Inputs: trajectory or response pairs, human preference labels, policy rollouts
- Outputs: learned reward model, policy optimized against predicted preference reward
- Assumptions: preference labels are consistent enough for a reward model to guide policy optimization
- Provenance: p. 1; p. 4
