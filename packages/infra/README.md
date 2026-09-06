# `infra`

The Pulumi TypeScript stack for Reclaim. It stands up the serverless slice the [`core`](../core) reconcile engine sits inside: an S3 ingest bucket, the ingest Lambda, a single-table DynamoDB store, and an AppSync read API ([issue #20](https://github.com/kristindailey/radicle-reclaim/issues/20)).

> **Status:** the Pulumi program provisions the single-table DynamoDB store ([issue #24](https://github.com/kristindailey/radicle-reclaim/issues/24)), plus the S3 ingest bucket and the ingest Lambda that reconciles a dropped 835 into it ([issue #25](https://github.com/kristindailey/radicle-reclaim/issues/25), below); the AppSync read API lands in a later ticket. The load-bearing persistence contract ([issue #23](https://github.com/kristindailey/radicle-reclaim/issues/23)) is the single-table schema every later infra ticket reads.

## Persistence contract

[`src/persistence`](src/persistence) is a pure, AWS-free mapping from a core `ReconciliationResult` to the DynamoDB items the store holds (D12), verifiable entirely in Jest:

- `buildItems(controlNumber, result)` returns one `CHARGE` per seeded claim, one `LINE#<n>` per reconciled line, and one proposed-line item per drafted Payment and Adjustment.
- Keys are deterministic, so a redelivered 835 upserts instead of double-posting: `PK = CLAIM#<claimControlNumber>`, `SK` in `{ CHARGE, LINE#<n>, PROPPMT#<n>, PROPADJ#<n>-<group><carc> }`. Proposed-line keys reuse the core's `ProposedLine.idempotencyKey`.
- Recoverable-denial lines carry `GSI1PK = DISPOSITION#RECOVERABLE_DENIAL`, so "dollars at risk" is served by a query, not a scan.
- The schema constants (`KEY_PREFIX`, `CHARGE_SK`, `GSI1`, `RECOVERABLE_DENIAL_GSI1PK`) are exported for later tickets to consume.

infra resolves `core` from its build output. Each script below builds `core` first (via a pre-script), so the commands are self-contained.

## Single-table store

[`index.ts`](index.ts) declares the DynamoDB table the contract targets (D12): `PK`/`SK` as the primary key, `PAY_PER_REQUEST` billing, and a `GSI1` partitioned on `GSI1PK` so "dollars at risk" is a query rather than a table scan. The key-attribute names and the GSI name come from the persistence-contract schema constants (`ATTR`, `GSI1`), so the table and the item builder cannot drift. The stack exports `tableName`.

## Ingest Lambda

[`src/ingest`](src/ingest) is the demo spine (D10, D15): drop an 835 in the bucket and its proposed Payment and Adjustment lines appear in DynamoDB, matched against the seeded charges.

- [`handler.ts`](src/ingest/handler.ts) is the pure core the Lambda wraps: `handleIngest(raw835, charges)` runs `reconcile` and returns `{ result, logFigures }`, with no AWS in the loop, so the domain path is unit-tested over the fixture 835 buffer.
- [`lambda.ts`](src/ingest/lambda.ts) is the S3-triggered edge, where all AWS lives: it reads the object into a buffer, loads the seeded charges from the store, runs the pure handler, persists the result via `buildItems`, and emits one structured JSON log line per run (lines reconciled, dollars at risk, out-of-balance count, edge-measured duration). The reconciled `CHARGE` header merges onto the seeded charge rather than clobbering its billed lines.

`pnpm --filter infra bundle` writes `dist-lambda/lambda.js` (esbuild inlines the pure core and x12-parser; the `nodejs20.x` runtime supplies the AWS SDK), the artifact the Pulumi `ingest` function ships.

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
pnpm --filter infra bundle      # esbuild the ingest Lambda to dist-lambda/
pnpm --filter infra seed        # write + read back the fixture charges (needs RECLAIM_TABLE_NAME)
```

## Deploy

Pulumi's `nodejs` runtime runs the compiled `dist/index.js` (`main` in `package.json`), not [`index.ts`](index.ts) directly, and the Lambdas ship the bundled `dist-lambda/` and `dist-lambda-read/`. All three are build artifacts, so a bare `pulumi up` can deploy a stale stack. Use `pnpm --filter infra deploy`: its `predeploy` bundles the Lambdas and compiles the program first, then runs `pulumi up`. Deploying needs the Pulumi CLI, a selected stack, and AWS credentials:

```bash
pulumi stack init dev
pnpm --filter infra deploy
RECLAIM_TABLE_NAME=$(pulumi stack output tableName) pnpm --filter infra seed
```

Then the demo: drop the six-outcome fixture 835 in the bucket and its proposed lines land in DynamoDB against the seeded charges.

```bash
aws s3 cp ../core/src/__tests__/fixtures/six-outcomes.835.edi \
  "s3://$(pulumi stack output ingestBucketName)/six-outcomes.835.edi"
```
