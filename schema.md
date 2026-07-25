# Agent Output Schema (v4 — canonical source of truth)

This is the contract every department agent (Product, Engineering, Security, Legal) and the
Moderator must follow exactly. Person 1 parses this on the backend. Person 3 mocks this on the
frontend. **Every other file in `/prompts` must match this document — if a prompt file's example
output doesn't match this schema field-for-field, the schema wins and the prompt file is wrong.**

## Controlled Vocabularies (defined once, used everywhere — do not redefine per-file)

There are two distinct enums in this system. They look similar but are NOT interchangeable, and
must be implemented as two separate types on the backend so a stray `===` comparison can't
silently pass when it shouldn't:

```typescript
// Used by: department agent `verdict`, challenge round `revised_verdict`,
// moderator `agent_alignment` values
type AgentVerdict = "approved" | "flagged" | "blocked";

// Used ONLY by: moderator's own top-level `decision` field
type ModeratorDecision = "approved" | "approved_with_conditions" | "blocked";
```

Why two enums instead of one: an individual agent only ever has three honest positions on a
proposal (fine / has a problem / no-go) — `flagged` covers "has a problem," replacing the earlier
ambiguous "concern," which collided with the `concerns` array name and was easy to mis-render.
The moderator's decision has a fourth real-world option that no single agent can hold —
"approved, but only if these actions happen" — which is a synthesis outcome, not a stance any one
department takes on its own. Keeping these as separate types means `agent.verdict ===
moderator.decision` is a type error, not a silent bug.

## Agent-specific extension fields

Not every agent needs the same top-level fields. An agent MAY include additional structured
fields beyond the base schema for its own bookkeeping — Product's `opportunity_cost_estimate` is
the current example (see `product_agent.md`) — subject to two rules:

1. It must be documented in that agent's own prompt file, not invented silently.
2. **It is not a substitute for `concerns`.** Structured bookkeeping data (a RICE estimate, a
   confidence score, a provisional number) does not belong in the `concerns` array unless it
   represents an actual finding someone needs to act on. Forcing every piece of collected data
   into a `concerns` entry just to "have somewhere to put it" corrupts `verdict` — a proposal
   with zero real findings should be able to output `verdict: "approved"` with an empty
   `concerns` array, even if the agent collected non-zero structured data along the way.

### Implementation note for Person 1 — do NOT use `.passthrough()`

The natural instinct when one agent has an extra field is to loosen the schema with
`.passthrough()`. **Don't do this** — it silently accepts any unvalidated field from any agent,
which undoes the whole point of the strict tag/category validation in "Backend validation" below.
An agent that starts hallucinating a stray field would sail through undetected.

Instead, enumerate every known extension field explicitly as `.optional()` on the shared base
schema. This keeps the schema closed (`.strict()` stays on) while still accepting the fields that
are actually supposed to exist:

```typescript
const OpportunityCostEstimateSchema = z.object({
  reach: z.enum(["low", "medium", "high", "massive"]),
  impact: z.enum(["minimal", "low", "medium", "high", "massive"]),
  confidence: z.enum(["low", "medium", "high"]),
  effort: z.enum(["small", "medium", "large", "massive"]),
  effort_source: z.enum(["provisional", "reconciled_with_engineering"]),
});

const DepartmentOutputSchema = z.object({
  agent: z.enum(["product", "engineering", "security", "legal"]),
  verdict: z.enum(["approved", "flagged", "blocked"]),
  summary: z.string(),
  concerns: z.array(ConcernSchema),
  confidence: z.number().min(0).max(1),
  // Agent-specific extension fields — add one line here per new field,
  // never open the whole schema with .passthrough():
  opportunity_cost_estimate: OpportunityCostEstimateSchema.optional(),
}).strict();
```

When Legal or Engineering introduce their own extension fields later, add them here the same
way — one named, typed, optional field per addition. This is a five-minute edit each time and
keeps validation airtight; `.passthrough()` would save that five minutes at the cost of the
entire strict-validation guarantee.

## Backend validation (for Person 1)

The Output validation self-check in `debate_protocol.md` is the agent's own responsibility, but
it's a soft check — a model can still emit an invalid tag despite being told not to. The backend
must enforce this with a real schema (Zod, JSON Schema, or equivalent):
- `category` and `tags` values checked against each agent's specific allowed list (not just
  "is this a string") — an invented near-synonym like `no_metrics` instead of `no_leading_metric`
  should fail validation, not pass through to the frontend.
