from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path

from meridian.wiki.corpus import CatalogResult, RetrievalResult, build_knowledge_catalogs, build_paper_catalog, build_synthesis_catalog, retrieve_papers
from meridian.wiki.flow import WikiFlowResult, run_wiki_flow
from meridian.wiki.health import WikiHealthResult, run_wiki_health
from meridian.wiki.ingest import run_ingest
from meridian.wiki.insights import (
    InsightLintResult,
    PublishInsightResult,
    UserInsightDraftResult,
    add_user_insight,
    lint_user_insight,
    publish_user_insight,
)
from meridian.wiki.proposals import (
    ProposalLintResult,
    PublishProposalResult,
    QueryWritebackProposalResult,
    lint_query_writeback_proposal,
    propose_query_writeback,
    publish_query_writeback_proposal,
)
from meridian.wiki.vault import WikiInitResult, init_wiki_vault
from meridian.wiki.workspace import WorkspaceInitResult, init_workspace


@dataclass(frozen=True)
class CommandIngestResult:
    review_path: Path
    paper_path: Path
    claims_path: Path
    methods_path: Path
    evidence_path: Path
    run_path: Path
    canonical_paper_path: Path | None
    index_path: Path | None
    log_path: Path | None


def ingest_pdf(
    pdf_path: Path,
    out_dir: Path,
    title_override: str | None = None,
    overwrite: bool = False,
    wiki_root: Path | None = None,
    source_root: Path | None = None,
    publish_mode: str = "never",
    render_page_images: bool = True,
) -> CommandIngestResult:
    result = run_ingest(
        pdf_path=pdf_path,
        out_dir=out_dir,
        title_override=title_override,
        overwrite=overwrite,
        wiki_root=wiki_root,
        source_root=source_root,
        publish_mode=publish_mode,
        render_page_images=render_page_images,
    )
    return CommandIngestResult(
        review_path=result.review_path,
        paper_path=result.paper_path,
        claims_path=result.claims_path,
        methods_path=result.methods_path,
        evidence_path=result.evidence_path,
        run_path=result.run_path,
        canonical_paper_path=result.publish_result.paper_path if result.publish_result else None,
        index_path=result.publish_result.index_path if result.publish_result else None,
        log_path=result.publish_result.log_path if result.publish_result else None,
    )


def run_flow(
    *,
    pdf_path: Path,
    out_dir: Path,
    wiki_root: Path,
    rubric_path: Path,
    title_override: str | None = None,
    overwrite: bool = False,
    publish_mode: str = "auto",
    case_path: Path | None = None,
    judge_result_path: Path | None = None,
    source_fidelity_result_path: Path | None = None,
    render_page_images: bool = True,
    source_root: Path | None = None,
) -> WikiFlowResult:
    return run_wiki_flow(
        pdf_path=pdf_path,
        out_dir=out_dir,
        wiki_root=wiki_root,
        rubric_path=rubric_path,
        title_override=title_override,
        overwrite=overwrite,
        publish_mode=publish_mode,
        case_path=case_path,
        judge_result_path=judge_result_path,
        source_fidelity_result_path=source_fidelity_result_path,
        render_page_images=render_page_images,
        source_root=source_root,
    )


def catalog_wiki(wiki_root: Path, out_path: Path | None = None) -> CatalogResult:
    result = build_paper_catalog(wiki_root=wiki_root, out_path=out_path)
    if (wiki_root / "syntheses").exists():
        build_synthesis_catalog(wiki_root=wiki_root)
    build_knowledge_catalogs(wiki_root=wiki_root)
    return result


def retrieve_wiki(
    *,
    query: str,
    wiki_root: Path,
    catalog_path: Path | None = None,
    top_k: int = 5,
    strategy: str = "v1",
    packet_path: Path | None = None,
    result_path: Path | None = None,
) -> RetrievalResult:
    return retrieve_papers(
        query=query,
        wiki_root=wiki_root,
        catalog_path=catalog_path,
        top_k=top_k,
        strategy=strategy,
        packet_path=packet_path,
        result_path=result_path,
    )


