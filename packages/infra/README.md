# `infra`

The Pulumi TypeScript stack for Reclaim. It stands up the serverless slice the [`core`](../core) reconcile engine sits inside: an S3 ingest bucket, the ingest Lambda, a single-table DynamoDB store, and an AppSync read API ([issue #20](https://github.com/kristindailey/radicle-reclaim/issues/20)).

> **Status:** the Pulumi program previews with no AWS resources declared yet; those land in later tickets. What is here today is the persistence contract ([issue #23](https://github.com/kristindailey/radicle-reclaim/issues/23), below), the load-bearing single-table schema every later infra ticket reads.

## Persistence contract

[`src/persistence`](src/persistence) is a pure, AWS-free mapping from a core `ReconciliationResult` to the DynamoDB items the store holds (D12), verifiable entirely in Jest:

- `buildItems(controlNumber, result)` returns one `CHARGE` per seeded claim, one `LINE#<n>` per reconciled line, and one proposed-line item per drafted Payment and Adjustment.
- Keys are deterministic, so a redelivered 835 upserts instead of double-posting: `PK = CLAIM#<claimControlNumber>`, `SK` in `{ CHARGE, LINE#<n>, PROPPMT#<n>, PROPADJ#<n>-<group><carc> }`. Proposed-line keys reuse the core's `ProposedLine.idempotencyKey`.
- Recoverable-denial lines carry `GSI1PK = DISPOSITION#RECOVERABLE_DENIAL`, so "dollars at risk" is served by a query, not a scan.
- The schema constants (`KEY_PREFIX`, `CHARGE_SK`, `GSI1`, `RECOVERABLE_DENIAL_GSI1PK`) are exported for later tickets to consume.

infra resolves `core` from its build output. Each script below builds `core` first (via a pre-script), so the commands are self-contained.

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
