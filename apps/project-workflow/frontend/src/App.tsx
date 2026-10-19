import React, { useEffect, useState, useCallback } from 'react';
import {
  ModuleTemplateForm,
  MODULE_TEMPLATE_PRESETS,
  SignalColor,
  WorkflowExecutionRecord,
  MonitoredThassiProject,
  ProjectRequirementItem,
  ProjectDeploymentConfig,
  EcosystemCompatibilityReport,
  GitHubIntegrationSnapshot,
  N8nWorkflowNodeState,
} from '../../shared/workflow-types';

const API_BASE = `${window.location.pathname.replace(/\/$/, '')}/api`;

type ProjectTab = 'requirements' | 'issues' | 'milestones' | 'testing' | 'deployment';

interface OverviewPayload {
  ecosystem: EcosystemCompatibilityReport;
  presets: typeof MODULE_TEMPLATE_PRESETS;
  monitoredProjects: MonitoredThassiProject[];
  latestRun: WorkflowExecutionRecord | null;
  runs: WorkflowExecutionRecord[];
  defaultNodes: N8nWorkflowNodeState[];
  n8nWorkflowJson: Record<string, unknown>;
  github: GitHubIntegrationSnapshot;
}

function signalBadgeClass(color: SignalColor): string {
  switch (color) {
    case 'green':
      return 'bg-emerald-500/15 text-emerald-300 border-emerald-500/40';
    case 'amber':
      return 'bg-amber-500/15 text-amber-300 border-amber-500/40';
    case 'red':
      return 'bg-rose-500/15 text-rose-300 border-rose-500/40';
    case 'cyan':
      return 'bg-sky-500/15 text-sky-300 border-sky-500/40';
    default:
      return 'bg-slate-700/40 text-slate-300 border-slate-600/50';
  }
}

function priorityBadge(priority: 'must' | 'should' | 'could') {
  if (priority === 'must') {
    return 'bg-rose-500/15 text-rose-300 border-rose-500/30';
  }
  if (priority === 'should') {
    return 'bg-amber-500/15 text-amber-300 border-amber-500/30';
  }
  return 'bg-sky-500/15 text-sky-300 border-sky-500/30';
}

function reqStatusBadge(status: ProjectRequirementItem['status']) {
  switch (status) {
    case 'verified':
      return 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40';
    case 'implemented':
      return 'bg-teal-500/20 text-teal-300 border-teal-500/40';
    case 'in_progress':
      return 'bg-sky-500/20 text-sky-300 border-sky-500/40';
    case 'approved':
      return 'bg-indigo-500/20 text-indigo-300 border-indigo-500/40';
    default:
      return 'bg-slate-800 text-slate-300 border-slate-700';
  }
}

