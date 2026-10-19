import assert from 'node:assert/strict';
import path from 'node:path';
import {
  ThassiAppDatabase,
  ThassiCronScheduler,
  ThassiGoogleOAuthManager,
  ThassiHaBridge,
  type ThassiAppContext,
} from '../../../packages/sdk/src/index.js';
import { MODULE_TEMPLATE_PRESETS } from '../shared/workflow-types.js';
import { fetchGitHubRepositorySnapshot } from './github-client.js';
import {
  checkEcosystemCompatibility,
  executeN8nModuleWorkflow,
  runPythonUnitTestsForModule,
  synthesizePythonModuleFiles,
  validateTemplateInput,
} from './n8n-engine.js';

async function runPhase5Verification() {
  console.log('=== PHASE 5: QUALITÄTSSICHERUNG & STABILITÄTS-VERIFIKATION ===\n');

  // 1. Ecosystem Compatibility Check
  const eco = await checkEcosystemCompatibility();
  assert.equal(eco.pythonAvailable, true, 'Python runtime must be available');
  assert.equal(eco.n8nWebhookReady, true, 'n8n webhook must be ready');
  console.log(`[PASS] 1. Ökosystem-Analyse: ${eco.pythonVersion} | ${eco.gitVersion} | Samba=${eco.hassSambaOnline}`);

  // 2. Template Validation & Error Handling
  const invalidCheck = validateTemplateInput({
    objectives: {
      slug: 'INVALID SLUG!',
      name: '',
      pollingIntervalSeconds: 1,
      targetEntities: [],
    },
  });
  assert.equal(invalidCheck.valid, false, 'Invalid template must be rejected');
  assert.ok(invalidCheck.errors.length >= 3, 'Must report all validation errors');
  console.log(`[PASS] 2. Template-Fehlerbehandlung: ${invalidCheck.errors.length} Validierungsfehler sauber erkannt.`);

  // 3. Generate & Run Python Unit Tests for all 3 Preset Modules
  for (const preset of MODULE_TEMPLATE_PRESETS) {
    const files = synthesizePythonModuleFiles(preset.template);
    const report = runPythonUnitTestsForModule(
      preset.template.objectives.slug,
      process.cwd(),
      files
    );
    assert.equal(report.passed, true, `Python unit tests must pass for ${preset.id}`);
    assert.equal(report.astValid, true, `Python AST check must pass for ${preset.id}`);
    assert.equal(report.passedTests, 4, `All 4 unit tests must pass for ${preset.id}`);
    console.log(
      `[PASS] 3. Python Unit-Tests (${preset.id}): ${report.passedTests}/${report.totalTests} PASS (${report.durationMs} ms)`
    );
  }

  // 4. n8n 6-Node Pipeline Execution + API Error Simulation
  const tmpDbPath = path.join(process.cwd(), 'data', 'test_phase5_workflow.db');
  const db = new ThassiAppDatabase(tmpDbPath);
  const scheduler = new ThassiCronScheduler();
  const ha = new ThassiHaBridge('project-workflow', db);
  const google = new ThassiGoogleOAuthManager(db);
  const ctx: ThassiAppContext = {
    appId: 'project-workflow',
    db,
    sharedDb: db,
    ha,
    google,
    scheduleJob: (j) => scheduler.registerJob('project-workflow', j),
    route: () => {},
  };

  const normalRun = await executeN8nModuleWorkflow(MODULE_TEMPLATE_PRESETS[0].template, ctx);
  assert.ok(
    normalRun.status === 'completed' || normalRun.status === 'warning',
    'Normal n8n workflow run must succeed'
  );
  assert.equal(normalRun.nodes.length, 6, 'Must execute all 6 n8n workflow nodes');
  console.log(
    `[PASS] 4a. n8n-Workflow Normaldurchlauf: Status=${normalRun.statusFlag} | Signal=${normalRun.signalColor} (${normalRun.totalDurationMs} ms)`
  );

  const rateLimitRun = await executeN8nModuleWorkflow(MODULE_TEMPLATE_PRESETS[0].template, ctx, {
    simulateError: 'gemini_http_429',
  });
  assert.equal(rateLimitRun.nodes[2].signalColor, 'amber', 'HTTP 429 must set Gemini node signalColor to amber');
  assert.equal(rateLimitRun.nodes[2].statusFlag, 'GEMINI_429_FALLBACK');
  assert.equal(rateLimitRun.unitTestReport.passed, true, 'Fallback Python code must still pass all unit tests');
  console.log(
    `[PASS] 4b. Gemini HTTP 429 Fehlerbehandlung: Node 3 Flag=${rateLimitRun.nodes[2].statusFlag} (Signal=${rateLimitRun.nodes[2].signalColor})`
  );

  const fatalRun = await executeN8nModuleWorkflow(MODULE_TEMPLATE_PRESETS[0].template, ctx, {
    simulateError: 'gemini_fatal',
  });
  assert.equal(fatalRun.status, 'failed', 'Fatal API error must mark run as failed');
  assert.equal(fatalRun.signalColor, 'red', 'Fatal API error must set signalColor to red');
  console.log(
    `[PASS] 4c. Kritischer API-Fehler & Rollback-Schutz: Status=${fatalRun.statusFlag} (Signal=${fatalRun.signalColor})`
  );

  // 5. GitHub API Live Query & Rate-Limit Fallback Verification
  const ghLive = await fetchGitHubRepositorySnapshot({ owner: 'tsimhofer', repo: 'thassi' });
  assert.equal(ghLive.primaryRepo.fullName.toLowerCase(), 'tsimhofer/thassi');
  assert.ok(ghLive.repositories.length >= 1, 'Must return repositories list');
  assert.ok(ghLive.recentCommits.length >= 1, 'Must return recent commits');
  console.log(
    `[PASS] 5a. GitHub API Abfrage (${ghLive.source}): ${ghLive.repositories.length} Repos, ${ghLive.recentCommits.length} Commits, Flag=${ghLive.statusFlag}`
  );

  const ghRateLimit = await fetchGitHubRepositorySnapshot({
    owner: 'tsimhofer',
    repo: 'thassi',
    simulateError: 'rate_limit',
  });
  assert.equal(ghRateLimit.statusFlag, 'GITHUB_RATE_LIMIT_FALLBACK');
  assert.equal(ghRateLimit.signalColor, 'amber');
  console.log(
    `[PASS] 5b. GitHub API Rate-Limit Fallback: Flag=${ghRateLimit.statusFlag} (Signal=${ghRateLimit.signalColor})`
  );

  console.log('\n🎉 ALLE PHASE-5-QUALITÄTSPRÜFUNGEN ERFOLGREICH BESTANDEN!');
}

runPhase5Verification().catch((err) => {
  console.error('❌ Phase 5 Verification Failed:', err);
  process.exit(1);
});
