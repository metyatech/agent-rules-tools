#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { execFileSync } from "node:child_process";
import { Ajv, type ErrorObject } from "ajv";

const DEFAULT_RULESET_NAME = "agent-ruleset.json";
const DEFAULT_OUTPUT = "AGENTS.md";
const DEFAULT_CACHE_ROOT = path.join(os.homedir(), ".agentsmd", "cache");
const DEFAULT_WORKSPACE_ROOT = path.join(os.homedir(), ".agentsmd", "workspace");
const RULESET_SCHEMA_PATH = new URL("../agent-ruleset.schema.json", import.meta.url);

type CliArgs = {
  help?: boolean;
  root?: string;
  ruleset?: string;
  rulesetName?: string;
  refresh?: boolean;
  clearCache?: boolean;
  command?: "compose" | "edit-rules" | "apply-rules";
};

const TOOL_RULES_PATH = new URL("../tools/tool-rules.md", import.meta.url);
const USAGE_PATH = new URL("../tools/usage.txt", import.meta.url);

const parseArgs = (argv: string[]): CliArgs => {
  const args: CliArgs = {};
  const knownCommands = new Set(["edit-rules", "apply-rules"]);
  const remaining = [...argv];

  if (remaining.length > 0 && knownCommands.has(remaining[0])) {
    args.command = remaining.shift() as "edit-rules" | "apply-rules";
  }

  for (let i = 0; i < remaining.length; i += 1) {
    const arg = remaining[i];

    if (arg === "--help" || arg === "-h") {
      args.help = true;
      continue;
    }

    if (arg === "--root") {
      const value = remaining[i + 1];
      if (!value) {
        throw new Error("Missing value for --root");
      }
      args.root = value;
      i += 1;
      continue;
    }

    if (arg === "--ruleset") {
      const value = remaining[i + 1];
      if (!value) {
        throw new Error("Missing value for --ruleset");
      }
      args.ruleset = value;
      i += 1;
      continue;
    }

    if (arg === "--ruleset-name") {
      const value = remaining[i + 1];
      if (!value) {
        throw new Error("Missing value for --ruleset-name");
      }
      args.rulesetName = value;
      i += 1;
      continue;
    }

    if (arg === "--refresh") {
      args.refresh = true;
      continue;
    }

    if (arg === "--clear-cache") {
      args.clearCache = true;
      continue;
    }

    throw new Error(`Unknown argument: ${arg}`);
  }

  return args;
};

const normalizeTrailingWhitespace = (content: string): string => content.replace(/\s+$/u, "");
const normalizePath = (filePath: string): string => filePath.replace(/\\/g, "/");
const isNonEmptyString = (value: unknown): value is string =>
  typeof value === "string" && value.trim() !== "";

const usage = normalizeTrailingWhitespace(fs.readFileSync(USAGE_PATH, "utf8"));

const rulesetSchema = JSON.parse(fs.readFileSync(RULESET_SCHEMA_PATH, "utf8"));
const TOOL_RULES = normalizeTrailingWhitespace(fs.readFileSync(TOOL_RULES_PATH, "utf8"));
const ajv = new Ajv({ allErrors: true, strict: false });
const validateRulesetSchema = ajv.compile(rulesetSchema);

const formatSchemaErrors = (errors: ErrorObject[] | null | undefined): string => {
  if (!errors || errors.length === 0) {
    return "Unknown schema validation error";
  }

  return errors
    .map((error) => {
      const pathLabel = error.instancePath ? error.instancePath : "(root)";
      return `${pathLabel} ${error.message ?? "is invalid"}`;
    })
    .join("; ");
};

const resolveFrom = (baseDir: string, targetPath: string): string => {
  if (path.isAbsolute(targetPath)) {
    return targetPath;
  }

  return path.resolve(baseDir, targetPath);
};

const ensureDir = (dirPath: string): void => {
  fs.mkdirSync(dirPath, { recursive: true });
};

const clearCache = (): void => {
  if (fs.existsSync(DEFAULT_CACHE_ROOT)) {
    fs.rmSync(DEFAULT_CACHE_ROOT, { recursive: true, force: true });
  }
};

