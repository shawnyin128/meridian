from pathlib import Path


def test_vscode_release_workflow_builds_push_artifacts_without_release_upload() -> None:
    workflow = Path(".github/workflows/release-vscode-extension.yml").read_text(encoding="utf-8")

    assert "push:" in workflow
    assert "branches: [master]" in workflow
    assert "plugins/vscode/meridian-research-graph/**" in workflow
    assert "actions/upload-artifact@v4" in workflow
    assert "github.event_name == 'push'" in workflow
    assert "github.event_name != 'push'" in workflow
    assert "gh release upload" in workflow
