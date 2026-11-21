import { dbRepo } from '../db/repository.ts';
import type { AgentExecutionLog, AgentStatus } from '../types/index.ts';

export abstract class BaseAgent<TInput, TOutput> {
  abstract readonly id: string;
  abstract readonly name: string;
  abstract readonly role: string;

  async execute(projectId: string, input: TInput): Promise<TOutput> {
    const startedAt = new Date().toISOString();
    const logId = `log_${Date.now()}_${Math.random().toString(36).substring(7)}`;
    const startTime = Date.now();

    // Initial starting log
    dbRepo.logAgentExecution({
      id: logId,
      projectId,
      agentId: this.id,
      agentName: this.name,
      stage: this.role,
      status: 'running',
      message: `${this.name} started execution.`,
      startedAt,
      inputSummary: typeof input === 'object' ? JSON.stringify(input).slice(0, 300) : String(input),
    });

    try {
      const output = await this.run(projectId, input);
      const durationMs = Date.now() - startTime;

      // Completion log
      dbRepo.logAgentExecution({
        id: `log_${Date.now()}_${Math.random().toString(36).substring(7)}`,
        projectId,
        agentId: this.id,
        agentName: this.name,
        stage: this.role,
        status: 'completed',
        message: `${this.name} completed successfully in ${durationMs}ms.`,
        durationMs,
        startedAt,
        outputSummary: typeof output === 'object' ? JSON.stringify(output).slice(0, 300) : String(output),
      });

      return output;
    } catch (err: any) {
      const durationMs = Date.now() - startTime;
      dbRepo.logAgentExecution({
        id: `log_${Date.now()}_${Math.random().toString(36).substring(7)}`,
        projectId,
        agentId: this.id,
        agentName: this.name,
        stage: this.role,
        status: 'failed',
        message: `${this.name} failed: ${err.message}`,
        durationMs,
        startedAt,
        error: err.stack || err.message,
      });
      throw err;
    }
  }

  protected abstract run(projectId: string, input: TInput): Promise<TOutput>;
}
