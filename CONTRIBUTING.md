# Contributing

## Development setup
1. Install dependencies.
2. Run lint and tests before submitting changes.

```sh
npm ci
npm run lint
npm test
```

## Rules composition workflow
This repository treats `AGENTS.md` as a generated file.

- Do not edit `AGENTS.md` directly.
- Update the source rule modules under `agent-rules/rules/`.
- Regenerate with:

```sh
npm run compose
```

## Pull requests
- Keep changes scoped to the affected repository.
- Include tests for behavioral changes.
- Update `README.md` when usage or behavior changes.
