# `core`

The pure-TypeScript 835 reconcile core. Zero AWS, exercised entirely through Jest. This is the audition's load-bearing proof; every downstream surface (the ingest Lambda, the AppSync reads, the Vue dashboard) is a thin consumer of its one result.

## The seam

One entry point ([issue #1](https://github.com/kristindailey/radicle-reclaim/issues/1)):

```ts
reconcile(input: {
  charges: Charge[];       // seeded charges, keyed by claim control number (CLP01)
  raw835: Buffer | string; // the raw X12 835 transaction
}): ReconciliationResult
```

`ReconciliationResult` carries `claims[]` (rolled up to the claim grain), `lines[]` (the flat service-line grain), `proposedLines[]` (drafted Payment/Adjustment lines, pending review), and `aggregates` (the dashboard stat-tile figures). The full shape lives in [`src/types.ts`](src/types.ts).

> **Status:** scaffold. The shape is settled and `reconcile` returns it zeroed. No outcome logic — parsing, matching, classification, balancing, and proposing land in later tickets.

## Money is integer cents (D7)

Every amount in this core is **integer cents**, carried as the branded [`Cents`](src/money.ts) type. 835 amounts parse to integer cents at the adapter boundary, every calculation stays in cents, and formatting to dollars happens only at the Vue display edge (out of scope here). No float arithmetic runs anywhere behind the seam — a billing engine doing money in JS floats is a tell. `cents()` throws on a non-integer, so a stray float can't enter the cents domain.

## The parser boundary (D11, D21)

`x12-parser` handles X12 lexing; this core owns the mapping from raw segments into the typed 835 graph, because the claim-loop-vs-line-loop `CAS` disambiguation is domain logic, not boilerplate. `x12-parser` is effectively untyped to consumers (its `exports` map ships no `types` condition), so a thin hand-written shim — [`src/adapter/x12-parser.d.ts`](src/adapter/x12-parser.d.ts) — types the surface we consume, at the adapter boundary where we want the typing to live.

## Commands

Run from the repo root:

```bash
pnpm install
pnpm --filter core test        # Jest
pnpm --filter core typecheck   # tsc --noEmit, strict
```
