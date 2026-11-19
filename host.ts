import { realpath, stat } from "node:fs/promises";
import path from "node:path";
import { experimental_defineHostEntry } from "@get-bb/plugin-sdk";
import { z } from "zod";
import { withCodex } from "./codex.js";
import { hostContract } from "./contract.js";
import { containsPath, trustKey, type TrustTarget } from "./trust.js";

type Request = (method: string, params: object) => Promise<unknown>;
type Target = TrustTarget & { cwd: string };

const configRead = z.object({
  layers: z.array(z.object({
    name: z.object({ type: z.string(), file: z.string().optional(), profile: z.string().nullish() }),
    config: z.unknown(),
    version: z.string(),
  })),
});
const projectsConfig = z.object({
  projects: z.record(z.string(), z.object({ trust_level: z.string().optional() })).optional(),
});
const configWrite = z.object({
  status: z.enum(["ok", "okOverridden"]),
  filePath: z.string(),
});

async function readTrust(request: Request, { configPath, projectPath }: Target) {
  const { layers } = configRead.parse(await request("config/read", { includeLayers: true }));
  const user = layers.find(({ name }) => name.type === "user" && !name.profile && name.file === configPath);
  if (!user) throw new Error("This host's Codex profile differs from the profile in the warning.");
  const projects = projectsConfig.parse(user.config).projects;
  return { version: user.version, trusted: projects?.[projectPath]?.trust_level === "trusted" };
}

async function stillApplies({ cwd, projectPath, folderPath }: Target) {
  try {
    const [actualCwd, actualProject, folder, info] = await Promise.all([
      realpath(cwd), realpath(projectPath), realpath(folderPath), stat(folderPath),
    ]);
    return info.isDirectory() && path.basename(folder) === ".codex" &&
      containsPath(actualProject, path.dirname(folder)) && containsPath(path.dirname(folder), actualCwd);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return false;
    throw error;
  }
}

const writing = new Set<string>();

export default experimental_defineHostEntry({
  contract: hostContract,
  handlers: {
    async inspect(target, { signal }) {
      if (!await stillApplies(target)) return "obsolete";
      return withCodex(signal, async (request) => (await readTrust(request, target)).trusted ? "trusted" : "pending");
    },
    async approve(target, { signal }) {
      if (writing.has(target.configPath)) throw new Error("Codex settings are being saved. Try again in a moment.");
      writing.add(target.configPath);
      try {
        if (!await stillApplies(target)) throw new Error("The project folder changed. Review the warning again.");
        return await withCodex<"trusted">(signal, async (request) => {
          const { version, trusted } = await readTrust(request, target);
          if (trusted) return "trusted";
          const result = configWrite.parse(await request("config/value/write", {
            keyPath: trustKey(target.projectPath),
            value: "trusted",
            mergeStrategy: "replace",
            filePath: target.configPath,
            expectedVersion: version,
          }));
          if (result.status === "okOverridden" || result.filePath !== target.configPath) {
            throw new Error("Codex saved the setting, but a different configuration layer takes precedence.");
          }
          if (!(await readTrust(request, target)).trusted) throw new Error("Could not verify the saved trust setting.");
          return "trusted";
        });
      } finally {
        writing.delete(target.configPath);
      }
    },
  },
});
