# Reclaim

Serverless remittance reconciliation engine for Medicaid billing. Reconciles 835 (ERA) files against billed charges, drafts review-ready payment and adjustment lines, and surfaces denials and dollars at risk. A POC built in AccuBill's stack.

> This POC is not built by, endorsed by, or affiliated with Radicle Health in any way. It runs on hand-authored synthetic data (no PHI) and public reason codes with no access to any real system or data.

<img width="1529" height="819" alt="reclaim" src="https://github.com/user-attachments/assets/31c73cd2-60dc-4e9e-8e2d-97d82362b510" />

## The gap it fills

Medicaid billing has two halves. Money-out is where you send a claim to the payer and AccuBill already does this well. 837 generation, config, and pre-charge checks all shipped. Money-in is where the payer pays, denies, or short-pays and you reconcile what came back. That half has a possible hole.

AccuBill's docs point to a Payer Worksheets feature where a biller records what the payer paid and adjusted, keyed in by hand off the payer's response. It surfaces only as a permission, with no public documentation, so it may still be in build. Either way, nothing yet parses the 835 to fill those lines in automatically and there is no denial reporting behind them. The reporting suite is still marked "Beyond 2025." Denial and AR recovery is the revenue lever in Medicaid RCM.

Reclaim does the two things AccuBill can't yet:

1. It reads an 835 and drafts the payment and adjustment lines a biller would otherwise hand-key as proposed lines a human approves.
2. It shows a denial dashboard: top denial reasons and dollars at risk with recoverable denials held separate from routine contractual write-offs.

> If you're building the Payer Worksheet posting UI, this is the 835 parser that feeds it and the denial analytics that follow it. A feeder, not a replacement.

## Why it's worth building

Denial and AR recovery is the revenue lever in Medicaid billing. A competitor, Millin, markets on it (a 17% cut in denials). This is a problem leadership already cares about, sitting right next to what the team just shipped (the Fiscal Periods payments/adjustments model) and what they're possibly building next (Payer Worksheets).

## What it does

Reclaim reads an 835, the X12 remittance a Medicaid payer sends back after you bill, and does two things AccuBill can't yet.

1. It drafts the Payment and Adjustment lines a biller would otherwise type in, as **proposed lines a human approves**. That pending-review state is what makes this a feeder, not a replacement.
2. It shows a denial dashboard: top denial reasons and dollars at risk with recoverable denials held separate from routine contractual write-offs and from patient responsibility.

## How it works

```
835 file  ->  parse + map  ->  match to charges  ->  classify  ->  draft proposed lines
(payer's      (x12 lexer,       (service lines, by    (group code   (payment + adjustment,
 reply)        our own 835       claim control         then CARC,     pending review)
               loop-mapper)      number)               check foots)  + dollars at risk
```

The core reconciles at the service-line grain, because Medicaid denials land on individual lines, and rolls up to the claim for display. It classifies each adjustment on its group code first (CO contractual, PR patient responsibility, PI/OA payer-side) and then the CARC, so routine write-offs stay out of the at-risk figure. It validates that every line and claim foots and surfaces an out-of-balance line as its own outcome instead of trusting a number that doesn't add up. Money is integer cents end to end; dollars appear only at the Vue edge.

Six outcomes drive the demo, all from one hand-authored synthetic 835 with zero PHI: a clean payment, a contractual short-pay, a recoverable denial, a split line carrying both CO and PR, an unmatched line, and one out-of-balance line so the balancing check visibly fires.

## What's in the repo

pnpm workspace, three packages under `packages/`.

- `core` is the load-bearing proof: a pure-TypeScript reconcile engine with zero AWS. One entry point, `reconcile({ charges, raw835 })`, returns the whole typed result. The pipeline stages (match, classify, balance, dispose, propose, aggregate) each live in one file under `src/pipeline/`, and the X12 mapping is isolated in `src/adapter/`. 121 Jest cases across 20 files, including a fixture per outcome. Start here: [`packages/core/src/reconcile.ts`](packages/core/src/reconcile.ts).
- `infra` is the Pulumi stack: an S3 drop fires an ingest Lambda that writes to a single-table DynamoDB with deterministic idempotency keys, and AppSync serves the reads. [`packages/infra/index.ts`](packages/infra/index.ts).
- `web` is the Vue dashboard, a thin reader over one `reconcile()` result. It renders; it never reconciles.

I used a library (`x12-parser`) for X12 lexing but wrote the 835 loop-mapper myself, because the same `CAS` segment means different things in the claim loop and the service-line loop, and telling them apart is the domain logic, not boilerplate.

## Where to read next

- [`CONTEXT.md`](CONTEXT.md) is the domain glossary: 835, CARC, group code, dollars at risk, disposition, and the rest, defined as this build models them.
- [`DECISIONS.md`](DECISIONS.md) is the engineering decisions and the reasoning behind each one.
- [`STANDARDS.md`](STANDARDS.md) is the coding standards and repo layout.
- [`context/reclaim-explainer.md`](context/reclaim-explainer.md) is the whole thing in plain English, one layer deeper on the 835, the reason codes, and the matching logic.

## Honest scope

Built solo against a two-day budget from public reason codes and synthetic data only with no access to AccuBill's schema or real remittances. The record types mirror what AccuBill's Fiscal Periods docs define since I can't see the actual worksheet schema. Aging AR is named as the next dashboard card, not built. The value is meant to be the domain reasoning in `core` and the account of how it deploys, not production readiness.

## What I deferred

Cut for the timebox, tracked as open issues:

- **Cognito authorizer** ([#27](https://github.com/kristindailey/radicle-reclaim/issues/27)). AppSync runs on an API key. The Cognito user-pool upgrade was the explicit cut-ladder rung, isolated so the API-key path stays green.
- **Claim-level CAS in persistence** ([#40](https://github.com/kristindailey/radicle-reclaim/issues/40)). The core reconciles header-level reasons; the read side does not yet persist them. No impact on the demo fixture (every CAS sits under a service line), but a latent undercount for remittances carrying header-level adjustments.
- **Single-source fixture** ([#43](https://github.com/kristindailey/radicle-reclaim/issues/43)). Web keeps a copy of the six-outcome fixture, guarded by a drift test, rather than importing it from core.

Named but never built: aging AR (the natural next card), money-out (837 generation, COB), the full 800+ CARC set (Reclaim decodes the ~20 most common), and multi-payer or multi-tenant.

## Run it

```
pnpm install
pnpm -r test        
pnpm --filter web dev
```

`pnpm install` and `pnpm -r test` need nothing set up: the tests run against the checked-in synthetic fixture, no AWS, no env. That is where the proof lives.

`pnpm --filter web dev` reads from the deployed AppSync API, not the fixture, so it needs a live stack. Deploy `infra` (`pnpm --filter infra deploy`, then `seed`), copy the stack's `graphqlApiUrl` and `graphqlApiKey` into `packages/web/.env.local` (see `.env.example`), and the dashboard renders the six outcomes.