def health_wiki(
    *,
    wiki_root: Path,
    profile: str = "daily",
    out_path: Path | None = None,
    markdown_path: Path | None = None,
    html_path: Path | None = None,
    repair_plan: bool = False,
    repair_plan_path: Path | None = None,
) -> WikiHealthResult:
    return run_wiki_health(
        wiki_root=wiki_root,
        profile=profile,
        out_path=out_path,
        markdown_path=markdown_path,
        html_path=html_path,
        repair_plan=repair_plan,
        repair_plan_path=repair_plan_path,
    )


def add_insight_wiki(
    *,
    wiki_root: Path,
    paper: str,
    note: str = "",
    note_file: Path | None = None,
    insight_type: str = "paper-note",
    out_dir: Path | None = None,
    overwrite: bool = False,
) -> UserInsightDraftResult:
    return add_user_insight(
        wiki_root=wiki_root,
        paper=paper,
        note=note,
        note_file=note_file,
        insight_type=insight_type,
        out_dir=out_dir,
        overwrite=overwrite,
    )


def insight_lint_wiki(
    *,
    insight_manifest: Path,
    wiki_root: Path,
    out_path: Path | None = None,
) -> InsightLintResult:
    return lint_user_insight(insight_manifest=insight_manifest, wiki_root=wiki_root, out_path=out_path)


def publish_insight_wiki(
    *,
    insight_manifest: Path,
    wiki_root: Path,
) -> PublishInsightResult:
    return publish_user_insight(insight_manifest=insight_manifest, wiki_root=wiki_root)


def propose_writeback_wiki(
    *,
    wiki_root: Path,
    query: str,
    context_path: Path,
    title: str,
    proposal_type: str = "synthesis",
    body_path: Path | None = None,
    out_dir: Path | None = None,
    notes: str = "",
    user_note: str = "",
    user_note_path: Path | None = None,
    overwrite: bool = False,
    update_log: bool = True,
) -> QueryWritebackProposalResult:
    return propose_query_writeback(
        wiki_root=wiki_root,
        query=query,
        context_path=context_path,
        title=title,
        proposal_type=proposal_type,
        body_path=body_path,
        out_dir=out_dir,
        notes=notes,
        user_note=user_note,
        user_note_path=user_note_path,
        overwrite=overwrite,
        update_log=update_log,
    )


def proposal_lint_wiki(
    *,
    proposal_manifest: Path,
    wiki_root: Path,
    out_path: Path | None = None,
    overwrite: bool = False,
) -> ProposalLintResult:
    return lint_query_writeback_proposal(
        proposal_manifest=proposal_manifest,
        wiki_root=wiki_root,
        out_path=out_path,
        overwrite=overwrite,
    )


def publish_proposal_wiki(
    *,
    proposal_manifest: Path,
    wiki_root: Path,
    overwrite: bool = False,
) -> PublishProposalResult:
    return publish_query_writeback_proposal(
        proposal_manifest=proposal_manifest,
        wiki_root=wiki_root,
        overwrite=overwrite,
    )


def init_wiki(wiki_root: Path, overwrite_templates: bool = False) -> WikiInitResult:
    return init_wiki_vault(wiki_root=wiki_root, overwrite_templates=overwrite_templates)


def init_wiki_workspace(
    *,
    library_root: Path,
    wiki_root: Path | None = None,
    source_root: Path | None = None,
    set_default: bool = True,
    overwrite: bool = False,
    overwrite_templates: bool = False,
) -> WorkspaceInitResult:
    return init_workspace(
        library_root=library_root,
        wiki_root=wiki_root,
        source_root=source_root,
        set_default=set_default,
        overwrite=overwrite,
        overwrite_templates=overwrite_templates,
    )


