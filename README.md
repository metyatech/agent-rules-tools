# Compose AGENTS.md

This repository contains CLI tooling for composing per-project `AGENTS.md` files from modular rule sets.

It is intended to be used together with shared rule modules such as:

- `agent-rules/` (public rule modules)
- `agent-rules-private/` (optional, private-only rule modules)

## Install (global CLI)

After publishing to npm, install globally:

```sh
npm install -g compose-agentsmd
```

This provides the `compose-agentsmd` command.

## Rules setup (this repository)

This repository expects the public rules to be available at `agent-rules/rules` via the `agent-rules/` submodule.

Initialize submodules and compose the rules:

```sh
git submodule update --init --recursive
npm install
npm run compose
```

The default ruleset for this repository is `agent-ruleset.json` and currently composes the `node` domain into `AGENTS.md`.

## Compose

From each project root, run:

```sh
compose-agentsmd
```

The tool searches for `agent-ruleset.json` under the given root directory (default: current working directory), and writes output files as specified by each ruleset. If `output` is omitted, it defaults to `AGENTS.md`.

### Rules root resolution (important for global installs)

When installed globally, the rules directory is usually outside the project. You can point to it in either of the following ways:

```sh
compose-agentsmd --rules-root "C:/path/to/agent-rules/rules"
```

Or via environment variable:

```sh
set AGENT_RULES_ROOT=C:/path/to/agent-rules/rules
compose-agentsmd
```

Rules root resolution precedence is:

- `--rules-root` CLI option
- `AGENT_RULES_ROOT` environment variable
- `rulesRoot` in the ruleset file
- Default: `agent-rules/rules` relative to the ruleset file

## Project ruleset format

```json
{
  "output": "AGENTS.md",
  "domains": ["node", "unreal"],
  "rules": ["agent-rules-local/custom.md"]
}
```

- Global rules are always included from `agent-rules/rules/global`.
- `output` is optional; when omitted, `AGENTS.md` is used.
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
- `--rules-root <path>`: override the rules root for all rulesets (or set `AGENT_RULES_ROOT`)

## Development

```sh
npm install
npm run lint
npm run build
npm test
```
