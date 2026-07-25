# Debate Protocol (State Machine)

Every concern raised by an agent goes through this exact lifecycle. No agent — including the
moderator — may deviate from it. This exists specifically to prevent two real LLM failure modes:
**infinite cyclic argument** and **hallucinated agreement just to end the conversation.**

## States

A concern's `status` field (added to the schema) is always one of:

```
open → challenged → resolved | escalated
```

- **open**: raised, no response yet.
- **challenged**: the concern owner's counterpart has responded at least once.
- **resolved**: the concern owner (not the challenger) has explicitly marked it resolved.
- **escalated**: max rounds reached without resolution → goes to the moderator, no further
  agent-to-agent exchange.

## Hard rules

1. **Maximum 2 rounds per concern.** Round 1 = initial response. Round 2 = the concern owner's
   reply to that response. After round 2, if not resolved, status becomes `escalated`
   automatically — this is not optional and no agent decides to "keep discussing."

2. **Only the concern owner can set status to `resolved`.** If Security raised `sec-1`, only
   Security can close it. Product proposing a mitigation does not resolve the concern — Security
   evaluating that mitigation and agreeing does.

3. **A verdict or status change requires citing what specifically changed.** An agent may not
   move from `blocked` to `flagged`, or close a concern, without pointing to a specific new fact
   introduced in the exchange (e.g. "Product committed to category-level data instead of
   itemized SKUs"). Agreement without a cited reason is invalid output — treat it as a
   hallucination and do not produce it.

4. **Domain-owner veto.** Security and Legal concerns can only be resolved by Security and Legal
   respectively, regardless of how compelling another agent's counterargument sounds. This
   mirrors how real review boards work — Engineering doesn't get to decide a security risk is
   acceptable; Security does, on the record.

5. **No new concerns during a challenge round.** A response to `sec-1` must be about `sec-1`.
   If Engineering thinks Security's rebuttal reveals a separate issue, that becomes a new
   concern with its own `id` and its own lifecycle — it does not extend or hijack the current
   exchange.

## Missing-information concerns follow a DIFFERENT resolution path

The domain-owner veto rule (Rule 4 above) exists for **risk judgments** — deciding whether a
mitigation is *sufficient*. It does not apply to **plain facts**, and treating a fact like a risk
judgment creates a real deadlock: if Security must "evaluate" Product simply stating the target
region the way it evaluates whether HTTPS is an adequate control, the concern can stay open
forever even when the actual gap has been closed.

So: split by what the concern actually is.

### Case A — Proposal gap (category: `missing_information`, no `requested_context` set)
The fact isn't in the proposal yet. Resolution:

1. Any agent may supply the fact in a challenge-round response, using `stance: "provides_fact"`
   (see `schema.md` → Challenge Round Output).
2. The moment a fact is supplied, the raising agent's NEXT action must be one of exactly two
   things — there is no third option, and "still open, unconvinced" is not valid here because
   there is nothing left to be unconvinced about:
   - **Accept and resolve**: the fact closes the gap, nothing further to assess → `status: resolved`,
     citing the fact received.
   - **Accept and re-raise**: the fact closes the gap AND reveals a real risk → resolve the
     `missing_information` concern (the question was answered) and raise a brand-new concern in
     the appropriate category citing the new fact. Example: Security asked for target region;
     Product says "North America, but we're including a beta cohort in Ireland" → `sec-3`
     (missing_information) resolves, and a new `sec-4` (category: `compliance`, tags: `["gdpr"]`)
     opens for the Ireland detail specifically.
3. What the raising agent may NOT do: leave a proposal-gap concern `open`/`escalated` after a
   fact has been supplied. A supplied fact is not something to reject — only something to accept
   and then assess for follow-on risk. Refusing to acknowledge a stated fact is treated the same
   as inventing a finding: invalid output.

### Case B — Retrieval gap (category: `missing_information`, `requested_context` is set)
The proposal may well contain enough information, but the agent's own retrieved knowledge base
didn't cover the relevant policy area (see `security_baseline.md` → Retrieval v2 for the concrete
example: "storing login credentials in Redis" not matching a keyword list). This is a system
problem, not a debate:

1. The agent does not wait for another agent to respond — this isn't addressed to Product or
   Engineering, it's addressed to the retrieval system.
2. The backend detects `requested_context` is non-null, runs a supplemental retrieval pass using
   that topic string, and re-invokes the same agent with the newly retrieved section(s) added to
   `knowledge_base`.
3. The agent then re-evaluates with the new information and either raises a substantive concern
   in the correct category or resolves cleanly. This never touches the round counter — it's not
   a challenge round, so it doesn't count against the 2-round limit.

### Why this split matters
Without it, every vague proposal risks becoming permanently `blocked` the moment any agent asks
a clarifying question, because the moderator treats any escalated Security/Legal concern as a
hard stop (`moderator_agent.md` → Decision Policy, Rule 1). A concern that only exists because a
fact hadn't been stated yet should never reach escalation once that fact is on the table — only
concerns representing genuine, evaluated risk disagreement should.

## Round example (matches the scenario you gave)

| Round | Agent | Action | Resulting status |
|---|---|---|---|
| 0 | Security | Raises `sec-1`: Confidential-tier data, no vendor DPA | `open` |
| 1 | Product | Responds: "we need this for launch, will use HTTPS" | `challenged` |
| 2 | Security | Responds: "HTTPS is transport security, doesn't address DPA/classification risk — rejecting the mitigation as insufficient" | `escalated` (round 2 reached, not resolved, domain owner did not close it) |

`sec-1` now goes to the moderator as an **unresolved risk**, not as a coin-flip between two
verdicts. The moderator does not re-litigate it — it applies the Decision Policy (see
`moderator_agent.md`), which treats unresolved Security/Legal concerns as blocking by default.

## Why 2 rounds, not "debate until resolved"

Unbounded rounds are exactly what causes cyclic arguments or fake consensus — the model has no
signal for when to stop, so it either loops or caves. Two rounds mirrors how real review
processes actually work: raise it, one chance to address it, one chance to evaluate that
response. If it's not resolved by then, it's a real disagreement that belongs in front of a
decision-maker (the moderator), not something to keep negotiating in the review layer.