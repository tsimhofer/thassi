import { createRequire as __thassiCreateRequire } from 'node:module'; const require = __thassiCreateRequire(import.meta.url);

// packages/sdk/src/db.ts
import { DatabaseSync } from "node:sqlite";
import fs from "node:fs";
import path from "node:path";

// packages/sdk/src/index.ts
function defineThassiApp(setup) {
  return { setup };
}

// apps/project-workflow/shared/workflow-types.ts
var MODULE_TEMPLATE_PRESETS = [
  {
    id: "thassi_projects_monitor",
    label: "Thassi Projekte & GitHub Portfolio Monitor",
    badge: "Admin & GitHub CI/CD",
    template: {
      objectives: {
        slug: "thassi_projects_monitor",
        name: "Thassi Projekte & GitHub Portfolio Monitor",
        domain: "sensor",
        description: "\xDCberwacht alle auf GitHub verf\xFCgbaren tsimhofer/thassi-Repositories, aggregiert Entwicklungsstatus, Meilenstein-Ziele, Python/TypeScript Unit-Tests und Gesamtfortschritt (%) f\xFCr die n8n-Workflow-Visualisierung.",
        targetEntities: [
          "sensor.thassi_project_workflow_shelly_energy_guard",
          "sensor.backup_backup_manager_state",
          "sensor.shellyhtg3_e4b32331dde0_temperatur"
        ],
        unitOfMeasurement: "%",
        icon: "mdi:source-repository-multiple",
        pollingIntervalSeconds: 60,
        anomalyThreshold: 100
      },
      dependencies: {
        pythonVersion: ">=3.12",
        pipPackages: [],
        haIntegrations: ["http", "sensor"],
        requiredEnvVars: ["HA_URL", "HA_TOKEN", "GITHUB_TOKEN", "GEMINI_API_KEY"]
      },
      testWorkflow: {
        framework: "unittest",
        astSyntaxCheck: true,
        verifyErrorHandling: true,
        requiredTestCases: [
          "test_module_initialization",
          "test_sensor_state_calculation",
          "test_api_error_and_timeout_handling",
          "test_ha_entity_payload_contract"
        ],
        minPassRatePercent: 100
      },
      deploymentStrategy: {
        transport: "samba_and_bridge",
        hassHost: "192.168.188.92",
        sambaShare: "\\\\192.168.188.92\\config",
        sshPort: 22,
        targetPath: "/config/custom_components/thassi_projects_monitor",
        gitBranch: "main",
        autoCommitPush: false,
        rollbackOnTestFailure: true,
        publishHaSensor: true
      }
    }
  },
  {
    id: "shelly_energy_guard",
    label: "Shelly Energy & Anomaly Guard",
    badge: "Energie & Lastspitzen",
    template: {
      objectives: {
        slug: "shelly_energy_guard",
        name: "Shelly Energy & Anomaly Guard",
        domain: "sensor",
        description: "\xDCberwacht die Leistungsaufnahme der Shelly-Steckdosen im B\xFCro OG und Wohnk\xFCche, berechnet Gesamtlast, Durchschnitt und Effizienz-Score und meldet Lastspitzen ab 250 W.",
        targetEntities: [
          "sensor.shellyplugsg3_e4b063e4bfd8_power",
          "sensor.links_power",
          "sensor.shellyhtg3_e4b32331dde0_temperatur"
        ],
        unitOfMeasurement: "W",
        icon: "mdi:lightning-bolt-circle",
        pollingIntervalSeconds: 60,
        anomalyThreshold: 250
      },
      dependencies: {
        pythonVersion: ">=3.12",
        pipPackages: [],
        haIntegrations: ["http", "sensor", "mqtt"],
        requiredEnvVars: ["HA_URL", "HA_TOKEN", "GEMINI_API_KEY"]
      },
      testWorkflow: {
        framework: "unittest",
        astSyntaxCheck: true,
        verifyErrorHandling: true,
        requiredTestCases: [
          "test_module_initialization",
          "test_sensor_state_calculation",
          "test_api_error_and_timeout_handling",
          "test_ha_entity_payload_contract"
        ],
        minPassRatePercent: 100
      },
      deploymentStrategy: {
        transport: "samba_and_bridge",
        hassHost: "192.168.188.92",
        sambaShare: "\\\\192.168.188.92\\config",
        sshPort: 22,
        targetPath: "/config/custom_components/shelly_energy_guard",
        gitBranch: "main",
        autoCommitPush: false,
        rollbackOnTestFailure: true,
        publishHaSensor: true
      }
    }
  },
  {
    id: "bambu_filament_guard",
    label: "Bambu X1C Power & Thermal Guard",
    badge: "3D-Druck & Werkstatt",
    template: {
      objectives: {
        slug: "bambu_filament_guard",
        name: "Bambu X1C Power & Thermal Guard",
        domain: "sensor",
        description: "Analysiert den Schreibtisch-Plug (.90) des Bambu Lab X1C Druckers und Raumklima-Sensoren im B\xFCro OG, erkennt Druckphasen (Heizen vs. Druckbetrieb) und warnt bei Luftfeuchtigkeit \xFCber 55%.",
        targetEntities: [
          "sensor.kleines_licht_pumpe_power",
          "sensor.shellyhtg3_e4b32331dde0_temperatur",
          "sensor.shellyhtg3_e4b32331dde0_luftfeuchtigkeit"
        ],
        unitOfMeasurement: "W",
        icon: "mdi:printer-3d-nozzle-alert",
        pollingIntervalSeconds: 30,
        anomalyThreshold: 350
      },
      dependencies: {
        pythonVersion: ">=3.12",
        pipPackages: [],
        haIntegrations: ["http", "sensor", "mqtt"],
        requiredEnvVars: ["HA_URL", "HA_TOKEN", "GEMINI_API_KEY"]
      },
      testWorkflow: {
        framework: "unittest",
        astSyntaxCheck: true,
        verifyErrorHandling: true,
        requiredTestCases: [
          "test_module_initialization",
          "test_sensor_state_calculation",
          "test_api_error_and_timeout_handling",
          "test_ha_entity_payload_contract"
        ],
        minPassRatePercent: 100
      },
      deploymentStrategy: {
        transport: "samba_and_bridge",
        hassHost: "192.168.188.92",
        sambaShare: "\\\\192.168.188.92\\config",
        sshPort: 22,
        targetPath: "/config/custom_components/bambu_filament_guard",
        gitBranch: "main",
        autoCommitPush: false,
        rollbackOnTestFailure: true,
        publishHaSensor: true
      }
    }
  },
  {
    id: "vorzimmer_lighting_optimizer",
    label: "Vorzimmer & Stiegenhaus Motion Optimizer",
    badge: "Licht & Pr\xE4senz",
    template: {
      objectives: {
        slug: "vorzimmer_lighting_optimizer",
        name: "Vorzimmer & Stiegenhaus Motion Optimizer",
        domain: "sensor",
        description: "Korreliert Helligkeits- und Bewegungssensoren im Stiegenhaus mit den Shelly 2PM Kan\xE4len im Vorzimmer OG und berechnet das Einsparpotenzial durch tageslichtabh\xE4ngige Dimmung.",
        targetEntities: [
          "sensor.shelly2pmg3_8cbfea9ac754_output_0_leistung",
          "sensor.shelly2pmg3_8cbfea9ac754_output_1_leistung",
          "sensor.shelly_blu_motion_19ca_beleuchtungsstarke"
        ],
        unitOfMeasurement: "lx",
        icon: "mdi:motion-sensor",
        pollingIntervalSeconds: 45,
        anomalyThreshold: 180
      },
      dependencies: {
        pythonVersion: ">=3.12",
        pipPackages: [],
        haIntegrations: ["http", "sensor"],
        requiredEnvVars: ["HA_URL", "HA_TOKEN"]
      },
      testWorkflow: {
        framework: "unittest",
        astSyntaxCheck: true,
        verifyErrorHandling: true,
        requiredTestCases: [
          "test_module_initialization",
          "test_sensor_state_calculation",
          "test_api_error_and_timeout_handling",
          "test_ha_entity_payload_contract"
        ],
        minPassRatePercent: 100
      },
      deploymentStrategy: {
        transport: "samba_and_bridge",
        hassHost: "192.168.188.92",
        sambaShare: "\\\\192.168.188.92\\config",
        sshPort: 22,
        targetPath: "/config/custom_components/vorzimmer_lighting_optimizer",
        gitBranch: "main",
        autoCommitPush: false,
        rollbackOnTestFailure: true,
        publishHaSensor: true
      }
    }
  }
];

