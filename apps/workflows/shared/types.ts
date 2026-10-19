export type IntegrationCategory =
  | 'trigger'
  | 'gemini'
  | 'gmail'
  | 'gcal'
  | 'github'
  | 'homeassistant'
  | 'custom';

export interface NodePaletteTemplate {
  typeId: string;
  category: IntegrationCategory;
  categoryLabel: string;
  name: string;
  subtitle: string;
  icon: string;
  accentColor: string;
  n8nType: string;
  defaultConfig: Record<string, string>;
  fields: Array<{
    key: string;
    label: string;
    type: 'text' | 'textarea' | 'select';
    placeholder?: string;
    options?: Array<{ label: string; value: string }>;
  }>;
}

export interface CanvasWorkflowNode {
  id: string;
  typeId: string;
  category: IntegrationCategory;
  name: string;
  subtitle: string;
  icon: string;
  accentColor: string;
  n8nType: string;
  x: number;
  y: number;
  config: Record<string, string>;
  lastStatus?: 'idle' | 'running' | 'success' | 'error';
  lastOutput?: string;
  lastDurationMs?: number;
}

export interface CanvasWorkflowEdge {
  id: string;
  sourceNodeId: string;
  targetNodeId: string;
}

export interface SavedWorkflow {
  id: string;
  name: string;
  description: string;
  updatedAt: string;
  nodes: CanvasWorkflowNode[];
  edges: CanvasWorkflowEdge[];
}

export interface NodeExecutionResult {
  nodeId: string;
  nodeName: string;
  category: IntegrationCategory;
  status: 'success' | 'error';
  durationMs: number;
  outputSummary: string;
  outputData: unknown;
}

export interface WorkflowRunReport {
  runId: string;
  workflowId: string;
  workflowName: string;
  startedAt: string;
  finishedAt: string;
  status: 'success' | 'error';
  nodeResults: Record<string, NodeExecutionResult>;
}

export interface ApiCredentialsStatus {
  geminiConfigured: boolean;
  githubConfigured: boolean;
  googleConfigured: boolean;
  haConfigured: boolean;
  haUrl: string;
}

