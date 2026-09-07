# Reclaim, in plain English

A walkthrough of the build: Reclaim, an 835 (ERA) ingestion feeder plus denial-analytics dashboard for Radicle Health / AccuBill.

---

## What it is

Reclaim is a small app that reads an 835 file, the electronic remittance a Medicaid payer sends back after you bill them, and does two things AccuBill can't do yet.

1. It drafts the payment and adjustment lines a biller would otherwise type in by hand — as proposed lines a human approves, never auto-posted.
2. It shows a denial dashboard: top denial reasons and dollars at risk, with recoverable denials held separate from routine contractual write-offs. (Aging AR is named as the next card, not built.)

Built in their exact stack (Lambda, DynamoDB, AppSync, Cognito, Pulumi, Vue).

---

## The gap it fills

Think of the billing cycle as two halves.

Money-out is where you send a claim to the payer. AccuBill already does this well. Full 837 generation, config, and pre-charge checks all shipped.

Money-in is where the payer pays, denies, or short-pays, and you reconcile it. This is the hole. AccuBill has a Payer Worksheets feature where a human manually types in what the payer paid and adjusted, reading it off "response data." Nothing automatically parses the 835 to fill those lines in, and there's no denial reporting at all. Their reporting suite is still marked "Beyond 2025."

So today a biller reads a remittance and hand-keys the results. Reclaim automates that feeder and adds the reporting layer manual posting can't give you.

---

## How it works

```
835 file → parse + map → match to charges → classify → draft proposed lines
(payer's  (tokenize, then  (service lines, by  (group code   (payment + adjustment,
 reply)    own 835 loop-    claim control        then CARC;    pending review)
           mapper)          number, in           check that   + compute $ at risk
                            DynamoDB)             it balances) + denial dashboard
```

CARC and RARC are the standard reason codes on a remittance, the codes that say "denied because X." Reclaim decodes them into plain English so the dashboard can say why money was denied.

---

## Why it's needed

Denial and AR recovery is the revenue lever in Medicaid billing. It's the metric Millin markets on ("cut denials 17%"), and a BillingBuilder reviewer complains it takes too long to resolve billing issues. So Reclaim hits a problem leadership already cares about. It sits right next to what the team just shipped (the fiscal payments/adjustments model) and what they're building next (Payer Worksheets), and it's fully provable from a hand-authored synthetic 835 (no PHI) and public reason codes, with no access to their real data.

The one-line pitch for the interview:

> "If you're building the Payer Worksheet posting UI, this is the 835 parser that feeds it and the denial analytics that follow it."

---

## Payer Worksheets: what it is, or is believed to be

Honest status first. There's no documentation for this feature. It shows up only as a permission ("create/review/approve worksheets to apply payments and adjustments") and a passing mention in another article. No screenshots, no how-to. So this is inferred from the docs, not stated by them.

What it's believed to be: the screen where a biller records what the payer actually paid.

The logic goes like this. You bill a payer $100 for a service. Weeks later the payer responds. Maybe they pay $80, deny $20, or pay nothing. Somebody has to write that outcome back into the system:

- $80 becomes a payment.
- $20 becomes an adjustment or write-off.

Those are the exact two record types AccuBill's Fiscal Periods article already defines: Payments, with adjudication and deposit dates, and Adjustments/Write-offs. A Payer Worksheet is believed to be the UI where a human keys those in, reading them off the payer's response.

The tell that it's manual is the View permission, which mentions the user seeing "response data received." A person looks at the response and types the numbers in. Nothing says a machine reads the 835 and fills it in. That manual step is the gap Reclaim automates.

One caveat worth holding. Because there's no article, the worksheet UI may still be in flight. That's why the pitch is framed as feeding and following it, not replacing it.

---

## One layer deeper on the three pieces

### 1. The 835 file: what it actually is

The 835 is the payer's explanation of payment, in a rigid text format called X12. It isn't human-readable. It's segments separated by delimiters. A tiny slice looks like this:

```
CLP*CLAIM123*1*100*80*20*MC*...
CAS*CO*45*20*...
```

Reading that:

- `CLP` is one claim. Charged $100, paid $80, patient/other $20, plus the claim control number (`CLAIM123`, the `CLP01`) that ties it back to what you billed — this is the join key.
- `CAS` is the adjustment. $20 was knocked off, for reason code 45 in group CO.

So one 835 carries which claim it is, how much was billed, how much was paid, and coded reasons for any difference. The parser's job is to turn that wall of segments into clean objects: claim CLAIM123, paid 80, adjusted 20, group CO reason 45. You don't hand-write the X12 tokenizer — you use a library like `x12-parser`. But you *do* own the mapping from segments into that object graph, because the same `CAS` appears at the claim level and the service-line level with different meaning, and telling them apart is the domain logic, not boilerplate.

### 2. CARC/RARC codes: the "why"

Those numbers in the `CAS` segment are CARC codes (Claim Adjustment Reason Codes), sometimes paired with RARC codes (Remittance Advice Remark Codes) that add detail. They're a national standard, a fixed dictionary of about 800 codes.

- CARC 45 is "charge exceeds fee schedule." You billed more than the payer's allowed rate. Usually a routine write-off, not a real loss.
- CARC 197 is "authorization missing/absent." A real denial you can fix and resubmit.
- CARC 96 is "non-covered charge."

The `CO` in front is the group code, and Reclaim reads it first: `CO` (contractual obligation) is a write-off you'd never chase, `PR` is patient responsibility, and a recoverable denial lives in an actionable group. Raw, a biller sees "CO-45." Decoded, they see "exceeds fee schedule." Reclaim ships a small JSON lookup of the roughly 20 most common codes, not all 800, so the dashboard shows plain English and, reading the group code first, separates routine contractual adjustments from recoverable denials. That separation is the whole point of denial analytics.

### 3. The matching logic: the actual proof

This is the piece the interviewers will probe hardest, because it's the domain reasoning, not boilerplate. The problem: the 835 references a claim, and you have to find the charge in your own system it belongs to and reconcile the money.

```
For each service line in the 835:
  1. Find the matching charge in DynamoDB by claim control number (CLP01)
       no match → flag as an unmatched line and move on
  2. Check the line balances: billed = paid + patient resp + Σ adjustments
       doesn't foot → flag as out-of-balance
  3. Compare billed vs. paid:
       paid == billed → clean payment, draft a payment line
       paid <  billed → short-paid, draft payment + adjustment line(s)
       paid == 0      → denial, draft the adjustment(s) + flag it
  4. For each CAS reason on the line, read the group code first, then the CARC:
       group CO (e.g. 45)                    → routine contractual write-off, not at risk
       actionable group + CARC (e.g. 197)    → recoverable denial
  5. Sum the recoverable denials → "dollars at risk"
Every drafted line is proposed, pending a human's approval — never auto-posted.
```

The output is the drafted worksheet lines — proposed payments and adjustments, one adjustment per CAS reason, mirroring their Fiscal Periods model and awaiting review — plus the denial figures the dashboard shows. Reconciling at the service-line grain (not the whole claim) matters because Medicaid denials land on individual lines. This core is pure TypeScript with zero AWS, which is why the plan says build and Jest-test it first. Even if all the cloud infra slips, this logic plus a README is the demo.
