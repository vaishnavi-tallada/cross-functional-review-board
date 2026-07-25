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
    const sectionId = match[1] || `eng-baseline-${match[2] || i + 1}`;
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
  console.warn(`Warning: Failed to pre-load engineering baseline from ${BASELINE_PATH}`);
}

const ALWAYS_INCLUDE = ['eng-baseline-1', 'eng-baseline-7'];

const CLASSIFIABLE_SECTIONS = [
  { id: 'eng-baseline-2', heading: 'Architecture Risk', description: 'Applies whenever a new service, dependency, or shared table change occurs.', keywords: ['architect', 'microservice', 'service', 'database', 'schema', 'event stream', 'queue', 'pubsub'] },
  { id: 'eng-baseline-3', heading: 'Testing & Rollback Readiness', description: 'Applies whenever touching production surfaces, user-facing features, or mutating data.', keywords: ['test', 'rollback', 'feature flag', 'canary', 'deployment', 'pipeline', 'migration'] },
  { id: 'eng-baseline-4', heading: 'Scalability', description: 'Applies whenever request volume, database load, or memory sizing is touched.', keywords: ['scale', 'throughput', 'tps', 'qps', 'latency', 'memory', 'cpu', 'load', 'cache'] },
  { id: 'eng-baseline-5', heading: 'Technical Debt', description: 'Applies whenever shortcuts, workarounds, or time-boxed implementations are introduced.', keywords: ['debt', 'shortcut', 'workaround', 'temporary', 'refactor', 'hack'] },
  { id: 'eng-baseline-6', heading: 'Dependency Risk', description: 'Applies whenever internal unlaunched services or third-party APIs are referenced.', keywords: ['depend', 'third-party api', 'external api', 'unlaunched', 'vendor'] },
  { id: 'eng-baseline-8', heading: 'Proportionality', description: 'Applies to low-blast-radius changes like config toggles or minor scripts.', keywords: ['internal script', 'config flag', 'minor ui toggle', 'small change'] }
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
  const system = `Given a proposal description and engineering document sections, return ONLY a JSON array of section_id strings relevant to reviewing this proposal.
Sections:
${CLASSIFIABLE_SECTIONS.map(s => `- ${s.id}: ${s.heading} — ${s.description}`).join('\n')}

Return format: ["eng-baseline-2", "eng-baseline-3"]`;

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
        : '# Engineering Baseline\nEvaluate architecture risk, effort sizing, scaling, and rollback readiness.';

      const system = `You are the Engineering reviewer on a Decision Review Board.
Apply the engineering baseline below and evaluate the proposal:

${renderedSections}

Review only the proposal actually described below. Do not assume architecture,
existing systems, team capacity, or technical debt beyond what's stated or directly
inferable. Do NOT invent unmentioned implementation details (e.g. event stream pipelines, queue worker pools, or microservice sync).
If information needed to size effort or assess risk is missing, frame findings strictly around MISSING information (e.g. "Migration strategy is unspecified", "Capacity planning is required", "Rollback strategy is not described"), set "confidence": "low" on the effort assessment, and add a concern with "requested_context" describing what's needed. If no engineering concerns genuinely apply, return an empty concerns array.

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
    } catch (err: any) {
      ctx.logger.error('Engineering review failed, returning fallback output', { errorMsg: String(err) });
      return {
        agent: 'engineering',
        verdict: 'flagged',
        confidence: 0.5,
        summary: 'Engineering review encountered an execution error and defaulted to flagged status.',
        effort_assessment: {
          size: 'large',
          basis: 'novel_integration',
          confidence: 'low',
          source: 'initial',
          revision_reason: null
        },
        concerns: [
          {
            id: 'eng-execution-error-1',
            category: 'execution_error',
            tags: ['system_error'],
            issue: `Engineering review tool encountered an exception: ${err?.message || String(err)}`,
            severity: 'medium',
            recommendation: 'Re-run engineering review or inspect system logs.',
            responds_to: null,
            status: 'open',
            requested_context: null
          }
        ]
      };
    }
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
