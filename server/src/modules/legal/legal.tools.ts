import { ToolDecorator as Tool, ExecutionContext, z } from '@nitrostack/core';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { LLMService, defaultLLMService } from '../shared/llm/llm.service.js';
import { DepartmentOutput, Concern } from '../shared/types.js';

const LegalOutputSchemaRaw = z.object({
  agent: z.literal('legal'),
  verdict: z.enum(['approved', 'flagged', 'blocked']),
  confidence: z.number().min(0).max(1),
  summary: z.string(),
  concerns: z.array(
    z.object({
      id: z.string(),
      category: z.string(),
      tags: z.array(z.string()).min(1),
      issue: z.string(),
      severity: z.enum(['low', 'medium', 'high']),
      recommendation: z.string(),
      responds_to: z.string().nullable(),
      status: z.enum(['open', 'challenged', 'resolved', 'escalated']),
      requested_context: z.string().nullable()
    })
  )
}).strict();

type LegalModelOutput = z.infer<typeof LegalOutputSchemaRaw>;

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const BASELINE_PATH = path.resolve(__dirname, '../../../../knowledge/legal_baseline.md');

export class LegalTools {
  private llmService: LLMService;

  constructor(llmService?: LLMService) {
    this.llmService = llmService ?? defaultLLMService;
  }

  @Tool({
    name: 'review_proposal_legal',
    description: 'Review a business proposal from a Legal perspective (regulatory triggers, IP/licensing, liability, data processing legal basis).',
    inputSchema: z.object({
      proposalTitle: z.string().min(1, 'Title required'),
      proposalDescription: z.string().min(1, 'Description required')
    })
  })
  async reviewProposal(input: any, ctx: ExecutionContext): Promise<DepartmentOutput> {
    ctx.logger.info('Reviewing proposal (Legal)', { title: input.proposalTitle });

    let baselineText = '# Legal Baseline\nEvaluate regulatory triggers, IP ownership, liability caps, and data processing DPAs.';
    if (fs.existsSync(BASELINE_PATH)) {
      baselineText = fs.readFileSync(BASELINE_PATH, 'utf-8');
    }

    const system = `You are the Legal reviewer on a Decision Review Board.
Apply the legal baseline below and evaluate the proposal:

${baselineText}

CRITICAL: Return ONLY a raw JSON object. Do NOT output preamble text, conversational intros, or markdown section headers before or after the JSON.
Return JSON matching:
{
  "agent": "legal",
  "verdict": "approved" | "flagged" | "blocked",
  "confidence": number,
  "summary": string,
  "concerns": [
    {
      "id": "provisional",
      "category": string,
      "tags": string[],
      "issue": string,
      "severity": "low" | "medium" | "high",
      "recommendation": string,
      "responds_to": null,
      "status": "open",
      "requested_context": null
    }
  ]
}`;

    const user = `Title: ${input.proposalTitle}\n\nDescription: ${input.proposalDescription}`;

    const modelOutput = await this.llmService.generateStructured<LegalModelOutput>(
      system,
      user,
      LegalOutputSchemaRaw,
      { temperature: 0.1 }
    );

    const final = this.finalize(modelOutput, ctx);
    ctx.logger.info('Legal review complete', { verdict: final.verdict, count: final.concerns.length });
    return final;
  }

  private finalize(modelOutput: LegalModelOutput, ctx: ExecutionContext): DepartmentOutput {
    const concerns: Concern[] = modelOutput.concerns.map((c, i) => {
      const slug = c.category.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
      return {
        ...c,
        id: `leg-${slug || 'general'}-${i + 1}`,
        status: c.status as Concern['status']
      };
    });

    const hasHighSeverity = concerns.some(c => c.severity === 'high');
    const hasMediumSeverity = concerns.some(c => c.severity === 'medium');

    let computedVerdict: DepartmentOutput['verdict'] = hasHighSeverity
      ? 'blocked'
      : hasMediumSeverity
        ? 'flagged'
        : 'approved';

    return {
      agent: 'legal',
      verdict: computedVerdict,
      confidence: modelOutput.confidence,
      summary: modelOutput.summary,
      concerns
    };
  }
}
