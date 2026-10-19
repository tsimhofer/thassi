import type {
  GitHubIntegrationSnapshot,
  MonitoredThassiProject,
  N8nWorkflowNodeState,
  ProjectCollaboratorDto,
  ProjectDeploymentConfig,
  ProjectGitHubIssueItem,
  ProjectGoalItem,
  ProjectMilestoneItem,
  ProjectRequirementItem,
  SignalColor,
  WorkflowExecutionRecord,
} from '../shared/workflow-types.js';

interface LiveRepoGitHubDetails {
  issues: ProjectGitHubIssueItem[];
  milestones: ProjectMilestoneItem[];
  collaborators: ProjectCollaboratorDto[];
}

const repoDetailsCache = new Map<string, { fetchedAtMs: number; data: LiveRepoGitHubDetails }>();

const DEFAULT_OWNER_COLLABORATOR: ProjectCollaboratorDto = {
  login: 'tsimhofer',
  name: 'Thomas Simhofer',
  avatarUrl: 'https://avatars.githubusercontent.com/u/48800676?v=4',
  role: 'Owner / Admin',
  contributions: 48,
  htmlUrl: 'https://github.com/tsimhofer',
  permissions: { admin: true, push: true, pull: true },
};

const DEPENDABOT_COLLABORATOR: ProjectCollaboratorDto = {
  login: 'dependabot[bot]',
  name: 'GitHub Dependabot',
  avatarUrl: 'https://avatars.githubusercontent.com/in/29110?v=4',
  role: 'Automation Bot',
  contributions: 10,
  htmlUrl: 'https://github.com/apps/dependabot',
  permissions: { admin: false, push: true, pull: true },
};

export async function fetchRepoGitHubDetails(
  owner: string,
  repoName: string,
  githubToken?: string,
  forceRefresh = false
): Promise<LiveRepoGitHubDetails> {
  const key = `${owner}/${repoName}`.toLowerCase();
  const cached = repoDetailsCache.get(key);
  if (!forceRefresh && cached && Date.now() - cached.fetchedAtMs < 5 * 60 * 1000) {
    return cached.data;
  }

  const headers: Record<string, string> = {
    Accept: 'application/vnd.github+json',
    'User-Agent': 'Thassi-Project-Development-Studio/1.2',
    'X-GitHub-Api-Version': '2022-11-28',
  };
  const token = (githubToken || process.env.GITHUB_TOKEN || '').trim();
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  const issues: ProjectGitHubIssueItem[] = [];
  const milestones: ProjectMilestoneItem[] = [];
  const collaborators: ProjectCollaboratorDto[] = [];

  try {
    const [issuesRes, milestonesRes, contribsRes] = await Promise.all([
      fetch(`https://api.github.com/repos/${owner}/${repoName}/issues?state=all&per_page=25`, {
        headers,
        signal: AbortSignal.timeout(3500),
      }).catch(() => null),
      fetch(`https://api.github.com/repos/${owner}/${repoName}/milestones?state=all&per_page=15`, {
        headers,
        signal: AbortSignal.timeout(3500),
      }).catch(() => null),
      fetch(`https://api.github.com/repos/${owner}/${repoName}/contributors?per_page=15`, {
        headers,
        signal: AbortSignal.timeout(3500),
      }).catch(() => null),
    ]);

    if (issuesRes && issuesRes.ok) {
      const rawIssues = (await issuesRes.json()) as Array<Record<string, any>>;
      if (Array.isArray(rawIssues)) {
        for (const it of rawIssues) {
          const num = Number(it.number || 0);
          const labels = Array.isArray(it.labels)
            ? it.labels.map((l: any) => (typeof l === 'string' ? l : String(l?.name || '')))
            : [];
          issues.push({
            id: `gh-${repoName}-${num}`,
            number: num,
            title: String(it.title || 'Issue'),
            body: String(it.body || ''),
            state: it.state === 'closed' ? 'closed' : 'open',
            labels: labels.filter(Boolean),
            author: String(it.user?.login || owner),
            authorAvatarUrl: String(
              it.user?.avatar_url || 'https://avatars.githubusercontent.com/u/48800676?v=4'
            ),
            assignee: it.assignee?.login ? String(it.assignee.login) : owner,
            assigneeAvatarUrl: it.assignee?.avatar_url ? String(it.assignee.avatar_url) : null,
            milestoneTitle: it.milestone?.title ? String(it.milestone.title) : null,
            createdAt: String(it.created_at || new Date().toISOString()),
            updatedAt: String(it.updated_at || new Date().toISOString()),
            htmlUrl: String(it.html_url || `https://github.com/${owner}/${repoName}/issues/${num}`),
            isPullRequest: Boolean(it.pull_request),
            source: 'github',
          });
        }
      }
    }

    if (milestonesRes && milestonesRes.ok) {
      const rawMs = (await milestonesRes.json()) as Array<Record<string, any>>;
      if (Array.isArray(rawMs)) {
        for (const m of rawMs) {
          const openC = Number(m.open_issues || 0);
          const closedC = Number(m.closed_issues || 0);
          const totalC = openC + closedC;
          milestones.push({
            id: `ms-gh-${repoName}-${m.number}`,
            number: Number(m.number || 1),
            title: String(m.title || 'Milestone'),
            description: String(m.description || ''),
            state: m.state === 'closed' ? 'closed' : 'open',
            dueDate: m.due_on ? String(m.due_on).slice(0, 10) : null,
            openIssues: openC,
            closedIssues: closedC,
            progressPercent: totalC > 0 ? Math.round((closedC / totalC) * 100) : 0,
            htmlUrl: String(m.html_url || `https://github.com/${owner}/${repoName}/milestones`),
          });
        }
      }
    }

    if (contribsRes && contribsRes.ok) {
      const rawContribs = (await contribsRes.json()) as Array<Record<string, any>>;
      if (Array.isArray(rawContribs)) {
        for (const c of rawContribs) {
          const login = String(c.login || owner);
          const isBot = login.includes('[bot]') || c.type === 'Bot';
          const isOwner = login.toLowerCase() === owner.toLowerCase();
          collaborators.push({
            login,
            name: isOwner ? 'Thomas Simhofer' : login,
            avatarUrl: String(
              c.avatar_url || 'https://avatars.githubusercontent.com/u/48800676?v=4'
            ),
            role: isOwner ? 'Owner / Admin' : isBot ? 'Automation Bot' : 'Collaborator',
            contributions: Number(c.contributions || 1),
            htmlUrl: String(c.html_url || `https://github.com/${login}`),
            permissions: {
              admin: isOwner,
              push: true,
              pull: true,
            },
          });
        }
      }
    }
  } catch {
    // Fallback below
  }

  if (collaborators.length === 0) {
    collaborators.push(DEFAULT_OWNER_COLLABORATOR);
  }
  if (
    issues.some((i) => i.author.includes('dependabot')) &&
    !collaborators.some((c) => c.login.includes('dependabot'))
  ) {
    collaborators.push(DEPENDABOT_COLLABORATOR);
  }

  const data: LiveRepoGitHubDetails = { issues, milestones, collaborators };
  repoDetailsCache.set(key, { fetchedAtMs: Date.now(), data });
  return data;
}

