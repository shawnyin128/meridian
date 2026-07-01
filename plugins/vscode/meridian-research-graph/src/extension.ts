import * as vscode from "vscode";
import { ResearchGraphPanel } from "./graphPanel";

export function activate(context: vscode.ExtensionContext) {
  context.subscriptions.push(
    vscode.commands.registerCommand("meridian.openResearchGraph", () => ResearchGraphPanel.open(context)),
    vscode.commands.registerCommand("meridian.refreshResearchGraph", async () => {
      const panel = ResearchGraphPanel.open(context);
      await panel.refreshGraph();
    }),
    vscode.commands.registerCommand("meridian.checkResearchGraph", async () => {
      const panel = ResearchGraphPanel.open(context);
      await panel.checkGraph();
    }),
    vscode.commands.registerCommand("meridian.revealSelectedNodeMarkdown", async () => {
      const panel = ResearchGraphPanel.open(context);
      await panel.revealSelectedNodeMarkdown();
    })
  );
}

export function deactivate() {}
