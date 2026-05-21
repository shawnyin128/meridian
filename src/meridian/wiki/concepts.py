from __future__ import annotations

import hashlib
import json
import re
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from meridian.wiki.corpus import build_knowledge_catalogs, build_paper_catalog, build_synthesis_catalog, parse_frontmatter, split_sections, strip_frontmatter
from meridian.wiki.vault import append_wiki_log, init_wiki_vault, rebuild_wiki_index, slugify


CONCEPT_AUDIT_SCHEMA_VERSION = "meridian.concept_audit.v1"
CONCEPT_PROPOSAL_SCHEMA_VERSION = "meridian.concept_layer_proposal.v1"
CONCEPT_LINT_SCHEMA_VERSION = "meridian.concept_layer_lint.v1"
CONCEPT_PUBLISH_SCHEMA_VERSION = "meridian.concept_layer_publish.v1"

CONCEPT_SECTIONS = (
    "What It Is",
    "Why It Matters",
    "Where It Appears",
    "Used By Methods",
    "Implementation Implications",
    "Common Failure Modes",
    "Minimal Checks / Probes",
    "Evidence / Provenance",
    "Related Concepts",
    "Open Questions",
    "Retrieval Hooks",
)


@dataclass(frozen=True)
class ConceptAuditResult:
    report_path: Path
    brief_path: Path
    status: str
    metrics: dict[str, Any]
    findings: list[dict[str, Any]]


@dataclass(frozen=True)
class ConceptLayerProposalResult:
    proposal_dir: Path
    proposal_path: Path
    manifest_path: Path
    publish_plan_path: Path
    candidate_count: int
    proposed_count: int


@dataclass(frozen=True)
class ConceptLayerLintResult:
    report_path: Path
    status: str
    findings: list[dict[str, Any]]


@dataclass(frozen=True)
class PublishConceptLayerResult:
    manifest_path: Path
    lint_report_path: Path
    concepts_created: int
    backlinks_added: int
    skipped_actions: int
    index_path: Path
    log_path: Path


