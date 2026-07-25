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

interface BaselineSection {
  id: string;
  heading: string;
  text: string;
}

function parseBaselineSections(raw: string): BaselineSection[] {
  const sections: BaselineSection[] = [];
  const regex = /^##\s*(?:\[([a-z0-9-]+)\])?\s*(\d+)?\.?\s*(.+)$/gm;
  const matches = [...raw.matchAll(regex)];

  for (let i = 0; i < matches.length; i++) {
    const match = matches[i];
    const sectionId = match[1] || `legal-baseline-${match[2] || i + 1}`;
    const heading = match[3].trim();
    const start = match.index! + match[0].length;
    const end = i + 1 < matches.length ? matches[i + 1].index! : raw.length;
    sections.push({
      id: sectionId,
      heading,
      text: raw.slice(start, end).trim()
    });
  }

  return sections;
}

let baselineSections: BaselineSection[] = [];
try {
  if (fs.existsSync(BASELINE_PATH)) {
    const raw = fs.readFileSync(BASELINE_PATH, 'utf-8');
    baselineSections = parseBaselineSections(raw);
  }
} catch (err) {
  console.warn(`Warning: Failed to pre-load legal baseline from ${BASELINE_PATH}`);
}

const ALWAYS_INCLUDE = ['legal-baseline-1', 'legal-baseline-7'];

const CLASSIFIABLE_SECTIONS = [
  { id: 'legal-baseline-2', heading: 'IP & Ownership', description: 'Applies whenever third-party IP, branding, or AI-generated output ownership is ambiguous.', keywords: ['ip', 'copyright', 'trademark', 'patent', 'license', 'proprietary', 'brand', 'content'] },
  { id: 'legal-baseline-3', heading: 'Liability & Indemnification', description: 'Applies whenever a new vendor, partner, or user relationship introduces financial exposure.', keywords: ['vendor', 'partner', 'indemnifi', 'liability', 'insurance', 'contract', 'exposure'] },
  { id: 'legal-baseline-4', heading: 'Data Processing Legal Basis', description: 'Applies whenever personal data is collected, shared, or processed under GDPR/CCPA.', keywords: ['gdpr', 'ccpa', 'dpa', 'personal data', 'pii', 'privacy policy', 'consent', 'lawful basis'] },
  { id: 'legal-baseline-5', heading: 'Contractual Obligations & ToS', description: 'Applies whenever terms of service or customer agreements need updating.', keywords: ['tos', 'terms of service', 'agreement', 'contract', 'sla', 'policy'] },
  { id: 'legal-baseline-6', heading: 'Jurisdiction & Governing Law', description: 'Applies whenever infrastructure or users span multiple legal jurisdictions.', keywords: ['jurisdiction', 'cross-border', 'eu', 'singapore', 'us', 'international', 'governing law'] },
  { id: 'legal-baseline-8', heading: 'Proportionality', description: 'Applies to internal-only tools with no external party or personal data.', keywords: ['internal tool', 'ui toggle', 'internal script', 'no external'] }
];

function keywordSafetyNet(proposalText: string): string[] {
  const lower = proposalText.toLowerCase();
  return CLASSIFIABLE_SECTIONS
    .filter(s => s.keywords.some(kw => lower.includes(kw)))
    .map(s => s.id);
}

async function classifyRelevantSections(
  proposalText: string,
  llmService: LLMService,
  ctx: ExecutionContext
): Promise<string[]> {
  const system = `Given a proposal description and legal document sections, return ONLY a JSON array of section_id strings relevant to reviewing this proposal.
Sections:
${CLASSIFIABLE_SECTIONS.map(s => `- ${s.id}: ${s.heading} — ${s.description}`).join('\n')}

Return format: ["legal-baseline-2", "legal-baseline-4"]`;

  let llmIds: string[] = [];
  try {
    const arraySchema = z.array(z.string());
    llmIds = await llmService.generateStructured(system, proposalText, arraySchema, { temperature: 0.1 });
  } catch {
    ctx.logger.error('Section classifier call failed, using keyword safety net');
  }

  const keywordIds = keywordSafetyNet(proposalText);
  return [...new Set([...llmIds, ...keywordIds])];
}

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

    try {
      const proposalText = `${input.proposalTitle}\n${input.proposalDescription}`;
      let knowledgeBase = baselineSections;

      if (baselineSections.length > 0) {
        const layer1 = baselineSections.filter(s => ALWAYS_INCLUDE.includes(s.id));
        const relevantIds = await classifyRelevantSections(proposalText, this.llmService, ctx);
        const layer2 = baselineSections.filter(s => relevantIds.includes(s.id));
        knowledgeBase = [...layer1, ...layer2];
      }

      const renderedSections = knowledgeBase.length > 0
        ? knowledgeBase.map(s => `### [${s.id}] ${s.heading}\n${s.text}`).join('\n\n')
        : '# Legal Baseline\nEvaluate regulatory triggers, IP ownership, liability caps, and data processing DPAs.';

      const system = `You are the Legal reviewer on a Decision Review Board.
Apply the legal baseline below and evaluate the proposal:

${renderedSections}

Review only the proposal actually described below. Do not assume data collection,
behavioral tracking, cookies, AI processing, cross-border transfer, or any other
regulatory trigger unless it is explicitly stated in the proposal or present in the
legal baseline retrieved above. If the proposal is silent on something that would be
material to a legal review, do not invent a finding — instead include a concern with
"requested_context" describing what information is needed, rather than asserting a
violation that isn't supported by the text.

If no legal concerns genuinely apply to what's described, return an empty concerns array.

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
    } catch (err: any) {
      ctx.logger.error('Legal review failed, returning fallback output', { errorMsg: String(err) });
      return {
        agent: 'legal',
        verdict: 'flagged',
        confidence: 0.5,
        summary: 'Legal review encountered an execution error and defaulted to flagged status.',
        concerns: [
          {
            id: 'leg-execution-error-1',
            category: 'execution_error',
            tags: ['system_error'],
            issue: `Legal review tool encountered an exception: ${err?.message || String(err)}`,
            severity: 'medium',
            recommendation: 'Re-run legal review or inspect system logs.',
            responds_to: null,
            status: 'open',
            requested_context: null
          }
        ]
      };
    }
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
