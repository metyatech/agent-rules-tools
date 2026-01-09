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

### Optional arguments

- `--root <path>`: project root (defaults to current working directory)
- `--ruleset <path>`: only compose a single ruleset file
- `--ruleset-name <name>`: override the ruleset filename (default: `agent-ruleset.json`)

