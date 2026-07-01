import { EventEmitter } from "node:events";
import { describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  spawn: vi.fn()
}));

vi.mock("node:child_process", () => ({
  default: { spawn: mocks.spawn },
  spawn: mocks.spawn
}));

import { runMeridian, workspaceRoot } from "../meridianCli";

describe("runMeridian", () => {
  it("runs python -m meridian with cwd and captures output", async () => {
    const child = fakeChildProcess();
    mocks.spawn.mockReturnValueOnce(child);

    const resultPromise = runMeridian(["lab", "graph-check", "--lab-root", "D:\\repo"], "D:\\repo");

    child.stdout.emit("data", Buffer.from("ok\n"));
    child.stderr.emit("data", Buffer.from("warn\n"));
    child.emit("close", 0);

    await expect(resultPromise).resolves.toEqual({
      code: 0,
      stdout: "ok\n",
      stderr: "warn\n"
    });
    expect(mocks.spawn).toHaveBeenCalledWith("python", ["-m", "meridian", "lab", "graph-check", "--lab-root", "D:\\repo"], {
      cwd: "D:\\repo",
      windowsHide: true
    });
  });
});

describe("workspaceRoot", () => {
  it("prefers the selected graph workspace over the first workspace folder", () => {
    const first = { uri: { fsPath: "D:\\first" } };
    const selected = { uri: { fsPath: "D:\\selected" } };

    expect(workspaceRoot([first, selected], selected)).toBe("D:\\selected");
  });
});

function fakeChildProcess() {
  const child = new EventEmitter() as EventEmitter & {
    stdout: EventEmitter;
    stderr: EventEmitter;
  };
  child.stdout = new EventEmitter();
  child.stderr = new EventEmitter();
  return child;
}
