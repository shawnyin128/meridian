import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const packageJsonPath = path.resolve(__dirname, "../../package.json");

describe("VS Code extension manifest", () => {
  it("contributes the Meridian Research Graph as an Activity Bar sidebar view", () => {
    const manifest = JSON.parse(fs.readFileSync(packageJsonPath, "utf-8"));

    expect(manifest.activationEvents).toContain("onView:meridian.researchGraph");
    expect(manifest.contributes.viewsContainers.activitybar).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "meridianResearch",
          title: "Meridian",
          icon: "media/meridian.svg"
        })
      ])
    );
    expect(manifest.contributes.views.meridianResearch).toEqual([
      expect.objectContaining({
        id: "meridian.researchGraph",
        name: "Research Graph",
        type: "webview"
      })
    ]);
    expect(manifest.files).toContain("media/**");
  });
});
