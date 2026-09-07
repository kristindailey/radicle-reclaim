# Coding Standards

## TypeScript

- Strict mode enabled
- No `any` types - use proper typing or `unknown`
- Define interfaces for all component props, AppSync responses, and data models; the core exports the shared shapes
- Use type inference where obvious, explicit types where helpful

## Repo layout

pnpm workspaces, three packages under `packages/` (D20):

- `core` - pure-TypeScript 835 reconcile engine, zero AWS, the load-bearing proof
- `infra` - Pulumi stack (S3, ingest Lambda, DynamoDB, AppSync)
- `web` - Vue dashboard, a thin reader over one `reconcile()` result

- Node 20 (`nodejs20.x` Lambda runtime)
- Shared compiler options in `tsconfig.base.json`; each package extends it
- Run scripts from the repo root: `pnpm --filter core test`

## Core engine

- One entry point: `reconcile({ charges, raw835 })` returning `ReconciliationResult`
- Keep it pure - no I/O, no AWS, no clock; downstream surfaces consume the result
- Pipeline stages live under `src/pipeline/`, one file per stage
- Parse X12 to the typed 835 graph at the adapter boundary (`src/adapter/`), nowhere else
- The `x12-parser` shim (`src/adapter/x12-parser.d.ts`) types only the surface we consume

## Money

- Every amount is integer cents, carried as the branded `Cents` type (D7)
- No float arithmetic behind the seam; `cents()` throws on a non-integer
- Parse 835 amounts to cents at the adapter boundary; format to dollars only at the Vue edge

## AWS and infra

- Ingest is S3 event to Lambda to DynamoDB, AppSync serves reads (D10)
- Single-table DynamoDB with deterministic idempotency keys so retries upsert, not double-post (D12)
- All infra in Pulumi TypeScript; no console-clicked resources
- Lambda emits structured JSON logs (lines reconciled, dollars at risk, out-of-balance count, duration)
- AppSync auth is API key first, Cognito authorizer as the timeboxed upgrade (D22)

## Vue

- Single-file components, `<script setup lang="ts">`, Composition API only
- Type props and emits with `defineProps<T>()` / `defineEmits<T>()`, no runtime prop objects
- The dashboard reads; it does not reconcile - render the `ReconciliationResult` the core produced
- Format cents to dollars here, at the display edge, and nowhere upstream
- Keep components focused; pull reusable logic into composables (`use*`)

## Naming

- Types/Interfaces: PascalCase (no prefix)
- Vue components: PascalCase (`DenialTable.vue`)
- Functions: camelCase
- Constants: SCREAMING_SNAKE_CASE
- Files: match the component or export, else kebab-case

## Testing

- Jest with ts-jest; tests live in `__tests__/`, named `*.test.ts`
- Test the core's logic - parsing, matching, classification, balancing, proposing
- Seed charges in-memory; the core takes no live AWS
- Fixtures (real 835 EDI) live under `__tests__/fixtures/`
- `pnpm --filter core test` must be green before commit and before merge

## Error handling

- Throw on programmer errors and impossible states (e.g. a float entering the cents domain)
- The out-of-balance validator flags claims that do not reconcile; it does not silently correct them

## Code Quality

- No commented-out code unless specified
- No unused imports or variables
- Keep functions under 50 lines

## Comments

Write code that explains itself; comment only what the code cannot say.
Over-commenting is a common AI tell, so resist it.

- Comment the **why**, not the **what**. Delete any comment that restates the code.
- No banner/header blocks, section dividers, or step-by-step narration of obvious
  code. A file does not need a comment announcing each region.
- A comment earns its place only when it captures something the code can't: a
  non-obvious decision, a gotcha or workaround, why a value is what it is, or a
  link to a spec or issue.
- Prefer self-documenting names and small functions over explanatory comments.
- Keep doc comments minimal: a one-line purpose on an exported type or function is
  plenty; don't write JSDoc that just repeats the signature.
- When in doubt, leave the comment out.

## Writing

- No em dashes (U+2014) in generated content: docs, comments, commit messages,
  READMEs, specs. They read as AI-generated.
- Use a hyphen for `term - description` separators; rephrase prose with commas,
  parentheses, or a colon. Avoid en dashes and the ellipsis character too.
