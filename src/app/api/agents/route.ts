import { NextResponse } from 'next/server';
import { dbRepo } from '@/db/repository';

export async function GET() {
  try {
    const agents = dbRepo.getAgents();
    const logs = dbRepo.getAgentLogs();

    const stats = agents.map((agent: any) => {
      const agentLogs = logs.filter((l: any) => l.agent_id === agent.id);
      const successCount = agentLogs.filter((l: any) => l.status === 'success').length;
      const totalExecutions = agentLogs.length;
      const avgDuration =
        totalExecutions > 0
          ? Math.round(agentLogs.reduce((acc: number, l: any) => acc + (l.duration_ms || 0), 0) / totalExecutions)
          : 0;

      return {
        ...agent,
        totalExecutions,
        successCount,
        avgDurationMs: avgDuration,
        latestLog: agentLogs[0] || null,
      };
    });

    return NextResponse.json({ agents: stats, logs: logs.slice(0, 50) });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
