import { ToolDecorator as Tool, ExecutionContext, z } from '@nitrostack/core';
import { GoogleGenAI } from '@google/genai';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

// --- Gemini client (singleton) ---

let geminiClient: GoogleGenAI | null = null;

function ensureGeminiApiKey(): void {
  if (!process.env.GEMINI_API_KEY) {
    throw new Error(
      'Security review requires GEMINI_API_KEY to be configured in the environment. Set GEMINI_API_KEY before invoking review_proposal.'
    );
  }
}

function getGeminiClient(): GoogleGenAI {
  if (geminiClient) {
    return geminiClient;
  }

  ensureGeminiApiKey();

  geminiClient = new GoogleGenAI({
    apiKey: process.env.GEMINI_API_KEY!,
  });

  return geminiClient;
}

async function callLLM(
  system: string,
  userContent: string,
  maxTokens: number,
  temperature: number
): Promise<string> {
  const gemini = getGeminiClient();
  const response = await gemini.models.generateContent({
    model: 'gemini-2.5-pro',
    contents: userContent,
    config: {
      systemInstruction: system,
      temperature,
      maxOutputTokens: maxTokens,
      responseMimeType: 'application/json'
    }
  });

  console.log('Gemini response text:');
  console.log(response.text);
  if (!response.text) {
    console.error('Gemini returned no text.', { response });
  }

  return response.text ?? '';
}

// --- Schema v5 (strict) ---

const ConcernSchema = z.object({
  id: z.string(),
  category: z.string(),
  tags: z.array(z.string()).min(1),
  issue: z.string(),
  severity: z.enum(['low', 'medium', 'high']),
  recommendation: z.string(),
  responds_to: z.string().nullable(),
  status: z.enum(['open', 'challenged', 'resolved', 'escalated']),
  requested_context: z.string().nullable()
});

// Model output before we overwrite id/verdict — same shape, id is provisional
const ConcernSchemaRaw = ConcernSchema;

const DepartmentOutputSchemaRaw = z.object({
  agent: z.literal('security'),
  verdict: z.enum(['approved', 'flagged', 'blocked']), // model's opinion — advisory only, not trusted
  confidence: z.number().min(0).max(1),
  summary: z.string(),
  concerns: z.array(ConcernSchemaRaw)
}).strict();

const DepartmentOutputSchema = z.object({
  agent: z.literal('security'),
  verdict: z.enum(['approved', 'flagged', 'blocked']),
  confidence: z.number().min(0).max(1),
  summary: z.string(),
  concerns: z.array(ConcernSchema)
}).strict();

type DepartmentOutput = z.infer<typeof DepartmentOutputSchema>;

// --- Baseline path resolution (not process.cwd()) ---
// Resolves relative to this compiled file's own location, so it's stable
// regardless of where the server process is launched from.
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
// Adjust the number of '..' segments to match actual distance from this file
// to the repo root's /knowledge folder once you confirm the build output layout.
const BASELINE_PATH = path.resolve(__dirname, '../../../../knowledge/security_baseline.md');

interface BaselineSection {
  id: string;
  heading: string;
  text: string;
}

function parseBaselineSections(raw: string): BaselineSection[] {
  const sections: BaselineSection[] = [];
  const regex = /^##\s*(\d+)\.\s*(.+)$/gm;
  const matches = [...raw.matchAll(regex)];

  for (let i = 0; i < matches.length; i++) {
    const [matchText, sectionNum, heading] = matches[i];
    const id = `sec-baseline-${sectionNum}`;
    const start = matches[i].index! + matchText.length;
    const end = i + 1 < matches.length ? matches[i + 1].index! : raw.length;
    sections.push({
      id,
      heading: heading.trim(),
      text: raw.slice(start, end).trim()
    });
  }

  return sections;
}

// --- Preload at module init, not on first request ---
let baselineSections: BaselineSection[];
try {
  const raw = fs.readFileSync(BASELINE_PATH, 'utf-8');
  baselineSections = parseBaselineSections(raw);
  if (baselineSections.length === 0) {
    throw new Error(
      `security_baseline.md parsed to 0 sections — check heading format matches '## [sec-baseline-N] N. Title'`
    );
  }
} catch (err) {
  // Fail loudly at startup rather than silently at first request.
  throw new Error(
    `Failed to load security baseline from ${BASELINE_PATH}: ${err instanceof Error ? err.message : String(err)}`
  );
}

const ALWAYS_INCLUDE = ['sec-baseline-1', 'sec-baseline-5'];