const ensureFileExists = (filePath: string): void => {
  if (!fs.existsSync(filePath)) {
    throw new Error(`Missing file: ${filePath}`);
  }
};

const ensureDirectoryExists = (dirPath: string): void => {
  if (!fs.existsSync(dirPath)) {
    throw new Error(`Missing directory: ${dirPath}`);
  }

  const stat = fs.statSync(dirPath);
  if (!stat.isDirectory()) {
    throw new Error(`Not a directory: ${dirPath}`);
  }
};

const readJsonFile = (filePath: string): unknown => {
  const raw = fs.readFileSync(filePath, "utf8");
  return JSON.parse(raw);
};

type ProjectRuleset = {
  source: string;
  global?: boolean;
  domains?: string[];
  extra?: string[];
  output?: string;
};

const readProjectRuleset = (rulesetPath: string): ProjectRuleset => {
  const parsed = readJsonFile(rulesetPath);
  const isValid = validateRulesetSchema(parsed);
  if (!isValid) {
    const message = formatSchemaErrors(validateRulesetSchema.errors);
    throw new Error(`Invalid ruleset schema in ${rulesetPath}: ${message}`);
  }

  const ruleset = parsed as ProjectRuleset;
  if (ruleset.output === undefined) {
    ruleset.output = DEFAULT_OUTPUT;
  }
  if (ruleset.global === undefined) {
    ruleset.global = true;
  }

  return ruleset;
};

type GithubSource = {
  owner: string;
  repo: string;
  ref: string;
  url: string;
};

const collectMarkdownFiles = (rootDir: string): string[] => {
  ensureDirectoryExists(rootDir);

  const results: string[] = [];
  const pending = [rootDir];

  while (pending.length > 0) {
    const currentDir = pending.pop();
    if (!currentDir) {
      continue;
    }

    const entries = fs.readdirSync(currentDir, { withFileTypes: true });

    for (const entry of entries) {
      const entryPath = path.join(currentDir, entry.name);

      if (entry.isDirectory()) {
        pending.push(entryPath);
        continue;
      }

      if (entry.isFile() && path.extname(entry.name).toLowerCase() === ".md") {
        results.push(entryPath);
      }
    }
  }

  return results.sort((a, b) => {
    const relA = normalizePath(path.relative(rootDir, a));
    const relB = normalizePath(path.relative(rootDir, b));
    return relA.localeCompare(relB);
  });
};

const addRulePaths = (rulePaths: string[], resolvedRules: string[], seenRules: Set<string>): void => {
  for (const rulePath of rulePaths) {
    const resolvedRulePath = path.resolve(rulePath);
    if (seenRules.has(resolvedRulePath)) {
      continue;
    }
    ensureFileExists(resolvedRulePath);
    resolvedRules.push(resolvedRulePath);
    seenRules.add(resolvedRulePath);
  }
};

type ComposeOptions = {
  refresh?: boolean;
};

const sanitizeCacheSegment = (value: string): string => value.replace(/[\\/]/gu, "__");
const looksLikeCommitHash = (value: string): boolean => /^[a-f0-9]{7,40}$/iu.test(value);

