# Changelog

All notable changes to this project will be documented in this file.

## 1.0.1 - 2026-01-25
- Switched the package to ESM (`"type": "module"`, NodeNext compiler options).
- Hardened npm publish settings (`publishConfig.access`, `files`, `prepare`).
- Expanded test coverage for rules root precedence and ruleset validation.
- Added GitHub community health files and CI workflow.
- Regenerated `AGENTS.md` from the updated rule modules.

## 1.1.0 - 2026-01-26
- Added JSON Schema validation for rulesets with an explicit schema file.
- Prepended tool guidance rules to generated `AGENTS.md` files.
- Updated shared rule modules for JSON schema validation and English rule writing guidance.

## 1.1.1 - 2026-01-26
- Clarified that README updates must be edited at the same time as code changes in shared rules.

## 1.1.2 - 2026-01-26
- Clarified that version bumps must include both release creation and package publishing.

## 2.0.0 - 2026-01-26
- Switched ruleset format to `source/global/domains/extra` with remote GitHub sources and cache support in `~/.agentsmd`.
- Added `--refresh` and `--clear-cache` cache management commands.
- Updated ruleset schema, tests, and README to match the new format.

## 2.0.1 - 2026-01-26
- Moved the publish/global-update rule into local rules for this repository.

## 2.0.2 - 2026-01-26
- Externalized tool-inserted rules and usage text into `tools/`.
- Added rule guidance to externalize long embedded strings/templates when possible.

## 3.0.0 - 2026-01-26
- Removed recursive ruleset discovery; only the project root ruleset is composed unless `--ruleset` is provided.

## 3.1.0 - 2026-01-26
- Added `--version`/`-V` and `--verbose`/`-v` flags with verbose diagnostics output.
