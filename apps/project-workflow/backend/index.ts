import { defineThassiApp } from '@thassi/sdk';
import {
  MODULE_TEMPLATE_PRESETS,
  type ModuleTemplateForm,
  type WorkflowExecutionRecord,
} from '../shared/workflow-types.js';
import { fetchGitHubRepositorySnapshot } from './github-client.js';
import {
  checkEcosystemCompatibility,
  createInitialNodeStates,
  executeN8nModuleWorkflow,
  runPythonUnitTestsForModule,
  synthesizePythonModuleFiles,
  validateTemplateInput,
} from './n8n-engine.js';

const EMBEDDED_N8N_WORKFLOW_JSON = {
  name: 'Thassi — Home Assistant Python Modul-Workflow (Gemini + Git + SSH/Samba)',
  nodes: [
    {
      id: 'node-webhook-trigger',
      name: '1. Webhook Trigger (Template Input)',
      type: 'n8n-nodes-base.webhook',
      position: [180, 320],
      parameters: { httpMethod: 'POST', path: 'ha-module-generator', responseMode: 'lastNode' },
    },
    {
      id: 'node-template-validator',
      name: '2. Template Validator & Prompt Builder',
      type: 'n8n-nodes-base.code',
      position: [440, 320],
      parameters: { mode: 'runOnceForAllItems' },
    },
    {
      id: 'node-gemini-http',
      name: '3. Gemini API Code Generator (HTTP Request)',
      type: 'n8n-nodes-base.httpRequest',
      position: [720, 320],
      parameters: {
        method: 'POST',
        url: 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent',
      },
    },
    {
      id: 'node-python-unittest',
      name: '4. Python AST & Unit-Test Runner',
      type: 'n8n-nodes-base.executeCommand',
      position: [1000, 320],
      parameters: {
        command: 'python -m unittest discover -s python_modules/<slug> -p "test_*.py" -v',
      },
    },
    {
      id: 'node-git-vcs',
      name: '5. Git Version Control (Commit & Push)',
      type: 'n8n-nodes-base.git',
      position: [1280, 320],
      parameters: { operation: 'commit', repositoryPath: 'c:/Users/thoma/source/repos/thassi' },
    },
    {
      id: 'node-ssh-samba-deploy',
      name: '6. SSH / Samba Home Assistant Deploy (192.168.188.92)',
      type: 'n8n-nodes-base.ssh',
      position: [1560, 320],
      parameters: {
        command: 'cp -r ./python_modules/<slug>/* /config/custom_components/<slug>/',
      },
    },
  ],
};

