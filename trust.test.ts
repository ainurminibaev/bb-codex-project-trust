import assert from "node:assert/strict";
import test from "node:test";
import { containsPath, parseTrustWarning, trustKey } from "./trust.js";

const headline = "Project-local config, hooks, and exec policies are disabled in the following folders until the project is trusted, but skills still load.";
const warning = (entries: Array<[string, string, string]>) => [
  headline,
  ...entries.flatMap(([folder, project, config], index) => [
    `    ${index + 1}. ${folder}`,
    `       To load project-local config, hooks, and exec policies, add ${project} as a trusted project in ${config}.`,
  ]),
  "",
].join("\n");

test("reads the trust scope from a Codex provider warning", () => {
  const configPath = "/home/user/.codex/config.toml";
  const warnings = warning([
    ["/work/a/.codex", "/work/a", configPath],
    ["/work/a/sub/.codex", "/work/a", configPath],
  ]);
  assert.deepEqual(parseTrustWarning(warnings, "/work/a/sub/pkg"), {
    projectPath: "/work/a", configPath, folderPath: "/work/a/.codex",
  });
  assert.equal(parseTrustWarning(warnings, "/work/another"), null);
  assert.equal(parseTrustWarning(warnings.replace(configPath, "config.toml"), "/work/a"), null);
  assert.equal(parseTrustWarning(warning([["/work/a/.codex", "/work", "/tmp/output.txt"]]), "/work/a"), null);
  assert.equal(parseTrustWarning(warning([["/work/a/.codex", "/", configPath]]), "/work/a"), null);
  assert.equal(parseTrustWarning("A different provider message", "/work/a"), null);
});

test("uses the nearest valid scope and handles spaces and dots", () => {
  const configPath = "/home/user/.codex/config.toml";
  const warnings = warning([
    ["/work/a/.codex", "/work/a", configPath],
    ["/work/a/my.project here/.codex", "/work/a/my.project here", configPath],
  ]);
  assert.equal(parseTrustWarning(warnings, "/work/a/my.project here")?.projectPath, "/work/a/my.project here");
  assert.equal(trustKey('/work/a "quoted".repo'), 'projects."/work/a \\"quoted\\".repo".trust_level');
  assert.equal(containsPath("/work/a", "/work/ab"), false);
});

test("compares native Windows paths on a non-Windows server", () => {
  const projectPath = String.raw`C:\work\my.project`;
  const folderPath = String.raw`C:\work\my.project\.codex`;
  const configPath = String.raw`C:\Users\Agent\.codex\config.toml`;
  const warnings = warning([[folderPath, projectPath, configPath]]);
  assert.deepEqual(parseTrustWarning(warnings, String.raw`c:\WORK\my.project\src`), { projectPath, folderPath, configPath });
  assert.equal(parseTrustWarning(warnings, String.raw`D:\work\my.project`), null);
});