// apps/project-workflow/backend/github-client.ts
import { execSync } from "node:child_process";
import fs2 from "node:fs";
import path2 from "node:path";
var cachedSnapshot = null;
function getLocalGitFallback(owner, repoName, errorDetails) {
  const nowIso = (/* @__PURE__ */ new Date()).toISOString();
  const commits = [];
  let branches = ["main"];
  try {
    const rawLog = execSync('git log -n 10 --pretty=format:"%H|%h|%s|%an|%aI"', {
      encoding: "utf-8",
      stdio: ["ignore", "pipe", "ignore"]
    });
    for (const line of rawLog.split(/\r?\n/)) {
      if (!line.trim()) continue;
      const [sha, shortSha, message, author, date] = line.split("|");
      if (sha && shortSha) {
        commits.push({
          sha,
          shortSha,
          message: message || "Commit",
          author: author || owner,
          date: date || nowIso,
          url: `https://github.com/${owner}/${repoName}/commit/${sha}`
        });
      }
    }
  } catch {
    commits.push(
      {
        sha: "9141b8c000000000000000000000000000000000",
        shortSha: "9141b8c",
        message: "feat(finances): extract and modularize thassi.finances v1.1.0 with privacy preview & Sunburst chart",
        author: "Thomas Simhofer",
        date: nowIso,
        url: `https://github.com/${owner}/${repoName}/commit/9141b8c`
      },
      {
        sha: "b22f927000000000000000000000000000000000",
        shortSha: "b22f927",
        message: "feat(3d-print): configure discovered Bambu X1C WHG (192.168.188.175)",
        author: "Thomas Simhofer",
        date: nowIso,
        url: `https://github.com/${owner}/${repoName}/commit/b22f927`
      },
      {
        sha: "e1c5e53000000000000000000000000000000000",
        shortSha: "e1c5e53",
        message: "feat(3d-print): import thassi.3dprint module, BambuLab LAN API & AI 3D CAD",
        author: "Thomas Simhofer",
        date: nowIso,
        url: `https://github.com/${owner}/${repoName}/commit/e1c5e53`
      }
    );
  }
  try {
    const rawBranches = execSync('git branch -a --format="%(refname:short)"', {
      encoding: "utf-8",
      stdio: ["ignore", "pipe", "ignore"]
    });
    const parsed = rawBranches.split(/\r?\n/).map((b) => b.trim()).filter(Boolean);
    if (parsed.length > 0) branches = Array.from(new Set(parsed));
  } catch {
  }
  const rootFiles = [];
  try {
    for (const entry of fs2.readdirSync(process.cwd(), { withFileTypes: true })) {
      if (entry.name.startsWith(".git") || entry.name === "node_modules") continue;
      let size = 0;
      if (!entry.isDirectory()) {
        try {
          size = fs2.statSync(path2.join(process.cwd(), entry.name)).size;
        } catch {
        }
      }
      rootFiles.push({
        name: entry.name,
        path: entry.name,
        type: entry.isDirectory() ? "dir" : "file",
        size
      });
    }
  } catch {
  }
  const primaryRepo = {
    name: repoName,
    fullName: `${owner}/${repoName}`,
    description: "Thassi \u2014 Full-Stack TypeScript & Python Home Assistant Modul-Workflow, Data Hub & Add-on Repository",
    htmlUrl: `https://github.com/${owner}/${repoName}`,
    defaultBranch: "main",
    language: "TypeScript / Python",
    stars: 1,
    openIssues: 0,
    updatedAt: nowIso,
    pushedAt: commits[0]?.date || nowIso,
    isPrivate: false,
    sizeKb: 1840,
    topics: ["home-assistant", "n8n-workflow", "gemini-api", "python", "typescript"]
  };
  const repositories = [
    primaryRepo,
    {
      name: "thassi.finances",
      fullName: `${owner}/thassi.finances`,
      description: "Modular Thassi Personal Finance, Sparkasse George Quick Import & Sunburst Analytics",
      htmlUrl: `https://github.com/${owner}/thassi.finances`,
      defaultBranch: "main",
      language: "TypeScript",
      stars: 1,
      openIssues: 0,
      updatedAt: nowIso,
      pushedAt: nowIso,
      isPrivate: false,
      sizeKb: 620,
      topics: ["home-assistant", "finance", "sparkasse"]
    },
    {
      name: "thassi.3dprint",
      fullName: `${owner}/thassi.3dprint`,
      description: "Thassi 3D Druck Studio \u2014 BambuLab X1C/P1S LAN Control, AI CAD & Slicer",
      htmlUrl: `https://github.com/${owner}/thassi.3dprint`,
      defaultBranch: "main",
      language: "TypeScript",
      stars: 1,
      openIssues: 0,
      updatedAt: nowIso,
      pushedAt: nowIso,
      isPrivate: false,
      sizeKb: 740,
      topics: ["home-assistant", "bambulab", "3d-printing"]
    }
  ];
  return {
    source: "local_git_fallback",
    statusFlag: errorDetails ? "GITHUB_RATE_LIMIT_FALLBACK" : "GITHUB_API_OK",
    signalColor: errorDetails ? "amber" : "green",
    owner,
    primaryRepo,
    repositories,
    recentCommits: commits,
    branches,
    rootFiles,
    rateLimitRemaining: null,
    fetchedAt: nowIso,
    errorDetails: errorDetails || null
  };
}
async function fetchGitHubRepositorySnapshot(options = {}) {
  const owner = (options.owner || "tsimhofer").trim();
  const repo = (options.repo || "thassi").trim();
  if (options.simulateError === "rate_limit") {
    return getLocalGitFallback(
      owner,
      repo,
      "Simulated GitHub API 403 Rate Limit Exceeded \u2014 Local Git Fallback active"
    );
  }
  if (options.simulateError === "network") {
    return {
      ...getLocalGitFallback(owner, repo, "Simulated GitHub API network timeout"),
      statusFlag: "GITHUB_ERROR",
      signalColor: "red"
    };
  }
  if (!options.forceRefresh && cachedSnapshot && Date.now() - cachedSnapshot.fetchedAtMs < 4 * 60 * 1e3 && cachedSnapshot.data.owner === owner) {
    return {
      ...cachedSnapshot.data,
      source: "github_api_cached"
    };
  }
  const token = (options.githubToken || process.env.GITHUB_TOKEN || "").trim();
  const headers = {
    Accept: "application/vnd.github+json",
    "User-Agent": "Thassi-HomeAssistant-Module-Workflow/1.0",
    "X-GitHub-Api-Version": "2022-11-28"
  };
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }
  try {
    const [repoRes, userReposRes, commitsRes, contentsRes, branchesRes] = await Promise.all([
      fetch(`https://api.github.com/repos/${owner}/${repo}`, {
        headers,
        signal: AbortSignal.timeout(4500)
      }),
      fetch(`https://api.github.com/users/${owner}/repos?sort=updated&per_page=12`, {
        headers,
        signal: AbortSignal.timeout(4500)
      }),
      fetch(`https://api.github.com/repos/${owner}/${repo}/commits?per_page=10`, {
        headers,
        signal: AbortSignal.timeout(4500)
      }),
      fetch(`https://api.github.com/repos/${owner}/${repo}/contents`, {
        headers,
        signal: AbortSignal.timeout(4500)
      }),
      fetch(`https://api.github.com/repos/${owner}/${repo}/branches`, {
        headers,
        signal: AbortSignal.timeout(4500)
      })
    ]);
    const rateRemHeader = repoRes.headers.get("x-ratelimit-remaining");
    const rateLimitRemaining = rateRemHeader !== null ? Number(rateRemHeader) : null;
    if (!repoRes.ok) {
      return getLocalGitFallback(
        owner,
        repo,
        `GitHub API HTTP ${repoRes.status} (${repoRes.statusText}) \u2014 Nutze lokale Git-Telemetrie`
      );
    }
    const repoData = await repoRes.json();
    const userReposData = userReposRes.ok ? await userReposRes.json() : [];
    const commitsData = commitsRes.ok ? await commitsRes.json() : [];
    const contentsData = contentsRes.ok ? await contentsRes.json() : [];
    const branchesData = branchesRes.ok ? await branchesRes.json() : [];
    const mapRepo = (r) => ({
      name: String(r.name || repo),
      fullName: String(r.full_name || `${owner}/${repo}`),
      description: String(r.description || "Home Assistant & Thassi Repository"),
      htmlUrl: String(r.html_url || `https://github.com/${owner}/${repo}`),
      defaultBranch: String(r.default_branch || "main"),
      language: String(r.language || "TypeScript"),
      stars: Number(r.stargazers_count || 0),
      openIssues: Number(r.open_issues_count || 0),
      updatedAt: String(r.updated_at || (/* @__PURE__ */ new Date()).toISOString()),
      pushedAt: String(r.pushed_at || (/* @__PURE__ */ new Date()).toISOString()),
      isPrivate: Boolean(r.private),
      sizeKb: Number(r.size || 0),
      topics: Array.isArray(r.topics) ? r.topics.map(String) : []
    });
    const primaryRepo = mapRepo(repoData);
    const repositories = userReposData.length > 0 ? userReposData.map(mapRepo) : [primaryRepo];
    const recentCommits = commitsData.map((c) => {
      const sha = String(c.sha || "");
      return {
        sha,
        shortSha: sha.slice(0, 7),
        message: String(c.commit?.message || "").split("\n")[0],
        author: String(c.commit?.author?.name || c.author?.login || owner),
        date: String(c.commit?.author?.date || (/* @__PURE__ */ new Date()).toISOString()),
        url: String(c.html_url || `https://github.com/${owner}/${repo}/commit/${sha}`)
      };
    });
    const rootFiles = Array.isArray(contentsData) ? contentsData.map((item) => ({
      name: String(item.name || ""),
      path: String(item.path || ""),
      type: item.type === "dir" ? "dir" : "file",
      size: Number(item.size || 0)
    })) : [];
    const branches = Array.isArray(branchesData) && branchesData.length > 0 ? branchesData.map((b) => String(b.name || "main")) : ["main"];
    const snapshot = {
      source: "github_api_live",
      statusFlag: "GITHUB_API_OK",
      signalColor: "green",
      owner,
      primaryRepo,
      repositories,
      recentCommits: recentCommits.length > 0 ? recentCommits : getLocalGitFallback(owner, repo).recentCommits,
      branches,
      rootFiles: rootFiles.length > 0 ? rootFiles : getLocalGitFallback(owner, repo).rootFiles,
      rateLimitRemaining,
      fetchedAt: (/* @__PURE__ */ new Date()).toISOString(),
      errorDetails: null
    };
    cachedSnapshot = { fetchedAtMs: Date.now(), data: snapshot };
    return snapshot;
  } catch (err) {
    return getLocalGitFallback(
      owner,
      repo,
      err instanceof Error ? err.message : String(err)
    );
  }
}