export default defineThassiApp((ctx) => {
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

  function saveRunRecord(record: WorkflowExecutionRecord) {
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
        JSON.stringify(record),
      ]
    );
    ctx.sharedDb.kvSet('project_workflow_summary', {
      latestRunId: record.runId,
      moduleSlug: record.moduleSlug,
      moduleName: record.moduleName,
      status: record.status,
      signalColor: record.signalColor,
      statusFlag: record.statusFlag,
      passedTests: record.unitTestReport.passedTests,
      totalTests: record.unitTestReport.totalTests,
      updatedAt: record.finishedAt || record.startedAt,
    });
  }

  function listRunRecords(limit = 15): WorkflowExecutionRecord[] {
    const rows = ctx.db.query<{ payload_json: string }>(
      'SELECT payload_json FROM workflow_runs ORDER BY started_at DESC LIMIT ?',
      [limit]
    );
    const out: WorkflowExecutionRecord[] = [];
    for (const r of rows) {
      try {
        out.push(JSON.parse(r.payload_json) as WorkflowExecutionRecord);
      } catch {}
    }
    return out;
  }

  // Seed initial verified run asynchronously if database is empty
  const existingRuns = listRunRecords(1);
  if (existingRuns.length === 0) {
    void executeN8nModuleWorkflow(MODULE_TEMPLATE_PRESETS[0].template, ctx)
      .then((initialRun) => saveRunRecord(initialRun))
      .catch(() => {});
  }

  // 1. Dashboard Overview Endpoint (Ecosystem + Presets + Latest Runs + N8n Definition)
  ctx.route('GET', '/overview', async (req) => {
    const customGeminiKey = ctx.db.kvGet<string>('gemini_api_key') || '';
    const customGithubToken = ctx.db.kvGet<string>('github_token') || '';
    const [ecosystem, github] = await Promise.all([
      checkEcosystemCompatibility(customGeminiKey),
      fetchGitHubRepositorySnapshot({
        githubToken: customGithubToken,
        forceRefresh: req.query.refresh === '1',
      }),
    ]);
    const runs = listRunRecords(15);
    const latestRun = runs[0] || null;

    return {
      ecosystem,
      presets: MODULE_TEMPLATE_PRESETS,
      latestRun,
      runs,
      defaultNodes: createInitialNodeStates(),
      n8nWorkflowJson: EMBEDDED_N8N_WORKFLOW_JSON,
      github,
    };
  });

  // 2. n8n Webhook Trigger & Workflow Execution Endpoint
  const handleWorkflowTrigger = async (req: { body: unknown; query: Record<string, string> }) => {
    const bodyObj = (req.body && typeof req.body === 'object' ? req.body : {}) as Record<string, any>;
    const templateInput = bodyObj.template || bodyObj;
    const simulateError = String(bodyObj.simulateError || req.query.simulateError || '').trim();

    // Pre-validate for strict HTTP 400 error verification when invalid payload is sent
    const validation = validateTemplateInput(templateInput);
    if (!validation.valid) {
      const failedRun = await executeN8nModuleWorkflow(templateInput, ctx, { simulateError });
      saveRunRecord(failedRun);
      return {
        status: 400,
        body: {
          ok: false,
          error: 'Template validation failed',
          validationErrors: validation.errors,
          run: failedRun,
        },
      };
    }

    const customGeminiKey = ctx.db.kvGet<string>('gemini_api_key') || '';
    const record = await executeN8nModuleWorkflow(validation.normalized, ctx, {
      customGeminiKey,
      simulateError,
    });
    saveRunRecord(record);

    const httpStatus = record.status === 'failed' ? 502 : 200;
    return {
      status: httpStatus,
      body: {
        ok: record.status !== 'failed',
        run: record,
      },
    };
  };

  ctx.route('POST', '/workflow/execute', handleWorkflowTrigger);
  ctx.route('POST', '/webhook/trigger', handleWorkflowTrigger);

  // 3. Standalone Python Unit-Test Runner Endpoint (Phase 5)
  ctx.route('POST', '/tests/run', (req) => {
    const body = (req.body && typeof req.body === 'object' ? req.body : {}) as {
      slug?: string;
      template?: ModuleTemplateForm;
    };
    const template =
      body.template ||
      MODULE_TEMPLATE_PRESETS.find((p) => p.id === body.slug)?.template ||
      MODULE_TEMPLATE_PRESETS[0].template;
    const validation = validateTemplateInput(template);
    if (!validation.valid) {
      return {
        status: 400,
        body: { ok: false, error: validation.errors.join('; ') },
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
      report,
    };
  });

  // 4. GitHub Repository & Commit Query Endpoint (Phase 4)
  ctx.route('GET', '/github/status', async (req) => {
    const customGithubToken = ctx.db.kvGet<string>('github_token') || '';
    const snapshot = await fetchGitHubRepositorySnapshot({
      owner: req.query.owner || 'tsimhofer',
      repo: req.query.repo || 'thassi',
      githubToken: customGithubToken,
      forceRefresh: req.query.refresh === '1' || req.query.refresh === 'true',
      simulateError: req.query.simulateError,
    });
    return snapshot;
  });

  // 5. Save API Keys (Gemini API Key / GitHub Personal Access Token)
  ctx.route('POST', '/config/keys', (req) => {
    const body = (req.body && typeof req.body === 'object' ? req.body : {}) as {
      geminiApiKey?: string;
      githubToken?: string;
    };
    if (typeof body.geminiApiKey === 'string') {
      ctx.db.kvSet('gemini_api_key', body.geminiApiKey.trim());
    }
    if (typeof body.githubToken === 'string') {
      ctx.db.kvSet('github_token', body.githubToken.trim());
    }
    return {
      saved: true,
      hasGeminiKey: Boolean(ctx.db.kvGet<string>('gemini_api_key')),
      hasGithubToken: Boolean(ctx.db.kvGet<string>('github_token')),
    };
  });

  // 6. Export n8n Workflow JSON
  ctx.route('GET', '/n8n-workflow-json', () => {
    return EMBEDDED_N8N_WORKFLOW_JSON;
  });

  // 7. Scheduled Background Sync Job for Home Assistant Sensor
  ctx.scheduleJob({
    id: 'sync-workflow-telemetry',
    name: 'Sync n8n Module Workflow & GitHub Status to Home Assistant',
    intervalMinutes: 15,
    handler: async () => {
      const latest = listRunRecords(1)[0];
      if (!latest) return 'No workflow runs yet';
      const haStatus = await ctx.ha.getStatus();
      if (haStatus.connected) {
        await ctx.ha.publishSensor('status', latest.statusFlag, {
          friendly_name: 'Thassi n8n Modul-Workflow Status',
          latest_module: latest.moduleSlug,
          signal_color: latest.signalColor,
          unit_tests: `${latest.unitTestReport.passedTests}/${latest.unitTestReport.totalTests}`,
          git_commit: latest.gitReport.commitSha,
          icon: 'mdi:sitemap-outline',
        });
      }
      return `Synced workflow status (${latest.moduleSlug}: ${latest.statusFlag})`;
    },
  });
});
