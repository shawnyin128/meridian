from __future__ import annotations

import subprocess
from dataclasses import dataclass
from pathlib import Path


@dataclass(frozen=True)
class GitAutoCommitResult:
    status: str
    repo_root: Path | None
    commit: str | None
    committed_paths: tuple[Path, ...]
    skipped_paths: tuple[Path, ...]
    message: str


def git_dirty_paths(anchor: Path) -> set[str]:
    repo_root = _repo_root(anchor)
    if repo_root is None:
        return set()
    proc = _run_git(repo_root, "status", "--porcelain", "--untracked-files=all")
    if proc.returncode != 0:
        return set()
    paths: set[str] = set()
    for line in proc.stdout.splitlines():
        if not line:
            continue
        path = line[3:]
        if " -> " in path:
            path = path.split(" -> ", 1)[1]
        paths.add(path)
    return paths


def auto_commit_paths(
    *,
    anchor: Path,
    paths: list[Path],
    message: str,
    baseline_dirty: set[str] | None = None,
) -> GitAutoCommitResult:
    repo_root = _repo_root(anchor)
    if repo_root is None:
        return GitAutoCommitResult(
            status="skipped_not_git_repo",
            repo_root=None,
            commit=None,
            committed_paths=(),
            skipped_paths=tuple(paths),
            message="No git repository found for wiki auto-commit.",
        )

    baseline_dirty = baseline_dirty or set()
    candidates: list[Path] = []
    skipped: list[Path] = []
    for path in _unique_existing_paths(paths):
        try:
            relative = path.resolve().relative_to(repo_root)
        except ValueError:
            skipped.append(path)
            continue
        relative_text = relative.as_posix()
        if _path_was_dirty_before(relative_text, baseline_dirty):
            skipped.append(path)
            continue
        if _is_ignored(repo_root, relative):
            skipped.append(path)
            continue
        candidates.append(path)

    if not candidates:
        return GitAutoCommitResult(
            status="skipped_no_paths",
            repo_root=repo_root,
            commit=None,
            committed_paths=(),
            skipped_paths=tuple(skipped),
            message="No non-ignored ingest artifacts were eligible for git auto-commit.",
        )

    add_proc = _run_git(repo_root, "add", "--", *[str(path.resolve()) for path in candidates])
    if add_proc.returncode != 0:
        return GitAutoCommitResult(
            status="failed",
            repo_root=repo_root,
            commit=None,
            committed_paths=(),
            skipped_paths=tuple(skipped),
            message=(add_proc.stderr or add_proc.stdout).strip() or "git add failed",
        )

    staged_proc = _run_git(repo_root, "diff", "--cached", "--quiet", "--", *[str(path.resolve()) for path in candidates])
    if staged_proc.returncode == 0:
        return GitAutoCommitResult(
            status="skipped_no_changes",
            repo_root=repo_root,
            commit=None,
            committed_paths=(),
            skipped_paths=tuple(skipped),
            message="No staged ingest changes to commit.",
        )

    commit_proc = _run_git(repo_root, "commit", "-m", message)
    if commit_proc.returncode != 0:
        return GitAutoCommitResult(
            status="failed",
            repo_root=repo_root,
            commit=None,
            committed_paths=(),
            skipped_paths=tuple(skipped),
            message=(commit_proc.stderr or commit_proc.stdout).strip() or "git commit failed",
        )

    head_proc = _run_git(repo_root, "rev-parse", "--short", "HEAD")
    commit_hash = head_proc.stdout.strip() if head_proc.returncode == 0 else None
    return GitAutoCommitResult(
        status="committed",
        repo_root=repo_root,
        commit=commit_hash,
        committed_paths=tuple(candidates),
        skipped_paths=tuple(skipped),
        message=commit_proc.stdout.strip(),
    )


def _repo_root(anchor: Path) -> Path | None:
    proc = subprocess.run(
        ["git", "-C", str(anchor.resolve()), "rev-parse", "--show-toplevel"],
        text=True,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        check=False,
    )
    if proc.returncode != 0:
        return None
    return Path(proc.stdout.strip()).resolve()


def _run_git(repo_root: Path, *args: str) -> subprocess.CompletedProcess[str]:
    return subprocess.run(
        ["git", "-C", str(repo_root), *args],
        text=True,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        check=False,
    )


def _unique_existing_paths(paths: list[Path]) -> list[Path]:
    seen: set[Path] = set()
    unique: list[Path] = []
    for path in paths:
        resolved = path.expanduser().resolve()
        if resolved in seen or not resolved.exists():
            continue
        seen.add(resolved)
        unique.append(resolved)
    return unique


def _path_was_dirty_before(path: str, baseline_dirty: set[str]) -> bool:
    return any(path == dirty or path.startswith(f"{dirty}/") or dirty.startswith(f"{path}/") for dirty in baseline_dirty)


def _is_ignored(repo_root: Path, relative_path: Path) -> bool:
    proc = _run_git(repo_root, "check-ignore", "-q", "--", relative_path.as_posix())
    return proc.returncode == 0
