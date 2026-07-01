import * as fs from "node:fs";
import * as path from "node:path";
import * as vscode from "vscode";
import { runMeridian, summarizeMeridianOutput, workspaceRoot } from "./meridianCli";
import type { LabGraph } from "./webview/graphTypes";

interface LoadedGraph {
  graph: LabGraph;
  graphUri: vscode.Uri;
  root: string;
}

export class ResearchGraphPanel {
  static current: ResearchGraphPanel | undefined;

  private readonly panel: vscode.WebviewPanel;
  private readonly watcher: vscode.FileSystemWatcher;
  private graph: LabGraph | null = null;
  private graphRoot: string | null = null;
  private graphUri: vscode.Uri | null = null;
  private targetRoot: string | null = null;
  private selectedNodeId: string | null = null;

  static open(context: vscode.ExtensionContext) {
    if (ResearchGraphPanel.current) {
      ResearchGraphPanel.current.panel.reveal(vscode.ViewColumn.One);
      void ResearchGraphPanel.current.reloadGraph();
      return ResearchGraphPanel.current;
    }

    const panel = vscode.window.createWebviewPanel(
      "meridianResearchGraph",
      "Meridian Research Graph",
      vscode.ViewColumn.One,
      {
        enableScripts: true,
        localResourceRoots: [vscode.Uri.joinPath(context.extensionUri, "dist", "webview")]
      }
    );

    ResearchGraphPanel.current = new ResearchGraphPanel(context, panel);
    void ResearchGraphPanel.current.reloadGraph();
    return ResearchGraphPanel.current;
  }

  private constructor(
    private readonly context: vscode.ExtensionContext,
    panel: vscode.WebviewPanel
  ) {
    this.panel = panel;
    this.watcher = vscode.workspace.createFileSystemWatcher("**/.meridian/graph/graph.json");
    this.watcher.onDidCreate(() => void this.reloadGraph());
    this.watcher.onDidChange(() => void this.reloadGraph());
    this.watcher.onDidDelete(() => void this.reloadGraph());

    this.panel.onDidDispose(() => this.dispose(), undefined, context.subscriptions);
    this.panel.webview.onDidReceiveMessage((message) => void this.handleWebviewMessage(message), undefined, context.subscriptions);
    context.subscriptions.push(this.watcher);
  }

  async refreshGraph() {
    const root = await this.resolveGraphRoot();
    if (!root) {
      await vscode.window.showWarningMessage(
        "Open a Meridian graph or use a single-root workspace before refreshing; multi-root refresh needs a known Lab root."
      );
      return;
    }

    const result = await runMeridian(["lab", "graph-refresh", "--lab-root", root], root);
    if (result.code !== 0) {
      await vscode.window.showErrorMessage(formatCliFailure("refresh", result));
      return;
    }

    await vscode.window.showInformationMessage(formatCliSuccess("refreshed", result));
    await this.reloadGraph();
  }

  async checkGraph() {
    const root = await this.resolveGraphRoot();
    if (!root) {
      await vscode.window.showWarningMessage(
        "Open a Meridian graph or use a single-root workspace before checking health; multi-root checks need a known Lab root."
      );
      return;
    }

    const result = await runMeridian(["lab", "graph-check", "--lab-root", root], root);
    if (result.code !== 0) {
      await vscode.window.showErrorMessage(formatCliFailure("health check", result));
      return;
    }

    const summary = summarizeCliOutput(result) || this.graph?.health?.status || "ok";
    await vscode.window.showInformationMessage(`Meridian graph health: ${summary}`);
  }

