const fs = require("fs");
const path = require("path");

const DEFAULT_RULESET_NAME = "agent-ruleset.json";
const DEFAULT_RULES_ROOT = "agent-rules/rules";
const DEFAULT_GLOBAL_DIR = "global";
const DEFAULT_DOMAINS_DIR = "domains";
const DEFAULT_IGNORE_DIRS = new Set([
  ".git",
  "agent-rules",
  "agent-rules-private",
  "agent-rules-local",
  "agent-rules-tools",
  "node_modules",
  "dist",
  "build",
  "out",
  ".next",
  ".turbo",
  "coverage"
]);

const usage = `Usage: node agent-rules-tools/tools/compose-agents.cjs [--root <path>] [--ruleset <path>] [--ruleset-name <name>]

Options:
  --root <path>         Project root directory (default: current working directory)
  --ruleset <path>      Only compose a single ruleset file
  --ruleset-name <name> Ruleset filename to search for (default: agent-ruleset.json)
`;

const parseArgs = (argv) => {
  const args = {};

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];

    if (arg === "--help" || arg === "-h") {
      args.help = true;
      continue;
    }

    if (arg === "--root") {
      args.root = argv[i + 1];
      i += 1;
      continue;
    }

    if (arg === "--ruleset") {
      args.ruleset = argv[i + 1];
      i += 1;
      continue;
    }

    if (arg === "--ruleset-name") {
      args.rulesetName = argv[i + 1];
      i += 1;
      continue;
    }

    throw new Error(`Unknown argument: ${arg}`);
  }

  return args;
};

const normalizeTrailingWhitespace = (content) => content.replace(/\s+$/u, "");
const normalizePath = (filePath) => filePath.replace(/\\/g, "/");
const isNonEmptyString = (value) => typeof value === "string" && value.trim() !== "";

const resolveFrom = (baseDir, targetPath) => {
  if (path.isAbsolute(targetPath)) {
    return targetPath;
  }

  return path.resolve(baseDir, targetPath);
};

const ensureFileExists = (filePath) => {
  if (!fs.existsSync(filePath)) {
    throw new Error(`Missing file: ${filePath}`);
  }
};

const ensureDirectoryExists = (dirPath) => {
  if (!fs.existsSync(dirPath)) {
    throw new Error(`Missing directory: ${dirPath}`);
  }

  const stat = fs.statSync(dirPath);
  if (!stat.isDirectory()) {
    throw new Error(`Not a directory: ${dirPath}`);
  }
};

const readJsonFile = (filePath) => {
  const raw = fs.readFileSync(filePath, "utf8");
  return JSON.parse(raw);
};

const readProjectRuleset = (rulesetPath) => {
  const parsed = readJsonFile(rulesetPath);

  if (!isNonEmptyString(parsed.output)) {
    throw new Error(`Invalid ruleset output in ${rulesetPath}`);
  }

  if (parsed.domains !== undefined) {
    if (!Array.isArray(parsed.domains)) {
      throw new Error(`"domains" must be an array in ${rulesetPath}`);
    }

    for (const domain of parsed.domains) {
      if (!isNonEmptyString(domain)) {
        throw new Error(`"domains" entries must be non-empty strings in ${rulesetPath}`);
      }
    }
  }

  if (parsed.rules !== undefined) {
    if (!Array.isArray(parsed.rules)) {
      throw new Error(`"rules" must be an array in ${rulesetPath}`);
    }

    for (const rule of parsed.rules) {
      if (!isNonEmptyString(rule)) {
        throw new Error(`"rules" entries must be non-empty strings in ${rulesetPath}`);
      }
    }
  }

  return parsed;
};

const resolveRulesRoot = (rulesetDir, projectRuleset) => {
  if (isNonEmptyString(projectRuleset.rulesRoot)) {
    return resolveFrom(rulesetDir, projectRuleset.rulesRoot);
  }

  return path.resolve(rulesetDir, DEFAULT_RULES_ROOT);
};

const resolveGlobalRoot = (rulesRoot, projectRuleset) => {
  const globalDirName = isNonEmptyString(projectRuleset.globalDir)
    ? projectRuleset.globalDir
    : DEFAULT_GLOBAL_DIR;
  return path.resolve(rulesRoot, globalDirName);
};

