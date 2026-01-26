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

const writeFile = (filePath, content) => {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, content, "utf8");
};

const TOOL_RULES = [
  "# Tool Rules (compose-agentsmd)",
  "- Before starting any work, run `compose-agentsmd` from the project root.",
  "- To update rules, update the source rule modules or ruleset, then rerun `compose-agentsmd`.",
  "- Do not edit `AGENTS.md` directly; update the source rules and regenerate."
].join("\n");

const runCli = (args, options) =>
  execFileSync(process.execPath, [cliPath, ...args], {
    cwd: options.cwd,
    env: { ...process.env, ...options.env },
    encoding: "utf8",
    stdio: "pipe"
  });

const withToolRules = (body) =>
  `<!-- markdownlint-disable MD025 -->\n${TOOL_RULES}\n\n${body}`;



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
      "# Global A\nA\n\n# Global B\nB\n\n# Domain C\nC\n\n# Custom\nlocal\n"
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
      /No ruleset files named agent-ruleset\.json found/u
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
    assert.equal(output, withToolRules("# Domain\nD\n"));
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
    assert.equal(output, withToolRules("# Ruleset Root\nruleset\n"));
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
    const cacheRoot = path.join(fakeHome, ".agentsmd", "owner", "repo", "ref");
    fs.mkdirSync(cacheRoot, { recursive: true });
    fs.writeFileSync(path.join(cacheRoot, "marker.txt"), "cache", "utf8");

    const stdout = runCli(["--clear-cache"], {
      cwd: repoRoot,
      env: { USERPROFILE: fakeHome, HOME: fakeHome }
    });

    assert.match(stdout, /Cache cleared\./u);
    assert.equal(fs.existsSync(path.join(fakeHome, ".agentsmd")), false);
  } finally {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
});