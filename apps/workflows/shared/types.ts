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

export interface AxonFieldSchema {
  key: string;
  label: string;
  type: 'text' | 'textarea' | 'select' | 'number' | 'boolean' | 'json';
  placeholder?: string;
  options?: string[];
  required?: boolean;
  defaultValue?: string;
}

export interface AxonDescriptor {
  id: string;
  name: string;
  domainCode: string;
  category: IntegrationCategory | string;
  icon: string;
  description: string;
  fields: AxonFieldSchema[];
  defaultInput: Record<string, string>;
  lastStatus?: 'success' | 'error' | 'idle';
  lastDurationMs?: number | null;
  lastExecutedAt?: string | null;
  lastSummary?: string | null;
  totalRuns?: number;
}

export interface AxonExecutionResult {
  axonId: string;
  actionId?: string;
  ok: boolean;
  status?: 'success' | 'error';
  durationMs: number;
  executedAt: string;
  summary: string;
  data: unknown;
  error?: string;
  errorCode?: string;
  remediationHint?: string;
}

export type WorkflowNode = CanvasWorkflowNode;
export type WorkflowEdge = CanvasWorkflowEdge;

export const STARTER_NODE_PALETTE: NodePaletteTemplate[] = [
  // 1. Triggers
  {
    typeId: 'trigger.manual',
    category: 'trigger',
    categoryLabel: 'Auslöser',
    name: 'Manueller / Webhook-Auslöser',
    subtitle: 'Startet den Ablauf per Klick oder Webhook',
    icon: '⚡',
    accentColor: '#f59e0b',
    n8nType: 'n8n-nodes-base.webhook',
    defaultConfig: {
      webhookPath: '/webhook/run',
      payloadHint: 'Manueller Start',
    },
    fields: [
      {
        key: 'webhookPath',
        label: 'Webhook-Pfad',
        type: 'text',
        placeholder: '/webhook/run',
      },
      {
        key: 'payloadHint',
        label: 'Start-Eingabetext / JSON',
        type: 'textarea',
        placeholder: 'Optionale Testdaten für den nächsten Schritt...',
      },
    ],
  },
  {
    typeId: 'trigger.schedule',
    category: 'trigger',
    categoryLabel: 'Auslöser',
    name: 'Zeitplan-Timer',
    subtitle: 'Wiederkehrende Ausführung per Cron / Intervall',
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
        label: 'Cron-Zeitplan',
        type: 'text',
        placeholder: '30 7 * * * (Täglich um 07:30 Uhr)',
      },
      {
        key: 'timezone',
        label: 'Zeitzone',
        type: 'text',
        placeholder: 'Europe/Vienna',
      },
    ],
  },
  {
    typeId: 'trigger.vision_object',
    category: 'trigger',
    categoryLabel: 'Auslöser',
    name: 'Kamera-Objekt-Auslöser',
    subtitle: 'Startet bei Objekt X >= p% Wahrscheinlichkeit',
    icon: '🎥',
    accentColor: '#10b981',
    n8nType: 'n8n-nodes-base.webhook',
    defaultConfig: {
      cameraId: 'camera.cam_eg_vz_eingang',
      objectClass: 'person',
      minConfidencePct: '65',
    },
    fields: [
      {
        key: 'cameraId',
        label: 'Kamera-ID (* für alle)',
        type: 'text',
        placeholder: 'camera.cam_eg_vz_eingang',
      },
      {
        key: 'objectClass',
        label: 'Ziel-Objektklasse',
        type: 'select',
        options: [
          { label: 'Person (person)', value: 'person' },
          { label: 'Auto (car)', value: 'car' },
          { label: 'Beliebiges Fahrzeug (any_vehicle)', value: 'any_vehicle' },
          { label: 'Paket / Rucksack (backpack)', value: 'backpack' },
          { label: 'Hund / Katze (any_animal)', value: 'any_animal' },
          { label: 'Reine Bewegung (motion_only)', value: 'motion_only' },
        ],
      },
      {
        key: 'minConfidencePct',
        label: 'Mindest-Wahrscheinlichkeit (%)',
        type: 'text',
        placeholder: '65',
      },
    ],
  },

  // 2. Gemini API
  {
    typeId: 'gemini.generate',
    category: 'gemini',
    categoryLabel: 'Gemini KI',
    name: 'Gemini Analyse & Text',
    subtitle: 'Prompt an Gemini 2.5 Flash / Pro senden',
    icon: '✨',
    accentColor: '#8b5cf6',
    n8nType: 'n8n-nodes-base.googleGemini',
    defaultConfig: {
      model: 'gemini-2.5-flash',
      prompt: 'Fasse die eingehenden Daten in 3 präzisen Punkten auf Deutsch zusammen:\n\n{{$input}}',
    },
    fields: [
      {
        key: 'model',
        label: 'Gemini-Modell',
        type: 'select',
        options: [
          { label: 'gemini-2.5-flash (Schnell)', value: 'gemini-2.5-flash' },
          { label: 'gemini-2.5-pro (Tiefenanalyse)', value: 'gemini-2.5-pro' },
        ],
      },
      {
        key: 'prompt',
        label: 'Prompt ({{$input}} für Daten des vorherigen Knotens)',
        type: 'textarea',
        placeholder: 'Analysiere {{$input}} und gib Empfehlungen aus...',
      },
    ],
  },
  {
    typeId: 'gemini.decide',
    category: 'gemini',
    categoryLabel: 'Gemini KI',
    name: 'Gemini KI-Klassifizierer',
    subtitle: 'Strukturierte JSON-Entscheidung ableiten',
    icon: '🧠',
    accentColor: '#8b5cf6',
    n8nType: 'n8n-nodes-base.googleGemini',
    defaultConfig: {
      model: 'gemini-2.5-flash',
      prompt: 'Klassifiziere die Dringlichkeit (HOCH / NORMAL / NIEDRIG) und schlage die nächste Aktion vor:\n{{$input}}',
    },
    fields: [
      {
        key: 'model',
        label: 'Gemini-Modell',
        type: 'select',
        options: [
          { label: 'gemini-2.5-flash', value: 'gemini-2.5-flash' },
          { label: 'gemini-2.5-pro', value: 'gemini-2.5-pro' },
        ],
      },
      {
        key: 'prompt',
        label: 'Klassifizierungs-Prompt',
        type: 'textarea',
      },
    ],
  },

  // 3. Gmail API
  {
    typeId: 'gmail.list_unread',
    category: 'gmail',
    categoryLabel: 'Gmail',
    name: 'Gmail E-Mails abrufen',
    subtitle: 'Ungelesene Nachrichten per Suchfilter lesen',
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
        label: 'Gmail-Suchfilter',
        type: 'text',
        placeholder: 'is:unread from:alerts@...',
      },
      {
        key: 'maxResults',
        label: 'Max. E-Mails',
        type: 'text',
        placeholder: '5',
      },
    ],
  },
  {
    typeId: 'gmail.send',
    category: 'gmail',
    categoryLabel: 'Gmail',
    name: 'Gmail E-Mail senden',
    subtitle: 'E-Mail mit Workflow-Ergebnis versenden',
    icon: '📨',
    accentColor: '#ef4444',
    n8nType: 'n8n-nodes-base.gmail',
    defaultConfig: {
      to: 'thomas@example.com',
      subject: '[Thassi Workflow] Automatischer Bericht',
      body: 'Hier ist die automatische Zusammenfassung:\n\n{{$input}}',
    },
    fields: [
      {
        key: 'to',
        label: 'Empfänger (An)',
        type: 'text',
        placeholder: 'du@gmail.com',
      },
      {
        key: 'subject',
        label: 'Betreff',
        type: 'text',
        placeholder: 'Workflow-Benachrichtigung',
      },
      {
        key: 'body',
        label: 'Nachrichtentext ({{$input}} möglich)',
        type: 'textarea',
      },
    ],
  },

  // 4. Google Calendar API
  {
    typeId: 'gcal.upcoming',
    category: 'gcal',
    categoryLabel: 'Google Kalender',
    name: 'Kalender: Kommende Termine',
    subtitle: 'Termine für heute / nächste 7 Tage laden',
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
        label: 'Kalender-ID',
        type: 'text',
        placeholder: 'primary',
      },
      {
        key: 'windowHours',
        label: 'Zeitfenster (Stunden)',
        type: 'select',
        options: [
          { label: 'Nächste 24 Stunden (Heute)', value: '24' },
          { label: 'Nächste 48 Stunden', value: '48' },
          { label: 'Nächste 7 Tage (168h)', value: '168' },
        ],
      },
    ],
  },
  {
    typeId: 'gcal.create_event',
    category: 'gcal',
    categoryLabel: 'Google Kalender',
    name: 'Kalender: Termin erstellen',
    subtitle: 'Neuen Kalendereintrag oder Erinnerung anlegen',
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
        label: 'Kalender-ID',
        type: 'text',
        placeholder: 'primary',
      },
      {
        key: 'summary',
        label: 'Termin-Titel',
        type: 'text',
        placeholder: 'Smart Home Wartung',
      },
      {
        key: 'durationMinutes',
        label: 'Dauer (Minuten)',
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
    name: 'GitHub Issues abrufen',
    subtitle: 'Issues & PRs eines Repositories auflisten',
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
        label: 'Issue-Status',
        type: 'select',
        options: [
          { label: 'Offene Issues', value: 'open' },
          { label: 'Alle Issues (Offen + Geschlossen)', value: 'all' },
          { label: 'Geschlossene Issues', value: 'closed' },
        ],
      },
    ],
  },
  {
    typeId: 'github.create_issue',
    category: 'github',
    categoryLabel: 'GitHub',
    name: 'GitHub Issue erstellen',
    subtitle: 'Neues Issue in einem Repository eröffnen',
    icon: '🎯',
    accentColor: '#10b981',
    n8nType: 'n8n-nodes-base.github',
    defaultConfig: {
      repo: 'tsimhofer/thassi',
      title: '[Automatisch] Folgeaufgabe',
      body: 'Automatisch erstellt durch Thassi Axons:\n\n{{$input}}',
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
        label: 'Issue-Titel',
        type: 'text',
      },
      {
        key: 'body',
        label: 'Beschreibung ({{$input}} möglich)',
        type: 'textarea',
      },
    ],
  },

  // 6. Home Assistant API
  {
    typeId: 'ha.get_state',
    category: 'homeassistant',
    categoryLabel: 'Home Assistant',
    name: 'HA Sensor / Zustand lesen',
    subtitle: 'Aktuellen Live-Status aus Home Assistant lesen',
    icon: '🏠',
    accentColor: '#06b6d4',
    n8nType: 'n8n-nodes-base.homeAssistant',
    defaultConfig: {
      entityId: 'sensor.shellyhtg3_e4b32331dde0_temperatur',
    },
    fields: [
      {
        key: 'entityId',
        label: 'Entitäts-ID',
        type: 'text',
        placeholder: 'sensor.shellyhtg3_e4b32331dde0_temperatur',
      },
    ],
  },
  {
    typeId: 'ha.call_service',
    category: 'homeassistant',
    categoryLabel: 'Home Assistant',
    name: 'HA Dienst / Benachrichtigung',
    subtitle: 'Schalter, Licht oder Benachrichtigung auslösen',
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
        label: 'Dienst-Domäne',
        type: 'select',
        options: [
          { label: 'persistent_notification (HA Benachrichtigung)', value: 'persistent_notification' },
          { label: 'switch (Schalter Ein / Aus)', value: 'switch' },
          { label: 'light (Licht Ein / Aus)', value: 'light' },
          { label: 'script (Skript starten)', value: 'script' },
        ],
      },
      {
        key: 'service',
        label: 'Dienst-Aktion',
        type: 'text',
        placeholder: 'create / turn_on / turn_off',
      },
      {
        key: 'targetOrMessage',
        label: 'Nachricht oder Entitäts-ID ({{$input}} möglich)',
        type: 'textarea',
        placeholder: 'Nachrichtentext oder entity_id...',
      },
    ],
  },
];

