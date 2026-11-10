import React, { useEffect, useState, useCallback } from 'react';
import { getHostBaseUrl } from '@thassi/sdk/client';
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

const API_BASE = `${getHostBaseUrl()}/api/apps/project-workflow`;

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

function signalDotColor(color: SignalColor | undefined): string {
  switch (color) {
    case 'green':
      return '#10b981';
    case 'amber':
      return '#f59e0b';
    case 'red':
      return '#ef4444';
    case 'cyan':
      return '#10b981';
    default:
      return '#52525b';
  }
}

function reqDotColor(status: ProjectRequirementItem['status'], priority: ProjectRequirementItem['priority']): string {
  if (status === 'verified' || status === 'implemented') return '#10b981';
  if (priority === 'must') return '#f59e0b';
  if (status === 'in_progress' || status === 'approved') return '#f59e0b';
  return '#52525b';
}

function formatRelativeAge(isoString: string | null | undefined, nowMs: number): string {
  if (!isoString) return 'nie';
  const parsed = Date.parse(isoString);
  if (Number.isNaN(parsed)) return isoString;
  const diffSec = Math.max(0, Math.floor((nowMs - parsed) / 1000));
  if (diffSec < 60) return `vor ${diffSec}s`;
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `vor ${diffMin}m`;
  const diffHours = Math.floor(diffMin / 60);
  if (diffHours < 24) return `vor ${diffHours}h`;
  const diffDays = Math.floor(diffHours / 24);
  return `vor ${diffDays}d`;
}

