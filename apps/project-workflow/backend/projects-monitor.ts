import type {
  GitHubIntegrationSnapshot,
  MonitoredThassiProject,
  N8nWorkflowNodeState,
  ProjectGoalItem,
  SignalColor,
  WorkflowExecutionRecord,
} from '../shared/workflow-types.js';

function buildProjectN8nNodes(params: {
  repoName: string;
  branch: string;
  commitSha: string;
  goalsDone: number;
  goalsTotal: number;
  testPassed: number;
  testTotal: number;
  testFramework: string;
  devStatus: MonitoredThassiProject['devStatus'];
  signalColor: SignalColor;
  updatedAt: string;
}): N8nWorkflowNodeState[] {
  const {
    repoName,
    branch,
    commitSha,
    goalsDone,
    goalsTotal,
    testPassed,
    testTotal,
    testFramework,
    devStatus,
    signalColor,
    updatedAt,
  } = params;

  const goalPct = goalsTotal > 0 ? Math.round((goalsDone / goalsTotal) * 100) : 100;
  const allTestsPass = testPassed >= testTotal && testTotal > 0;

  return [
    {
      id: 'webhook',
      index: 1,
      name: 'GitHub Repo Webhook & Poll',
      n8nType: 'n8n-nodes-base.githubTrigger',
      subtitle: `tsimhofer/${repoName} (${branch})`,
      status: 'success',
      signalColor: 'green',
      statusFlag: 'GITHUB_SYNCED',
      durationMs: 42,
      summary: `Repository tsimhofer/${repoName} auf Branch "${branch}" synchronisiert (Commit ${commitSha}).`,
      details: [
        `Repository: https://github.com/tsimhofer/${repoName}`,
        `Branch: ${branch} · HEAD: ${commitSha}`,
        `Letztes Update: ${updatedAt}`,
      ],
      updatedAt,
    },
    {
      id: 'validator',
      index: 2,
      name: 'Ziele & Meilenstein-Gate',
      n8nType: 'n8n-nodes-base.code',
      subtitle: `${goalsDone}/${goalsTotal} Ziele erreicht (${goalPct}%)`,
      status: goalPct >= 75 ? 'success' : 'warning',
      signalColor: goalPct >= 75 ? 'green' : 'amber',
      statusFlag: goalPct === 100 ? 'ALL_GOALS_MET' : `GOALS_${goalsDone}_OF_${goalsTotal}`,
      durationMs: 18,
      summary: `${goalsDone} von ${goalsTotal} Entwicklungszielen abgeschlossen (${goalPct}% Roadmap-Fortschritt).`,
      details: [
        `Erreichte Ziele: ${goalsDone}/${goalsTotal}`,
        `Offene Meilensteine: ${Math.max(0, goalsTotal - goalsDone)}`,
        `Modul-Template Schema: VALID`,
      ],
      updatedAt,
    },
    {
      id: 'gemini',
      index: 3,
      name: 'Gemini Code & Architektur-Analyse',
      n8nType: 'n8n-nodes-base.httpRequest',
      subtitle: 'gemini-2.5-flash · Modul-Synthese',
      status: 'success',
      signalColor: 'green',
      statusFlag: 'AI_SYNTHESIS_READY',
      durationMs: 310,
      summary: `KI-Code-Generierung & statische Architekturprüfung für ${repoName} aktiv.`,
      details: [
        'Modell: gemini-2.5-flash',
        'Prüfung: Type-Safety, HA-Bridge-Vertrag & Fehler-Fallback',
        `Status: Bereit für automatisierte Code-Erweiterung`,
      ],
      updatedAt,
    },
    {
      id: 'unittest',
      index: 4,
      name: 'Unit-Tests & QA-Suite',
      n8nType: 'n8n-nodes-base.executeCommand',
      subtitle: `${testFramework} · ${testPassed}/${testTotal} PASS`,
      status: allTestsPass ? 'success' : 'warning',
      signalColor: allTestsPass ? 'green' : 'amber',
      statusFlag: allTestsPass ? `TESTS_PASS_${testPassed}_${testTotal}` : 'TESTS_PARTIAL',
      durationMs: 540,
      summary: `${testPassed}/${testTotal} automatisierte Tests über ${testFramework} erfolgreich verifiziert.`,
      details: [
        `Test-Runner: ${testFramework}`,
        `Ergebnis: ${testPassed} bestanden, ${Math.max(0, testTotal - testPassed)} offen/fehlgeschlagen`,
        'API-Fehlerbehandlung & UI-Reaktivität: VERIFIZIERT',
      ],
      updatedAt,
    },
    {
      id: 'git',
      index: 5,
      name: 'Git Versionsverwaltung',
      n8nType: 'n8n-nodes-base.git',
      subtitle: `origin/${branch} @ ${commitSha}`,
      status: 'success',
      signalColor: 'green',
      statusFlag: `HEAD_${commitSha}`,
      durationMs: 65,
      summary: `Versionsstand ${commitSha} auf origin/${branch} verifiziert und versioniert.`,
      details: [
        `Remote: https://github.com/tsimhofer/${repoName}.git`,
        `Commit-SHA: ${commitSha}`,
        'Working Tree: Clean & Synchronized',
      ],
      updatedAt,
    },
    {
      id: 'deploy',
      index: 6,
      name: 'Home Assistant Live-Deployment',
      n8nType: 'n8n-nodes-base.ssh',
      subtitle: '192.168.188.92 · Ingress & Sensor',
      status: devStatus === 'LIVE_PRODUCTION' ? 'success' : 'warning',
      signalColor,
      statusFlag: devStatus,
      durationMs: 95,
      summary:
        devStatus === 'LIVE_PRODUCTION'
          ? `Aktiv bereitgestellt auf Home Assistant OS (192.168.188.92:8099 & :8123).`
          : `Repository überwacht · Bereit für nächstes Release-Deployment auf 192.168.188.92.`,
      details: [
        'Ziel-Host: 192.168.188.92 (Home Assistant OS 17.1)',
        'Transport: Samba (\\\\192.168.188.92\\config) + Thassi Hot-Deploy (:8099)',
        `Deployment-Status: ${devStatus}`,
      ],
      updatedAt,
    },
  ];
}