  async revealSelectedNodeMarkdown() {
    await this.readGraphState();
    if (!this.graph) {
      await vscode.window.showWarningMessage("No Meridian graph is loaded.");
      return;
    }

    const node =
      this.graph.nodes.find((candidate) => candidate.id === this.selectedNodeId) ?? this.graph.nodes[0] ?? null;
    if (!node) {
      await vscode.window.showWarningMessage("No Meridian graph node is available to reveal.");
      return;
    }

    const root = this.graphRoot ?? (await this.resolveGraphRoot());
    if (!root) {
      await vscode.window.showWarningMessage("No workspace root is available for Markdown reveal.");
      return;
    }

    const markdownPath = resolveWorkspaceChildPath(root, node.markdown_path);
    if (!markdownPath) {
      await vscode.window.showErrorMessage(`Refusing to open Markdown outside the workspace: ${node.markdown_path}`);
      return;
    }

    try {
      const document = await vscode.workspace.openTextDocument(vscode.Uri.file(markdownPath));
      const editor = await vscode.window.showTextDocument(document, { preview: false });
      revealMarkdownAnchor(editor, document, node.markdown_anchor);
    } catch (error) {
      await vscode.window.showErrorMessage(`Could not open Meridian node Markdown: ${String(error)}`);
    }
  }

  private async reloadGraph() {
    await this.readGraphState();
    this.panel.webview.html = this.renderHtml(this.graph);
  }

  private async readGraphState() {
    const loaded = await this.loadGraph();
    this.graph = loaded?.graph ?? null;
    this.graphRoot = loaded?.root ?? null;
    this.graphUri = loaded?.graphUri ?? null;
    if (loaded?.root) {
      this.targetRoot = loaded.root;
    }
    if (this.graph && this.selectedNodeId && !this.graph.nodes.some((node) => node.id === this.selectedNodeId)) {
      this.selectedNodeId = null;
    }
  }

  private async loadGraph(): Promise<LoadedGraph | null> {
    const graphContext = await findFirstReadableGraph();
    if (!graphContext) {
      return null;
    }

    try {
      const bytes = await vscode.workspace.fs.readFile(graphContext.graphUri);
      const raw = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
      return {
        ...graphContext,
        graph: JSON.parse(raw) as LabGraph
      };
    } catch (error) {
      if (isFileMissing(error)) {
        return null;
      }
      await vscode.window.showWarningMessage(`Could not read Meridian graph: ${String(error)}`);
      return null;
    }
  }

  private async resolveGraphRoot() {
    if (this.graphRoot) {
      return this.graphRoot;
    }
    if (this.targetRoot) {
      return this.targetRoot;
    }

    const graphContext = await findFirstReadableGraph();
    if (graphContext) {
      this.graphRoot = graphContext.root;
      this.graphUri = graphContext.graphUri;
      this.targetRoot = graphContext.root;
      return graphContext.root;
    }

    return workspaceRoot(vscode.workspace.workspaceFolders);
  }

  private async handleWebviewMessage(message: unknown) {
    if (!isRecord(message) || typeof message.type !== "string") {
      return;
    }

    switch (message.type) {
      case "selectedNode":
        if (typeof message.nodeId === "string") {
          this.selectedNodeId = message.nodeId;
        }
        break;
      case "refreshGraph":
        await this.refreshGraph();
        break;
      case "checkGraph":
        await this.checkGraph();
        break;
      case "revealMarkdown":
        await this.revealSelectedNodeMarkdown();
        break;
      default:
        break;
    }
  }

