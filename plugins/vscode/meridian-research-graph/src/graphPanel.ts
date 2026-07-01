import * as fs from "node:fs";
import * as path from "node:path";
import * as vscode from "vscode";
import type { LabGraph } from "./webview/graphTypes";

export class ResearchGraphPanel {
  static current: ResearchGraphPanel | undefined;

  private readonly panel: vscode.WebviewPanel;
  private readonly watcher: vscode.FileSystemWatcher;
  private graph: LabGraph | null = null;

  static open(context: vscode.ExtensionContext) {
    if (ResearchGraphPanel.current) {
      ResearchGraphPanel.current.panel.reveal(vscode.ViewColumn.One);
      void ResearchGraphPanel.current.refreshGraph();
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
    void ResearchGraphPanel.current.refreshGraph();
    return ResearchGraphPanel.current;
  }

  private constructor(
    private readonly context: vscode.ExtensionContext,
    panel: vscode.WebviewPanel
  ) {
    this.panel = panel;
    this.watcher = vscode.workspace.createFileSystemWatcher("**/.meridian/graph/graph.json");
    this.watcher.onDidCreate(() => void this.refreshGraph());
    this.watcher.onDidChange(() => void this.refreshGraph());
    this.watcher.onDidDelete(() => void this.refreshGraph());

    this.panel.onDidDispose(() => this.dispose(), undefined, context.subscriptions);
    context.subscriptions.push(this.watcher);
  }

  async refreshGraph() {
    this.graph = await this.loadGraph();
    this.panel.webview.html = this.renderHtml(this.graph);
  }

  async checkGraph() {
    const status = this.graph?.health?.status ?? "unknown";
    await vscode.window.showInformationMessage(`Meridian graph health: ${status}`);
  }

  async revealSelectedNodeMarkdown() {
    await vscode.window.showInformationMessage("Node Markdown reveal is available in the next Meridian task.");
  }

  private async loadGraph(): Promise<LabGraph | null> {
    const graphUri = await findFirstReadableGraphUri();
    if (!graphUri) {
      return null;
    }

    try {
      const bytes = await vscode.workspace.fs.readFile(graphUri);
      const raw = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
      return JSON.parse(raw) as LabGraph;
    } catch (error) {
      if (isFileMissing(error)) {
        return null;
      }
      await vscode.window.showWarningMessage(`Could not read Meridian graph: ${String(error)}`);
      return null;
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

async function findFirstReadableGraphUri() {
  const workspaceFolders = vscode.workspace.workspaceFolders ?? [];
  for (const workspaceFolder of workspaceFolders) {
    const graphUri = vscode.Uri.joinPath(workspaceFolder.uri, ".meridian", "graph", "graph.json");
    try {
      await vscode.workspace.fs.readFile(graphUri);
      return graphUri;
    } catch (error) {
      if (!isFileMissing(error)) {
        throw error;
      }
    }
  }

  return null;
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

function escapeScriptJson(value: LabGraph | null) {
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

function getNonce() {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  let nonce = "";
  for (let index = 0; index < 32; index += 1) {
    nonce += alphabet.charAt(Math.floor(Math.random() * alphabet.length));
  }
  return nonce;
}