const resolveDomainsRoot = (rulesRoot, projectRuleset) => {
  const domainsDirName = isNonEmptyString(projectRuleset.domainsDir)
    ? projectRuleset.domainsDir
    : DEFAULT_DOMAINS_DIR;
  return path.resolve(rulesRoot, domainsDirName);
};

const collectMarkdownFiles = (rootDir) => {
  ensureDirectoryExists(rootDir);

  const results = [];
  const pending = [rootDir];

  while (pending.length > 0) {
    const currentDir = pending.pop();
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

const addRulePaths = (rulePaths, resolvedRules, seenRules) => {
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

const composeRuleset = (rulesetPath, rootDir) => {
  const rulesetDir = path.dirname(rulesetPath);
  const projectRuleset = readProjectRuleset(rulesetPath);
  const outputPath = resolveFrom(rulesetDir, projectRuleset.output);

  const rulesRoot = resolveRulesRoot(rulesetDir, projectRuleset);
  const globalRoot = resolveGlobalRoot(rulesRoot, projectRuleset);
  const domainsRoot = resolveDomainsRoot(rulesRoot, projectRuleset);

  const resolvedRules = [];
  const seenRules = new Set();

  // Global rules always apply.
  addRulePaths(collectMarkdownFiles(globalRoot), resolvedRules, seenRules);

  const domains = Array.isArray(projectRuleset.domains) ? projectRuleset.domains : [];
  for (const domain of domains) {
    const domainRoot = path.resolve(domainsRoot, domain);
    addRulePaths(collectMarkdownFiles(domainRoot), resolvedRules, seenRules);
  }

  const directRules = Array.isArray(projectRuleset.rules) ? projectRuleset.rules : [];
  const directRulePaths = directRules.map((rulePath) => resolveFrom(rulesetDir, rulePath));
  addRulePaths(directRulePaths, resolvedRules, seenRules);

  const parts = resolvedRules.map((rulePath) =>
    normalizeTrailingWhitespace(fs.readFileSync(rulePath, "utf8"))
  );

  const lintHeader = "<!-- markdownlint-disable MD025 -->";
  const output = `${lintHeader}\n${parts.join("\n\n")}\n`;

  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, output, "utf8");

  return normalizePath(path.relative(rootDir, outputPath));
};

const findRulesetFiles = (rootDir, rulesetName) => {
  const results = [];
  const pending = [rootDir];

  while (pending.length > 0) {
    const currentDir = pending.pop();
    const entries = fs.readdirSync(currentDir, { withFileTypes: true });

    for (const entry of entries) {
      const entryPath = path.join(currentDir, entry.name);

      if (entry.isDirectory()) {
        if (DEFAULT_IGNORE_DIRS.has(entry.name)) {
          continue;
        }
        pending.push(entryPath);
        continue;
      }

      if (entry.isFile() && entry.name === rulesetName) {
        results.push(entryPath);
      }
    }
  }

  return results;
};

const getRulesetFiles = (rootDir, specificRuleset, rulesetName) => {
  if (specificRuleset) {
    const resolved = resolveFrom(rootDir, specificRuleset);
    ensureFileExists(resolved);
    return [resolved];
  }

  return findRulesetFiles(rootDir, rulesetName);
};

const main = () => {
  const args = parseArgs(process.argv.slice(2));

  if (args.help) {
    process.stdout.write(`${usage}\n`);
    return;
  }

  const rootDir = args.root ? path.resolve(args.root) : process.cwd();
  const rulesetName = args.rulesetName || DEFAULT_RULESET_NAME;
  const rulesetFiles = getRulesetFiles(rootDir, args.ruleset, rulesetName);

  if (rulesetFiles.length === 0) {
    throw new Error(`No ruleset files named ${rulesetName} found under ${rootDir}`);
  }

  const outputs = rulesetFiles
    .sort()
    .map((rulesetPath) => composeRuleset(rulesetPath, rootDir));

  process.stdout.write(`Composed AGENTS.md:\n${outputs.map((file) => `- ${file}`).join("\n")}\n`);
};

try {
  main();
} catch (error) {
  process.stderr.write(`${error.message}\n`);
  process.stderr.write(`${usage}\n`);
  process.exit(1);
}