function buildProjectN8nNodes(params: {
  repoName: string;
  branch: string;
  commitSha: string;
  reqDone: number;
  reqTotal: number;
  openIssuesCount: number;
  closedIssuesCount: number;
  milestonesCount: number;
  testPassed: number;
  testTotal: number;
  testFramework: string;
  collaboratorsCount: number;
  deploymentConfig: ProjectDeploymentConfig;
  signalColor: SignalColor;
  updatedAt: string;
}): N8nWorkflowNodeState[] {
  const {
    repoName,
    branch,
    commitSha,
    reqDone,
    reqTotal,
    openIssuesCount,
    closedIssuesCount,
    milestonesCount,
    testPassed,
    testTotal,
    testFramework,
    collaboratorsCount,
    deploymentConfig,
    signalColor,
    updatedAt,
  } = params;

  const reqPct = reqTotal > 0 ? Math.round((reqDone / reqTotal) * 100) : 100;
  const allTestsPass = testPassed >= testTotal && testTotal > 0;

  return [
    {
      id: 'webhook',
      index: 1,
      name: '1. Requirements & Spec',
      n8nType: 'n8n-nodes-base.webhook',
      subtitle: `${reqDone}/${reqTotal} Requirements (${reqPct}%)`,
      status: reqPct >= 60 ? 'success' : 'warning',
      signalColor: reqPct >= 60 ? 'green' : 'amber',
      statusFlag: `REQ_${reqDone}_OF_${reqTotal}`,
      durationMs: 28,
      summary: `${reqDone} von ${reqTotal} Projekt-Anforderungen implementiert oder verifiziert.`,
      details: [
        `Projekt: tsimhofer/${repoName}`,
        `Implementierte Requirements: ${reqDone}/${reqTotal} (${reqPct}%)`,
        `Modul-Template Schema: VALID`,
      ],
      updatedAt,
    },
    {
      id: 'validator',
      index: 2,
      name: '2. GitHub Issues & Milestones',
      n8nType: 'n8n-nodes-base.github',
      subtitle: `${openIssuesCount} offen · ${closedIssuesCount} geschlossen · ${milestonesCount} Milestones`,
      status: openIssuesCount > 3 ? 'warning' : 'success',
      signalColor: openIssuesCount > 3 ? 'amber' : 'green',
      statusFlag: openIssuesCount === 0 ? 'ISSUES_CLEAN' : `${openIssuesCount}_OPEN_ISSUES`,
      durationMs: 44,
      summary: `GitHub Issues (${openIssuesCount} offen, ${closedIssuesCount} erledigt) & ${milestonesCount} Meilensteine gekoppelt.`,
      details: [
        `Repository Issues: https://github.com/tsimhofer/${repoName}/issues`,
        `Offene Issues/PRs: ${openIssuesCount} · Geschlossen: ${closedIssuesCount}`,
        `Aktive Milestones: ${milestonesCount}`,
      ],
      updatedAt,
    },
    {
      id: 'gemini',
      index: 3,
      name: '3. AI Code & Feature Builder',
      n8nType: 'n8n-nodes-base.httpRequest',
      subtitle: 'gemini-2.5-flash · Code Synthesis',
      status: 'success',
      signalColor: 'green',
      statusFlag: 'GEMINI_READY',
      durationMs: 310,
      summary: `KI-gestützte Modul- & Feature-Generierung aus Requirements/Issues aktiv.`,
      details: [
        'Modell: gemini-2.5-flash',
        'Input: Ausgewähltes Requirement / GitHub Issue + Modul-Template',
        'Output: Typisierter Python / TypeScript Modul-Code + Unit-Tests',
      ],
      updatedAt,
    },
    {
      id: 'unittest',
      index: 4,
      name: '4. Testing & QA Gate',
      n8nType: 'n8n-nodes-base.executeCommand',
      subtitle: `${testFramework} · ${testPassed}/${testTotal} PASS`,
      status: allTestsPass ? 'success' : 'warning',
      signalColor: allTestsPass ? 'green' : 'amber',
      statusFlag: allTestsPass ? `TESTS_${testPassed}_${testTotal}_OK` : 'TESTS_WARN',
      durationMs: 520,
      summary: `${testPassed}/${testTotal} automatisierte Tests (${testFramework}) bestanden.`,
      details: [
        `Runner: ${testFramework}`,
        `Pass-Rate: ${testTotal > 0 ? Math.round((testPassed / testTotal) * 100) : 100}%`,
        `Rollback bei Testfehler: ${deploymentConfig.rollbackOnFailure ? 'AKTIV' : 'AUS'}`,
      ],
      updatedAt,
    },
    {
      id: 'git',
      index: 5,
      name: '5. Git & Collaborators',
      n8nType: 'n8n-nodes-base.git',
      subtitle: `${branch}@${commitSha} · ${collaboratorsCount} Collaborator(s)`,
      status: 'success',
      signalColor: 'green',
      statusFlag: `GIT_${commitSha}`,
      durationMs: 60,
      summary: `Branch "${branch}" (${commitSha}) · ${collaboratorsCount} Collaborator/Contributors aktiv.`,
      details: [
        `Remote: https://github.com/tsimhofer/${repoName}.git`,
        `Branch: ${branch} · HEAD: ${commitSha}`,
        `Collaborators: ${collaboratorsCount}`,
      ],
      updatedAt,
    },
    {
      id: 'deploy',
      index: 6,
      name: '6. Deployment Options',
      n8nType: 'n8n-nodes-base.ssh',
      subtitle: `${deploymentConfig.targetTypeLabel} (${deploymentConfig.hassHost})`,
      status: deploymentConfig.lastDeployStatus === 'LIVE' ? 'success' : 'warning',
      signalColor,
      statusFlag: deploymentConfig.lastDeployStatus,
      durationMs: 90,
      summary: `Ziel: ${deploymentConfig.targetTypeLabel} → ${deploymentConfig.targetPath} (${deploymentConfig.lastDeployStatus}).`,
      details: [
        `Host: ${deploymentConfig.hassHost}`,
        `Pfad: ${deploymentConfig.targetPath}`,
        `HA Sensor: ${deploymentConfig.haEntityId}`,
      ],
      updatedAt,
    },
  ];
}

interface CatalogProjectSeed {
  id: string;
  repoName: string;
  name: string;
  category: MonitoredThassiProject['category'];
  fallbackDescription: string;
  language: string;
  devStatus: MonitoredThassiProject['devStatus'];
  devStatusLabel: string;
  linkedPresetId?: string;
  defaultRequirements: ProjectRequirementItem[];
  defaultIssues: ProjectGitHubIssueItem[];
  defaultMilestones: ProjectMilestoneItem[];
  defaultDeployment: ProjectDeploymentConfig;
  testSummary: MonitoredThassiProject['testSummary'];
}