const execGit = (args: string[], cwd?: string): string =>
  execFileSync("git", args, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();

const parseGithubSource = (source: string): GithubSource => {
  const trimmed = source.trim();
  if (!trimmed.startsWith("github:")) {
    throw new Error(`Unsupported source: ${source}`);
  }

  const withoutPrefix = trimmed.slice("github:".length);
  const [repoPart, refPart] = withoutPrefix.split("@");
  const [owner, repo] = repoPart.split("/");

  if (!isNonEmptyString(owner) || !isNonEmptyString(repo)) {
    throw new Error(`Invalid GitHub source (expected github:owner/repo@ref): ${source}`);
  }

  const ref = isNonEmptyString(refPart) ? refPart : "latest";
  return { owner, repo, ref, url: `https://github.com/${owner}/${repo}.git` };
};

const parseSemver = (tag: string): number[] | null => {
  const cleaned = tag.startsWith("v") ? tag.slice(1) : tag;
  const parts = cleaned.split(".");
  if (parts.length < 2 || parts.length > 3) {
    return null;
  }

  const numbers = parts.map((part) => Number(part));
  if (numbers.some((value) => Number.isNaN(value))) {
    return null;
  }

  return numbers;
};

const compareSemver = (a: number[], b: number[]): number => {
  const maxLength = Math.max(a.length, b.length);
  for (let i = 0; i < maxLength; i += 1) {
    const left = a[i] ?? 0;
    const right = b[i] ?? 0;
    if (left !== right) {
      return left - right;
    }
  }
  return 0;
};

const resolveLatestTag = (repoUrl: string): { tag?: string; hash?: string } => {
  const raw = execGit(["ls-remote", "--tags", "--refs", repoUrl]);
  if (!raw) {
    return {};
  }

  const candidates = raw
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [hash, ref] = line.split(/\s+/u);
      const tag = ref?.replace("refs/tags/", "");
      if (!hash || !tag) {
        return null;
      }
      const semver = parseSemver(tag);
      if (!semver) {
        return null;
      }
      return { hash, tag, semver };
    })
    .filter((item): item is { hash: string; tag: string; semver: number[] } => Boolean(item));

  if (candidates.length === 0) {
    return {};
  }

  candidates.sort((a, b) => compareSemver(a.semver, b.semver));
  const latest = candidates[candidates.length - 1];
  return { tag: latest.tag, hash: latest.hash };
};

const resolveHeadHash = (repoUrl: string): string => {
  const raw = execGit(["ls-remote", repoUrl, "HEAD"]);
  const [hash] = raw.split(/\s+/u);
  if (!hash) {
    throw new Error(`Unable to resolve HEAD for ${repoUrl}`);
  }
  return hash;
};

const resolveRefHash = (repoUrl: string, ref: string): string | null => {
  const raw = execGit(["ls-remote", repoUrl, ref, `refs/tags/${ref}`, `refs/heads/${ref}`]);
  if (!raw) {
    return null;
  }
  const [hash] = raw.split(/\s+/u);
  return hash ?? null;
};

const cloneAtRef = (repoUrl: string, ref: string, destination: string): void => {
  execGit(["clone", "--depth", "1", "--branch", ref, repoUrl, destination]);
};

const fetchCommit = (repoUrl: string, commitHash: string, destination: string): void => {
  ensureDir(destination);
  execGit(["init"], destination);
  execGit(["remote", "add", "origin", repoUrl], destination);
  execGit(["fetch", "--depth", "1", "origin", commitHash], destination);
  execGit(["checkout", "FETCH_HEAD"], destination);
};

const resolveGithubRulesRoot = (
  source: string,
  refresh: boolean
): { rulesRoot: string; resolvedRef: string } => {
  const parsed = parseGithubSource(source);
  const resolved = parsed.ref === "latest" ? resolveLatestTag(parsed.url) : null;
  const resolvedRef = resolved?.tag ?? (parsed.ref === "latest" ? "HEAD" : parsed.ref);
  const resolvedHash =
    resolved?.hash ??
    (resolvedRef === "HEAD"
      ? resolveHeadHash(parsed.url)
      : resolveRefHash(parsed.url, resolvedRef));

  if (!resolvedHash && !looksLikeCommitHash(resolvedRef)) {
    throw new Error(`Unable to resolve ref ${resolvedRef} for ${parsed.url}`);
  }

  const cacheSegment =
    resolvedRef === "HEAD" ? sanitizeCacheSegment(resolvedHash ?? resolvedRef) : sanitizeCacheSegment(resolvedRef);
  const cacheDir = path.join(DEFAULT_CACHE_ROOT, parsed.owner, parsed.repo, cacheSegment);

  if (refresh && fs.existsSync(cacheDir)) {
    fs.rmSync(cacheDir, { recursive: true, force: true });
  }

  if (!fs.existsSync(cacheDir)) {
    ensureDir(path.dirname(cacheDir));
    try {
      cloneAtRef(parsed.url, resolvedRef, cacheDir);
    } catch (error) {
      if (resolvedHash && looksLikeCommitHash(resolvedHash)) {
        fetchCommit(parsed.url, resolvedHash, cacheDir);
      } else if (looksLikeCommitHash(resolvedRef)) {
        fetchCommit(parsed.url, resolvedRef, cacheDir);
      } else {
        throw error;
      }
    }
  }

  const rulesRoot = path.join(cacheDir, "rules");
  ensureDirectoryExists(rulesRoot);

  return { rulesRoot, resolvedRef };
};

