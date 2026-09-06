# `infra`

The Pulumi TypeScript stack for Reclaim. It stands up the serverless slice the [`core`](../core) reconcile engine sits inside: an S3 ingest bucket, the ingest Lambda, a single-table DynamoDB store, and an AppSync read API ([issue #20](https://github.com/kristindailey/radicle-reclaim/issues/20)).

> **Status:** the Pulumi program provisions the single-table DynamoDB store ([issue #24](https://github.com/kristindailey/radicle-reclaim/issues/24), below); the S3 ingest bucket, the ingest Lambda, and the AppSync read API land in later tickets. The load-bearing persistence contract ([issue #23](https://github.com/kristindailey/radicle-reclaim/issues/23)) is the single-table schema every later infra ticket reads.

## Persistence contract

[`src/persistence`](src/persistence) is a pure, AWS-free mapping from a core `ReconciliationResult` to the DynamoDB items the store holds (D12), verifiable entirely in Jest:

- `buildItems(controlNumber, result)` returns one `CHARGE` per seeded claim, one `LINE#<n>` per reconciled line, and one proposed-line item per drafted Payment and Adjustment.
- Keys are deterministic, so a redelivered 835 upserts instead of double-posting: `PK = CLAIM#<claimControlNumber>`, `SK` in `{ CHARGE, LINE#<n>, PROPPMT#<n>, PROPADJ#<n>-<group><carc> }`. Proposed-line keys reuse the core's `ProposedLine.idempotencyKey`.
- Recoverable-denial lines carry `GSI1PK = DISPOSITION#RECOVERABLE_DENIAL`, so "dollars at risk" is served by a query, not a scan.
- The schema constants (`KEY_PREFIX`, `CHARGE_SK`, `GSI1`, `RECOVERABLE_DENIAL_GSI1PK`) are exported for later tickets to consume.

infra resolves `core` from its build output. Each script below builds `core` first (via a pre-script), so the commands are self-contained.

## Single-table store

[`index.ts`](index.ts) declares the DynamoDB table the contract targets (D12): `PK`/`SK` as the primary key, `PAY_PER_REQUEST` billing, and a `GSI1` partitioned on `GSI1PK` so "dollars at risk" is a query rather than a table scan. The key-attribute names and the GSI name come from the persistence-contract schema constants (`ATTR`, `GSI1`), so the table and the item builder cannot drift. The stack exports `tableName`.

## Seed

[`src/seed`](src/seed) writes the fixture `CHARGE` items to the live table after deploy, so a dropped six-outcome 835 has charges to round-trip against on `CLP01` (D20). `FIXTURE_CHARGES` is the single source of truth for the seeded charges (the persistence-contract test reconciles against the same list), and `seededChargeItem` / `chargeFromItem` are the pure mapping the round-trip rests on, unit-tested without AWS. The seed script writes the items and reads them back:

```bash
pnpm --filter infra build
RECLAIM_TABLE_NAME=$(pulumi stack output tableName) pnpm --filter infra seed
```

## Commands

Run from the repo root:

```bash
pnpm install
pnpm --filter infra build       # tsc, strict
pnpm --filter infra typecheck   # tsc --noEmit
pnpm --filter infra test        # Jest (ts-jest)
pnpm --filter infra seed        # write + read back the fixture charges (needs RECLAIM_TABLE_NAME)
```

## Deploy

`pulumi up` runs the program in [`index.ts`](index.ts), provisioning the table. Running it needs the Pulumi CLI, a selected stack, and AWS credentials:

```bash
pulumi stack init dev
pulumi up
RECLAIM_TABLE_NAME=$(pulumi stack output tableName) pnpm --filter infra seed
```