const CLASSIFIABLE_SECTIONS = [
  { id: 'sec-baseline-2', heading: 'Threat Modeling (STRIDE)', description: 'Applies whenever a proposal introduces a new endpoint, integration, or data flow — including internal ones like new caches or credential stores.', keywords: ['integrat', 'endpoint', 'api', 'cache', 'credential', 'flow', 'database', 'storage', 'sync'] },
  { id: 'sec-baseline-3', heading: 'Vendor / Third-Party Risk Tiering', description: 'Applies whenever any entity outside the company touches company or customer data.', keywords: ['vendor', 'third-party', 'third party', 'partner', 'external provider', 'outsourc'] },
  { id: 'sec-baseline-4', heading: 'Compliance Triggers', description: 'Applies whenever personal, financial, or health data is involved, or when user location/region is mentioned or implied.', keywords: ['medical', 'health', 'patient', 'financial', 'payment', 'card', 'gdpr', 'ccpa', 'hipaa', 'pci', 'personal data', 'pii', 'eu', 'california'] },
  { id: 'sec-baseline-6', heading: 'Proportionality (low-risk exceptions)', description: 'Applies whenever the proposal is clearly internal-only or has no data/backend component.', keywords: ['internal tool', 'ui only', 'frontend only', 'no backend', 'read-only'] }
];

// Safety-net: cheap keyword scan run alongside the LLM classifier. Purely
// additive (union, never subtracts) — this is a recall net, not a filter.
// It cannot replace real semantic retrieval (embeddings), but it protects
// against a single bad classifier call silently dropping a compliance-critical
// section, per the retrieval-gap concern raised on this file.
function keywordSafetyNet(proposalText: string): string[] {
  const lower = proposalText.toLowerCase();
  return CLASSIFIABLE_SECTIONS
    .filter(s => s.keywords.some(kw => lower.includes(kw)))
    .map(s => s.id);
}

async function classifyRelevantSections(
  proposalText: string,
  ctx: ExecutionContext
): Promise<string[]> {
  const system = `Given a proposal description and a list of document sections, return ONLY a JSON array of section_id strings for sections relevant to reviewing this proposal. Be inclusive of anything plausibly relevant — a missed section causes worse harm than an extra one.

Sections:
${CLASSIFIABLE_SECTIONS.map(s => `- ${s.id}: ${s.heading} — ${s.description}`).join('\n')}

Return format: ["sec-baseline-2", "sec-baseline-4"]`;

  let llmIds: string[] = [];
  try {
    const raw = await callLLM(system, proposalText, 200, 0.1);
    const parsed = JSON.parse(raw);
    llmIds = Array.isArray(parsed) ? parsed : [];
  } catch {
    ctx.logger.error('Section classifier call/parse failed, relying on keyword safety net only');
  }

  const keywordIds = keywordSafetyNet(proposalText);
  const union = [...new Set([...llmIds, ...keywordIds])];

  ctx.logger.info('Section classification', { llmIds, keywordIds, union });

  return union;
}

export class SecurityTools {
  @Tool({
    name: 'review_proposal',
    description: 'Review a business proposal from a security perspective, evaluating it against the security baseline (STRIDE, data classification, vendor risk).',
    inputSchema: z.object({
      proposalTitle: z.string().min(1, 'Proposal title must not be empty').describe('Title of the proposal'),
      proposalDescription: z.string().min(1, 'Proposal description must not be empty').describe('Full description of the proposal')
    })
  })
  async reviewProposal(input: any, ctx: ExecutionContext): Promise<DepartmentOutput> {
    ctx.logger.info('Reviewing proposal', { title: input.proposalTitle });

    const proposalText = `${input.proposalTitle}\n${input.proposalDescription}`;

    const layer1 = baselineSections.filter(s => ALWAYS_INCLUDE.includes(s.id));
    const relevantIds = await classifyRelevantSections(proposalText, ctx);
    const layer2 = baselineSections.filter(s => relevantIds.includes(s.id));

    const knowledgeBase = [...layer1, ...layer2];

    ctx.logger.info('Retrieved baseline sections', {
      ids: knowledgeBase.map(s => s.id)
    });

    ensureGeminiApiKey();
    const { system, user } = this.buildReviewPrompt(input, knowledgeBase);

    let raw: string;
    try {
      raw = await callLLM(system, user, 1200, 0.1);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const stack = error instanceof Error ? error.stack : undefined;
      ctx.logger.error('LLM invocation failed for security review', { message, stack });
      console.error('LLM invocation failed for security review', { message, stack });
      throw new Error(
        `Security review cannot complete because the LLM backend failed: ${message}`
      );
    }

    console.log('RAW LLM OUTPUT:');
    console.log(raw);
    if (!raw) {
      console.error('RAW LLM OUTPUT is empty.');
    }

    let parsedJson: unknown;
    try {
      parsedJson = JSON.parse(raw);
    } catch (err) {
      const parseError = err instanceof Error ? err.message : String(err);
      ctx.logger.error('LLM returned non-JSON output', { raw, error: parseError });
      console.error('LLM returned non-JSON output', { raw, error: parseError });
      throw new Error('Security agent failed to produce valid JSON output');
    }

    const validated = DepartmentOutputSchemaRaw.safeParse(parsedJson);
    if (!validated.success) {
      const issues = validated.error.issues.map(issue => ({
        path: issue.path.join('.'),
        message: issue.message,
        code: issue.code
      }));
      ctx.logger.error('LLM output failed schema validation', {
        raw,
        issues,
      });
      console.error('LLM output failed schema validation', {
        raw,
        issues,
      });
      throw new Error('Security agent output did not match DepartmentOutputSchema');
    }

    const final = this.finalize(validated.data, input, ctx);

    ctx.logger.info('Security review complete', {
      verdict: final.verdict,
      concernCount: final.concerns.length
    });

    return final;
  }

