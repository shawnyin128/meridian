import { vi } from "vitest";

export const commands = {
  executeCommand: vi.fn(),
  registerCommand: vi.fn((_command: string, _handler: (...args: unknown[]) => unknown) => ({ dispose: vi.fn() }))
};

export const window = {
  registerWebviewViewProvider: vi.fn(() => ({ dispose: vi.fn() }))
};

export const workspace = {
  createFileSystemWatcher: vi.fn(() => ({
    dispose: vi.fn(),
    onDidChange: vi.fn(),
    onDidCreate: vi.fn(),
    onDidDelete: vi.fn()
  }))
};

export const Uri = {
  file: vi.fn((fsPath: string) => ({ fsPath, toString: () => fsPath })),
  joinPath: vi.fn((base: { fsPath: string }, ...parts: string[]) => ({
    fsPath: [base.fsPath, ...parts].join("/"),
    toString: () => [base.fsPath, ...parts].join("/")
  }))
};

export function resetVscodeTestDouble() {
  commands.executeCommand.mockReset();
  commands.registerCommand.mockClear();
  window.registerWebviewViewProvider.mockClear();
  workspace.createFileSystemWatcher.mockClear();
  Uri.file.mockClear();
  Uri.joinPath.mockClear();
}
