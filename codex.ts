import { spawn } from "node:child_process";
import { homedir } from "node:os";
import { createInterface } from "node:readline";

type Request = (method: string, params: object) => Promise<unknown>;

export async function withCodex<T>(signal: AbortSignal, action: (request: Request) => Promise<T>): Promise<T> {
  const child = spawn("codex", ["app-server", "--listen", "stdio://"], {
    cwd: homedir(),
    stdio: ["pipe", "pipe", "ignore"],
    signal: AbortSignal.any([signal, AbortSignal.timeout(10_000)]),
    windowsHide: true,
  });
  let processError: Error | undefined;
  child.on("error", () => { processError = new Error("Could not start Codex App Server on this machine."); });
  child.stdin.on("error", () => { processError = new Error("The connection to Codex App Server closed."); });
  const lines = createInterface({ input: child.stdout, crlfDelay: Infinity });
  const iterator = lines[Symbol.asyncIterator]();
  let nextId = 0;
  async function request(method: string, params: object): Promise<unknown> {
    const id = ++nextId;
    child.stdin.write(JSON.stringify({ jsonrpc: "2.0", id, method, params }) + "\n");
    for (;;) {
      const line = await iterator.next();
      if (line.done) throw processError ?? new Error("Codex App Server closed before responding.");
      const response = JSON.parse(line.value);
      if (response.id !== id) continue;
      if (response.error) {
        const reason = response.error?.data?.configWriteErrorCode;
        if (reason === "configVersionConflict") throw new Error("Codex settings changed. Review and try again.");
        throw new Error(method === "config/value/write"
          ? "Codex declined the settings change. Check its user configuration and try again."
          : "Codex could not read its user configuration.");
      }
      return response.result;
    }
  }
  try {
    await request("initialize", {
      clientInfo: { name: "bb-codex-project-trust", version: "1.0.1" },
    });
    child.stdin.write(JSON.stringify({ jsonrpc: "2.0", method: "initialized" }) + "\n");
    return await action(request);
  } finally {
    lines.close();
    child.kill();
  }
}