  private renderHtml(graph: LabGraph | null) {
    const nonce = getNonce();
    const scriptUri = this.panel.webview.asWebviewUri(
      vscode.Uri.joinPath(this.context.extensionUri, "dist", "webview", "main.js")
    );
    const styleUris = findStyleUris(this.context, this.panel.webview);
    const cspSource = this.panel.webview.cspSource;
    const graphJson = escapeScriptJson(graph);
    const selectedNodeIdJson = escapeScriptJson(this.selectedNodeId);

    return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8">
    <meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src ${cspSource} data:; style-src ${cspSource} 'unsafe-inline'; script-src 'nonce-${nonce}'; font-src ${cspSource};">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    ${styleUris.map((uri) => `<link rel="stylesheet" href="${uri.toString()}">`).join("\n    ")}
    <title>Meridian Research Graph</title>
  </head>
  <body>
    <div id="root"></div>
    <script nonce="${nonce}">window.__MERIDIAN_GRAPH__ = ${graphJson};</script>
    <script nonce="${nonce}">window.__MERIDIAN_SELECTED_NODE_ID__ = ${selectedNodeIdJson};</script>
    <script nonce="${nonce}" type="module" src="${scriptUri.toString()}"></script>
  </body>
</html>`;
  }

  private dispose() {
    if (ResearchGraphPanel.current === this) {
      ResearchGraphPanel.current = undefined;
    }
    this.watcher.dispose();
  }
}

async function findFirstReadableGraph(): Promise<Omit<LoadedGraph, "graph"> | null> {
  const workspaceFolders = vscode.workspace.workspaceFolders ?? [];
  for (const workspaceFolder of workspaceFolders) {
    const graphUri = vscode.Uri.joinPath(workspaceFolder.uri, ".meridian", "graph", "graph.json");
    try {
      await vscode.workspace.fs.readFile(graphUri);
      return {
        graphUri,
        root: workspaceRoot(vscode.workspace.workspaceFolders, vscode.workspace.getWorkspaceFolder(graphUri)) ?? workspaceFolder.uri.fsPath
      };
    } catch (error) {
      if (!isFileMissing(error)) {
        throw error;
      }
    }
  }

  return null;
}

function resolveWorkspaceChildPath(root: string, markdownPath: string) {
  const rootPath = path.resolve(root);
  const targetPath = path.resolve(rootPath, markdownPath);
  const relative = path.relative(rootPath, targetPath);

  if (relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative))) {
    return targetPath;
  }
  return null;
}

function revealMarkdownAnchor(editor: vscode.TextEditor, document: vscode.TextDocument, anchor: string | undefined) {
  if (!anchor) {
    return;
  }

  const normalizedAnchor = normalizeMarkdownAnchor(anchor);
  for (let lineNumber = 0; lineNumber < document.lineCount; lineNumber += 1) {
    const line = document.lineAt(lineNumber);
    const heading = line.text.match(/^(#{1,6})\s+(.+?)\s*#*$/);
    if (!heading) {
      continue;
    }

    if (normalizeMarkdownAnchor(heading[2]) === normalizedAnchor) {
      const position = new vscode.Position(lineNumber, 0);
      editor.selection = new vscode.Selection(position, position);
      editor.revealRange(new vscode.Range(position, position), vscode.TextEditorRevealType.InCenter);
      return;
    }
  }
}

function normalizeMarkdownAnchor(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^\w\s-]/g, "")
    .replace(/\s+/g, "-");
}

function formatCliSuccess(action: string, result: { stdout: string; stderr: string }) {
  const summary = summarizeCliOutput(result);
  return summary ? `Meridian graph ${action}: ${summary}` : `Meridian graph ${action}.`;
}

function formatCliFailure(action: string, result: { code: number; stdout: string; stderr: string }) {
  const summary = summarizeCliOutput(result, "stderr");
  return summary
    ? `Meridian graph ${action} failed: ${summary}`
    : `Meridian graph ${action} failed with exit code ${result.code}.`;
}

function summarizeCliOutput(result: { stdout: string; stderr: string }, preferredStream: "stdout" | "stderr" = "stdout") {
  return summarizeMeridianOutput(result, preferredStream);
}

function findStyleUris(context: vscode.ExtensionContext, webview: vscode.Webview) {
  const assetsDir = path.join(context.extensionPath, "dist", "webview", "assets");
  if (!fs.existsSync(assetsDir)) {
    return [];
  }

  return fs
    .readdirSync(assetsDir)
    .filter((file) => file.endsWith(".css"))
    .sort()
    .map((file) => webview.asWebviewUri(vscode.Uri.file(path.join(assetsDir, file))));
}

function escapeScriptJson(value: unknown) {
  return JSON.stringify(value).replace(/[<>&\u2028\u2029]/g, (character) => {
    switch (character) {
      case "<":
        return "\\u003c";
      case ">":
        return "\\u003e";
      case "&":
        return "\\u0026";
      case "\u2028":
        return "\\u2028";
      case "\u2029":
        return "\\u2029";
      default:
        return character;
    }
  });
}

function isFileMissing(error: unknown) {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: string }).code === "FileNotFound"
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function getNonce() {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  let nonce = "";
  for (let index = 0; index < 32; index += 1) {
    nonce += alphabet.charAt(Math.floor(Math.random() * alphabet.length));
  }
  return nonce;
}
