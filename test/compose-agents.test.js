import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const repoRoot = path.resolve(__dirname, "..");
const cliPath = path.join(repoRoot, "dist", "compose-agents.js");
const packageJson = JSON.parse(fs.readFileSync(path.join(repoRoot, "package.json"), "utf8"));

const writeFile = (filePath, content) => {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, content, "utf8");
};

const normalizeTrailingWhitespace = (content) => content.replace(/\s+$/u, "");
const normalizePath = (value) => value.replace(/\\/g, "/");
const stripJsonComments = (input) => {
  let output = "";
  let inString = false;
  let stringChar = "";
  let escaping = false;
  let inLineComment = false;
  let inBlockComment = false;

  for (let i = 0; i < input.length; i += 1) {
    const char = input[i];
    const next = input[i + 1];

    if (inLineComment) {
      if (char === "\n") {
        inLineComment = false;
        output += char;
      }
      continue;
    }

    if (inBlockComment) {
      if (char === "*" && next === "/") {
        inBlockComment = false;
        i += 1;
      }
      continue;
    }

    if (inString) {
      output += char;
      if (escaping) {
        escaping = false;
        continue;
      }
      if (char === "\\") {
        escaping = true;
        continue;
      }
      if (char === stringChar) {
        inString = false;
        stringChar = "";
      }
      continue;
    }

    if (char === "/" && next === "/") {
      inLineComment = true;
      i += 1;
      continue;
    }

    if (char === "/" && next === "*") {
      inBlockComment = true;
      i += 1;
      continue;
    }

    if (char === "\"" || char === "'") {
      inString = true;
      stringChar = char;
      output += char;
      continue;
    }

    output += char;
  }

  return output;
};
const TOOL_RULES = normalizeTrailingWhitespace(
  fs.readFileSync(path.join(repoRoot, "tools", "tool-rules.md"), "utf8")
);

const runCli = (args, options) =>
  execFileSync(process.execPath, [cliPath, ...args], {
    cwd: options.cwd,
    env: { ...process.env, ...options.env },
    encoding: "utf8",
    stdio: "pipe"
  });

const formatRuleBlock = (rulePath, body) => `Source: ${normalizePath(rulePath)}\n\n${body}`;

const withToolRules = (body) => `<!-- markdownlint-disable MD025 -->\n${TOOL_RULES}\n\n${body}`;

test("prints version with --version and -V", () => {
  const expected = `${packageJson.version}\n`;
  const stdoutLong = runCli(["--version"], { cwd: repoRoot });
  const stdoutShort = runCli(["-V"], { cwd: repoRoot });
  assert.equal(stdoutLong, expected);
  assert.equal(stdoutShort, expected);
});

test("prints verbose diagnostics with -v", () => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "compose-agentsmd-"));

  try {
    const projectRoot = path.join(tempRoot, "project");
    const sourceRoot = path.join(tempRoot, "rules-source");
    const rulesRoot = path.join(sourceRoot, "rules");

    writeFile(
      path.join(projectRoot, "agent-ruleset.json"),
      JSON.stringify(
        {
          source: path.relative(projectRoot, sourceRoot),
          global: true,
          output: "AGENTS.md"
        },
        null,
        2
      )
    );

    writeFile(path.join(rulesRoot, "global", "only.md"), "# Only\n1");

    const stdout = runCli(["-v", "--root", projectRoot], { cwd: repoRoot });
    assert.match(stdout, /Verbose:/u);
    assert.match(stdout, /Ruleset files:/u);
    assert.match(stdout, /Composed AGENTS\.md:/u);
  } finally {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
});



test("composes AGENTS.md using local source and extra rules", () => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "compose-agentsmd-"));

  try {
    const projectRoot = path.join(tempRoot, "project");
    const sourceRoot = path.join(tempRoot, "rules-source");
    const rulesRoot = path.join(sourceRoot, "rules");

    writeFile(
      path.join(projectRoot, "agent-ruleset.json"),
      JSON.stringify(
        {
          source: path.relative(projectRoot, sourceRoot),
          global: true,
          output: "AGENTS.md",
          domains: ["node"],
          extra: ["agent-rules-local/custom.md"]
        },
        null,
        2
      )
    );

    writeFile(path.join(projectRoot, "agent-rules-local", "custom.md"), "# Custom\nlocal");

    writeFile(path.join(rulesRoot, "global", "a.md"), "# Global A\nA");
    writeFile(path.join(rulesRoot, "global", "b.md"), "# Global B\nB");
    writeFile(path.join(rulesRoot, "domains", "node", "c.md"), "# Domain C\nC");

    const stdout = runCli(["--root", projectRoot], { cwd: repoRoot });
    assert.match(stdout, /Composed AGENTS\.md:/u);

    const outputPath = path.join(projectRoot, "AGENTS.md");
    const output = fs.readFileSync(outputPath, "utf8");

    const expected = withToolRules(
      [
        formatRuleBlock(path.join(rulesRoot, "global", "a.md"), "# Global A\nA"),
        formatRuleBlock(path.join(rulesRoot, "global", "b.md"), "# Global B\nB"),
        formatRuleBlock(path.join(rulesRoot, "domains", "node", "c.md"), "# Domain C\nC"),
        formatRuleBlock(path.join(projectRoot, "agent-rules-local", "custom.md"), "# Custom\nlocal")
      ].join("\n\n") + "\n"
    );

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
      /Missing ruleset file: .*agent-ruleset\.json/u
    );
  } finally {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
});

