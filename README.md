# Agent Rules Tools

This repository contains shared tooling for composing per-project `AGENTS.md` files from modular rule sets.

It is intended to be used together with:

- `agent-rules/` (public rule modules)
- `agent-rules-private/` (optional, private-only rule modules)

## Compose

From each project root:

```sh
node agent-rules-tools/tools/compose-agents.cjs
```

The tool searches for `agent-ruleset.json` under the given root directory (default: current working directory), and writes output files as specified by each ruleset.

## Project ruleset format

```json
{
  "output": "AGENTS.md",
  "domains": ["node", "unreal"],
  "rules": ["agent-rules-local/custom.md"]
}
```

- Global rules are always included from `agent-rules/rules/global`.
- `domains` selects domain folders under `agent-rules/rules/domains`.
- `rules` is optional and appends additional rule files.

Optional path overrides:

- `rulesRoot`: override `agent-rules/rules`.
- `globalDir`: override `global` (relative to `rulesRoot`).
- `domainsDir`: override `domains` (relative to `rulesRoot`).

### Optional arguments

- `--root <path>`: project root (defaults to current working directory)
- `--ruleset <path>`: only compose a single ruleset file
- `--ruleset-name <name>`: override the ruleset filename (default: `agent-ruleset.json`)
