import path from "node:path";

const notice = "Project-local config, hooks, and exec policies are disabled in the following folders until the project is trusted, but skills still load.";
const instruction = /^To load project-local config, hooks, and exec policies, add (.+) as a trusted project in (.+)\.$/;

export interface TrustTarget {
  projectPath: string;
  configPath: string;
  folderPath: string;
}

export function pathsFor(value: string) {
  return /^(?:[A-Za-z]:[\\/]|\\\\)/.test(value) ? path.win32 : path.posix;
}

export function containsPath(parent: string, child: string) {
  const paths = pathsFor(parent);
  if (!paths.isAbsolute(parent) || !paths.isAbsolute(child)) return false;
  const relative = paths.relative(parent, child);
  return relative !== ".." && !relative.startsWith(`..${paths.sep}`) && !paths.isAbsolute(relative);
}

function isCleanPath(value: string) {
  const paths = pathsFor(value);
  return paths.isAbsolute(value) && paths.normalize(value) === value &&
    paths.parse(value).root !== value && !/[\u0000-\u001f\u007f]/u.test(value);
}

export function parseTrustWarning(summary: string | undefined, cwd: string): TrustTarget | null {
  if (!summary?.startsWith(`${notice}\n`) || summary.length > 32_768) return null;
  const lines = summary.split("\n");
  const candidates: TrustTarget[] = [];
  for (let i = 1; i < lines.length - 1; i += 2) {
    const row = /^\s+\d+\. (.+)$/.exec(lines[i]);
    const detail = instruction.exec(lines[i + 1].trim());
    if (!row || !detail) return null;
    const folderPath = row[1];
    const [, projectPath, configPath] = detail;
    if (![folderPath, projectPath, configPath].every(isCleanPath)) return null;
    const paths = pathsFor(projectPath);
    if (paths.basename(folderPath) === ".codex" && paths.basename(configPath) === "config.toml" &&
        containsPath(projectPath, paths.dirname(folderPath)) &&
        containsPath(paths.dirname(folderPath), cwd)) {
      candidates.push({ projectPath, configPath, folderPath });
    }
  }
  candidates.sort((a, b) => b.projectPath.length - a.projectPath.length);
  return candidates[0] ?? null;
}

export function trustKey(projectPath: string) {
  return `projects.${JSON.stringify(projectPath)}.trust_level`;
}