const resolveLocalRulesRoot = (rulesetDir: string, source: string): string => {
  const resolvedSource = resolveFrom(rulesetDir, source);
  if (!fs.existsSync(resolvedSource)) {
    throw new Error(`Missing source path: ${resolvedSource}`);
  }

  const candidate = path.basename(resolvedSource) === "rules" ? resolvedSource : path.join(resolvedSource, "rules");
  ensureDirectoryExists(candidate);
  return candidate;
};

const resolveWorkspaceRoot = (rulesetDir: string, source: string): string => {
  if (source.startsWith("github:")) {
    const parsed = parseGithubSource(source);
    return path.join(DEFAULT_WORKSPACE_ROOT, parsed.owner, parsed.repo);
  }

  return resolveFrom(rulesetDir, source);
};

const ensureWorkspaceForGithubSource = (source: string): string => {
  const parsed = parseGithubSource(source);
  const workspaceRoot = path.join(DEFAULT_WORKSPACE_ROOT, parsed.owner, parsed.repo);

  if (!fs.existsSync(workspaceRoot)) {
    ensureDir(path.dirname(workspaceRoot));
    execGit(["clone", parsed.url, workspaceRoot]);
  }

  if (parsed.ref !== "latest") {
    execGit(["fetch", "--all"], workspaceRoot);
    execGit(["checkout", parsed.ref], workspaceRoot);
  }

  return workspaceRoot;
};

const applyRulesFromWorkspace = (rulesetDir: string, source: string): void => {
  if (!source.startsWith("github:")) {
    return;
  }

  const workspaceRoot = ensureWorkspaceForGithubSource(source);
  const status = execGit(["status", "--porcelain"], workspaceRoot);
  if (status) {
    throw new Error(`Workspace has uncommitted changes: ${workspaceRoot}`);
  }

  const branch = execGit(["rev-parse", "--abbrev-ref", "HEAD"], workspaceRoot);
  if (branch === "HEAD") {
    throw new Error(`Workspace is in detached HEAD state: ${workspaceRoot}`);
  }

  execGit(["push"], workspaceRoot);
};

const resolveRulesRoot = (
  rulesetDir: string,
  source: string,
  refresh: boolean
): { rulesRoot: string; resolvedRef?: string } => {
  if (source.startsWith("github:")) {
    return resolveGithubRulesRoot(source, refresh);
  }

  return { rulesRoot: resolveLocalRulesRoot(rulesetDir, source) };
};