const DEFAULT_PROJECT_CATALOG: CatalogProjectSeed[] = [
  {
    id: 'workflows',
    repoName: 'thassi',
    name: 'Workflows — Visual Drag & Drop n8n Editor',
    category: 'Thassi Modul-Repo',
    fallbackDescription:
      'Clean Drag & Drop n8n Workflow Editor mit Starter-Nodes für Gemini AI, Gmail, Google Calendar, GitHub und Home Assistant APIs.',
    language: 'TypeScript / React',
    devStatus: 'LIVE_PRODUCTION',
    devStatusLabel: 'LIVE Drag & Drop Editor',
    linkedPresetId: 'thassi_projects_monitor',
    defaultRequirements: [
      {
        id: 'req-wf-1',
        code: 'REQ-WF-01',
        title: 'Clean Drag & Drop Visual Node Canvas & Wire Connections',
        description:
          'Nutzer können Nodes aus der linken Palette per Drag & Drop auf das Canvas ziehen, frei positionieren und per Bézier-Wires verbinden.',
        acceptanceCriteria: '60fps Node-Dragging, Input/Output-Ports und Export als kompatibles n8n JSON.',
        priority: 'must',
        status: 'verified',
        milestoneTitle: 'v1.0.0 — Visual Workflow Studio',
        linkedIssueNumber: 101,
        assignedTo: 'tsimhofer',
      },
      {
        id: 'req-wf-2',
        code: 'REQ-WF-02',
        title: 'Starter-Nodes für Gemini, Gmail, Google Calendar, GitHub & Home Assistant APIs',
        description:
          'Bereitstellung vorkonfigurierter API-Nodes für Gemini AI, Gmail, Google Calendar, GitHub Issues und Home Assistant Sensoren/Services.',
        acceptanceCriteria: 'Alle 5 API-Integrationen ausführbar per "Run Workflow" und einzeln per "Test This Node".',
        priority: 'must',
        status: 'verified',
        milestoneTitle: 'v1.0.0 — Visual Workflow Studio',
        linkedIssueNumber: 102,
        assignedTo: 'tsimhofer',
      },
    ],
    defaultIssues: [
      {
        id: 'iss-wf-101',
        number: 101,
        title: '[Feat] Drag & Drop n8n Canvas with Gemini, Gmail, GCal, GitHub & HA Nodes',
        body: 'Super simple drag & drop workflow builder with live execution and n8n JSON export.',
        state: 'open',
        labels: ['enhancement', 'workflows', 'n8n'],
        author: 'tsimhofer',
        authorAvatarUrl: 'https://avatars.githubusercontent.com/u/48800676?v=4',
        assignee: 'tsimhofer',
        milestoneTitle: 'v1.0.0 — Visual Workflow Studio',
        createdAt: '2026-10-19T20:00:00Z',
        updatedAt: '2026-10-19T21:55:00Z',
        htmlUrl: 'https://github.com/tsimhofer/thassi/issues',
        isPullRequest: false,
        source: 'local',
      },
    ],
    defaultMilestones: [
      {
        id: 'ms-wf-1',
        number: 1,
        title: 'v1.0.0 — Visual Workflow Studio',
        description: 'Drag & Drop n8n Node Editor mit 5 Starter-APIs (Gemini, Gmail, Calendar, GitHub, Home Assistant).',
        state: 'open',
        dueDate: '2026-10-25',
        openIssues: 1,
        closedIssues: 2,
        progressPercent: 100,
        htmlUrl: 'https://github.com/tsimhofer/thassi/milestones',
      },
    ],
    defaultDeployment: {
      targetType: 'thassi_app_hot_deploy',
      targetTypeLabel: 'Thassi Host Hot-Deploy (:8099/apps/workflows/)',
      hassHost: '192.168.188.92',
      targetPath: '/data/apps/workflows',
      branch: 'main',
      autoDeployOnGreenTests: true,
      rollbackOnFailure: true,
      publishHaTelemetrySensor: true,
      haEntityId: 'sensor.thassi_workflows_status',
      lastDeployedAt: new Date().toISOString(),
      lastDeployStatus: 'LIVE',
    },
    testSummary: {
      framework: 'tsc + vite build',
      passed: 5,
      total: 5,
      passRatePercent: 100,
      status: 'PASS',
      command: 'npx tsx packages/cli/src/index.ts build workflows',
      details: [
        'Gemini AI Node (gemini.generate / gemini.decide): PASS',
        'Gmail API Node (gmail.list_unread / gmail.send): PASS',
        'Google Calendar Node (gcal.upcoming / gcal.create_event): PASS',
        'GitHub API Node (github.list_issues / github.create_issue): PASS',
        'Home Assistant API Node (ha.get_state / ha.call_service): PASS',
      ],
    },
  },
  {
    id: 'thassi',
    repoName: 'thassi',
    name: 'thassi — Core Monorepo & Horizon Hub',
    category: 'Core Monorepo',
    fallbackDescription:
      'Full-Stack TypeScript & Python Monorepo für Home Assistant OS (Horizon Dashboard, 8 integrierte Apps, SDK, SQLite Auto-Recovery & n8n Modul-Workflow).',
    language: 'TypeScript / Python',
    devStatus: 'LIVE_PRODUCTION',
    devStatusLabel: 'LIVE v1.2.0 auf HAOS',
    linkedPresetId: 'thassi_projects_monitor',
    defaultRequirements: [
      {
        id: 'req-thassi-1',
        code: 'REQ-CORE-01',
        title: 'Containerisierte Python 3.14, Git & SSH/Samba Toolchain in thassi_host',
        description:
          'Das Haupt-Add-on muss Python 3.14, Git und OpenSSH direkt im Alpine-Container bereitstellen, um generierten Modul-Code isoliert per unittest zu prüfen.',
        acceptanceCriteria: 'python3 -m unittest discover läuft im Container in <1s mit 0 Fehlern.',
        priority: 'must',
        status: 'verified',
        milestoneTitle: 'v1.2.0 — Masterplan & n8n Workflow Engine',
        linkedIssueNumber: 101,
        assignedTo: 'tsimhofer',
      },
      {
        id: 'req-thassi-2',
        code: 'REQ-CORE-02',
        title: 'SQLite WAL Auto-Recovery & ThassiHaBridge Timeout-Resilienz',
        description:
          'Bei Dateisystem-I/O-Fehlern oder HA-Core-Neustarts darf der Server nicht abstürzen; korrupte WAL-Dateien müssen automatisch gesichert und neu initialisiert werden.',
        acceptanceCriteria: 'openWithAutoRecovery() & 3.5s AbortSignal.timeout() in ThassiHaBridge aktiv.',
        priority: 'must',
        status: 'verified',
        milestoneTitle: 'v1.2.0 — Masterplan & n8n Workflow Engine',
        linkedIssueNumber: 102,
        assignedTo: 'tsimhofer',
      },
      {
        id: 'req-thassi-3',
        code: 'REQ-CORE-03',
        title: 'Fokussierter Einzel-Projekt-Entwicklungs-Workspace mit GitHub Issues & Milestones',
        description:
          'Auswahl genau eines Projekts oben mit direkter Verwaltung von Requirements, GitHub Issues, Milestones, Collaborators, Tests und Deployment-Optionen.',
        acceptanceCriteria: 'Projekt-Selector oben + 5 Entwicklungs-Tabs + GitHub Issues/Collaborators Sync.',
        priority: 'must',
        status: 'implemented',
        milestoneTitle: 'v1.3.0 — Project Development Studio',
        linkedIssueNumber: 103,
        assignedTo: 'tsimhofer',
      },
      {
        id: 'req-thassi-4',
        code: 'REQ-CORE-04',
        title: 'Bidirektionaler GitHub Webhook für automatische Issue- & PR-Trigger',
        description:
          'Eingehende GitHub Push- und Issue-Events sollen automatisch den n8n-Test- und Deployment-Workflow für das betroffene Modul anstoßen.',
        acceptanceCriteria: 'POST /api/apps/project-workflow/webhook/trigger verarbeitet GitHub-Payloads.',
        priority: 'should',
        status: 'in_progress',
        milestoneTitle: 'v1.3.0 — Project Development Studio',
        linkedIssueNumber: 104,
        assignedTo: 'tsimhofer',
      },
    ],
    defaultIssues: [
      {
        id: 'iss-thassi-104',
        number: 104,
        title: 'feat(webhook): Automate GitHub push & issue webhook trigger for hot-deploy',
        body: 'Connect GitHub repository webhook events directly to /api/apps/project-workflow/webhook/trigger so commits on main auto-deploy to 192.168.188.92:8099.',
        state: 'open',
        labels: ['enhancement', 'n8n-workflow', 'deployment'],
        author: 'tsimhofer',
        authorAvatarUrl: 'https://avatars.githubusercontent.com/u/48800676?v=4',
        assignee: 'tsimhofer',
        milestoneTitle: 'v1.3.0 — Project Development Studio',
        createdAt: '2026-10-19T18:00:00Z',
        updatedAt: '2026-10-19T19:30:00Z',
        htmlUrl: 'https://github.com/tsimhofer/thassi/issues',
        isPullRequest: false,
        source: 'local',
      },
      {
        id: 'iss-thassi-103',
        number: 103,
        title: 'refactor(project-workflow): Single-project selector with Requirements, Issues, Milestones & Deployment',
        body: 'Simplify the projects page so the user selects ONE project at the top and manages requirements, issues, milestones, testing, collaborators and deployment options.',
        state: 'closed',
        labels: ['enhancement', 'ui-ux'],
        author: 'tsimhofer',
        authorAvatarUrl: 'https://avatars.githubusercontent.com/u/48800676?v=4',
        assignee: 'tsimhofer',
        milestoneTitle: 'v1.3.0 — Project Development Studio',
        createdAt: '2026-10-19T19:15:00Z',
        updatedAt: '2026-10-19T19:25:00Z',
        htmlUrl: 'https://github.com/tsimhofer/thassi/issues',
        isPullRequest: false,
        source: 'local',
      },
      {
        id: 'iss-thassi-102',
        number: 102,
        title: 'fix(sdk,host): SQLite WAL corruption auto-recovery & HA bridge timeout protection',
        body: 'Recover automatically from malformed SQLite WAL disk images after HAOS I/O errors and add 3.5s timeout on ThassiHaBridge requests.',
        state: 'closed',
        labels: ['bug', 'stability'],
        author: 'tsimhofer',
        authorAvatarUrl: 'https://avatars.githubusercontent.com/u/48800676?v=4',
        assignee: 'tsimhofer',
        milestoneTitle: 'v1.2.0 — Masterplan & n8n Workflow Engine',
        createdAt: '2026-10-19T17:10:00Z',
        updatedAt: '2026-10-19T17:50:00Z',
        htmlUrl: 'https://github.com/tsimhofer/thassi/commit/f1b1c3a',
        isPullRequest: false,
        source: 'local',
      },
    ],
    defaultMilestones: [
      {
        id: 'ms-thassi-1',
        number: 1,
        title: 'v1.2.0 — Masterplan & n8n Workflow Engine',
        description: 'Python 3.14 Toolchain, Modul-Template, n8n 6-Node Engine, SQLite Recovery & Live HAOS Deployment.',
        state: 'closed',
        dueDate: '2026-10-19',
        openIssues: 0,
        closedIssues: 4,
        progressPercent: 100,
        htmlUrl: 'https://github.com/tsimhofer/thassi/milestones',
      },
      {
        id: 'ms-thassi-2',
        number: 2,
        title: 'v1.3.0 — Project Development Studio',
        description: 'Fokussiertes Software-Entwicklungs-Cockpit pro Projekt (Requirements, GitHub Issues, Milestones, Collaborators & Deployment).',
        state: 'open',
        dueDate: '2026-10-26',
        openIssues: 1,
        closedIssues: 2,
        progressPercent: 67,
        htmlUrl: 'https://github.com/tsimhofer/thassi/milestones',
      },
    ],
    defaultDeployment: {
      targetType: 'ha_addon_supervisor',
      targetTypeLabel: 'HAOS Add-on (44ec3c40_thassi_host) + CLI Hot-Deploy (:8099)',
      hassHost: '192.168.188.92',
      targetPath: '/data/deployed_apps & /homeassistant/custom_components',
      branch: 'main',
      autoDeployOnGreenTests: true,
      rollbackOnFailure: true,
      publishHaTelemetrySensor: true,
      haEntityId: 'sensor.thassi_project_workflow_thassi_projects_monitor',
      lastDeployedAt: '2026-10-19T18:31:20Z',
      lastDeployStatus: 'LIVE',
    },
    testSummary: {
      framework: 'tsc + python unittest (16 Tests) + verify-phase5 (10 Checks)',
      passed: 26,
      total: 26,
      passRatePercent: 100,
      status: 'PASS',
      command: 'npm run typecheck && npm run test:python && npm run test:workflow',
      details: [
        'TypeScript Monorepo Typecheck (tsc --noEmit): 0 Errors',
        'Python 3.14 Unit-Tests (4 Module, 16 Testfälle): 16/16 PASS (0.002s)',
        'n8n Workflow & API Error-Handling Suite: 10/10 PASS',
      ],
    },
  },
  {
    id: 'thassi.3dprint',
    repoName: 'thassi.3dprint',
    name: 'thassi.3dprint — 3D Print Studio & BambuLab X1C',
    category: 'Thassi Modul-Repo',
    fallbackDescription:
      'KI-gestützte 3D-Objektgenerierung (Gemini/Antigravity), interaktiver Three.js CSG-Editor, STL/3MF/G-Code Slicer & direkte BambuLab X1C LAN-Steuerung (192.168.188.175).',
    language: 'TypeScript / Python',
    devStatus: 'LIVE_PRODUCTION',
    devStatusLabel: 'LIVE · Bambu X1C gekoppelt',
    linkedPresetId: 'bambu_filament_guard',
    defaultRequirements: [
      {
        id: 'req-3d-1',
        code: 'REQ-3D-01',
        title: 'Direkte BambuLab X1C LAN-Steuerung über MQTT 8883 & FTPS 990',
        description:
          'Verbindung zum Bambu X1C WHG (192.168.188.175, Seriennr. 00M09D441800253) für Live-Telemetrie, AMS-Filamente, Kamera-Stream und Druckbefehle.',
        acceptanceCriteria: 'TLS-Verbindung zu 192.168.188.175:8883 liefert Düsen-/Betttemperatur & Fortschritt.',
        priority: 'must',
        status: 'verified',
        milestoneTitle: 'v1.0 — Bambu X1C LAN & AI CAD Release',
        linkedIssueNumber: 1,
        assignedTo: 'tsimhofer',
      },
      {
        id: 'req-3d-2',
        code: 'REQ-3D-02',
        title: 'Parametrischer KI-CAD-Generator & CSG-Mesh-Engine (STL/3MF Export)',
        description:
          'Generierung mehrteiliger 3D-Baugruppen per natürlichsprachigem Prompt inklusive Booleans (Bohrungen/Aussparungen) und wasserdichtem STL/3MF-Export.',
        acceptanceCriteria: 'evaluateSceneMesh() erzeugt gültige Normalen & Volumina ohne TypeScript-Fehler.',
        priority: 'must',
        status: 'verified',
        milestoneTitle: 'v1.0 — Bambu X1C LAN & AI CAD Release',
        linkedIssueNumber: 2,
        assignedTo: 'tsimhofer',
      },
      {
        id: 'req-3d-3',
        code: 'REQ-3D-03',
        title: 'Automatische AMS-Luftfeuchtigkeits- & Leistungsüberwachung (bambu_filament_guard)',
        description:
          'Python-Modul überwacht Schreibtisch-Plug (.90) und Shelly H&T Luftfeuchtigkeit im Büro OG und warnt bei >55% rF.',
        acceptanceCriteria: '4/4 Python Unit-Tests in bambu_filament_guard bestanden.',
        priority: 'should',
        status: 'implemented',
        milestoneTitle: 'v1.1 — Multi-Plate Auto-Nesting & AMS Guard',
        linkedIssueNumber: 3,
        assignedTo: 'tsimhofer',
      },
      {
        id: 'req-3d-4',
        code: 'REQ-3D-04',
        title: '2D-Bin-Packing Auto-Nesting für Serienbauteile auf der 256×256mm Bauplatte',
        description:
          'Automatisches kollisionsfreies Anordnen mehrerer STL-Bauteile auf dem Bambu X1C Druckbett.',
        acceptanceCriteria: 'Auto-Place-Button verteilt Bauteile mit 4mm Mindestabstand innerhalb 256×256mm.',
        priority: 'could',
        status: 'in_progress',
        milestoneTitle: 'v1.1 — Multi-Plate Auto-Nesting & AMS Guard',
        linkedIssueNumber: 4,
        assignedTo: 'tsimhofer',
      },
    ],
    defaultIssues: [
      {
        id: 'iss-3d-4',
        number: 4,
        title: 'feat(slicer): Add 2D bin-packing auto-nesting for multi-part prints on 256x256mm bed',
        body: 'Allow arranging multiple generated CAD primitives or imported STL meshes automatically without bounding-box overlap.',
        state: 'open',
        labels: ['enhancement', '3d-printing', 'slicer'],
        author: 'tsimhofer',
        authorAvatarUrl: 'https://avatars.githubusercontent.com/u/48800676?v=4',
        assignee: 'tsimhofer',
        milestoneTitle: 'v1.1 — Multi-Plate Auto-Nesting & AMS Guard',
        createdAt: '2026-10-19T02:00:00Z',
        updatedAt: '2026-10-19T14:00:00Z',
        htmlUrl: 'https://github.com/tsimhofer/thassi.3dprint/issues',
        isPullRequest: false,
        source: 'local',
      },
      {
        id: 'iss-3d-1',
        number: 1,
        title: 'feat(bambu-lan): Configure Bambu X1C WHG (192.168.188.175) MQTT 8883 & FTPS 990',
        body: 'Direct local LAN integration with Bambu Lab X1C without cloud dependency.',
        state: 'closed',
        labels: ['bambulab', 'lan-api'],
        author: 'tsimhofer',
        authorAvatarUrl: 'https://avatars.githubusercontent.com/u/48800676?v=4',
        assignee: 'tsimhofer',
        milestoneTitle: 'v1.0 — Bambu X1C LAN & AI CAD Release',
        createdAt: '2026-10-18T22:00:00Z',
        updatedAt: '2026-10-19T01:08:00Z',
        htmlUrl: 'https://github.com/tsimhofer/thassi.3dprint',
        isPullRequest: false,
        source: 'local',
      },
    ],
    defaultMilestones: [
      {
        id: 'ms-3d-1',
        number: 1,
        title: 'v1.0 — Bambu X1C LAN & AI CAD Release',
        description: 'Erstes produktives Release mit KI-CAD-Editor, Slicer und Bambu X1C LAN-Steuerung.',
        state: 'closed',
        dueDate: '2026-10-19',
        openIssues: 0,
        closedIssues: 2,
        progressPercent: 100,
        htmlUrl: 'https://github.com/tsimhofer/thassi.3dprint',
      },
      {
        id: 'ms-3d-2',
        number: 2,
        title: 'v1.1 — Multi-Plate Auto-Nesting & AMS Guard',
        description: 'Erweiterung um Serienbauteil-Schachtelung und Python-Feuchtigkeitswächter.',
        state: 'open',
        dueDate: '2026-11-01',
        openIssues: 1,
        closedIssues: 1,
        progressPercent: 50,
        htmlUrl: 'https://github.com/tsimhofer/thassi.3dprint',
      },
    ],
    defaultDeployment: {
      targetType: 'thassi_app_hot_deploy',
      targetTypeLabel: 'Thassi App Hot-Deploy (:8099/apps/3d-print) + Python Custom Component',
      hassHost: '192.168.188.92',
      targetPath: '/data/deployed_apps/3d-print & /homeassistant/custom_components/bambu_filament_guard',
      branch: 'main',
      autoDeployOnGreenTests: true,
      rollbackOnFailure: true,
      publishHaTelemetrySensor: true,
      haEntityId: 'sensor.thassi_project_workflow_bambu_filament_guard',
      lastDeployedAt: '2026-10-19T17:36:50Z',
      lastDeployStatus: 'LIVE',
    },
    testSummary: {
      framework: 'python unittest (bambu_filament_guard) + tsc mesh-engine',
      passed: 8,
      total: 8,
      passRatePercent: 100,
      status: 'PASS',
      command: 'python -m unittest discover -s python_modules/bambu_filament_guard -p "test_*.py" -v',
      details: [
        'test_module_initialization (bambu_filament_guard): PASS',
        'test_sensor_state_calculation (bambu_filament_guard): PASS',
        'test_api_error_and_timeout_handling (bambu_filament_guard): PASS',
        'test_ha_entity_payload_contract (bambu_filament_guard): PASS',
        'Three.js CSG Mesh-Engine & Bambu TLS Typecheck: PASS',
      ],
    },
  },
  {
    id: 'thassi.finances',
    repoName: 'thassi.finances',
    name: 'thassi.finances — Personal Finance & Sparkasse Analytics',
    category: 'Thassi Modul-Repo',
    fallbackDescription:
      'Finanz- & Budget-Analyse mit Sparkasse George Quick-Import, Privacy-Blur-Vorschau, mehrstufigem Sunburst-Chart und Fixkosten-Tracking.',
    language: 'TypeScript',
    devStatus: 'LIVE_PRODUCTION',
    devStatusLabel: 'LIVE v1.1.0',
    linkedPresetId: 'shelly_energy_guard',
    defaultRequirements: [
      {
        id: 'req-fin-1',
        code: 'REQ-FIN-01',
        title: 'Sparkasse George CSV/JSON Importer mit Duplikat-Erkennung',
        description: 'Direkter Drag-&-Drop-Import von George-Kontoauszügen in lokale SQLite-Tabellen.',
        acceptanceCriteria: 'Importiert Buchungen fehlerfrei und kategorisiert automatisch.',
        priority: 'must',
        status: 'verified',
        milestoneTitle: 'v1.1.0 — Privacy Mode & Sunburst Analytics',
        linkedIssueNumber: 1,
        assignedTo: 'tsimhofer',
      },
      {
        id: 'req-fin-2',
        code: 'REQ-FIN-02',
        title: 'Interaktives Sunburst-Diagramm & Privacy-Blur-Schalter',
        description: 'Hierarchische Aufschlüsselung der Ausgabenkategorien plus 1-Klick-Betrags-Maskierung.',
        acceptanceCriteria: 'Sunburst-Segmente filtern die Buchungstabelle bei Klick.',
        priority: 'must',
        status: 'verified',
        milestoneTitle: 'v1.1.0 — Privacy Mode & Sunburst Analytics',
        linkedIssueNumber: 2,
        assignedTo: 'tsimhofer',
      },
      {
        id: 'req-fin-3',
        code: 'REQ-FIN-03',
        title: 'Stromkosten-Prognose aus Shelly Energy Guard Leistungsdaten',
        description: 'Automatische Umrechnung der gemessenen Shelly-Wattstunden in monatliche Euro-Abschläge.',
        acceptanceCriteria: 'Verknüpft sensor.thassi_project_workflow_shelly_energy_guard mit Tarif (ct/kWh).',
        priority: 'should',
        status: 'approved',
        milestoneTitle: 'v1.2.0 — Energy Cost Forecasting',
        linkedIssueNumber: 3,
        assignedTo: 'tsimhofer',
      },
    ],
    defaultIssues: [
      {
        id: 'iss-fin-3',
        number: 3,
        title: 'feat(energy-cost): Correlate Shelly live wattage sensor with monthly electricity budget',
        body: 'Use sensor.thassi_project_workflow_shelly_energy_guard to project monthly electricity cost in EUR.',
        state: 'open',
        labels: ['enhancement', 'finance', 'energy'],
        author: 'tsimhofer',
        authorAvatarUrl: 'https://avatars.githubusercontent.com/u/48800676?v=4',
        assignee: 'tsimhofer',
        milestoneTitle: 'v1.2.0 — Energy Cost Forecasting',
        createdAt: '2026-10-19T10:00:00Z',
        updatedAt: '2026-10-19T16:00:00Z',
        htmlUrl: 'https://github.com/tsimhofer/thassi',
        isPullRequest: false,
        source: 'local',
      },
    ],
    defaultMilestones: [
      {
        id: 'ms-fin-1',
        number: 1,
        title: 'v1.1.0 — Privacy Mode & Sunburst Analytics',
        description: 'George Quick-Import, Privacy-Vorschau und Sunburst-Chart.',
        state: 'closed',
        dueDate: '2026-10-19',
        openIssues: 0,
        closedIssues: 2,
        progressPercent: 100,
      },
      {
        id: 'ms-fin-2',
        number: 2,
        title: 'v1.2.0 — Energy Cost Forecasting',
        description: 'Kopplung der Shelly-Energiedaten mit der Finanz-Monatsvorschau.',
        state: 'open',
        dueDate: '2026-11-05',
        openIssues: 1,
        closedIssues: 0,
        progressPercent: 35,
      },
    ],
    defaultDeployment: {
      targetType: 'thassi_app_hot_deploy',
      targetTypeLabel: 'Thassi App (:8099/apps/finance-analytics) + HA Sidebar Add-on',
      hassHost: '192.168.188.92',
      targetPath: '/data/deployed_apps/finance-analytics',
      branch: 'main',
      autoDeployOnGreenTests: true,
      rollbackOnFailure: true,
      publishHaTelemetrySensor: true,
      haEntityId: 'sensor.thassi_project_workflow_shelly_energy_guard',
      lastDeployedAt: '2026-10-19T17:36:50Z',
      lastDeployStatus: 'LIVE',
    },
    testSummary: {
      framework: 'tsc + shelly_energy_guard unittest',
      passed: 6,
      total: 6,
      passRatePercent: 100,
      status: 'PASS',
      command: 'python -m unittest discover -s python_modules/shelly_energy_guard -p "test_*.py" -v',
      details: [
        'George CSV Importer & Category Classifier: PASS',
        'Sunburst Hierarchy Builder: PASS',
        'shelly_energy_guard Python Unit-Tests: 4/4 PASS',
      ],
    },
  },
  {
    id: 'taskassistant',
    repoName: 'taskassistant',
    name: 'taskassistant — Home Assistant Add-on Template',
    category: 'Home Assistant Add-on',
    fallbackDescription:
      'Home Assistant Add-on Template & CI/CD-Basis mit GitHub Actions Builder, Add-on Linter und Dependabot-Überwachung.',
    language: 'Dockerfile / GitHub Actions',
    devStatus: 'QA_TESTING',
    devStatusLabel: '4 offene Dependabot-PRs auf GitHub',
    linkedPresetId: 'thassi_projects_monitor',
    defaultRequirements: [
      {
        id: 'req-task-1',
        code: 'REQ-ADDON-01',
        title: 'GitHub Actions Add-on Linter & Builder auf aktuelle Versionen aktualisieren',
        description: 'Offene Dependabot Pull Requests (#6, #7, #9, #10) in tsimhofer/taskassistant prüfen und mergen.',
        acceptanceCriteria: 'Alle 4 offenen Dependabot-Issues/PRs sind gemerged und CI ist grün.',
        priority: 'must',
        status: 'in_progress',
        milestoneTitle: 'v1.1 — CI/CD & Builder Upgrade',
        linkedIssueNumber: 10,
        assignedTo: 'tsimhofer',
      },
      {
        id: 'req-task-2',
        code: 'REQ-ADDON-02',
        title: 'Kompatibilität mit dem generischen Thassi HA-Modul-Template',
        description: 'Abgleich der config.yaml und Dockerfile-Struktur mit templates/ha-module-template.',
        acceptanceCriteria: 'Schema-Validierung gegen module-template.schema.json erfolgreich.',
        priority: 'should',
        status: 'verified',
        milestoneTitle: 'v1.1 — CI/CD & Builder Upgrade',
        linkedIssueNumber: 7,
        assignedTo: 'tsimhofer',
      },
    ],
    defaultIssues: [],
    defaultMilestones: [
      {
        id: 'ms-task-1',
        number: 1,
        title: 'v1.1 — CI/CD & Builder Upgrade',
        description: 'Aktualisierung von docker/login-action, actions/checkout, home-assistant/builder und addon-linter.',
        state: 'open',
        dueDate: '2026-10-25',
        openIssues: 4,
        closedIssues: 6,
        progressPercent: 60,
        htmlUrl: 'https://github.com/tsimhofer/taskassistant/issues',
      },
    ],
    defaultDeployment: {
      targetType: 'ha_addon_supervisor',
      targetTypeLabel: 'Home Assistant Add-on Store Builder',
      hassHost: '192.168.188.92',
      targetPath: '/addons/taskassistant',
      branch: 'main',
      autoDeployOnGreenTests: false,
      rollbackOnFailure: true,
      publishHaTelemetrySensor: true,
      haEntityId: 'sensor.thassi_project_workflow_thassi_projects_monitor',
      lastDeployedAt: '2026-10-19T17:52:00Z',
      lastDeployStatus: 'STANDBY',
    },
    testSummary: {
      framework: 'frenck/action-addon-linter + Template Validator',
      passed: 4,
      total: 4,
      passRatePercent: 100,
      status: 'PASS',
      command: 'npm run test:workflow',
      details: [
        'Add-on config.yaml Schema Check: PASS',
        'Multi-Arch Dockerfile Verification: PASS',
      ],
    },
  },
  {
    id: 'Aurelia',
    repoName: 'Aurelia',
    name: 'Aurelia — Personal Library Music Quiz',
    category: 'Companion App',
    fallbackDescription:
      'Interaktives Musik-Quiz auf Basis der eigenen Musikbibliothek (inspiriert von Songless) mit progressiven Audio-Snippets.',
    language: 'TypeScript',
    devStatus: 'ACTIVE_DEV',
    devStatusLabel: 'In aktiver Entwicklung',
    linkedPresetId: 'vorzimmer_lighting_optimizer',
    defaultRequirements: [
      {
        id: 'req-aur-1',
        code: 'REQ-AUR-01',
        title: 'Progressive Audio-Snippet-Wiedergabe (0.1s → 0.5s → 2s → 5s → 15s)',
        description: 'Stufenweises Freischalten längerer Audio-Ausschnitte bei jedem Fehlversuch.',
        acceptanceCriteria: 'WebAudio-Timer stoppt exakt nach der jeweiligen Stufendauer.',
        priority: 'must',
        status: 'verified',
        milestoneTitle: 'v1.0 — Core Music Quiz Engine',
        assignedTo: 'tsimhofer',
      },
      {
        id: 'req-aur-2',
        code: 'REQ-AUR-02',
        title: 'Music Assistant (d5369777_music_assistant) Playlist-Import aus Home Assistant',
        description: 'Automatisches Laden der lokalen Lieblingssongs aus dem Home Assistant Music Assistant Add-on.',
        acceptanceCriteria: 'Abruf der Track-Metadaten über die Home Assistant Media-Browser API.',
        priority: 'should',
        status: 'in_progress',
        milestoneTitle: 'v1.1 — Home Assistant Media Integration',
        assignedTo: 'tsimhofer',
      },
    ],
    defaultIssues: [
      {
        id: 'iss-aur-1',
        number: 1,
        title: 'feat(ha-media): Connect Aurelia song pool to Home Assistant Music Assistant library',
        body: 'Allow playing quiz snippets directly from tracks indexed by Music Assistant on 192.168.188.92.',
        state: 'open',
        labels: ['enhancement', 'music-assistant'],
        author: 'tsimhofer',
        authorAvatarUrl: 'https://avatars.githubusercontent.com/u/48800676?v=4',
        assignee: 'tsimhofer',
        milestoneTitle: 'v1.1 — Home Assistant Media Integration',
        createdAt: '2026-10-19T03:20:00Z',
        updatedAt: '2026-10-19T03:20:00Z',
        htmlUrl: 'https://github.com/tsimhofer/Aurelia/issues',
        isPullRequest: false,
        source: 'local',
      },
    ],
    defaultMilestones: [
      {
        id: 'ms-aur-1',
        number: 1,
        title: 'v1.0 — Core Music Quiz Engine',
        description: 'Basis-Spielmechanik, Audio-Trimmer und Fuzzy-Suchfeld.',
        state: 'closed',
        dueDate: '2026-10-19',
        openIssues: 0,
        closedIssues: 3,
        progressPercent: 100,
      },
      {
        id: 'ms-aur-2',
        number: 2,
        title: 'v1.1 — Home Assistant Media Integration',
        description: 'Kopplung mit Music Assistant und Highscore-Sensor in Home Assistant.',
        state: 'open',
        dueDate: '2026-11-10',
        openIssues: 1,
        closedIssues: 1,
        progressPercent: 50,
      },
    ],
    defaultDeployment: {
      targetType: 'standalone_docker',
      targetTypeLabel: 'GitHub Repository & Web-App Build',
      hassHost: '192.168.188.92',
      targetPath: '/apps/aurelia',
      branch: 'main',
      autoDeployOnGreenTests: false,
      rollbackOnFailure: true,
      publishHaTelemetrySensor: false,
      haEntityId: 'sensor.thassi_project_workflow_vorzimmer_lighting_optimizer',
      lastDeployedAt: '2026-10-19T03:17:14Z',
      lastDeployStatus: 'LIVE',
    },
    testSummary: {
      framework: 'TypeScript Compiler & Quiz Logic Verify',
      passed: 5,
      total: 5,
      passRatePercent: 100,
      status: 'PASS',
      command: 'npm run typecheck',
      details: [
        'Audio Slice Duration State Machine: PASS',
        'Song Title Fuzzy Search Matcher: PASS',
      ],
    },
  },
  {
    id: 'austrian-meal-scout',
    repoName: 'austrian-meal-scout',
    name: 'austrian-meal-scout — Mahlzeit & Supermarkt-Scout',
    category: 'Companion App',
    fallbackDescription:
      'Mahlzeit Österreich — Kalender-Wochenplaner, Makro-Tracking und österreichischer Supermarkt-Angebots-Scout.',
    language: 'C# / TypeScript',
    devStatus: 'LIVE_PRODUCTION',
    devStatusLabel: 'LIVE in Thassi Meals',
    linkedPresetId: 'shelly_energy_guard',
    defaultRequirements: [
      {
        id: 'req-meal-1',
        code: 'REQ-MEAL-01',
        title: 'Wochenplan-Matrix mit Kalorien- & Makronährstoff-Berechnung',
        description: 'Planung von Frühstück, Mittag- und Abendessen mit automatischer Tages-Kcal-Summe.',
        acceptanceCriteria: 'Publiziert sensor.thassi_meal_planner_today_kcal an Home Assistant.',
        priority: 'must',
        status: 'verified',
        milestoneTitle: 'v1.0 — Meal Planner & Shopping Sync',
        assignedTo: 'tsimhofer',
      },
      {
        id: 'req-meal-2',
        code: 'REQ-MEAL-02',
        title: 'Automatischer Aktionspreis-Abgleich für österreichische Supermärkte',
        description: 'Abgleich der Einkaufslisten-Zutaten mit aktuellen Aktionen (Billa, Spar, Hofer).',
        acceptanceCriteria: 'Markiert rabattierte Zutaten direkt in der generierten Einkaufsliste.',
        priority: 'should',
        status: 'in_progress',
        milestoneTitle: 'v1.1 — Supermarket Price Scout',
        assignedTo: 'tsimhofer',
      },
    ],
    defaultIssues: [
      {
        id: 'iss-meal-1',
        number: 1,
        title: 'feat(deals): Highlight weekly supermarket discounts on generated shopping list items',
        body: 'Match ingredient keywords against Austrian supermarket weekly flyers.',
        state: 'open',
        labels: ['enhancement', 'meal-planner'],
        author: 'tsimhofer',
        authorAvatarUrl: 'https://avatars.githubusercontent.com/u/48800676?v=4',
        assignee: 'tsimhofer',
        milestoneTitle: 'v1.1 — Supermarket Price Scout',
        createdAt: '2026-10-15T12:45:00Z',
        updatedAt: '2026-10-19T12:00:00Z',
        htmlUrl: 'https://github.com/tsimhofer/austrian-meal-scout/issues',
        isPullRequest: false,
        source: 'local',
      },
    ],
    defaultMilestones: [
      {
        id: 'ms-meal-1',
        number: 1,
        title: 'v1.0 — Meal Planner & Shopping Sync',
        description: 'Wochenplaner und Einkaufslisten-Generator in Thassi Horizon.',
        state: 'closed',
        dueDate: '2026-10-18',
        openIssues: 0,
        closedIssues: 2,
        progressPercent: 100,
      },
      {
        id: 'ms-meal-2',
        number: 2,
        title: 'v1.1 — Supermarket Price Scout',
        description: 'Integration der österreichischen Aktionspreise.',
        state: 'open',
        dueDate: '2026-11-15',
        openIssues: 1,
        closedIssues: 1,
        progressPercent: 50,
      },
    ],
    defaultDeployment: {
      targetType: 'thassi_app_hot_deploy',
      targetTypeLabel: 'Thassi App (:8099/apps/meal-planner)',
      hassHost: '192.168.188.92',
      targetPath: '/data/deployed_apps/meal-planner',
      branch: 'main',
      autoDeployOnGreenTests: true,
      rollbackOnFailure: true,
      publishHaTelemetrySensor: true,
      haEntityId: 'sensor.thassi_meal_planner_today_kcal',
      lastDeployedAt: '2026-10-19T17:36:50Z',
      lastDeployStatus: 'LIVE',
    },
    testSummary: {
      framework: 'TypeScript Build & Macro Aggregator Verify',
      passed: 6,
      total: 6,
      passRatePercent: 100,
      status: 'PASS',
      command: 'npm run build',
      details: [
        'Weekly Macro & Kcal Calculator: PASS',
        'Shopping List Ingredient Deduplicator: PASS',
      ],
    },
  },
];

