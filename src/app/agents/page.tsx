import { dbRepo } from '@/db/repository';
import {
  Bot,
  Activity,
  CheckCircle2,
  Clock,
  Sparkles,
  Terminal,
  Cpu,
  Layers,
} from 'lucide-react';

export const dynamic = 'force-dynamic';

export default function AgentsControlCenterPage() {
  const agents = dbRepo.getAgents();
  const logs = dbRepo.getAgentLogs();

  return (
    <div className="space-y-6 max-w-6xl mx-auto">
      {/* Header */}
      <div className="border-b border-border pb-4">
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-primary/10 border border-primary/30 text-primary text-xs font-semibold mb-2">
          <Bot className="w-4 h-4 text-primary" />
          Autonomous Multi-Agent Telemetry & Orchestration Hub
        </div>
        <h1 className="text-2xl sm:text-3xl font-extrabold text-foreground">
          AI Agents Fleet: <span className="vice-gradient-text">11 Specialized Workers</span>
        </h1>
        <p className="text-muted-foreground text-xs sm:text-sm mt-1 max-w-3xl">
          Real-time execution telemetry, execution runtimes, error telemetry, and subagent state across the video generation pipeline.
        </p>
      </div>

      {/* Agents Roster Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
        {agents.map((agent: any, idx: number) => {
          const agentLogs = logs.filter((l: any) => l.agent_id === agent.id);
          const successCount = agentLogs.filter((l: any) => l.status === 'success' || l.status === 'completed').length;
          const totalRuns = agentLogs.length;
          const avgDuration =
            totalRuns > 0
              ? Math.round(agentLogs.reduce((acc: number, l: any) => acc + (l.duration_ms || 0), 0) / totalRuns)
              : 0;

          return (
            <div key={agent.id} className="vice-card p-5 space-y-4">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-bold text-primary bg-primary/10 px-2 py-0.5 rounded border border-primary/20">
                  AGENT {idx + 1}
                </span>
                <span className="flex items-center gap-1.5 text-[11px] font-semibold text-emerald-600 dark:text-emerald-400">
                  <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                  Active
                </span>
              </div>

              <div>
                <h3 className="font-bold text-sm text-foreground">{agent.name}</h3>
                <p className="text-xs text-primary font-semibold mt-0.5">{agent.role}</p>
                <p className="text-xs text-muted-foreground mt-2 leading-relaxed">{agent.description}</p>
              </div>

              {/* Stats */}
              <div className="grid grid-cols-3 gap-2 pt-2 border-t border-border text-center text-xs">
                <div className="p-2 rounded-lg bg-muted">
                  <span className="text-[10px] text-muted-foreground block">Total Runs</span>
                  <span className="font-bold text-foreground">{totalRuns}</span>
                </div>
                <div className="p-2 rounded-lg bg-muted">
                  <span className="text-[10px] text-muted-foreground block">Success</span>
                  <span className="font-bold text-emerald-600 dark:text-emerald-400">{successCount}</span>
                </div>
                <div className="p-2 rounded-lg bg-muted">
                  <span className="text-[10px] text-muted-foreground block">Avg Runtime</span>
                  <span className="font-bold text-primary font-mono">{avgDuration}ms</span>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Execution Telemetry Log Table */}
      <div className="vice-card p-6 space-y-4">
        <div className="flex items-center justify-between border-b border-border pb-3">
          <h2 className="text-base font-bold text-foreground flex items-center gap-2">
            <Terminal className="w-4 h-4 text-primary" /> Recent Execution Telemetry
          </h2>
          <span className="text-xs text-muted-foreground font-mono">{logs.length} Total Executions</span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b border-border text-muted-foreground font-semibold uppercase text-[10px]">
                <th className="py-2 px-3">Agent</th>
                <th className="py-2 px-3">Status</th>
                <th className="py-2 px-3">Project ID</th>
                <th className="py-2 px-3">Duration</th>
                <th className="py-2 px-3">Timestamp</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {logs.slice(0, 15).map((log: any) => (
                <tr key={log.id} className="hover:bg-muted/40 transition-colors">
                  <td className="py-2.5 px-3 font-semibold text-foreground">
                    {log.agent_name || log.agent_id}
                  </td>
                  <td className="py-2.5 px-3">
                    <span
                      className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                        log.status === 'success' || log.status === 'completed'
                          ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border border-emerald-500/30'
                          : log.status === 'running'
                          ? 'bg-amber-500/15 text-amber-700 dark:text-amber-400 border border-amber-500/30'
                          : 'bg-rose-500/15 text-rose-600 dark:text-rose-400 border border-rose-500/30'
                      }`}
                    >
                      {log.status}
                    </span>
                  </td>
                  <td className="py-2.5 px-3 font-mono text-[11px] text-muted-foreground">
                    {log.project_id}
                  </td>
                  <td className="py-2.5 px-3 font-mono text-foreground">
                    {log.duration_ms ? `${log.duration_ms}ms` : '—'}
                  </td>
                  <td className="py-2.5 px-3 text-muted-foreground text-[11px]">
                    {new Date(log.created_at || Date.now()).toLocaleTimeString()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
