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
  if (selectedFolder) {
    return selectedFolder.uri.fsPath;
  }

  if (workspaceFolders?.length === 1) {
    return workspaceFolders[0].uri.fsPath;
  }

  return null;
}

export function summarizeMeridianOutput(
  result: { stdout: string; stderr: string },
  preferredStream: "stdout" | "stderr" = "stdout"
) {
  const preferred = preferredStream === "stderr" ? result.stderr || result.stdout : result.stdout || result.stderr;
  const output = preferred.trim().replace(/\s+/g, " ");
  if (output.length <= 220) {
    return output;
  }
  return `${output.slice(0, 217)}...`;
}