const composeRuleset = (rulesetPath: string, rootDir: string, options: ComposeOptions): string => {
  const rulesetDir = path.dirname(rulesetPath);
  const projectRuleset = readProjectRuleset(rulesetPath);
  const outputFileName = projectRuleset.output ?? DEFAULT_OUTPUT;
  const outputPath = resolveFrom(rulesetDir, outputFileName);

  const { rulesRoot } = resolveRulesRoot(rulesetDir, projectRuleset.source, options.refresh ?? false);
  const globalRoot = path.join(rulesRoot, "global");
  const domainsRoot = path.join(rulesRoot, "domains");

  const resolvedRules: string[] = [];
  const seenRules = new Set<string>();

  if (projectRuleset.global !== false) {
    addRulePaths(collectMarkdownFiles(globalRoot), resolvedRules, seenRules);
  }

  const domains = Array.isArray(projectRuleset.domains) ? projectRuleset.domains : [];
  for (const domain of domains) {
    const domainRoot = path.resolve(domainsRoot, domain);
    addRulePaths(collectMarkdownFiles(domainRoot), resolvedRules, seenRules);
  }

  const extraRules = Array.isArray(projectRuleset.extra) ? projectRuleset.extra : [];
  const directRulePaths = extraRules.map((rulePath) => resolveFrom(rulesetDir, rulePath));
  addRulePaths(directRulePaths, resolvedRules, seenRules);

  const parts = resolvedRules.map((rulePath) =>
    normalizeTrailingWhitespace(fs.readFileSync(rulePath, "utf8"))
  );

  const lintHeader = "<!-- markdownlint-disable MD025 -->";
  const toolRules = normalizeTrailingWhitespace(TOOL_RULES);
  const output = `${lintHeader}\n${[toolRules, ...parts].join("\n\n")}\n`;

  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, output, "utf8");

  return normalizePath(path.relative(rootDir, outputPath));
};

const getRulesetFiles = (rootDir: string, specificRuleset: string | undefined, rulesetName: string): string[] => {
  if (specificRuleset) {
    const resolved = resolveFrom(rootDir, specificRuleset);
    ensureFileExists(resolved);
    return [resolved];
  }

  const defaultRuleset = path.join(rootDir, rulesetName);
  if (!fs.existsSync(defaultRuleset)) {
    return [];
  }
  return [defaultRuleset];
};

const ensureSingleRuleset = (rulesetFiles: string[], rootDir: string, rulesetName: string): string => {
  if (rulesetFiles.length === 0) {
    const expectedPath = normalizePath(path.join(rootDir, rulesetName));
    throw new Error(`Missing ruleset file: ${expectedPath}`);
  }

  return rulesetFiles[0];
};

const main = (): void => {
  const args = parseArgs(process.argv.slice(2));

  if (args.help) {
    process.stdout.write(`${usage}\n`);
    return;
  }

  if (args.clearCache) {
    clearCache();
    process.stdout.write("Cache cleared.\n");
    return;
  }

  const rootDir = args.root ? path.resolve(args.root) : process.cwd();
  const rulesetName = args.rulesetName || DEFAULT_RULESET_NAME;
  const rulesetFiles = getRulesetFiles(rootDir, args.ruleset, rulesetName);
  const command = args.command ?? "compose";

  if (command === "edit-rules") {
    const rulesetPath = ensureSingleRuleset(rulesetFiles, rootDir, rulesetName);
    const rulesetDir = path.dirname(rulesetPath);
    const ruleset = readProjectRuleset(rulesetPath);

    let workspaceRoot = resolveWorkspaceRoot(rulesetDir, ruleset.source);
    if (ruleset.source.startsWith("github:")) {
      workspaceRoot = ensureWorkspaceForGithubSource(ruleset.source);
    }

    process.stdout.write(`Rules workspace: ${workspaceRoot}\n`);
    return;
  }

  if (command === "apply-rules") {
    const rulesetPath = ensureSingleRuleset(rulesetFiles, rootDir, rulesetName);
    const rulesetDir = path.dirname(rulesetPath);
    const ruleset = readProjectRuleset(rulesetPath);

    applyRulesFromWorkspace(rulesetDir, ruleset.source);
    const output = composeRuleset(rulesetPath, rootDir, { refresh: true });
    process.stdout.write(`Composed AGENTS.md:\n- ${output}\n`);
    return;
  }

  if (rulesetFiles.length === 0) {
    const expectedPath = normalizePath(path.join(rootDir, rulesetName));
    throw new Error(`Missing ruleset file: ${expectedPath}`);
  }

  const outputs = rulesetFiles
    .sort()
    .map((rulesetPath) => composeRuleset(rulesetPath, rootDir, { refresh: args.refresh }));

  process.stdout.write(`Composed AGENTS.md:\n${outputs.map((file) => `- ${file}`).join("\n")}\n`);
};

try {
  main();
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`${message}\n`);
  process.stderr.write(`${usage}\n`);
  process.exit(1);
}