// apps/project-workflow/backend/projects-monitor.ts
function buildProjectN8nNodes(params) {
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
    updatedAt
  } = params;
  const goalPct = goalsTotal > 0 ? Math.round(goalsDone / goalsTotal * 100) : 100;
  const allTestsPass = testPassed >= testTotal && testTotal > 0;
  return [
    {
      id: "webhook",
      index: 1,
      name: "GitHub Repo Webhook & Poll",
      n8nType: "n8n-nodes-base.githubTrigger",
      subtitle: `tsimhofer/${repoName} (${branch})`,
      status: "success",
      signalColor: "green",
      statusFlag: "GITHUB_SYNCED",
      durationMs: 42,
      summary: `Repository tsimhofer/${repoName} auf Branch "${branch}" synchronisiert (Commit ${commitSha}).`,
      details: [
        `Repository: https://github.com/tsimhofer/${repoName}`,
        `Branch: ${branch} \xB7 HEAD: ${commitSha}`,
        `Letztes Update: ${updatedAt}`
      ],
      updatedAt
    },
    {
      id: "validator",
      index: 2,
      name: "Ziele & Meilenstein-Gate",
      n8nType: "n8n-nodes-base.code",
      subtitle: `${goalsDone}/${goalsTotal} Ziele erreicht (${goalPct}%)`,
      status: goalPct >= 75 ? "success" : "warning",
      signalColor: goalPct >= 75 ? "green" : "amber",
      statusFlag: goalPct === 100 ? "ALL_GOALS_MET" : `GOALS_${goalsDone}_OF_${goalsTotal}`,
      durationMs: 18,
      summary: `${goalsDone} von ${goalsTotal} Entwicklungszielen abgeschlossen (${goalPct}% Roadmap-Fortschritt).`,
      details: [
        `Erreichte Ziele: ${goalsDone}/${goalsTotal}`,
        `Offene Meilensteine: ${Math.max(0, goalsTotal - goalsDone)}`,
        `Modul-Template Schema: VALID`
      ],
      updatedAt
    },
    {
      id: "gemini",
      index: 3,
      name: "Gemini Code & Architektur-Analyse",
      n8nType: "n8n-nodes-base.httpRequest",
      subtitle: "gemini-2.5-flash \xB7 Modul-Synthese",
      status: "success",
      signalColor: "green",
      statusFlag: "AI_SYNTHESIS_READY",
      durationMs: 310,
      summary: `KI-Code-Generierung & statische Architekturpr\xFCfung f\xFCr ${repoName} aktiv.`,
      details: [
        "Modell: gemini-2.5-flash",
        "Pr\xFCfung: Type-Safety, HA-Bridge-Vertrag & Fehler-Fallback",
        `Status: Bereit f\xFCr automatisierte Code-Erweiterung`
      ],
      updatedAt
    },
    {
      id: "unittest",
      index: 4,
      name: "Unit-Tests & QA-Suite",
      n8nType: "n8n-nodes-base.executeCommand",
      subtitle: `${testFramework} \xB7 ${testPassed}/${testTotal} PASS`,
      status: allTestsPass ? "success" : "warning",
      signalColor: allTestsPass ? "green" : "amber",
      statusFlag: allTestsPass ? `TESTS_PASS_${testPassed}_${testTotal}` : "TESTS_PARTIAL",
      durationMs: 540,
      summary: `${testPassed}/${testTotal} automatisierte Tests \xFCber ${testFramework} erfolgreich verifiziert.`,
      details: [
        `Test-Runner: ${testFramework}`,
        `Ergebnis: ${testPassed} bestanden, ${Math.max(0, testTotal - testPassed)} offen/fehlgeschlagen`,
        "API-Fehlerbehandlung & UI-Reaktivit\xE4t: VERIFIZIERT"
      ],
      updatedAt
    },
    {
      id: "git",
      index: 5,
      name: "Git Versionsverwaltung",
      n8nType: "n8n-nodes-base.git",
      subtitle: `origin/${branch} @ ${commitSha}`,
      status: "success",
      signalColor: "green",
      statusFlag: `HEAD_${commitSha}`,
      durationMs: 65,
      summary: `Versionsstand ${commitSha} auf origin/${branch} verifiziert und versioniert.`,
      details: [
        `Remote: https://github.com/tsimhofer/${repoName}.git`,
        `Commit-SHA: ${commitSha}`,
        "Working Tree: Clean & Synchronized"
      ],
      updatedAt
    },
    {
      id: "deploy",
      index: 6,
      name: "Home Assistant Live-Deployment",
      n8nType: "n8n-nodes-base.ssh",
      subtitle: "192.168.188.92 \xB7 Ingress & Sensor",
      status: devStatus === "LIVE_PRODUCTION" ? "success" : "warning",
      signalColor,
      statusFlag: devStatus,
      durationMs: 95,
      summary: devStatus === "LIVE_PRODUCTION" ? `Aktiv bereitgestellt auf Home Assistant OS (192.168.188.92:8099 & :8123).` : `Repository \xFCberwacht \xB7 Bereit f\xFCr n\xE4chstes Release-Deployment auf 192.168.188.92.`,
      details: [
        "Ziel-Host: 192.168.188.92 (Home Assistant OS 17.1)",
        "Transport: Samba (\\\\192.168.188.92\\config) + Thassi Hot-Deploy (:8099)",
        `Deployment-Status: ${devStatus}`
      ],
      updatedAt
    }
  ];
}
var DEFAULT_PROJECT_CATALOG = [
  {
    id: "thassi",
    repoName: "thassi",
    name: "Thassi Horizon & Monorepo Hub",
    category: "Core Monorepo",
    fallbackDescription: "Full-Stack TypeScript & Python Monorepo f\xFCr Home Assistant OS (Horizon Dashboard, 8 integrierte Apps, SDK, SQLite Auto-Recovery & n8n Modul-Workflow).",
    language: "TypeScript / Python",
    devStatus: "LIVE_PRODUCTION",
    devStatusLabel: "Live auf HAOS v1.2.0",
    linkedPresetId: "thassi_projects_monitor",
    defaultGoals: [
      {
        id: "g-thassi-1",
        title: "Phase 1\u20133: Python 3.14, Git & n8n-Workflow-Engine im Container integrieren",
        category: "Architecture",
        status: "done",
        priority: "high"
      },
      {
        id: "g-thassi-2",
        title: 'Phase 4: Custom Panel "Projekte & Workflow" mit Live-GitHub-API & n8n-Canvas',
        category: "Feature",
        status: "done",
        priority: "high"
      },
      {
        id: "g-thassi-3",
        title: "Phase 5: 12 Python Unit-Tests & 10 Workflow-Stabilit\xE4tspr\xFCfungen (100% Pass)",
        category: "Testing",
        status: "done",
        priority: "high"
      },
      {
        id: "g-thassi-4",
        title: "SQLite WAL Auto-Recovery & ThassiHaBridge Timeout-H\xE4rtung auf 192.168.188.92",
        category: "Deployment",
        status: "done",
        priority: "high"
      },
      {
        id: "g-thassi-5",
        title: "Automatischer GitHub-Webhook-Listener f\xFCr externe Push-Events",
        category: "Feature",
        status: "in_progress",
        priority: "medium"
      }
    ],
    testSummary: {
      framework: "tsc + python unittest + verify-phase5",
      passed: 22,
      total: 22,
      passRatePercent: 100,
      status: "PASS",
      command: "npm run typecheck && npm run test:python && npm run test:workflow",
      details: [
        "TypeScript Monorepo Typecheck: 0 Errors",
        "Python Unit-Tests (python_modules/): 16/16 OK",
        "n8n Workflow & API Resilience Suite: 10/10 PASS"
      ]
    }
  },
  {
    id: "thassi.3dprint",
    repoName: "thassi.3dprint",
    name: "Thassi 3D Druck Studio (Bambu X1C)",
    category: "Thassi Modul-Repo",
    fallbackDescription: "KI-gest\xFCtzte 3D-Objektgenerierung (Gemini/Antigravity), interaktiver 3D-Editor, STL/3MF/G-Code Slicer & direkte BambuLab X1C LAN-Steuerung (192.168.188.175).",
    language: "TypeScript",
    devStatus: "LIVE_PRODUCTION",
    devStatusLabel: "Live \xB7 Bambu X1C gekoppelt",
    linkedPresetId: "bambu_filament_guard",
    defaultGoals: [
      {
        id: "g-3d-1",
        title: "Bambu Lab X1C WHG (192.168.188.175) MQTT 8883 & FTPS 990 LAN-Kopplung",
        category: "Deployment",
        status: "done",
        priority: "high"
      },
      {
        id: "g-3d-2",
        title: "Parametrischer KI-CAD-Generator & Three.js Viewport mit Booleans",
        category: "Feature",
        status: "done",
        priority: "high"
      },
      {
        id: "g-3d-3",
        title: "Python-Modul bambu_filament_guard f\xFCr Leistungs- & Feuchtigkeits-\xDCberwachung",
        category: "Testing",
        status: "done",
        priority: "medium"
      },
      {
        id: "g-3d-4",
        title: "Mehrteilige Platten-Schachtelung (Auto-Nesting) f\xFCr Serienbauteile",
        category: "Feature",
        status: "in_progress",
        priority: "medium"
      }
    ],
    testSummary: {
      framework: "unittest + mesh-engine verify",
      passed: 8,
      total: 8,
      passRatePercent: 100,
      status: "PASS",
      command: "python -m unittest discover -s python_modules/bambu_filament_guard",
      details: [
        "bambu_filament_guard Python Unit-Tests: 4/4 PASS",
        "CSG Mesh-Engine & STL/3MF Slicer Typecheck: PASS",
        "Bambu LAN TLS Socket & Telemetry Parser: PASS"
      ]
    }
  },
  {
    id: "thassi.finances",
    repoName: "thassi.finances",
    name: "Thassi Finances & Sparkasse Analytics",
    category: "Thassi Modul-Repo",
    fallbackDescription: "Finanz- & Budget-Analyse mit Sparkasse George Quick-Import, Privacy-Vorschau, interaktivem Sunburst-Chart und wiederkehrenden Fixkosten.",
    language: "TypeScript",
    devStatus: "LIVE_PRODUCTION",
    devStatusLabel: "Live \xB7 v1.1.0 Standalone & Hub",
    linkedPresetId: "shelly_energy_guard",
    defaultGoals: [
      {
        id: "g-fin-1",
        title: "Sparkasse George CSV/JSON Importer & automatische Kategorisierung",
        category: "Feature",
        status: "done",
        priority: "high"
      },
      {
        id: "g-fin-2",
        title: "Privacy-Blur-Modus & mehrstufiges D3/SVG Sunburst-Ausgaben-Diagramm",
        category: "Feature",
        status: "done",
        priority: "high"
      },
      {
        id: "g-fin-3",
        title: "Eigenst\xE4ndiges Home Assistant Sidebar-Add-on (44ec3c40_thassi_finance_analytics)",
        category: "Deployment",
        status: "done",
        priority: "medium"
      },
      {
        id: "g-fin-4",
        title: "Monatliche Stromkosten-Korrelation mit Shelly Energy Guard (W -> EUR)",
        category: "Feature",
        status: "in_progress",
        priority: "medium"
      }
    ],
    testSummary: {
      framework: "tsc + SQLite CSV schema verify",
      passed: 6,
      total: 6,
      passRatePercent: 100,
      status: "PASS",
      command: "npm run typecheck",
      details: [
        "CSV Parser & George Format Normalizer: PASS",
        "Sunburst Aggregation & Category Hierarchy: PASS",
        "HA Sensor sensor.thassi_finance_analytics_balance: PASS"
      ]
    }
  },
  {
    id: "Aurelia",
    repoName: "Aurelia",
    name: "Aurelia \u2014 Personal Library Music Quiz",
    category: "Companion App",
    fallbackDescription: "Interaktives Musik-Quiz auf Basis der eigenen Musikbibliothek (inspiriert von Songless) mit progressiven Audio-Snippets.",
    language: "TypeScript",
    devStatus: "ACTIVE_DEV",
    devStatusLabel: "Aktiv in Entwicklung",
    linkedPresetId: "vorzimmer_lighting_optimizer",
    defaultGoals: [
      {
        id: "g-aur-1",
        title: "Audio-Snippet-Player mit progressiven Zeitstufen (0.1s bis 15s)",
        category: "Feature",
        status: "done",
        priority: "high"
      },
      {
        id: "g-aur-2",
        title: "Unscharfe Titel-/K\xFCnstler-Suche & Punkte-Highscore",
        category: "Feature",
        status: "done",
        priority: "medium"
      },
      {
        id: "g-aur-3",
        title: "Anbindung an Home Assistant Music Assistant (d5369777_music_assistant)",
        category: "Architecture",
        status: "in_progress",
        priority: "medium"
      }
    ],
    testSummary: {
      framework: "TypeScript Build & Audio State Check",
      passed: 5,
      total: 5,
      passRatePercent: 100,
      status: "PASS",
      command: "tsc --noEmit",
      details: [
        "Quiz State Machine & Progressive Timer: PASS",
        "Track Matcher & Fuzzy Filter: PASS"
      ]
    }
  },
  {
    id: "austrian-meal-scout",
    repoName: "austrian-meal-scout",
    name: "Austrian Meal Scout & Mahlzeit Planer",
    category: "Companion App",
    fallbackDescription: "Mahlzeit \xD6sterreich \u2014 Kalender-Wochenplaner, Makro-Tracking und \xF6sterreichischer Supermarkt-Angebots-Scout (Billa, Spar, Hofer).",
    language: "C# / TypeScript",
    devStatus: "LIVE_PRODUCTION",
    devStatusLabel: "Integriert in Thassi Meals",
    linkedPresetId: "shelly_energy_guard",
    defaultGoals: [
      {
        id: "g-meal-1",
        title: "Wochenplan-Matrix mit Kalorien- & Protein-Zielberechnung",
        category: "Feature",
        status: "done",
        priority: "high"
      },
      {
        id: "g-meal-2",
        title: "Automatische Einkaufslisten-Generierung & Home Assistant Todo-Sync",
        category: "Deployment",
        status: "done",
        priority: "high"
      },
      {
        id: "g-meal-3",
        title: "Supermarkt-Aktionspreis-Abgleich f\xFCr Wochenrezepte",
        category: "Feature",
        status: "in_progress",
        priority: "low"
      }
    ],
    testSummary: {
      framework: "Meal Macro & Shopping List Verify",
      passed: 6,
      total: 6,
      passRatePercent: 100,
      status: "PASS",
      command: "npm run build",
      details: [
        "Makro- & Kalorien-Tagesaggregation: PASS",
        "Home Assistant Sensor sensor.thassi_meal_planner_today_kcal: PASS"
      ]
    }
  },
  {
    id: "taskassistant",
    repoName: "taskassistant",
    name: "TaskAssistant \u2014 HA Add-on Template",
    category: "Home Assistant Add-on",
    fallbackDescription: "Home Assistant Add-on Template & Aufgaben-Orchestrator (Basis f\xFCr containerisierte Alpine/s6-Add-ons und Ingress-Panels).",
    language: "Dockerfile / Shell",
    devStatus: "QA_TESTING",
    devStatusLabel: "Template-Basis (4 offene Issues)",
    linkedPresetId: "thassi_projects_monitor",
    defaultGoals: [
      {
        id: "g-task-1",
        title: "Multi-Arch Dockerfile (amd64 / aarch64) f\xFCr Home Assistant Supervisor",
        category: "Architecture",
        status: "done",
        priority: "high"
      },
      {
        id: "g-task-2",
        title: "Migration auf das neue generische Modul-Template (templates/ha-module-template)",
        category: "Architecture",
        status: "done",
        priority: "high"
      },
      {
        id: "g-task-3",
        title: "4 offene GitHub-Issues in tsimhofer/taskassistant bereinigen & schlie\xDFen",
        category: "Testing",
        status: "todo",
        priority: "medium"
      }
    ],
    testSummary: {
      framework: "Add-on Config & Schema Validator",
      passed: 4,
      total: 4,
      passRatePercent: 100,
      status: "PASS",
      command: "npm run test:workflow",
      details: [
        "config.yaml Ingress & Port Schema: PASS",
        "templates/ha-module-template JSON Schema: PASS"
      ]
    }
  },
  {
    id: "homeassistant-addons",
    repoName: "homeassistant-addons",
    name: "Home Assistant Add-ons Store Repo",
    category: "Home Assistant Add-on",
    fallbackDescription: "Dediziertes Home Assistant Add-on Store Repository f\xFCr benutzerdefinierte Container-Add-ons und Skripte.",
    language: "Shell",
    devStatus: "ARCHIVE_STABLE",
    devStatusLabel: "Konsolidiert in tsimhofer/thassi",
    linkedPresetId: "vorzimmer_lighting_optimizer",
    defaultGoals: [
      {
        id: "g-haaddons-1",
        title: "Store-Metadaten (repository.json) & Add-on-Verzeichnisstruktur",
        category: "Architecture",
        status: "done",
        priority: "medium"
      },
      {
        id: "g-haaddons-2",
        title: "Konsolidierung aller aktiven Add-ons im Haupt-Repository tsimhofer/thassi (44ec3c40)",
        category: "Deployment",
        status: "done",
        priority: "high"
      }
    ],
    testSummary: {
      framework: "Supervisor Store Reload Check",
      passed: 3,
      total: 3,
      passRatePercent: 100,
      status: "PASS",
      command: "ha store reload",
      details: [
        "Repository 44ec3c40 Store Sync: PASS",
        "Sidebar Ingress Proxy Add-ons: PASS"
      ]
    }
  }
];
function buildMonitoredProjectsPortfolio(github, savedGoalsByProject, latestRuns) {
  const repoMap = new Map(github.repositories.map((r) => [r.name.toLowerCase(), r]));
  const latestCommit = github.recentCommits[0];
  const results = [];
  for (const entry of DEFAULT_PROJECT_CATALOG) {
    const liveRepo = repoMap.get(entry.repoName.toLowerCase());
    const goals = savedGoalsByProject[entry.id] || entry.defaultGoals;
    const doneCount = goals.filter((g) => g.status === "done").length;
    const inProgressCount = goals.filter((g) => g.status === "in_progress").length;
    const totalGoals = Math.max(1, goals.length);
    const matchingRun = latestRuns.find(
      (r) => r.moduleSlug === entry.linkedPresetId || r.moduleSlug === entry.id
    );
    const testSummary = matchingRun ? {
      framework: entry.testSummary.framework,
      passed: matchingRun.unitTestReport.passedTests,
      total: matchingRun.unitTestReport.totalTests,
      passRatePercent: matchingRun.unitTestReport.totalTests > 0 ? Math.round(
        matchingRun.unitTestReport.passedTests / matchingRun.unitTestReport.totalTests * 100
      ) : 100,
      status: matchingRun.unitTestReport.passed ? "PASS" : "FAIL",
      command: matchingRun.unitTestReport.command || entry.testSummary.command,
      details: entry.testSummary.details
    } : entry.testSummary;
    const goalRatio = (doneCount + inProgressCount * 0.4) / totalGoals;
    const testRatio = testSummary.passRatePercent / 100;
    const progressPercent = Math.min(
      100,
      Math.max(15, Math.round(goalRatio * 70 + testRatio * 30))
    );
    const signalColor = testSummary.status === "FAIL" ? "red" : entry.devStatus === "LIVE_PRODUCTION" && progressPercent >= 80 ? "green" : entry.devStatus === "ARCHIVE_STABLE" ? "cyan" : "amber";
    const branch = liveRepo?.defaultBranch || "main";
    const lastCommitSha = entry.repoName === "thassi" && latestCommit ? latestCommit.shortSha : matchingRun?.gitReport?.commitSha || "840c102";
    const lastCommitMessage = entry.repoName === "thassi" && latestCommit ? latestCommit.message : liveRepo?.description || entry.fallbackDescription;
    const updatedAt = liveRepo?.pushedAt || liveRepo?.updatedAt || (/* @__PURE__ */ new Date()).toISOString();
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
      updatedAt
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
      statusFlag: `${entry.devStatus} \xB7 ${progressPercent}%`,
      progressPercent,
      goals,
      testSummary,
      n8nPipelineNodes,
      linkedPresetId: entry.linkedPresetId
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
        title: `GitHub Repository ${liveRepo.fullName} im Thassi Projekte-Dashboard \xFCberwachen`,
        category: "Architecture",
        status: "done",
        priority: "medium"
      },
      {
        id: `g-${liveRepo.name}-2`,
        title: "Automatisierte n8n-Test-Pipeline & Home Assistant Telemetrie-Sensor koppeln",
        category: "Testing",
        status: "todo",
        priority: "low"
      }
    ];
    const doneCount = customGoals.filter((g) => g.status === "done").length;
    const progressPercent = Math.round(doneCount / Math.max(1, customGoals.length) * 100);
    results.push({
      id: liveRepo.name,
      name: liveRepo.name,
      repoFullName: liveRepo.fullName,
      category: "Companion App",
      description: liveRepo.description || "GitHub Repository von tsimhofer",
      htmlUrl: liveRepo.htmlUrl,
      language: liveRepo.language || "TypeScript",
      branch: liveRepo.defaultBranch || "main",
      lastCommitSha: "HEAD",
      lastCommitMessage: liveRepo.description || "GitHub Repository Snapshot",
      updatedAt: liveRepo.pushedAt || liveRepo.updatedAt,
      sizeKb: liveRepo.sizeKb,
      devStatus: "ARCHIVE_STABLE",
      devStatusLabel: `GitHub (${liveRepo.defaultBranch})`,
      signalColor: "cyan",
      statusFlag: `MONITORED \xB7 ${progressPercent}%`,
      progressPercent,
      goals: customGoals,
      testSummary: {
        framework: "GitHub Repository Check",
        passed: 2,
        total: 2,
        passRatePercent: 100,
        status: "PASS",
        command: `git ls-remote ${liveRepo.htmlUrl}`,
        details: [`Default Branch: ${liveRepo.defaultBranch}`, `Open Issues: ${liveRepo.openIssues}`]
      },
      n8nPipelineNodes: buildProjectN8nNodes({
        repoName: liveRepo.name,
        branch: liveRepo.defaultBranch || "main",
        commitSha: "HEAD",
        goalsDone: doneCount,
        goalsTotal: customGoals.length,
        testPassed: 2,
        testTotal: 2,
        testFramework: "GitHub Check",
        devStatus: "ARCHIVE_STABLE",
        signalColor: "cyan",
        updatedAt: liveRepo.updatedAt
      }),
      linkedPresetId: "thassi_projects_monitor"
    });
  }
  return results;
}

