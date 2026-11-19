import { experimental_PluginRpcRefusal, type BbPluginApi } from "@get-bb/plugin-sdk";
import { hostContract, rpcContract } from "./contract.js";
import { parseTrustWarning } from "./trust.js";

function changed() {
  return new experimental_PluginRpcRefusal({
    code: "conflict",
    message: "The project, machine, or Codex profile changed. Review the current warning again.",
  });
}

export default function plugin(bb: BbPluginApi) {
  const host = bb.hosts.experimental_client({ contract: hostContract });

  async function resolve(threadId: string) {
    const thread = await bb.sdk.threads.get({ threadId });
    if (thread.providerId !== "codex" || !thread.environmentId || thread.archivedAt) return null;
    const [environment, events] = await Promise.all([
      bb.sdk.environments.get({ environmentId: thread.environmentId }),
      bb.sdk.threads.events.list({ threadId, types: ["provider/warning"], order: "desc", limit: "30" }),
    ]);
    if (!environment.path || !environment.hostId) return null;
    for (const row of events) {
      if (row.type !== "provider/warning" || row.data.category !== "config") continue;
      const target = parseTrustWarning(row.data.summary, environment.path);
      if (target) return { target: { ...target, hostId: environment.hostId, environmentId: thread.environmentId }, cwd: environment.path };
    }
    return null;
  }

  bb.rpc.register(rpcContract, {
    async inspect({ threadId }) {
      const current = await resolve(threadId);
      if (!current) return null;
      const { target, cwd } = current;
      const machine = (await bb.sdk.hosts.get({ hostId: target.hostId })).name;
      const state = await host.call("inspect", { ...target, cwd }, { hostId: target.hostId }).catch(() => "unavailable" as const);
      if (state === "obsolete" || state === "trusted") return null;
      return { ...target, machine, state: state === "pending" ? "ready" as const : "unavailable" as const };
    },
    async approve({ threadId, target }, context) {
      if (context.experimental_caller.kind !== "client") {
        throw new experimental_PluginRpcRefusal({ code: "forbidden", message: "Approve project trust from the BB thread card." });
      }
      const current = await resolve(threadId);
      if (!current || current.target.hostId !== target.hostId ||
          current.target.environmentId !== target.environmentId || current.target.projectPath !== target.projectPath ||
          current.target.configPath !== target.configPath || current.target.folderPath !== target.folderPath) throw changed();
      const { projectPath, configPath, folderPath, hostId } = current.target;
      try {
        return await host.call("approve", { projectPath, configPath, folderPath, cwd: current.cwd }, { hostId });
      } catch (error) {
        throw new experimental_PluginRpcRefusal({
          code: "conflict",
          message: error instanceof Error ? error.message : "Could not save project trust. Try again.",
        });
      }
    },
  });

  // Read only recent warning events when a Codex thread advances. Most advances
  // have no warning and are invisible to clients.
  const sequences = new Map<string, number>();
  bb.events.on("experimental_thread.events", async ({ thread, sequence }) => {
    if (thread.providerId !== "codex" || !thread.environmentId || thread.archivedAt) return;
    const previous = sequences.get(thread.id);
    if (previous !== undefined && sequence <= previous) return;
    sequences.delete(thread.id);
    sequences.set(thread.id, sequence);
    if (sequences.size > 256) sequences.delete(sequences.keys().next().value!);
    const events = await bb.sdk.threads.events.list({
      threadId: thread.id, types: ["provider/warning"], afterSeq: String(previous ?? Math.max(0, sequence - 30)),
      order: "desc", limit: "20",
    });
    if (events.some((event) => event.type === "provider/warning" && event.data.category === "config" &&
      event.data.summary?.startsWith("Project-local config, hooks, and exec policies are disabled"))) {
      bb.realtime.publish("warning", thread.id);
    }
  });
}
