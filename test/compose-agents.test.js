const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { execFileSync } = require("node:child_process");

const repoRoot = path.resolve(__dirname, "..");
const cliPath = path.join(repoRoot, "dist", "compose-agents.js");

const writeFile = (filePath, content) => {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, content, "utf8");
};

const normalizeTrailingWhitespace = (content) => content.replace(/\s+$/u, "");
const normalizePath = (filePath) => filePath.replace(/\\/g, "/");

const collectMarkdownFiles = (rootDir) => {
  const results = [];
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

const runCli = (args, options) =>
  execFileSync(process.execPath, [cliPath, ...args], {
    cwd: options.cwd,
    env: { ...process.env, ...options.env },
    encoding: "utf8",
    stdio: "pipe"
  });

test("composes AGENTS.md using --rules-root override", () => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "compose-agentsmd-"));

  try {
    const projectRoot = path.join(tempRoot, "project");
    const rulesRoot = path.join(tempRoot, "rules", "rules");

    writeFile(
      path.join(projectRoot, "agent-ruleset.json"),
      JSON.stringify(
        {
          output: "AGENTS.md",
          domains: ["node"],
          rules: ["agent-rules-local/custom.md"]
        },
        null,
        2
      )
    );

    writeFile(path.join(projectRoot, "agent-rules-local", "custom.md"), "# Custom\nlocal");

    writeFile(path.join(rulesRoot, "global", "a.md"), "# Global A\nA");
    writeFile(path.join(rulesRoot, "global", "b.md"), "# Global B\nB");
    writeFile(path.join(rulesRoot, "domains", "node", "c.md"), "# Domain C\nC");

    const stdout = runCli(["--root", projectRoot, "--rules-root", rulesRoot], { cwd: repoRoot });
    assert.match(stdout, /Composed AGENTS\.md:/u);

    const outputPath = path.join(projectRoot, "AGENTS.md");
    const output = fs.readFileSync(outputPath, "utf8");

    const expected =
      "<!-- markdownlint-disable MD025 -->\n# Global A\nA\n\n# Global B\nB\n\n# Domain C\nC\n\n# Custom\nlocal\n";

    assert.equal(output, expected);
  } finally {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
});

test("fails fast when ruleset is missing", () => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "compose-agentsmd-"));

  try {
    assert.throws(
      () => runCli(["--root", tempRoot], { cwd: repoRoot }),
      /No ruleset files named agent-ruleset\.json found/u
    );
  } finally {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
});

test("supports AGENT_RULES_ROOT environment override", () => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "compose-agentsmd-"));

  try {
    const projectRoot = path.join(tempRoot, "project");
    const rulesRoot = path.join(tempRoot, "shared", "rules");

    writeFile(
      path.join(projectRoot, "agent-ruleset.json"),
      JSON.stringify(
        {
          output: "AGENTS.md"
        },
        null,
        2
      )
    );

    writeFile(path.join(rulesRoot, "global", "only.md"), "# Only Global\n1");

    runCli(["--root", projectRoot], {
      cwd: repoRoot,
      env: { AGENT_RULES_ROOT: rulesRoot }
    });

    const output = fs.readFileSync(path.join(projectRoot, "AGENTS.md"), "utf8");
    assert.equal(output, "<!-- markdownlint-disable MD025 -->\n# Only Global\n1\n");
  } finally {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
});

test("composes using default agent-rules submodule layout", () => {
  const submoduleRulesRoot = path.join(repoRoot, "agent-rules", "rules");
  if (!fs.existsSync(submoduleRulesRoot)) {
    throw new Error("agent-rules submodule is required for this test");
  }

  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "compose-agentsmd-"));

  try {
    const projectRoot = path.join(tempRoot, "project");
    const projectRulesRoot = path.join(projectRoot, "agent-rules", "rules");

    fs.mkdirSync(projectRoot, { recursive: true });
    fs.cpSync(submoduleRulesRoot, projectRulesRoot, { recursive: true });

    writeFile(
      path.join(projectRoot, "agent-ruleset.json"),
      JSON.stringify(
        {
          output: "AGENTS.md",
          domains: ["node"]
        },
        null,
        2
      )
    );

    runCli(["--root", projectRoot], { cwd: repoRoot });

    const outputPath = path.join(projectRoot, "AGENTS.md");
    const output = fs.readFileSync(outputPath, "utf8");
    assert.match(output, /^<!-- markdownlint-disable MD025 -->\n/u);

    const globalFiles = collectMarkdownFiles(path.join(projectRulesRoot, "global"));
    const firstGlobal = normalizeTrailingWhitespace(fs.readFileSync(globalFiles[0], "utf8"));
    assert.ok(firstGlobal.length > 0);
    assert.match(output, new RegExp(firstGlobal.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&"), "u"));
  } finally {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
});