- On validation failure: **retry the call once** with the validation error appended to the
  prompt (e.g. "your previous output used tag `no_metrics`, which isn't in the allowed list —
  use `no_leading_metric` or `no_lagging_metric` instead",) rather than silently dropping the
  invalid tag or crashing the request.
- This is two layers of defense, not one: the agent's own self-check catches most issues before
  they're even generated; the backend schema is the actual enforcement boundary that guarantees
  nothing malformed reaches Person 3's frontend.

## Department Agent Output

```json
{
  "agent": "security",
  "verdict": "approved" | "flagged" | "blocked",
  "summary": "One sentence, plain language, no jargon.",
  "concerns": [
    {
      "id": "sec-1",
      "category": "data_classification" | "stride" | "vendor_risk" | "compliance" | "controls_checklist" | "missing_information",
      "tags": ["confidential_tier", "gdpr"],
      "issue": "Short description of the specific risk, citing its basis.",
      "severity": "low" | "medium" | "high",
      "recommendation": "What should change to resolve this.",
      "responds_to": null,
      "status": "open" | "challenged" | "resolved" | "escalated",
      "requested_context": null
    }
  ],
  "confidence": 0.0
}
```

### Field notes

- **agent**: one of `product`, `engineering`, `security`, `legal`. Fixed per prompt, not model-decided.
- **verdict**: see `AgentVerdict` above.
- **summary**: max ~20 words. This is what renders on the agent's status card before anyone expands detail.
- **concerns**: can be an empty array if verdict is `approved`. Each concern needs its own `id` so
  other agents (and the moderator) can reference it directly instead of re-describing it.
- **category**: which review dimension this concern comes from. `missing_information` is special —
  see "Missing-information concerns" below, since it resolves differently from the others.
- **tags**: controlled-vocabulary strings only (no free invention) — this is what renders as
  badges/pills in the UI. Each department's prompt file defines its exact allowed tag list.
- **severity**: drives sort order and color coding on the frontend. Be consistent — `high` should
  mean "this alone could justify a block," not "this annoys me."
- **responds_to**: null on a first-pass review. In the challenge round, this holds the `id` of the
  concern being responded to, e.g. `"eng-2"`.
- **status**: tracks the concern through the debate lifecycle. See `debate_protocol.md` for the
  full state machine — including the separate resolution path for `missing_information` concerns,
  which do NOT follow the same domain-veto rule as risk-judgment concerns.
- **requested_context**: null by default. Used only when a `missing_information` concern exists
  because the agent's *retrieved* knowledge base didn't cover something it can tell is relevant
  from the proposal (a retrieval gap), as opposed to the *proposal* simply not stating a fact
  (a proposal gap). When set, it names the topic/section needed, e.g.
  `"credential storage / authentication data classification"`, and signals the backend to run a
  supplemental retrieval pass and re-invoke the agent — this is a system fix, not something for
  another agent to argue about in a challenge round. See `security_baseline.md` → Retrieval v2.
- **confidence**: 0–1, how sure the agent is in its own verdict given the information provided.

## Missing-information concerns (distinct resolution path)

A `missing_information` concern is not a risk judgment — it's a flag that the proposal (or the
retrieval) didn't supply a needed fact. It is resolved differently from all other categories:

- **Proposal gap** (the fact just isn't in the proposal yet): resolved the moment ANY agent
  supplies the fact in a challenge-round response — the domain owner does not get to "reject" a
  plain fact the way it would reject a risk mitigation. See `debate_protocol.md` for the full
  distinction between accepting a fact and evaluating a risk tradeoff.
- **Retrieval gap** (`requested_context` is set): resolved by the backend running supplemental
  retrieval and re-invoking the agent — never by another agent guessing on the raising agent's
  behalf.

## Challenge Round Output (used when an agent responds to another agent's concern)

```json
{
  "agent": "engineering",
  "responds_to": "sec-1",
  "stance": "agree" | "disagree" | "partially_agree" | "provides_fact",
  "response": "Direct reply to the specific concern, not a restatement of your own position.",
  "revised_verdict": "approved" | "flagged" | "blocked" | null
}
```

`stance: "provides_fact"` is used specifically when responding to a `missing_information`
concern with the actual missing detail (e.g. "target region is North America only") — this is
different from `agree`/`disagree`, which are risk-judgment stances. `revised_verdict` is null
unless this response actually changes the agent's original verdict.

## Moderator Output (final decision report)

```json
{
  "decision": "approved" | "approved_with_conditions" | "blocked",
  "decision_basis": "The specific rule from moderator_agent.md's Decision Policy that produced this outcome — required on every output, not optional.",
  "overall_summary": "2-3 sentences synthesizing the review.",
  "unresolved_risks": [
    { "concern_id": "sec-1", "agent": "security", "why_unresolved": "..." }
  ],
  "required_actions": [
    { "action": "...", "owner_agent": "security", "concern_id": "sec-1" }
  ],
  "agent_alignment": {
    "product": "approved",
    "engineering": "flagged",
    "security": "blocked",
    "legal": "approved"
  }
}
```

`agent_alignment` values use `AgentVerdict`, matching what each department actually output —
never re-derive or reinterpret them here.

## Design principles behind this schema

1. **Every concern is addressable, not just readable.** The `id` field is what makes the
   "structured debate" actually structured — without it, agents can only restate positions,
   not respond to each other.
2. **Verdicts are per-agent, decisions are moderator-only.** No single department agent decides
   the outcome. Enforced at the type level via the two separate enums above.
3. **Facts and risk judgments are resolved differently.** Accepting "target region is North
   America" is not the same kind of act as accepting "HTTPS is a sufficient mitigation" — the
   schema and protocol treat them differently on purpose, to avoid both false deadlocks and
   false agreement.
4. **Everything renders without extra logic.** Person 3 should be able to map `severity` directly
   to a color and `verdict` directly to a badge, with no additional interpretation needed on the
   frontend.