import { ExecutionContext } from '@nitrostack/core';
import { LLMService, defaultLLMService } from '../shared/llm/llm.service.js';
import {
  DepartmentOutput,
  ChallengeRoundOutput,
  ChallengeRoundOutputSchema,
  Concern
} from '../shared/types.js';

export class DebateService {
  private llmService: LLMService;

  constructor(llmService?: LLMService) {
    this.llmService = llmService ?? defaultLLMService;
  }

  /**
   * Performs Estimate Reconciliation between Product and Engineering.
   * Product's provisional effort is updated to Engineering's authoritative size.
   */
  reconcileEstimates(
    productOutput: DepartmentOutput,
    engineeringOutput: DepartmentOutput
  ): { productOutput: DepartmentOutput; reconciled: boolean } {
    if (!productOutput.opportunity_cost_estimate || !engineeringOutput.effort_assessment) {
      return { productOutput, reconciled: false };
    }

    const engSize = engineeringOutput.effort_assessment.size;
    const prodEst = productOutput.opportunity_cost_estimate;

    const updatedEstimate = {
      ...prodEst,
      effort: engSize,
      effort_source: 'reconciled_with_engineering' as const
    };

    const isLargeOrMassive = engSize === 'large' || engSize === 'massive';
    const isLowImpact = prodEst.impact === 'minimal' || prodEst.impact === 'low';
    const isLowConfidence = prodEst.confidence === 'low';

    let updatedConcerns = [...productOutput.concerns];
    if (isLargeOrMassive && (isLowImpact || isLowConfidence)) {
      const exists = updatedConcerns.some(c => c.category === 'opportunity_cost');
      if (!exists) {
        updatedConcerns.push({
          id: `prod-opportunity-cost-reconciled`,
          category: 'opportunity_cost',
          tags: ['effort_mismatch', 'high_resource_bet'],
          issue: `Reconciled engineering effort is ${engSize}, which represents a high resource bet given ${isLowImpact ? 'low impact' : 'low confidence'}.`,
          severity: 'high',
          recommendation: 'Re-evaluate ROI or trim scope to reduce effort size.',
          responds_to: null,
          status: 'open',
          requested_context: null
        });
      }
    }

    const hasHigh = updatedConcerns.some(c => c.severity === 'high');
    const hasMedium = updatedConcerns.some(c => c.severity === 'medium');
    const updatedVerdict = hasHigh ? 'blocked' : hasMedium ? 'flagged' : productOutput.verdict;

    return {
      productOutput: {
        ...productOutput,
        verdict: updatedVerdict,
        opportunity_cost_estimate: updatedEstimate,
        concerns: updatedConcerns
      },
      reconciled: true
    };
  }

  /**
   * Runs a full structured debate round across all agent outputs.
   * Cross-references concerns between Product ↔ Engineering and Security ↔ Legal.
   */
  async runFullDebateCycle(
    outputs: DepartmentOutput[],
    proposalText: string,
    ctx: ExecutionContext
  ): Promise<{ outputs: DepartmentOutput[]; exchanges: ChallengeRoundOutput[] }> {
    ctx.logger.info('Running cross-agent debate round');

    const updatedOutputs = outputs.map(o => ({ ...o, concerns: [...o.concerns] }));
    const exchanges: ChallengeRoundOutput[] = [];

    const counterAgentMap: Record<string, 'product' | 'engineering' | 'security' | 'legal'> = {
      product: 'engineering',
      engineering: 'product',
      security: 'legal',
      legal: 'security'
    };

    for (const output of updatedOutputs) {
      const counterpart = counterAgentMap[output.agent];
      if (!counterpart) continue;

      for (let i = 0; i < output.concerns.length; i++) {
        const concern = output.concerns[i];
        if (concern.status === 'open') {
          try {
            const exchange = await this.executeChallengeExchange(counterpart, concern, proposalText, ctx);
            exchanges.push(exchange);

            if (exchange.stance === 'provides_fact' || exchange.stance === 'agree') {
              output.concerns[i] = { ...concern, status: 'resolved' };
            } else if (exchange.stance === 'disagree' || exchange.stance === 'partially_agree') {
              output.concerns[i] = { ...concern, status: 'challenged' };
            }
          } catch (err: any) {
            ctx.logger.error('Challenge exchange failed', { concernId: concern.id, errorMsg: String(err) });
          }
        }
      }

      const hasHigh = output.concerns.some(c => c.severity === 'high' && c.status !== 'resolved');
      const hasMedium = output.concerns.some(c => c.severity === 'medium' && c.status !== 'resolved');
      output.verdict = hasHigh ? 'blocked' : hasMedium ? 'flagged' : 'approved';
    }

    return { outputs: updatedOutputs, exchanges };
  }

  /**
   * Executes a single challenge round exchange for a specific concern.
   */
  async executeChallengeExchange(
    respondingAgent: 'product' | 'engineering' | 'security' | 'legal',
    targetConcern: Concern,
    proposalText: string,
    ctx: ExecutionContext
  ): Promise<ChallengeRoundOutput> {
    ctx.logger.info('Executing challenge exchange', { respondingAgent, concernId: targetConcern.id });

    const system = `You are the ${respondingAgent} agent on a Decision Review Board.
Another department raised concern [${targetConcern.id}]:
- Category: ${targetConcern.category}
- Issue: ${targetConcern.issue}
- Severity: ${targetConcern.severity}
- Recommendation: ${targetConcern.recommendation}

Provide a structured challenge response.
Stance options: "agree" | "disagree" | "partially_agree" | "provides_fact"

CRITICAL: Return ONLY a raw JSON object. Do NOT output preamble prose or markdown headers.
Return JSON matching:
{
  "agent": "${respondingAgent}",
  "responds_to": "${targetConcern.id}",
  "stance": "agree" | "disagree" | "partially_agree" | "provides_fact",
  "response": string,
  "revised_verdict": "approved" | "flagged" | "blocked" | null
}`;

    const user = `Proposal context:\n${proposalText}`;

    return this.llmService.generateStructured<ChallengeRoundOutput>(
      system,
      user,
      ChallengeRoundOutputSchema,
      { temperature: 0.1 }
    );
  }
}