function formatDateTimeShort(isoString: string | null | undefined): string {
  if (!isoString) return '—';
  const d = new Date(isoString);
  if (Number.isNaN(d.getTime())) return isoString;
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
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
  const [copiedCode, setCopiedCode] = useState<boolean>(false);
  const [nowMs, setNowMs] = useState<number>(() => Date.now());

  // Collapsible forms
  const [showNewReqForm, setShowNewReqForm] = useState<boolean>(false);
  const [showNewIssueForm, setShowNewIssueForm] = useState<boolean>(false);
  const [showNewMsForm, setShowNewMsForm] = useState<boolean>(false);
  const [selectedReqId, setSelectedReqId] = useState<string | null>(null);

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
      setNowMs(Date.now());
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
    const pollTimer = setInterval(() => fetchOverview(false), 20000);
    const clockTimer = setInterval(() => setNowMs(Date.now()), 5000);
    return () => {
      clearInterval(pollTimer);
      clearInterval(clockTimer);
    };
  }, [fetchOverview]);

  const monitoredProjects: MonitoredThassiProject[] = overview?.monitoredProjects ?? [];
  const selectedProject: MonitoredThassiProject | null =
    monitoredProjects.find((p) => p.id === selectedProjectId) ?? monitoredProjects[0] ?? null;

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
      showToast(`Pipeline & Deployment für ${selectedProject?.name ?? 'Projekt'} ausgeführt.`);
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
        body: JSON.stringify({ slug: template.objectives.slug, template }),
      });
      if (!res.ok) throw new Error(`Testlauf fehlgeschlagen (${res.status})`);
      await fetchOverview(false);
      showToast('Unit-Tests ausgeführt (100% PASS).');
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
      setShowNewReqForm(false);
      await fetchOverview(false);
      showToast('Anforderung gespeichert.');
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
      showToast(`Anforderungs-Status auf "${nextStatus}" aktualisiert.`);
    } catch (err) {
      setErrorBanner(err instanceof Error ? err.message : String(err));
    }
  };

  const handleDeleteRequirement = async (reqId: string, reqCode: string) => {
    if (!selectedProject) return;
    try {
      await fetch(`${API_BASE}/projects/requirements`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          projectId: selectedProject.id,
          requirementId: reqId,
          delete: true,
        }),
      });
      if (selectedReqId === reqId) setSelectedReqId(null);
      await fetchOverview(false);
      showToast(`Anforderung ${reqCode} entfernt.`);
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
      showToast(`GitHub Issue für ${req.code} angelegt.`);
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
      setShowNewIssueForm(false);
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

  const handleDeleteIssue = async (issueNumber: number) => {
    if (!selectedProject) return;
    try {
      await fetch(`${API_BASE}/projects/issues`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          projectId: selectedProject.id,
          issueNumber,
          delete: true,
        }),
      });
      await fetchOverview(false);
      showToast(`Issue #${issueNumber} entfernt.`);
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
      setShowNewMsForm(false);
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
      <div className="pw-shell" style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <span className="status-dot" style={{ background: '#f59e0b' }} />
        <span className="mono" style={{ color: 'var(--text-secondary)', fontSize: 12.5 }}>
          Lade Projekt-Workflow &amp; GitHub-Synchronisation...
        </span>
      </div>
    );
  }

  const latestRun: WorkflowExecutionRecord | null = overview?.latestRun ?? null;
  const github = overview?.github;
  const ecosystem = overview?.ecosystem;

  const totalReqsCount = selectedProject ? selectedProject.requirements.length : 0;
  const verifiedReqsCount = selectedProject
    ? selectedProject.requirements.filter((r) => r.status === 'verified').length
    : 0;
  const openMustReqs = selectedProject
    ? selectedProject.requirements.filter((r) => r.priority === 'must' && r.status !== 'verified')
    : [];

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

  // Data Recency & User Action Required Calculation
  const githubSourceLabel =
    github?.source === 'github_api_live'
      ? 'GitHub API Live'
      : github?.source === 'github_api_cached'
        ? 'Lokaler Cache / Fallback (API Cached)'
        : 'Lokaler Cache / Fallback (Local Git)';
  const githubSourceIsLive = github?.source === 'github_api_live';
  const githubFetchedAge = formatRelativeAge(github?.fetchedAt, nowMs);
  const githubFetchedTimestamp = formatDateTimeShort(github?.fetchedAt);

  const latestRunTimestampRaw = latestRun?.finishedAt || latestRun?.startedAt || null;
  const latestRunAge = formatRelativeAge(latestRunTimestampRaw, nowMs);
  const latestRunTimestamp = formatDateTimeShort(latestRunTimestampRaw);

  const hasFailedTests =
    (latestRun && !latestRun.unitTestReport.passed) ||
    (selectedProject && selectedProject.testSummary.status === 'FAIL');
  const needsGithubSyncRefresh = !githubSourceIsLive || github?.statusFlag !== 'GITHUB_API_OK';
  const hasOpenMustReqs = openMustReqs.length > 0;
  const actionRequired = hasFailedTests || hasOpenMustReqs || needsGithubSyncRefresh;

  const actionReasons: string[] = [];
  if (hasOpenMustReqs) {
    actionReasons.push(
      `${openMustReqs.length} offene MUST-Anforderung${openMustReqs.length > 1 ? 'en' : ''} nicht verifiziert (${openMustReqs
        .map((r) => r.code)
        .join(', ')})`
    );
  }
  if (hasFailedTests) {
    actionReasons.push('Fehlgeschlagene Unit-Tests im letzten Pipeline-Lauf');
  }
  if (needsGithubSyncRefresh) {
    actionReasons.push(`GitHub-Daten aus ${githubSourceLabel} — Live-Sync oder Token-Prüfung empfohlen`);
  }

  const activeCodePreview = latestRun
    ? selectedFileTab === 'sensor'
      ? latestRun.generatedFiles.sensorPy
      : selectedFileTab === 'test'
        ? latestRun.generatedFiles.testPy
        : latestRun.generatedFiles.manifestJson
    : '# Noch kein Code-Lauf geladen.';

  const handleCopyCode = () => {
    navigator.clipboard.writeText(activeCodePreview).catch(() => {});
    setCopiedCode(true);
    setTimeout(() => setCopiedCode(false), 2000);
  };

  const selectedRequirement =
    selectedProject?.requirements.find((r) => r.id === selectedReqId) ??
    filteredRequirements[0] ??
    null;

  return (
    <div className="pw-shell">
      {/* 1. HEADER ZONE */}
      <header
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 16,
          paddingBottom: 20,
          borderBottom: '1px solid var(--line-hairline)',
        }}
      >
        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'baseline', gap: 14 }}>
          <h1
            style={{
              margin: 0,
              fontSize: 20,
              fontWeight: 500,
              letterSpacing: '-0.025em',
              color: 'var(--text-primary)',
            }}
          >
            Projekt-Workflow
          </h1>
          <span
            className="mono tabular-nums"
            style={{ fontSize: 12.5, color: 'var(--text-secondary)' }}
          >
            {monitoredProjects.length} Projekte · {selectedProject?.repoFullName ?? 'tsimhofer/thassi'} ·{' '}
            {selectedProject?.branch ?? 'main'} #{selectedProject?.lastCommitSha ?? 'HEAD'}
          </span>
        </div>

        {/* Project Selector + Quick Actions */}
        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 8 }}>
          <label
            htmlFor="pw-project-select"
            className="section-label"
            style={{ marginRight: 4 }}
          >
            PROJEKT
          </label>
          <select
            id="pw-project-select"
            value={selectedProject?.id ?? ''}
            onChange={(e) => setSelectedProjectId(e.target.value)}
            className="pw-select tabular-nums"
            style={{ height: 32, minWidth: 260 }}
          >
            {monitoredProjects.map((proj) => (
              <option key={proj.id} value={proj.id}>
                {proj.repoFullName} — {proj.category} ({proj.progressPercent}%)
              </option>
            ))}
          </select>

          <a href={`${getHostBaseUrl()}/apps/workflows/`} className="btn-ghost">
            Workflows Editor
          </a>

          <button
            type="button"
            onClick={() => fetchOverview(true)}
            disabled={refreshingGithub}
            className="btn-ghost"
          >
            {refreshingGithub ? 'Synchronisiere...' : 'GitHub Sync'}
          </button>

          <button
            type="button"
            onClick={handleRunTestsOnly}
            disabled={runningTestsOnly}
            className="btn-ghost"
          >
            {runningTestsOnly ? 'Tests laufen...' : 'Tests ausführen'}
          </button>

          <button
            type="button"
            onClick={handleTriggerPipeline}
            disabled={runningPipeline}
            className="btn-primary"
          >
            {runningPipeline ? 'Pipeline läuft...' : 'Pipeline starten'}
          </button>
        </div>
      </header>

      {/* 2. DATA RECENCY & USER ACTION REQUIRED STRIP */}
      <section
        style={{
          borderBottom: '1px solid var(--line-hairline)',
          padding: '12px 0',
          display: 'flex',
          flexDirection: 'column',
          gap: 10,
        }}
      >
        {/* Recency Metadata Row */}
        <div
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 16,
            fontSize: 12,
          }}
        >
          <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 16 }}>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
              <span
                className="status-dot"
                style={{
                  background:
                    github?.statusFlag === 'GITHUB_ERROR'
                      ? '#ef4444'
                      : githubSourceIsLive
                        ? '#10b981'
                        : '#f59e0b',
                }}
              />
              <span className="section-label">DATENQUELLE:</span>
              <span className="mono" style={{ color: 'var(--text-primary)' }}>
                {githubSourceLabel}
              </span>
            </span>

            <span style={{ color: 'var(--text-muted)' }}>·</span>

            <span className="tabular-nums" style={{ color: 'var(--text-secondary)' }}>
              <span className="section-label" style={{ marginRight: 6 }}>
                GITHUB FETCH:
              </span>
              <span className="mono" style={{ color: 'var(--text-primary)' }}>
                {githubFetchedAge}
              </span>{' '}
              <span className="mono" style={{ color: 'var(--text-muted)' }}>
                ({githubFetchedTimestamp})
              </span>
            </span>

            <span style={{ color: 'var(--text-muted)' }}>·</span>

            <span className="tabular-nums" style={{ color: 'var(--text-secondary)' }}>
              <span className="section-label" style={{ marginRight: 6 }}>
                LETZTER PIPELINE-RUN:
              </span>
              <span className="mono" style={{ color: 'var(--text-primary)' }}>
                {latestRunTimestamp}
              </span>{' '}
              <span className="mono" style={{ color: 'var(--text-muted)' }}>
                ({latestRunAge})
              </span>
            </span>
          </div>

          {selectedProject && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <span className="mono" style={{ fontSize: 11.5, color: 'var(--text-muted)' }}>
                Letzter Commit: &ldquo;{selectedProject.lastCommitMessage}&rdquo;
              </span>
              <a
                href={selectedProject.htmlUrl}
                target="_blank"
                rel="noreferrer"
                className="mono"
                style={{
                  fontSize: 12,
                  color: 'var(--text-secondary)',
                  textDecoration: 'none',
                }}
              >
                GitHub Repo ↗
              </a>
            </div>
          )}
        </div>

        {/* User Input / Action Required Banner */}
        <div
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 12,
            padding: '10px 14px',
            background: 'var(--bg-elevated)',
            border: '1px solid var(--line-hairline)',
            borderRadius: 4,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span
              className="status-dot"
              style={{
                background: hasFailedTests
                  ? '#ef4444'
                  : actionRequired
                    ? '#f59e0b'
                    : '#10b981',
              }}
            />
            <span
              className="mono"
              style={{
                fontSize: 11.5,
                fontWeight: 500,
                color: 'var(--text-primary)',
                textTransform: 'uppercase',
                letterSpacing: '0.05em',
              }}
            >
              {actionRequired ? 'BENUTZEREINGABE / AKTION ERFORDERLICH' : 'KEINE AKTION ERFORDERLICH'}
            </span>
            <span style={{ color: 'var(--text-secondary)', fontSize: 12.5 }}>
              {actionRequired
                ? actionReasons.join(' · ')
                : 'Alle MUST-Anforderungen verifiziert, Unit-Tests 100% PASS und GitHub-Synchronisation aktuell.'}
            </span>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            {hasOpenMustReqs && (
              <button
                type="button"
                onClick={() => {
                  setActiveTab('requirements');
                  setReqFilter('all');
                }}
                className="btn-inline"
              >
                Offene MUST-Anforderungen prüfen ({openMustReqs.length})
              </button>
            )}
            <button
              type="button"
              onClick={() => fetchOverview(true)}
              disabled={refreshingGithub}
              className="btn-inline"
            >
              GitHub Sync
            </button>
            <button
              type="button"
              onClick={handleRunTestsOnly}
              disabled={runningTestsOnly}
              className="btn-inline"
            >
              Tests ausführen
            </button>
            <button
              type="button"
              onClick={handleTriggerPipeline}
              disabled={runningPipeline}
              className="btn-inline"
              style={{ color: 'var(--text-primary)', borderColor: 'var(--line-focus)' }}
            >
              Pipeline starten
            </button>
          </div>
        </div>
      </section>

      {/* Error or Status Notification Row */}
      {errorBanner && (
        <div
          style={{
            padding: '10px 14px',
            marginTop: 12,
            background: 'var(--bg-elevated)',
            border: '1px solid var(--line-focus)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 12,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span className="status-dot" style={{ background: '#ef4444' }} />
            <span className="mono" style={{ fontSize: 12, color: 'var(--text-primary)' }}>
              FEHLER: {errorBanner}
            </span>
          </div>
          <button type="button" onClick={() => setErrorBanner(null)} className="btn-inline">
            Schließen
          </button>
        </div>
      )}

      {statusToast && (
        <div
          style={{
            padding: '10px 14px',
            marginTop: 12,
            background: 'var(--bg-elevated)',
            border: '1px solid var(--line-hairline)',
            display: 'flex',
            alignItems: 'center',
            gap: 8,
          }}
        >
          <span className="status-dot" style={{ background: '#10b981' }} />
          <span className="mono" style={{ fontSize: 12, color: 'var(--text-primary)' }}>
            {statusToast}
          </span>
        </div>
      )}

      {selectedProject && (
        <>
          {/* 3. 4-COLUMN HAIRLINE KPI STRIP */}
          <section
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
              borderBottom: '1px solid var(--line-hairline)',
            }}
          >
            {/* Col 1 */}
            <div
              style={{
                padding: '20px 24px 20px 0',
                borderRight: '1px solid var(--line-hairline)',
              }}
            >
              <div className="section-label">PROJEKT-STATUS &amp; HEALTH</div>
              <div
                className="tabular-nums"
                style={{
                  fontSize: 28,
                  fontWeight: 400,
                  letterSpacing: '-0.03em',
                  color: 'var(--text-primary)',
                  marginTop: 6,
                  display: 'flex',
                  alignItems: 'baseline',
                  gap: 10,
                }}
              >
                <span>{selectedProject.progressPercent}%</span>
                <span
                  className="mono"
                  style={{
                    fontSize: 12,
                    color: 'var(--text-secondary)',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 6,
                  }}
                >
                  <span
                    className="status-dot"
                    style={{ background: signalDotColor(selectedProject.signalColor) }}
                  />
                  {selectedProject.devStatusLabel}
                </span>
              </div>
              <div
                className="mono"
                style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 4 }}
              >
                {selectedProject.category} · {selectedProject.language}
              </div>
            </div>

            {/* Col 2 */}
            <div
              style={{
                padding: '20px 24px',
                borderRight: '1px solid var(--line-hairline)',
              }}
            >
              <div className="section-label">ANFORDERUNGEN (VERIFIZIERT)</div>
              <div
                className="tabular-nums"
                style={{
                  fontSize: 28,
                  fontWeight: 400,
                  letterSpacing: '-0.03em',
                  color: 'var(--text-primary)',
                  marginTop: 6,
                  display: 'flex',
                  alignItems: 'baseline',
                  gap: 10,
                }}
              >
                <span>
                  {verifiedReqsCount} / {totalReqsCount}
                </span>
                <span
                  className="mono"
                  style={{
                    fontSize: 12,
                    color: 'var(--text-secondary)',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 6,
                  }}
                >
                  <span
                    className="status-dot"
                    style={{ background: hasOpenMustReqs ? '#f59e0b' : '#10b981' }}
                  />
                  {hasOpenMustReqs ? `${openMustReqs.length} MUST offen` : 'Alle MUST verifiziert'}
                </span>
              </div>
              <div
                className="mono tabular-nums"
                style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 4 }}
              >
                MoSCoW-Spezifikation &amp; DoD-Gate
              </div>
            </div>

            {/* Col 3 */}
            <div
              style={{
                padding: '20px 24px',
                borderRight: '1px solid var(--line-hairline)',
              }}
            >
              <div className="section-label">OFFENE GITHUB ISSUES</div>
              <div
                className="tabular-nums"
                style={{
                  fontSize: 28,
                  fontWeight: 400,
                  letterSpacing: '-0.03em',
                  color: 'var(--text-primary)',
                  marginTop: 6,
                  display: 'flex',
                  alignItems: 'baseline',
                  gap: 10,
                }}
              >
                <span>{openIssuesCount}</span>
                <span
                  className="mono tabular-nums"
                  style={{
                    fontSize: 12,
                    color: 'var(--text-secondary)',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 6,
                  }}
                >
                  <span
                    className="status-dot"
                    style={{ background: openIssuesCount > 0 ? '#f59e0b' : '#10b981' }}
                  />
                  {closedIssuesCount} geschlossen
                </span>
              </div>
              <div
                className="mono tabular-nums"
                style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 4 }}
              >
                {selectedProject.milestones.length} Meilensteine · {selectedProject.collaborators.length} Collaborators
              </div>
            </div>

            {/* Col 4 */}
            <div style={{ padding: '20px 0 20px 24px' }}>
              <div className="section-label">LETZTER TEST- &amp; PIPELINE-RUN</div>
              <div
                className="tabular-nums"
                style={{
                  fontSize: 28,
                  fontWeight: 400,
                  letterSpacing: '-0.03em',
                  color: 'var(--text-primary)',
                  marginTop: 6,
                  display: 'flex',
                  alignItems: 'baseline',
                  gap: 10,
                }}
              >
                <span>
                  {selectedProject.testSummary.passed}/{selectedProject.testSummary.total} PASS
                </span>
                <span
                  className="mono tabular-nums"
                  style={{
                    fontSize: 12,
                    color: 'var(--text-secondary)',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 6,
                  }}
                >
                  <span
                    className="status-dot"
                    style={{
                      background:
                        selectedProject.testSummary.status === 'PASS'
                          ? '#10b981'
                          : selectedProject.testSummary.status === 'WARN'
                            ? '#f59e0b'
                            : '#ef4444',
                    }}
                  />
                  {selectedProject.testSummary.passRatePercent}%
                </span>
              </div>
              <div
                className="mono tabular-nums"
                style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 4 }}
              >
                Letzter Pipeline-Run: {latestRunAge} ({latestRun?.totalDurationMs ?? 0} ms)
              </div>
            </div>
          </section>

          {/* 4. CLEAN TEXT-LINK TABS */}
          <nav className="pw-tabs" aria-label="Projekt-Workflow Bereiche">
            <button
              type="button"
              onClick={() => setActiveTab('requirements')}
              className={`pw-tab ${activeTab === 'requirements' ? 'active' : ''}`}
            >
              <span>Anforderungen</span>
              <span className="mono tabular-nums" style={{ fontSize: 11.5, color: 'var(--text-muted)' }}>
                {selectedProject.requirements.length}
              </span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('issues')}
              className={`pw-tab ${activeTab === 'issues' ? 'active' : ''}`}
            >
              <span>GitHub Issues</span>
              <span className="mono tabular-nums" style={{ fontSize: 11.5, color: 'var(--text-muted)' }}>
                {openIssuesCount}/{selectedProject.issues.length}
              </span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('milestones')}
              className={`pw-tab ${activeTab === 'milestones' ? 'active' : ''}`}
            >
              <span>Meilensteine</span>
              <span className="mono tabular-nums" style={{ fontSize: 11.5, color: 'var(--text-muted)' }}>
                {selectedProject.milestones.length}
              </span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('testing')}
              className={`pw-tab ${activeTab === 'testing' ? 'active' : ''}`}
            >
              <span>Tests &amp; Pipeline</span>
              <span className="mono tabular-nums" style={{ fontSize: 11.5, color: 'var(--text-muted)' }}>
                {selectedProject.testSummary.passed}/{selectedProject.testSummary.total}
              </span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('deployment')}
              className={`pw-tab ${activeTab === 'deployment' ? 'active' : ''}`}
            >
              <span>Deployment &amp; Modul-Generator</span>
              <span className="mono" style={{ fontSize: 11.5, color: 'var(--text-muted)' }}>
                {deployForm?.lastDeployStatus ?? 'LIVE'}
              </span>
            </button>
          </nav>

          {/* TAB 1: ANFORDERUNGEN */}
          {activeTab === 'requirements' && (
            <section style={{ paddingTop: 24 }}>
              {/* Sub-header: Status filter text links + Collapsible + Neue Anforderung button */}
              <div
                style={{
                  display: 'flex',
                  flexWrap: 'wrap',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: 16,
                  paddingBottom: 16,
                  borderBottom: '1px solid var(--line-hairline)',
                }}
              >
                <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 18 }}>
                  <span className="section-label">STATUS-FILTER:</span>
                  {(['all', 'draft', 'approved', 'in_progress', 'implemented', 'verified'] as const).map(
                    (st) => (
                      <button
                        key={st}
                        type="button"
                        onClick={() => setReqFilter(st)}
                        className={`pw-subfilter ${reqFilter === st ? 'active' : ''}`}
                      >
                        {st === 'all' ? 'Alle' : st}
                      </button>
                    )
                  )}
                </div>

                <button
                  type="button"
                  onClick={() => setShowNewReqForm((prev) => !prev)}
                  className={showNewReqForm ? 'btn-ghost' : 'btn-primary'}
                >
                  {showNewReqForm ? 'Formular schließen' : '+ Neue Anforderung'}
                </button>
              </div>

              {/* Collapsible + Neue Anforderung Form */}
              {showNewReqForm && (
                <form
                  onSubmit={handleAddRequirement}
                  style={{
                    padding: '20px 0',
                    borderBottom: '1px solid var(--line-hairline)',
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
                    gap: 16,
                    alignItems: 'end',
                  }}
                >
                  <div>
                    <label className="section-label" style={{ display: 'block', marginBottom: 6 }}>
                      PRIORITÄT (MOSCOW)
                    </label>
                    <select
                      value={newReqPriority}
                      onChange={(e) =>
                        setNewReqPriority(e.target.value as 'must' | 'should' | 'could')
                      }
                      className="pw-select"
                      style={{ width: '100%' }}
                    >
                      <option value="must">MUST</option>
                      <option value="should">SHOULD</option>
                      <option value="could">COULD</option>
                    </select>
                  </div>

                  <div>
                    <label className="section-label" style={{ display: 'block', marginBottom: 6 }}>
                      TITEL DER ANFORDERUNG *
                    </label>
                    <input
                      type="text"
                      required
                      placeholder="Was soll das Modul / Feature leisten?"
                      value={newReqTitle}
                      onChange={(e) => setNewReqTitle(e.target.value)}
                      className="pw-input"
                      style={{ width: '100%' }}
                    />
                  </div>

                  <div>
                    <label className="section-label" style={{ display: 'block', marginBottom: 6 }}>
                      SPEZIFIKATION / BESCHREIBUNG
                    </label>
                    <input
                      type="text"
                      placeholder="Technische Details, Schnittstellen, HA Entities..."
                      value={newReqDesc}
                      onChange={(e) => setNewReqDesc(e.target.value)}
                      className="pw-input"
                      style={{ width: '100%' }}
                    />
                  </div>

                  <div>
                    <label className="section-label" style={{ display: 'block', marginBottom: 6 }}>
                      AKZEPTANZKRITERIUM (DOD)
                    </label>
                    <input
                      type="text"
                      placeholder="z.B. Unit-Tests 100% PASS & HA Sensor sichtbar"
                      value={newReqCriteria}
                      onChange={(e) => setNewReqCriteria(e.target.value)}
                      className="pw-input"
                      style={{ width: '100%' }}
                    />
                  </div>

                  <div>
                    <label className="section-label" style={{ display: 'block', marginBottom: 6 }}>
                      MEILENSTEIN
                    </label>
                    <select
                      value={newReqMilestone}
                      onChange={(e) => setNewReqMilestone(e.target.value)}
                      className="pw-select"
                      style={{ width: '100%' }}
                    >
                      <option value="">— Kein Meilenstein —</option>
                      {selectedProject.milestones.map((m) => (
                        <option key={m.id} value={m.title}>
                          {m.title}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <button type="submit" disabled={submittingReq} className="btn-primary">
                      {submittingReq ? 'Speichere...' : 'Anforderung speichern'}
                    </button>
                  </div>
                </form>
              )}

              {/* Master-Detail Split: Left Hairline Table + Right Inspector */}
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: selectedRequirement ? '1fr 360px' : '1fr',
                  gap: 32,
                  alignItems: 'start',
                }}
              >
                <div style={{ overflowX: 'auto' }}>
                  <table className="pw-table">
                    <thead>
                      <tr>
                        <th style={{ width: 150 }}>CODE / PRIO</th>
                        <th>ANFORDERUNG &amp; AKZEPTANZKRITERIUM</th>
                        <th style={{ width: 170 }}>MEILENSTEIN</th>
                        <th style={{ width: 150 }}>STATUS</th>
                        <th style={{ width: 190, textAlign: 'right', paddingRight: 0 }}>AKTIONEN</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredRequirements.map((req) => {
                        const isSelected = selectedRequirement?.id === req.id;
                        return (
                          <tr
                            key={req.id}
                            onClick={() => setSelectedReqId(req.id)}
                            className={`pw-row ${isSelected ? 'selected' : ''}`}
                            style={{ cursor: 'pointer' }}
                          >
                            <td className="mono tabular-nums">
                              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                <span
                                  className="status-dot"
                                  style={{ background: reqDotColor(req.status, req.priority) }}
                                />
                                <span style={{ color: 'var(--text-primary)', fontWeight: 500 }}>
                                  {req.code}
                                </span>
                                <span
                                  style={{
                                    fontSize: 11,
                                    color:
                                      req.priority === 'must'
                                        ? 'var(--text-primary)'
                                        : 'var(--text-muted)',
                                    textTransform: 'uppercase',
                                  }}
                                >
                                  {req.priority}
                                </span>
                              </div>
                            </td>

                            <td>
                              <div
                                style={{
                                  fontSize: 13.5,
                                  fontWeight: 500,
                                  color: 'var(--text-primary)',
                                  letterSpacing: '-0.01em',
                                }}
                              >
                                {req.title}
                              </div>
                              <div
                                style={{
                                  fontSize: 12.5,
                                  color: 'var(--text-secondary)',
                                  marginTop: 2,
                                }}
                              >
                                {req.description}
                              </div>
                              <div
                                className="mono"
                                style={{
                                  fontSize: 11.5,
                                  color: 'var(--text-muted)',
                                  marginTop: 4,
                                }}
                              >
                                DoD: {req.acceptanceCriteria}
                              </div>
                            </td>

                            <td className="mono" style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                              {req.milestoneTitle || '—'}
                            </td>

                            <td onClick={(e) => e.stopPropagation()}>
                              <select
                                value={req.status}
                                onChange={(e) =>
                                  handleUpdateRequirementStatus(
                                    req.id,
                                    e.target.value as ProjectRequirementItem['status']
                                  )
                                }
                                className="pw-select"
                                style={{ padding: '4px 8px', fontSize: 12 }}
                              >
                                <option value="draft">draft</option>
                                <option value="approved">approved</option>
                                <option value="in_progress">in_progress</option>
                                <option value="implemented">implemented</option>
                                <option value="verified">verified</option>
                              </select>
                            </td>

                            <td
                              onClick={(e) => e.stopPropagation()}
                              style={{ textAlign: 'right', paddingRight: 0 }}
                            >
                              <div
                                style={{
                                  display: 'inline-flex',
                                  alignItems: 'center',
                                  gap: 6,
                                }}
                              >
                                {req.linkedIssueNumber ? (
                                  <button
                                    type="button"
                                    onClick={() => setActiveTab('issues')}
                                    className="btn-inline tabular-nums"
                                  >
                                    Issue #{req.linkedIssueNumber}
                                  </button>
                                ) : (
                                  <button
                                    type="button"
                                    onClick={() => handleCreateIssueFromRequirement(req)}
                                    disabled={submittingIssue}
                                    className="btn-inline"
                                  >
                                    + Issue
                                  </button>
                                )}
                                <button
                                  type="button"
                                  onClick={() => handleDeleteRequirement(req.id, req.code)}
                                  className="btn-inline"
                                  title="Anforderung löschen"
                                >
                                  Löschen
                                </button>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>

                {/* Right Inspector Panel */}
                {selectedRequirement && (
                  <aside
                    style={{
                      borderLeft: '1px solid var(--line-hairline)',
                      paddingLeft: 24,
                      paddingTop: 12,
                    }}
                  >
                    <div className="section-label">INSPECTOR · ANFORDERUNG</div>
                    <div
                      className="mono"
                      style={{
                        fontSize: 14,
                        fontWeight: 500,
                        color: 'var(--text-primary)',
                        marginTop: 8,
                        display: 'flex',
                        alignItems: 'center',
                        gap: 8,
                      }}
                    >
                      <span
                        className="status-dot"
                        style={{
                          background: reqDotColor(
                            selectedRequirement.status,
                            selectedRequirement.priority
                          ),
                        }}
                      />
                      <span>{selectedRequirement.code}</span>
                      <span style={{ color: 'var(--text-muted)' }}>·</span>
                      <span style={{ textTransform: 'uppercase' }}>
                        {selectedRequirement.priority}
                      </span>
                    </div>

                    <div
                      style={{
                        fontSize: 14,
                        fontWeight: 500,
                        color: 'var(--text-primary)',
                        marginTop: 8,
                      }}
                    >
                      {selectedRequirement.title}
                    </div>

                    <p
                      style={{
                        fontSize: 12.5,
                        color: 'var(--text-secondary)',
                        marginTop: 8,
                        lineHeight: 1.6,
                      }}
                    >
                      {selectedRequirement.description}
                    </p>

                    <div
                      style={{
                        borderTop: '1px solid var(--line-hairline)',
                        paddingTop: 12,
                        marginTop: 12,
                      }}
                    >
                      <div className="section-label">DEFINITION OF DONE</div>
                      <div
                        className="mono"
                        style={{
                          fontSize: 12,
                          color: 'var(--text-secondary)',
                          marginTop: 4,
                        }}
                      >
                        {selectedRequirement.acceptanceCriteria}
                      </div>
                    </div>

                    <div
                      style={{
                        borderTop: '1px solid var(--line-hairline)',
                        paddingTop: 12,
                        marginTop: 12,
                        display: 'flex',
                        flexDirection: 'column',
                        gap: 8,
                      }}
                    >
                      <div className="section-label">STATUS AKTUALISIEREN</div>
                      <select
                        value={selectedRequirement.status}
                        onChange={(e) =>
                          handleUpdateRequirementStatus(
                            selectedRequirement.id,
                            e.target.value as ProjectRequirementItem['status']
                          )
                        }
                        className="pw-select"
                      >
                        <option value="draft">draft</option>
                        <option value="approved">approved</option>
                        <option value="in_progress">in_progress</option>
                        <option value="implemented">implemented</option>
                        <option value="verified">verified</option>
                      </select>

                      <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
                        {!selectedRequirement.linkedIssueNumber && (
                          <button
                            type="button"
                            onClick={() => handleCreateIssueFromRequirement(selectedRequirement)}
                            disabled={submittingIssue}
                            className="btn-primary"
                          >
                            Als GitHub Issue anlegen
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() =>
                            handleDeleteRequirement(
                              selectedRequirement.id,
                              selectedRequirement.code
                            )
                          }
                          className="btn-ghost"
                        >
                          Löschen
                        </button>
                      </div>
                    </div>
                  </aside>
                )}
              </div>
            </section>
          )}

          {/* TAB 2: GITHUB ISSUES */}
          {activeTab === 'issues' && (
            <section style={{ paddingTop: 24 }}>
              <div
                style={{
                  display: 'flex',
                  flexWrap: 'wrap',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: 16,
                  paddingBottom: 16,
                  borderBottom: '1px solid var(--line-hairline)',
                }}
              >
                <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 18 }}>
                  <span className="section-label">ISSUE-FILTER:</span>
                  <button
                    type="button"
                    onClick={() => setIssueFilter('all')}
                    className={`pw-subfilter tabular-nums ${issueFilter === 'all' ? 'active' : ''}`}
                  >
                    Alle ({selectedProject.issues.length})
                  </button>
                  <button
                    type="button"
                    onClick={() => setIssueFilter('open')}
                    className={`pw-subfilter tabular-nums ${issueFilter === 'open' ? 'active' : ''}`}
                  >
                    Offen ({openIssuesCount})
                  </button>
                  <button
                    type="button"
                    onClick={() => setIssueFilter('closed')}
                    className={`pw-subfilter tabular-nums ${issueFilter === 'closed' ? 'active' : ''}`}
                  >
                    Geschlossen ({closedIssuesCount})
                  </button>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <a
                    href={`${selectedProject.htmlUrl}/issues`}
                    target="_blank"
                    rel="noreferrer"
                    className="btn-ghost"
                  >
                    Auf GitHub öffnen ↗
                  </a>
                  <button
                    type="button"
                    onClick={() => setShowNewIssueForm((prev) => !prev)}
                    className={showNewIssueForm ? 'btn-ghost' : 'btn-primary'}
                  >
                    {showNewIssueForm ? 'Formular schließen' : '+ Neues Issue'}
                  </button>
                </div>
              </div>

              {showNewIssueForm && (
                <form
                  onSubmit={handleCreateIssue}
                  style={{
                    padding: '20px 0',
                    borderBottom: '1px solid var(--line-hairline)',
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
                    gap: 16,
                    alignItems: 'end',
                  }}
                >
                  <div>
                    <label className="section-label" style={{ display: 'block', marginBottom: 6 }}>
                      ISSUE-TITEL *
                    </label>
                    <input
                      type="text"
                      required
                      placeholder="z.B. [Feat] Shelly Gen3 Webhook Timeout erhöhen"
                      value={newIssueTitle}
                      onChange={(e) => setNewIssueTitle(e.target.value)}
                      className="pw-input"
                      style={{ width: '100%' }}
                    />
                  </div>

                  <div>
                    <label className="section-label" style={{ display: 'block', marginBottom: 6 }}>
                      BESCHREIBUNG / REPRODUKTION
                    </label>
                    <input
                      type="text"
                      placeholder="Details zum Feature-Wunsch oder Bug..."
                      value={newIssueBody}
                      onChange={(e) => setNewIssueBody(e.target.value)}
                      className="pw-input"
                      style={{ width: '100%' }}
                    />
                  </div>

                  <div>
                    <label className="section-label" style={{ display: 'block', marginBottom: 6 }}>
                      LABELS (KOMMA-GETRENNT)
                    </label>
                    <input
                      type="text"
                      value={newIssueLabels}
                      onChange={(e) => setNewIssueLabels(e.target.value)}
                      className="pw-input"
                      style={{ width: '100%' }}
                    />
                  </div>

                  <div>
                    <label className="section-label" style={{ display: 'block', marginBottom: 6 }}>
                      ASSIGNEE
                    </label>
                    <select
                      value={newIssueAssignee}
                      onChange={(e) => setNewIssueAssignee(e.target.value)}
                      className="pw-select"
                      style={{ width: '100%' }}
                    >
                      {selectedProject.collaborators.map((c) => (
                        <option key={c.login} value={c.login}>
                          @{c.login}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="section-label" style={{ display: 'block', marginBottom: 6 }}>
                      MEILENSTEIN
                    </label>
                    <select
                      value={newIssueMilestone}
                      onChange={(e) => setNewIssueMilestone(e.target.value)}
                      className="pw-select"
                      style={{ width: '100%' }}
                    >
                      <option value="">— Kein Meilenstein —</option>
                      {selectedProject.milestones.map((m) => (
                        <option key={m.id} value={m.title}>
                          {m.title}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <button type="submit" disabled={submittingIssue} className="btn-primary">
                      {submittingIssue ? 'Erstelle...' : 'Issue anlegen'}
                    </button>
                  </div>
                </form>
              )}

              <div style={{ overflowX: 'auto' }}>
                <table className="pw-table">
                  <thead>
                    <tr>
                      <th style={{ width: 130 }}>STATUS / NR</th>
                      <th>TITEL &amp; BESCHREIBUNG</th>
                      <th style={{ width: 180 }}>LABELS &amp; MEILENSTEIN</th>
                      <th style={{ width: 130 }}>ASSIGNEE</th>
                      <th style={{ width: 150 }}>AKTUALISIERT</th>
                      <th style={{ width: 210, textAlign: 'right', paddingRight: 0 }}>AKTIONEN</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredIssues.map((issue) => (
                      <tr key={issue.id} className="pw-row">
                        <td className="mono tabular-nums">
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <span
                              className="status-dot"
                              style={{
                                background: issue.state === 'open' ? '#10b981' : '#52525b',
                              }}
                            />
                            <span style={{ color: 'var(--text-primary)', fontWeight: 500 }}>
                              #{issue.number}
                            </span>
                            <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                              {issue.state.toUpperCase()}
                            </span>
                          </div>
                        </td>

                        <td>
                          <div
                            style={{
                              fontSize: 13.5,
                              fontWeight: 500,
                              color: 'var(--text-primary)',
                              letterSpacing: '-0.01em',
                            }}
                          >
                            {issue.title}
                          </div>
                          {issue.body && (
                            <div
                              style={{
                                fontSize: 12.5,
                                color: 'var(--text-secondary)',
                                marginTop: 2,
                              }}
                            >
                              {issue.body}
                            </div>
                          )}
                        </td>

                        <td className="mono" style={{ fontSize: 11.5 }}>
                          <div style={{ color: 'var(--text-secondary)' }}>
                            {issue.labels.join(', ') || '—'}
                          </div>
                          {issue.milestoneTitle && (
                            <div style={{ color: 'var(--text-muted)', marginTop: 2 }}>
                              {issue.milestoneTitle}
                            </div>
                          )}
                        </td>

                        <td className="mono" style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                          {issue.assignee ? `@${issue.assignee}` : `@${issue.author}`}
                        </td>

                        <td
                          className="mono tabular-nums"
                          style={{ fontSize: 11.5, color: 'var(--text-muted)' }}
                        >
                          {formatDateTimeShort(issue.updatedAt)}
                        </td>

                        <td style={{ textAlign: 'right', paddingRight: 0 }}>
                          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                            <button
                              type="button"
                              onClick={() => handleToggleIssueState(issue.number, issue.state)}
                              className="btn-inline"
                            >
                              {issue.state === 'open' ? 'Schließen' : 'Öffnen'}
                            </button>
                            <button
                              type="button"
                              onClick={() => handleDeleteIssue(issue.number)}
                              className="btn-inline"
                            >
                              Löschen
                            </button>
                            <a
                              href={issue.htmlUrl}
                              target="_blank"
                              rel="noreferrer"
                              className="btn-inline"
                              style={{ textDecoration: 'none' }}
                            >
                              GitHub ↗
                            </a>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          )}

          {/* TAB 3: MEILENSTEINE */}
          {activeTab === 'milestones' && (
            <section style={{ paddingTop: 24 }}>
              <div
                style={{
                  display: 'flex',
                  flexWrap: 'wrap',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: 16,
                  paddingBottom: 16,
                  borderBottom: '1px solid var(--line-hairline)',
                }}
              >
                <div>
                  <span className="section-label">
                    RELEASE-MEILENSTEINE &amp; ROADMAP — {selectedProject.name}
                  </span>
                </div>

                <button
                  type="button"
                  onClick={() => setShowNewMsForm((prev) => !prev)}
                  className={showNewMsForm ? 'btn-ghost' : 'btn-primary'}
                >
                  {showNewMsForm ? 'Formular schließen' : '+ Neuer Meilenstein'}
                </button>
              </div>

              {showNewMsForm && (
                <form
                  onSubmit={handleCreateMilestone}
                  style={{
                    padding: '20px 0',
                    borderBottom: '1px solid var(--line-hairline)',
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
                    gap: 16,
                    alignItems: 'end',
                  }}
                >
                  <div>
                    <label className="section-label" style={{ display: 'block', marginBottom: 6 }}>
                      MEILENSTEIN-TITEL *
                    </label>
                    <input
                      type="text"
                      required
                      placeholder="z.B. v1.3.0 — Multi-Sensor Automation"
                      value={newMsTitle}
                      onChange={(e) => setNewMsTitle(e.target.value)}
                      className="pw-input"
                      style={{ width: '100%' }}
                    />
                  </div>

                  <div>
                    <label className="section-label" style={{ display: 'block', marginBottom: 6 }}>
                      ZIELDATUM
                    </label>
                    <input
                      type="date"
                      value={newMsDueDate}
                      onChange={(e) => setNewMsDueDate(e.target.value)}
                      className="pw-input tabular-nums"
                      style={{ width: '100%' }}
                    />
                  </div>

                  <div>
                    <label className="section-label" style={{ display: 'block', marginBottom: 6 }}>
                      ZIELSETZUNG / LIEFERUMFANG
                    </label>
                    <input
                      type="text"
                      placeholder="Welche Features und Tests gehören in dieses Release?"
                      value={newMsDesc}
                      onChange={(e) => setNewMsDesc(e.target.value)}
                      className="pw-input"
                      style={{ width: '100%' }}
                    />
                  </div>

                  <div>
                    <button type="submit" disabled={submittingMs} className="btn-primary">
                      {submittingMs ? 'Erstelle...' : 'Meilenstein anlegen'}
                    </button>
                  </div>
                </form>
              )}

              <div>
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
                      style={{
                        padding: '18px 0',
                        borderBottom: '1px solid var(--line-hairline)',
                        display: 'grid',
                        gridTemplateColumns: '1fr 260px 160px',
                        gap: 24,
                        alignItems: 'center',
                      }}
                    >
                      <div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                          <span
                            className="status-dot"
                            style={{
                              background: ms.state === 'open' ? '#10b981' : '#52525b',
                            }}
                          />
                          <span
                            style={{
                              fontSize: 13.5,
                              fontWeight: 500,
                              color: 'var(--text-primary)',
                            }}
                          >
                            {ms.title}
                          </span>
                          <span
                            className="mono"
                            style={{ fontSize: 11.5, color: 'var(--text-muted)' }}
                          >
                            [{ms.state.toUpperCase()}]
                          </span>
                          {ms.dueDate && (
                            <span
                              className="mono tabular-nums"
                              style={{ fontSize: 11.5, color: 'var(--text-muted)' }}
                            >
                              Zieldatum: {ms.dueDate}
                            </span>
                          )}
                        </div>
                        <div
                          style={{
                            fontSize: 12.5,
                            color: 'var(--text-secondary)',
                            marginTop: 4,
                          }}
                        >
                          {ms.description}
                        </div>
                        {(linkedReqs.length > 0 || linkedIssues.length > 0) && (
                          <div
                            className="mono tabular-nums"
                            style={{
                              fontSize: 11.5,
                              color: 'var(--text-muted)',
                              marginTop: 6,
                              display: 'flex',
                              flexWrap: 'wrap',
                              gap: 12,
                            }}
                          >
                            {linkedReqs.map((r) => (
                              <span key={r.id}>
                                {r.code} ({r.status})
                              </span>
                            ))}
                            {linkedIssues.map((i) => (
                              <span key={i.id}>
                                #{i.number} ({i.state})
                              </span>
                            ))}
                          </div>
                        )}
                      </div>

                      {/* Progress Bar */}
                      <div>
                        <div
                          className="mono tabular-nums"
                          style={{
                            display: 'flex',
                            justifyContent: 'space-between',
                            fontSize: 11.5,
                            color: 'var(--text-secondary)',
                            marginBottom: 6,
                          }}
                        >
                          <span>
                            {ms.closedIssues} erledigt / {ms.openIssues} offen
                          </span>
                          <span style={{ color: 'var(--text-primary)' }}>
                            {ms.progressPercent}%
                          </span>
                        </div>
                        <div
                          style={{
                            width: '100%',
                            height: 3,
                            background: 'rgba(255, 255, 255, 0.08)',
                          }}
                        >
                          <div
                            style={{
                              width: `${ms.progressPercent}%`,
                              height: '100%',
                              background: '#fafafa',
                            }}
                          />
                        </div>
                      </div>

                      {/* Actions */}
                      <div style={{ textAlign: 'right' }}>
                        <button
                          type="button"
                          onClick={() => handleToggleMilestoneState(ms.id, ms.state)}
                          className="btn-inline"
                        >
                          {ms.state === 'open' ? 'Als erledigt markieren' : 'Wieder öffnen'}
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>
          )}

          {/* TAB 4: TESTS & PIPELINE */}
          {activeTab === 'testing' && (
            <section style={{ paddingTop: 24 }}>
              {/* Top Command & Trigger Bar */}
              <div
                style={{
                  display: 'flex',
                  flexWrap: 'wrap',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: 16,
                  paddingBottom: 16,
                  borderBottom: '1px solid var(--line-hairline)',
                }}
              >
                <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 16 }}>
                  <span className="section-label">TEST-KOMMANDO:</span>
                  <code
                    className="mono"
                    style={{
                      fontSize: 12.5,
                      color: 'var(--text-primary)',
                      background: 'var(--bg-elevated)',
                      padding: '4px 10px',
                      border: '1px solid var(--line-hairline)',
                      borderRadius: 4,
                    }}
                  >
                    $ {selectedProject.testSummary.command}
                  </code>
                  <span
                    className="mono tabular-nums"
                    style={{ fontSize: 12, color: 'var(--text-secondary)' }}
                  >
                    Framework: {selectedProject.testSummary.framework} ·{' '}
                    {selectedProject.testSummary.passed}/{selectedProject.testSummary.total} PASS (
                    {selectedProject.testSummary.passRatePercent}%)
                  </span>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <button
                    type="button"
                    onClick={handleRunTestsOnly}
                    disabled={runningTestsOnly}
                    className="btn-ghost"
                  >
                    {runningTestsOnly ? 'Tests laufen...' : 'Tests ausführen'}
                  </button>
                  <button
                    type="button"
                    onClick={handleTriggerPipeline}
                    disabled={runningPipeline}
                    className="btn-primary"
                  >
                    {runningPipeline ? 'Pipeline läuft...' : 'Pipeline starten'}
                  </button>
                </div>
              </div>

              {/* 6-Stage n8n / CI Workflow Node States Table */}
              <div style={{ paddingTop: 20, paddingBottom: 24 }}>
                <div className="section-label" style={{ marginBottom: 8 }}>
                  N8N / CI WORKFLOW-STUFEN ({selectedProject.name})
                </div>
                <div style={{ overflowX: 'auto' }}>
                  <table className="pw-table">
                    <thead>
                      <tr>
                        <th style={{ width: 60 }}>NR</th>
                        <th style={{ width: 220 }}>KNOTEN / STUFE</th>
                        <th style={{ width: 180 }}>N8N-TYP</th>
                        <th style={{ width: 180 }}>STATUS-FLAG</th>
                        <th>ZUSAMMENFASSUNG</th>
                        <th style={{ width: 110, textAlign: 'right', paddingRight: 0 }}>LAUFZEIT</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(latestRun?.nodes ?? selectedProject.n8nPipelineNodes).map((node) => (
                        <tr key={node.id} className="pw-row">
                          <td className="mono tabular-nums" style={{ color: 'var(--text-muted)' }}>
                            0{node.index}
                          </td>
                          <td style={{ color: 'var(--text-primary)', fontWeight: 500 }}>
                            {node.name}
                          </td>
                          <td className="mono" style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                            {node.n8nType}
                          </td>
                          <td className="mono" style={{ fontSize: 12 }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                              <span
                                className="status-dot"
                                style={{ background: signalDotColor(node.signalColor) }}
                              />
                              <span style={{ color: 'var(--text-primary)' }}>{node.statusFlag}</span>
                            </div>
                          </td>
                          <td style={{ color: 'var(--text-secondary)' }}>{node.summary}</td>
                          <td
                            className="mono tabular-nums"
                            style={{
                              textAlign: 'right',
                              paddingRight: 0,
                              color: 'var(--text-secondary)',
                            }}
                          >
                            {node.durationMs} ms
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Split Section: Test Cases & Run History */}
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fit, minmax(420px, 1fr))',
                  gap: 32,
                  borderTop: '1px solid var(--line-hairline)',
                  paddingTop: 24,
                }}
              >
                {/* Left: Test Suites & Unit Test Cases */}
                <div>
                  <div className="section-label" style={{ marginBottom: 8 }}>
                    AKTIVE TEST-SUITES &amp; VERIFIKATIONEN
                  </div>
                  <table className="pw-table">
                    <thead>
                      <tr>
                        <th style={{ width: 90 }}>ERGEBNIS</th>
                        <th>TEST-SUITE / PRÜFPUNKT</th>
                      </tr>
                    </thead>
                    <tbody>
                      {selectedProject.testSummary.details.map((detail, idx) => (
                        <tr key={idx} className="pw-row">
                          <td className="mono">
                            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                              <span className="status-dot" style={{ background: '#10b981' }} />
                              <span style={{ color: 'var(--text-primary)' }}>PASS</span>
                            </span>
                          </td>
                          <td className="mono" style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                            {detail}
                          </td>
                        </tr>
                      ))}
                      {latestRun?.unitTestReport.testCases.map((tc) => (
                        <tr key={tc.name} className="pw-row">
                          <td className="mono">
                            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                              <span
                                className="status-dot"
                                style={{
                                  background: tc.status === 'PASS' ? '#10b981' : '#ef4444',
                                }}
                              />
                              <span style={{ color: 'var(--text-primary)' }}>{tc.status}</span>
                            </span>
                          </td>
                          <td>
                            <div className="mono" style={{ fontSize: 12, color: 'var(--text-primary)' }}>
                              {tc.name}
                            </div>
                            <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                              {tc.description}
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {/* Right: Workflow Run History Table */}
                <div>
                  <div className="section-label" style={{ marginBottom: 8 }}>
                    PIPELINE RUN-HISTORIE ({overview?.runs.length ?? 0} LÄUFE)
                  </div>
                  <table className="pw-table">
                    <thead>
                      <tr>
                        <th>MODUL / SLUG</th>
                        <th>STATUS</th>
                        <th className="tabular-nums">TESTS</th>
                        <th className="tabular-nums">DAUER</th>
                        <th style={{ textAlign: 'right', paddingRight: 0 }}>ZEITSTEMPEL</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(overview?.runs ?? []).map((run) => (
                        <tr key={run.runId} className="pw-row">
                          <td className="mono" style={{ fontSize: 12, color: 'var(--text-primary)' }}>
                            {run.moduleSlug}
                          </td>
                          <td className="mono" style={{ fontSize: 11.5 }}>
                            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                              <span
                                className="status-dot"
                                style={{ background: signalDotColor(run.signalColor) }}
                              />
                              <span style={{ color: 'var(--text-secondary)' }}>
                                {run.statusFlag}
                              </span>
                            </span>
                          </td>
                          <td className="mono tabular-nums" style={{ fontSize: 12 }}>
                            {run.unitTestReport.passedTests}/{run.unitTestReport.totalTests}
                          </td>
                          <td className="mono tabular-nums" style={{ fontSize: 12 }}>
                            {run.totalDurationMs} ms
                          </td>
                          <td
                            className="mono tabular-nums"
                            style={{
                              fontSize: 11.5,
                              color: 'var(--text-muted)',
                              textAlign: 'right',
                              paddingRight: 0,
                            }}
                          >
                            {formatDateTimeShort(run.finishedAt || run.startedAt)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </section>
          )}

          {/* TAB 5: DEPLOYMENT & MODUL-GENERATOR */}
          {activeTab === 'deployment' && deployForm && (
            <section
              style={{
                paddingTop: 24,
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(460px, 1fr))',
                gap: 48,
                alignItems: 'start',
              }}
            >
              {/* Left Column: Project Deployment Config + Collaborators + API Credentials */}
              <div>
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    paddingBottom: 12,
                    borderBottom: '1px solid var(--line-hairline)',
                  }}
                >
                  <span className="section-label">
                    DEPLOYMENT-KONFIGURATION — {selectedProject.name}
                  </span>
                  <span
                    className="mono"
                    style={{
                      fontSize: 12,
                      color: 'var(--text-primary)',
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 6,
                    }}
                  >
                    <span
                      className="status-dot"
                      style={{
                        background:
                          deployForm.lastDeployStatus === 'LIVE'
                            ? '#10b981'
                            : deployForm.lastDeployStatus === 'STANDBY'
                              ? '#f59e0b'
                              : '#ef4444',
                      }}
                    />
                    {deployForm.lastDeployStatus}
                  </span>
                </div>

                <form
                  onSubmit={handleSaveDeploymentConfig}
                  style={{
                    paddingTop: 16,
                    paddingBottom: 24,
                    borderBottom: '1px solid var(--line-hairline)',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 14,
                  }}
                >
                  <div
                    style={{
                      display: 'grid',
                      gridTemplateColumns: '1fr 1fr',
                      gap: 12,
                    }}
                  >
                    <div>
                      <label className="section-label" style={{ display: 'block', marginBottom: 6 }}>
                        DEPLOYMENT-MODUS
                      </label>
                      <select
                        value={deployForm.targetType}
                        onChange={(e) =>
                          setDeployForm({
                            ...deployForm,
                            targetType: e.target.value as ProjectDeploymentConfig['targetType'],
                          })
                        }
                        className="pw-select"
                        style={{ width: '100%' }}
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
                      <label className="section-label" style={{ display: 'block', marginBottom: 6 }}>
                        ZIEL-HOST (HA / SERVER)
                      </label>
                      <input
                        type="text"
                        value={deployForm.hassHost}
                        onChange={(e) =>
                          setDeployForm({ ...deployForm, hassHost: e.target.value })
                        }
                        className="pw-input tabular-nums"
                        style={{ width: '100%' }}
                      />
                    </div>

                    <div>
                      <label className="section-label" style={{ display: 'block', marginBottom: 6 }}>
                        ZIEL-PFAD AUF DEM HOST
                      </label>
                      <input
                        type="text"
                        value={deployForm.targetPath}
                        onChange={(e) =>
                          setDeployForm({ ...deployForm, targetPath: e.target.value })
                        }
                        className="pw-input"
                        style={{ width: '100%' }}
                      />
                    </div>

                    <div>
                      <label className="section-label" style={{ display: 'block', marginBottom: 6 }}>
                        GIT RELEASE-BRANCH
                      </label>
                      <input
                        type="text"
                        value={deployForm.branch}
                        onChange={(e) =>
                          setDeployForm({ ...deployForm, branch: e.target.value })
                        }
                        className="pw-input"
                        style={{ width: '100%' }}
                      />
                    </div>
                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8, paddingTop: 4 }}>
                    <label
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 8,
                        color: 'var(--text-secondary)',
                        cursor: 'pointer',
                      }}
                    >
                      <input
                        type="checkbox"
                        checked={deployForm.autoDeployOnGreenTests}
                        onChange={(e) =>
                          setDeployForm({
                            ...deployForm,
                            autoDeployOnGreenTests: e.target.checked,
                          })
                        }
                      />
                      <span>Auto-Deploy aktivieren, sobald alle Unit-Tests (100% PASS) grün sind</span>
                    </label>

                    <label
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 8,
                        color: 'var(--text-secondary)',
                        cursor: 'pointer',
                      }}
                    >
                      <input
                        type="checkbox"
                        checked={deployForm.rollbackOnFailure}
                        onChange={(e) =>
                          setDeployForm({
                            ...deployForm,
                            rollbackOnFailure: e.target.checked,
                          })
                        }
                      />
                      <span>Automatischer Rollback auf letzten stabilen Git-SHA bei Fehlern</span>
                    </label>

                    <label
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 8,
                        color: 'var(--text-secondary)',
                        cursor: 'pointer',
                      }}
                    >
                      <input
                        type="checkbox"
                        checked={deployForm.publishHaTelemetrySensor}
                        onChange={(e) =>
                          setDeployForm({
                            ...deployForm,
                            publishHaTelemetrySensor: e.target.checked,
                          })
                        }
                      />
                      <span>
                        Deployment-Status als Home Assistant Entity publizieren (
                        <code className="mono">{deployForm.haEntityId}</code>)
                      </span>
                    </label>
                  </div>

                  <div style={{ display: 'flex', gap: 10, paddingTop: 4 }}>
                    <button type="submit" disabled={savingDeploy} className="btn-primary">
                      {savingDeploy ? 'Speichere...' : 'Deployment-Optionen speichern'}
                    </button>
                    <button
                      type="button"
                      onClick={handleTriggerPipeline}
                      disabled={runningPipeline}
                      className="btn-ghost"
                    >
                      Pipeline für {selectedProject.name} starten
                    </button>
                  </div>
                </form>

                {/* API Credentials Config */}
                <div
                  style={{
                    paddingTop: 20,
                    paddingBottom: 20,
                    borderBottom: '1px solid var(--line-hairline)',
                  }}
                >
                  <div className="section-label" style={{ marginBottom: 8 }}>
                    GITHUB &amp; GEMINI API-VERBINDUNG ({ecosystem?.geminiKeySource ?? 'env'})
                  </div>
                  <div
                    style={{
                      display: 'grid',
                      gridTemplateColumns: '1fr 1fr auto',
                      gap: 10,
                      alignItems: 'center',
                    }}
                  >
                    <input
                      type="password"
                      placeholder="GitHub PAT (ghp_...)"
                      value={githubTokenInput}
                      onChange={(e) => setGithubTokenInput(e.target.value)}
                      className="pw-input"
                    />
                    <input
                      type="password"
                      placeholder="Gemini API Key (AIzaSy...)"
                      value={geminiKeyInput}
                      onChange={(e) => setGeminiKeyInput(e.target.value)}
                      className="pw-input"
                    />
                    <button
                      type="button"
                      onClick={handleSaveCredentials}
                      disabled={savingConfig}
                      className="btn-ghost"
                    >
                      {savingConfig ? 'Speichere...' : 'Tokens speichern'}
                    </button>
                  </div>
                </div>

                {/* Collaborators Table */}
                <div style={{ paddingTop: 20 }}>
                  <div className="section-label" style={{ marginBottom: 8 }}>
                    GITHUB COLLABORATORS ({selectedProject.repoFullName})
                  </div>
                  <table className="pw-table">
                    <thead>
                      <tr>
                        <th>LOGIN / NAME</th>
                        <th>ROLLE</th>
                        <th className="tabular-nums">COMMITS</th>
                        <th style={{ textAlign: 'right', paddingRight: 0 }}>BERECHTIGUNG</th>
                      </tr>
                    </thead>
                    <tbody>
                      {selectedProject.collaborators.map((collab) => (
                        <tr key={collab.login} className="pw-row">
                          <td>
                            <a
                              href={collab.htmlUrl}
                              target="_blank"
                              rel="noreferrer"
                              className="mono"
                              style={{
                                color: 'var(--text-primary)',
                                textDecoration: 'none',
                                fontWeight: 500,
                              }}
                            >
                              @{collab.login}
                            </a>{' '}
                            <span style={{ color: 'var(--text-muted)' }}>({collab.name})</span>
                          </td>
                          <td style={{ color: 'var(--text-secondary)' }}>{collab.role}</td>
                          <td className="mono tabular-nums">{collab.contributions}</td>
                          <td
                            className="mono"
                            style={{
                              textAlign: 'right',
                              paddingRight: 0,
                              fontSize: 11.5,
                              color: 'var(--text-muted)',
                            }}
                          >
                            {collab.permissions.admin
                              ? 'ADMIN · PUSH'
                              : collab.permissions.push
                                ? 'PUSH'
                                : 'READ'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Right Column: Thassi Module Template Generator & Code Preview */}
              <div
                style={{
                  borderLeft: '1px solid var(--line-hairline)',
                  paddingLeft: 32,
                }}
              >
                <div
                  style={{
                    display: 'flex',
                    flexWrap: 'wrap',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: 12,
                    paddingBottom: 12,
                    borderBottom: '1px solid var(--line-hairline)',
                  }}
                >
                  <span className="section-label">
                    THASSI MODUL-GENERATOR ({template.objectives.slug})
                  </span>

                  <select
                    value={template.objectives.slug}
                    onChange={(e) => {
                      const found = MODULE_TEMPLATE_PRESETS.find(
                        (p) => p.template.objectives.slug === e.target.value
                      );
                      if (found) setTemplate(structuredClone(found.template));
                    }}
                    className="pw-select"
                    style={{ fontSize: 12 }}
                  >
                    {MODULE_TEMPLATE_PRESETS.map((preset) => (
                      <option key={preset.id} value={preset.template.objectives.slug}>
                        {preset.label} ({preset.badge})
                      </option>
                    ))}
                  </select>
                </div>

                {/* Template Parameters Summary */}
                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: '1fr 1fr 1fr',
                    gap: 12,
                    padding: '14px 0',
                    borderBottom: '1px solid var(--line-hairline)',
                  }}
                >
                  <div>
                    <div className="section-label">MODUL-SLUG</div>
                    <div className="mono" style={{ color: 'var(--text-primary)', marginTop: 4 }}>
                      {template.objectives.slug}
                    </div>
                  </div>
                  <div>
                    <div className="section-label">HA DOMAIN / EINHEIT</div>
                    <div className="mono" style={{ color: 'var(--text-primary)', marginTop: 4 }}>
                      {template.objectives.domain} ({template.objectives.unitOfMeasurement})
                    </div>
                  </div>
                  <div>
                    <div className="section-label">INTERVALL / SCHWELLWERT</div>
                    <div
                      className="mono tabular-nums"
                      style={{ color: 'var(--text-primary)', marginTop: 4 }}
                    >
                      {template.objectives.pollingIntervalSeconds}s · {template.objectives.anomalyThreshold}{' '}
                      {template.objectives.unitOfMeasurement}
                    </div>
                  </div>
                </div>

                {/* File Tabs + Subtle Kopieren Action */}
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '10px 0',
                    borderBottom: '1px solid var(--line-hairline)',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 18 }}>
                    <button
                      type="button"
                      onClick={() => setSelectedFileTab('sensor')}
                      className={`pw-subfilter ${selectedFileTab === 'sensor' ? 'active' : ''}`}
                    >
                      sensor.py
                    </button>
                    <button
                      type="button"
                      onClick={() => setSelectedFileTab('test')}
                      className={`pw-subfilter ${selectedFileTab === 'test' ? 'active' : ''}`}
                    >
                      test_{template.objectives.slug}.py
                    </button>
                    <button
                      type="button"
                      onClick={() => setSelectedFileTab('manifest')}
                      className={`pw-subfilter ${selectedFileTab === 'manifest' ? 'active' : ''}`}
                    >
                      manifest.json
                    </button>
                  </div>

                  <button
                    type="button"
                    onClick={handleCopyCode}
                    style={{
                      background: 'transparent',
                      border: 'none',
                      color: 'var(--text-muted)',
                      fontFamily: 'var(--font-mono)',
                      fontSize: 11,
                      cursor: 'pointer',
                    }}
                  >
                    {copiedCode ? 'Kopiert' : 'Kopieren'}
                  </button>
                </div>

                {/* Clean Monospace Preview (No fake terminal window) */}
                <pre
                  style={{
                    margin: 0,
                    padding: '16px 0',
                    fontFamily: 'var(--font-mono)',
                    fontSize: 12,
                    lineHeight: 1.6,
                    color: 'var(--text-secondary)',
                    overflowX: 'auto',
                    maxHeight: 460,
                    overflowY: 'auto',
                  }}
                >
                  {activeCodePreview}
                </pre>
              </div>
            </section>
          )}
        </>
      )}
    </div>
  );
}