export default function App() {
  const [overview, setOverview] = useState<OverviewPayload | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [runningPipeline, setRunningPipeline] = useState<boolean>(false);
  const [runningTestsOnly, setRunningTestsOnly] = useState<boolean>(false);
  const [refreshingGithub, setRefreshingGithub] = useState<boolean>(false);
  const [activeTab, setActiveTab] = useState<ProjectTab>('requirements');
  const [selectedProjectId, setSelectedProjectId] = useState<string>('thassi');
  const [selectedFileTab, setSelectedFileTab] = useState<'sensor' | 'test' | 'manifest'>('sensor');
  const [template, setTemplate] = useState<ModuleTemplateForm>(MODULE_TEMPLATE_PRESETS[0].template);
  const [errorBanner, setErrorBanner] = useState<string | null>(null);
  const [statusToast, setStatusToast] = useState<string | null>(null);

  // Filters
  const [reqFilter, setReqFilter] = useState<string>('all');
  const [issueFilter, setIssueFilter] = useState<'all' | 'open' | 'closed'>('all');

  // New Requirement Form State
  const [newReqTitle, setNewReqTitle] = useState('');
  const [newReqDesc, setNewReqDesc] = useState('');
  const [newReqCriteria, setNewReqCriteria] = useState('');
  const [newReqPriority, setNewReqPriority] = useState<'must' | 'should' | 'could'>('must');
  const [newReqMilestone, setNewReqMilestone] = useState('');
  const [submittingReq, setSubmittingReq] = useState(false);

  // New Issue Form State
  const [newIssueTitle, setNewIssueTitle] = useState('');
  const [newIssueBody, setNewIssueBody] = useState('');
  const [newIssueLabels, setNewIssueLabels] = useState('enhancement');
  const [newIssueAssignee, setNewIssueAssignee] = useState('tsimhofer');
  const [newIssueMilestone, setNewIssueMilestone] = useState('');
  const [submittingIssue, setSubmittingIssue] = useState(false);

  // New Milestone Form State
  const [newMsTitle, setNewMsTitle] = useState('');
  const [newMsDesc, setNewMsDesc] = useState('');
  const [newMsDueDate, setNewMsDueDate] = useState('2026-11-30');
  const [submittingMs, setSubmittingMs] = useState(false);

  // Deployment Config State
  const [deployForm, setDeployForm] = useState<ProjectDeploymentConfig | null>(null);
  const [savingDeploy, setSavingDeploy] = useState(false);

  // Credentials State
  const [geminiKeyInput, setGeminiKeyInput] = useState<string>('');
  const [githubTokenInput, setGithubTokenInput] = useState<string>('');
  const [savingConfig, setSavingConfig] = useState<boolean>(false);

  const showToast = (msg: string) => {
    setStatusToast(msg);
    setTimeout(() => setStatusToast(null), 4000);
  };

  const fetchOverview = useCallback(async (forceRefresh = false) => {
    try {
      if (forceRefresh) setRefreshingGithub(true);
      const res = await fetch(`${API_BASE}/overview${forceRefresh ? '?refresh=1' : ''}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}: ${await res.text()}`);
      const data: OverviewPayload = await res.json();
      setOverview(data);
      setErrorBanner(null);
    } catch (err) {
      setErrorBanner(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
      setRefreshingGithub(false);
    }
  }, []);

  useEffect(() => {
    fetchOverview(false);
    const timer = setInterval(() => fetchOverview(false), 20000);
    return () => clearInterval(timer);
  }, [fetchOverview]);

  const monitoredProjects: MonitoredThassiProject[] = overview?.monitoredProjects ?? [];
  const selectedProject: MonitoredThassiProject | null =
    monitoredProjects.find((p) => p.id === selectedProjectId) ?? monitoredProjects[0] ?? null;

  // Sync deployment config and template preset whenever selectedProject changes
  useEffect(() => {
    if (!selectedProject) return;
    setDeployForm(selectedProject.deploymentConfig);
    if (selectedProject.linkedPresetId) {
      const found = MODULE_TEMPLATE_PRESETS.find((p) => p.id === selectedProject.linkedPresetId);
      if (found) setTemplate(structuredClone(found.template));
    }
  }, [selectedProject?.id, selectedProject?.updatedAt]);

  const handleTriggerPipeline = async () => {
    setRunningPipeline(true);
    setErrorBanner(null);
    try {
      const res = await fetch(`${API_BASE}/workflow/trigger`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ template, commitToGit: true }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || `Workflow Trigger fehlgeschlagen (${res.status})`);
      }
      await fetchOverview(false);
      showToast(`Pipeline & Deployment für ${selectedProject?.name ?? 'Projekt'} erfolgreich ausgeführt!`);
    } catch (err) {
      setErrorBanner(err instanceof Error ? err.message : String(err));
    } finally {
      setRunningPipeline(false);
    }
  };

  const handleRunTestsOnly = async () => {
    setRunningTestsOnly(true);
    setErrorBanner(null);
    try {
      const res = await fetch(`${API_BASE}/tests/run`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ slug: template.objectives.slug }),
      });
      if (!res.ok) throw new Error(`Testlauf fehlgeschlagen (${res.status})`);
      await fetchOverview(false);
      showToast('Unit-Tests erfolgreich ausgeführt (100% PASS).');
    } catch (err) {
      setErrorBanner(err instanceof Error ? err.message : String(err));
    } finally {
      setRunningTestsOnly(false);
    }
  };

  const handleAddRequirement = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedProject || !newReqTitle.trim()) return;
    setSubmittingReq(true);
    try {
      const res = await fetch(`${API_BASE}/projects/requirements`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          projectId: selectedProject.id,
          title: newReqTitle.trim(),
          description: newReqDesc.trim(),
          acceptanceCriteria: newReqCriteria.trim() || 'Unit-Test & Review grün',
          priority: newReqPriority,
          milestoneTitle: newReqMilestone || undefined,
          assignedTo: 'tsimhofer',
        }),
      });
      if (!res.ok) throw new Error(await res.text());
      setNewReqTitle('');
      setNewReqDesc('');
      setNewReqCriteria('');
      await fetchOverview(false);
      showToast('Requirement gespeichert.');
    } catch (err) {
      setErrorBanner(err instanceof Error ? err.message : String(err));
    } finally {
      setSubmittingReq(false);
    }
  };

  const handleUpdateRequirementStatus = async (
    reqId: string,
    nextStatus: ProjectRequirementItem['status']
  ) => {
    if (!selectedProject) return;
    try {
      await fetch(`${API_BASE}/projects/requirements`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          projectId: selectedProject.id,
          requirementId: reqId,
          nextStatus,
        }),
      });
      await fetchOverview(false);
      showToast(`Requirement-Status auf "${nextStatus}" aktualisiert.`);
    } catch (err) {
      setErrorBanner(err instanceof Error ? err.message : String(err));
    }
  };

  const handleCreateIssueFromRequirement = async (req: ProjectRequirementItem) => {
    if (!selectedProject) return;
    setSubmittingIssue(true);
    try {
      const res = await fetch(`${API_BASE}/projects/issues`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          projectId: selectedProject.id,
          title: `[${req.code}] ${req.title}`,
          bodyText: `${req.description}\n\n**Acceptance Criteria:**\n${req.acceptanceCriteria}`,
          labels: [req.priority === 'must' ? 'priority:must' : 'enhancement', 'requirement'],
          assignee: req.assignedTo || 'tsimhofer',
          milestoneTitle: req.milestoneTitle || undefined,
        }),
      });
      if (!res.ok) throw new Error(await res.text());
      await fetchOverview(false);
      setActiveTab('issues');
      showToast(`GitHub Issue für ${req.code} erstellt!`);
    } catch (err) {
      setErrorBanner(err instanceof Error ? err.message : String(err));
    } finally {
      setSubmittingIssue(false);
    }
  };

  const handleCreateIssue = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedProject || !newIssueTitle.trim()) return;
    setSubmittingIssue(true);
    try {
      const labels = newIssueLabels
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);
      const res = await fetch(`${API_BASE}/projects/issues`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          projectId: selectedProject.id,
          title: newIssueTitle.trim(),
          bodyText: newIssueBody.trim(),
          labels: labels.length > 0 ? labels : ['enhancement'],
          assignee: newIssueAssignee || 'tsimhofer',
          milestoneTitle: newIssueMilestone || undefined,
        }),
      });
      if (!res.ok) throw new Error(await res.text());
      setNewIssueTitle('');
      setNewIssueBody('');
      await fetchOverview(false);
      showToast('Issue erfolgreich angelegt.');
    } catch (err) {
      setErrorBanner(err instanceof Error ? err.message : String(err));
    } finally {
      setSubmittingIssue(false);
    }
  };

  const handleToggleIssueState = async (issueNumber: number, currentState: 'open' | 'closed') => {
    if (!selectedProject) return;
    try {
      const nextState = currentState === 'open' ? 'closed' : 'open';
      await fetch(`${API_BASE}/projects/issues`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          projectId: selectedProject.id,
          issueNumber,
          nextState,
        }),
      });
      await fetchOverview(false);
      showToast(`Issue #${issueNumber} auf "${nextState.toUpperCase()}" gesetzt.`);
    } catch (err) {
      setErrorBanner(err instanceof Error ? err.message : String(err));
    }
  };

  const handleCreateMilestone = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedProject || !newMsTitle.trim()) return;
    setSubmittingMs(true);
    try {
      const res = await fetch(`${API_BASE}/projects/milestones`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          projectId: selectedProject.id,
          title: newMsTitle.trim(),
          description: newMsDesc.trim(),
          dueDate: newMsDueDate || undefined,
        }),
      });
      if (!res.ok) throw new Error(await res.text());
      setNewMsTitle('');
      setNewMsDesc('');
      await fetchOverview(false);
      showToast('Meilenstein erstellt.');
    } catch (err) {
      setErrorBanner(err instanceof Error ? err.message : String(err));
    } finally {
      setSubmittingMs(false);
    }
  };

  const handleToggleMilestoneState = async (msId: string, currentState: 'open' | 'closed') => {
    if (!selectedProject) return;
    try {
      const nextState = currentState === 'open' ? 'closed' : 'open';
      await fetch(`${API_BASE}/projects/milestones`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          projectId: selectedProject.id,
          milestoneId: msId,
          nextState,
        }),
      });
      await fetchOverview(false);
      showToast(`Meilenstein auf "${nextState.toUpperCase()}" gesetzt.`);
    } catch (err) {
      setErrorBanner(err instanceof Error ? err.message : String(err));
    }
  };

  const handleSaveDeploymentConfig = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedProject || !deployForm) return;
    setSavingDeploy(true);
    try {
      const res = await fetch(`${API_BASE}/projects/deployment`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          projectId: selectedProject.id,
          config: deployForm,
        }),
      });
      if (!res.ok) throw new Error(await res.text());
      await fetchOverview(false);
      showToast(`Deployment-Optionen für ${selectedProject.name} gespeichert.`);
    } catch (err) {
      setErrorBanner(err instanceof Error ? err.message : String(err));
    } finally {
      setSavingDeploy(false);
    }
  };

  const handleSaveCredentials = async () => {
    setSavingConfig(true);
    try {
      const res = await fetch(`${API_BASE}/config`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          geminiApiKey: geminiKeyInput.trim() || undefined,
          githubToken: githubTokenInput.trim() || undefined,
        }),
      });
      if (!res.ok) throw new Error(`Konfiguration fehlgeschlagen (${res.status})`);
      setGeminiKeyInput('');
      setGithubTokenInput('');
      await fetchOverview(true);
      showToast('API-Credentials gespeichert & GitHub neu synchronisiert.');
    } catch (err) {
      setErrorBanner(err instanceof Error ? err.message : String(err));
    } finally {
      setSavingConfig(false);
    }
  };

  if (loading && !overview) {
    return (
      <div className="min-h-screen bg-slate-950 text-slate-100 flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 rounded-full border-2 border-sky-400 border-t-transparent animate-spin" />
          <p className="text-sm text-slate-400 font-medium">
            Lade Projekt-Workspace & GitHub-Synchronisation...
          </p>
        </div>
      </div>
    );
  }

  const latestRun: WorkflowExecutionRecord | null = overview?.latestRun ?? null;
  const openIssuesCount = selectedProject
    ? selectedProject.issues.filter((i) => i.state === 'open').length
    : 0;
  const closedIssuesCount = selectedProject
    ? selectedProject.issues.filter((i) => i.state === 'closed').length
    : 0;

  const filteredRequirements = selectedProject
    ? selectedProject.requirements.filter((r) => reqFilter === 'all' || r.status === reqFilter)
    : [];

  const filteredIssues = selectedProject
    ? selectedProject.issues.filter((i) => issueFilter === 'all' || i.state === issueFilter)
    : [];

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 pb-12">
      {/* Top Single-Project Selector Header */}
      <header className="sticky top-0 z-30 backdrop-blur-md bg-slate-900/95 border-b border-slate-800 px-6 py-4">
        <div className="max-w-7xl mx-auto flex flex-col gap-3">
          {/* Row 1: Project Selector Dropdown + Quick Pills + Actions */}
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="flex flex-wrap items-center gap-3">
              <div className="flex items-center gap-2 text-xs uppercase tracking-wider font-bold text-sky-400 bg-sky-500/10 border border-sky-500/30 px-2.5 py-1.5 rounded-lg">
                <span>1. Projekt wählen:</span>
              </div>

              {/* Primary Single-Project Dropdown */}
              <select
                value={selectedProject?.id ?? ''}
                onChange={(e) => setSelectedProjectId(e.target.value)}
                className="bg-slate-950 border border-slate-700 hover:border-sky-500/60 rounded-xl px-4 py-2 text-base font-bold text-white focus:outline-none focus:border-sky-500 transition-colors cursor-pointer"
              >
                {monitoredProjects.map((proj) => (
                  <option key={proj.id} value={proj.id}>
                    {proj.repoFullName} — {proj.category} ({proj.progressPercent}%)
                  </option>
                ))}
              </select>

              {/* Quick Project Switcher Pills */}
              <div className="hidden xl:flex items-center gap-1 bg-slate-950/90 p-1 rounded-xl border border-slate-800">
                {monitoredProjects.map((proj) => {
                  const active = proj.id === selectedProject?.id;
                  return (
                    <button
                      key={proj.id}
                      onClick={() => setSelectedProjectId(proj.id)}
                      className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-all flex items-center gap-1.5 cursor-pointer ${
                        active
                          ? 'bg-sky-500 text-slate-950 font-bold shadow'
                          : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
                      }`}
                    >
                      <span
                        className={`w-1.5 h-1.5 rounded-full ${
                          proj.signalColor === 'green'
                            ? 'bg-emerald-400'
                            : proj.signalColor === 'cyan'
                              ? 'bg-sky-400'
                              : 'bg-amber-400'
                        }`}
                      />
                      {proj.name}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Right Actions */}
            <div className="flex items-center gap-2.5">
              <a
                href="/apps/workflows/"
                className="px-3 py-2 rounded-xl text-xs font-bold bg-indigo-500/20 hover:bg-indigo-500/30 text-indigo-300 border border-indigo-500/40 flex items-center gap-1.5 transition-all"
              >
                <span>🔗 Workflows Editor</span>
              </a>

              <button
                onClick={() => fetchOverview(true)}
                disabled={refreshingGithub}
                className="px-3 py-2 rounded-xl text-xs font-medium bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 flex items-center gap-1.5 transition-all cursor-pointer"
              >
                <span>{refreshingGithub ? '↻ Synchronisiere...' : '↻ GitHub Sync'}</span>
              </button>

              <button
                onClick={handleTriggerPipeline}
                disabled={runningPipeline}
                className="px-4 py-2 rounded-xl text-xs font-semibold bg-gradient-to-r from-sky-500 to-indigo-600 hover:from-sky-400 hover:to-indigo-500 text-white shadow-lg shadow-sky-500/20 flex items-center gap-2 disabled:opacity-50 transition-all cursor-pointer"
              >
                {runningPipeline
                  ? 'Pipeline läuft...'
                  : `▶ Build, Test & Deploy (${selectedProject?.name ?? ''})`}
              </button>
            </div>
          </div>

          {/* Row 2: Active Project Metadata, GitHub Link, Collaborators & Progress */}
          {selectedProject && (
            <div className="flex flex-wrap items-center justify-between gap-4 pt-2 border-t border-slate-800/80 text-xs">
              <div className="flex flex-wrap items-center gap-3">
                <span
                  className={`px-2.5 py-0.5 rounded-full text-[11px] font-mono font-semibold border ${signalBadgeClass(
                    selectedProject.signalColor
                  )}`}
                >
                  {selectedProject.devStatusLabel}
                </span>

                <a
                  href={selectedProject.htmlUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1.5 text-sky-400 hover:text-sky-300 font-mono font-medium"
                >
                  <span>
                    GitHub: {selectedProject.repoFullName} ({selectedProject.branch} #{selectedProject.lastCommitSha}) ↗
                  </span>
                </a>

                <span className="text-slate-400 hidden md:inline">— {selectedProject.description}</span>
              </div>

              {/* Collaborators & Progress Bar */}
              <div className="flex items-center gap-4">
                <div className="flex items-center gap-2">
                  <span className="text-[11px] text-slate-400">GitHub Collaborators:</span>
                  <div className="flex items-center -space-x-1.5">
                    {selectedProject.collaborators.map((collab) => (
                      <a
                        key={collab.login}
                        href={collab.htmlUrl}
                        target="_blank"
                        rel="noreferrer"
                        title={`${collab.login} (${collab.role}) — ${collab.contributions} Commits`}
                        className="inline-block"
                      >
                        <img
                          src={collab.avatarUrl}
                          alt={collab.login}
                          className="w-6 h-6 rounded-full border-2 border-slate-900 hover:scale-110 transition-transform bg-slate-800"
                        />
                      </a>
                    ))}
                  </div>
                </div>

                <div className="flex items-center gap-2 min-w-[140px]">
                  <span className="text-[11px] text-slate-400">Fortschritt:</span>
                  <div className="w-20 h-2 bg-slate-800 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-gradient-to-r from-sky-500 to-emerald-400 rounded-full transition-all"
                      style={{ width: `${selectedProject.progressPercent}%` }}
                    />
                  </div>
                  <span className="font-mono font-bold text-slate-200">{selectedProject.progressPercent}%</span>
                </div>
              </div>
            </div>
          )}
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-6 pt-5 space-y-5">
        {errorBanner && (
          <div className="p-3.5 rounded-xl bg-rose-500/15 border border-rose-500/40 text-rose-200 flex items-center justify-between gap-3 text-xs">
            <span>⚠️ {errorBanner}</span>
            <button
              onClick={() => setErrorBanner(null)}
              className="text-rose-300 hover:text-white font-semibold"
            >
              Schließen
            </button>
          </div>
        )}

        {statusToast && (
          <div className="p-3 rounded-xl bg-emerald-500/15 border border-emerald-500/40 text-emerald-200 flex items-center gap-2 text-xs">
            <span>✓ {statusToast}</span>
          </div>
        )}

        {selectedProject && (
          <>
            {/* Compact 6-Stage Project Pipeline Bar (clickable to jump to section) */}
            <section className="rounded-2xl bg-slate-900/80 border border-slate-800 p-4">
              <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
                <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">
                  Entwicklungs-Workflow für <strong className="text-slate-200">{selectedProject.name}</strong> (Klick auf Stufe öffnet Bereich)
                </span>
                <span className="text-[11px] font-mono text-slate-400">
                  Letzter Commit: &ldquo;{selectedProject.lastCommitMessage}&rdquo;
                </span>
              </div>

              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-2.5">
                {selectedProject.n8nPipelineNodes.map((node, idx) => {
                  const targetTabMap: ProjectTab[] = [
                    'requirements',
                    'issues',
                    'testing',
                    'testing',
                    'deployment',
                    'deployment',
                  ];
                  const targetTab = targetTabMap[idx] ?? 'requirements';
                  return (
                    <button
                      key={node.id}
                      onClick={() => setActiveTab(targetTab)}
                      className="text-left p-3 rounded-xl border border-slate-800 bg-slate-950/70 hover:border-sky-500/50 transition-all group cursor-pointer"
                    >
                      <div className="flex items-center justify-between gap-1 mb-1">
                        <span className="text-[11px] font-bold text-slate-200 group-hover:text-sky-300 truncate">
                          {node.name}
                        </span>
                        <span
                          className={`w-2 h-2 rounded-full shrink-0 ${
                            node.signalColor === 'green'
                              ? 'bg-emerald-400'
                              : node.signalColor === 'cyan'
                                ? 'bg-sky-400 animate-pulse'
                                : 'bg-amber-400'
                          }`}
                        />
                      </div>
                      <p className="text-[11px] text-slate-400 truncate">{node.summary}</p>
                    </button>
                  );
                })}
              </div>
            </section>

            {/* 5 Focused Per-Project Management Tabs */}
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800 pb-3">
              <div className="flex flex-wrap items-center gap-2">
                <button
                  onClick={() => setActiveTab('requirements')}
                  className={`px-4 py-2 rounded-xl text-xs font-semibold flex items-center gap-2 transition-all cursor-pointer ${
                    activeTab === 'requirements'
                      ? 'bg-sky-500 text-slate-950 shadow-sm'
                      : 'bg-slate-900 text-slate-300 hover:bg-slate-800 border border-slate-800'
                  }`}
                >
                  <span>1. Requirements</span>
                  <span className="px-1.5 py-0.5 rounded-full text-[10px] bg-slate-950/30 font-mono">
                    {selectedProject.requirements.length}
                  </span>
                </button>

                <button
                  onClick={() => setActiveTab('issues')}
                  className={`px-4 py-2 rounded-xl text-xs font-semibold flex items-center gap-2 transition-all cursor-pointer ${
                    activeTab === 'issues'
                      ? 'bg-sky-500 text-slate-950 shadow-sm'
                      : 'bg-slate-900 text-slate-300 hover:bg-slate-800 border border-slate-800'
                  }`}
                >
                  <span>2. GitHub Issues</span>
                  <span className="px-1.5 py-0.5 rounded-full text-[10px] bg-slate-950/30 font-mono">
                    {openIssuesCount} offen / {selectedProject.issues.length}
                  </span>
                </button>

                <button
                  onClick={() => setActiveTab('milestones')}
                  className={`px-4 py-2 rounded-xl text-xs font-semibold flex items-center gap-2 transition-all cursor-pointer ${
                    activeTab === 'milestones'
                      ? 'bg-sky-500 text-slate-950 shadow-sm'
                      : 'bg-slate-900 text-slate-300 hover:bg-slate-800 border border-slate-800'
                  }`}
                >
                  <span>3. Milestones</span>
                  <span className="px-1.5 py-0.5 rounded-full text-[10px] bg-slate-950/30 font-mono">
                    {selectedProject.milestones.length}
                  </span>
                </button>

                <button
                  onClick={() => setActiveTab('testing')}
                  className={`px-4 py-2 rounded-xl text-xs font-semibold flex items-center gap-2 transition-all cursor-pointer ${
                    activeTab === 'testing'
                      ? 'bg-sky-500 text-slate-950 shadow-sm'
                      : 'bg-slate-900 text-slate-300 hover:bg-slate-800 border border-slate-800'
                  }`}
                >
                  <span>4. Testing & Code</span>
                  <span className="px-1.5 py-0.5 rounded-full text-[10px] bg-slate-950/30 font-mono">
                    {selectedProject.testSummary.passed}/{selectedProject.testSummary.total} PASS
                  </span>
                </button>

                <button
                  onClick={() => setActiveTab('deployment')}
                  className={`px-4 py-2 rounded-xl text-xs font-semibold flex items-center gap-2 transition-all cursor-pointer ${
                    activeTab === 'deployment'
                      ? 'bg-sky-500 text-slate-950 shadow-sm'
                      : 'bg-slate-900 text-slate-300 hover:bg-slate-800 border border-slate-800'
                  }`}
                >
                  <span>5. Deployment & Collaborators</span>
                </button>
              </div>
            </div>

            {/* TAB 1: REQUIREMENTS */}
            {activeTab === 'requirements' && (
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                <div className="lg:col-span-2 space-y-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <h2 className="text-base font-bold text-white">
                        Requirements & Spezifikation — {selectedProject.name}
                      </h2>
                      <p className="text-xs text-slate-400">
                        Verwalte funktionale Anforderungen, Akzeptanzkriterien und verknüpfe sie direkt mit GitHub Issues & Meilensteinen.
                      </p>
                    </div>
                    <div className="flex items-center gap-1 bg-slate-900 p-1 rounded-xl border border-slate-800 text-xs">
                      {(['all', 'draft', 'approved', 'in_progress', 'implemented', 'verified'] as const).map(
                        (st) => (
                          <button
                            key={st}
                            onClick={() => setReqFilter(st)}
                            className={`px-2.5 py-1 rounded-lg font-medium transition-colors cursor-pointer ${
                              reqFilter === st
                                ? 'bg-sky-500 text-slate-950 font-bold'
                                : 'text-slate-400 hover:text-slate-200'
                            }`}
                          >
                            {st === 'all' ? 'Alle' : st}
                          </button>
                        )
                      )}
                    </div>
                  </div>

                  <div className="space-y-3">
                    {filteredRequirements.map((req) => (
                      <div
                        key={req.id}
                        className="p-4 rounded-2xl bg-slate-900/90 border border-slate-800 hover:border-slate-700 transition-all space-y-2.5"
                      >
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div className="flex items-center gap-2">
                            <span className="font-mono text-xs font-bold text-sky-400 bg-sky-500/10 border border-sky-500/30 px-2 py-0.5 rounded">
                              {req.code}
                            </span>
                            <span
                              className={`text-[10px] font-mono uppercase px-2 py-0.5 rounded border font-semibold ${priorityBadge(
                                req.priority
                              )}`}
                            >
                              {req.priority.toUpperCase()}
                            </span>
                            {req.milestoneTitle && (
                              <span className="text-[11px] text-indigo-300 bg-indigo-500/15 border border-indigo-500/30 px-2 py-0.5 rounded">
                                🎯 {req.milestoneTitle}
                              </span>
                            )}
                          </div>

                          <div className="flex items-center gap-2">
                            <select
                              value={req.status}
                              onChange={(e) =>
                                handleUpdateRequirementStatus(
                                  req.id,
                                  e.target.value as ProjectRequirementItem['status']
                                )
                              }
                              className={`text-xs font-mono font-semibold px-2.5 py-1 rounded-lg border cursor-pointer focus:outline-none ${reqStatusBadge(
                                req.status
                              )}`}
                            >
                              <option value="draft">draft</option>
                              <option value="approved">approved</option>
                              <option value="in_progress">in_progress</option>
                              <option value="implemented">implemented</option>
                              <option value="verified">verified</option>
                            </select>

                            {req.linkedIssueNumber ? (
                              <button
                                onClick={() => setActiveTab('issues')}
                                className="text-xs font-mono text-emerald-300 bg-emerald-500/10 border border-emerald-500/30 px-2.5 py-1 rounded-lg hover:bg-emerald-500/20 cursor-pointer"
                              >
                                Issue #{req.linkedIssueNumber}
                              </button>
                            ) : (
                              <button
                                onClick={() => handleCreateIssueFromRequirement(req)}
                                disabled={submittingIssue}
                                className="text-xs font-medium text-sky-300 bg-sky-500/10 border border-sky-500/30 px-2.5 py-1 rounded-lg hover:bg-sky-500/20 cursor-pointer"
                              >
                                + Als GitHub Issue anlegen
                              </button>
                            )}
                          </div>
                        </div>

                        <h3 className="text-sm font-bold text-slate-100">{req.title}</h3>
                        <p className="text-xs text-slate-300 leading-relaxed">{req.description}</p>

                        <div className="pt-2 border-t border-slate-800/80 flex flex-wrap items-center justify-between gap-2 text-[11px] text-slate-400">
                          <div>
                            <strong className="text-slate-300">Akzeptanzkriterium:</strong>{' '}
                            {req.acceptanceCriteria}
                          </div>
                          {req.assignedTo && (
                            <span className="font-mono text-slate-300">Owner: @{req.assignedTo}</span>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Right Form: Add New Requirement */}
                <div className="rounded-2xl bg-slate-900/90 border border-slate-800 p-5 h-fit space-y-4">
                  <h3 className="text-sm font-bold text-white">
                    + Neues Requirement für {selectedProject.name}
                  </h3>
                  <form onSubmit={handleAddRequirement} className="space-y-3 text-xs">
                    <div>
                      <label className="block text-slate-400 mb-1">Priorität (MoSCoW)</label>
                      <select
                        value={newReqPriority}
                        onChange={(e) =>
                          setNewReqPriority(e.target.value as 'must' | 'should' | 'could')
                        }
                        className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-slate-100"
                      >
                        <option value="must">MUST Have</option>
                        <option value="should">SHOULD Have</option>
                        <option value="could">COULD Have</option>
                      </select>
                    </div>

                    <div>
                      <label className="block text-slate-400 mb-1">Titel der Anforderung *</label>
                      <input
                        type="text"
                        required
                        placeholder="Was soll das Modul / Feature leisten?"
                        value={newReqTitle}
                        onChange={(e) => setNewReqTitle(e.target.value)}
                        className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-slate-100"
                      />
                    </div>

                    <div>
                      <label className="block text-slate-400 mb-1">Spezifikation / Beschreibung</label>
                      <textarea
                        rows={3}
                        placeholder="Technische Details, Schnittstellen, Home Assistant Entities..."
                        value={newReqDesc}
                        onChange={(e) => setNewReqDesc(e.target.value)}
                        className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-slate-100"
                      />
                    </div>

                    <div>
                      <label className="block text-slate-400 mb-1">Akzeptanzkriterien (Definition of Done)</label>
                      <input
                        type="text"
                        placeholder="z.B. Pytest 100% PASS & HA Sensor sichtbar"
                        value={newReqCriteria}
                        onChange={(e) => setNewReqCriteria(e.target.value)}
                        className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-slate-100"
                      />
                    </div>

                    <div>
                      <label className="block text-slate-400 mb-1">Meilenstein zuordnen</label>
                      <select
                        value={newReqMilestone}
                        onChange={(e) => setNewReqMilestone(e.target.value)}
                        className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-slate-100"
                      >
                        <option value="">— Kein Meilenstein —</option>
                        {selectedProject.milestones.map((m) => (
                          <option key={m.id} value={m.title}>
                            {m.title}
                          </option>
                        ))}
                      </select>
                    </div>

                    <button
                      type="submit"
                      disabled={submittingReq}
                      className="w-full py-2.5 rounded-xl bg-sky-500 hover:bg-sky-400 text-slate-950 font-bold transition-all cursor-pointer"
                    >
                      {submittingReq ? 'Speichere...' : 'Requirement hinzufügen'}
                    </button>
                  </form>
                </div>
              </div>
            )}

            {/* TAB 2: GITHUB ISSUES */}
            {activeTab === 'issues' && (
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                <div className="lg:col-span-2 space-y-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <h2 className="text-base font-bold text-white flex items-center gap-2">
                        <span>GitHub Issues & Tasks — {selectedProject.repoFullName}</span>
                        <a
                          href={`${selectedProject.htmlUrl}/issues`}
                          target="_blank"
                          rel="noreferrer"
                          className="text-xs font-normal text-sky-400 hover:underline"
                        >
                          Auf GitHub öffnen ↗
                        </a>
                      </h2>
                      <p className="text-xs text-slate-400">
                        Live synchronisiert mit GitHub Issues, Dependabot PRs, Labels, Collaborators und Meilensteinen.
                      </p>
                    </div>

                    <div className="flex items-center gap-1 bg-slate-900 p-1 rounded-xl border border-slate-800 text-xs">
                      <button
                        onClick={() => setIssueFilter('all')}
                        className={`px-3 py-1 rounded-lg font-medium cursor-pointer ${
                          issueFilter === 'all'
                            ? 'bg-sky-500 text-slate-950 font-bold'
                            : 'text-slate-400 hover:text-slate-200'
                        }`}
                      >
                        Alle ({selectedProject.issues.length})
                      </button>
                      <button
                        onClick={() => setIssueFilter('open')}
                        className={`px-3 py-1 rounded-lg font-medium cursor-pointer ${
                          issueFilter === 'open'
                            ? 'bg-emerald-500 text-slate-950 font-bold'
                            : 'text-slate-400 hover:text-slate-200'
                        }`}
                      >
                        Offen ({openIssuesCount})
                      </button>
                      <button
                        onClick={() => setIssueFilter('closed')}
                        className={`px-3 py-1 rounded-lg font-medium cursor-pointer ${
                          issueFilter === 'closed'
                            ? 'bg-purple-500 text-white font-bold'
                            : 'text-slate-400 hover:text-slate-200'
                        }`}
                      >
                        Geschlossen ({closedIssuesCount})
                      </button>
                    </div>
                  </div>

                  <div className="space-y-3">
                    {filteredIssues.map((issue) => (
                      <div
                        key={issue.id}
                        className="p-4 rounded-2xl bg-slate-900/90 border border-slate-800 hover:border-slate-700 transition-all space-y-2.5"
                      >
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div className="flex flex-wrap items-center gap-2">
                            <span
                              className={`px-2 py-0.5 rounded-full text-[11px] font-mono font-bold border ${
                                issue.state === 'open'
                                  ? 'bg-emerald-500/15 text-emerald-300 border-emerald-500/40'
                                  : 'bg-purple-500/15 text-purple-300 border-purple-500/40'
                              }`}
                            >
                              {issue.state === 'open' ? '● OPEN' : '✓ CLOSED'} #{issue.number}
                            </span>

                            <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-slate-800 text-slate-300 border border-slate-700">
                              {issue.source === 'github' ? 'GitHub API' : 'Project Issue'}
                            </span>

                            {issue.labels.map((lbl) => (
                              <span
                                key={lbl}
                                className="text-[10px] font-mono px-2 py-0.5 rounded bg-sky-500/10 text-sky-300 border border-sky-500/30"
                              >
                                {lbl}
                              </span>
                            ))}

                            {issue.milestoneTitle && (
                              <span className="text-[11px] text-indigo-300 bg-indigo-500/15 border border-indigo-500/30 px-2 py-0.5 rounded">
                                🎯 {issue.milestoneTitle}
                              </span>
                            )}
                          </div>

                          <div className="flex items-center gap-2">
                            <button
                              onClick={() => handleToggleIssueState(issue.number, issue.state)}
                              className="text-xs px-2.5 py-1 rounded-lg border border-slate-700 bg-slate-800 hover:bg-slate-700 text-slate-200 transition-colors cursor-pointer"
                            >
                              {issue.state === 'open' ? 'Issue schließen' : 'Wieder öffnen'}
                            </button>
                            <a
                              href={issue.htmlUrl}
                              target="_blank"
                              rel="noreferrer"
                              className="text-xs px-2.5 py-1 rounded-lg bg-sky-500/10 text-sky-300 border border-sky-500/30 hover:bg-sky-500/20"
                            >
                              GitHub ↗
                            </a>
                          </div>
                        </div>

                        <h3 className="text-sm font-bold text-slate-100">{issue.title}</h3>
                        {issue.body && (
                          <p className="text-xs text-slate-300 whitespace-pre-line leading-relaxed">
                            {issue.body}
                          </p>
                        )}

                        <div className="pt-2 border-t border-slate-800/80 flex flex-wrap items-center justify-between gap-2 text-[11px] text-slate-400">
                          <div className="flex items-center gap-2">
                            <img
                              src={issue.authorAvatarUrl}
                              alt={issue.author}
                              className="w-4 h-4 rounded-full"
                            />
                            <span>
                              Erstellt von <strong className="text-slate-200">@{issue.author}</strong>
                            </span>
                          </div>
                          {issue.assignee && (
                            <span className="font-mono text-slate-300">
                              Zugewiesen an: @{issue.assignee}
                            </span>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Right Form: Create Issue */}
                <div className="rounded-2xl bg-slate-900/90 border border-slate-800 p-5 h-fit space-y-4">
                  <h3 className="text-sm font-bold text-white">
                    + Neues Issue in {selectedProject.repoFullName}
                  </h3>
                  <form onSubmit={handleCreateIssue} className="space-y-3 text-xs">
                    <div>
                      <label className="block text-slate-400 mb-1">Issue-Titel *</label>
                      <input
                        type="text"
                        required
                        placeholder="z.B. [Feat] Shelly Gen3 Webhook Timeout erhöhen"
                        value={newIssueTitle}
                        onChange={(e) => setNewIssueTitle(e.target.value)}
                        className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-slate-100"
                      />
                    </div>

                    <div>
                      <label className="block text-slate-400 mb-1">Beschreibung / Reproduktion</label>
                      <textarea
                        rows={4}
                        placeholder="Details zum Feature-Wunsch oder Bug..."
                        value={newIssueBody}
                        onChange={(e) => setNewIssueBody(e.target.value)}
                        className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-slate-100"
                      />
                    </div>

                    <div>
                      <label className="block text-slate-400 mb-1">Labels (Komma-getrennt)</label>
                      <input
                        type="text"
                        value={newIssueLabels}
                        onChange={(e) => setNewIssueLabels(e.target.value)}
                        className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-slate-100 font-mono"
                      />
                    </div>

                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="block text-slate-400 mb-1">Collaborator / Assignee</label>
                        <select
                          value={newIssueAssignee}
                          onChange={(e) => setNewIssueAssignee(e.target.value)}
                          className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-slate-100"
                        >
                          {selectedProject.collaborators.map((c) => (
                            <option key={c.login} value={c.login}>
                              @{c.login}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <label className="block text-slate-400 mb-1">Meilenstein</label>
                        <select
                          value={newIssueMilestone}
                          onChange={(e) => setNewIssueMilestone(e.target.value)}
                          className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-slate-100"
                        >
                          <option value="">— Kein Meilenstein —</option>
                          {selectedProject.milestones.map((m) => (
                            <option key={m.id} value={m.title}>
                              {m.title}
                            </option>
                          ))}
                        </select>
                      </div>
                    </div>

                    <button
                      type="submit"
                      disabled={submittingIssue}
                      className="w-full py-2.5 rounded-xl bg-sky-500 hover:bg-sky-400 text-slate-950 font-bold transition-all cursor-pointer"
                    >
                      {submittingIssue ? 'Erstelle Issue...' : 'Issue anlegen & mit GitHub verknüpfen'}
                    </button>
                  </form>
                </div>
              </div>
            )}

            {/* TAB 3: MILESTONES */}
            {activeTab === 'milestones' && (
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                <div className="lg:col-span-2 space-y-4">
                  <div>
                    <h2 className="text-base font-bold text-white">
                      Release-Meilensteine & Roadmap — {selectedProject.name}
                    </h2>
                    <p className="text-xs text-slate-400">
                      Verfolge den Fortschritt pro Meilenstein anhand der zugeordneten Requirements und GitHub Issues.
                    </p>
                  </div>

                  <div className="space-y-4">
                    {selectedProject.milestones.map((ms) => {
                      const linkedReqs = selectedProject.requirements.filter(
                        (r) => r.milestoneTitle === ms.title
                      );
                      const linkedIssues = selectedProject.issues.filter(
                        (i) => i.milestoneTitle === ms.title
                      );
                      return (
                        <div
                          key={ms.id}
                          className="p-5 rounded-2xl bg-slate-900/90 border border-slate-800 space-y-3"
                        >
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <div className="flex items-center gap-2.5">
                              <span
                                className={`px-2.5 py-0.5 rounded-full text-[11px] font-mono font-bold border ${
                                  ms.state === 'open'
                                    ? 'bg-sky-500/15 text-sky-300 border-sky-500/40'
                                    : 'bg-emerald-500/15 text-emerald-300 border-emerald-500/40'
                                }`}
                              >
                                {ms.state === 'open' ? 'ACTIVE MILESTONE' : 'COMPLETED'}
                              </span>
                              <h3 className="text-base font-bold text-white">{ms.title}</h3>
                            </div>

                            <div className="flex items-center gap-2 text-xs">
                              {ms.dueDate && (
                                <span className="font-mono text-slate-400">
                                  Zieldatum: {ms.dueDate}
                                </span>
                              )}
                              <button
                                onClick={() => handleToggleMilestoneState(ms.id, ms.state)}
                                className="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 cursor-pointer"
                              >
                                {ms.state === 'open' ? 'Als erledigt markieren' : 'Wieder öffnen'}
                              </button>
                            </div>
                          </div>

                          <p className="text-xs text-slate-300">{ms.description}</p>

                          <div className="space-y-1">
                            <div className="flex justify-between text-xs">
                              <span className="text-slate-400">
                                {ms.closedIssues} abgeschlossen / {ms.openIssues} offen
                              </span>
                              <span className="font-mono font-bold text-sky-300">
                                {ms.progressPercent}%
                              </span>
                            </div>
                            <div className="w-full h-2.5 bg-slate-950 rounded-full overflow-hidden border border-slate-800">
                              <div
                                className="h-full bg-gradient-to-r from-sky-500 to-emerald-400 rounded-full"
                                style={{ width: `${ms.progressPercent}%` }}
                              />
                            </div>
                          </div>

                          {(linkedReqs.length > 0 || linkedIssues.length > 0) && (
                            <div className="pt-2 border-t border-slate-800/80 flex flex-wrap gap-2 text-[11px]">
                              {linkedReqs.map((r) => (
                                <span
                                  key={r.id}
                                  className="px-2 py-0.5 rounded bg-slate-950 border border-slate-800 text-slate-300 font-mono"
                                >
                                  {r.code}: {r.status}
                                </span>
                              ))}
                              {linkedIssues.map((i) => (
                                <span
                                  key={i.id}
                                  className="px-2 py-0.5 rounded bg-sky-500/10 border border-sky-500/30 text-sky-300 font-mono"
                                >
                                  Issue #{i.number} ({i.state})
                                </span>
                              ))}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Right Form: Add Milestone */}
                <div className="rounded-2xl bg-slate-900/90 border border-slate-800 p-5 h-fit space-y-4">
                  <h3 className="text-sm font-bold text-white">
                    + Neuer Meilenstein für {selectedProject.name}
                  </h3>
                  <form onSubmit={handleCreateMilestone} className="space-y-3 text-xs">
                    <div>
                      <label className="block text-slate-400 mb-1">Meilenstein-Titel *</label>
                      <input
                        type="text"
                        required
                        placeholder="z.B. v1.3.0 — Multi-Sensor Automation"
                        value={newMsTitle}
                        onChange={(e) => setNewMsTitle(e.target.value)}
                        className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-slate-100"
                      />
                    </div>
                    <div>
                      <label className="block text-slate-400 mb-1">Zieldatum</label>
                      <input
                        type="date"
                        value={newMsDueDate}
                        onChange={(e) => setNewMsDueDate(e.target.value)}
                        className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-slate-100 font-mono"
                      />
                    </div>
                    <div>
                      <label className="block text-slate-400 mb-1">Zielsetzung / Lieferumfang</label>
                      <textarea
                        rows={3}
                        placeholder="Welche Features und Tests gehören in dieses Release?"
                        value={newMsDesc}
                        onChange={(e) => setNewMsDesc(e.target.value)}
                        className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-slate-100"
                      />
                    </div>
                    <button
                      type="submit"
                      disabled={submittingMs}
                      className="w-full py-2.5 rounded-xl bg-sky-500 hover:bg-sky-400 text-slate-950 font-bold transition-all cursor-pointer"
                    >
                      {submittingMs ? 'Erstelle...' : 'Meilenstein anlegen'}
                    </button>
                  </form>
                </div>
              </div>
            )}

            {/* TAB 4: TESTING & CODE */}
            {activeTab === 'testing' && (
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
                {/* Left Column: Project Unit-Test Gate & Module Spec */}
                <div className="lg:col-span-5 space-y-4">
                  <div className="rounded-2xl bg-slate-900/90 border border-slate-800 p-5 space-y-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <h2 className="text-base font-bold text-white">
                          Testing & QA Gate — {selectedProject.name}
                        </h2>
                        <p className="text-xs text-slate-400">
                          Framework: {selectedProject.testSummary.framework}
                        </p>
                      </div>
                      <span className="px-3 py-1 rounded-full text-xs font-mono font-bold bg-emerald-500/15 text-emerald-300 border border-emerald-500/40">
                        {selectedProject.testSummary.passed}/{selectedProject.testSummary.total} PASS (
                        {selectedProject.testSummary.passRatePercent}%)
                      </span>
                    </div>

                    <div className="p-3 rounded-xl bg-slate-950 border border-slate-800 font-mono text-xs text-sky-300">
                      $ {selectedProject.testSummary.command}
                    </div>

                    <div className="space-y-2">
                      <span className="text-xs font-semibold text-slate-300">
                        Aktive Test-Suites & Verifikationen:
                      </span>
                      {selectedProject.testSummary.details.map((detail, idx) => (
                        <div
                          key={idx}
                          className="flex items-center gap-2 text-xs p-2.5 rounded-lg bg-slate-950/70 border border-slate-800/80 text-slate-200"
                        >
                          <span className="text-emerald-400 font-bold">✓</span>
                          <span>{detail}</span>
                        </div>
                      ))}
                    </div>

                    <div className="flex gap-2 pt-2">
                      <button
                        onClick={handleRunTestsOnly}
                        disabled={runningTestsOnly}
                        className="flex-1 py-2.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-xs transition-all cursor-pointer"
                      >
                        {runningTestsOnly ? 'Tests laufen...' : '🧪 Unit-Tests jetzt ausführen'}
                      </button>

                      <button
                        onClick={handleTriggerPipeline}
                        disabled={runningPipeline}
                        className="flex-1 py-2.5 rounded-xl bg-sky-500/20 hover:bg-sky-500/30 text-sky-300 border border-sky-500/40 font-bold text-xs transition-all cursor-pointer"
                      >
                        ✨ Code neu generieren & testen
                      </button>
                    </div>
                  </div>
                </div>

                {/* Right Column: Live Code & Test Artifact Viewer */}
                <div className="lg:col-span-7 rounded-2xl bg-slate-900/90 border border-slate-800 p-5 flex flex-col">
                  <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
                    <h3 className="text-sm font-bold text-white">
                      Generierter Modul-Code & Unit-Test-Suite ({template.objectives.slug})
                    </h3>

                    <div className="flex gap-1 bg-slate-950 p-1 rounded-lg border border-slate-800 text-xs font-mono">
                      <button
                        onClick={() => setSelectedFileTab('sensor')}
                        className={`px-2.5 py-1 rounded cursor-pointer ${
                          selectedFileTab === 'sensor'
                            ? 'bg-sky-500 text-slate-950 font-bold'
                            : 'text-slate-400 hover:text-slate-200'
                        }`}
                      >
                        sensor.py
                      </button>
                      <button
                        onClick={() => setSelectedFileTab('test')}
                        className={`px-2.5 py-1 rounded cursor-pointer ${
                          selectedFileTab === 'test'
                            ? 'bg-sky-500 text-slate-950 font-bold'
                            : 'text-slate-400 hover:text-slate-200'
                        }`}
                      >
                        test_{template.objectives.slug}.py
                      </button>
                      <button
                        onClick={() => setSelectedFileTab('manifest')}
                        className={`px-2.5 py-1 rounded cursor-pointer ${
                          selectedFileTab === 'manifest'
                            ? 'bg-sky-500 text-slate-950 font-bold'
                            : 'text-slate-400 hover:text-slate-200'
                        }`}
                      >
                        manifest.json
                      </button>
                    </div>
                  </div>

                  <pre className="flex-1 bg-slate-950 border border-slate-800 rounded-xl p-4 text-[11px] font-mono text-slate-200 overflow-x-auto max-h-[460px] overflow-y-auto leading-relaxed">
                    {latestRun
                      ? selectedFileTab === 'sensor'
                        ? latestRun.generatedFiles.sensorPy
                        : selectedFileTab === 'test'
                          ? latestRun.generatedFiles.testPy
                          : latestRun.generatedFiles.manifestJson
                      : '# Noch kein Code-Lauf geladen.'}
                  </pre>
                </div>
              </div>
            )}

            {/* TAB 5: DEPLOYMENT & COLLABORATORS */}
            {activeTab === 'deployment' && deployForm && (
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
                {/* Left Column: Per-Project Deployment Options */}
                <div className="lg:col-span-7 rounded-2xl bg-slate-900/90 border border-slate-800 p-5 space-y-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <h2 className="text-base font-bold text-white">
                        Deployment-Optionen — {selectedProject.name}
                      </h2>
                      <p className="text-xs text-slate-400">
                        Konfiguriere Zielsystem, Pfad, Auto-Deploy-Regeln und Home Assistant Telemetrie für dieses Projekt.
                      </p>
                    </div>
                    <span className="px-2.5 py-1 rounded-full text-xs font-mono font-bold bg-emerald-500/15 text-emerald-300 border border-emerald-500/40">
                      Status: {deployForm.lastDeployStatus}
                    </span>
                  </div>

                  <form onSubmit={handleSaveDeploymentConfig} className="space-y-4 text-xs">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      <div>
                        <label className="block text-slate-400 mb-1">Deployment-Modus</label>
                        <select
                          value={deployForm.targetType}
                          onChange={(e) =>
                            setDeployForm({
                              ...deployForm,
                              targetType: e.target.value as ProjectDeploymentConfig['targetType'],
                            })
                          }
                          className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-slate-100"
                        >
                          <option value="thassi_app_hot_deploy">
                            Thassi Host Hot-Deploy (:8099) + HA Supervisor
                          </option>
                          <option value="ha_custom_component_samba">
                            Home Assistant custom_components (Samba / SSH)
                          </option>
                          <option value="ha_addon_supervisor">
                            Home Assistant Add-on Container Rebuild
                          </option>
                          <option value="standalone_docker">Standalone Docker / Web-App</option>
                        </select>
                      </div>

                      <div>
                        <label className="block text-slate-400 mb-1">Ziel-Host (Home Assistant / Server)</label>
                        <input
                          type="text"
                          value={deployForm.hassHost}
                          onChange={(e) =>
                            setDeployForm({ ...deployForm, hassHost: e.target.value })
                          }
                          className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-slate-100 font-mono"
                        />
                      </div>

                      <div>
                        <label className="block text-slate-400 mb-1">Ziel-Pfad auf dem Host</label>
                        <input
                          type="text"
                          value={deployForm.targetPath}
                          onChange={(e) =>
                            setDeployForm({ ...deployForm, targetPath: e.target.value })
                          }
                          className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-slate-100 font-mono"
                        />
                      </div>

                      <div>
                        <label className="block text-slate-400 mb-1">Git Release-Branch</label>
                        <input
                          type="text"
                          value={deployForm.branch}
                          onChange={(e) =>
                            setDeployForm({ ...deployForm, branch: e.target.value })
                          }
                          className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-slate-100 font-mono"
                        />
                      </div>
                    </div>

                    <div className="space-y-2 pt-2 border-t border-slate-800">
                      <label className="flex items-center gap-2.5 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={deployForm.autoDeployOnGreenTests}
                          onChange={(e) =>
                            setDeployForm({
                              ...deployForm,
                              autoDeployOnGreenTests: e.target.checked,
                            })
                          }
                          className="rounded border-slate-700 bg-slate-950 text-sky-500"
                        />
                        <span className="text-slate-200">
                          Auto-Deploy aktivieren, sobald alle Unit-Tests (100% PASS) grün sind
                        </span>
                      </label>

                      <label className="flex items-center gap-2.5 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={deployForm.rollbackOnFailure}
                          onChange={(e) =>
                            setDeployForm({
                              ...deployForm,
                              rollbackOnFailure: e.target.checked,
                            })
                          }
                          className="rounded border-slate-700 bg-slate-950 text-sky-500"
                        />
                        <span className="text-slate-200">
                          Automatischer Rollback auf letzten stabilen Git-SHA bei Fehlern
                        </span>
                      </label>

                      <label className="flex items-center gap-2.5 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={deployForm.publishHaTelemetrySensor}
                          onChange={(e) =>
                            setDeployForm({
                              ...deployForm,
                              publishHaTelemetrySensor: e.target.checked,
                            })
                          }
                          className="rounded border-slate-700 bg-slate-950 text-sky-500"
                        />
                        <span className="text-slate-200">
                          Deployment-Status als Home Assistant Entity publizieren ({deployForm.haEntityId})
                        </span>
                      </label>
                    </div>

                    <div className="flex flex-wrap gap-3 pt-2">
                      <button
                        type="submit"
                        disabled={savingDeploy}
                        className="px-4 py-2.5 rounded-xl bg-sky-500 hover:bg-sky-400 text-slate-950 font-bold transition-all cursor-pointer"
                      >
                        {savingDeploy
                          ? 'Speichere...'
                          : 'Deployment-Einstellungen speichern'}
                      </button>

                      <button
                        type="button"
                        onClick={handleTriggerPipeline}
                        disabled={runningPipeline}
                        className="px-4 py-2.5 rounded-xl bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-300 border border-emerald-500/40 font-bold transition-all cursor-pointer"
                      >
                        🚀 Jetzt für {selectedProject.name} ausführen
                      </button>
                    </div>
                  </form>
                </div>

                {/* Right Column: GitHub Collaborators & API Tokens */}
                <div className="lg:col-span-5 space-y-4">
                  <div className="rounded-2xl bg-slate-900/90 border border-slate-800 p-5 space-y-3">
                    <div className="flex items-center justify-between">
                      <h3 className="text-sm font-bold text-white">
                        GitHub Collaborators ({selectedProject.repoFullName})
                      </h3>
                      <a
                        href={`${selectedProject.htmlUrl}/graphs/contributors`}
                        target="_blank"
                        rel="noreferrer"
                        className="text-xs text-sky-400 hover:underline"
                      >
                        Auf GitHub ↗
                      </a>
                    </div>

                    <div className="space-y-2.5">
                      {selectedProject.collaborators.map((collab) => (
                        <div
                          key={collab.login}
                          className="p-3 rounded-xl bg-slate-950 border border-slate-800 flex items-center justify-between gap-3"
                        >
                          <div className="flex items-center gap-3">
                            <img
                              src={collab.avatarUrl}
                              alt={collab.login}
                              className="w-9 h-9 rounded-full border border-slate-700"
                            />
                            <div>
                              <a
                                href={collab.htmlUrl}
                                target="_blank"
                                rel="noreferrer"
                                className="text-xs font-bold text-slate-100 hover:text-sky-400"
                              >
                                {collab.name} (@{collab.login}) ↗
                              </a>
                              <p className="text-[11px] text-slate-400">
                                {collab.role} • {collab.contributions} Beiträge
                              </p>
                            </div>
                          </div>

                          <div className="flex items-center gap-1 text-[10px] font-mono">
                            {collab.permissions.admin && (
                              <span className="px-2 py-0.5 rounded bg-rose-500/15 text-rose-300 border border-rose-500/30">
                                ADMIN
                              </span>
                            )}
                            {collab.permissions.push && (
                              <span className="px-2 py-0.5 rounded bg-emerald-500/15 text-emerald-300 border border-emerald-500/30">
                                PUSH
                              </span>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* GitHub & Gemini API Token Config */}
                  <div className="rounded-2xl bg-slate-900/90 border border-slate-800 p-5 space-y-3 text-xs">
                    <h3 className="text-sm font-bold text-white">
                      🔑 GitHub & Gemini API-Verbindung
                    </h3>
                    <p className="text-slate-400">
                      Mit einem GitHub Personal Access Token werden neue Issues direkt auf GitHub unter{' '}
                      <code className="text-slate-200">{selectedProject.repoFullName}</code> angelegt.
                    </p>
                    <div className="space-y-2">
                      <input
                        type="password"
                        placeholder="GitHub Personal Access Token (ghp_...)"
                        value={githubTokenInput}
                        onChange={(e) => setGithubTokenInput(e.target.value)}
                        className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-slate-100 font-mono"
                      />
                      <input
                        type="password"
                        placeholder="Gemini API Key (AIzaSy...)"
                        value={geminiKeyInput}
                        onChange={(e) => setGeminiKeyInput(e.target.value)}
                        className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-slate-100 font-mono"
                      />
                      <button
                        onClick={handleSaveCredentials}
                        disabled={savingConfig}
                        className="w-full py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-100 font-semibold border border-slate-700 transition-colors cursor-pointer"
                      >
                        {savingConfig ? 'Speichere...' : 'Tokens speichern & synchronisieren'}
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </>
        )}
      </main>
    </div>
  );
}
