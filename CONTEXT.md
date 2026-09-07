# AccuBill Reclaim: 835 Feeder — Domain Language

The domain glossary for an 835 (ERA) ingestion feeder plus denial-analytics dashboard, built as an audition piece for Radicle Health's AccuBill billing team. This is a glossary of the Medicaid remittance domain as this build models it, not a spec.

## Language

### The remittance and its grains

**835**:
The electronic remittance (ERA) a payer sends back after a claim is billed, in X12 format, stating what was paid, denied, or adjusted.
_Avoid_: ERA file (use "835"), remit (informal only)

**Claim**:
One billed submission for one patient, carried in an 835 as a `CLP` loop. Reconciliation rolls up to this grain for display.
_Avoid_: bill

**Service line**:
One billed service within a claim, carried in an 835 as an `SVC` segment. **The primary reconciliation grain** — matching and classification happen here, because Medicaid denials and cutbacks land on individual lines.
_Avoid_: line item, charge line

**Reconciliation grain**:
The level at which an 835 amount is matched and classified. This build reconciles at the **service-line** grain and aggregates to the **claim** grain for the dashboard.

### Identifiers (the join)

**Claim control number**:
The identifier this system assigned to a claim when it generated the 837, echoed back by the payer as `CLP01`. **The join key** from an 835 line back to a seeded charge.
_Avoid_: claim ID (ambiguous), patient control number (its X12 name, but avoid in prose)

**Payer control number**:
The payer's own internal claim identifier, carried as `CLP07`. Stored for resubmission and appeals; never the join key.
_Avoid_: claim ID

### Reason codes and classification

**CARC**:
Claim Adjustment Reason Code — the standardized code on a `CAS` segment stating why an amount was adjusted (e.g. 45, 197). A national dictionary of ~800; this build decodes the ~20 most common.
_Avoid_: reason code (ambiguous), denial code

**RARC**:
Remittance Advice Remark Code — a supplemental code that adds detail to a CARC. Secondary to the CARC.

**Group code**:
The X12 adjustment group on a `CAS` segment — **CO** (contractual obligation), **PR** (patient responsibility), **PI** (payer-initiated), **OA** (other). The **first-order** classification signal, read before the CARC.
_Avoid_: adjustment type

**Patient responsibility**:
An amount the payer assigns to the patient rather than writing off (group **PR**). A **third bucket**, distinct from both contractual adjustments and recoverable denials: not a write-down under contract, and not money pursued from the *payer* — it's collectible from the *patient*. Surfaced as its own dashboard figure; never folded into contractual adjustments and never counted toward dollars at risk.
_Avoid_: patient balance (reserve for AR), copay (only one form of it)

**Contractual adjustment**:
An expected write-down under the payer contract (group **CO**, e.g. CARC 45 "exceeds fee schedule"). Not recoverable and never counted as at-risk.
_Avoid_: write-off (reserve that for the posted record type), routine denial

**Recoverable denial**:
An adjustment representing money the provider can pursue by fixing and resubmitting or appealing (an actionable CARC such as 197 "authorization missing," in an actionable group). Counted toward dollars at risk.
_Avoid_: denial (ambiguous — could be contractual)

**Other adjustment**:
A payer-side `CAS` reason that is none of the three named buckets: not a `CO` contractual write-down, not `PR` patient responsibility, and not a recoverable denial. It is a non-actionable reason in an actionable group (`PI`/`OA`), or a malformed group. Kept out of both the contractual total and dollars at risk.

**Dollars at risk**:
The summed amount of recoverable denials. The headline denial-analytics figure; explicitly excludes contractual adjustments and patient responsibility. Also **excludes any line that is out of balance** — a line whose amounts don't foot can't be trusted to contribute a reliable figure, so the hero number stays trustworthy.
_Avoid_: denied dollars (ambiguous), lost revenue

### Posted records (mirroring AccuBill's Fiscal Periods model)

**Payment**:
A record of money the payer paid on a service line or claim, with adjudication and deposit dates. One of the two record types a Payer Worksheet posts.

**Adjustment**:
A record of an amount reduced from the billed charge, carrying its group code and CARC. The second record type a Payer Worksheet posts.

**Write-off**:
An adjustment the provider accepts as uncollectable (typically contractual). A disposition of an adjustment, not a separate parse output.

**Payer Worksheet**:
AccuBill's (believed) screen where a biller posts payments and adjustments read off a payer's response. This build **feeds** it with drafted lines; it does not replace it.

**Proposed line**:
A drafted Payment or Adjustment the feeder produces in a pending-review state, awaiting a human's approval before it becomes posted. Never auto-posted — this is what makes the build a feeder, not a replacement.
_Avoid_: draft (ambiguous), pending payment

**Unmatched line**:
An 835 service line whose claim control number finds no seeded charge. A first-class reconciliation outcome (surfaced, not dropped), because real remittances never fully match.
_Avoid_: orphan, error line

### Reconciliation outcomes

**Disposition**:
The **headline** classified outcome of one reconciled service line — a single label for the reconciliation table's disposition column. Classification itself is **per-adjustment** (each `CAS` reason is classified on its own, which is where dollars at risk and the buckets come from); the line's *disposition* is then the highest-ranking of its outcomes by precedence: **unmatched line** → **out-of-balance line** → **recoverable denial** → **contractual adjustment** → **other adjustment** → **clean payment**. So a split line carrying both a CO and a PR adjustment still shows one disposition, while its dollars land in the correct buckets underneath.

**Balancing**:
The self-footing property of an 835, and this build's source of truth for the invariant. The raw X12 identity is **billed = paid + Σ(all CAS amounts)**, holding at both the line and claim grain, with the transaction total tying to the sum of claim payments. Patient responsibility is one CAS group (**PR**), so it counts toward Σ like any other adjustment in the arithmetic — the dashboard breaks it out into its own bucket for display, but the balancing check does *not* treat it as a separate term. Reading the identity as "paid + patient responsibility + non-PR adjustments" is the same equation; summing all CAS amounts *and* adding PR again double-counts it. The core validates this.
_Avoid_: reconciling (overloaded), footing

**Out-of-balance line**:
A service line whose amounts do not foot. A first-class disposition surfaced as a warning — the balancing check firing.
