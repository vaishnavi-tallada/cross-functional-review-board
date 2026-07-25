import { ToolDecorator as Tool, ExecutionContext, z } from '@nitrostack/core';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { LLMService, defaultLLMService } from '../shared/llm/llm.service.js';
import { DepartmentOutput, OpportunityCostEstimateSchema, Concern } from '../shared/types.js';

const ProductOutputSchemaRaw = z.object({
  agent: z.literal('product'),
  verdict: z.enum(['approved', 'flagged', 'blocked']),
  confidence: z.number().min(0).max(1),
  summary: z.string(),
  opportunity_cost_estimate: OpportunityCostEstimateSchema,
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

type ProductModelOutput = z.infer<typeof ProductOutputSchemaRaw>;

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const BASELINE_PATH = path.resolve(__dirname, '../../../../knowledge/product_baseline.md');

export class ProductTools {
  private llmService: LLMService;

  constructor(llmService?: LLMService) {
    this.llmService = llmService ?? defaultLLMService;
  }

  @Tool({
    name: 'review_proposal_product',
    description: 'Review a business proposal from a Product perspective (problem-solution fit, metrics, RICE estimate, unit economics).',
    inputSchema: z.object({
      proposalTitle: z.string().min(1, 'Title required'),
      proposalDescription: z.string().min(1, 'Description required')
    })
  })
  async reviewProposal(input: any, ctx: ExecutionContext): Promise<DepartmentOutput> {
    ctx.logger.info('Reviewing proposal (Product)', { title: input.proposalTitle });

    let baselineText = '# Product Baseline\nEvaluate problem-solution fit, success metrics, scope discipline, RICE opportunity cost, and unit economics.';
    if (fs.existsSync(BASELINE_PATH)) {
      baselineText = fs.readFileSync(BASELINE_PATH, 'utf-8');
    }

    const system = `You are the Product reviewer on a Decision Review Board.
Apply the product baseline below and evaluate the proposal:

${baselineText}

CRITICAL: Return ONLY a raw JSON object. Do NOT output preamble text, conversational intros, or markdown section headers before or after the JSON.
Return JSON matching:
{
  "agent": "product",
  "verdict": "approved" | "flagged" | "blocked",
  "confidence": number,
  "summary": string,
  "opportunity_cost_estimate": {
    "reach": "low" | "medium" | "high" | "massive",
    "impact": "minimal" | "low" | "medium" | "high" | "massive",
    "confidence": "low" | "medium" | "high",
    "effort": "small" | "medium" | "large" | "massive",
    "effort_source": "provisional"
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

    const modelOutput = await this.llmService.generateStructured<ProductModelOutput>(
      system,
      user,
      ProductOutputSchemaRaw,
      { temperature: 0.1 }
    );

    const final = this.finalize(modelOutput, ctx);
    ctx.logger.info('Product review complete', { verdict: final.verdict, count: final.concerns.length });
    return final;
  }

  private finalize(modelOutput: ProductModelOutput, ctx: ExecutionContext): DepartmentOutput {
    const concerns: Concern[] = modelOutput.concerns.map((c, i) => {
      const slug = c.category.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
      return {
        ...c,
        id: `prod-${slug || 'general'}-${i + 1}`,
        status: c.status as Concern['status']
      };
    });

    const est = modelOutput.opportunity_cost_estimate;
    const isHighEffort = est.effort === 'large' || est.effort === 'massive';
    const isLowConfidence = est.confidence === 'low';
    const isLowImpact = est.impact === 'minimal' || est.impact === 'low';

    const zeroEvidenceHighEffort = isHighEffort && isLowConfidence;
    const poorReturn = isHighEffort && isLowImpact;
    const hasHighSeverity = concerns.some(c => c.severity === 'high');
    const hasMediumSeverity = concerns.some(c => c.severity === 'medium');

    let computedVerdict: DepartmentOutput['verdict'] = 'approved';
    if (zeroEvidenceHighEffort || poorReturn || hasHighSeverity) {
      computedVerdict = 'blocked';
    } else if (hasMediumSeverity) {
      computedVerdict = 'flagged';
    }

    return {
      agent: 'product',
      verdict: computedVerdict,
      confidence: modelOutput.confidence,
      summary: modelOutput.summary,
      opportunity_cost_estimate: est,
      concerns
    };
  }
}
