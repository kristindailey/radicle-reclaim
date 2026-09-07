# Reclaim design decisions

The engineering decisions behind Reclaim, the 835 (ERA) feeder and denial-analytics build. This is the *how* and the reasoning for it. Domain terms are defined in [`CONTEXT.md`](./CONTEXT.md); coding standards and repo layout are in [`STANDARDS.md`](./STANDARDS.md).

Constraint held throughout: buildable solo in two working days, in Radicle Health's stack (Lambda, DynamoDB, AppSync, Cognito, Pulumi, Vue), from public and synthetic data only.

## Domain core

**Reconciliation grain is the service line, rolled up to the claim.** A real 835 carries adjustments at both the claim loop (`CLP` plus claim-level `CAS`) and the service-line loop (`SVC` plus line-level `CAS`), and Medicaid denials land on individual lines. So matching and classification happen at the line grain and aggregate to the claim for display. Where a fixture keeps a claim to one line, the code path stays line-aware anyway.

**The join key is `CLP01`, the claim control number this system assigned at 837 time.** Match 835 lines back to seeded charges on `CLP01` (the value echoed from `CLM01`), not `CLP07`, which is the payer's own control number and is stored only for resubmission and appeals. Fixtures round-trip: a seeded claim's control number equals the sample 835's `CLP01`.

**Classification reads the group code first, then the CARC.** The `CAS` group code (CO contractual, PR patient responsibility, PI payer-initiated, OA other) is the first-order signal. Dollars at risk is the sum of recoverable denials, actionable CARCs such as 197 in an actionable group, and explicitly excludes routine CO write-offs such as CARC 45. The two figures are surfaced separately, because that separation is the analysis AccuBill does not report today.

**Patient responsibility is its own bucket and its own tile.** PR (group PR) is a third bucket, distinct from CO contractual write-downs and from recoverable denials. It is not a contract write-down, and it is collectible from the patient rather than pursued from the payer. It falls out of group-code classification for free, and the dashboard gives it a dedicated tile. Folding PR into contractual adjustments would be a domain error, so the three-way split stays clean.

**The feeder emits proposed lines, one adjustment per `CAS` reason.** Reclaim drafts Payments and Adjustments in a pending-review state that a human approves. It never auto-posts. That review state is what makes this a feeder rather than a replacement, made structural. Each reconciled line yields one Payment (if paid) plus one Adjustment per `CAS` group and reason, so a single line that is both CO-contractual and PR-patient-responsibility keeps both, and its dollars land in the right buckets.

**Disposition is a per-line headline over per-adjustment classification.** Classification is per-`CAS`-reason, which is where the buckets and dollars at risk come from. A line's single disposition is then the highest-ranking of its outcomes by precedence: unmatched, out-of-balance, recoverable denial, contractual adjustment, other adjustment, clean payment. A split line shows one disposition in the table while its CO and PR dollars still land in the right buckets underneath.

**Balancing is validated.** An 835 self-foots. The raw identity is billed (`CLP03`) = paid (`CLP04`) + Σ(all claim `CAS` amounts), holding at both the line and claim grain, with the `BPR` transaction total tying to the sum of claim payments. Patient responsibility is one `CAS` group, so it counts toward that sum like any other adjustment; the dashboard breaks it out for display only. The core validates the identity and surfaces an out-of-balance line as its own disposition with a warning. This also catches errors in the hand-authored fixture before a demo does.

**Out-of-balance lines are excluded from dollars at risk.** A line whose amounts do not foot is still parsed, classified, and drafted into proposed lines, so the row is populated and can be clicked into, and it carries its balance warning. Its dollars stay out of the dollars-at-risk figure, because a number that does not foot cannot be trusted to contribute a reliable amount. A trustworthy headline figure beats one extra denial dollar.

**Money is integer cents, never floats.** Parse 835 amounts to integer cents, do all arithmetic in cents, and format to dollars only at the Vue display edge.

## Fixture

**One synthetic 835 exercising six outcomes across roughly three claims and five or six lines.** The outcomes are: a clean payment; a contractual short-pay (CO-45, not at risk); a recoverable denial (paid 0, authorization missing 197, at risk); a split line (CO and PR on one line); an unmatched line (a `CLP01` with no seeded charge); and one out-of-balance line so the balancing check visibly fires. This is the minimum that makes the analytics non-trivial.

**The fixture is hand-authored, structurally faithful, and carries zero PHI.** It follows real X12 structure (segment order, real CARC and group codes, footing amounts), with control numbers set to match seeded claims and hitting all six outcomes. Structure is sanity-checked against a public sample so the file is not malformed. The synthetic-data choice is stated in the blog and README.

## Data model and stack seam

**Ingest model: S3 event to an ingest Lambda to DynamoDB, with AppSync reads.** This is the serverless shape the role describes. It is designed this way whether or not AWS is stood up live, so the local core simulates it and the handler takes a file buffer. The demo narrates itself: drop an 835 in the bucket, proposed lines appear.

**Parser boundary: a library for X12 lexing, our own 835 loop-mapper on top.** `x12-parser` and `node-x12` both hand back segments, not a typed 835 graph, and the same `CAS` appears in the claim loop (2100) and the line loop (2110) with different meaning. So Reclaim does not hand-roll delimiter and segment parsing, but does own the tested mapping from segments into a typed `{ claim, lines[], adjustments[] }` graph, because that loop-context disambiguation is the domain logic.

**Parser locked to `x12-parser`, wrapped in a typed adapter.** `x12-parser` 1.3.0 is CommonJS and ships no TypeScript types. Since the typed loop-mapper is ours regardless, the missing types cost only a thin hand-written `.d.ts` shim, and the adapter boundary is where the typing belongs anyway.

**Single-table DynamoDB with deterministic idempotency keys.** `PK = CLAIM#<claimControlNumber>`; `SK ∈ {CHARGE, LINE#<n>, PROPPMT#<n>, PROPADJ#<n>-<group><carc>}`. A GSI (`GSI1PK = DISPOSITION#RECOVERABLE_DENIAL`) serves dollars at risk without a table scan. Each proposed line's key is derived from the 835 control number, claim control number, line, and `CAS` reason, so at-least-once redelivery and Lambda retries upsert instead of double-posting.

**AppSync auth: API key first, Cognito authorizer as a timeboxed upgrade.** Build end-to-end on an API key to reach a working state fast, then attempt the Cognito user-pool authorizer within a fixed timebox. If that runs long, keep the API key and document the Cognito authorizer and resolver design in the README.

## Dashboard

**One denials-focused screen, a ranked list rather than charts.** It has stat tiles (total remittance, paid, contractual adjustments, patient responsibility, dollars at risk as the headline, and unmatched count), a reconciliation table (claim control to line, billed, paid, adjustment with group and decoded CARC, disposition, and the proposed line in review), and top denial reasons by dollar as a ranked list of decoded CARCs. The ranked list mirrors AccuBill's own "why not billed" language, extended to money-in.

## Scope

Cut deliberately, and named as boundaries rather than gaps:

- **Aging AR.** A portfolio metric that is unconvincing on a three-claim fixture and would drag submission-date plumbing into the core. Named as the natural next card.
- **Observability and DataDog.** No traffic to observe. The Lambda still emits structured JSON logs (lines reconciled, dollars at risk, out-of-balance count, duration) so the metrics worth charting and alerting on are visible.
- **Money-out.** 837 generation, clearinghouse transmit, COB execution, and 271 parsing. Reclaim is on the money-in side.
- **Breadth.** The full 800-plus CARC and RARC set (roughly 20 ship), multi-payer and multi-tenant, and reversals, interest, and secondary claims.
