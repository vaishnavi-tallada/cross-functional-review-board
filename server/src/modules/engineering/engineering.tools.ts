import { ToolDecorator as Tool, ExecutionContext, z } from '@nitrostack/core';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { LLMService, defaultLLMService } from '../shared/llm/llm.service.js';
import { DepartmentOutput, EffortAssessmentSchema, Concern } from '../shared/types.js';

const EngineeringOutputSchemaRaw = z.object({
  agent: z.literal('engineering'),
  verdict: z.enum(['approved', 'flagged', 'blocked']),
  confidence: z.number().min(0).max(1),
  summary: z.string(),
  effort_assessment: EffortAssessmentSchema,
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

type EngineeringModelOutput = z.infer<typeof EngineeringOutputSchemaRaw>;

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const BASELINE_PATH = path.resolve(__dirname, '../../../../knowledge/engineering_baseline.md');

export class EngineeringTools {
  private llmService: LLMService;

  constructor(llmService?: LLMService) {
    this.llmService = llmService ?? defaultLLMService;
  }

  @Tool({
    name: 'review_proposal_engineering',
    description: 'Review a business proposal from an Engineering perspective (effort sizing, architecture risk, scaling, testing, technical debt).',
    inputSchema: z.object({
      proposalTitle: z.string().min(1, 'Title required'),
      proposalDescription: z.string().min(1, 'Description required')
    })
  })
  async reviewProposal(input: any, ctx: ExecutionContext): Promise<DepartmentOutput> {
    ctx.logger.info('Reviewing proposal (Engineering)', { title: input.proposalTitle });

    let baselineText = '# Engineering Baseline\nEvaluate architecture risk, effort sizing, scaling, and rollback readiness.';
    if (fs.existsSync(BASELINE_PATH)) {
      baselineText = fs.readFileSync(BASELINE_PATH, 'utf-8');
    }

    const system = `You are the Engineering reviewer on a Decision Review Board.
Apply the engineering baseline below and evaluate the proposal:

${baselineText}

CRITICAL: Return ONLY a raw JSON object. Do NOT output preamble text, conversational intros, or markdown section headers before or after the JSON.
Return JSON matching:
{
  "agent": "engineering",
  "verdict": "approved" | "flagged" | "blocked",
  "confidence": number,
  "summary": string,
  "effort_assessment": {
    "size": "small" | "medium" | "large" | "massive",
    "basis": "known_pattern" | "novel_integration" | "hidden_integration_cost",
    "confidence": "low" | "medium" | "high",
    "source": "initial",
    "revision_reason": null
  },
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

    const modelOutput = await this.llmService.generateStructured<EngineeringModelOutput>(
      system,
      user,
      EngineeringOutputSchemaRaw,
      { temperature: 0.1 }
    );

    const final = this.finalize(modelOutput, ctx);
    ctx.logger.info('Engineering review complete', { verdict: final.verdict, count: final.concerns.length });
    return final;
  }

  private finalize(modelOutput: EngineeringModelOutput, ctx: ExecutionContext): DepartmentOutput {
    const concerns: Concern[] = modelOutput.concerns.map((c, i) => {
      const slug = c.category.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
      return {
        ...c,
        id: `eng-${slug || 'general'}-${i + 1}`,
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
      agent: 'engineering',
      verdict: computedVerdict,
      confidence: modelOutput.confidence,
      summary: modelOutput.summary,
      effort_assessment: {
        ...modelOutput.effort_assessment,
        source: 'initial',
        revision_reason: null
      },
      concerns
    };
  }
}
