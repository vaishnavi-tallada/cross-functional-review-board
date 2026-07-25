import { LLMProvider, LLMGenerateOptions } from './llm.interface.js';

export class MockProvider implements LLMProvider {
  name = 'Mock (Offline / Demo Mode)';

  async generate(system: string, user: string, options?: LLMGenerateOptions): Promise<string> {
    const sysLower = system.toLowerCase();

    if (options?.responseMimeType === 'text/plain') {
      return 'The Cross-Functional Decision Review Board completed evaluation. Key risks around data classification and third-party vendor compliance were identified, requiring mandatory DPAs and security controls prior to launch.';
    }

    if (sysLower.includes('"agent": "engineering"') || sysLower.includes('engineering reviewer')) {
      return JSON.stringify({
        agent: 'engineering',
        verdict: 'flagged',
        confidence: 0.9,
        summary: 'Feasible architecture but hidden integration costs exist for event pipeline sync.',
        effort_assessment: {
          size: 'medium',
          basis: 'hidden_integration_cost',
          confidence: 'high',
          source: 'initial',
          revision_reason: null
        },
        concerns: [
          {
            id: 'eng-scale-1',
            category: 'architecture_risk',
            tags: ['event_stream', 'scaling_cliff'],
            issue: 'High event ingress during peak hours could saturate existing queue worker pools.',
            severity: 'medium',
            recommendation: 'Implement exponential backoff and dedicated consumer worker autoscaling.',
            responds_to: null,
            status: 'open',
            requested_context: null
          }
        ]
      });
    }

    if (sysLower.includes('"agent": "legal"') || sysLower.includes('legal reviewer')) {
      return JSON.stringify({
        agent: 'legal',
        verdict: 'flagged',
        confidence: 0.88,
        summary: 'Behavioral data collection requires explicit consent and updated enterprise DPAs.',
        concerns: [
          {
            id: 'leg-dpa-1',
            category: 'data_processing_legal_basis',
            tags: ['gdpr', 'dpa_required'],
            issue: 'Storing behavioral tracking data for 12 months requires explicit DPA execution under GDPR.',
            severity: 'medium',
            recommendation: 'Execute updated Data Processing Addendum and provide account-level opt-out toggles.',
            responds_to: null,
            status: 'open',
            requested_context: null
          }
        ]
      });
    }

    if (sysLower.includes('"agent": "security"') || sysLower.includes('security reviewer')) {
      return JSON.stringify({
        agent: 'security',
        verdict: 'approved',
        confidence: 0.92,
        summary: 'Data flow resides within internal cloud boundaries; baseline encryption controls satisfied.',
        concerns: []
      });
    }

    // Default: Product
    return JSON.stringify({
      agent: 'product',
      verdict: 'flagged',
      confidence: 0.85,
      summary: 'Solid market opportunity but requires clearer metric tracking and scope discipline.',
      opportunity_cost_estimate: {
        reach: 'high',
        impact: 'medium',
        confidence: 'medium',
        effort: 'medium',
        effort_source: 'provisional'
      },
      concerns: [
        {
          id: 'prod-metrics-1',
          category: 'success_metrics',
          tags: ['no_lagging_metric'],
          issue: 'The proposal lacks clear leading and lagging metrics to evaluate the feature success.',
          severity: 'medium',
          recommendation: 'Define a 90-day active retention target before launching enterprise rollout.',
          responds_to: null,
          status: 'open',
          requested_context: null
        }
      ]
    });
  }
}
