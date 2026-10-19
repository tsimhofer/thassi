export type N8nNodeId = 'webhook' | 'validator' | 'gemini' | 'unittest' | 'git' | 'deploy';

export type N8nNodeStatus = 'idle' | 'queued' | 'running' | 'success' | 'warning' | 'error';

export type SignalColor = 'green' | 'cyan' | 'amber' | 'red' | 'slate';

export interface ModuleTemplateForm {
  objectives: {
    slug: string;
    name: string;
    domain: 'sensor' | 'binary_sensor' | 'switch' | 'climate' | 'automation' | 'service';
    description: string;
    targetEntities: string[];
    unitOfMeasurement: string;
    icon: string;
    pollingIntervalSeconds: number;
    anomalyThreshold: number;
  };
  dependencies: {
    pythonVersion: string;
    pipPackages: string[];
    haIntegrations: string[];
    requiredEnvVars: string[];
  };
  testWorkflow: {
    framework: 'unittest' | 'pytest';
    astSyntaxCheck: boolean;
    verifyErrorHandling: boolean;
    requiredTestCases: string[];
    minPassRatePercent: number;
  };
  deploymentStrategy: {
    transport: 'samba_and_bridge' | 'samba' | 'ssh' | 'ha_rest_bridge';
    hassHost: string;
    sambaShare: string;
    sshPort: number;
    targetPath: string;
    gitBranch: string;
    autoCommitPush: boolean;
    rollbackOnTestFailure: boolean;
    publishHaSensor: boolean;
  };
}

export interface N8nWorkflowNodeState {
  id: N8nNodeId;
  index: number;
  name: string;
  n8nType: string;
  subtitle: string;
  status: N8nNodeStatus;
  signalColor: SignalColor;
  statusFlag: string;
  durationMs: number;
  summary: string;
  details: string[];
  updatedAt: string;
}

export interface PythonUnitTestReport {
  executed: boolean;
  passed: boolean;
  astValid: boolean;
  totalTests: number;
  passedTests: number;
  failedTests: number;
  durationMs: number;
  command: string;
  output: string;
  testCases: Array<{
    name: string;
    status: 'PASS' | 'FAIL';
    description: string;
  }>;
}

export interface GitVersionReport {
  branch: string;
  commitSha: string;
  committed: boolean;
  pushed: boolean;
  remoteUrl: string;
  changedFiles: string[];
  message: string;
}

export interface HaDeploymentReport {
  transport: string;
  hassHost: string;
  sambaReachable: boolean;
  sshReachable: boolean;
  haCoreReachable: boolean;
  deployedPath: string;
  entityId: string;
  haSensorPublished: boolean;
  publishedState: number | string;
  statusFlag: string;
}

export interface WorkflowExecutionRecord {
  runId: string;
  moduleSlug: string;
  moduleName: string;
  status: 'running' | 'completed' | 'warning' | 'failed';
  signalColor: SignalColor;
  statusFlag: string;
  startedAt: string;
  finishedAt: string | null;
  totalDurationMs: number;
  template: ModuleTemplateForm;
  nodes: N8nWorkflowNodeState[];
  generatedFiles: {
    sensorPy: string;
    initPy: string;
    manifestJson: string;
    testPy: string;
  };
  unitTestReport: PythonUnitTestReport;
  gitReport: GitVersionReport;
  deployReport: HaDeploymentReport;
}

export interface GitHubCommitDto {
  sha: string;
  shortSha: string;
  message: string;
  author: string;
  date: string;
  url: string;
}

export interface GitHubRepoSummaryDto {
  name: string;
  fullName: string;
  description: string;
  htmlUrl: string;
  defaultBranch: string;
  language: string;
  stars: number;
  openIssues: number;
  updatedAt: string;
  pushedAt: string;
  isPrivate: boolean;
  sizeKb: number;
  topics: string[];
}

export interface GitHubIntegrationSnapshot {
  source: 'github_api_live' | 'github_api_cached' | 'local_git_fallback';
  statusFlag: 'GITHUB_API_OK' | 'GITHUB_RATE_LIMIT_FALLBACK' | 'GITHUB_ERROR';
  signalColor: SignalColor;
  owner: string;
  primaryRepo: GitHubRepoSummaryDto;
  repositories: GitHubRepoSummaryDto[];
  recentCommits: GitHubCommitDto[];
  branches: string[];
  rootFiles: Array<{ name: string; path: string; type: 'dir' | 'file'; size: number }>;
  rateLimitRemaining: number | null;
  fetchedAt: string;
  errorDetails?: string | null;
}

export interface EcosystemCompatibilityReport {
  pythonVersion: string;
  pythonAvailable: boolean;
  gitVersion: string;
  gitBranch: string;
  gitHeadSha: string;
  gitRemoteUrl: string;
  n8nWorkflowPath: string;
  n8nWebhookReady: boolean;
  geminiConfigured: boolean;
  geminiKeySource: string;
  hassCoreOnline: boolean;
  hassSambaOnline: boolean;
  hassSshOnline: boolean;
  thassiHostOnline: boolean;
  adjustmentsApplied: string[];
}

