import { spawn } from "node:child_process";

export interface MeridianResult {
  code: number;
  stdout: string;
  stderr: string;
}

interface WorkspaceFolderLike {
  uri: {
    fsPath: string;
  };
}

export function runMeridian(args: string[], cwd: string): Promise<MeridianResult> {
  return new Promise((resolve) => {
    const child = spawn("python", ["-m", "meridian", ...args], {
      cwd,
      windowsHide: true
    });
    let stdout = "";
    let stderr = "";

    child.stdout.on("data", (chunk: Buffer | string) => {
      stdout += chunk.toString();
    });
    child.stderr.on("data", (chunk: Buffer | string) => {
      stderr += chunk.toString();
    });
    child.on("error", (error) => {
      resolve({
        code: -1,
        stdout,
        stderr: stderr ? `${stderr}${error.message}` : error.message
      });
    });
    child.on("close", (code) => {
      resolve({
        code: code ?? -1,
        stdout,
        stderr
      });
    });
  });
}

export function workspaceRoot(
  workspaceFolders: readonly WorkspaceFolderLike[] | undefined,
  selectedFolder?: WorkspaceFolderLike
) {
  return selectedFolder?.uri.fsPath ?? workspaceFolders?.[0]?.uri.fsPath ?? null;
}
