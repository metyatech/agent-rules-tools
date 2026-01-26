# Compose AGENTS.md

This repository contains CLI tooling for composing per-project `AGENTS.md` files from modular rule sets.

## Release notes

See `CHANGELOG.md` for release notes.

It is intended to be used together with shared rule modules such as the public `agent-rules` repository.

## Install (global CLI)

After publishing to npm, install globally:

```sh
npm install -g compose-agentsmd
```

This provides the `compose-agentsmd` command.

## Rules setup (this repository)

The default ruleset for this repository is `agent-ruleset.json` and currently composes the `node` domain into `AGENTS.md` from the shared GitHub source.

## Compose

From each project root, run:

```sh
compose-agentsmd
```

The tool reads `agent-ruleset.json` from the given root directory (default: current working directory), and writes the output file specified by the ruleset. If `output` is omitted, it defaults to `AGENTS.md`.

The tool prepends a small "Tool Rules" block to every generated `AGENTS.md` so agents know how to regenerate or update rules.

## Setup (init)

For a project that does not have a ruleset yet, bootstrap one with `init`:

```sh
compose-agentsmd init --root path/to/project --yes
```

Defaults:

- `source`: `github:owner/repo@latest`
- `domains`: empty
- `extra`: empty
- `global`: omitted (defaults to `true`)
- `output`: `AGENTS.md`

Use `--dry-run` to preview actions, `--force` to overwrite existing files, and `--compose` to generate `AGENTS.md` immediately.

## Updating shared rules

For GitHub sources, the tool keeps two locations:

- Cache: `~/.agentsmd/cache/<owner>/<repo>/<ref>/` (read-only, used for compose)
- Workspace: `~/.agentsmd/workspace/<owner>/<repo>/` (editable)

Update flow:

```sh
compose-agentsmd edit-rules
# edit files under rules/ in the workspace
compose-agentsmd apply-rules
```

`edit-rules` clones the GitHub source into the workspace (or reuses it). `apply-rules` pushes the workspace (if clean) and regenerates `AGENTS.md` by refreshing the cache. If your `source` is a local path, `edit-rules` will just print that path and `apply-rules` will skip the push.

## Project ruleset format

Ruleset files accept JSON with `//` or `/* */` comments.

```jsonc
{
  // Rules source. Use github:owner/repo@ref or a local path.
  "source": "github:owner/repo@latest",
  // Domain folders under rules/domains.
  "domains": ["node", "unreal"],
  // Additional local rule files to append.
  "extra": ["agent-rules-local/custom.md"],
  // Output file name.
  "output": "AGENTS.md"
}
```

Ruleset keys:

- `source` (required): rules source. Use `github:owner/repo@ref` or a local path.
- `global` (optional): include `rules/global` (defaults to true). Omit this unless you want to disable globals.
- `domains` (optional): domain folders under `rules/domains/<domain>`.
- `extra` (optional): additional local rule files to append.
- `output` (optional): output file name (defaults to `AGENTS.md`).

### Ruleset schema validation

`compose-agentsmd` validates rulesets against `agent-ruleset.schema.json` on every run. If the ruleset does not conform to the schema, the tool exits with a schema error.

### Cache

Remote sources are cached under `~/.agentsmd/cache/<owner>/<repo>/<ref>/`. Use `--refresh` to re-fetch or `--clear-cache` to remove cached rules.

### Optional arguments

- `--root <path>`: project root (defaults to current working directory)
- `--ruleset <path>`: only compose a single ruleset file
- `--ruleset-name <name>`: override the ruleset filename (default: `agent-ruleset.json`)
- `--refresh`: refresh cached remote rules
- `--clear-cache`: remove cached remote rules and exit
- `--version` / `-V`: show version and exit
- `--verbose` / `-v`: show verbose diagnostics
- `--source <source>`: rules source for `init`
- `--domains <list>`: comma-separated domains for `init`
- `--extra <list>`: comma-separated extra rules for `init`
- `--output <file>`: output filename for `init`
- `--no-domains`: initialize with no domains
- `--no-extra`: initialize without extra rule files
- `--no-global`: initialize without global rules
- `--compose`: compose `AGENTS.md` after `init`
- `--dry-run`: show init plan without writing files
- `--yes`: skip init confirmation prompt
- `--force`: overwrite existing files during init
- `edit-rules`: prepare or locate a writable rules workspace
- `apply-rules`: push workspace changes (if GitHub source) and regenerate rules with refresh
- `init`: generate a new ruleset and optional local rules file

## Development

```sh
npm install
npm run lint
npm run build
npm test
```