export const MODULE_TEMPLATE_PRESETS: Array<{
  id: string;
  label: string;
  badge: string;
  template: ModuleTemplateForm;
}> = [
  {
    id: 'shelly_energy_guard',
    label: 'Shelly Energy & Anomaly Guard',
    badge: 'Energie & Lastspitzen',
    template: {
      objectives: {
        slug: 'shelly_energy_guard',
        name: 'Shelly Energy & Anomaly Guard',
        domain: 'sensor',
        description:
          'Überwacht die Leistungsaufnahme der Shelly-Steckdosen im Büro OG und Wohnküche, berechnet Gesamtlast, Durchschnitt und Effizienz-Score und meldet Lastspitzen ab 250 W.',
        targetEntities: [
          'sensor.shellyplugsg3_e4b063e4bfd8_power',
          'sensor.links_power',
          'sensor.shellyhtg3_e4b32331dde0_temperatur',
        ],
        unitOfMeasurement: 'W',
        icon: 'mdi:lightning-bolt-circle',
        pollingIntervalSeconds: 60,
        anomalyThreshold: 250,
      },
      dependencies: {
        pythonVersion: '>=3.12',
        pipPackages: [],
        haIntegrations: ['http', 'sensor', 'mqtt'],
        requiredEnvVars: ['HA_URL', 'HA_TOKEN', 'GEMINI_API_KEY'],
      },
      testWorkflow: {
        framework: 'unittest',
        astSyntaxCheck: true,
        verifyErrorHandling: true,
        requiredTestCases: [
          'test_module_initialization',
          'test_sensor_state_calculation',
          'test_api_error_and_timeout_handling',
          'test_ha_entity_payload_contract',
        ],
        minPassRatePercent: 100,
      },
      deploymentStrategy: {
        transport: 'samba_and_bridge',
        hassHost: '192.168.188.92',
        sambaShare: '\\\\192.168.188.92\\config',
        sshPort: 22,
        targetPath: '/config/custom_components/shelly_energy_guard',
        gitBranch: 'main',
        autoCommitPush: false,
        rollbackOnTestFailure: true,
        publishHaSensor: true,
      },
    },
  },
  {
    id: 'bambu_filament_guard',
    label: 'Bambu X1C Power & Thermal Guard',
    badge: '3D-Druck & Werkstatt',
    template: {
      objectives: {
        slug: 'bambu_filament_guard',
        name: 'Bambu X1C Power & Thermal Guard',
        domain: 'sensor',
        description:
          'Analysiert den Schreibtisch-Plug (.90) des Bambu Lab X1C Druckers und Raumklima-Sensoren im Büro OG, erkennt Druckphasen (Heizen vs. Druckbetrieb) und warnt bei Luftfeuchtigkeit über 55%.',
        targetEntities: [
          'sensor.kleines_licht_pumpe_power',
          'sensor.shellyhtg3_e4b32331dde0_temperatur',
          'sensor.shellyhtg3_e4b32331dde0_luftfeuchtigkeit',
        ],
        unitOfMeasurement: 'W',
        icon: 'mdi:printer-3d-nozzle-alert',
        pollingIntervalSeconds: 30,
        anomalyThreshold: 350,
      },
      dependencies: {
        pythonVersion: '>=3.12',
        pipPackages: [],
        haIntegrations: ['http', 'sensor', 'mqtt'],
        requiredEnvVars: ['HA_URL', 'HA_TOKEN', 'GEMINI_API_KEY'],
      },
      testWorkflow: {
        framework: 'unittest',
        astSyntaxCheck: true,
        verifyErrorHandling: true,
        requiredTestCases: [
          'test_module_initialization',
          'test_sensor_state_calculation',
          'test_api_error_and_timeout_handling',
          'test_ha_entity_payload_contract',
        ],
        minPassRatePercent: 100,
      },
      deploymentStrategy: {
        transport: 'samba_and_bridge',
        hassHost: '192.168.188.92',
        sambaShare: '\\\\192.168.188.92\\config',
        sshPort: 22,
        targetPath: '/config/custom_components/bambu_filament_guard',
        gitBranch: 'main',
        autoCommitPush: false,
        rollbackOnTestFailure: true,
        publishHaSensor: true,
      },
    },
  },
  {
    id: 'vorzimmer_lighting_optimizer',
    label: 'Vorzimmer & Stiegenhaus Motion Optimizer',
    badge: 'Licht & Präsenz',
    template: {
      objectives: {
        slug: 'vorzimmer_lighting_optimizer',
        name: 'Vorzimmer & Stiegenhaus Motion Optimizer',
        domain: 'sensor',
        description:
          'Korreliert Helligkeits- und Bewegungssensoren im Stiegenhaus mit den Shelly 2PM Kanälen im Vorzimmer OG und berechnet das Einsparpotenzial durch tageslichtabhängige Dimmung.',
        targetEntities: [
          'sensor.shelly2pmg3_8cbfea9ac754_output_0_leistung',
          'sensor.shelly2pmg3_8cbfea9ac754_output_1_leistung',
          'sensor.shelly_blu_motion_19ca_beleuchtungsstarke',
        ],
        unitOfMeasurement: 'lx',
        icon: 'mdi:motion-sensor',
        pollingIntervalSeconds: 45,
        anomalyThreshold: 180,
      },
      dependencies: {
        pythonVersion: '>=3.12',
        pipPackages: [],
        haIntegrations: ['http', 'sensor'],
        requiredEnvVars: ['HA_URL', 'HA_TOKEN'],
      },
      testWorkflow: {
        framework: 'unittest',
        astSyntaxCheck: true,
        verifyErrorHandling: true,
        requiredTestCases: [
          'test_module_initialization',
          'test_sensor_state_calculation',
          'test_api_error_and_timeout_handling',
          'test_ha_entity_payload_contract',
        ],
        minPassRatePercent: 100,
      },
      deploymentStrategy: {
        transport: 'samba_and_bridge',
        hassHost: '192.168.188.92',
        sambaShare: '\\\\192.168.188.92\\config',
        sshPort: 22,
        targetPath: '/config/custom_components/vorzimmer_lighting_optimizer',
        gitBranch: 'main',
        autoCommitPush: false,
        rollbackOnTestFailure: true,
        publishHaSensor: true,
      },
    },
  },
];
