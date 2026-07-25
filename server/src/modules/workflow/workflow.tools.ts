import { ToolDecorator as Tool, ExecutionContext, z } from '@nitrostack/core';
import { ProductTools } from '../product/product.tools.js';
import { EngineeringTools } from '../engineering/engineering.tools.js';
import { SecurityTools } from '../security/security.tools.js';
import { LegalTools } from '../legal/legal.tools.js';
import { DebateService } from '../debate/debate.service.js';
import { ModeratorTools } from '../moderator/moderator.tools.js';
import { DepartmentOutput, ModeratorOutput } from '../shared/types.js';

export class WorkflowTools {
  private productTools = new ProductTools();
  private engineeringTools = new EngineeringTools();
  private securityTools = new SecurityTools();
  private legalTools = new LegalTools();
  private debateService = new DebateService();
  private moderatorTools = new ModeratorTools();

  @Tool({
    name: 'run_full_review_board',
    description: 'Run full end-to-end Decision Review Board workflow (Round 0 parallel reviews, Estimate Reconciliation, Debate, and Moderator Synthesis).',
    inputSchema: z.object({
      proposalTitle: z.string().min(1, 'Proposal title required'),
      proposalDescription: z.string().min(1, 'Proposal description required')
    })
  })
  async runFullWorkflow(
    input: { proposalTitle: string; proposalDescription: string },
    ctx: ExecutionContext
  ): Promise<{
    agentOutputs: DepartmentOutput[];
    reconciled: boolean;
    finalReport: ModeratorOutput;
  }> {
    ctx.logger.info('Starting full review board workflow', { title: input.proposalTitle });

    // Step 1: Round 0 Department Reviews (Fast staggered execution for NitroStudio)
    ctx.logger.info('Step 1: Running Product review...');
    const prodRes = await this.productTools.reviewProposal(input, ctx);
    
    await new Promise(res => setTimeout(res, 200));
    ctx.logger.info('Step 1: Running Engineering review...');
    const engRes = await this.engineeringTools.reviewProposal(input, ctx);

    await new Promise(res => setTimeout(res, 200));
    ctx.logger.info('Step 1: Running Security review...');
    const secRes = await this.securityTools.reviewProposal(input, ctx);

    await new Promise(res => setTimeout(res, 200));
    ctx.logger.info('Step 1: Running Legal review...');
    const legRes = await this.legTools.reviewProposal(input, ctx);

    let prodOutput = prodRes;
    let engOutput = engRes;
    let secOutput = secRes;
    let legOutput = legRes;

    // Step 2: Estimate Reconciliation
    ctx.logger.info('Step 2: Performing Estimate Reconciliation pass');
    const reconciliation = this.debateService.reconcileEstimates(prodOutput, engOutput);
    prodOutput = reconciliation.productOutput;

    let currentOutputs = [prodOutput, engOutput, secOutput, legOutput];

    // Step 3: Moderator Synthesis
    ctx.logger.info('Step 3: Generating final Moderator report with deterministic decision rules');
    const finalReport = await this.moderatorTools.synthesizeReport(
      {
        proposalTitle: input.proposalTitle,
        proposalDescription: input.proposalDescription,
        agentOutputs: currentOutputs
      },
      ctx
    );

    ctx.logger.info('Full decision review board workflow finished successfully', { decision: finalReport.decision });

    return {
      agentOutputs: currentOutputs,
      reconciled: reconciliation.reconciled,
      finalReport
    };
  }

  // Helper alias getter for legal tools
  private get legTools() {
    return this.legalTools;
  }
}