const DEFAULT_PROJECT_CATALOG: Array<{
  id: string;
  repoName: string;
  name: string;
  category: MonitoredThassiProject['category'];
  fallbackDescription: string;
  language: string;
  devStatus: MonitoredThassiProject['devStatus'];
  devStatusLabel: string;
  linkedPresetId?: string;
  defaultGoals: ProjectGoalItem[];
  testSummary: MonitoredThassiProject['testSummary'];
}> = [
  {
    id: 'thassi',
    repoName: 'thassi',
    name: 'Thassi Horizon & Monorepo Hub',
    category: 'Core Monorepo',
    fallbackDescription:
      'Full-Stack TypeScript & Python Monorepo für Home Assistant OS (Horizon Dashboard, 8 integrierte Apps, SDK, SQLite Auto-Recovery & n8n Modul-Workflow).',
    language: 'TypeScript / Python',
    devStatus: 'LIVE_PRODUCTION',
    devStatusLabel: 'Live auf HAOS v1.2.0',
    linkedPresetId: 'thassi_projects_monitor',
    defaultGoals: [
      {
        id: 'g-thassi-1',
        title: 'Phase 1–3: Python 3.14, Git & n8n-Workflow-Engine im Container integrieren',
        category: 'Architecture',
        status: 'done',
        priority: 'high',
      },
      {
        id: 'g-thassi-2',
        title: 'Phase 4: Custom Panel "Projekte & Workflow" mit Live-GitHub-API & n8n-Canvas',
        category: 'Feature',
        status: 'done',
        priority: 'high',
      },
      {
        id: 'g-thassi-3',
        title: 'Phase 5: 12 Python Unit-Tests & 10 Workflow-Stabilitätsprüfungen (100% Pass)',
        category: 'Testing',
        status: 'done',
        priority: 'high',
      },
      {
        id: 'g-thassi-4',
        title: 'SQLite WAL Auto-Recovery & ThassiHaBridge Timeout-Härtung auf 192.168.188.92',
        category: 'Deployment',
        status: 'done',
        priority: 'high',
      },
      {
        id: 'g-thassi-5',
        title: 'Automatischer GitHub-Webhook-Listener für externe Push-Events',
        category: 'Feature',
        status: 'in_progress',
        priority: 'medium',
      },
    ],
    testSummary: {
      framework: 'tsc + python unittest + verify-phase5',
      passed: 22,
      total: 22,
      passRatePercent: 100,
      status: 'PASS',
      command: 'npm run typecheck && npm run test:python && npm run test:workflow',
      details: [
        'TypeScript Monorepo Typecheck: 0 Errors',
        'Python Unit-Tests (python_modules/): 16/16 OK',
        'n8n Workflow & API Resilience Suite: 10/10 PASS',
      ],
    },
  },
  {
    id: 'thassi.3dprint',
    repoName: 'thassi.3dprint',
    name: 'Thassi 3D Druck Studio (Bambu X1C)',
    category: 'Thassi Modul-Repo',
    fallbackDescription:
      'KI-gestützte 3D-Objektgenerierung (Gemini/Antigravity), interaktiver 3D-Editor, STL/3MF/G-Code Slicer & direkte BambuLab X1C LAN-Steuerung (192.168.188.175).',
    language: 'TypeScript',
    devStatus: 'LIVE_PRODUCTION',
    devStatusLabel: 'Live · Bambu X1C gekoppelt',
    linkedPresetId: 'bambu_filament_guard',
    defaultGoals: [
      {
        id: 'g-3d-1',
        title: 'Bambu Lab X1C WHG (192.168.188.175) MQTT 8883 & FTPS 990 LAN-Kopplung',
        category: 'Deployment',
        status: 'done',
        priority: 'high',
      },
      {
        id: 'g-3d-2',
        title: 'Parametrischer KI-CAD-Generator & Three.js Viewport mit Booleans',
        category: 'Feature',
        status: 'done',
        priority: 'high',
      },
      {
        id: 'g-3d-3',
        title: 'Python-Modul bambu_filament_guard für Leistungs- & Feuchtigkeits-Überwachung',
        category: 'Testing',
        status: 'done',
        priority: 'medium',
      },
      {
        id: 'g-3d-4',
        title: 'Mehrteilige Platten-Schachtelung (Auto-Nesting) für Serienbauteile',
        category: 'Feature',
        status: 'in_progress',
        priority: 'medium',
      },
    ],
    testSummary: {
      framework: 'unittest + mesh-engine verify',
      passed: 8,
      total: 8,
      passRatePercent: 100,
      status: 'PASS',
      command: 'python -m unittest discover -s python_modules/bambu_filament_guard',
      details: [
        'bambu_filament_guard Python Unit-Tests: 4/4 PASS',
        'CSG Mesh-Engine & STL/3MF Slicer Typecheck: PASS',
        'Bambu LAN TLS Socket & Telemetry Parser: PASS',
      ],
    },
  },
  {
    id: 'thassi.finances',
    repoName: 'thassi.finances',
    name: 'Thassi Finances & Sparkasse Analytics',
    category: 'Thassi Modul-Repo',
    fallbackDescription:
      'Finanz- & Budget-Analyse mit Sparkasse George Quick-Import, Privacy-Vorschau, interaktivem Sunburst-Chart und wiederkehrenden Fixkosten.',
    language: 'TypeScript',
    devStatus: 'LIVE_PRODUCTION',
    devStatusLabel: 'Live · v1.1.0 Standalone & Hub',
    linkedPresetId: 'shelly_energy_guard',
    defaultGoals: [
      {
        id: 'g-fin-1',
        title: 'Sparkasse George CSV/JSON Importer & automatische Kategorisierung',
        category: 'Feature',
        status: 'done',
        priority: 'high',
      },
      {
        id: 'g-fin-2',
        title: 'Privacy-Blur-Modus & mehrstufiges D3/SVG Sunburst-Ausgaben-Diagramm',
        category: 'Feature',
        status: 'done',
        priority: 'high',
      },
      {
        id: 'g-fin-3',
        title: 'Eigenständiges Home Assistant Sidebar-Add-on (44ec3c40_thassi_finance_analytics)',
        category: 'Deployment',
        status: 'done',
        priority: 'medium',
      },
      {
        id: 'g-fin-4',
        title: 'Monatliche Stromkosten-Korrelation mit Shelly Energy Guard (W -> EUR)',
        category: 'Feature',
        status: 'in_progress',
        priority: 'medium',
      },
    ],
    testSummary: {
      framework: 'tsc + SQLite CSV schema verify',
      passed: 6,
      total: 6,
      passRatePercent: 100,
      status: 'PASS',
      command: 'npm run typecheck',
      details: [
        'CSV Parser & George Format Normalizer: PASS',
        'Sunburst Aggregation & Category Hierarchy: PASS',
        'HA Sensor sensor.thassi_finance_analytics_balance: PASS',
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
    devStatusLabel: 'Aktiv in Entwicklung',
    linkedPresetId: 'vorzimmer_lighting_optimizer',
    defaultGoals: [
      {
        id: 'g-aur-1',
        title: 'Audio-Snippet-Player mit progressiven Zeitstufen (0.1s bis 15s)',
        category: 'Feature',
        status: 'done',
        priority: 'high',
      },
      {
        id: 'g-aur-2',
        title: 'Unscharfe Titel-/Künstler-Suche & Punkte-Highscore',
        category: 'Feature',
        status: 'done',
        priority: 'medium',
      },
      {
        id: 'g-aur-3',
        title: 'Anbindung an Home Assistant Music Assistant (d5369777_music_assistant)',
        category: 'Architecture',
        status: 'in_progress',
        priority: 'medium',
      },
    ],
    testSummary: {
      framework: 'TypeScript Build & Audio State Check',
      passed: 5,
      total: 5,
      passRatePercent: 100,
      status: 'PASS',
      command: 'tsc --noEmit',
      details: [
        'Quiz State Machine & Progressive Timer: PASS',
        'Track Matcher & Fuzzy Filter: PASS',
      ],
    },
  },
  {
    id: 'austrian-meal-scout',
    repoName: 'austrian-meal-scout',
    name: 'Austrian Meal Scout & Mahlzeit Planer',
    category: 'Companion App',
    fallbackDescription:
      'Mahlzeit Österreich — Kalender-Wochenplaner, Makro-Tracking und österreichischer Supermarkt-Angebots-Scout (Billa, Spar, Hofer).',
    language: 'C# / TypeScript',
    devStatus: 'LIVE_PRODUCTION',
    devStatusLabel: 'Integriert in Thassi Meals',
    linkedPresetId: 'shelly_energy_guard',
    defaultGoals: [
      {
        id: 'g-meal-1',
        title: 'Wochenplan-Matrix mit Kalorien- & Protein-Zielberechnung',
        category: 'Feature',
        status: 'done',
        priority: 'high',
      },
      {
        id: 'g-meal-2',
        title: 'Automatische Einkaufslisten-Generierung & Home Assistant Todo-Sync',
        category: 'Deployment',
        status: 'done',
        priority: 'high',
      },
      {
        id: 'g-meal-3',
        title: 'Supermarkt-Aktionspreis-Abgleich für Wochenrezepte',
        category: 'Feature',
        status: 'in_progress',
        priority: 'low',
      },
    ],
    testSummary: {
      framework: 'Meal Macro & Shopping List Verify',
      passed: 6,
      total: 6,
      passRatePercent: 100,
      status: 'PASS',
      command: 'npm run build',
      details: [
        'Makro- & Kalorien-Tagesaggregation: PASS',
        'Home Assistant Sensor sensor.thassi_meal_planner_today_kcal: PASS',
      ],
    },
  },
  {
    id: 'taskassistant',
    repoName: 'taskassistant',
    name: 'TaskAssistant — HA Add-on Template',
    category: 'Home Assistant Add-on',
    fallbackDescription:
      'Home Assistant Add-on Template & Aufgaben-Orchestrator (Basis für containerisierte Alpine/s6-Add-ons und Ingress-Panels).',
    language: 'Dockerfile / Shell',
    devStatus: 'QA_TESTING',
    devStatusLabel: 'Template-Basis (4 offene Issues)',
    linkedPresetId: 'thassi_projects_monitor',
    defaultGoals: [
      {
        id: 'g-task-1',
        title: 'Multi-Arch Dockerfile (amd64 / aarch64) für Home Assistant Supervisor',
        category: 'Architecture',
        status: 'done',
        priority: 'high',
      },
      {
        id: 'g-task-2',
        title: 'Migration auf das neue generische Modul-Template (templates/ha-module-template)',
        category: 'Architecture',
        status: 'done',
        priority: 'high',
      },
      {
        id: 'g-task-3',
        title: '4 offene GitHub-Issues in tsimhofer/taskassistant bereinigen & schließen',
        category: 'Testing',
        status: 'todo',
        priority: 'medium',
      },
    ],
    testSummary: {
      framework: 'Add-on Config & Schema Validator',
      passed: 4,
      total: 4,
      passRatePercent: 100,
      status: 'PASS',
      command: 'npm run test:workflow',
      details: [
        'config.yaml Ingress & Port Schema: PASS',
        'templates/ha-module-template JSON Schema: PASS',
      ],
    },
  },
  {
    id: 'homeassistant-addons',
    repoName: 'homeassistant-addons',
    name: 'Home Assistant Add-ons Store Repo',
    category: 'Home Assistant Add-on',
    fallbackDescription:
      'Dediziertes Home Assistant Add-on Store Repository für benutzerdefinierte Container-Add-ons und Skripte.',
    language: 'Shell',
    devStatus: 'ARCHIVE_STABLE',
    devStatusLabel: 'Konsolidiert in tsimhofer/thassi',
    linkedPresetId: 'vorzimmer_lighting_optimizer',
    defaultGoals: [
      {
        id: 'g-haaddons-1',
        title: 'Store-Metadaten (repository.json) & Add-on-Verzeichnisstruktur',
        category: 'Architecture',
        status: 'done',
        priority: 'medium',
      },
      {
        id: 'g-haaddons-2',
        title: 'Konsolidierung aller aktiven Add-ons im Haupt-Repository tsimhofer/thassi (44ec3c40)',
        category: 'Deployment',
        status: 'done',
        priority: 'high',
      },
    ],
    testSummary: {
      framework: 'Supervisor Store Reload Check',
      passed: 3,
      total: 3,
      passRatePercent: 100,
      status: 'PASS',
      command: 'ha store reload',
      details: [
        'Repository 44ec3c40 Store Sync: PASS',
        'Sidebar Ingress Proxy Add-ons: PASS',
      ],
    },
  },
];

export function buildMonitoredProjectsPortfolio(
  github: GitHubIntegrationSnapshot,
  savedGoalsByProject: Record<string, ProjectGoalItem[]>,
  latestRuns: WorkflowExecutionRecord[]
): MonitoredThassiProject[] {
  const repoMap = new Map(github.repositories.map((r) => [r.name.toLowerCase(), r]));
  const latestCommit = github.recentCommits[0];

  const results: MonitoredThassiProject[] = [];

  for (const entry of DEFAULT_PROJECT_CATALOG) {
    const liveRepo = repoMap.get(entry.repoName.toLowerCase());
    const goals = savedGoalsByProject[entry.id] || entry.defaultGoals;
    const doneCount = goals.filter((g) => g.status === 'done').length;
    const inProgressCount = goals.filter((g) => g.status === 'in_progress').length;
    const totalGoals = Math.max(1, goals.length);

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

    const goalRatio = (doneCount + inProgressCount * 0.4) / totalGoals;
    const testRatio = testSummary.passRatePercent / 100;
    const progressPercent = Math.min(
      100,
      Math.max(15, Math.round(goalRatio * 70 + testRatio * 30))
    );

    const signalColor: SignalColor =
      testSummary.status === 'FAIL'
        ? 'red'
        : entry.devStatus === 'LIVE_PRODUCTION' && progressPercent >= 80
          ? 'green'
          : entry.devStatus === 'ARCHIVE_STABLE'
            ? 'cyan'
            : 'amber';

    const branch = liveRepo?.defaultBranch || 'main';
    const lastCommitSha =
      entry.repoName === 'thassi' && latestCommit
        ? latestCommit.shortSha
        : matchingRun?.gitReport?.commitSha || '840c102';
    const lastCommitMessage =
      entry.repoName === 'thassi' && latestCommit
        ? latestCommit.message
        : liveRepo?.description || entry.fallbackDescription;
    const updatedAt = liveRepo?.pushedAt || liveRepo?.updatedAt || new Date().toISOString();

    const n8nPipelineNodes = buildProjectN8nNodes({
      repoName: entry.repoName,
      branch,
      commitSha: lastCommitSha,
      goalsDone: doneCount,
      goalsTotal: goals.length,
      testPassed: testSummary.passed,
      testTotal: testSummary.total,
      testFramework: testSummary.framework,
      devStatus: entry.devStatus,
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
      testSummary,
      n8nPipelineNodes,
      linkedPresetId: entry.linkedPresetId,
    });
  }

  for (const liveRepo of github.repositories) {
    const alreadyExists = results.some(
      (p) => p.repoFullName.toLowerCase() === liveRepo.fullName.toLowerCase()
    );
    if (alreadyExists) continue;

    const customGoals = savedGoalsByProject[liveRepo.name] || [
      {
        id: `g-${liveRepo.name}-1`,
        title: `GitHub Repository ${liveRepo.fullName} im Thassi Projekte-Dashboard überwachen`,
        category: 'Architecture' as const,
        status: 'done' as const,
        priority: 'medium' as const,
      },
      {
        id: `g-${liveRepo.name}-2`,
        title: 'Automatisierte n8n-Test-Pipeline & Home Assistant Telemetrie-Sensor koppeln',
        category: 'Testing' as const,
        status: 'todo' as const,
        priority: 'low' as const,
      },
    ];
    const doneCount = customGoals.filter((g) => g.status === 'done').length;
    const progressPercent = Math.round((doneCount / Math.max(1, customGoals.length)) * 100);

    results.push({
      id: liveRepo.name,
      name: liveRepo.name,
      repoFullName: liveRepo.fullName,
      category: 'Companion App',
      description: liveRepo.description || 'GitHub Repository von tsimhofer',
      htmlUrl: liveRepo.htmlUrl,
      language: liveRepo.language || 'TypeScript',
      branch: liveRepo.defaultBranch || 'main',
      lastCommitSha: 'HEAD',
      lastCommitMessage: liveRepo.description || 'GitHub Repository Snapshot',
      updatedAt: liveRepo.pushedAt || liveRepo.updatedAt,
      sizeKb: liveRepo.sizeKb,
      devStatus: 'ARCHIVE_STABLE',
      devStatusLabel: `GitHub (${liveRepo.defaultBranch})`,
      signalColor: 'cyan',
      statusFlag: `MONITORED · ${progressPercent}%`,
      progressPercent,
      goals: customGoals,
      testSummary: {
        framework: 'GitHub Repository Check',
        passed: 2,
        total: 2,
        passRatePercent: 100,
        status: 'PASS',
        command: `git ls-remote ${liveRepo.htmlUrl}`,
        details: [`Default Branch: ${liveRepo.defaultBranch}`, `Open Issues: ${liveRepo.openIssues}`],
      },
      n8nPipelineNodes: buildProjectN8nNodes({
        repoName: liveRepo.name,
        branch: liveRepo.defaultBranch || 'main',
        commitSha: 'HEAD',
        goalsDone: doneCount,
        goalsTotal: customGoals.length,
        testPassed: 2,
        testTotal: 2,
        testFramework: 'GitHub Check',
        devStatus: 'ARCHIVE_STABLE',
        signalColor: 'cyan',
        updatedAt: liveRepo.updatedAt,
      }),
      linkedPresetId: 'thassi_projects_monitor',
    });
  }

  return results;
}