export const STARTER_NODE_PALETTE: NodePaletteTemplate[] = [
  // 1. Triggers
  {
    typeId: 'trigger.manual',
    category: 'trigger',
    categoryLabel: 'Triggers',
    name: 'Manual / Webhook Trigger',
    subtitle: 'Starts workflow on click or webhook',
    icon: '⚡',
    accentColor: '#f59e0b',
    n8nType: 'n8n-nodes-base.webhook',
    defaultConfig: {
      webhookPath: '/webhook/run',
      payloadHint: 'Trigger event',
    },
    fields: [
      {
        key: 'webhookPath',
        label: 'Webhook Path',
        type: 'text',
        placeholder: '/webhook/run',
      },
      {
        key: 'payloadHint',
        label: 'Initial Input Text / JSON',
        type: 'textarea',
        placeholder: 'Optional test input passed to next node...',
      },
    ],
  },
  {
    typeId: 'trigger.schedule',
    category: 'trigger',
    categoryLabel: 'Triggers',
    name: 'Schedule Timer',
    subtitle: 'Runs on a recurring cron / interval',
    icon: '⏰',
    accentColor: '#f59e0b',
    n8nType: 'n8n-nodes-base.scheduleTrigger',
    defaultConfig: {
      cron: '30 7 * * *',
      timezone: 'Europe/Vienna',
    },
    fields: [
      {
        key: 'cron',
        label: 'Cron Schedule',
        type: 'text',
        placeholder: '30 7 * * * (Every day at 07:30)',
      },
      {
        key: 'timezone',
        label: 'Timezone',
        type: 'text',
        placeholder: 'Europe/Vienna',
      },
    ],
  },

  // 2. Gemini API
  {
    typeId: 'gemini.generate',
    category: 'gemini',
    categoryLabel: 'Gemini AI',
    name: 'Gemini Generate',
    subtitle: 'Prompt Gemini 2.5 Flash / Pro',
    icon: '✨',
    accentColor: '#8b5cf6',
    n8nType: 'n8n-nodes-base.googleGemini',
    defaultConfig: {
      model: 'gemini-2.5-flash',
      prompt: 'Summarize the incoming data in 3 concise bullet points:\n\n{{$input}}',
    },
    fields: [
      {
        key: 'model',
        label: 'Gemini Model',
        type: 'select',
        options: [
          { label: 'gemini-2.5-flash (Fast)', value: 'gemini-2.5-flash' },
          { label: 'gemini-2.5-pro (Reasoning)', value: 'gemini-2.5-pro' },
        ],
      },
      {
        key: 'prompt',
        label: 'Prompt (use {{$input}} for previous node data)',
        type: 'textarea',
        placeholder: 'Analyze {{$input}} and return recommendations...',
      },
    ],
  },
  {
    typeId: 'gemini.decide',
    category: 'gemini',
    categoryLabel: 'Gemini AI',
    name: 'Gemini AI Classifier',
    subtitle: 'Extract structured JSON / decision',
    icon: '🧠',
    accentColor: '#8b5cf6',
    n8nType: 'n8n-nodes-base.googleGemini',
    defaultConfig: {
      model: 'gemini-2.5-flash',
      prompt: 'Classify urgency (HIGH / NORMAL / LOW) and suggest next action for:\n{{$input}}',
    },
    fields: [
      {
        key: 'model',
        label: 'Gemini Model',
        type: 'select',
        options: [
          { label: 'gemini-2.5-flash', value: 'gemini-2.5-flash' },
          { label: 'gemini-2.5-pro', value: 'gemini-2.5-pro' },
        ],
      },
      {
        key: 'prompt',
        label: 'Classification Prompt',
        type: 'textarea',
      },
    ],
  },

  // 3. Gmail API
  {
    typeId: 'gmail.list_unread',
    category: 'gmail',
    categoryLabel: 'Gmail',
    name: 'Gmail Fetch Emails',
    subtitle: 'Read unread messages matching query',
    icon: '📧',
    accentColor: '#ef4444',
    n8nType: 'n8n-nodes-base.gmail',
    defaultConfig: {
      query: 'is:unread label:INBOX',
      maxResults: '5',
    },
    fields: [
      {
        key: 'query',
        label: 'Gmail Search Query',
        type: 'text',
        placeholder: 'is:unread from:alerts@...',
      },
      {
        key: 'maxResults',
        label: 'Max Emails',
        type: 'text',
        placeholder: '5',
      },
    ],
  },
  {
    typeId: 'gmail.send',
    category: 'gmail',
    categoryLabel: 'Gmail',
    name: 'Gmail Send Email',
    subtitle: 'Send email with workflow output',
    icon: '📨',
    accentColor: '#ef4444',
    n8nType: 'n8n-nodes-base.gmail',
    defaultConfig: {
      to: 'thomas@example.com',
      subject: '[Thassi Workflow] Automated Report',
      body: 'Here is your automated workflow summary:\n\n{{$input}}',
    },
    fields: [
      {
        key: 'to',
        label: 'To (Recipient Email)',
        type: 'text',
        placeholder: 'you@gmail.com',
      },
      {
        key: 'subject',
        label: 'Subject',
        type: 'text',
        placeholder: 'Workflow Notification',
      },
      {
        key: 'body',
        label: 'Email Body (supports {{$input}})',
        type: 'textarea',
      },
    ],
  },

  // 4. Google Calendar API
  {
    typeId: 'gcal.upcoming',
    category: 'gcal',
    categoryLabel: 'Google Calendar',
    name: 'Calendar Upcoming Events',
    subtitle: 'Fetch today / next 7d schedule',
    icon: '📅',
    accentColor: '#3b82f6',
    n8nType: 'n8n-nodes-base.googleCalendar',
    defaultConfig: {
      calendarId: 'primary',
      windowHours: '24',
    },
    fields: [
      {
        key: 'calendarId',
        label: 'Calendar ID',
        type: 'text',
        placeholder: 'primary',
      },
      {
        key: 'windowHours',
        label: 'Lookahead Window (Hours)',
        type: 'select',
        options: [
          { label: 'Next 24 Hours (Today)', value: '24' },
          { label: 'Next 48 Hours', value: '48' },
          { label: 'Next 7 Days (168h)', value: '168' },
        ],
      },
    ],
  },
  {
    typeId: 'gcal.create_event',
    category: 'gcal',
    categoryLabel: 'Google Calendar',
    name: 'Calendar Create Event',
    subtitle: 'Add a new event or reminder',
    icon: '🗓️',
    accentColor: '#3b82f6',
    n8nType: 'n8n-nodes-base.googleCalendar',
    defaultConfig: {
      calendarId: 'primary',
      summary: 'Follow-up: {{$input}}',
      durationMinutes: '30',
    },
    fields: [
      {
        key: 'calendarId',
        label: 'Calendar ID',
        type: 'text',
        placeholder: 'primary',
      },
      {
        key: 'summary',
        label: 'Event Title',
        type: 'text',
        placeholder: 'Smart Home Maintenance',
      },
      {
        key: 'durationMinutes',
        label: 'Duration (minutes)',
        type: 'text',
        placeholder: '30',
      },
    ],
  },

  // 5. GitHub API
  {
    typeId: 'github.list_issues',
    category: 'github',
    categoryLabel: 'GitHub',
    name: 'GitHub Fetch Issues',
    subtitle: 'List issues & PRs from repository',
    icon: '🐙',
    accentColor: '#10b981',
    n8nType: 'n8n-nodes-base.github',
    defaultConfig: {
      repo: 'tsimhofer/taskassistant',
      state: 'open',
    },
    fields: [
      {
        key: 'repo',
        label: 'GitHub Repository (owner/repo)',
        type: 'select',
        options: [
          { label: 'tsimhofer/thassi', value: 'tsimhofer/thassi' },
          { label: 'tsimhofer/taskassistant', value: 'tsimhofer/taskassistant' },
          { label: 'tsimhofer/thassi.3dprint', value: 'tsimhofer/thassi.3dprint' },
          { label: 'tsimhofer/thassi.finances', value: 'tsimhofer/thassi.finances' },
          { label: 'tsimhofer/Aurelia', value: 'tsimhofer/Aurelia' },
          { label: 'tsimhofer/austrian-meal-scout', value: 'tsimhofer/austrian-meal-scout' },
        ],
      },
      {
        key: 'state',
        label: 'Issue State',
        type: 'select',
        options: [
          { label: 'Open Issues', value: 'open' },
          { label: 'All Issues (Open + Closed)', value: 'all' },
          { label: 'Closed Issues', value: 'closed' },
        ],
      },
    ],
  },
  {
    typeId: 'github.create_issue',
    category: 'github',
    categoryLabel: 'GitHub',
    name: 'GitHub Create Issue',
    subtitle: 'Open a new issue in a repository',
    icon: '🎯',
    accentColor: '#10b981',
    n8nType: 'n8n-nodes-base.github',
    defaultConfig: {
      repo: 'tsimhofer/thassi',
      title: '[Automated] Follow-up Task',
      body: 'Created automatically by Thassi Workflows:\n\n{{$input}}',
    },
    fields: [
      {
        key: 'repo',
        label: 'Repository (owner/repo)',
        type: 'select',
        options: [
          { label: 'tsimhofer/thassi', value: 'tsimhofer/thassi' },
          { label: 'tsimhofer/taskassistant', value: 'tsimhofer/taskassistant' },
          { label: 'tsimhofer/thassi.3dprint', value: 'tsimhofer/thassi.3dprint' },
          { label: 'tsimhofer/thassi.finances', value: 'tsimhofer/thassi.finances' },
          { label: 'tsimhofer/Aurelia', value: 'tsimhofer/Aurelia' },
          { label: 'tsimhofer/austrian-meal-scout', value: 'tsimhofer/austrian-meal-scout' },
        ],
      },
      {
        key: 'title',
        label: 'Issue Title',
        type: 'text',
      },
      {
        key: 'body',
        label: 'Issue Body (supports {{$input}})',
        type: 'textarea',
      },
    ],
  },

  // 6. Home Assistant API
  {
    typeId: 'ha.get_state',
    category: 'homeassistant',
    categoryLabel: 'Home Assistant',
    name: 'HA Read Sensor / State',
    subtitle: 'Fetch live state from Home Assistant',
    icon: '🏠',
    accentColor: '#06b6d4',
    n8nType: 'n8n-nodes-base.homeAssistant',
    defaultConfig: {
      entityId: 'sensor.shellyhtg3_e4b32331dde0_temperatur',
    },
    fields: [
      {
        key: 'entityId',
        label: 'Entity ID',
        type: 'text',
        placeholder: 'sensor.shellyhtg3_e4b32331dde0_temperatur',
      },
    ],
  },
  {
    typeId: 'ha.call_service',
    category: 'homeassistant',
    categoryLabel: 'Home Assistant',
    name: 'HA Call Service / Notify',
    subtitle: 'Trigger switch, light, or notification',
    icon: '🔔',
    accentColor: '#06b6d4',
    n8nType: 'n8n-nodes-base.homeAssistant',
    defaultConfig: {
      domain: 'persistent_notification',
      service: 'create',
      targetOrMessage: '{{$input}}',
    },
    fields: [
      {
        key: 'domain',
        label: 'Service Domain',
        type: 'select',
        options: [
          { label: 'persistent_notification (HA UI Notification)', value: 'persistent_notification' },
          { label: 'switch (Turn On / Off)', value: 'switch' },
          { label: 'light (Turn On / Off)', value: 'light' },
          { label: 'script (Run Script)', value: 'script' },
        ],
      },
      {
        key: 'service',
        label: 'Service Action',
        type: 'text',
        placeholder: 'create / turn_on / turn_off',
      },
      {
        key: 'targetOrMessage',
        label: 'Message or Entity ID (supports {{$input}})',
        type: 'textarea',
        placeholder: 'Message text or entity_id...',
      },
    ],
  },
];