  // Overwrites the two fields we never trust from the model: verdict and id.
  private finalize(
    modelOutput: z.infer<typeof DepartmentOutputSchemaRaw>,
    input: any,
    ctx: ExecutionContext
  ): DepartmentOutput {
    // Deterministic IDs: category slug + stable index, not whatever the model invented.
    const concerns = modelOutput.concerns.map((c, i) => {
      const slug = c.category
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/(^-|-$)/g, '');
      return { ...c, id: `sec-${slug || 'general'}-${i + 1}` };
    });

    // Verdict computed in code from severities, never trusted from the model.
    const hasHigh = concerns.some(c => c.severity === 'high');
    const hasMedium = concerns.some(c => c.severity === 'medium');
    const computedVerdict: DepartmentOutput['verdict'] = hasHigh
      ? 'blocked'
      : hasMedium
        ? 'flagged'
        : 'approved';

    if (computedVerdict !== modelOutput.verdict) {
      ctx.logger.info('Model verdict overridden by computed verdict', {
        modelVerdict: modelOutput.verdict,
        computedVerdict,
        proposalTitle: input.proposalTitle
      });
    }

    return {
      agent: 'security',
      verdict: computedVerdict,
      confidence: modelOutput.confidence,
      summary: modelOutput.summary,
      concerns
    };
  }

  private buildReviewPrompt(input: any, knowledgeBase: BaselineSection[]) {
    // Rendered as readable text, not raw JSON — models parse prose sections
    // more reliably than nested JSON blobs of the same content.
    const renderedSections = knowledgeBase
      .map(s => `### [${s.id}] ${s.heading}\n${s.text}`)
      .join('\n\n');

    const system = `You are a security reviewer evaluating business proposals.

You have been given only the baseline sections relevant to this proposal:

${renderedSections}

If, while reasoning, you identify that you need a baseline topic not included
above, do not guess or reason from memory of what the baseline "probably
says." Instead, emit a concern with "requested_context" describing exactly
what topic is missing, so it can be retrieved and you can be re-invoked.

Evaluate the proposal ONLY on evidence actually present in its description.
Do not assume a control is missing just because it wasn't mentioned — if the
proposal is silent on something material, set "requested_context" on that
concern instead of asserting the control is absent.
If the proposal explicitly states a control is in place, do not flag it as
missing.

Every concern must have at least one tag; use "scope_unspecified" if nothing
more specific applies.

Note: your "verdict" and each concern's "id" are advisory only — the system
computes the authoritative verdict and IDs deterministically from your
findings, so focus your effort on identifying and describing concerns
accurately rather than on those two fields.

Return ONLY valid JSON, no extra top-level fields:
{
  "agent": "security",
  "verdict": "approved" | "flagged" | "blocked",
  "confidence": number between 0 and 1,
  "summary": string,
  "concerns": [
    {
      "id": string,
      "category": string,
      "tags": string[],
      "issue": string,
      "severity": "low" | "medium" | "high",
      "recommendation": string,
      "responds_to": string | null,
      "status": "open",
      "requested_context": string | null
    }
  ]
}`;

    const user = `Proposal Title: ${input.proposalTitle}\n\nProposal Description: ${input.proposalDescription}`;

    return { system, user };
  }
}