def run_concept_audit(*, wiki_root: Path, out_path: Path | None = None, brief_path: Path | None = None) -> ConceptAuditResult:
    init_wiki_vault(wiki_root=wiki_root)
    pages = _load_pages(wiki_root)
    concept_pages = [page for page in pages if page["directory"] == "concepts"]
    method_pages = [page for page in pages if page["directory"] == "methods"]
    topic_pages = [page for page in pages if page["directory"] == "topics"]
    findings: list[dict[str, Any]] = []

    missing_source_papers = []
    missing_related_methods = []
    missing_implementation = []
    missing_checks = []
    low_information = []
    source_quality_contamination = []

    for page in concept_pages:
        fm = page["frontmatter"]
        sections = page["sections"]
        missing_sections = [section for section in CONCEPT_SECTIONS if section not in sections]
        if missing_sections:
            findings.append(_finding("warn", "concept_missing_sections", page["relative_path"], missing=missing_sections))
        if not _as_list(fm.get("source_papers")):
            missing_source_papers.append(page["relative_path"])
            findings.append(_finding("warn", "concept_missing_source_papers", page["relative_path"]))
        if not (_as_list(fm.get("related_methods")) or _as_list(fm.get("prerequisite_for"))):
            missing_related_methods.append(page["relative_path"])
            findings.append(_finding("warn", "concept_missing_method_links", page["relative_path"]))
        if len(sections.get("Implementation Implications", "").strip()) < 80:
            missing_implementation.append(page["relative_path"])
            findings.append(_finding("warn", "concept_missing_implementation_implications", page["relative_path"]))
        if len(sections.get("Minimal Checks / Probes", "").strip()) < 80:
            missing_checks.append(page["relative_path"])
            findings.append(_finding("warn", "concept_missing_minimal_checks", page["relative_path"]))
        if _is_low_information_concept(page):
            low_information.append(page["relative_path"])
            findings.append(_finding("warn", "low_information_concept_stub", page["relative_path"]))
        if _uses_source_quality_hold_as_evidence(page):
            source_quality_contamination.append(page["relative_path"])
            findings.append(_finding("error", "source_quality_hold_as_concept_evidence", page["relative_path"]))

    method_missing_prereqs = [
        page["relative_path"]
        for page in method_pages
        if "Prerequisite Concepts" not in page["sections"] and not _as_list(page["frontmatter"].get("prerequisite_concepts"))
    ]
    for relative in method_missing_prereqs[:50]:
        findings.append(_finding("info", "method_missing_prerequisite_concepts", relative))

    topic_missing_key_concepts = [
        page["relative_path"]
        for page in topic_pages
        if "Key Concepts" not in page["sections"] and not _as_list(page["frontmatter"].get("key_concepts"))
    ]
    for relative in topic_missing_key_concepts[:50]:
        findings.append(_finding("info", "topic_missing_key_concepts", relative))

    candidates = _concept_candidates(wiki_root=wiki_root, pages=pages)
    unpromoted = [candidate for candidate in candidates if not (wiki_root / "concepts" / f"{candidate['slug']}.md").exists()]
    for candidate in unpromoted[:50]:
        findings.append(
            _finding(
                "info",
                "recurring_concept_not_promoted",
                f"concepts/{candidate['slug']}.md",
                title=candidate["title"],
                source_papers=len(candidate["source_papers"]),
            )
        )

    duplicates = _duplicate_alias_groups(concept_pages)
    for group in duplicates:
        findings.append(_finding("warn", "duplicate_concept_alias", ",".join(group["pages"]), alias=group["alias"]))

    metrics = {
        "concept_pages": len(concept_pages),
        "candidate_concepts": len(candidates),
        "unpromoted_candidate_concepts": len(unpromoted),
        "methods_total": len(method_pages),
        "methods_with_prerequisite_concepts": len(method_pages) - len(method_missing_prereqs),
        "topics_total": len(topic_pages),
        "topics_with_key_concepts": len(topic_pages) - len(topic_missing_key_concepts),
        "concepts_missing_source_papers": len(missing_source_papers),
        "concepts_missing_method_links": len(missing_related_methods),
        "concepts_missing_implementation_implications": len(missing_implementation),
        "concepts_missing_minimal_checks": len(missing_checks),
        "low_information_concept_stubs": len(low_information),
        "duplicate_concept_alias_groups": len(duplicates),
        "source_quality_contamination": len(source_quality_contamination),
    }
    status = "fail" if source_quality_contamination else "warn" if findings else "pass"
    payload = {
        "schema_version": CONCEPT_AUDIT_SCHEMA_VERSION,
        "created_at": datetime.now(timezone.utc).isoformat(),
        "wiki_root": str(wiki_root),
        "status": status,
        "metrics": metrics,
        "findings": findings,
        "samples": {
            "unpromoted_candidate_concepts": [candidate["title"] for candidate in unpromoted[:20]],
            "method_missing_prerequisite_concepts": method_missing_prereqs[:20],
            "topic_missing_key_concepts": topic_missing_key_concepts[:20],
            "low_information_concept_stubs": low_information[:20],
        },
    }
    report_path = out_path or wiki_root / ".index/concept-audit.json"
    report_path.parent.mkdir(parents=True, exist_ok=True)
    report_path.write_text(json.dumps(payload, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    effective_brief = brief_path or Path("docs/concept-layer-quality-audit.md")
    effective_brief.parent.mkdir(parents=True, exist_ok=True)
    effective_brief.write_text(_render_audit_brief(payload), encoding="utf-8")
    return ConceptAuditResult(report_path=report_path, brief_path=effective_brief, status=status, metrics=metrics, findings=findings)


def propose_concept_layer(
    *,
    wiki_root: Path,
    out_dir: Path | None = None,
    overwrite: bool = False,
    max_concepts: int = 24,
) -> ConceptLayerProposalResult:
    init_wiki_vault(wiki_root=wiki_root)
    pages = _load_pages(wiki_root)
    created_at = datetime.now(timezone.utc).isoformat()
    proposal_id = f"concept-layer-{created_at[:10]}-{_short_hash(str(len(pages)) + created_at)}"
    proposal_dir = out_dir or wiki_root / ".drafts/knowledge-repair" / proposal_id
    if proposal_dir.exists() and any(proposal_dir.iterdir()) and not overwrite:
        raise FileExistsError(f"concept proposal directory already exists: {proposal_dir}")
    proposal_dir.mkdir(parents=True, exist_ok=True)

    existing = {page["page_id"]: page for page in pages}
    candidates = _concept_candidates(wiki_root=wiki_root, pages=pages)
    proposed = [
        candidate
        for candidate in candidates
        if f"concepts/{candidate['slug']}" not in existing
        or (
            existing[f"concepts/{candidate['slug']}"]["type"] == "concept"
            and str(existing[f"concepts/{candidate['slug']}"]["frontmatter"].get("review_state") or "") in {"auto_structured", "candidate"}
        )
    ][:max_concepts]
    actions: list[dict[str, Any]] = []
    for candidate in proposed:
        actions.append(
            {
                "action_type": "create_concept_page",
                "risk": "low",
                "target_path": f"concepts/{candidate['slug']}.md",
                "reason": "Recurring prerequisite concept appears across canonical paper/method/topic evidence and has source provenance.",
                "concept": candidate,
            }
        )
        for method in candidate["related_methods"][:10]:
            method_path = wiki_root / "methods" / f"{slugify(method)}.md"
            if method_path.exists():
                actions.append(
                    {
                        "action_type": "add_method_prerequisite_concept",
                        "risk": "low",
                        "target_path": f"methods/{method_path.stem}.md",
                        "concept_title": candidate["title"],
                        "concept_path": f"concepts/{candidate['slug']}.md",
                        "reason": "Link method page to prerequisite concept without rewriting method claims.",
                    }
                )
        for topic in candidate["related_topics"][:10]:
            topic_path = wiki_root / "topics" / f"{slugify(topic)}.md"
            if topic_path.exists():
                actions.append(
                    {
                        "action_type": "add_topic_key_concept",
                        "risk": "low",
                        "target_path": f"topics/{topic_path.stem}.md",
                        "concept_title": candidate["title"],
                        "concept_path": f"concepts/{candidate['slug']}.md",
                        "reason": "Link topic page to key concept without changing source-grounded claims.",
                    }
                )

    manifest = {
        "schema_version": CONCEPT_PROPOSAL_SCHEMA_VERSION,
        "proposal_id": proposal_id,
        "created_at": created_at,
        "updated_at": created_at,
        "wiki_root": str(wiki_root),
        "status": "draft",
        "publish_state": "proposal_first",
        "concept_candidates": candidates,
        "proposed_concepts": proposed,
        "low_risk_actions": actions,
        "high_risk_actions": [
            {
                "action_type": "merge_duplicate_concepts",
                "risk": "high",
                "reason": "Concept merge requires review because aliases may hide domain-specific distinctions.",
            },
            {
                "action_type": "rewrite_method_mechanism_from_concept",
                "risk": "high",
                "reason": "Concept pages can inform method refinement, but source-grounded method claims require a refinement/source re-check path.",
            },
        ],
    }
    manifest_path = proposal_dir / "concept-layer-proposal.json"
    proposal_path = proposal_dir / "concept-layer-proposal.md"
    publish_plan_path = proposal_dir / "publish_plan.md"
    manifest["manifest_path"] = str(manifest_path)
    manifest["proposal_path"] = str(proposal_path)
    manifest["publish_plan_path"] = str(publish_plan_path)
    manifest_path.write_text(json.dumps(manifest, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    proposal_path.write_text(_render_proposal_markdown(manifest), encoding="utf-8")
    publish_plan_path.write_text(_render_publish_plan(manifest), encoding="utf-8")
    return ConceptLayerProposalResult(
        proposal_dir=proposal_dir,
        proposal_path=proposal_path,
        manifest_path=manifest_path,
        publish_plan_path=publish_plan_path,
        candidate_count=len(candidates),
        proposed_count=len(proposed),
    )


def lint_concept_layer(*, proposal_manifest: Path, wiki_root: Path, out_path: Path | None = None) -> ConceptLayerLintResult:
    manifest = _load_manifest(proposal_manifest)
    findings: list[dict[str, Any]] = []
    if manifest.get("schema_version") != CONCEPT_PROPOSAL_SCHEMA_VERSION:
        findings.append(_finding("error", "schema_version_mismatch", str(proposal_manifest)))
    if manifest.get("status") not in {"draft", "published"}:
        findings.append(_finding("error", "invalid_proposal_status", str(proposal_manifest), status=manifest.get("status")))
    for label in ("proposal_path", "publish_plan_path"):
        path = _resolve_path(manifest.get(label), base=proposal_manifest.parent)
        if path is None or not path.exists():
            findings.append(_finding("error", "missing_artifact", str(path), field=label))
    for action in manifest.get("low_risk_actions") or []:
        action_type = str(action.get("action_type") or "")
        if action_type not in {"create_concept_page", "add_method_prerequisite_concept", "add_topic_key_concept"}:
            findings.append(_finding("error", "unsupported_low_risk_action", str(action.get("target_path") or ""), action_type=action_type))
        if action.get("risk") != "low":
            findings.append(_finding("error", "action_not_low_risk", str(action.get("target_path") or ""), action_type=action_type))
        if action_type == "create_concept_page":
            concept = dict(action.get("concept") or {})
            if not concept.get("source_papers"):
                findings.append(_finding("error", "concept_without_source_papers", str(action.get("target_path") or "")))
            if not (concept.get("related_methods") or concept.get("prerequisite_for")):
                findings.append(_finding("error", "concept_without_method_links", str(action.get("target_path") or "")))
            if _too_generic_concept(str(concept.get("title") or "")):
                findings.append(_finding("error", "concept_too_generic", str(action.get("target_path") or ""), title=concept.get("title")))
            if str(concept.get("title") or "").lower() in {str(item).lower() for item in concept.get("related_methods") or []}:
                findings.append(_finding("error", "concept_is_method_title", str(action.get("target_path") or ""), title=concept.get("title")))
            if "source_quality_hold" in json.dumps(concept).lower():
                findings.append(_finding("error", "source_quality_contamination_risk", str(action.get("target_path") or "")))
        target = _target_path(action, wiki_root=wiki_root)
        if action_type == "create_concept_page" and target.exists():
            findings.append(_finding("warn", "concept_target_already_exists", _relative_or_absolute(target, wiki_root)))
        if action_type in {"add_method_prerequisite_concept", "add_topic_key_concept"} and not target.exists():
            findings.append(_finding("warn", "backlink_target_missing", _relative_or_absolute(target, wiki_root)))
    status = "fail" if any(item["severity"] == "error" for item in findings) else "pass"
    report = {
        "schema_version": CONCEPT_LINT_SCHEMA_VERSION,
        "created_at": datetime.now(timezone.utc).isoformat(),
        "wiki_root": str(wiki_root),
        "proposal_manifest": str(proposal_manifest),
        "status": status,
        "findings": findings,
    }
    report_path = out_path or proposal_manifest.parent / "concept-layer-lint.json"
    report_path.write_text(json.dumps(report, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    return ConceptLayerLintResult(report_path=report_path, status=status, findings=findings)


def publish_concept_layer(*, proposal_manifest: Path, wiki_root: Path) -> PublishConceptLayerResult:
    lint = lint_concept_layer(proposal_manifest=proposal_manifest, wiki_root=wiki_root)
    if lint.status != "pass":
        raise ValueError(f"concept layer lint failed: {lint.report_path}")
    manifest = _load_manifest(proposal_manifest)
    concepts_created = 0
    backlinks_added = 0
    skipped = 0
    link_targets: dict[tuple[str, str], list[tuple[str, str]]] = {}
    for action in manifest.get("low_risk_actions") or []:
        action_type = str(action.get("action_type") or "")
        if action_type == "create_concept_page":
            target = _target_path(action, wiki_root=wiki_root)
            if target.exists():
                existing = parse_frontmatter(target.read_text(encoding="utf-8"))
                if existing.get("type") == "concept" and str(existing.get("review_state") or "") in {"auto_structured", "candidate"}:
                    target.write_text(_render_concept_page(dict(action.get("concept") or {})), encoding="utf-8")
                    concepts_created += 1
                else:
                    skipped += 1
                continue
            target.parent.mkdir(parents=True, exist_ok=True)
            target.write_text(_render_concept_page(dict(action.get("concept") or {})), encoding="utf-8")
            concepts_created += 1
            continue
        if action_type in {"add_method_prerequisite_concept", "add_topic_key_concept"}:
            target = _target_path(action, wiki_root=wiki_root)
            if not target.exists():
                skipped += 1
                continue
            section = "Prerequisite Concepts" if action_type == "add_method_prerequisite_concept" else "Key Concepts"
            key = (_relative_or_absolute(target, wiki_root), section)
            link_targets.setdefault(key, []).append((str(action.get("concept_path") or ""), str(action.get("concept_title") or "")))
            continue
        skipped += 1
    for (relative, section), links in link_targets.items():
        changed = _sync_link_section(wiki_root / relative, section=section, links=links)
        if changed:
            backlinks_added += 1
        else:
            skipped += 1
    now = datetime.now(timezone.utc).isoformat()
    manifest["status"] = "published"
    manifest["publish_state"] = "published_low_risk_concepts"
    manifest["published_at"] = now
    manifest["updated_at"] = now
    manifest["concepts_created"] = concepts_created
    manifest["backlinks_added"] = backlinks_added
    manifest["skipped_actions"] = skipped
    proposal_manifest.write_text(json.dumps(manifest, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    index_path = rebuild_wiki_index(wiki_root=wiki_root)
    build_paper_catalog(wiki_root=wiki_root)
    build_synthesis_catalog(wiki_root=wiki_root)
    build_knowledge_catalogs(wiki_root=wiki_root)
    log_path = append_wiki_log(
        wiki_root=wiki_root,
        action="concept-layer",
        title=str(manifest.get("proposal_id") or "concept layer"),
        lines=[
            f"Created concept pages: {concepts_created}",
            f"Added method/topic concept backlinks: {backlinks_added}",
            f"Skipped low-risk actions: {skipped}",
            f"Concept proposal: `{_relative_or_absolute(proposal_manifest, wiki_root)}`",
        ],
    )
    return PublishConceptLayerResult(
        manifest_path=proposal_manifest,
        lint_report_path=lint.report_path,
        concepts_created=concepts_created,
        backlinks_added=backlinks_added,
        skipped_actions=skipped,
        index_path=index_path,
        log_path=log_path,
    )


def _concept_candidates(*, wiki_root: Path, pages: list[dict[str, Any]]) -> list[dict[str, Any]]:
    seeds = _concept_seed_catalog()
    paper_pages = [page for page in pages if page["directory"] == "papers"]
    method_pages = [page for page in pages if page["directory"] == "methods"]
    topic_pages = [page for page in pages if page["directory"] == "topics"]
    candidates: list[dict[str, Any]] = []
    for seed in seeds:
        aliases = [seed["title"], *seed["aliases"]]
        source_papers = _matching_pages(paper_pages, aliases)
        if not source_papers:
            continue
        related_methods = _dedupe(seed["related_methods"])
        related_topics = _dedupe(seed["related_topics"])
        candidates.append(
            {
                "title": seed["title"],
                "slug": slugify(seed["title"]),
                "aliases": _dedupe(seed["aliases"]),
                "source_papers": [page["relative_path"] for page in source_papers[:20]],
                "source_titles": [page["title"] for page in source_papers[:20]],
                "related_methods": related_methods,
                "related_topics": related_topics,
                "related_concepts": seed["related_concepts"],
                "prerequisite_for": related_methods,
                "implementation_implications": seed["implementation_implications"],
                "common_failure_modes": seed["common_failure_modes"],
                "minimal_checks": seed["minimal_checks"],
                "why_it_matters": seed["why_it_matters"],
                "retrieval_hooks": seed["retrieval_hooks"],
                "evidence_notes": _evidence_notes(source_papers[:8], aliases),
                "confidence": "medium" if len(source_papers) >= 2 else "low",
            }
        )
    return sorted(candidates, key=lambda item: (-len(item["source_papers"]), item["title"].lower()))


def _concept_seed_catalog() -> list[dict[str, Any]]:
    return [
        _seed(
            "Activation outliers",
            aliases=["LLM outliers", "activation outlier", "outlier activations"],
            related_methods=["post-training quantization", "outlier-aware quantization", "activation smoothing"],
            related_topics=["quantization", "systems ML"],
            why_it_matters="Outlier activations can dominate quantization scale choices and make low-bit activation or weight-activation quantization fail even when average error looks acceptable.",
            implementation_implications=["Inspect per-channel and per-token activation ranges before choosing scaling or clipping.", "Keep calibration data and routing/expert paths aligned with the target deployment regime."],
            common_failure_modes=["A global scale hides rare channels that drive most error.", "An ablation looks stable on average metrics while failing on outlier-heavy layers."],
            minimal_checks=["Plot layer-wise max/RMS activation ranges on calibration batches.", "Run an outlier-suppression ablation and check whether quantization error moves to another layer."],
            retrieval_hooks=["Use for PTQ, activation quantization, MoE quantization, and outlier smoothing ablations."],
            related_concepts=["Quantization error propagation", "Per-channel scaling"],
        ),
        _seed(
            "Quantization error propagation",
            aliases=["error propagation", "quantization error", "PTQ error"],
            related_methods=["post-training quantization", "layer-wise PTQ", "reconstruction-based quantization"],
            related_topics=["quantization"],
            why_it_matters="Quantization error is not only a local reconstruction problem; upstream activation or weight error can change downstream inputs, routing, and evaluation behavior.",
            implementation_implications=["Measure local reconstruction error and downstream metric change separately.", "When a layer looks harmless locally, probe whether later layers amplify the perturbation."],
            common_failure_modes=["Optimizing one layer independently masks accumulated error.", "Metrics degrade only after a later nonlinear or routing operation."],
            minimal_checks=["Run layer-drop or layer-only quantization sweeps.", "Compare error before and after normalization, routing, or attention blocks."],
            retrieval_hooks=["Use for ablation planning around PTQ, QAT, smoothing, reconstruction, and error attribution."],
            related_concepts=["Activation outliers", "Hessian-aware reconstruction"],
        ),
        _seed(
            "Per-channel scaling",
            aliases=["channel-wise scaling", "per channel scale", "scaling granularity"],
            related_methods=["post-training quantization", "weight-activation quantization", "activation smoothing"],
            related_topics=["quantization"],
            why_it_matters="Scale granularity controls which variation is preserved by a low-bit representation and determines the tradeoff between accuracy, metadata cost, and kernel simplicity.",
            implementation_implications=["Treat scale granularity as part of the kernel/data-layout contract, not just a math detail.", "Check whether scale tensors broadcast over the intended axis."],
            common_failure_modes=["A tensor axis mismatch silently applies the wrong scale.", "Fine-grained scales recover accuracy but erase the intended memory or speed benefit."],
            minimal_checks=["Assert scale shapes against weight/activation tensor shapes.", "Run per-tensor vs per-channel vs group-wise ablations with identical calibration data."],
            retrieval_hooks=["Use for quantizer implementation, axis bugs, and scale-granularity ablations."],
            related_concepts=["Activation outliers", "Quantization error propagation"],
        ),
        _seed(
            "Hessian-aware reconstruction",
            aliases=["Hessian aware reconstruction", "GPTQ reconstruction", "second order quantization"],
            related_methods=["GPTQ", "OBQ", "reconstruction-based quantization", "post-training quantization"],
            related_topics=["quantization"],
            why_it_matters="Second-order or Hessian-aware approximations decide which weight errors matter most under calibration inputs rather than treating all weights equally.",
            implementation_implications=["Keep calibration activations, block order, damping, and solve precision explicit.", "Test reconstruction against held-out calibration slices because Hessian approximations can overfit."],
            common_failure_modes=["Ill-conditioned Hessian blocks produce unstable updates.", "A solver bug is hidden by aggregate perplexity but visible in per-layer reconstruction residuals."],
            minimal_checks=["Check Hessian diagonal range and damping sensitivity.", "Compare block reconstruction error before and after quantization."],
            retrieval_hooks=["Use for GPTQ/OBQ-style implementations, Hessian approximations, and PTQ reconstruction probes."],
            related_concepts=["Quantization error propagation", "Per-channel scaling"],
        ),
        _seed(
            "KV-cache memory bandwidth",
            aliases=["KV cache bandwidth", "key value cache bandwidth", "cache memory bandwidth"],
            related_methods=["KV-cache compression", "long-context attention", "sparse attention"],
            related_topics=["long-context attention", "systems ML"],
            why_it_matters="Long-context decoding is often limited by moving cached keys/values rather than arithmetic, so an accuracy-preserving cache policy can matter more than a smaller attention formula.",
            implementation_implications=["Track cache bytes read per generated token and separate prefill from decode.", "Tie retention/compression policies to the attention kernel layout."],
            common_failure_modes=["A method reduces theoretical tokens but does not reduce actual memory traffic.", "Cache layout changes break batching or paged-attention assumptions."],
            minimal_checks=["Measure decode latency and memory bandwidth counters across context lengths.", "Run an oracle-retention comparison to separate policy quality from systems overhead."],
            retrieval_hooks=["Use for KV-cache compression, sparse decoding, long-context inference, and decode-memory bottleneck debugging."],
            related_concepts=["Attention sink", "Retention policy"],
        ),
        _seed(
            "Attention sink",
            aliases=["attention sinks", "sink tokens", "sink attention"],
            related_methods=["KV-cache compression", "long-context attention", "sparse attention"],
            related_topics=["long-context attention"],
            why_it_matters="Some tokens receive persistent attention and can stabilize long-context generation or cache eviction behavior, so naive token dropping can remove disproportionately important context.",
            implementation_implications=["Keep sink-token handling explicit in cache eviction and sparse-attention policies.", "Separate sink preservation from recency heuristics in ablations."],
            common_failure_modes=["A cache policy overfits to recency and discards globally stabilizing tokens.", "Attention visualization averages hide head-specific sink behavior."],
            minimal_checks=["Compare recency-only, sink-only, and hybrid retention policies.", "Inspect attention mass to sink candidates across layers and heads."],
            retrieval_hooks=["Use for long-context cache retention, sparse attention, and token eviction sanity checks."],
            related_concepts=["KV-cache memory bandwidth", "Retention policy"],
        ),
        _seed(
            "Speculative decoding acceptance rate",
            aliases=["acceptance rate", "accepted tokens", "speculative acceptance"],
            related_methods=["speculative decoding", "draft-model decoding", "verification decoding"],
            related_topics=["long-context attention", "systems ML"],
            why_it_matters="Speculative decoding speed depends on how many draft tokens survive target-model verification, not just draft model throughput.",
            implementation_implications=["Log acceptance length distributions, not only average speedup.", "Tie acceptance statistics to target model, prompt domain, and draft batch schedule."],
            common_failure_modes=["A faster draft model reduces acceptance enough to lose end-to-end speedup.", "Acceptance metrics are computed before rejection handling or EOS corner cases."],
            minimal_checks=["Compare accepted tokens per target forward pass across domains.", "Validate that output distribution matches the target model under the verification rule."],
            retrieval_hooks=["Use for speculative decoding debug, acceptance-rate regressions, and draft/target ablations."],
            related_concepts=["Draft-target distribution mismatch", "Verification cost model"],
        ),
        _seed(
            "Draft-target distribution mismatch",
            aliases=["draft target mismatch", "proposal target mismatch", "draft model mismatch"],
            related_methods=["speculative decoding", "draft-model decoding", "test-time compute"],
            related_topics=["long-context attention", "agent workflow"],
            why_it_matters="A draft/proposal mechanism can be cheap but useless if it proposes tokens or actions the verifier/target consistently rejects.",
            implementation_implications=["Measure mismatch by acceptance, KL, or rejection classes depending on the verification rule.", "Tune draft quality and cost jointly."],
            common_failure_modes=["Speed claims report draft throughput without target rejection cost.", "The draft model is calibrated on a domain different from evaluation prompts."],
            minimal_checks=["Bucket rejected drafts by token position, prompt type, and confidence.", "Compare a stronger/slower draft against a weaker/faster draft at equal target quality."],
            retrieval_hooks=["Use for speculative decoding, speculative agent execution, and verifier-backed proposal systems."],
            related_concepts=["Speculative decoding acceptance rate", "Verification cost model"],
        ),
        _seed(
            "KL regularization",
            aliases=["KL penalty", "KL divergence regularization", "policy KL"],
            related_methods=["preference optimization", "RLHF", "DPO", "test-time RL"],
            related_topics=["preference optimization", "RLHF"],
            why_it_matters="KL regularization controls how far an optimized policy moves from a reference distribution, affecting reward hacking, stability, and comparability across preference methods.",
            implementation_implications=["Log KL against the intended reference model with the same tokenizer and masking as the loss.", "Treat beta/temperature as core experimental controls."],
            common_failure_modes=["KL is computed on padded tokens or a mismatched reference.", "A method appears better because it accepts much larger policy drift."],
            minimal_checks=["Run beta sweeps with fixed data and seeds.", "Assert label/token masks before KL aggregation."],
            retrieval_hooks=["Use for RLHF/DPO/TTRL comparisons, preference optimization stability, and policy drift diagnostics."],
            related_concepts=["Preference data underspecification"],
        ),
        _seed(
            "PDE residual",
            aliases=["physics residual", "differential equation residual", "residual loss"],
            related_methods=["physics-informed neural networks", "scientific ML", "inverse PDE"],
            related_topics=["scientific ML", "PINN"],
            why_it_matters="PINN-style methods use the differential equation residual as a training or diagnostic signal, so incorrect residual construction can dominate results.",
            implementation_implications=["Verify units, derivative order, autodiff graph retention, and boundary/interior sampling separately.", "Do not mix residual terms with incompatible normalization without explicit weights."],
            common_failure_modes=["Boundary loss hides poor interior residuals.", "Autodiff computes a derivative of the wrong normalized variable."],
            minimal_checks=["Evaluate residual on analytic or manufactured-solution cases.", "Track boundary, initial-condition, and interior residual terms separately."],
            retrieval_hooks=["Use for scientific ML/PINN implementation, PDE loss debugging, and boundary-condition ablations."],
            related_concepts=["Boundary conditions", "Collocation points"],
        ),
        _seed(
            "K-means objective landscape",
            aliases=["kmeans objective", "centroid objective", "clustering objective"],
            related_methods=["k-means", "deep clustering", "matrix factorization"],
            related_topics=["clustering", "classical ML theory"],
            why_it_matters="Centroid assignment and update steps create a non-convex objective landscape, so initialization, assignment policy, and representation geometry can change conclusions.",
            implementation_implications=["Separate representation learning changes from assignment/update changes.", "Track objective value, assignment stability, and cluster utilization together."],
            common_failure_modes=["A representation method looks better because it changes initialization or empty-cluster handling.", "Cluster accuracy improves while objective stability worsens."],
            minimal_checks=["Run multiple seeds and report assignment stability.", "Compare objective value and downstream metric under fixed initialization."],
            retrieval_hooks=["Use for clustering theory, deep clustering probes, centroid assignment bugs, and matrix-factorization analogies."],
            related_concepts=["Centroid assignment"],
        ),
    ]


def _seed(
    title: str,
    *,
    aliases: list[str],
    related_methods: list[str],
    related_topics: list[str],
    why_it_matters: str,
    implementation_implications: list[str],
    common_failure_modes: list[str],
    minimal_checks: list[str],
    retrieval_hooks: list[str],
    related_concepts: list[str],
) -> dict[str, Any]:
    return {
        "title": title,
        "aliases": aliases,
        "related_methods": related_methods,
        "related_topics": related_topics,
        "why_it_matters": why_it_matters,
        "implementation_implications": implementation_implications,
        "common_failure_modes": common_failure_modes,
        "minimal_checks": minimal_checks,
        "retrieval_hooks": retrieval_hooks,
        "related_concepts": related_concepts,
    }


def _load_pages(wiki_root: Path) -> list[dict[str, Any]]:
    pages = []
    for directory in ("papers", "methods", "topics", "claims", "evidence", "syntheses", "concepts"):
        root = wiki_root / directory
        if not root.exists():
            continue
        for path in sorted(root.glob("*.md")):
            text = path.read_text(encoding="utf-8")
            frontmatter = parse_frontmatter(text)
            body = strip_frontmatter(text)
            rel = path.relative_to(wiki_root).as_posix()
            pages.append(
                {
                    "path": path,
                    "relative_path": rel,
                    "page_id": Path(rel).with_suffix("").as_posix(),
                    "directory": directory,
                    "type": str(frontmatter.get("type") or directory.rstrip("s")),
                    "title": str(frontmatter.get("title") or path.stem),
                    "frontmatter": frontmatter,
                    "body": body,
                    "sections": split_sections(body),
                    "search_text": _norm(json.dumps(frontmatter, ensure_ascii=False) + " " + body),
                    "concept_search_text": _concept_search_text(frontmatter=frontmatter, sections=split_sections(body), body=body),
                }
            )
    return pages


def _matching_pages(pages: list[dict[str, Any]], terms: list[str]) -> list[dict[str, Any]]:
    matches = []
    normalized_terms = [_norm(term) for term in terms if _norm(term)]
    for page in pages:
        text = page.get("concept_search_text") or page["search_text"]
        if any(_term_matches(text, term) for term in normalized_terms):
            matches.append(page)
    return matches


def _concept_search_text(*, frontmatter: dict[str, Any], sections: dict[str, str], body: str) -> str:
    useful_sections = (
        "What To Remember",
        "Mechanism",
        "Mechanism Details To Verify",
        "Evidence Map",
        "Implementation Hooks",
        "Limitations / Uncertainty",
        "What It Is",
        "Why It Matters",
        "Implementation Implications",
        "Common Failure Modes",
        "Minimal Checks / Probes",
        "Evidence / Provenance",
        "Source Facts",
        "Wiki Synthesis",
        "Claim",
        "Supporting Evidence",
        "Evidence Item",
        "Metric or Observation",
    )
    routing = [str(frontmatter.get("title") or "")]
    page_type = str(frontmatter.get("type") or "")
    if page_type == "paper":
        routing_fields = ("aliases", "topics", "methods", "settings")
    else:
        routing_fields = ("aliases",)
    for field in routing_fields:
        routing.extend(str(item) for item in _as_list(frontmatter.get(field)))
    selected = [sections.get(section, "") for section in useful_sections if section in sections]
    if not selected:
        selected = [body]
    return _norm(" ".join(routing + selected))


def _term_matches(text: str, term: str) -> bool:
    if not term:
        return False
    if len(term.split()) == 1:
        return re.search(rf"\b{re.escape(term)}s?\b", text) is not None
    return term in text


def _evidence_notes(pages: list[dict[str, Any]], aliases: list[str]) -> list[dict[str, str]]:
    notes = []
    alias_terms = [_norm(alias) for alias in aliases if _norm(alias)]
    for page in pages:
        text = str(page.get("concept_search_text") or page["body"])
        snippet = _best_sentence(text, alias_terms)
        notes.append({"paper": page["relative_path"], "title": page["title"], "snippet": snippet})
    return notes


def _best_sentence(text: str, terms: list[str]) -> str:
    sentences = re.split(r"(?<=[.!?])\s+", " ".join(text.split()))
    for sentence in sentences:
        normalized = _norm(sentence)
        if any(term in normalized for term in terms) and len(sentence) > 30:
            return _preview(sentence, limit=260)
    return _preview(text, limit=260)


def _render_concept_page(concept: dict[str, Any]) -> str:
    now = datetime.now(timezone.utc).date().isoformat()
    source_papers = [str(item) for item in concept.get("source_papers") or []]
    related_methods = [str(item) for item in concept.get("related_methods") or []]
    related_topics = [str(item) for item in concept.get("related_topics") or []]
    related_concepts = [str(item) for item in concept.get("related_concepts") or []]
    title = str(concept.get("title") or "Concept")
    fm = {
        "type": "concept",
        "title": title,
        "status": "active",
        "created": now,
        "updated": now,
        "aliases": [str(item) for item in concept.get("aliases") or []],
        "sources": source_papers,
        "source_papers": source_papers,
        "related_methods": related_methods,
        "related_topics": related_topics,
        "related_claims": [],
        "related_evidence": [],
        "prerequisite_for": [str(item) for item in concept.get("prerequisite_for") or related_methods],
        "supports": [],
        "contradicts": [],
        "confidence": concept.get("confidence") or "low",
        "review_state": "auto_structured",
        "evolution_state": "active",
        "revision_id": f"concept-{_short_hash(title + ''.join(source_papers))}",
    }
    lines = [
        _render_frontmatter(fm),
        f"# {title}",
        "",
        "## What It Is",
        "",
        f"`{title}` is a compiled preliminary-knowledge concept: a recurring mechanism or implementation background that appears across papers/methods and affects how a researcher understands, implements, debugs, or ablates the method family.",
        "",
        "## Why It Matters",
        "",
        f"- {concept.get('why_it_matters') or 'This concept affects implementation and experimental design decisions across linked methods.'}",
        "",
        "## Where It Appears",
        "",
    ]
    lines.extend(_paper_links(source_papers))
    lines.extend(["", "## Used By Methods", ""])
    lines.extend([f"- [[methods/{slugify(method)}|{method}]]" for method in related_methods[:30]] or ["- No method page has been linked yet."])
    lines.extend(["", "## Implementation Implications", ""])
    lines.extend([f"- {item}" for item in concept.get("implementation_implications") or []] or ["- Inspect linked papers before treating this concept as an implementation requirement."])
    lines.extend(["", "## Common Failure Modes", ""])
    lines.extend([f"- {item}" for item in concept.get("common_failure_modes") or []] or ["- Failure modes are not yet synthesized beyond linked papers."])
    lines.extend(["", "## Minimal Checks / Probes", ""])
    lines.extend([f"- {item}" for item in concept.get("minimal_checks") or []] or ["- Add a small controlled probe before relying on this concept in code or experiment design."])
    lines.extend(["", "## Evidence / Provenance", ""])
    for note in concept.get("evidence_notes") or []:
        paper = Path(str(note.get("paper") or "")).with_suffix("").as_posix()
        lines.append(f"- [[{paper}|{note.get('title') or paper}]]: {note.get('snippet') or 'Concept occurrence in linked source page.'}")
    if not concept.get("evidence_notes"):
        lines.append("- Evidence remains on linked source paper pages; this concept page only compiles navigation and implementation implications.")
    lines.extend(["", "## Related Concepts", ""])
    lines.extend([f"- [[concepts/{slugify(item)}|{item}]]" for item in related_concepts] or ["- None linked yet."])
    lines.extend(["", "## Open Questions", "", "- Which linked papers provide the strongest source-grounded evidence for this concept?", "- Which methods fail when this concept is ignored?"])
    lines.extend(["", "## Retrieval Hooks", ""])
    lines.extend([f"- {item}" for item in concept.get("retrieval_hooks") or []] or [f"- Retrieve this concept before implementing or debugging methods that depend on `{title}`."])
    return "\n".join(lines).rstrip() + "\n"


def _sync_link_section(target: Path, *, section: str, links: list[tuple[str, str]]) -> bool:
    text = target.read_text(encoding="utf-8")
    rendered_links = _dedupe([f"[[{Path(path).with_suffix('').as_posix()}|{title}]]" for path, title in links if path and title])
    if not rendered_links:
        return False
    replacement_body = "\n".join(f"- {link}" for link in rendered_links) + "\n"
    body = strip_frontmatter(text)
    if f"## {section}" not in body:
        addition = f"\n## {section}\n\n{replacement_body}"
        target.write_text((text.rstrip() + addition).rstrip() + "\n", encoding="utf-8")
        return True
    pattern = re.compile(rf"(^## {re.escape(section)}\n)(.*?)(?=^## |\Z)", flags=re.MULTILINE | re.DOTALL)
    match = pattern.search(text)
    if not match:
        return False
    replacement = match.group(1) + "\n" + replacement_body + "\n"
    if match.group(0) == replacement:
        return False
    target.write_text((text[: match.start()] + replacement + text[match.end() :]).rstrip() + "\n", encoding="utf-8")
    return True


def _is_low_information_concept(page: dict[str, Any]) -> bool:
    if len(page["body"].strip()) < 600:
        return True
    sections = page["sections"]
    useful = sum(1 for section in CONCEPT_SECTIONS if len(sections.get(section, "").strip()) > 50)
    return useful < 7


def _uses_source_quality_hold_as_evidence(page: dict[str, Any]) -> bool:
    text = _norm(json.dumps(page["frontmatter"], ensure_ascii=False) + " " + page["body"])
    return "source quality hold" in text and "not scientific evidence" not in text


def _duplicate_alias_groups(pages: list[dict[str, Any]]) -> list[dict[str, Any]]:
    aliases: dict[str, list[str]] = {}
    for page in pages:
        values = [page["title"], *[str(item) for item in _as_list(page["frontmatter"].get("aliases"))]]
        for value in values:
            key = _norm(value)
            if key:
                aliases.setdefault(key, []).append(page["relative_path"])
    return [{"alias": alias, "pages": sorted(paths)} for alias, paths in aliases.items() if len(set(paths)) > 1]


def _too_generic_concept(title: str) -> bool:
    return _norm(title) in {"model", "method", "attention", "design", "error", "data", "training", "optimization", "baseline"}


def _paper_links(source_papers: list[str]) -> list[str]:
    if not source_papers:
        return ["- No source paper has been linked yet."]
    return [f"- [[{Path(relative).with_suffix('').as_posix()}]]" for relative in source_papers[:40]]


def _render_audit_brief(payload: dict[str, Any]) -> str:
    metrics = payload["metrics"]
    lines = [
        "# Concept Layer Quality Audit",
        "",
        f"- Generated: `{payload['created_at']}`",
        f"- Status: `{payload['status']}`",
        f"- Concept pages: {metrics['concept_pages']}",
        f"- Candidate concepts: {metrics['candidate_concepts']}",
        f"- Unpromoted candidate concepts: {metrics['unpromoted_candidate_concepts']}",
        f"- Methods with prerequisite concepts: {metrics['methods_with_prerequisite_concepts']} / {metrics['methods_total']}",
        f"- Topics with key concepts: {metrics['topics_with_key_concepts']} / {metrics['topics_total']}",
        "",
        "## Health Metrics",
        "",
    ]
    for key, value in metrics.items():
        lines.append(f"- {key}: {value}")
    lines.extend(["", "## Interpretation", ""])
    lines.append("Concept pages are preliminary knowledge pages for implementation and research-design background. Warnings usually mean a method/topic has not yet linked prerequisites; errors indicate source-quality boundary risk.")
    for name, values in (payload.get("samples") or {}).items():
        lines.extend(["", f"## Sample: {name}", ""])
        lines.extend([f"- `{item}`" for item in values[:12]] or ["- None."])
    return "\n".join(lines).rstrip() + "\n"


def _render_proposal_markdown(manifest: dict[str, Any]) -> str:
    lines = [
        "# Concept Layer Proposal",
        "",
        f"- Proposal id: `{manifest['proposal_id']}`",
        f"- Candidate concepts: {len(manifest.get('concept_candidates') or [])}",
        f"- Proposed new concepts: {len(manifest.get('proposed_concepts') or [])}",
        f"- Low-risk actions: {len(manifest.get('low_risk_actions') or [])}",
        "",
        "## Proposed Concepts",
        "",
    ]
    for concept in manifest.get("proposed_concepts") or []:
        lines.extend(
            [
                f"### {concept['title']}",
                "",
                f"- Target: `concepts/{concept['slug']}.md`",
                f"- Source papers: {len(concept.get('source_papers') or [])}",
                f"- Related methods: {', '.join((concept.get('related_methods') or [])[:6]) or 'none'}",
                f"- Why it matters: {concept.get('why_it_matters')}",
                "",
            ]
        )
    lines.extend(["## Boundary", "", "- This proposal creates compiled concept pages and low-risk backlinks only.", "- It does not rewrite source-grounded paper facts, claim confidence, or method mechanisms."])
    return "\n".join(lines).rstrip() + "\n"


def _render_publish_plan(manifest: dict[str, Any]) -> str:
    lines = [
        "# Concept Layer Publish Plan",
        "",
        "## Low-Risk Publishable Actions",
        "",
    ]
    for action in manifest.get("low_risk_actions") or []:
        lines.append(f"- `{action.get('action_type')}` -> `{action.get('target_path')}`: {action.get('reason')}")
    lines.extend(["", "## High-Risk Proposal-Only Actions", ""])
    for action in manifest.get("high_risk_actions") or []:
        lines.append(f"- `{action.get('action_type')}`: {action.get('reason')}")
    return "\n".join(lines).rstrip() + "\n"


def _render_frontmatter(values: dict[str, Any]) -> str:
    lines = ["---"]
    for key, value in values.items():
        if isinstance(value, list):
            lines.append(f"{key}:")
            for item in value:
                lines.append(f'  - "{_escape(str(item))}"')
        elif isinstance(value, bool):
            lines.append(f"{key}: {str(value).lower()}")
        elif isinstance(value, int):
            lines.append(f"{key}: {value}")
        elif value is None:
            lines.append(f"{key}: null")
        else:
            lines.append(f'{key}: "{_escape(str(value))}"')
    lines.append("---")
    return "\n".join(lines)


def _load_manifest(path: Path) -> dict[str, Any]:
    if not path.exists():
        raise FileNotFoundError(f"concept proposal manifest does not exist: {path}")
    return json.loads(path.read_text(encoding="utf-8"))


def _target_path(action: dict[str, Any], *, wiki_root: Path) -> Path:
    target = Path(str(action.get("target_path") or ""))
    if target.is_absolute():
        return target
    return wiki_root / target


def _resolve_path(value: Any, *, base: Path) -> Path | None:
    if not value:
        return None
    path = Path(str(value))
    if path.is_absolute() or path.exists():
        return path
    return base / path


def _relative_or_absolute(path: Path, wiki_root: Path) -> str:
    try:
        return path.relative_to(wiki_root).as_posix()
    except ValueError:
        return str(path)


def _as_list(value: Any) -> list[Any]:
    if value is None:
        return []
    if isinstance(value, list):
        return value
    return [value]


def _dedupe(values: list[str]) -> list[str]:
    result = []
    seen = set()
    for value in values:
        cleaned = str(value).strip()
        key = cleaned.lower()
        if cleaned and key not in seen:
            seen.add(key)
            result.append(cleaned)
    return result


def _preview(text: str, *, limit: int) -> str:
    cleaned = " ".join(str(text or "").split())
    if len(cleaned) <= limit:
        return cleaned
    return cleaned[:limit].rstrip() + "..."


def _norm(text: str) -> str:
    return " ".join(re.findall(r"[a-z0-9]+", str(text).lower()))


def _short_hash(text: str) -> str:
    return hashlib.sha1(text.encode("utf-8")).hexdigest()[:10]


def _escape(text: str) -> str:
    return text.replace("\\", "\\\\").replace('"', '\\"')


def _finding(severity: str, code: str, path: str, **extra: Any) -> dict[str, Any]:
    payload = {"severity": severity, "code": code, "path": path}
    payload.update(extra)
    return payload