export const DEFAULT_STARTER_WORKFLOWS: SavedWorkflow[] = [
  {
    id: 'wf-morning-briefing',
    name: 'Morning Smart Home & Calendar Briefing',
    description:
      'Reads upcoming Google Calendar events, unread Gmail messages, and Home Assistant room temperature, then summarizes them with Gemini AI and sends a Home Assistant notification.',
    updatedAt: new Date().toISOString(),
    nodes: [
      {
        id: 'node-1',
        typeId: 'trigger.schedule',
        category: 'trigger',
        name: '07:30 Morning Trigger',
        subtitle: 'Runs daily at 07:30',
        icon: '⏰',
        accentColor: '#f59e0b',
        n8nType: 'n8n-nodes-base.scheduleTrigger',
        x: 60,
        y: 190,
        config: { cron: '30 7 * * *', timezone: 'Europe/Vienna' },
      },
      {
        id: 'node-2',
        typeId: 'gcal.upcoming',
        category: 'gcal',
        name: "Today's Calendar",
        subtitle: 'Next 24h events',
        icon: '📅',
        accentColor: '#3b82f6',
        n8nType: 'n8n-nodes-base.googleCalendar',
        x: 340,
        y: 60,
        config: { calendarId: 'primary', windowHours: '24' },
      },
      {
        id: 'node-3',
        typeId: 'gmail.list_unread',
        category: 'gmail',
        name: 'Unread Gmail Inbox',
        subtitle: 'Top 5 unread emails',
        icon: '📧',
        accentColor: '#ef4444',
        n8nType: 'n8n-nodes-base.gmail',
        x: 340,
        y: 190,
        config: { query: 'is:unread label:INBOX', maxResults: '5' },
      },
      {
        id: 'node-4',
        typeId: 'ha.get_state',
        category: 'homeassistant',
        name: 'HA Living Room Temp',
        subtitle: 'Read Shelly H&T Gen3',
        icon: '🏠',
        accentColor: '#06b6d4',
        n8nType: 'n8n-nodes-base.homeAssistant',
        x: 340,
        y: 320,
        config: { entityId: 'sensor.shellyhtg3_e4b32331dde0_temperatur' },
      },
      {
        id: 'node-5',
        typeId: 'gemini.generate',
        category: 'gemini',
        name: 'Gemini Daily Briefing',
        subtitle: 'Synthesize schedule + home state',
        icon: '✨',
        accentColor: '#8b5cf6',
        n8nType: 'n8n-nodes-base.googleGemini',
        x: 640,
        y: 190,
        config: {
          model: 'gemini-2.5-flash',
          prompt:
            'Create a friendly German morning briefing from Calendar, Gmail, and Home Assistant sensor data:\n\n{{$input}}',
        },
      },
      {
        id: 'node-6',
        typeId: 'ha.call_service',
        category: 'homeassistant',
        name: 'HA Push Briefing',
        subtitle: 'Show persistent notification',
        icon: '🔔',
        accentColor: '#06b6d4',
        n8nType: 'n8n-nodes-base.homeAssistant',
        x: 930,
        y: 190,
        config: {
          domain: 'persistent_notification',
          service: 'create',
          targetOrMessage: '{{$input}}',
        },
      },
    ],
    edges: [
      { id: 'e-1-2', sourceNodeId: 'node-1', targetNodeId: 'node-2' },
      { id: 'e-1-3', sourceNodeId: 'node-1', targetNodeId: 'node-3' },
      { id: 'e-1-4', sourceNodeId: 'node-1', targetNodeId: 'node-4' },
      { id: 'e-2-5', sourceNodeId: 'node-2', targetNodeId: 'node-5' },
      { id: 'e-3-5', sourceNodeId: 'node-3', targetNodeId: 'node-5' },
      { id: 'e-4-5', sourceNodeId: 'node-4', targetNodeId: 'node-5' },
      { id: 'e-5-6', sourceNodeId: 'node-5', targetNodeId: 'node-6' },
    ],
  },
  {
    id: 'wf-github-gemini-digest',
    name: 'GitHub Issue Triage -> Gemini -> Gmail',
    description:
      'Fetches open GitHub issues from tsimhofer/taskassistant, prioritizes them with Gemini AI, and sends an email digest via Gmail.',
    updatedAt: new Date().toISOString(),
    nodes: [
      {
        id: 'gh-1',
        typeId: 'trigger.manual',
        category: 'trigger',
        name: 'Manual Start',
        subtitle: 'On-demand trigger',
        icon: '⚡',
        accentColor: '#f59e0b',
        n8nType: 'n8n-nodes-base.webhook',
        x: 70,
        y: 180,
        config: { webhookPath: '/webhook/github-triage', payloadHint: 'Start GitHub issue triage' },
      },
      {
        id: 'gh-2',
        typeId: 'github.list_issues',
        category: 'github',
        name: 'Fetch GitHub Issues',
        subtitle: 'tsimhofer/taskassistant',
        icon: '🐙',
        accentColor: '#10b981',
        n8nType: 'n8n-nodes-base.github',
        x: 340,
        y: 180,
        config: { repo: 'tsimhofer/taskassistant', state: 'open' },
      },
      {
        id: 'gh-3',
        typeId: 'gemini.generate',
        category: 'gemini',
        name: 'Gemini Prioritize Issues',
        subtitle: 'Summarize & rank open PRs/issues',
        icon: '✨',
        accentColor: '#8b5cf6',
        n8nType: 'n8n-nodes-base.googleGemini',
        x: 620,
        y: 180,
        config: {
          model: 'gemini-2.5-flash',
          prompt:
            'Review these open GitHub issues/PRs and recommend which ones to merge or fix first:\n\n{{$input}}',
        },
      },
      {
        id: 'gh-4',
        typeId: 'gmail.send',
        category: 'gmail',
        name: 'Send Gmail Digest',
        subtitle: 'Email summary to maintainer',
        icon: '📨',
        accentColor: '#ef4444',
        n8nType: 'n8n-nodes-base.gmail',
        x: 900,
        y: 180,
        config: {
          to: 'tsimhofer@gmail.com',
          subject: '[GitHub Triage] Prioritized Open Issues',
          body: '{{$input}}',
        },
      },
    ],
    edges: [
      { id: 'e-gh-1', sourceNodeId: 'gh-1', targetNodeId: 'gh-2' },
      { id: 'e-gh-2', sourceNodeId: 'gh-2', targetNodeId: 'gh-3' },
      { id: 'e-gh-3', sourceNodeId: 'gh-3', targetNodeId: 'gh-4' },
    ],
  },
];
