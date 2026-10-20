import {
  defineThassiApp,
  ThassiActionRegistry,
  PcAgentReverseBridge,
  discoverGeminiApiKeyFromHass,
} from '@thassi/sdk';
import {
  STARTER_NODE_PALETTE,
  DEFAULT_STARTER_WORKFLOWS,
  SavedWorkflow,
  CanvasWorkflowNode,
  NodeExecutionResult,
  WorkflowRunReport,
  NodePaletteTemplate,
  ApiCredentialsStatus,
} from '../shared/types.js';

export default defineThassiApp((ctx) => {
  const actionRegistry = new ThassiActionRegistry(ctx.sharedDb, ctx.ha, ctx.google);
  (ctx as any).actions = actionRegistry;
  function getSavedWorkflows(): SavedWorkflow[] {
    const stored = ctx.db.kvGet<SavedWorkflow[]>('saved_workflows');
    if (stored && Array.isArray(stored) && stored.length > 0) {
      return stored;
    }
    ctx.db.kvSet('saved_workflows', DEFAULT_STARTER_WORKFLOWS);
    return DEFAULT_STARTER_WORKFLOWS;
  }

  function getCustomNodeTemplates(): NodePaletteTemplate[] {
    return ctx.db.kvGet<NodePaletteTemplate[]>('custom_node_templates', []) || [];
  }

  function getCredentials() {
    let geminiApiKey = (
      ctx.db.kvGet<string>('gemini_api_key') ||
      ctx.sharedDb.kvGet<string>('gemini_api_key') ||
      process.env.GEMINI_API_KEY ||
      discoverGeminiApiKeyFromHass() ||
      ''
    ).trim();
    if (geminiApiKey && !ctx.sharedDb.kvGet<string>('gemini_api_key')) {
      try {
        ctx.sharedDb.kvSet('gemini_api_key', geminiApiKey);
      } catch {}
    }
    const githubToken = (
      ctx.db.kvGet<string>('github_token') ||
      ctx.sharedDb.kvGet<string>('github_token') ||
      process.env.GITHUB_TOKEN ||
      ''
    ).trim();
    const googleOAuthToken = (
      ctx.db.kvGet<string>('google_oauth_token') ||
      ctx.sharedDb.kvGet<string>('google_oauth_token') ||
      process.env.GOOGLE_OAUTH_TOKEN ||
      ''
    ).trim();

    return {
      geminiApiKey,
      githubToken,
      googleOAuthToken,
    };
  }

  /**
   * Executes a single workflow node by delegating directly to the central
   * `ctx.actions` (ThassiActionRegistry) with zero mock/dummy fallbacks.
   */
  async function executeSingleNode(
    node: CanvasWorkflowNode,
    upstreamText: string
  ): Promise<NodeExecutionResult> {
    const creds = getCredentials();

    // Custom HTTP / API nodes (created via POST /custom-nodes) have typeId 'custom.<timestamp>'
    const isCustom = node.typeId.startsWith('custom.');
    const actionId =
      isCustom ? 'http.request' : node.typeId === 'gemini.decide' ? 'gemini.generate' : node.typeId;

    const actionResult = await actionRegistry.execute(actionId, node.config || {}, {
      upstreamText,
      credentials: creds,
    });

    return {
      nodeId: node.id,
      nodeName: node.name,
      category: node.category,
      status: actionResult.status,
      durationMs: Math.max(1, actionResult.durationMs),
      outputSummary: actionResult.summary,
      outputData: actionResult.data,
    };
  }

  /**
   * Topologically sorts workflow nodes using Kahn's algorithm along `workflow.edges`,
   * breaking ties by visual X/Y coordinate.
   */
  function topologicalSortNodes(workflow: SavedWorkflow): CanvasWorkflowNode[] {
    const nodesById = new Map(workflow.nodes.map((n) => [n.id, n]));
    const inDegree = new Map<string, number>();
    const adjacency = new Map<string, string[]>();

    for (const n of workflow.nodes) {
      inDegree.set(n.id, 0);
      adjacency.set(n.id, []);
    }

    for (const edge of workflow.edges || []) {
      if (nodesById.has(edge.sourceNodeId) && nodesById.has(edge.targetNodeId)) {
        adjacency.get(edge.sourceNodeId)!.push(edge.targetNodeId);
        inDegree.set(edge.targetNodeId, (inDegree.get(edge.targetNodeId) || 0) + 1);
      }
    }

    const queue = workflow.nodes
      .filter((n) => (inDegree.get(n.id) || 0) === 0)
      .sort((a, b) => a.x - b.x || a.y - b.y);

    const ordered: CanvasWorkflowNode[] = [];
    const visited = new Set<string>();

    while (queue.length > 0) {
      const current = queue.shift()!;
      if (visited.has(current.id)) continue;
      visited.add(current.id);
      ordered.push(current);

      for (const nextId of adjacency.get(current.id) || []) {
        const nextDeg = (inDegree.get(nextId) || 1) - 1;
        inDegree.set(nextId, nextDeg);
        if (nextDeg <= 0 && !visited.has(nextId)) {
          const nextNode = nodesById.get(nextId);
          if (nextNode) {
            queue.push(nextNode);
            queue.sort((a, b) => a.x - b.x || a.y - b.y);
          }
        }
      }
    }

    // Include any remaining nodes if there was a cycle
    for (const n of [...workflow.nodes].sort((a, b) => a.x - b.x || a.y - b.y)) {
      if (!visited.has(n.id)) {
        ordered.push(n);
      }
    }

    return ordered;
  }

  async function executeFullWorkflow(wf: SavedWorkflow): Promise<WorkflowRunReport> {
    const startedAt = new Date().toISOString();
    const nodeResults: Record<string, NodeExecutionResult> = {};
    const nodeOutputsText: Record<string, string> = {};

    const sortedNodes = topologicalSortNodes(wf);

    for (const node of sortedNodes) {
      const incomingEdges = (wf.edges || []).filter((e) => e.targetNodeId === node.id);
      const upstreamParts = incomingEdges
        .map((e) => nodeOutputsText[e.sourceNodeId])
        .filter(Boolean);
      const upstreamInput = upstreamParts.join('\n\n');

      const res = await executeSingleNode(node, upstreamInput);
      nodeResults[node.id] = res;

      const dataObj = res.outputData as Record<string, any> | undefined;
      nodeOutputsText[node.id] =
        typeof dataObj?.response === 'string'
          ? dataObj.response
          : typeof dataObj?.formattedText === 'string'
            ? dataObj.formattedText
            : res.outputSummary;
    }

    const report: WorkflowRunReport = {
      runId: `run-${Date.now()}`,
      workflowId: wf.id,
      workflowName: wf.name,
      startedAt,
      finishedAt: new Date().toISOString(),
      status: Object.values(nodeResults).some((r) => r.status === 'error')
        ? 'error'
        : 'success',
      nodeResults,
    };

    ctx.db.kvSet(`workflow_last_run_${wf.id}`, report);
    return report;
  }

  /**
   * Registers background cron jobs for any saved workflow that contains a `trigger.schedule` node.
   */
  function syncScheduledWorkflowJobs(): void {
    const workflows = getSavedWorkflows();
    for (const wf of workflows) {
      const scheduleNode = wf.nodes.find((n) => n.typeId === 'trigger.schedule');
      if (scheduleNode) {
        const intervalMin = Math.max(
          1,
          Math.round(Number(scheduleNode.config?.intervalSeconds || 900) / 60)
        );
        ctx.scheduleJob({
          id: `wf-schedule-${wf.id}`,
          name: `Scheduled Workflow: ${wf.name}`,
          description: `Scheduled Workflow: ${wf.name}`,
          intervalMinutes: intervalMin,
          runOnStart: false,
          handler: async () => {
            await executeFullWorkflow(wf);
          },
        });
      }
    }
  }

  syncScheduledWorkflowJobs();

  // Dynamic Registry Palette conversion so any new Action in @thassi/sdk appears automatically
  function getDynamicPalette(): NodePaletteTemplate[] {
    const customNodes = getCustomNodeTemplates();
    const starterIds = new Set(STARTER_NODE_PALETTE.map((p) => p.typeId));
    const registryExtras: NodePaletteTemplate[] = actionRegistry
      .listActions()
      .filter((a) => !starterIds.has(a.id))
      .map((a) => ({
        typeId: a.id,
        category: (
          ['trigger', 'homeassistant', 'github', 'gcal', 'gmail', 'gemini', 'custom'].includes(
            a.category
          )
            ? a.category
            : 'custom'
        ) as NodePaletteTemplate['category'],
        categoryLabel: a.category.toUpperCase(),
        name: a.name,
        subtitle: a.description,
        icon: a.icon,
        accentColor: '#14b8a6',
        n8nType: `thassi.${a.id}`,
        defaultConfig: a.defaultInput,
        fields: a.fields.map((f) => ({
          key: f.key,
          label: f.label,
          type: (f.type === 'number' || f.type === 'boolean' ? 'text' : f.type) as
            | 'text'
            | 'textarea'
            | 'select',
          placeholder: f.placeholder,
          options: f.options ? f.options.map((opt) => ({ label: opt, value: opt })) : undefined,
        })),
      }));

    return [...STARTER_NODE_PALETTE, ...registryExtras, ...customNodes];
  }

  // GET /bootstrap — returns palette, saved workflows, and API key status
  ctx.route('GET', '/bootstrap', async () => {
    const workflows = getSavedWorkflows();
    const creds = getCredentials();
    const googleStatus = ctx.google.getStatus();

    let haEntities: Array<{ entityId: string; friendlyName: string; state: string }> = [];
    try {
      const states = await ctx.ha.getStates();
      haEntities = states.slice(0, 80).map((s) => ({
        entityId: s.entity_id,
        friendlyName: String(s.attributes?.friendly_name || s.entity_id),
        state: s.state,
      }));
    } catch {}

    const credentialsStatus: ApiCredentialsStatus = {
      geminiConfigured: Boolean(creds.geminiApiKey),
      githubConfigured: Boolean(creds.githubToken),
      googleConfigured: Boolean(creds.googleOAuthToken || googleStatus.authorized),
      haConfigured: haEntities.length > 0,
      haUrl: process.env.HA_URL || 'http://192.168.188.92:8123',
    };

    return {
      axons: actionRegistry.listActions(),
      palette: getDynamicPalette(),
      workflows,
      credentialsStatus,
      haEntities,
    };
  });

  // POST /execute-axon — directly execute an atomic Axon by ID and return full telemetry
  ctx.route('POST', '/execute-axon', async (req) => {
    const body = (req.body && typeof req.body === 'object' ? req.body : {}) as {
      axonId?: string;
      input?: Record<string, any>;
      upstreamText?: string;
    };
    if (!body.axonId) {
      return { ok: false, error: 'Missing axonId' };
    }
    const creds = getCredentials();
    const result = await actionRegistry.execute(body.axonId, body.input || {}, {
      upstreamText: body.upstreamText,
      credentials: creds,
    });
    return {
      ok: result.status === 'success',
      result,
      axons: actionRegistry.listActions(),
    };
  });

  // POST /workflows — save or update a workflow
  ctx.route('POST', '/workflows', async (req) => {
    const body = (req.body && typeof req.body === 'object' ? req.body : {}) as {
      workflow?: SavedWorkflow;
    };
    if (!body.workflow || !body.workflow.id) {
      return { ok: false, error: 'Missing workflow object' };
    }

    const existing = getSavedWorkflows();
    const updated: SavedWorkflow = {
      ...body.workflow,
      updatedAt: new Date().toISOString(),
    };
    const idx = existing.findIndex((w) => w.id === updated.id);
    if (idx >= 0) {
      existing[idx] = updated;
    } else {
      existing.unshift(updated);
    }
    ctx.db.kvSet('saved_workflows', existing);
    syncScheduledWorkflowJobs();
    return { ok: true, workflows: existing, saved: updated };
  });

  // POST /workflows/delete — delete a workflow by id
  ctx.route('POST', '/workflows/delete', async (req) => {
    const body = (req.body && typeof req.body === 'object' ? req.body : {}) as {
      workflowId?: string;
    };
    const existing = getSavedWorkflows().filter((w) => w.id !== body.workflowId);
    const finalWorkflows = existing.length > 0 ? existing : DEFAULT_STARTER_WORKFLOWS;
    ctx.db.kvSet('saved_workflows', finalWorkflows);
    syncScheduledWorkflowJobs();
    return { ok: true, workflows: finalWorkflows };
  });

  // POST /custom-nodes — create a new custom HTTP/API node in the palette
  ctx.route('POST', '/custom-nodes', async (req) => {
    const body = (req.body && typeof req.body === 'object' ? req.body : {}) as {
      name?: string;
      category?: NodePaletteTemplate['category'];
      subtitle?: string;
      icon?: string;
      endpointOrHint?: string;
    };
    if (!body.name?.trim()) {
      return { ok: false, error: 'Missing node name' };
    }

    const customNodes = getCustomNodeTemplates();
    const newTemplate: NodePaletteTemplate = {
      typeId: `custom.${Date.now()}`,
      category: body.category || 'custom',
      categoryLabel: 'Custom HTTP Nodes',
      name: body.name.trim(),
      subtitle: (body.subtitle || 'Live HTTP API Connector').trim(),
      icon: body.icon || '🧩',
      accentColor: '#ec4899',
      n8nType: 'n8n-nodes-base.httpRequest',
      defaultConfig: {
        method: 'GET',
        endpoint: body.endpointOrHint || 'http://192.168.188.92:8099/healthz',
        headersJson: '{}',
        payload: '{{$input}}',
      },
      fields: [
        {
          key: 'method',
          label: 'HTTP Method',
          type: 'select',
          options: [
            { label: 'GET', value: 'GET' },
            { label: 'POST', value: 'POST' },
            { label: 'PUT', value: 'PUT' },
            { label: 'DELETE', value: 'DELETE' },
          ],
        },
        { key: 'endpoint', label: 'API URL / Endpoint', type: 'text' },
        { key: 'headersJson', label: 'Headers (JSON)', type: 'textarea' },
        { key: 'payload', label: 'Payload ({{$input}})', type: 'textarea' },
      ],
    };

    customNodes.push(newTemplate);
    ctx.db.kvSet('custom_node_templates', customNodes);
    return {
      ok: true,
      palette: getDynamicPalette(),
      created: newTemplate,
    };
  });

  // POST /credentials — save API keys in both app DB and sharedDb so all apps/actions share them
  ctx.route('POST', '/credentials', async (req) => {
    const body = (req.body && typeof req.body === 'object' ? req.body : {}) as {
      geminiApiKey?: string;
      githubToken?: string;
      googleOAuthToken?: string;
    };
    if (typeof body.geminiApiKey === 'string' && body.geminiApiKey.trim()) {
      const k = body.geminiApiKey.trim();
      ctx.db.kvSet('gemini_api_key', k);
      ctx.sharedDb.kvSet('gemini_api_key', k);
    }
    if (typeof body.githubToken === 'string' && body.githubToken.trim()) {
      const t = body.githubToken.trim();
      ctx.db.kvSet('github_token', t);
      ctx.sharedDb.kvSet('github_token', t);
    }
    if (typeof body.googleOAuthToken === 'string' && body.googleOAuthToken.trim()) {
      const g = body.googleOAuthToken.trim();
      ctx.db.kvSet('google_oauth_token', g);
      ctx.sharedDb.kvSet('google_oauth_token', g);
    }
    const creds = getCredentials();
    const googleStatus = ctx.google.getStatus();
    return {
      ok: true,
      credentialsStatus: {
        geminiConfigured: Boolean(creds.geminiApiKey),
        githubConfigured: Boolean(creds.githubToken),
        googleConfigured: Boolean(creds.googleOAuthToken || googleStatus.authorized),
        haConfigured: true,
        haUrl: process.env.HA_URL || 'http://192.168.188.92:8123',
      },
    };
  });

  // POST /execute-node — test a single node via ThassiActionRegistry
  ctx.route('POST', '/execute-node', async (req) => {
    const body = (req.body && typeof req.body === 'object' ? req.body : {}) as {
      node?: CanvasWorkflowNode;
      sampleInput?: string;
    };
    if (!body.node) {
      return { ok: false, error: 'Missing node' };
    }
    const result = await executeSingleNode(
      body.node,
      body.sampleInput || 'Sample upstream data from previous node'
    );
    return { ok: true, result };
  });

  // POST /execute-workflow — execute all nodes in topological graph order
  ctx.route('POST', '/execute-workflow', async (req) => {
    const body = (req.body && typeof req.body === 'object' ? req.body : {}) as {
      workflow?: SavedWorkflow;
    };
    const wf = body.workflow;
    if (!wf || !Array.isArray(wf.nodes)) {
      return { ok: false, error: 'Invalid workflow' };
    }
    const report = await executeFullWorkflow(wf);
    return { ok: true, report };
  });

  // =========================================================================
  // PC AGENT REVERSE BRIDGE (DESKTOP-M8TJERB <-> Home Assistant / Axons)
  // =========================================================================
  ctx.route('POST', '/pc-bridge/sync', async (req) => {
    const body = (req.body && typeof req.body === 'object' ? req.body : {}) as {
      status?: Record<string, any>;
      frameBase64?: string;
      monitor?: string;
    };
    return PcAgentReverseBridge.ingestSync(body);
  });

  ctx.route('POST', '/pc-bridge/result', async (req) => {
    const body = (req.body && typeof req.body === 'object' ? req.body : {}) as {
      id?: string;
      result?: Record<string, any>;
      error?: string;
    };
    if (body.id) {
      PcAgentReverseBridge.resolveCommand(body.id, body.result || {}, body.error);
    }
    return { ok: true };
  });

  ctx.route('GET', '/pc-bridge/frame', async () => {
    return {
      ok: Boolean(PcAgentReverseBridge.latestFrameJpeg),
      lastSeenAt: PcAgentReverseBridge.lastSeenAt,
      requestedMonitor: PcAgentReverseBridge.requestedMonitor,
      status: PcAgentReverseBridge.latestStatus,
      frameDataUrl: PcAgentReverseBridge.latestFrameJpeg
        ? `data:image/jpeg;base64,${PcAgentReverseBridge.latestFrameJpeg.toString('base64')}`
        : null,
    };
  });

  ctx.route('POST', '/pc-bridge/input', async (req) => {
    const body = (req.body && typeof req.body === 'object' ? req.body : {}) as Record<string, any>;
    if (body.setMonitor) {
      PcAgentReverseBridge.requestedMonitor = String(body.setMonitor);
      return { ok: true, requestedMonitor: PcAgentReverseBridge.requestedMonitor };
    }
    const res = await PcAgentReverseBridge.callEndpoint(
      'http://192.168.188.46:5185',
      '/api/screen/input',
      {
        ...body,
        monitor: body.monitor || PcAgentReverseBridge.requestedMonitor,
      },
      4000
    );
    return { ok: true, result: res };
  });

  // =========================================================================
  // GOOGLE OAUTH FULL-SCOPE AUTHORIZATION (via localhost:5185 or nip.io)
  // =========================================================================
  const FULL_GOOGLE_SCOPES = [
    'https://www.googleapis.com/auth/calendar',
    'https://www.googleapis.com/auth/calendar.events',
    'https://www.googleapis.com/auth/fitness.activity.read',
    'https://www.googleapis.com/auth/fitness.body.read',
    'https://www.googleapis.com/auth/fitness.sleep.read',
    'https://www.googleapis.com/auth/gmail.readonly',
    'https://www.googleapis.com/auth/gmail.send',
    'https://www.googleapis.com/auth/drive.readonly',
    'https://www.googleapis.com/auth/youtube.readonly',
  ];

  ctx.route('GET', '/google-oauth/url', async (req) => {
    const redirectUri =
      req.query.redirectUri || 'http://localhost:5185/api/google/callback';
    const cur = ctx.google.getConfig();
    ctx.google.saveConfig({
      clientId: cur?.clientId || process.env.GOOGLE_CLIENT_ID || '',
      clientSecret: cur?.clientSecret || process.env.GOOGLE_CLIENT_SECRET || '',
      redirectUri,
      scopes: FULL_GOOGLE_SCOPES,
    });
    const authUrl = ctx.google.getAuthorizationUrl(FULL_GOOGLE_SCOPES);
    return {
      ok: true,
      redirectUri,
      scopes: FULL_GOOGLE_SCOPES,
      authUrl,
    };
  });

  ctx.route('POST', '/google-oauth/exchange', async (req) => {
    const body = (req.body && typeof req.body === 'object' ? req.body : {}) as {
      code?: string;
      redirectUri?: string;
    };
    if (!body.code) {
      return { ok: false, error: 'Missing OAuth code' };
    }
    if (body.redirectUri) {
      ctx.google.saveConfig({ redirectUri: body.redirectUri, scopes: FULL_GOOGLE_SCOPES });
    }
    const status = await ctx.google.exchangeCode(body.code);
    const tokens = ctx.google.getTokens();
    if (tokens?.accessToken) {
      ctx.db.kvSet('google_oauth_token', tokens.accessToken);
      ctx.sharedDb.kvSet('google_oauth_token', tokens.accessToken);
    }
    return { ok: true, status };
  });
});