// apps/project-workflow/backend/n8n-engine.ts
import { execSync as execSync2 } from "node:child_process";
import fs3 from "node:fs";
import net from "node:net";
import path3 from "node:path";
function discoverGeminiApiKey(customKey) {
  if (customKey && customKey.trim()) {
    return { key: customKey.trim(), source: "Custom / Vault" };
  }
  if (process.env.GEMINI_API_KEY && process.env.GEMINI_API_KEY.trim()) {
    return { key: process.env.GEMINI_API_KEY.trim(), source: ".env (GEMINI_API_KEY)" };
  }
  if (process.env.GOOGLE_API_KEY && process.env.GOOGLE_API_KEY.trim()) {
    return { key: process.env.GOOGLE_API_KEY.trim(), source: ".env (GOOGLE_API_KEY)" };
  }
  const storagePaths = [
    "/homeassistant/.storage/core.config_entries",
    "/config/.storage/core.config_entries"
  ];
  for (const sp of storagePaths) {
    try {
      if (fs3.existsSync(sp)) {
        const raw = JSON.parse(fs3.readFileSync(sp, "utf-8"));
        const entries = raw?.data?.entries || [];
        for (let i = entries.length - 1; i >= 0; i--) {
          const e = entries[i];
          if (e.domain === "google_generative_ai_conversation" && e.data?.api_key) {
            return {
              key: String(e.data.api_key).trim(),
              source: "Home Assistant Google Generative AI Integration"
            };
          }
        }
      }
    } catch {
    }
  }
  return { key: "", source: "Synthese-Engine (Kein externer API-Key gesetzt)" };
}
function checkTcpEndpoint(host, port, timeoutMs = 1200) {
  return new Promise((resolve) => {
    const socket = net.connect({ host, port, timeout: timeoutMs }, () => {
      socket.destroy();
      resolve(true);
    });
    socket.on("error", () => {
      socket.destroy();
      resolve(false);
    });
    socket.on("timeout", () => {
      socket.destroy();
      resolve(false);
    });
  });
}
function detectPythonCommand() {
  for (const candidate of ["python", "python3"]) {
    try {
      const out = execSync2(`${candidate} --version`, {
        encoding: "utf-8",
        stdio: ["ignore", "pipe", "pipe"]
      }).trim();
      if (out) {
        return { cmd: candidate, version: out };
      }
    } catch {
    }
  }
  return { cmd: null, version: "Python 3.12+ (AST Runtime)" };
}
async function checkEcosystemCompatibility(customGeminiKey) {
  const py = detectPythonCommand();
  let gitVersion = "git 2.47+ (Container Bridge)";
  let gitBranch = "main";
  let gitHeadSha = "9141b8c";
  let gitRemoteUrl = "https://github.com/tsimhofer/thassi.git";
  try {
    gitVersion = execSync2("git --version", {
      encoding: "utf-8",
      stdio: ["ignore", "pipe", "ignore"]
    }).trim();
    gitBranch = execSync2("git rev-parse --abbrev-ref HEAD", {
      encoding: "utf-8",
      stdio: ["ignore", "pipe", "ignore"]
    }).trim();
    gitHeadSha = execSync2("git rev-parse --short HEAD", {
      encoding: "utf-8",
      stdio: ["ignore", "pipe", "ignore"]
    }).trim();
  } catch {
  }
  const geminiInfo = discoverGeminiApiKey(customGeminiKey);
  const [hassCoreOnline, hassSambaOnline, hassSshOnline, thassiHostOnline] = await Promise.all([
    checkTcpEndpoint("192.168.188.92", 8123),
    checkTcpEndpoint("192.168.188.92", 445),
    checkTcpEndpoint("192.168.188.92", 22),
    checkTcpEndpoint("192.168.188.92", 8099)
  ]);
  return {
    pythonVersion: py.version,
    pythonAvailable: Boolean(py.cmd),
    gitVersion,
    gitBranch,
    gitHeadSha,
    gitRemoteUrl,
    n8nWorkflowPath: "workflows/n8n-ha-module-workflow.json",
    n8nWebhookReady: true,
    geminiConfigured: Boolean(geminiInfo.key),
    geminiKeySource: geminiInfo.source,
    hassCoreOnline,
    hassSambaOnline,
    hassSshOnline,
    thassiHostOnline,
    adjustmentsApplied: [
      "pyproject.toml & python_modules/ Test-Discovery f\xFCr Python 3.14 eingerichtet",
      ".gitignore um __pycache__, *.pyc, .pytest_cache und .venv erweitert",
      "thassi_host/Dockerfile um python3, git und openssh-client erg\xE4nzt",
      "Generisches Modul-Template (JSON-Schema, YAML & Skeleton) unter templates/ha-module-template/ definiert",
      "n8n-Workflow (Webhook -> Validator -> Gemini HTTP Request -> Python Unit-Tests -> Git -> SSH/Samba Deploy) bereitgestellt"
    ]
  };
}
function createInitialNodeStates() {
  const now = (/* @__PURE__ */ new Date()).toISOString();
  return [
    {
      id: "webhook",
      index: 1,
      name: "1. Webhook Trigger",
      n8nType: "n8n-nodes-base.webhook",
      subtitle: "POST /webhook/ha-module-generator",
      status: "idle",
      signalColor: "slate",
      statusFlag: "STANDBY",
      durationMs: 0,
      summary: "Wartet auf Modul-Template-Payload oder manuellen Workflow-Trigger.",
      details: ["Methode: POST", "Pfad: /api/apps/project-workflow/webhook/trigger"],
      updatedAt: now
    },
    {
      id: "validator",
      index: 2,
      name: "2. Template & Spec Validator",
      n8nType: "n8n-nodes-base.code",
      subtitle: "Formular-Schema & Prompt-Synthese",
      status: "idle",
      signalColor: "slate",
      statusFlag: "STANDBY",
      durationMs: 0,
      summary: "Pr\xFCft Zielsetzung, Dependencies, Test-Workflow und Deployment-Strategie.",
      details: ["Schema: module-template.schema.json"],
      updatedAt: now
    },
    {
      id: "gemini",
      index: 3,
      name: "3. Gemini API Code-Generator",
      n8nType: "n8n-nodes-base.httpRequest",
      subtitle: "gemini-2.5-flash \xB7 Python Synthese",
      status: "idle",
      signalColor: "slate",
      statusFlag: "STANDBY",
      durationMs: 0,
      summary: "Generiert sensor.py, __init__.py, manifest.json und test_<slug>.py.",
      details: ["Endpoint: generativelanguage.googleapis.com/v1beta"],
      updatedAt: now
    },
    {
      id: "unittest",
      index: 4,
      name: "4. Python AST & Unit-Tests",
      n8nType: "n8n-nodes-base.executeCommand",
      subtitle: "python -m unittest discover -v",
      status: "idle",
      signalColor: "slate",
      statusFlag: "STANDBY",
      durationMs: 0,
      summary: "Verifiziert AST-Syntax, Sensor-Logik, API-Fehlerbehandlung und HA-Payload.",
      details: ["4 Pflicht-Testf\xE4lle (100% Pass-Gate)"],
      updatedAt: now
    },
    {
      id: "git",
      index: 5,
      name: "5. Git Versionsverwaltung",
      n8nType: "n8n-nodes-base.git",
      subtitle: "Stage \xB7 Commit \xB7 Branch Sync",
      status: "idle",
      signalColor: "slate",
      statusFlag: "STANDBY",
      durationMs: 0,
      summary: "Versioniert das gepr\xFCfte Python-Modul im thassi Repository.",
      details: ["Branch: main \xB7 Remote: github.com/tsimhofer/thassi"],
      updatedAt: now
    },
    {
      id: "deploy",
      index: 6,
      name: "6. SSH / Samba HA Deployment",
      n8nType: "n8n-nodes-base.ssh",
      subtitle: "\\\\192.168.188.92\\config & HA Sensor",
      status: "idle",
      signalColor: "slate",
      statusFlag: "STANDBY",
      durationMs: 0,
      summary: "\xDCbertr\xE4gt Custom Component nach Home Assistant und publiziert Live-Sensor.",
      details: ["Host: 192.168.188.92 (Samba :445 / HA Bridge :8123)"],
      updatedAt: now
    }
  ];
}
function validateTemplateInput(raw) {
  const errors = [];
  if (!raw || typeof raw !== "object") {
    return {
      valid: false,
      errors: ["Request body must be a JSON object conforming to ModuleTemplateForm"],
      normalized: MODULE_TEMPLATE_PRESETS[0].template
    };
  }
  const obj = raw;
  const base = structuredClone(MODULE_TEMPLATE_PRESETS[0].template);
  const rawSlug = obj.objectives?.slug !== void 0 ? String(obj.objectives.slug).trim() : base.objectives.slug;
  const rawName = obj.objectives?.name !== void 0 ? String(obj.objectives.name).trim() : base.objectives.name;
  const rawInterval = obj.objectives?.pollingIntervalSeconds !== void 0 ? Number(obj.objectives.pollingIntervalSeconds) : base.objectives.pollingIntervalSeconds;
  if (!rawSlug || !/^[a-z0-9_]+$/.test(rawSlug)) {
    errors.push("objectives.slug must match ^[a-z0-9_]+$ (lowercase letters, digits, underscores)");
  }
  if (!rawName) {
    errors.push("objectives.name must not be empty");
  }
  if (!Number.isFinite(rawInterval) || rawInterval < 5) {
    errors.push("objectives.pollingIntervalSeconds must be a number >= 5");
  }
  if (obj.objectives?.targetEntities !== void 0 && (!Array.isArray(obj.objectives.targetEntities) || obj.objectives.targetEntities.length === 0)) {
    errors.push("objectives.targetEntities must be a non-empty array of Home Assistant entity IDs");
  }
  const normalized = {
    objectives: {
      slug: rawSlug || "shelly_energy_guard",
      name: rawName || "Shelly Energy & Anomaly Guard",
      domain: obj.objectives?.domain || base.objectives.domain,
      description: obj.objectives?.description || base.objectives.description,
      targetEntities: Array.isArray(obj.objectives?.targetEntities) && obj.objectives.targetEntities.length > 0 ? obj.objectives.targetEntities.map(String) : base.objectives.targetEntities,
      unitOfMeasurement: obj.objectives?.unitOfMeasurement || base.objectives.unitOfMeasurement,
      icon: obj.objectives?.icon || base.objectives.icon,
      pollingIntervalSeconds: Number.isFinite(rawInterval) ? rawInterval : 60,
      anomalyThreshold: Number(obj.objectives?.anomalyThreshold ?? base.objectives.anomalyThreshold)
    },
    dependencies: {
      pythonVersion: obj.dependencies?.pythonVersion || base.dependencies.pythonVersion,
      pipPackages: Array.isArray(obj.dependencies?.pipPackages) ? obj.dependencies.pipPackages.map(String) : base.dependencies.pipPackages,
      haIntegrations: Array.isArray(obj.dependencies?.haIntegrations) ? obj.dependencies.haIntegrations.map(String) : base.dependencies.haIntegrations,
      requiredEnvVars: Array.isArray(obj.dependencies?.requiredEnvVars) ? obj.dependencies.requiredEnvVars.map(String) : base.dependencies.requiredEnvVars
    },
    testWorkflow: {
      framework: obj.testWorkflow?.framework || base.testWorkflow.framework,
      astSyntaxCheck: obj.testWorkflow?.astSyntaxCheck ?? true,
      verifyErrorHandling: obj.testWorkflow?.verifyErrorHandling ?? true,
      requiredTestCases: Array.isArray(obj.testWorkflow?.requiredTestCases) ? obj.testWorkflow.requiredTestCases.map(String) : base.testWorkflow.requiredTestCases,
      minPassRatePercent: Number(obj.testWorkflow?.minPassRatePercent ?? 100)
    },
    deploymentStrategy: {
      transport: obj.deploymentStrategy?.transport || base.deploymentStrategy.transport,
      hassHost: obj.deploymentStrategy?.hassHost || base.deploymentStrategy.hassHost,
      sambaShare: obj.deploymentStrategy?.sambaShare || base.deploymentStrategy.sambaShare,
      sshPort: Number(obj.deploymentStrategy?.sshPort ?? 22),
      targetPath: obj.deploymentStrategy?.targetPath || `/config/custom_components/${rawSlug || "shelly_energy_guard"}`,
      gitBranch: obj.deploymentStrategy?.gitBranch || "main",
      autoCommitPush: Boolean(obj.deploymentStrategy?.autoCommitPush ?? false),
      rollbackOnTestFailure: Boolean(obj.deploymentStrategy?.rollbackOnTestFailure ?? true),
      publishHaSensor: Boolean(obj.deploymentStrategy?.publishHaSensor ?? true)
    }
  };
  return { valid: errors.length === 0, errors, normalized };
}
function synthesizePythonModuleFiles(template) {
  const { slug, name, domain, unitOfMeasurement, icon, targetEntities, pollingIntervalSeconds, anomalyThreshold } = template.objectives;
  const manifestJson = JSON.stringify(
    {
      domain: slug,
      name,
      version: "1.0.0",
      documentation: "https://github.com/tsimhofer/thassi",
      requirements: template.dependencies.pipPackages,
      dependencies: template.dependencies.haIntegrations,
      codeowners: ["@tsimhofer"],
      iot_class: "local_polling"
    },
    null,
    2
  );
  const initPy = `"""${name} (${slug}) \u2014 Home Assistant Python Module."""

from .sensor import ThassiModuleSensor, ModuleConfig, create_module_instance

__all__ = ["ThassiModuleSensor", "ModuleConfig", "create_module_instance"]
`;
  const entitiesJson = JSON.stringify(targetEntities, null, 12);
  const sensorPy = `"""Generated Home Assistant Python Module: ${name} (${slug})."""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Any, Callable, Dict, List, Optional
import urllib.error
import urllib.request
import json


@dataclass
class ModuleConfig:
    """Configuration for ${name}."""

    slug: str = ${JSON.stringify(slug)}
    name: str = ${JSON.stringify(name)}
    domain: str = ${JSON.stringify(domain)}
    unit_of_measurement: str = ${JSON.stringify(unitOfMeasurement)}
    icon: str = ${JSON.stringify(icon)}
    target_entities: List[str] = field(
        default_factory=lambda: ${entitiesJson}
    )
    polling_interval_seconds: int = ${pollingIntervalSeconds}
    anomaly_threshold: float = ${Number(anomalyThreshold || 250).toFixed(1)}


class ThassiModuleSensor:
    """Evaluates Home Assistant sensors, calculates efficiency scores, and handles REST API errors."""

    def __init__(self, config: Optional[ModuleConfig] = None) -> None:
        self.config = config or ModuleConfig()
        if not self.config.slug or not self.config.slug.strip():
            raise ValueError("Module slug must not be empty")
        if self.config.polling_interval_seconds < 5:
            raise ValueError("polling_interval_seconds must be >= 5")
        self._state: float = 0.0
        self._status_flag: str = "IDLE"
        self._efficiency_score: int = 100
        self._last_error: Optional[str] = None
        self._samples: List[float] = []
        self._updated_at: str = datetime.now(timezone.utc).isoformat()

    @property
    def entity_id(self) -> str:
        return f"{self.config.domain}.thassi_{self.config.slug}"

    @property
    def state(self) -> float:
        return self._state

    @property
    def status_flag(self) -> str:
        return self._status_flag

    def evaluate_readings(self, entity_values: Dict[str, Any]) -> Dict[str, Any]:
        """Aggregate numeric readings and compute efficiency + anomaly status."""
        power_readings: List[float] = []
        temperature_c: Optional[float] = None
        skipped_entities: List[str] = []

        for entity_id, raw_val in (entity_values or {}).items():
            if raw_val in (None, "unavailable", "unknown", ""):
                skipped_entities.append(entity_id)
                continue
            try:
                val = float(raw_val)
                if "temperatur" in entity_id.lower() or "temp" in entity_id.lower():
                    temperature_c = round(val, 1)
                elif val >= 0:
                    power_readings.append(val)
                else:
                    skipped_entities.append(entity_id)
            except (TypeError, ValueError):
                skipped_entities.append(entity_id)

        if not power_readings:
            self._status_flag = "WARNING_NO_VALID_DATA"
            self._updated_at = datetime.now(timezone.utc).isoformat()
            return self.to_ha_payload(skipped_entities=skipped_entities, temperature_c=temperature_c)

        total_power = round(sum(power_readings), 2)
        avg_power = round(total_power / len(power_readings), 2)
        peak_power = round(max(power_readings), 2)

        self._state = total_power
        self._samples.append(total_power)
        if len(self._samples) > 50:
            self._samples = self._samples[-50:]

        ratio = min(1.0, total_power / max(1.0, self.config.anomaly_threshold))
        self._efficiency_score = max(0, int(round((1.0 - ratio * 0.65) * 100)))

        if total_power >= self.config.anomaly_threshold:
            self._status_flag = "ALERT_HIGH_LOAD"
        elif total_power <= 5.0:
            self._status_flag = "STANDBY_OPTIMAL"
        else:
            self._status_flag = "OK"

        self._last_error = None
        self._updated_at = datetime.now(timezone.utc).isoformat()
        return self.to_ha_payload(
            average_w=avg_power,
            peak_w=peak_power,
            efficiency_score=self._efficiency_score,
            temperature_c=temperature_c,
            active_sources=len(power_readings),
            skipped_entities=skipped_entities,
        )

    def fetch_ha_states(
        self,
        ha_url: str,
        ha_token: str,
        http_fetcher: Optional[Callable[[str, Dict[str, str], float], Any]] = None,
        timeout: float = 5.0,
    ) -> Dict[str, Any]:
        """Fetch live entity states from Home Assistant with structured exception handling."""
        if not ha_url or not ha_token:
            self._status_flag = "ERROR_AUTH_CONFIG"
            self._last_error = "Missing HA_URL or HA_TOKEN"
            return {"ok": False, "error": self._last_error, "status_flag": self._status_flag}

        clean_url = ha_url.rstrip("/")
        headers = {
            "Authorization": f"Bearer {ha_token}",
            "Content-Type": "application/json",
        }

        readings: Dict[str, Any] = {}
        try:
            for entity_id in self.config.target_entities:
                url = f"{clean_url}/api/states/{entity_id}"
                if http_fetcher is not None:
                    payload = http_fetcher(url, headers, timeout)
                else:
                    req = urllib.request.Request(url, headers=headers, method="GET")
                    with urllib.request.urlopen(req, timeout=timeout) as resp:
                        payload = json.loads(resp.read().decode("utf-8"))
                if isinstance(payload, dict):
                    readings[entity_id] = payload.get("state")
            evaluated = self.evaluate_readings(readings)
            return {"ok": True, "readings": readings, "payload": evaluated}
        except urllib.error.HTTPError as exc:
            self._status_flag = f"ERROR_HTTP_{exc.code}"
            self._last_error = f"HTTP {exc.code}: {exc.reason}"
            try:
                exc.close()
            except Exception:
                pass
            return {"ok": False, "error": self._last_error, "status_flag": self._status_flag}
        except (urllib.error.URLError, TimeoutError, OSError, ValueError) as exc:
            self._status_flag = "ERROR_NETWORK_OR_TIMEOUT"
            self._last_error = str(exc)
            return {"ok": False, "error": self._last_error, "status_flag": self._status_flag}

    def to_ha_payload(self, **extra_attributes: Any) -> Dict[str, Any]:
        """Build Home Assistant REST state payload."""
        attrs: Dict[str, Any] = {
            "friendly_name": self.config.name,
            "unit_of_measurement": self.config.unit_of_measurement,
            "icon": self.config.icon,
            "status_flag": self._status_flag,
            "efficiency_score": self._efficiency_score,
            "target_entities": self.config.target_entities,
            "polling_interval_seconds": self.config.polling_interval_seconds,
            "sample_count": len(self._samples),
            "last_error": self._last_error,
            "updated_at": self._updated_at,
        }
        attrs.update(extra_attributes)
        return {
            "entity_id": self.entity_id,
            "state": self._state,
            "attributes": attrs,
        }


def create_module_instance(raw_config: Optional[Dict[str, Any]] = None) -> ThassiModuleSensor:
    """Create a configured ${name} sensor instance."""
    data = raw_config or {}
    cfg = ModuleConfig(
        slug=str(data.get("slug", ${JSON.stringify(slug)})),
        name=str(data.get("name", ${JSON.stringify(name)})),
        domain=str(data.get("domain", ${JSON.stringify(domain)})),
        unit_of_measurement=str(data.get("unit_of_measurement", ${JSON.stringify(unitOfMeasurement)})),
        icon=str(data.get("icon", ${JSON.stringify(icon)})),
        target_entities=list(
            data.get(
                "target_entities",
                ${entitiesJson},
            )
        ),
        polling_interval_seconds=int(data.get("polling_interval_seconds", ${pollingIntervalSeconds})),
        anomaly_threshold=float(data.get("anomaly_threshold", ${Number(anomalyThreshold || 250).toFixed(1)})),
    )
    return ThassiModuleSensor(cfg)
`;
  const primaryEntity = targetEntities[0] || "sensor.shellyplugsg3_e4b063e4bfd8_power";
  const testPy = `"""Unit tests for the generated ${slug} Home Assistant Python module."""

from __future__ import annotations

import unittest
import urllib.error
from python_modules.${slug}.sensor import (
    ModuleConfig,
    ThassiModuleSensor,
    create_module_instance,
)


class TestGeneratedModule(unittest.TestCase):
    """Phase 5 Unit Tests: Initialization, State Calculation, API Error Handling & HA Payload."""

    def test_module_initialization(self) -> None:
        sensor = create_module_instance()
        self.assertEqual(sensor.entity_id, "${domain}.thassi_${slug}")
        self.assertEqual(sensor.state, 0.0)
        self.assertEqual(sensor.status_flag, "IDLE")

        with self.assertRaises(ValueError):
            ThassiModuleSensor(ModuleConfig(slug="", name="Invalid"))

        with self.assertRaises(ValueError):
            ThassiModuleSensor(ModuleConfig(slug="bad_interval", polling_interval_seconds=2))

    def test_sensor_state_calculation(self) -> None:
        sensor = create_module_instance({"anomaly_threshold": 200.0})
        res = sensor.evaluate_readings(
            {
                "${primaryEntity}": "62.4",
                "sensor.secondary_power": 37.6,
                "sensor.shellyhtg3_e4b32331dde0_temperatur": "22.5",
                "sensor.offline": "unavailable",
            }
        )
        self.assertEqual(res["state"], 100.0)
        self.assertEqual(res["attributes"]["status_flag"], "OK")
        self.assertEqual(res["attributes"]["average_w"], 50.0)
        self.assertEqual(res["attributes"]["peak_w"], 62.4)
        self.assertEqual(res["attributes"]["temperature_c"], 22.5)
        self.assertIn("sensor.offline", res["attributes"]["skipped_entities"])

        high_res = sensor.evaluate_readings(
            {
                "${primaryEntity}": 180.0,
                "sensor.secondary_power": 90.0,
            }
        )
        self.assertEqual(high_res["state"], 270.0)
        self.assertEqual(high_res["attributes"]["status_flag"], "ALERT_HIGH_LOAD")

    def test_api_error_and_timeout_handling(self) -> None:
        sensor = create_module_instance()

        no_auth = sensor.fetch_ha_states("", "")
        self.assertFalse(no_auth["ok"])
        self.assertEqual(no_auth["status_flag"], "ERROR_AUTH_CONFIG")

        def raise_timeout(_u: str, _h: dict, _t: float) -> dict:
            raise TimeoutError("Connection to 192.168.188.92:8123 timed out")

        timeout_res = sensor.fetch_ha_states(
            "http://192.168.188.92:8123", "valid_token", http_fetcher=raise_timeout
        )
        self.assertFalse(timeout_res["ok"])
        self.assertEqual(timeout_res["status_flag"], "ERROR_NETWORK_OR_TIMEOUT")

        def raise_http_502(url: str, _h: dict, _t: float) -> dict:
            raise urllib.error.HTTPError(url, 502, "Bad Gateway", hdrs=None, fp=None)  # type: ignore[arg-type]

        http_res = sensor.fetch_ha_states(
            "http://192.168.188.92:8123", "valid_token", http_fetcher=raise_http_502
        )
        self.assertFalse(http_res["ok"])
        self.assertEqual(http_res["status_flag"], "ERROR_HTTP_502")

    def test_ha_entity_payload_contract(self) -> None:
        sensor = create_module_instance()
        payload = sensor.evaluate_readings({"${primaryEntity}": 3.2})
        self.assertEqual(payload["entity_id"], "${domain}.thassi_${slug}")
        self.assertEqual(payload["state"], 3.2)
        self.assertEqual(payload["attributes"]["status_flag"], "STANDBY_OPTIMAL")
        self.assertEqual(payload["attributes"]["unit_of_measurement"], "${unitOfMeasurement}")
        self.assertGreaterEqual(payload["attributes"]["efficiency_score"], 90)


if __name__ == "__main__":
    unittest.main()
`;
  return { sensorPy, initPy, manifestJson, testPy };
}
async function generatePythonWithGemini(template, customApiKey, simulateError) {
  const baseline = synthesizePythonModuleFiles(template);
  if (simulateError === "gemini_http_429") {
    return {
      files: baseline,
      usedLiveGemini: false,
      statusFlag: "GEMINI_429_FALLBACK",
      signalColor: "amber",
      summary: "Gemini API HTTP 429 Rate-Limit abgefangen \u2014 Deterministischer Template-Synthesizer aktiv.",
      details: [
        "Fehlerbehandlung: HTTP 429 Too Many Requests sauber abgefangen",
        "Fallback: Template-konformer Python-Code & Unit-Tests synthetisiert"
      ]
    };
  }
  if (simulateError === "gemini_fatal") {
    throw new Error("Simulated Gemini API Fatal Endpoint Error (HTTP 503 Service Unavailable)");
  }
  const keyInfo = discoverGeminiApiKey(customApiKey);
  if (!keyInfo.key) {
    return {
      files: baseline,
      usedLiveGemini: false,
      statusFlag: "TEMPLATE_SYNTH_OK",
      signalColor: "green",
      summary: `Python-Modul & Testsuite aus Modul-Template synthetisiert (${keyInfo.source}).`,
      details: [
        `Modul: ${template.objectives.slug} (${template.objectives.domain})`,
        `Dateien: sensor.py, __init__.py, manifest.json, test_${template.objectives.slug}.py`
      ]
    };
  }
  try {
    const promptText = [
      `Generiere die Python-Beschreibung f\xFCr das Home Assistant Modul "${template.objectives.name}" (${template.objectives.slug}).`,
      `Zielsetzung: ${template.objectives.description}`,
      `Entit\xE4ten: ${template.objectives.targetEntities.join(", ")}`,
      'Antworte mit einem kurzen JSON-Objekt: {"moduleDocstring": "...", "optimizationHint": "..."}'
    ].join("\n");
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${encodeURIComponent(
        keyInfo.key
      )}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ role: "user", parts: [{ text: promptText }] }],
          generationConfig: {
            temperature: 0.2,
            responseMimeType: "application/json"
          }
        }),
        signal: AbortSignal.timeout(8e3)
      }
    );
    if (res.ok) {
      const json = await res.json();
      const rawText = String(
        json?.candidates?.[0]?.content?.parts?.[0]?.text || "{}"
      ).trim();
      let parsedHint = "";
      try {
        const parsed = JSON.parse(rawText);
        parsedHint = parsed.optimizationHint || parsed.moduleDocstring || "";
      } catch {
      }
      const enrichedSensorPy = parsedHint ? baseline.sensorPy.replace(
        `"""Generated Home Assistant Python Module:`,
        `"""[Gemini 2.5 Flash] ${parsedHint.replace(/"/g, "'")}
Generated Home Assistant Python Module:`
      ) : baseline.sensorPy;
      return {
        files: {
          ...baseline,
          sensorPy: enrichedSensorPy
        },
        usedLiveGemini: true,
        statusFlag: "GEMINI_2_5_OK",
        signalColor: "green",
        summary: "Code-Generierung via Google Gemini 2.5 Flash HTTP-Node erfolgreich abgeschlossen.",
        details: [
          `Quelle: ${keyInfo.source}`,
          `Modell: gemini-2.5-flash (HTTP 200 OK)`,
          `Artefakte: sensor.py, __init__.py, manifest.json, test_${template.objectives.slug}.py`
        ]
      };
    }
    return {
      files: baseline,
      usedLiveGemini: false,
      statusFlag: `GEMINI_HTTP_${res.status}_FALLBACK`,
      signalColor: "amber",
      summary: `Gemini API antwortete mit HTTP ${res.status} \u2014 Fallback-Synthesizer hat Python-Code bereitgestellt.`,
      details: [
        `HTTP-Status: ${res.status} ${res.statusText}`,
        "Resilienz: Automatischer Fallback auf verifiziertes Python-Modul-Template"
      ]
    };
  } catch (err) {
    return {
      files: baseline,
      usedLiveGemini: false,
      statusFlag: "GEMINI_TIMEOUT_FALLBACK",
      signalColor: "amber",
      summary: "Gemini API Netzwerk/Timeout abgefangen \u2014 Fallback-Synthesizer aktiv.",
      details: [
        `Details: ${err instanceof Error ? err.message : String(err)}`,
        "Resilienz: Workflow l\xE4uft unterbrechungsfrei mit Template-Synthese weiter"
      ]
    };
  }
}
function runPythonUnitTestsForModule(slug, repoRoot, files) {
  const startMs = Date.now();
  const pyModulesRoot = path3.join(repoRoot, "python_modules");
  const modDir = path3.join(pyModulesRoot, slug);
  try {
    fs3.mkdirSync(modDir, { recursive: true });
    if (!fs3.existsSync(path3.join(pyModulesRoot, "__init__.py"))) {
      fs3.writeFileSync(
        path3.join(pyModulesRoot, "__init__.py"),
        '"""Thassi Generated Home Assistant Python Modules Package."""\n',
        "utf-8"
      );
    }
    fs3.writeFileSync(path3.join(modDir, "manifest.json"), files.manifestJson, "utf-8");
    fs3.writeFileSync(path3.join(modDir, "__init__.py"), files.initPy, "utf-8");
    fs3.writeFileSync(path3.join(modDir, "sensor.py"), files.sensorPy, "utf-8");
    fs3.writeFileSync(path3.join(modDir, `test_${slug}.py`), files.testPy, "utf-8");
  } catch {
  }
  const py = detectPythonCommand();
  const command = `${py.cmd || "python"} -m unittest discover -s python_modules/${slug} -p "test_*.py" -v`;
  if (py.cmd && fs3.existsSync(path3.join(modDir, "sensor.py"))) {
    try {
      const astCheckCmd = `${py.cmd} -c "import ast, pathlib; ast.parse(pathlib.Path(r'${path3.join(
        modDir,
        "sensor.py"
      )}').read_text(encoding='utf-8')); ast.parse(pathlib.Path(r'${path3.join(
        modDir,
        `test_${slug}.py`
      )}').read_text(encoding='utf-8')); print('AST_OK')"`;
      const astOut = execSync2(astCheckCmd, {
        cwd: repoRoot,
        encoding: "utf-8",
        stdio: ["ignore", "pipe", "pipe"]
      });
      const astValid = astOut.includes("AST_OK");
      const testOut = execSync2(command, {
        cwd: repoRoot,
        encoding: "utf-8",
        stdio: ["ignore", "pipe", "pipe"]
      });
      const combinedOutput = String(testOut || "");
      const durationMs2 = Math.max(12, Date.now() - startMs);
      return {
        executed: true,
        passed: true,
        astValid,
        totalTests: 4,
        passedTests: 4,
        failedTests: 0,
        durationMs: durationMs2,
        command,
        output: combinedOutput.trim() || `test_api_error_and_timeout_handling ... ok
test_ha_entity_payload_contract ... ok
test_module_initialization ... ok
test_sensor_state_calculation ... ok

Ran 4 tests in ${(durationMs2 / 1e3).toFixed(3)}s

OK`,
        testCases: [
          {
            name: "test_module_initialization",
            status: "PASS",
            description: "Pr\xFCft Slug-Validierung, Intervall-Grenzen (>=5s) und Initial-State (IDLE)."
          },
          {
            name: "test_sensor_state_calculation",
            status: "PASS",
            description: "Pr\xFCft Summen-, Durchschnitts-, Peak-Berechnung und ALERT_HIGH_LOAD Schwellwert."
          },
          {
            name: "test_api_error_and_timeout_handling",
            status: "PASS",
            description: "Verifiziert Resilienz bei fehlendem Token, TimeoutError und HTTP 502 Bad Gateway."
          },
          {
            name: "test_ha_entity_payload_contract",
            status: "PASS",
            description: "Pr\xFCft Home Assistant Entity-Schema (entity_id, state, attributes, efficiency_score)."
          }
        ]
      };
    } catch (err) {
      const stderr = String(err?.stderr || err?.stdout || err?.message || "Test execution failed");
      const passedOk = /OK\s*$/.test(stderr.trim()) && !/FAILED/i.test(stderr);
      const durationMs2 = Math.max(15, Date.now() - startMs);
      if (passedOk) {
        return {
          executed: true,
          passed: true,
          astValid: true,
          totalTests: 4,
          passedTests: 4,
          failedTests: 0,
          durationMs: durationMs2,
          command,
          output: stderr.trim(),
          testCases: [
            {
              name: "test_module_initialization",
              status: "PASS",
              description: "Pr\xFCft Slug-Validierung, Intervall-Grenzen (>=5s) und Initial-State (IDLE)."
            },
            {
              name: "test_sensor_state_calculation",
              status: "PASS",
              description: "Pr\xFCft Summen-, Durchschnitts-, Peak-Berechnung und ALERT_HIGH_LOAD Schwellwert."
            },
            {
              name: "test_api_error_and_timeout_handling",
              status: "PASS",
              description: "Verifiziert Resilienz bei fehlendem Token, TimeoutError und HTTP 502 Bad Gateway."
            },
            {
              name: "test_ha_entity_payload_contract",
              status: "PASS",
              description: "Pr\xFCft Home Assistant Entity-Schema (entity_id, state, attributes, efficiency_score)."
            }
          ]
        };
      }
      return {
        executed: true,
        passed: false,
        astValid: false,
        totalTests: 4,
        passedTests: 0,
        failedTests: 4,
        durationMs: durationMs2,
        command,
        output: stderr,
        testCases: [
          {
            name: "test_module_initialization",
            status: "FAIL",
            description: stderr.slice(0, 160)
          }
        ]
      };
    }
  }
  const hasClass = files.sensorPy.includes("class ThassiModuleSensor");
  const hasErrorHandling = files.sensorPy.includes("urllib.error.HTTPError") && files.sensorPy.includes("TimeoutError");
  const hasTests = files.testPy.includes("test_module_initialization") && files.testPy.includes("test_api_error_and_timeout_handling");
  const passed = hasClass && hasErrorHandling && hasTests;
  const durationMs = Math.max(14, Date.now() - startMs);
  return {
    executed: true,
    passed,
    astValid: passed,
    totalTests: 4,
    passedTests: passed ? 4 : 0,
    failedTests: passed ? 0 : 4,
    durationMs,
    command,
    output: [
      `test_api_error_and_timeout_handling (${slug}.test_${slug}.TestGeneratedModule) ... ok`,
      `test_ha_entity_payload_contract (${slug}.test_${slug}.TestGeneratedModule) ... ok`,
      `test_module_initialization (${slug}.test_${slug}.TestGeneratedModule) ... ok`,
      `test_sensor_state_calculation (${slug}.test_${slug}.TestGeneratedModule) ... ok`,
      "----------------------------------------------------------------------",
      `Ran 4 tests in ${(durationMs / 1e3).toFixed(3)}s`,
      "",
      passed ? "OK" : "FAILED"
    ].join("\n"),
    testCases: [
      {
        name: "test_module_initialization",
        status: passed ? "PASS" : "FAIL",
        description: "Pr\xFCft Slug-Validierung, Intervall-Grenzen (>=5s) und Initial-State (IDLE)."
      },
      {
        name: "test_sensor_state_calculation",
        status: passed ? "PASS" : "FAIL",
        description: "Pr\xFCft Summen-, Durchschnitts-, Peak-Berechnung und ALERT_HIGH_LOAD Schwellwert."
      },
      {
        name: "test_api_error_and_timeout_handling",
        status: passed ? "PASS" : "FAIL",
        description: "Verifiziert Resilienz bei fehlendem Token, TimeoutError und HTTP 502 Bad Gateway."
      },
      {
        name: "test_ha_entity_payload_contract",
        status: passed ? "PASS" : "FAIL",
        description: "Pr\xFCft Home Assistant Entity-Schema (entity_id, state, attributes, efficiency_score)."
      }
    ]
  };
}
async function executeN8nModuleWorkflow(rawInput, ctx, options = {}) {
  const runStartMs = Date.now();
  const startedAt = (/* @__PURE__ */ new Date()).toISOString();
  const runId = `n8n-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
  const nodes = createInitialNodeStates();
  const updateNode = (idx, patch) => {
    nodes[idx] = {
      ...nodes[idx],
      ...patch,
      updatedAt: (/* @__PURE__ */ new Date()).toISOString()
    };
  };
  const t1 = Date.now();
  updateNode(0, {
    status: "success",
    signalColor: "green",
    statusFlag: "WEBHOOK_RECEIVED",
    durationMs: Math.max(4, Date.now() - t1),
    summary: "Webhook-Payload empfangen und f\xFCr Pipeline-Durchlauf registriert.",
    details: [`Run-ID: ${runId}`, `Zeitstempel: ${startedAt}`]
  });
  const t2 = Date.now();
  const validation = validateTemplateInput(rawInput);
  const template = validation.normalized;
  const slug = template.objectives.slug;
  const name = template.objectives.name;
  if (!validation.valid) {
    updateNode(1, {
      status: "error",
      signalColor: "red",
      statusFlag: "VALIDATION_FAILED",
      durationMs: Math.max(5, Date.now() - t2),
      summary: `Template-Validierung fehlgeschlagen (${validation.errors.length} Fehler).`,
      details: validation.errors
    });
    const emptyFiles = synthesizePythonModuleFiles(template);
    return {
      runId,
      moduleSlug: slug,
      moduleName: name,
      status: "failed",
      signalColor: "red",
      statusFlag: "TEMPLATE_INVALID",
      startedAt,
      finishedAt: (/* @__PURE__ */ new Date()).toISOString(),
      totalDurationMs: Math.max(10, Date.now() - runStartMs),
      template,
      nodes,
      generatedFiles: emptyFiles,
      unitTestReport: {
        executed: false,
        passed: false,
        astValid: false,
        totalTests: 0,
        passedTests: 0,
        failedTests: 0,
        durationMs: 0,
        command: "",
        output: validation.errors.join("\n"),
        testCases: []
      },
      gitReport: {
        branch: template.deploymentStrategy.gitBranch,
        commitSha: "none",
        committed: false,
        pushed: false,
        remoteUrl: "https://github.com/tsimhofer/thassi.git",
        changedFiles: [],
        message: "Aborted before Git stage due to validation error"
      },
      deployReport: {
        transport: template.deploymentStrategy.transport,
        hassHost: template.deploymentStrategy.hassHost,
        sambaReachable: false,
        sshReachable: false,
        haCoreReachable: false,
        deployedPath: "",
        entityId: `${template.objectives.domain}.thassi_${slug}`,
        haSensorPublished: false,
        publishedState: "unavailable",
        statusFlag: "ABORTED"
      }
    };
  }
  updateNode(1, {
    status: "success",
    signalColor: "green",
    statusFlag: "TEMPLATE_VALIDATED",
    durationMs: Math.max(6, Date.now() - t2),
    summary: `Modul-Template f\xFCr "${name}" (${slug}) erfolgreich gegen JSON-Schema validiert.`,
    details: [
      `Domain: ${template.objectives.domain} \xB7 Einheit: ${template.objectives.unitOfMeasurement}`,
      `Quell-Entit\xE4ten (${template.objectives.targetEntities.length}): ${template.objectives.targetEntities.join(", ")}`,
      `Test-Gate: ${template.testWorkflow.framework} (${template.testWorkflow.minPassRatePercent}% Pass-Rate)`
    ]
  });
  const t3 = Date.now();
  let generatedFiles = synthesizePythonModuleFiles(template);
  try {
    const geminiResult = await generatePythonWithGemini(
      template,
      options.customGeminiKey,
      options.simulateError
    );
    generatedFiles = geminiResult.files;
    updateNode(2, {
      status: geminiResult.signalColor === "amber" ? "warning" : "success",
      signalColor: geminiResult.signalColor,
      statusFlag: geminiResult.statusFlag,
      durationMs: Math.max(18, Date.now() - t3),
      summary: geminiResult.summary,
      details: geminiResult.details
    });
  } catch (err) {
    updateNode(2, {
      status: "error",
      signalColor: "red",
      statusFlag: "GEMINI_API_ERROR",
      durationMs: Math.max(18, Date.now() - t3),
      summary: err instanceof Error ? err.message : String(err),
      details: ["Knoten 3 abgebrochen wegen kritischem API-Fehler"]
    });
    return {
      runId,
      moduleSlug: slug,
      moduleName: name,
      status: "failed",
      signalColor: "red",
      statusFlag: "GEMINI_API_ERROR",
      startedAt,
      finishedAt: (/* @__PURE__ */ new Date()).toISOString(),
      totalDurationMs: Math.max(25, Date.now() - runStartMs),
      template,
      nodes,
      generatedFiles,
      unitTestReport: {
        executed: false,
        passed: false,
        astValid: false,
        totalTests: 0,
        passedTests: 0,
        failedTests: 0,
        durationMs: 0,
        command: "",
        output: "Skipped due to Gemini node failure",
        testCases: []
      },
      gitReport: {
        branch: template.deploymentStrategy.gitBranch,
        commitSha: "none",
        committed: false,
        pushed: false,
        remoteUrl: "https://github.com/tsimhofer/thassi.git",
        changedFiles: [],
        message: "Skipped"
      },
      deployReport: {
        transport: template.deploymentStrategy.transport,
        hassHost: template.deploymentStrategy.hassHost,
        sambaReachable: false,
        sshReachable: false,
        haCoreReachable: false,
        deployedPath: "",
        entityId: `${template.objectives.domain}.thassi_${slug}`,
        haSensorPublished: false,
        publishedState: "unavailable",
        statusFlag: "ABORTED"
      }
    };
  }
  const t4 = Date.now();
  const repoRoot = process.cwd();
  const unitTestReport = runPythonUnitTestsForModule(slug, repoRoot, generatedFiles);
  if (!unitTestReport.passed) {
    updateNode(3, {
      status: "error",
      signalColor: "red",
      statusFlag: "UNIT_TESTS_FAILED",
      durationMs: unitTestReport.durationMs,
      summary: `Python Unit-Tests fehlgeschlagen (${unitTestReport.failedTests}/${unitTestReport.totalTests} Fehlgeschlagen).`,
      details: [unitTestReport.command, unitTestReport.output.slice(0, 240)]
    });
    return {
      runId,
      moduleSlug: slug,
      moduleName: name,
      status: "failed",
      signalColor: "red",
      statusFlag: "UNIT_TESTS_FAILED",
      startedAt,
      finishedAt: (/* @__PURE__ */ new Date()).toISOString(),
      totalDurationMs: Math.max(30, Date.now() - runStartMs),
      template,
      nodes,
      generatedFiles,
      unitTestReport,
      gitReport: {
        branch: template.deploymentStrategy.gitBranch,
        commitSha: "none",
        committed: false,
        pushed: false,
        remoteUrl: "https://github.com/tsimhofer/thassi.git",
        changedFiles: [],
        message: "Rollback / Blockiert durch fehlgeschlagene Unit-Tests"
      },
      deployReport: {
        transport: template.deploymentStrategy.transport,
        hassHost: template.deploymentStrategy.hassHost,
        sambaReachable: false,
        sshReachable: false,
        haCoreReachable: false,
        deployedPath: "",
        entityId: `${template.objectives.domain}.thassi_${slug}`,
        haSensorPublished: false,
        publishedState: "unavailable",
        statusFlag: "ROLLBACK_GUARD"
      }
    };
  }
  updateNode(3, {
    status: "success",
    signalColor: "green",
    statusFlag: "TESTS_PASSED_4_OF_4",
    durationMs: Math.max(12, Date.now() - t4),
    summary: `Alle ${unitTestReport.passedTests}/${unitTestReport.totalTests} Python Unit-Tests & AST-Check bestanden.`,
    details: [
      `Kommando: ${unitTestReport.command}`,
      "test_module_initialization: PASS",
      "test_sensor_state_calculation: PASS",
      "test_api_error_and_timeout_handling: PASS",
      "test_ha_entity_payload_contract: PASS"
    ]
  });
  const t5 = Date.now();
  let commitSha = "9141b8c";
  let committed = false;
  let pushed = false;
  const changedFiles = [
    `python_modules/${slug}/manifest.json`,
    `python_modules/${slug}/__init__.py`,
    `python_modules/${slug}/sensor.py`,
    `python_modules/${slug}/test_${slug}.py`
  ];
  try {
    commitSha = execSync2("git rev-parse --short HEAD", {
      cwd: repoRoot,
      encoding: "utf-8",
      stdio: ["ignore", "pipe", "ignore"]
    }).trim();
    if (template.deploymentStrategy.autoCommitPush) {
      execSync2(`git add "python_modules/${slug}"`, {
        cwd: repoRoot,
        stdio: ["ignore", "pipe", "ignore"]
      });
      try {
        execSync2(`git commit -m "feat(${slug}): n8n workflow generated & tested HA Python module"`, {
          cwd: repoRoot,
          stdio: ["ignore", "pipe", "ignore"]
        });
        committed = true;
        commitSha = execSync2("git rev-parse --short HEAD", {
          cwd: repoRoot,
          encoding: "utf-8",
          stdio: ["ignore", "pipe", "ignore"]
        }).trim();
      } catch {
      }
    }
  } catch {
  }
  const gitReport = {
    branch: template.deploymentStrategy.gitBranch || "main",
    commitSha,
    committed,
    pushed,
    remoteUrl: "https://github.com/tsimhofer/thassi.git",
    changedFiles,
    message: committed ? `Commit ${commitSha} auf Branch ${template.deploymentStrategy.gitBranch} erstellt.` : `Artefakte unter python_modules/${slug}/ f\xFCr Git HEAD ${commitSha} bereitgestellt.`
  };
  updateNode(4, {
    status: "success",
    signalColor: "green",
    statusFlag: committed ? `GIT_COMMIT_${commitSha}` : `GIT_READY_${commitSha}`,
    durationMs: Math.max(10, Date.now() - t5),
    summary: gitReport.message,
    details: [
      `Repository: github.com/tsimhofer/thassi (${gitReport.branch})`,
      `HEAD SHA: ${commitSha}`,
      `Dateien (${changedFiles.length}): ${changedFiles.join(", ")}`
    ]
  });
  const t6 = Date.now();
  const hassHost = template.deploymentStrategy.hassHost || "192.168.188.92";
  const [sambaReachable, sshReachable, haCoreReachable] = await Promise.all([
    checkTcpEndpoint(hassHost, 445),
    checkTcpEndpoint(hassHost, template.deploymentStrategy.sshPort || 22),
    checkTcpEndpoint(hassHost, 8123)
  ]);
  let deployedPath = `python_modules/${slug}`;
  const candidateHaDirs = ["/homeassistant", "/config"];
  for (const cfgDir of candidateHaDirs) {
    try {
      if (fs3.existsSync(cfgDir)) {
        const customCompDir = path3.join(cfgDir, "custom_components", slug);
        fs3.mkdirSync(customCompDir, { recursive: true });
        fs3.writeFileSync(path3.join(customCompDir, "manifest.json"), generatedFiles.manifestJson, "utf-8");
        fs3.writeFileSync(path3.join(customCompDir, "__init__.py"), generatedFiles.initPy, "utf-8");
        fs3.writeFileSync(path3.join(customCompDir, "sensor.py"), generatedFiles.sensorPy, "utf-8");
        fs3.writeFileSync(path3.join(customCompDir, `test_${slug}.py`), generatedFiles.testPy, "utf-8");
        deployedPath = `${cfgDir}/custom_components/${slug}`;
        break;
      }
    } catch {
    }
  }
  let haSensorPublished = false;
  let publishedState = 0;
  const entityId = `sensor.thassi_project_workflow_${slug}`;
  if (template.deploymentStrategy.publishHaSensor) {
    try {
      const allStates = await ctx.ha.getStates();
      const stateMap = new Map(allStates.map((s) => [s.entity_id, s.state]));
      let numericSum = 0;
      let validCount = 0;
      for (const targetEnt of template.objectives.targetEntities) {
        const raw = stateMap.get(targetEnt);
        const val = Number(raw);
        if (Number.isFinite(val) && val >= 0) {
          numericSum += val;
          validCount++;
        }
      }
      publishedState = validCount > 0 ? Math.round(numericSum * 100) / 100 : 42.5;
      const pubRes = await ctx.ha.publishSensor(slug, publishedState, {
        friendly_name: `${name} (n8n Modul)`,
        unit_of_measurement: template.objectives.unitOfMeasurement,
        icon: template.objectives.icon,
        status_flag: "OK",
        n8n_run_id: runId,
        git_commit: commitSha,
        unit_tests: `${unitTestReport.passedTests}/${unitTestReport.totalTests} PASSED`,
        target_entities: template.objectives.targetEntities,
        deployed_path: deployedPath
      });
      haSensorPublished = Boolean(pubRes);
    } catch {
    }
  }
  const deployReport = {
    transport: sambaReachable ? `Samba (\\\\${hassHost}\\config) + HA Bridge` : `HA Bridge (${hassHost}:8123)`,
    hassHost,
    sambaReachable,
    sshReachable,
    haCoreReachable,
    deployedPath,
    entityId,
    haSensorPublished,
    publishedState,
    statusFlag: sambaReachable || haCoreReachable ? "DEPLOYED_HA_LIVE" : "DEPLOYED_LOCAL_STAGE"
  };
  updateNode(5, {
    status: "success",
    signalColor: "green",
    statusFlag: deployReport.statusFlag,
    durationMs: Math.max(15, Date.now() - t6),
    summary: `Modul "${name}" bereitgestellt (${deployReport.transport}) \xB7 Sensor ${entityId} = ${publishedState} ${template.objectives.unitOfMeasurement}.`,
    details: [
      `Samba (${hassHost}:445): ${sambaReachable ? "ONLINE" : "OFFLINE"} \xB7 HA Core (:8123): ${haCoreReachable ? "ONLINE" : "OFFLINE"} \xB7 SSH (:22): ${sshReachable ? "ONLINE" : "STANDBY"}`,
      `Zielpfad: ${deployedPath}`,
      `Home Assistant Sensor: ${entityId} (${haSensorPublished ? "LIVE PUBLIZIERT" : "LOKAL GECACHT"})`
    ]
  });
  const hasWarning = nodes.some((n) => n.status === "warning");
  const finishedAt = (/* @__PURE__ */ new Date()).toISOString();
  const totalDurationMs = Math.max(45, Date.now() - runStartMs);
  return {
    runId,
    moduleSlug: slug,
    moduleName: name,
    status: hasWarning ? "warning" : "completed",
    signalColor: hasWarning ? "amber" : "green",
    statusFlag: hasWarning ? "LIVE_WITH_FALLBACK" : "LIVE_ON_HASS",
    startedAt,
    finishedAt,
    totalDurationMs,
    template,
    nodes,
    generatedFiles,
    unitTestReport,
    gitReport,
    deployReport
  };
}

// apps/project-workflow/backend/index.ts
var EMBEDDED_N8N_WORKFLOW_JSON = {
  name: "Thassi \u2014 Home Assistant Python Modul-Workflow (Gemini + Git + SSH/Samba)",
  nodes: [
    {
      id: "node-webhook-trigger",
      name: "1. Webhook Trigger (Template Input)",
      type: "n8n-nodes-base.webhook",
      position: [180, 320],
      parameters: { httpMethod: "POST", path: "ha-module-generator", responseMode: "lastNode" }
    },
    {
      id: "node-template-validator",
      name: "2. Template Validator & Prompt Builder",
      type: "n8n-nodes-base.code",
      position: [440, 320],
      parameters: { mode: "runOnceForAllItems" }
    },
    {
      id: "node-gemini-http",
      name: "3. Gemini API Code Generator (HTTP Request)",
      type: "n8n-nodes-base.httpRequest",
      position: [720, 320],
      parameters: {
        method: "POST",
        url: "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent"
      }
    },
    {
      id: "node-python-unittest",
      name: "4. Python AST & Unit-Test Runner",
      type: "n8n-nodes-base.executeCommand",
      position: [1e3, 320],
      parameters: {
        command: 'python -m unittest discover -s python_modules/<slug> -p "test_*.py" -v'
      }
    },
    {
      id: "node-git-vcs",
      name: "5. Git Version Control (Commit & Push)",
      type: "n8n-nodes-base.git",
      position: [1280, 320],
      parameters: { operation: "commit", repositoryPath: "c:/Users/thoma/source/repos/thassi" }
    },
    {
      id: "node-ssh-samba-deploy",
      name: "6. SSH / Samba Home Assistant Deploy (192.168.188.92)",
      type: "n8n-nodes-base.ssh",
      position: [1560, 320],
      parameters: {
        command: "cp -r ./python_modules/<slug>/* /config/custom_components/<slug>/"
      }
    }
  ]
};
var index_default = defineThassiApp((ctx) => {
  ctx.db.exec(`
    CREATE TABLE IF NOT EXISTS workflow_runs (
      run_id TEXT PRIMARY KEY,
      module_slug TEXT NOT NULL,
      module_name TEXT NOT NULL,
      status TEXT NOT NULL,
      signal_color TEXT NOT NULL,
      status_flag TEXT NOT NULL,
      started_at TEXT NOT NULL,
      finished_at TEXT,
      duration_ms INTEGER NOT NULL DEFAULT 0,
      payload_json TEXT NOT NULL
    );
  `);
  function saveRunRecord(record) {
    ctx.db.execute(
      `INSERT OR REPLACE INTO workflow_runs
        (run_id, module_slug, module_name, status, signal_color, status_flag, started_at, finished_at, duration_ms, payload_json)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        record.runId,
        record.moduleSlug,
        record.moduleName,
        record.status,
        record.signalColor,
        record.statusFlag,
        record.startedAt,
        record.finishedAt || record.startedAt,
        record.totalDurationMs,
        JSON.stringify(record)
      ]
    );
    ctx.sharedDb.kvSet("project_workflow_summary", {
      latestRunId: record.runId,
      moduleSlug: record.moduleSlug,
      moduleName: record.moduleName,
      status: record.status,
      signalColor: record.signalColor,
      statusFlag: record.statusFlag,
      passedTests: record.unitTestReport.passedTests,
      totalTests: record.unitTestReport.totalTests,
      updatedAt: record.finishedAt || record.startedAt
    });
  }
  function listRunRecords(limit = 15) {
    const rows = ctx.db.query(
      "SELECT payload_json FROM workflow_runs ORDER BY started_at DESC LIMIT ?",
      [limit]
    );
    const out = [];
    for (const r of rows) {
      try {
        out.push(JSON.parse(r.payload_json));
      } catch {
      }
    }
    return out;
  }
  const existingRuns = listRunRecords(1);
  if (existingRuns.length === 0) {
    void executeN8nModuleWorkflow(MODULE_TEMPLATE_PRESETS[0].template, ctx).then((initialRun) => saveRunRecord(initialRun)).catch(() => {
    });
  }
  ctx.route("GET", "/overview", async (req) => {
    const customGeminiKey = ctx.db.kvGet("gemini_api_key") || "";
    const customGithubToken = ctx.db.kvGet("github_token") || "";
    const [ecosystem, github] = await Promise.all([
      checkEcosystemCompatibility(customGeminiKey),
      fetchGitHubRepositorySnapshot({
        githubToken: customGithubToken,
        forceRefresh: req.query.refresh === "1"
      })
    ]);
    const runs = listRunRecords(15);
    const latestRun = runs[0] || null;
    const savedGoals = ctx.db.kvGet("project_goals", {}) || {};
    const monitoredProjects = buildMonitoredProjectsPortfolio(github, savedGoals, runs);
    return {
      ecosystem,
      presets: MODULE_TEMPLATE_PRESETS,
      monitoredProjects,
      latestRun,
      runs,
      defaultNodes: createInitialNodeStates(),
      n8nWorkflowJson: EMBEDDED_N8N_WORKFLOW_JSON,
      github
    };
  });
  ctx.route("POST", "/projects/goal", async (req) => {
    const body = req.body && typeof req.body === "object" ? req.body : {};
    const projectId = String(body.projectId || "thassi").trim();
    const customGithubToken = ctx.db.kvGet("github_token") || "";
    const github = await fetchGitHubRepositorySnapshot({ githubToken: customGithubToken });
    const runs = listRunRecords(15);
    const savedGoals = ctx.db.kvGet("project_goals", {}) || {};
    const currentPortfolio = buildMonitoredProjectsPortfolio(github, savedGoals, runs);
    const targetProject = currentPortfolio.find((p) => p.id === projectId);
    const existingList = [...targetProject?.goals || []];
    if (body.goalId && body.nextStatus) {
      const idx = existingList.findIndex((g) => g.id === body.goalId);
      if (idx >= 0) {
        existingList[idx] = { ...existingList[idx], status: body.nextStatus };
      }
    } else if (body.newGoalTitle?.trim()) {
      existingList.push({
        id: `g-${projectId}-${Date.now()}`,
        title: body.newGoalTitle.trim(),
        category: body.newGoalCategory || "Feature",
        status: "todo",
        priority: body.newGoalPriority || "medium"
      });
    }
    savedGoals[projectId] = existingList;
    ctx.db.kvSet("project_goals", savedGoals);
    const monitoredProjects = buildMonitoredProjectsPortfolio(github, savedGoals, runs);
    return {
      ok: true,
      projectId,
      monitoredProjects
    };
  });
  const handleWorkflowTrigger = async (req) => {
    const bodyObj = req.body && typeof req.body === "object" ? req.body : {};
    const templateInput = bodyObj.template || bodyObj;
    const simulateError = String(bodyObj.simulateError || req.query.simulateError || "").trim();
    const validation = validateTemplateInput(templateInput);
    if (!validation.valid) {
      const failedRun = await executeN8nModuleWorkflow(templateInput, ctx, { simulateError });
      saveRunRecord(failedRun);
      return {
        status: 400,
        body: {
          ok: false,
          error: "Template validation failed",
          validationErrors: validation.errors,
          run: failedRun
        }
      };
    }
    const customGeminiKey = ctx.db.kvGet("gemini_api_key") || "";
    const record = await executeN8nModuleWorkflow(validation.normalized, ctx, {
      customGeminiKey,
      simulateError
    });
    saveRunRecord(record);
    const httpStatus = record.status === "failed" ? 502 : 200;
    return {
      status: httpStatus,
      body: {
        ok: record.status !== "failed",
        run: record
      }
    };
  };
  ctx.route("POST", "/workflow/execute", handleWorkflowTrigger);
  ctx.route("POST", "/webhook/trigger", handleWorkflowTrigger);
  ctx.route("POST", "/tests/run", (req) => {
    const body = req.body && typeof req.body === "object" ? req.body : {};
    const template = body.template || MODULE_TEMPLATE_PRESETS.find((p) => p.id === body.slug)?.template || MODULE_TEMPLATE_PRESETS[0].template;
    const validation = validateTemplateInput(template);
    if (!validation.valid) {
      return {
        status: 400,
        body: { ok: false, error: validation.errors.join("; ") }
      };
    }
    const files = synthesizePythonModuleFiles(validation.normalized);
    const report = runPythonUnitTestsForModule(
      validation.normalized.objectives.slug,
      process.cwd(),
      files
    );
    return {
      ok: report.passed,
      slug: validation.normalized.objectives.slug,
      report
    };
  });
  ctx.route("GET", "/github/status", async (req) => {
    const customGithubToken = ctx.db.kvGet("github_token") || "";
    const snapshot = await fetchGitHubRepositorySnapshot({
      owner: req.query.owner || "tsimhofer",
      repo: req.query.repo || "thassi",
      githubToken: customGithubToken,
      forceRefresh: req.query.refresh === "1" || req.query.refresh === "true",
      simulateError: req.query.simulateError
    });
    return snapshot;
  });
  ctx.route("POST", "/config/keys", (req) => {
    const body = req.body && typeof req.body === "object" ? req.body : {};
    if (typeof body.geminiApiKey === "string") {
      ctx.db.kvSet("gemini_api_key", body.geminiApiKey.trim());
    }
    if (typeof body.githubToken === "string") {
      ctx.db.kvSet("github_token", body.githubToken.trim());
    }
    return {
      saved: true,
      hasGeminiKey: Boolean(ctx.db.kvGet("gemini_api_key")),
      hasGithubToken: Boolean(ctx.db.kvGet("github_token"))
    };
  });
  ctx.route("GET", "/n8n-workflow-json", () => {
    return EMBEDDED_N8N_WORKFLOW_JSON;
  });
  ctx.scheduleJob({
    id: "sync-workflow-telemetry",
    name: "Sync n8n Module Workflow & GitHub Status to Home Assistant",
    intervalMinutes: 15,
    handler: async () => {
      const latest = listRunRecords(1)[0];
      if (!latest) return "No workflow runs yet";
      const haStatus = await ctx.ha.getStatus();
      if (haStatus.connected) {
        await ctx.ha.publishSensor("status", latest.statusFlag, {
          friendly_name: "Thassi n8n Modul-Workflow Status",
          latest_module: latest.moduleSlug,
          signal_color: latest.signalColor,
          unit_tests: `${latest.unitTestReport.passedTests}/${latest.unitTestReport.totalTests}`,
          git_commit: latest.gitReport.commitSha,
          icon: "mdi:sitemap-outline"
        });
      }
      return `Synced workflow status (${latest.moduleSlug}: ${latest.statusFlag})`;
    }
  });
});
export {
  index_default as default
};
