import { LLMProvider, LLMGenerateOptions } from './llm.interface.js';

export class MockProvider implements LLMProvider {
  name = 'Mock (Offline / Demo Mode)';

  async generate(system: string, user: string, options?: LLMGenerateOptions): Promise<string> {
    const sysLower = system.toLowerCase();

    if (options?.responseMimeType === 'text/plain') {
      return 'The Cross-Functional Decision Review Board completed evaluation. Key risks around data classification and third-party vendor compliance were identified, requiring mandatory DPAs and security controls prior to launch.';
    }

    if (sysLower.includes('json array of section_id strings')) {
      return JSON.stringify(['sec-baseline-2', 'leg-baseline-4', 'eng-baseline-2', 'prod-baseline-3']);
    }

    if (sysLower.includes('responding to a concern') || sysLower.includes('stance options') || sysLower.includes('structured challenge response')) {
      return JSON.stringify({
        agent: 'engineering',
        responds_to: 'target-concern',
        stance: 'provides_fact',
        response: 'Standard contractual clauses (SCCs) and regional data isolation will be contractually enforced to satisfy cross-border regulatory requirements.',
        revised_verdict: 'approved'
      });
    }

    if (sysLower.includes('"agent": "engineering"') || sysLower.includes('engineering reviewer')) {
      return JSON.stringify({
        agent: 'engineering',
        verdict: 'flagged',
        confidence: 0.85,
        summary: 'Proposal scope is feasible but lacks explicit migration strategy, capacity planning, and rollback procedures.',
        effort_assessment: {
          size: 'large',
          basis: 'novel_integration',
          confidence: 'low',
          source: 'initial',
          revision_reason: null
        },
        concerns: [
          {
            id: 'eng-migration-strategy-1',
            category: 'architecture_risk',
            tags: ['migration_strategy', 'rollback_plan'],
            issue: 'The proposal does not specify the data migration strategy, expected downtime window, or rollback plan.',
            severity: 'medium',
            recommendation: 'Provide a detailed technical migration plan including data verification steps and an automated rollback strategy.',
            responds_to: null,
            status: 'open',
            requested_context: 'Technical migration plan and rollback procedures'
          }
        ]
      });
    }

    if (sysLower.includes('"agent": "legal"') || sysLower.includes('legal reviewer')) {
      return JSON.stringify({
        agent: 'legal',
        verdict: 'flagged',
        confidence: 0.85,
        summary: 'Cross-border data migration requires verification of lawful transfer mechanisms under applicable data protection frameworks.',
        concerns: [
          {
            id: 'leg-cross-border-transfer-1',
            category: 'regulatory_triggers',
            tags: ['gdpr', 'cross_border_transfer'],
            issue: 'Transferring regional customer data to a new hosting jurisdiction triggers cross-border regulatory review.',
            severity: 'medium',
            recommendation: 'Verify lawful cross-border data transfer mechanisms (such as Standard Contractual Clauses) prior to migration.',
            responds_to: null,
            status: 'open',
            requested_context: 'Data transfer agreements and jurisdiction compliance details'
          }
        ]
      });
    }

    if (sysLower.includes('"agent": "security"') || sysLower.includes('security reviewer')) {
      return JSON.stringify({
        agent: 'security',
        verdict: 'flagged',
        confidence: 0.9,
        summary: 'Vendor security controls and data encryption at rest/transit require formal verification.',
        concerns: [
          {
            id: 'sec-vendor-compliance-1',
            category: 'vendor_risk',
            tags: ['vendor_security', 'soc2'],
            issue: 'The hosting vendor security posture and independent compliance certifications require verification.',
            severity: 'medium',
            recommendation: 'Conduct a vendor security posture assessment and request independent compliance audit documentation.',
            responds_to: null,
            status: 'open',
            requested_context: 'Vendor security audit reports and SOC2 documentation'
          }
        ]
      });
    }

    // Default: Product
    return JSON.stringify({
      agent: 'product',
      verdict: 'flagged',
      confidence: 0.8,
      summary: 'Product rationale is clear but lacks user impact metrics establishing APAC latency degradation.',
      opportunity_cost_estimate: {
        reach: 'medium',
        impact: 'medium',
        confidence: 'low',
        effort: 'large',
        effort_source: 'provisional'
      },
      concerns: [
        {
          id: 'prod-latency-evidence-1',
          category: 'problem_solution_fit',
          tags: ['user_impact', 'metrics'],
          issue: 'The proposal lacks quantitative metrics demonstrating that current latency is actively impacting APAC user engagement or retention.',
          severity: 'medium',
          recommendation: 'Provide quantitative latency measurements and active user impact metrics for the target region.',
          responds_to: null,
          status: 'open',
          requested_context: 'APAC latency analytics and user engagement data'
        }
      ]
    });
  }
}