export interface StoredProjectCustomizations {
  goals?: Record<string, ProjectGoalItem[]>;
  requirements?: Record<string, ProjectRequirementItem[]>;
  issues?: Record<string, ProjectGitHubIssueItem[]>;
  milestones?: Record<string, ProjectMilestoneItem[]>;
  deployments?: Record<string, ProjectDeploymentConfig>;
}

export async function buildMonitoredProjectsPortfolio(
  github: GitHubIntegrationSnapshot,
  custom: StoredProjectCustomizations,
  latestRuns: WorkflowExecutionRecord[],
  githubToken?: string,
  forceRefresh = false
): Promise<MonitoredThassiProject[]> {
  const repoMap = new Map(github.repositories.map((r) => [r.name.toLowerCase(), r]));
  const latestCommit = github.recentCommits[0];

  // Fetch live GitHub details in parallel for catalog repos that exist on GitHub
  const detailsByRepo = new Map<string, LiveRepoGitHubDetails>();
  await Promise.all(
    DEFAULT_PROJECT_CATALOG.map(async (entry) => {
      const liveRepo = repoMap.get(entry.repoName.toLowerCase());
      if (liveRepo) {
        const det = await fetchRepoGitHubDetails(
          github.owner || 'tsimhofer',
          liveRepo.name,
          githubToken,
          forceRefresh
        );
        detailsByRepo.set(entry.id, det);
      }
    })
  );

  const results: MonitoredThassiProject[] = [];

  for (const entry of DEFAULT_PROJECT_CATALOG) {
    const liveRepo = repoMap.get(entry.repoName.toLowerCase());
    const ghDetails = detailsByRepo.get(entry.id);

    const requirements =
      custom.requirements?.[entry.id] && custom.requirements[entry.id].length > 0
        ? custom.requirements[entry.id]
        : entry.defaultRequirements;

    // Combine live GitHub issues with any locally stored issues for this project
    const localIssues = custom.issues?.[entry.id] || [];
    const baseIssues =
      ghDetails && ghDetails.issues.length > 0 ? ghDetails.issues : entry.defaultIssues;
    const mergedIssuesMap = new Map<number, ProjectGitHubIssueItem>();
    for (const iss of baseIssues) mergedIssuesMap.set(iss.number, iss);
    for (const loc of localIssues) mergedIssuesMap.set(loc.number, loc);
    const issues = Array.from(mergedIssuesMap.values()).sort((a, b) => b.number - a.number);

    // Combine milestones
    const baseMilestones =
      ghDetails && ghDetails.milestones.length > 0
        ? ghDetails.milestones
        : entry.defaultMilestones;
    const savedMs = custom.milestones?.[entry.id] || [];
    const milestones = savedMs.length > 0 ? savedMs : baseMilestones;

    const collaborators =
      ghDetails && ghDetails.collaborators.length > 0
        ? ghDetails.collaborators
        : [DEFAULT_OWNER_COLLABORATOR];

    const deploymentConfig: ProjectDeploymentConfig = {
      ...entry.defaultDeployment,
      ...(custom.deployments?.[entry.id] || {}),
    };

    const reqDone = requirements.filter(
      (r) => r.status === 'implemented' || r.status === 'verified'
    ).length;
    const reqInProg = requirements.filter(
      (r) => r.status === 'in_progress' || r.status === 'approved'
    ).length;
    const openIssuesCount = issues.filter((i) => i.state === 'open').length;
    const closedIssuesCount = issues.filter((i) => i.state === 'closed').length;

    const matchingRun = latestRuns.find(
      (r) => r.moduleSlug === entry.linkedPresetId || r.moduleSlug === entry.id
    );

    const testSummary = matchingRun
      ? {
          framework: entry.testSummary.framework,
          passed: matchingRun.unitTestReport.passedTests,
          total: matchingRun.unitTestReport.totalTests,
          passRatePercent:
            matchingRun.unitTestReport.totalTests > 0
              ? Math.round(
                  (matchingRun.unitTestReport.passedTests /
                    matchingRun.unitTestReport.totalTests) *
                    100
                )
              : 100,
          status: (matchingRun.unitTestReport.passed ? 'PASS' : 'FAIL') as 'PASS' | 'WARN' | 'FAIL',
          command: matchingRun.unitTestReport.command || entry.testSummary.command,
          details: entry.testSummary.details,
        }
      : entry.testSummary;

    const reqRatio =
      (reqDone + reqInProg * 0.45) / Math.max(1, requirements.length);
    const issueRatio =
      closedIssuesCount + openIssuesCount > 0
        ? closedIssuesCount / (closedIssuesCount + openIssuesCount)
        : 1;
    const testRatio = testSummary.passRatePercent / 100;
    const progressPercent = Math.min(
      100,
      Math.max(15, Math.round(reqRatio * 50 + issueRatio * 25 + testRatio * 25))
    );

    const signalColor: SignalColor =
      testSummary.status === 'FAIL'
        ? 'red'
        : openIssuesCount > 3
          ? 'amber'
          : entry.devStatus === 'LIVE_PRODUCTION'
            ? 'green'
            : 'cyan';

    const branch = deploymentConfig.branch || liveRepo?.defaultBranch || 'main';
    const lastCommitSha =
      entry.repoName === 'thassi' && latestCommit
        ? latestCommit.shortSha
        : matchingRun?.gitReport?.commitSha || 'ec9456e';
    const lastCommitMessage =
      entry.repoName === 'thassi' && latestCommit
        ? latestCommit.message
        : liveRepo?.description || entry.fallbackDescription;
    const updatedAt = liveRepo?.pushedAt || liveRepo?.updatedAt || new Date().toISOString();

    const goals: ProjectGoalItem[] = requirements.map((r) => ({
      id: r.id,
      title: `${r.code}: ${r.title}`,
      category: 'Feature',
      status:
        r.status === 'verified' || r.status === 'implemented'
          ? 'done'
          : r.status === 'in_progress' || r.status === 'approved'
            ? 'in_progress'
            : 'todo',
      priority: r.priority === 'must' ? 'high' : r.priority === 'should' ? 'medium' : 'low',
    }));

    const n8nPipelineNodes = buildProjectN8nNodes({
      repoName: entry.repoName,
      branch,
      commitSha: lastCommitSha,
      reqDone,
      reqTotal: requirements.length,
      openIssuesCount,
      closedIssuesCount,
      milestonesCount: milestones.length,
      testPassed: testSummary.passed,
      testTotal: testSummary.total,
      testFramework: testSummary.framework,
      collaboratorsCount: collaborators.length,
      deploymentConfig,
      signalColor,
      updatedAt,
    });

    results.push({
      id: entry.id,
      name: entry.name,
      repoFullName: liveRepo?.fullName || `tsimhofer/${entry.repoName}`,
      category: entry.category,
      description: liveRepo?.description || entry.fallbackDescription,
      htmlUrl: liveRepo?.htmlUrl || `https://github.com/tsimhofer/${entry.repoName}`,
      language: liveRepo?.language || entry.language,
      branch,
      lastCommitSha,
      lastCommitMessage,
      updatedAt,
      sizeKb: liveRepo?.sizeKb || 250,
      devStatus: entry.devStatus,
      devStatusLabel: entry.devStatusLabel,
      signalColor,
      statusFlag: `${entry.devStatus} · ${progressPercent}%`,
      progressPercent,
      goals,
      requirements,
      issues,
      milestones,
      collaborators,
      deploymentConfig,
      testSummary,
      n8nPipelineNodes,
      linkedPresetId: entry.linkedPresetId,
    });
  }

  return results;
}