test("does not search for rulesets in subdirectories", () => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "compose-agentsmd-"));

  try {
    const nestedRoot = path.join(tempRoot, "nested");
    writeFile(
      path.join(nestedRoot, "agent-ruleset.json"),
      JSON.stringify(
        {
          source: path.relative(nestedRoot, path.join(tempRoot, "rules-source")),
          output: "AGENTS.md"
        },
        null,
        2
      )
    );

    assert.throws(
      () => runCli(["--root", tempRoot], { cwd: repoRoot }),
      /Missing ruleset file: .*agent-ruleset\.json/u
    );
  } finally {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
});

test("supports global=false to skip global rules", () => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "compose-agentsmd-"));

  try {
    const projectRoot = path.join(tempRoot, "project");
    const sourceRoot = path.join(tempRoot, "rules-source");
    const rulesRoot = path.join(sourceRoot, "rules");

    writeFile(
      path.join(projectRoot, "agent-ruleset.json"),
      JSON.stringify(
        {
          source: path.relative(projectRoot, sourceRoot),
          global: false,
          domains: ["node"],
          output: "AGENTS.md"
        },
        null,
        2
      )
    );

    writeFile(path.join(rulesRoot, "global", "only.md"), "# Only Global\n1");
    writeFile(path.join(rulesRoot, "domains", "node", "domain.md"), "# Domain\nD");

    runCli(["--root", projectRoot], { cwd: repoRoot });

    const output = fs.readFileSync(path.join(projectRoot, "AGENTS.md"), "utf8");
    assert.equal(
      output,
      withToolRules(formatRuleBlock(path.join(rulesRoot, "domains", "node", "domain.md"), "# Domain\nD") + "\n")
    );
  } finally {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
});

test("supports source path pointing to a rules directory", () => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "compose-agentsmd-"));

  try {
    const projectRoot = path.join(tempRoot, "project");
    const rulesRoot = path.join(tempRoot, "rules-root", "rules");
    const rulesRootRelative = path.relative(projectRoot, rulesRoot);

    writeFile(
      path.join(projectRoot, "agent-ruleset.json"),
      JSON.stringify(
        {
          output: "AGENTS.md",
          source: rulesRootRelative,
          global: true
        },
        null,
        2
      )
    );

    writeFile(path.join(rulesRoot, "global", "only.md"), "# Ruleset Root\nruleset");

    runCli(["--root", projectRoot], { cwd: repoRoot });

    const output = fs.readFileSync(path.join(projectRoot, "AGENTS.md"), "utf8");
    assert.equal(
      output,
      withToolRules(formatRuleBlock(path.join(rulesRoot, "global", "only.md"), "# Ruleset Root\nruleset") + "\n")
    );
  } finally {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
});

test("accepts rulesets with comments", () => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "compose-agentsmd-"));

  try {
    const projectRoot = path.join(tempRoot, "project");
    const sourceRoot = path.join(tempRoot, "rules-source");
    const rulesRoot = path.join(sourceRoot, "rules");
    const sourceRelative = path.relative(projectRoot, sourceRoot).replace(/\\/g, "/");

    writeFile(
      path.join(projectRoot, "agent-ruleset.json"),
      `{
  // rules source
  "source": "${sourceRelative}",
  "output": "AGENTS.md"
}
`
    );

    writeFile(path.join(rulesRoot, "global", "only.md"), "# Only\n1");

    runCli(["--root", projectRoot], { cwd: repoRoot });

    const output = fs.readFileSync(path.join(projectRoot, "AGENTS.md"), "utf8");
    assert.equal(
      output,
      withToolRules(formatRuleBlock(path.join(rulesRoot, "global", "only.md"), "# Only\n1") + "\n")
    );
  } finally {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
});

test("rejects invalid ruleset shapes with a clear error", () => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "compose-agentsmd-"));

  try {
    const projectRoot = path.join(tempRoot, "project");

    writeFile(
      path.join(projectRoot, "agent-ruleset.json"),
      JSON.stringify(
        {
          source: "",
          output: "",
          domains: ["node", ""],
          extra: ["valid.md", ""]
        },
        null,
        2
      )
    );

    assert.throws(
      () => runCli(["--root", projectRoot], { cwd: repoRoot }),
      /Invalid ruleset schema .*source|Invalid ruleset schema .*\/output/u
    );
  } finally {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
});