export const DEFAULT_STARTER_WORKFLOWS: SavedWorkflow[] = [
  {
    id: 'wf-morning-briefing',
    name: 'Morgen-Briefing: Smart Home & Kalender',
    description:
      'Liest anstehende Google-Kalendertermine, ungelesene Gmail-Nachrichten und die Raumtemperatur aus Home Assistant, fasst alles mit Gemini KI zusammen und sendet eine Benachrichtigung.',
    updatedAt: new Date().toISOString(),
    nodes: [
      {
        id: 'node-1',
        typeId: 'trigger.schedule',
        category: 'trigger',
        name: '07:30 Morgen-Auslöser',
        subtitle: 'Täglich um 07:30 Uhr',
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
        name: 'Heutiger Kalender',
        subtitle: 'Termine der nächsten 24 Std.',
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
        name: 'Ungelesene E-Mails',
        subtitle: 'Top 5 ungelesene Nachrichten',
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
        name: 'HA Wohnzimmer-Temperatur',
        subtitle: 'Shelly H&T Gen3 auslesen',
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
        name: 'Gemini Tages-Briefing',
        subtitle: 'Termine + Hausstatus zusammenfassen',
        icon: '✨',
        accentColor: '#8b5cf6',
        n8nType: 'n8n-nodes-base.googleGemini',
        x: 640,
        y: 190,
        config: {
          model: 'gemini-2.5-flash',
          prompt:
            'Erstelle ein kompaktes deutsches Morgen-Briefing aus Kalender-, Gmail- und Home-Assistant-Sensordaten:\n\n{{$input}}',
        },
      },
      {
        id: 'node-6',
        typeId: 'ha.call_service',
        category: 'homeassistant',
        name: 'HA Briefing-Benachrichtigung',
        subtitle: 'Persistente Benachrichtigung senden',
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
    name: 'GitHub Issue-Triage -> Gemini -> Gmail',
    description:
      'Lädt offene GitHub-Issues aus tsimhofer/taskassistant, priorisiert sie mit Gemini KI und versendet eine Zusammenfassung per Gmail.',
    updatedAt: new Date().toISOString(),
    nodes: [
      {
        id: 'gh-1',
        typeId: 'trigger.manual',
        category: 'trigger',
        name: 'Manueller Start',
        subtitle: 'Start auf Abruf',
        icon: '⚡',
        accentColor: '#f59e0b',
        n8nType: 'n8n-nodes-base.webhook',
        x: 70,
        y: 180,
        config: { webhookPath: '/webhook/github-triage', payloadHint: 'GitHub Issue-Triage starten' },
      },
      {
        id: 'gh-2',
        typeId: 'github.list_issues',
        category: 'github',
        name: 'GitHub Issues laden',
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
        name: 'Gemini Issue-Priorisierung',
        subtitle: 'Offene PRs/Issues bewerten & reihen',
        icon: '✨',
        accentColor: '#8b5cf6',
        n8nType: 'n8n-nodes-base.googleGemini',
        x: 620,
        y: 180,
        config: {
          model: 'gemini-2.5-flash',
          prompt:
            'Analysiere diese offenen GitHub-Issues/PRs auf Deutsch und empfehle, welche zuerst umgesetzt werden sollten:\n\n{{$input}}',
        },
      },
      {
        id: 'gh-4',
        typeId: 'gmail.send',
        category: 'gmail',
        name: 'Gmail-Zusammenfassung senden',
        subtitle: 'Bericht per E-Mail versenden',
        icon: '📨',
        accentColor: '#ef4444',
        n8nType: 'n8n-nodes-base.gmail',
        x: 900,
        y: 180,
        config: {
          to: 'tsimhofer@gmail.com',
          subject: '[GitHub Triage] Priorisierte offene Issues',
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
