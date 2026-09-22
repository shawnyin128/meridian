import { describe, expect, it, vi } from "vitest";
import { commands, resetVscodeTestDouble, window } from "./vscodeTestDouble";
import { activate } from "../extension";

describe("activate", () => {
  it("registers a sidebar graph provider and routes the open command to the Meridian activity view", async () => {
    resetVscodeTestDouble();

    const context = {
      extensionPath: "D:/ext",
      extensionUri: { fsPath: "D:/ext" },
      subscriptions: []
    };

    activate(context as never);

    expect(window.registerWebviewViewProvider).toHaveBeenCalledWith(
      "meridian.researchGraph",
      expect.any(Object),
      {
        webviewOptions: {
          retainContextWhenHidden: true
        }
      }
    );

    const openRegistration = commands.registerCommand.mock.calls.find(
      ([command]) => command === "meridian.openResearchGraph"
    );
    expect(openRegistration).toBeTruthy();

    const openHandler = openRegistration?.[1] as () => Promise<void>;
    await openHandler();

    expect(commands.executeCommand).toHaveBeenCalledWith("workbench.view.extension.meridianResearch");
  });
});
