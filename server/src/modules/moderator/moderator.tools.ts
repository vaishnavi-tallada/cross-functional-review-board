import { ToolDecorator as Tool, ExecutionContext, z } from '@nitrostack/core';
import { LLMService, defaultLLMService } from '../shared/llm/llm.service.js';
import {
  BaseDepartmentOutputSchema,
  DepartmentOutput,
  ModeratorOutput,
  ModeratorOutputSchema,
  ModeratorDecision,
  Concern,
  UnresolvedRiskSchema,
  RequiredActionSchema
} from '../shared/types.js';

export class ModeratorTools {
  private llmService: LLMService;

  constructor(llmService?: LLMService) {
    this.llmService = llmService ?? defaultLLMService;
  }

  @Tool({
    name: 'synthesize_final_report',
    description: 'Synthesize outputs from Product, Engineering, Security, and Legal agents into a final report using 100% deterministic decision logic.',
    inputSchema: z.object({
      proposalTitle: z.string().min(1, 'Title required'),
      proposalDescription: z.string().min(1, 'Description required'),
      agentOutputs: z.array(BaseDepartmentOutputSchema)
    })
  })
  async synthesizeReport(input: any, ctx: ExecutionContext): Promise<ModeratorOutput> {
    ctx.logger.info('Synthesizing final report (Moderator)', { title: input.proposalTitle });

    const agentOutputs: DepartmentOutput[] = input.agentOutputs;
    const allConcerns: (Concern & { agent: string })[] = [];
    
    agentOutputs.forEach(output => {
      output.concerns.forEach(c => {
        allConcerns.push({ ...c, agent: output.agent });
      });
    });

    // --- Deterministic Decision Engine (Rules 1-4) ---
    const secOutput = agentOutputs.find(a => a.agent === 'security');
    const legOutput = agentOutputs.find(a => a.agent === 'legal');

    const hasEscalatedSecOrLeg = allConcerns.some(
      c => (c.agent === 'security' || c.agent === 'legal') && c.status === 'escalated'
    );
    const hasBlockedVerdict = agentOutputs.some(a => a.verdict === 'blocked');
    const hasFlaggedVerdict = agentOutputs.some(a => a.verdict === 'flagged');
    const hasUnresolvedConcerns = allConcerns.some(c => c.status !== 'resolved');

    let decision: ModeratorDecision;
    let decisionBasis: string;

    if (hasEscalatedSecOrLeg) {
      decision = 'blocked';
      decisionBasis = 'Rule 1: An escalated Security or Legal concern exists — domain owners hold veto authority.';
    } else if (hasBlockedVerdict) {
      decision = 'blocked';
      decisionBasis = 'Rule 2: At least one department output verdict is blocked.';
    } else if (hasFlaggedVerdict || hasUnresolvedConcerns) {
      decision = 'approved_with_conditions';
      decisionBasis = 'Rule 3: One or more departments flagged concerns or open items require action before launch.';
    } else {
      decision = 'approved';
      decisionBasis = 'Rule 4: All department verdicts are approved and all concerns are resolved.';
    }

    // Build unresolved risks & required actions deterministically from concerns
    const unresolved_risks = allConcerns
      .filter(c => c.status !== 'resolved')
      .map(c => ({
        concern_id: c.id,
        agent: c.agent as 'product' | 'engineering' | 'security' | 'legal',
        why_unresolved: `[Severity: ${c.severity}] ${c.issue}`
      }));

    const required_actions = allConcerns
      .filter(c => c.status !== 'resolved')
      .map(c => ({
        action: c.recommendation,
        owner_agent: c.agent as 'product' | 'engineering' | 'security' | 'legal',
        concern_id: c.id
      }));

    const agent_alignment = {
      product: (agentOutputs.find(a => a.agent === 'product')?.verdict ?? 'approved') as any,
      engineering: (agentOutputs.find(a => a.agent === 'engineering')?.verdict ?? 'approved') as any,
      security: (agentOutputs.find(a => a.agent === 'security')?.verdict ?? 'approved') as any,
      legal: (agentOutputs.find(a => a.agent === 'legal')?.verdict ?? 'approved') as any
    };

    // Use LLM ONLY to generate the executive summary prose
    const summaryPrompt = `You are the Moderator of a Decision Review Board.
The decision has ALREADY been calculated deterministically as: "${decision}".
Decision Basis: "${decisionBasis}"

Agent Alignment: ${JSON.stringify(agent_alignment)}
Unresolved Risks: ${JSON.stringify(unresolved_risks)}

Write a concise 2-3 sentence executive summary for senior leaders summarizing why this proposal is ${decision}. Return ONLY plain text prose (no JSON, no markdown fences).`;

    const userPrompt = `Proposal Title: ${input.proposalTitle}\n\nProposal Description: ${input.proposalDescription}`;

    let overall_summary = '';
    try {
      overall_summary = await this.llmService.generateText(summaryPrompt, userPrompt, { temperature: 0.2 });
    } catch {
      overall_summary = `The Decision Review Board reached a final decision of ${decision}. ${decisionBasis}`;
    }

    const finalReport: ModeratorOutput = {
      decision,
      decision_basis: decisionBasis,
      overall_summary: overall_summary.trim(),
      unresolved_risks,
      required_actions,
      agent_alignment
    };

    ctx.logger.info('Report synthesis complete', { decision: finalReport.decision });
    return finalReport;
  }
}