test("clears cached rules with --clear-cache", () => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "compose-agentsmd-"));

  try {
    const fakeHome = path.join(tempRoot, "home");
    const cacheRoot = path.join(fakeHome, ".agentsmd", "cache", "owner", "repo", "ref");
    fs.mkdirSync(cacheRoot, { recursive: true });
    fs.writeFileSync(path.join(cacheRoot, "marker.txt"), "cache", "utf8");

    const stdout = runCli(["--clear-cache"], {
      cwd: repoRoot,
      env: { USERPROFILE: fakeHome, HOME: fakeHome }
    });

    assert.match(stdout, /Cache cleared\./u);
    assert.equal(fs.existsSync(path.join(fakeHome, ".agentsmd", "cache")), false);
  } finally {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
});

test("edit-rules uses local source path as workspace", () => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "compose-agentsmd-"));

  try {
    const projectRoot = path.join(tempRoot, "project");
    const sourceRoot = path.join(tempRoot, "rules-source");

    writeFile(
      path.join(projectRoot, "agent-ruleset.json"),
      JSON.stringify(
        {
          source: path.relative(projectRoot, sourceRoot),
          output: "AGENTS.md"
        },
        null,
        2
      )
    );

    fs.mkdirSync(path.join(sourceRoot, "rules", "global"), { recursive: true });

    const stdout = runCli(["edit-rules", "--root", projectRoot], { cwd: repoRoot });
    assert.match(stdout, new RegExp(`Rules workspace: ${sourceRoot.replace(/\\/g, "\\\\")}`, "u"));
  } finally {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
});

test("apply-rules composes with refresh for local source", () => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "compose-agentsmd-"));

  try {
    const projectRoot = path.join(tempRoot, "project");
    const sourceRoot = path.join(tempRoot, "rules-source");
    const rulesRoot = path.join(sourceRoot, "rules");

    writeFile(
      path.join(projectRoot, "agent-ruleset.json"),
      JSON.stringify(
        {
          source: path.relative(projectRoot, sourceRoot),
          output: "AGENTS.md"
        },
        null,
        2
      )
    );

    writeFile(path.join(rulesRoot, "global", "only.md"), "# Only\n1");

    runCli(["apply-rules", "--root", projectRoot], { cwd: repoRoot });

    const output = fs.readFileSync(path.join(projectRoot, "AGENTS.md"), "utf8");
    assert.equal(
      output,
      withToolRules(formatRuleBlock(path.join(rulesRoot, "global", "only.md"), "# Only\n1") + "\n")
    );
  } finally {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
});

test("init creates a default ruleset with comments", () => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "compose-agentsmd-"));

  try {
    const projectRoot = path.join(tempRoot, "project");

    const stdout = runCli(["init", "--yes", "--root", projectRoot], { cwd: repoRoot });
    assert.match(stdout, /Initialized ruleset:/u);

    const rulesetPath = path.join(projectRoot, "agent-ruleset.json");
    const rulesetRaw = fs.readFileSync(rulesetPath, "utf8");
    assert.match(rulesetRaw, /\/\/ Rules source/u);
    assert.equal(/"global"\s*:/u.test(rulesetRaw), false);
    const ruleset = JSON.parse(stripJsonComments(rulesetRaw));

    assert.deepEqual(ruleset, {
      source: "github:owner/repo@latest",
      domains: [],
      extra: [],
      output: "AGENTS.md"
    });

    const localRulesPath = path.join(projectRoot, "agent-rules-local", "custom.md");
    assert.equal(fs.existsSync(localRulesPath), false);
  } finally {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
});

test("init --dry-run does not write files", () => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "compose-agentsmd-"));

  try {
    const projectRoot = path.join(tempRoot, "project");

    const stdout = runCli(["init", "--dry-run", "--root", projectRoot], { cwd: repoRoot });
    assert.match(stdout, /Dry run/u);
    assert.equal(fs.existsSync(path.join(projectRoot, "agent-ruleset.json")), false);
  } finally {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
});

test("init refuses to overwrite an existing ruleset without --force", () => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "compose-agentsmd-"));

  try {
    const projectRoot = path.join(tempRoot, "project");
    writeFile(path.join(projectRoot, "agent-ruleset.json"), JSON.stringify({ source: "local" }, null, 2));

    assert.throws(
      () => runCli(["init", "--yes", "--root", projectRoot], { cwd: repoRoot }),
      /Ruleset already exists/u
    );
  } finally {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
});
