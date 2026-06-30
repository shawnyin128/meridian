import * as vscode from "vscode";
import { ResearchGraphPanel } from "./graphPanel";

export function activate(context: vscode.ExtensionContext) {
  context.subscriptions.push(
    vscode.commands.registerCommand("meridian.openResearchGraph", () => ResearchGraphPanel.open(context)),
    vscode.commands.registerCommand("meridian.refreshResearchGraph", () => ResearchGraphPanel.current?.refreshGraph()),
    vscode.commands.registerCommand("meridian.checkResearchGraph", () => ResearchGraphPanel.current?.checkGraph()),
    vscode.commands.registerCommand("meridian.revealSelectedNodeMarkdown", () =>
      ResearchGraphPanel.current?.revealSelectedNodeMarkdown()
    )
  );
}

export function deactivate() {}
