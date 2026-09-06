# `infra`

The Pulumi TypeScript stack for Reclaim. It stands up the serverless slice the [`core`](../core) reconcile engine sits inside: an S3 ingest bucket, the ingest Lambda, a single-table DynamoDB store, and an AppSync read API ([issue #20](https://github.com/kristindailey/radicle-reclaim/issues/20)).

> **Status:** scaffold ([issue #22](https://github.com/kristindailey/radicle-reclaim/issues/22)). The package builds, typechecks, and tests clean, and the Pulumi program previews with no resources declared. Every AWS resource lands in later tickets; this is the buildable shell they add to.

## Commands

Run from the repo root:

```bash
pnpm install
pnpm --filter infra build       # tsc, strict
pnpm --filter infra typecheck   # tsc --noEmit
pnpm --filter infra test        # Jest (ts-jest)
```

## Preview

`pulumi preview` runs the program in [`index.ts`](index.ts). With no resources declared yet, it reports a clean plan. Running it needs the Pulumi CLI and a selected stack:

```bash
pulumi stack init dev
pulumi preview
```
