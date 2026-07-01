import * as vscode from "vscode";
import {
  MERIDIAN_RESEARCH_GRAPH_CONTAINER_ID,
  MERIDIAN_RESEARCH_GRAPH_VIEW_ID,
  ResearchGraphViewProvider
} from "./graphPanel";

export function activate(context: vscode.ExtensionContext) {
  const graphViewProvider = new ResearchGraphViewProvider(context);

  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider(MERIDIAN_RESEARCH_GRAPH_VIEW_ID, graphViewProvider, {
      webviewOptions: {
        retainContextWhenHidden: true
      }
    }),
    vscode.commands.registerCommand("meridian.openResearchGraph", async () => {
      await vscode.commands.executeCommand(`workbench.view.extension.${MERIDIAN_RESEARCH_GRAPH_CONTAINER_ID}`);
      graphViewProvider.reveal();
    }),
    vscode.commands.registerCommand("meridian.refreshResearchGraph", async () => {
      await graphViewProvider.refreshGraph();
    }),
    vscode.commands.registerCommand("meridian.checkResearchGraph", async () => {
      await graphViewProvider.checkGraph();
    }),
    vscode.commands.registerCommand("meridian.revealSelectedNodeMarkdown", async () => {
      await graphViewProvider.revealSelectedNodeMarkdown();
    })
  );
}

export function deactivate() {}
