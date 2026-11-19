import { defineRpcContract } from "@get-bb/plugin-sdk";
import { z } from "zod";

const path = z.string().min(1).max(8192);
const thread = z.object({ threadId: z.string().regex(/^thr_[a-z0-9]+$/) });
export const targetSchema = z.object({
  projectPath: path,
  configPath: path,
  folderPath: path,
});
const identity = targetSchema.extend({
  hostId: z.string().min(1).max(128),
  environmentId: z.string().min(1).max(128),
});
export const promptSchema = identity.extend({
  machine: z.string(),
  state: z.enum(["ready", "unavailable"]),
});
const hostInput = targetSchema.extend({ cwd: path });

export const hostContract = defineRpcContract({
  inspect: { input: hostInput, output: z.enum(["pending", "trusted", "obsolete"]) },
  approve: { input: hostInput, output: z.literal("trusted") },
});

export const rpcContract = defineRpcContract({
  inspect: { input: thread, output: promptSchema.nullable() },
  approve: { input: thread.extend({ target: identity }), output: z.literal("trusted") },
});

export type TrustPrompt = z.infer<typeof promptSchema>;
