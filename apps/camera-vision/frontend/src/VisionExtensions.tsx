import React, { useState, useEffect } from 'react';

export interface CameraPerfBreakdown {
  cameraId: string;
  framesIngested: number;
  framesDecoded: number;
  lumaChecks: number;
  cocoRuns: number;
  motionSkips: number;
  skipRatePct: number;
  lastCaptureMs: number;
  lastDecodeMs: number;
  lastLumaMs: number;
  lastInferenceMs: number;
  lastMotionPct: number;
  streamFps: number;
  streamWorkerActive: boolean;
  triggersFired: number;
  lastUpdatedIso: string;
}

export interface PerformanceSnapshot {
  startedAtIso: string;
  uptimeSec: number;
  activeStreamWorkers: number;
  totalFramesIngested: number;
  totalFramesDecoded: number;
  totalLumaChecks: number;
  totalCocoRuns: number;
  totalMotionGateSkips: number;
  motionGateSkipRatePct: number;
  savedCpuSeconds: number;
  totalTriggersFired: number;
  avgCaptureMs: number;
  avgDecodeMs: number;
  avgLumaMs: number;
  avgInferenceMs: number;
  memory: {
    rssMb: number;
    heapUsedMb: number;
    heapTotalMb: number;
    tfTensors: number;
    tfBytesMb: number;
    tfBackend: string;
  };
  cameraBreakdown: CameraPerfBreakdown[];
}

export type VisionTriggerActionType = 'axon' | 'ha_service' | 'ha_event' | 'orchestrator_event';

export interface VisionTriggerItem {
  id: number;
  name: string;
  enabled: number;
  camera_id: string;
  object_class: string;
  min_confidence_pct: number;
  min_count: number;
  min_motion_pct: number;
  time_window: string;
  cooldown_sec: number;
  action_type: VisionTriggerActionType;
  action_target: string;
  action_payload_json: string;
  last_triggered_at: string;
  last_status: string;
  last_result: string;
  trigger_count: number;
  created_at: string;
}

export interface VisionTriggerLogItem {
  id: number;
  trigger_id: number;
  trigger_name: string;
  camera_id: string;
  camera_name: string;
  matched_object: string;
  matched_confidence_pct: number;
  matched_count: number;
  motion_pct: number;
  action_type: string;
  action_target: string;
  status: string;
  duration_ms: number;
  result_summary: string;
  fired_at: string;
}

export interface AxonOptionItem {
  id: string;
  name: string;
  domainCode: string;
  category: string;
  description: string;
  defaultInput: Record<string, string>;
}

export interface CameraAnalysisFieldsModel {
  id: string;
  name: string;
  room: string;
  optimization_mode: string;
  min_confidence?: number;
  motion_gate_enabled?: number;
  motion_threshold_pct?: number;
  pixel_diff_threshold?: number;
  ai_input_width?: number;
  log_cooldown_sec?: number;
  high_freq_poll_sec?: number;
  sample_interval_sec: number;
}

export const TRIGGER_OBJECT_CLASSES: Array<{ rawClass: string; label: string }> = [
  { rawClass: 'person', label: 'Person (person)' },
  { rawClass: 'any_vehicle', label: 'Beliebiges Fahrzeug (Auto, LKW, Motorrad, Rad)' },
  { rawClass: 'car', label: 'Auto (car)' },
  { rawClass: 'truck', label: 'LKW / Transporter (truck)' },
  { rawClass: 'bicycle', label: 'Fahrrad (bicycle)' },
  { rawClass: 'motorcycle', label: 'Motorrad (motorcycle)' },
  { rawClass: 'backpack', label: 'Rucksack / Paket (backpack)' },
  { rawClass: 'suitcase', label: 'Koffer / Paket (suitcase)' },
  { rawClass: 'handbag', label: 'Tasche (handbag)' },
  { rawClass: 'any_animal', label: 'Beliebiges Tier (Hund, Katze, Vogel)' },
  { rawClass: 'dog', label: 'Hund (dog)' },
  { rawClass: 'cat', label: 'Katze (cat)' },
  { rawClass: 'bird', label: 'Vogel (bird)' },
  { rawClass: 'any_object', label: 'Beliebiges erkanntes Objekt (alle 80 Klassen)' },
  { rawClass: 'motion_only', label: 'Reine Pixel-Bewegung (ohne KI-Objektzwang)' },
];

const PLACEHOLDER_TOKENS = [
  '{{camera_name}}',
  '{{room}}',
  '{{object_label}}',
  '{{confidence_pct}}',
  '{{count}}',
  '{{motion_pct}}',
  '{{scene_summary}}',
  '{{timestamp}}',
];

function formatTime(iso?: string): string {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleTimeString('de-DE', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
  } catch {
    return '—';
  }
}

/**
 * Per-camera image analysis & threshold configuration fields
 */
export function CameraAnalysisConfigSection<T extends CameraAnalysisFieldsModel>({
  cam,
  onChange,
  compact = false,
}: {
  cam: T;
  onChange: (updated: T) => void;
  compact?: boolean;
}) {
  const minConfPct = Math.round((cam.min_confidence ?? 0.45) * 100);
  const motionGate = (cam.motion_gate_enabled ?? 1) === 1;
  const motionThresh = cam.motion_threshold_pct ?? 2.2;
  const pixelDiff = cam.pixel_diff_threshold ?? 25;
  const aiWidth = cam.ai_input_width ?? 640;
  const highFreqSec = cam.high_freq_poll_sec ?? 3;
  const logCooldownSec = cam.log_cooldown_sec ?? 30;

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: compact ? '10px' : '12px',
        paddingTop: compact ? '4px' : '10px',
        borderTop: '1px solid rgba(255,255,255,0.06)',
      }}
    >
      <div
        style={{
          fontSize: '11px',
          fontWeight: 500,
          letterSpacing: '0.08em',
          textTransform: 'uppercase',
          color: '#52525b',
        }}
      >
        BILDANALYSE & SCHWELLWERTE PRO KAMERA
      </div>

      {/* Motion Gate Toggle */}
      <label
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '10px',
          fontSize: '12px',
          color: '#fafafa',
          cursor: 'pointer',
          padding: '6px 8px',
          background: '#141417',
          border: '1px solid rgba(255,255,255,0.08)',
          borderRadius: '4px',
        }}
      >
        <div>
          <div style={{ fontWeight: 500 }}>Motion-Gate (COCO-SSD nur bei Bewegung)</div>
          <div style={{ fontSize: '11px', color: '#71717a', marginTop: '2px' }}>
            Spart ~90% CPU: KI-Inferenz startet erst bei erkanntem Luma-Bewegungsdelta
          </div>
        </div>
        <input
          type="checkbox"
          checked={motionGate}
          onChange={(e) =>
            onChange({
              ...cam,
              motion_gate_enabled: e.target.checked ? 1 : 0,
            })
          }
        />
      </label>

      {/* Grid of numeric / slider thresholds */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: compact ? '1fr' : '1fr 1fr',
          gap: '10px',
        }}
      >
        {/* Min Confidence */}
        <label style={{ fontSize: '11.5px', color: '#a1a1aa' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
            <span>Min. Objekt-Wahrscheinlichkeit</span>
            <span style={{ fontFamily: "'JetBrains Mono', monospace", color: '#fafafa' }}>
              {minConfPct}%
            </span>
          </div>
          <input
            type="range"
            min={10}
            max={90}
            step={2}
            value={minConfPct}
            onChange={(e) =>
              onChange({
                ...cam,
                min_confidence: Number(e.target.value) / 100,
              })
            }
            style={{ width: '100%', accentColor: '#fafafa' }}
          />
        </label>

        {/* Motion Threshold % */}
        <label style={{ fontSize: '11.5px', color: '#a1a1aa' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
            <span>Bewegungs-Schwelle (Δ Fläche)</span>
            <span style={{ fontFamily: "'JetBrains Mono', monospace", color: '#fafafa' }}>
              {motionThresh}%
            </span>
          </div>
          <input
            type="range"
            min={0.2}
            max={10.0}
            step={0.2}
            value={motionThresh}
            onChange={(e) =>
              onChange({
                ...cam,
                motion_threshold_pct: Number(e.target.value),
              })
            }
            style={{ width: '100%', accentColor: '#fafafa' }}
          />
        </label>

        {/* Pixel Luma Diff */}
        <label style={{ fontSize: '11.5px', color: '#a1a1aa' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
            <span>Pixel-Kontrast-Delta (Luma 4–60)</span>
            <span style={{ fontFamily: "'JetBrains Mono', monospace", color: '#fafafa' }}>
              {pixelDiff}
            </span>
          </div>
          <input
            type="range"
            min={4}
            max={50}
            step={1}
            value={pixelDiff}
            onChange={(e) =>
              onChange({
                ...cam,
                pixel_diff_threshold: Number(e.target.value),
              })
            }
            style={{ width: '100%', accentColor: '#fafafa' }}
          />
        </label>

        {/* AI Input Width */}
        <label style={{ fontSize: '11.5px', color: '#a1a1aa' }}>
          <div style={{ marginBottom: '4px' }}>KI-Tensor-Auflösung (Speed vs. Detail)</div>
          <select
            value={aiWidth}
            onChange={(e) =>
              onChange({
                ...cam,
                ai_input_width: Number(e.target.value),
              })
            }
            style={{
              width: '100%',
              padding: '6px 8px',
              borderRadius: '4px',
              border: '1px solid rgba(255,255,255,0.08)',
              background: '#141417',
              color: '#fafafa',
              fontFamily: "'JetBrains Mono', monospace",
              fontSize: '11.5px',
              boxSizing: 'border-box',
            }}
          >
            <option value={224}>224 px (Ultra-Schnell · Nahbereich)</option>
            <option value={300}>300 px (Basis · Schneller Überblick)</option>
            <option value={416}>416 px (Mittel · Innenraum)</option>
            <option value={640}>640 px + 2-Stufen ROI-Zoom (Empfohlen · HD-Präzision)</option>
            <option value={800}>800 px + 2-Stufen ROI-Zoom (Max. Fernbereich-Details)</option>
          </select>
        </label>

        {/* High-frequency motion check interval */}
        <label style={{ fontSize: '11.5px', color: '#a1a1aa' }}>
          <div style={{ marginBottom: '4px' }}>Hintergrund-Motion-Abtastung (Sek.)</div>
          <input
            type="number"
            min={1}
            max={60}
            value={highFreqSec}
            onChange={(e) =>
              onChange({
                ...cam,
                high_freq_poll_sec: Math.max(1, Number(e.target.value) || 3),
              })
            }
            style={{
              width: '100%',
              padding: '6px 8px',
              borderRadius: '4px',
              border: '1px solid rgba(255,255,255,0.08)',
              background: '#141417',
              color: '#fafafa',
              fontFamily: "'JetBrains Mono', monospace",
              fontSize: '12px',
              boxSizing: 'border-box',
            }}
          />
        </label>

        {/* Log Cooldown */}
        <label style={{ fontSize: '11.5px', color: '#a1a1aa' }}>
          <div style={{ marginBottom: '4px' }}>Protokoll-Sperrzeit / Cooldown (Sek.)</div>
          <input
            type="number"
            min={5}
            max={3600}
            value={logCooldownSec}
            onChange={(e) =>
              onChange({
                ...cam,
                log_cooldown_sec: Math.max(5, Number(e.target.value) || 30),
              })
            }
            style={{
              width: '100%',
              padding: '6px 8px',
              borderRadius: '4px',
              border: '1px solid rgba(255,255,255,0.08)',
              background: '#141417',
              color: '#fafafa',
              fontFamily: "'JetBrains Mono', monospace",
              fontSize: '12px',
              boxSizing: 'border-box',
            }}
          />
        </label>
      </div>
    </div>
  );
}

/**
 * Trigger Configurator View ("Objekt X zu >= p% Wahrscheinlichkeit erkannt => Aktion A ausführen")
 */
export function TriggerConfiguratorView({
  cameras,
  triggers,
  triggerLogs,
  availableAxons,
  onSaveTrigger,
  onToggleTrigger,
  onDeleteTrigger,
  onTestTrigger,
}: {
  cameras: Array<{ id: string; name: string; room: string }>;
  triggers: VisionTriggerItem[];
  triggerLogs: VisionTriggerLogItem[];
  availableAxons: AxonOptionItem[];
  onSaveTrigger: (trig: Partial<VisionTriggerItem>) => Promise<void>;
  onToggleTrigger: (id: number, enabled: boolean) => Promise<void>;
  onDeleteTrigger: (id: number) => Promise<void>;
  onTestTrigger: (id: number) => Promise<void>;
}) {
  const [editingId, setEditingId] = useState<number | null>(null);
  const [name, setName] = useState('Person erkannt -> HA Benachrichtigung');
  const [cameraId, setCameraId] = useState('*');
  const [objectClass, setObjectClass] = useState('person');
  const [minConfidencePct, setMinConfidencePct] = useState(65);
  const [minCount, setMinCount] = useState(1);
  const [minMotionPct, setMinMotionPct] = useState(0.5);
  const [timeWindow, setTimeWindow] = useState('always');
  const [cooldownSec, setCooldownSec] = useState(60);
  const [actionType, setActionType] = useState<VisionTriggerActionType>('axon');
  const [actionTarget, setActionTarget] = useState('ha.call_service');
  const [actionPayloadJson, setActionPayloadJson] = useState(
    JSON.stringify(
      {
        domain: 'persistent_notification',
        service: 'create',
        targetOrMessage:
          '[Vision Trigger] {{count}}× {{object_label}} ({{confidence_pct}}%) auf {{camera_name}} ({{room}}) erkannt · Δ {{motion_pct}}%',
      },
      null,
      2
    )
  );
  const [testingId, setTestingId] = useState<number | null>(null);

  function loadTriggerIntoForm(t: VisionTriggerItem) {
    setEditingId(t.id);
    setName(t.name);
    setCameraId(t.camera_id);
    setObjectClass(t.object_class);
    setMinConfidencePct(t.min_confidence_pct);
    setMinCount(t.min_count || 1);
    setMinMotionPct(t.min_motion_pct ?? 0.5);
    setTimeWindow(t.time_window || 'always');
    setCooldownSec(t.cooldown_sec || 60);
    setActionType(t.action_type);
    setActionTarget(t.action_target);
    try {
      setActionPayloadJson(JSON.stringify(JSON.parse(t.action_payload_json || '{}'), null, 2));
    } catch {
      setActionPayloadJson(t.action_payload_json || '{}');
    }
  }

  function resetForm() {
    setEditingId(null);
    setName('Person erkannt -> HA Benachrichtigung');
    setCameraId('*');
    setObjectClass('person');
    setMinConfidencePct(65);
    setMinCount(1);
    setMinMotionPct(0.5);
    setTimeWindow('always');
    setCooldownSec(60);
    setActionType('axon');
    setActionTarget('ha.call_service');
    setActionPayloadJson(
      JSON.stringify(
        {
          domain: 'persistent_notification',
          service: 'create',
          targetOrMessage:
            '[Vision Trigger] {{count}}× {{object_label}} ({{confidence_pct}}%) auf {{camera_name}} ({{room}}) erkannt',
        },
        null,
        2
      )
    );
  }

  function handleActionTypeChange(nextType: VisionTriggerActionType) {
    setActionType(nextType);
    if (nextType === 'axon') {
      setActionTarget('ha.call_service');
      setActionPayloadJson(
        JSON.stringify(
          {
            domain: 'persistent_notification',
            service: 'create',
            targetOrMessage:
              '[Vision] {{count}}× {{object_label}} ({{confidence_pct}}%) auf {{camera_name}}',
          },
          null,
          2
        )
      );
    } else if (nextType === 'ha_service') {
      setActionTarget('light.turn_on');
      setActionPayloadJson(
        JSON.stringify(
          {
            entity_id: 'light.vorzimmer_og_alert_led',
            brightness_pct: 100,
          },
          null,
          2
        )
      );
    } else if (nextType === 'ha_event') {
      setActionTarget('thassi_camera_vision_trigger');
      setActionPayloadJson(JSON.stringify({ severity: 'info', source: 'camera-vision' }, null, 2));
    } else {
      setActionTarget('workflow.vision_event');
      setActionPayloadJson(
        JSON.stringify(
          {
            workflowHint: 'vision_object_detected',
            summary: '{{object_label}} ({{confidence_pct}}%) auf {{camera_name}}',
          },
          null,
          2
        )
      );
    }
  }

  function handleAxonSelect(axonId: string) {
    setActionTarget(axonId);
    const found = availableAxons.find((a) => a.id === axonId);
    if (found && found.defaultInput) {
      setActionPayloadJson(JSON.stringify(found.defaultInput, null, 2));
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    await onSaveTrigger({
      id: editingId ?? undefined,
      name,
      enabled: 1,
      camera_id: cameraId,
      object_class: objectClass,
      min_confidence_pct: minConfidencePct,
      min_count: minCount,
      min_motion_pct: minMotionPct,
      time_window: timeWindow,
      cooldown_sec: cooldownSec,
      action_type: actionType,
      action_target: actionTarget,
      action_payload_json: actionPayloadJson,
    });
    resetForm();
  }

  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: 'minmax(0, 1.35fr) minmax(360px, 0.95fr)',
        gap: '32px',
        alignItems: 'start',
      }}
    >
      {/* LEFT COLUMN: ACTIVE TRIGGER RULES + AUDIT LOG */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '32px' }}>
        <div>
          <div
            style={{
              fontSize: '11px',
              fontWeight: 500,
              letterSpacing: '0.08em',
              textTransform: 'uppercase',
              color: '#52525b',
              marginBottom: '12px',
              display: 'flex',
              justifyContent: 'space-between',
            }}
          >
            <span>KONFIGURIERTE OBJEKT- & AKTIONSTRIGGER ({triggers.length})</span>
            <span>WENN OBJEKT X &ge; P% &rArr; AKTION A</span>
          </div>

          <div style={{ borderTop: '1px solid rgba(255,255,255,0.06)' }}>
            {triggers.length === 0 ? (
              <div style={{ padding: '24px 0', color: '#71717a', fontSize: '13px' }}>
                Noch keine Trigger konfiguriert. Rechts im Editor eine neue Regel anlegen.
              </div>
            ) : (
              triggers.map((t) => {
                const camLabel =
                  t.camera_id === '*'
                    ? 'Alle Kameras (*)'
                    : cameras.find((c) => c.id === t.camera_id)?.name || t.camera_id;
                const clsLabel =
                  TRIGGER_OBJECT_CLASSES.find((c) => c.rawClass === t.object_class)?.label.split(
                    ' ('
                  )[0] || t.object_class;
                const isSelected = editingId === t.id;

                return (
                  <div
                    key={t.id}
                    style={{
                      padding: '14px 10px',
                      borderBottom: '1px solid rgba(255,255,255,0.06)',
                      background: isSelected ? '#111113' : 'transparent',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '8px',
                    }}
                  >
                    <div
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        gap: '12px',
                        flexWrap: 'wrap',
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                        <span
                          style={{
                            width: '6px',
                            height: '6px',
                            borderRadius: '50%',
                            background: t.enabled
                              ? t.last_status === 'error'
                                ? '#ef4444'
                                : '#10b981'
                              : '#52525b',
                            flexShrink: 0,
                          }}
                        />
                        <span style={{ fontSize: '13.5px', fontWeight: 500, color: '#fafafa' }}>
                          {t.name}
                        </span>
                      </div>

                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <button
                          onClick={async () => {
                            setTestingId(t.id);
                            try {
                              await onTestTrigger(t.id);
                            } finally {
                              setTestingId(null);
                            }
                          }}
                          disabled={testingId === t.id}
                          style={{
                            background: 'transparent',
                            color: '#fafafa',
                            border: '1px solid rgba(255,255,255,0.12)',
                            borderRadius: '3px',
                            padding: '3px 8px',
                            fontSize: '11px',
                            cursor: 'pointer',
                          }}
                          title="Regel sofort mit Testdaten ausführen"
                        >
                          {testingId === t.id ? 'Teste…' : 'Testlauf'}
                        </button>
                        <button
                          onClick={() => onToggleTrigger(t.id, !t.enabled)}
                          style={{
                            background: 'transparent',
                            color: t.enabled ? '#10b981' : '#71717a',
                            border: '1px solid rgba(255,255,255,0.08)',
                            borderRadius: '3px',
                            padding: '3px 8px',
                            fontSize: '11px',
                            fontFamily: "'JetBrains Mono', monospace",
                            cursor: 'pointer',
                          }}
                        >
                          {t.enabled ? 'AKTIV' : 'PAUSIERT'}
                        </button>
                        <button
                          onClick={() => loadTriggerIntoForm(t)}
                          style={{
                            background: 'transparent',
                            color: '#a1a1aa',
                            border: '1px solid rgba(255,255,255,0.08)',
                            borderRadius: '3px',
                            padding: '3px 8px',
                            fontSize: '11px',
                            cursor: 'pointer',
                          }}
                        >
                          Bearbeiten
                        </button>
                        <button
                          onClick={() => onDeleteTrigger(t.id)}
                          style={{
                            background: 'transparent',
                            color: '#71717a',
                            border: '1px solid rgba(255,255,255,0.06)',
                            borderRadius: '3px',
                            padding: '3px 8px',
                            fontSize: '11px',
                            cursor: 'pointer',
                          }}
                        >
                          ✕
                        </button>
                      </div>
                    </div>

                    {/* Rule Condition -> Action Formula */}
                    <div
                      style={{
                        fontFamily: "'JetBrains Mono', monospace",
                        fontSize: '11.5px',
                        color: '#a1a1aa',
                        display: 'flex',
                        flexWrap: 'wrap',
                        gap: '8px',
                        alignItems: 'center',
                      }}
                    >
                      <span style={{ color: '#fafafa' }}>
                        WENN [{clsLabel}] &ge; {t.min_confidence_pct}%
                      </span>
                      {t.min_count > 1 && <span>(&ge; {t.min_count}×)</span>}
                      {t.min_motion_pct > 0 && <span>· Δ &ge; {t.min_motion_pct}%</span>}
                      <span>AUF [{camLabel}]</span>
                      <span style={{ color: '#52525b' }}>&rArr;</span>
                      <span style={{ color: '#e4e4e7' }}>
                        {t.action_type.toUpperCase()}: {t.action_target}
                      </span>
                      <span style={{ color: '#52525b' }}>
                        (Cooldown {t.cooldown_sec}s · Zeit: {t.time_window})
                      </span>
                    </div>

                    {/* Execution telemetry */}
                    <div
                      style={{
                        fontSize: '11px',
                        fontFamily: "'JetBrains Mono', monospace",
                        color: '#52525b',
                        display: 'flex',
                        justifyContent: 'space-between',
                        gap: '12px',
                        flexWrap: 'wrap',
                      }}
                    >
                      <span>
                        Auslösungen: {t.trigger_count} · Zuletzt:{' '}
                        {t.last_triggered_at ? formatTime(t.last_triggered_at) : 'Noch nie'}
                      </span>
                      {t.last_result && (
                        <span
                          style={{
                            color: t.last_status === 'error' ? '#ef4444' : '#71717a',
                            maxWidth: '460px',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap',
                          }}
                        >
                          {t.last_result}
                        </span>
                      )}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* TRIGGER AUDIT LOG */}
        <div>
          <div
            style={{
              fontSize: '11px',
              fontWeight: 500,
              letterSpacing: '0.08em',
              textTransform: 'uppercase',
              color: '#52525b',
              marginBottom: '12px',
            }}
          >
            AUSGELÖSTE AKTIONEN & TRIGGER-PROTOKOLL ({triggerLogs.length})
          </div>

          <div style={{ borderTop: '1px solid rgba(255,255,255,0.06)' }}>
            {triggerLogs.length === 0 ? (
              <div style={{ padding: '16px 0', color: '#52525b', fontSize: '12.5px' }}>
                Noch keine Trigger-Ausführungen protokolliert. Klicke oben bei einer Regel auf
                „Testlauf“, um die Aktionskette live zu prüfen.
              </div>
            ) : (
              triggerLogs.map((log) => (
                <div
                  key={log.id}
                  style={{
                    padding: '10px 0',
                    borderBottom: '1px solid rgba(255,255,255,0.06)',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'baseline',
                    gap: '12px',
                    flexWrap: 'wrap',
                    fontSize: '12px',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', minWidth: 0 }}>
                    <span
                      style={{
                        width: '6px',
                        height: '6px',
                        borderRadius: '50%',
                        background: log.status === 'success' ? '#10b981' : '#ef4444',
                        flexShrink: 0,
                      }}
                    />
                    <span style={{ color: '#fafafa', fontWeight: 500 }}>{log.trigger_name}</span>
                    <span
                      style={{
                        color: '#a1a1aa',
                        fontFamily: "'JetBrains Mono', monospace",
                        fontSize: '11px',
                      }}
                    >
                      {log.camera_name} · {log.matched_count}× {log.matched_object} (
                      {log.matched_confidence_pct}%)
                    </span>
                  </div>

                  <div
                    style={{
                      fontFamily: "'JetBrains Mono', monospace",
                      fontSize: '11px',
                      color: '#71717a',
                    }}
                  >
                    {log.result_summary} · {log.duration_ms} ms · {formatTime(log.fired_at)}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      {/* RIGHT COLUMN: TRIGGER RULE EDITOR (THASSI SYSTEM INTEGRATION) */}
      <form
        onSubmit={handleSubmit}
        style={{
          background: '#111113',
          border: '1px solid rgba(255,255,255,0.08)',
          padding: '20px',
          borderRadius: '4px',
          display: 'flex',
          flexDirection: 'column',
          gap: '14px',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div
            style={{
              fontSize: '11px',
              fontWeight: 500,
              letterSpacing: '0.08em',
              textTransform: 'uppercase',
              color: '#fafafa',
            }}
          >
            {editingId ? `TRIGGER #${editingId} BEARBEITEN` : 'NEUEN VISION-TRIGGER ERSTELLEN'}
          </div>
          {editingId && (
            <button
              type="button"
              onClick={resetForm}
              style={{
                background: 'none',
                border: 'none',
                color: '#a1a1aa',
                fontSize: '11px',
                cursor: 'pointer',
              }}
            >
              + Neu anlegen
            </button>
          )}
        </div>

        <label style={{ fontSize: '12px', color: '#a1a1aa' }}>
          Regel-Bezeichnung
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            style={{
              width: '100%',
              marginTop: '4px',
              padding: '7px 10px',
              borderRadius: '4px',
              border: '1px solid rgba(255,255,255,0.08)',
              background: '#141417',
              color: '#fafafa',
              fontSize: '12.5px',
              boxSizing: 'border-box',
            }}
          />
        </label>

        {/* SECTION 1: CONDITION (WENN OBJEKT X >= P%) */}
        <div
          style={{
            paddingTop: '10px',
            borderTop: '1px solid rgba(255,255,255,0.06)',
            display: 'flex',
            flexDirection: 'column',
            gap: '10px',
          }}
        >
          <div
            style={{
              fontSize: '10.5px',
              fontWeight: 500,
              letterSpacing: '0.08em',
              textTransform: 'uppercase',
              color: '#52525b',
            }}
          >
            1. BEDINGUNG (WENN OBJEKT X &ge; P% ERKANNT)
          </div>

          <label style={{ fontSize: '12px', color: '#a1a1aa' }}>
            Überwachte Kamera
            <select
              value={cameraId}
              onChange={(e) => setCameraId(e.target.value)}
              style={{
                width: '100%',
                marginTop: '4px',
                padding: '7px 10px',
                borderRadius: '4px',
                border: '1px solid rgba(255,255,255,0.08)',
                background: '#141417',
                color: '#fafafa',
                fontFamily: "'JetBrains Mono', monospace",
                fontSize: '12px',
              }}
            >
              <option value="*">* — Alle aktiven Kameras</option>
              {cameras.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name} ({c.room})
                </option>
              ))}
            </select>
          </label>

          <label style={{ fontSize: '12px', color: '#a1a1aa' }}>
            Erkanntes Objekt (Klasse X)
            <select
              value={objectClass}
              onChange={(e) => setObjectClass(e.target.value)}
              style={{
                width: '100%',
                marginTop: '4px',
                padding: '7px 10px',
                borderRadius: '4px',
                border: '1px solid rgba(255,255,255,0.08)',
                background: '#141417',
                color: '#fafafa',
                fontFamily: "'JetBrains Mono', monospace",
                fontSize: '12px',
              }}
            >
              {TRIGGER_OBJECT_CLASSES.map((cls) => (
                <option key={cls.rawClass} value={cls.rawClass}>
                  {cls.label}
                </option>
              ))}
            </select>
          </label>

          <label style={{ fontSize: '12px', color: '#a1a1aa' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
              <span>Mindest-Wahrscheinlichkeit (&ge; p%)</span>
              <span style={{ fontFamily: "'JetBrains Mono', monospace", color: '#fafafa' }}>
                &ge; {minConfidencePct}%
              </span>
            </div>
            <input
              type="range"
              min={15}
              max={95}
              step={5}
              value={minConfidencePct}
              onChange={(e) => setMinConfidencePct(Number(e.target.value))}
              style={{ width: '100%', accentColor: '#fafafa' }}
            />
          </label>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
            <label style={{ fontSize: '11.5px', color: '#a1a1aa' }}>
              Mindest-Anzahl (&ge; N)
              <input
                type="number"
                min={1}
                max={20}
                value={minCount}
                onChange={(e) => setMinCount(Math.max(1, Number(e.target.value) || 1))}
                style={{
                  width: '100%',
                  marginTop: '4px',
                  padding: '6px 8px',
                  borderRadius: '4px',
                  border: '1px solid rgba(255,255,255,0.08)',
                  background: '#141417',
                  color: '#fafafa',
                  fontFamily: "'JetBrains Mono', monospace",
                  fontSize: '12px',
                  boxSizing: 'border-box',
                }}
              />
            </label>

            <label style={{ fontSize: '11.5px', color: '#a1a1aa' }}>
              Min. Bewegung (Δ %)
              <input
                type="number"
                min={0}
                max={30}
                step={0.2}
                value={minMotionPct}
                onChange={(e) => setMinMotionPct(Math.max(0, Number(e.target.value) || 0))}
                style={{
                  width: '100%',
                  marginTop: '4px',
                  padding: '6px 8px',
                  borderRadius: '4px',
                  border: '1px solid rgba(255,255,255,0.08)',
                  background: '#141417',
                  color: '#fafafa',
                  fontFamily: "'JetBrains Mono', monospace",
                  fontSize: '12px',
                  boxSizing: 'border-box',
                }}
              />
            </label>

            <label style={{ fontSize: '11.5px', color: '#a1a1aa' }}>
              Zeitfenster
              <select
                value={timeWindow}
                onChange={(e) => setTimeWindow(e.target.value)}
                style={{
                  width: '100%',
                  marginTop: '4px',
                  padding: '6px 8px',
                  borderRadius: '4px',
                  border: '1px solid rgba(255,255,255,0.08)',
                  background: '#141417',
                  color: '#fafafa',
                  fontFamily: "'JetBrains Mono', monospace",
                  fontSize: '11.5px',
                  boxSizing: 'border-box',
                }}
              >
                <option value="always">Immer (24/7)</option>
                <option value="night">Nur Nachts (22:00–06:00)</option>
                <option value="day">Nur Tagsüber (06:00–22:00)</option>
              </select>
            </label>

            <label style={{ fontSize: '11.5px', color: '#a1a1aa' }}>
              Cooldown / Sperrzeit (Sek.)
              <input
                type="number"
                min={5}
                max={86400}
                value={cooldownSec}
                onChange={(e) => setCooldownSec(Math.max(5, Number(e.target.value) || 60))}
                style={{
                  width: '100%',
                  marginTop: '4px',
                  padding: '6px 8px',
                  borderRadius: '4px',
                  border: '1px solid rgba(255,255,255,0.08)',
                  background: '#141417',
                  color: '#fafafa',
                  fontFamily: "'JetBrains Mono', monospace",
                  fontSize: '12px',
                  boxSizing: 'border-box',
                }}
              />
            </label>
          </div>
        </div>

        {/* SECTION 2: ACTION (=> AKTION A IM THASSI-SYSTEM AUSFÜHREN) */}
        <div
          style={{
            paddingTop: '10px',
            borderTop: '1px solid rgba(255,255,255,0.06)',
            display: 'flex',
            flexDirection: 'column',
            gap: '10px',
          }}
        >
          <div
            style={{
              fontSize: '10.5px',
              fontWeight: 500,
              letterSpacing: '0.08em',
              textTransform: 'uppercase',
              color: '#52525b',
            }}
          >
            2. AKTION (THASSI AXON / HOME ASSISTANT / WORKFLOW)
          </div>

          <label style={{ fontSize: '12px', color: '#a1a1aa' }}>
            Aktions-Zielsystem
            <select
              value={actionType}
              onChange={(e) => handleActionTypeChange(e.target.value as VisionTriggerActionType)}
              style={{
                width: '100%',
                marginTop: '4px',
                padding: '7px 10px',
                borderRadius: '4px',
                border: '1px solid rgba(255,255,255,0.08)',
                background: '#141417',
                color: '#fafafa',
                fontFamily: "'JetBrains Mono', monospace",
                fontSize: '12px',
              }}
            >
              <option value="axon">Thassi Axon ausführen (HA, Gmail, Kalender, Memo, Cortex, HTTP)</option>
              <option value="ha_service">Home Assistant Dienst direkt schalten (Licht, Schalter, Skript)</option>
              <option value="ha_event">Home Assistant Event-Bus (thassi_camera_vision_trigger)</option>
              <option value="orchestrator_event">Thassi Orchestrator & Workflow-Bus Event</option>
            </select>
          </label>

          {actionType === 'axon' ? (
            <label style={{ fontSize: '12px', color: '#a1a1aa' }}>
              Auszuführendes Thassi Axon ({availableAxons.length} verfügbar)
              <select
                value={actionTarget}
                onChange={(e) => handleAxonSelect(e.target.value)}
                style={{
                  width: '100%',
                  marginTop: '4px',
                  padding: '7px 10px',
                  borderRadius: '4px',
                  border: '1px solid rgba(255,255,255,0.08)',
                  background: '#141417',
                  color: '#fafafa',
                  fontFamily: "'JetBrains Mono', monospace",
                  fontSize: '12px',
                }}
              >
                {availableAxons.map((ax) => (
                  <option key={ax.id} value={ax.id}>
                    [{ax.domainCode}] {ax.id} — {ax.name}
                  </option>
                ))}
              </select>
            </label>
          ) : (
            <label style={{ fontSize: '12px', color: '#a1a1aa' }}>
              {actionType === 'ha_service'
                ? 'Home Assistant Dienst (domain.service)'
                : 'Event-Kennung / Ziel'}
              <input
                value={actionTarget}
                onChange={(e) => setActionTarget(e.target.value)}
                placeholder={
                  actionType === 'ha_service'
                    ? 'light.turn_on / switch.turn_on / persistent_notification.create'
                    : 'thassi_camera_vision_trigger'
                }
                style={{
                  width: '100%',
                  marginTop: '4px',
                  padding: '7px 10px',
                  borderRadius: '4px',
                  border: '1px solid rgba(255,255,255,0.08)',
                  background: '#141417',
                  color: '#fafafa',
                  fontFamily: "'JetBrains Mono', monospace",
                  fontSize: '12px',
                  boxSizing: 'border-box',
                }}
              />
            </label>
          )}

          <label style={{ fontSize: '12px', color: '#a1a1aa' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
              <span>Aktions-Parameter (JSON mit Live-Variablen)</span>
            </div>
            <textarea
              rows={5}
              value={actionPayloadJson}
              onChange={(e) => setActionPayloadJson(e.target.value)}
              style={{
                width: '100%',
                padding: '8px 10px',
                borderRadius: '4px',
                border: '1px solid rgba(255,255,255,0.08)',
                background: '#141417',
                color: '#fafafa',
                fontFamily: "'JetBrains Mono', monospace",
                fontSize: '11.5px',
                lineHeight: 1.5,
                boxSizing: 'border-box',
                resize: 'vertical',
              }}
            />
          </label>

          {/* Clickable variable pills */}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
            {PLACEHOLDER_TOKENS.map((tok) => (
              <button
                key={tok}
                type="button"
                onClick={() => setActionPayloadJson((prev) => `${prev}${tok}`)}
                style={{
                  background: '#141417',
                  color: '#a1a1aa',
                  border: '1px solid rgba(255,255,255,0.06)',
                  borderRadius: '3px',
                  padding: '2px 6px',
                  fontSize: '10.5px',
                  fontFamily: "'JetBrains Mono', monospace",
                  cursor: 'pointer',
                }}
                title="Klicken zum Einfügen"
              >
                {tok}
              </button>
            ))}
          </div>
        </div>

        <button
          type="submit"
          style={{
            marginTop: '4px',
            background: '#fafafa',
            color: '#09090b',
            border: 'none',
            borderRadius: '4px',
            padding: '8px 16px',
            fontSize: '12.5px',
            fontWeight: 600,
            cursor: 'pointer',
          }}
        >
          {editingId ? 'Trigger-Regel aktualisieren' : 'Trigger-Regel speichern & aktivieren'}
        </button>
      </form>
    </div>
  );
}

/**
 * Real-Time Performance Monitor View (Leistungsmonitor)
 */
export function PerformanceMonitorView({
  perf,
  cameras,
  highFreqEnabled,
  onToggleHighFreq,
  onRefreshPerf,
  onOpenCameraConfig,
}: {
  perf: PerformanceSnapshot | null;
  cameras: Array<{
    id: string;
    name: string;
    room: string;
    min_confidence?: number;
    motion_gate_enabled?: number;
    motion_threshold_pct?: number;
    ai_input_width?: number;
    high_freq_poll_sec?: number;
  }>;
  highFreqEnabled: boolean;
  onToggleHighFreq: (enabled: boolean) => Promise<void>;
  onRefreshPerf: () => Promise<void>;
  onOpenCameraConfig: (camId: string) => void;
}) {
  useEffect(() => {
    const t = setInterval(() => {
      void onRefreshPerf();
    }, 3000);
    return () => clearInterval(t);
  }, [onRefreshPerf]);

  if (!perf) {
    return (
      <div style={{ padding: '24px 0', color: '#71717a', fontSize: '13px' }}>
        Lade Pipeline-Telemetrie…
      </div>
    );
  }

  const camMap = new Map(cameras.map((c) => [c.id, c]));

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '32px' }}>
      {/* HERO METRICS STRIP */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
          gap: '24px',
          paddingBottom: '24px',
          borderBottom: '1px solid rgba(255,255,255,0.06)',
        }}
      >
        <div>
          <div
            style={{
              fontSize: '11px',
              fontWeight: 500,
              letterSpacing: '0.08em',
              textTransform: 'uppercase',
              color: '#52525b',
              marginBottom: '6px',
            }}
          >
            MOTION-GATE EINSPARUNG
          </div>
          <div
            style={{
              fontSize: '28px',
              fontWeight: 400,
              letterSpacing: '-0.03em',
              color: '#10b981',
              fontFamily: "'JetBrains Mono', monospace",
            }}
          >
            {perf.motionGateSkipRatePct}%
          </div>
          <div style={{ fontSize: '12px', color: '#71717a', marginTop: '4px' }}>
            {perf.totalMotionGateSkips} von {perf.totalLumaChecks} Checks übersprungen (~
            {perf.savedCpuSeconds}s CPU gespart)
          </div>
        </div>

        <div>
          <div
            style={{
              fontSize: '11px',
              fontWeight: 500,
              letterSpacing: '0.08em',
              textTransform: 'uppercase',
              color: '#52525b',
              marginBottom: '6px',
            }}
          >
            Ø LUMA-MOTION-CHECK
          </div>
          <div
            style={{
              fontSize: '28px',
              fontWeight: 400,
              letterSpacing: '-0.03em',
              color: '#fafafa',
              fontFamily: "'JetBrains Mono', monospace",
            }}
          >
            {perf.avgLumaMs} ms
          </div>
          <div style={{ fontSize: '12px', color: '#71717a', marginTop: '4px' }}>
            48×27 Luma-Raster · Ø Decode: {perf.avgDecodeMs} ms
          </div>
        </div>

        <div>
          <div
            style={{
              fontSize: '11px',
              fontWeight: 500,
              letterSpacing: '0.08em',
              textTransform: 'uppercase',
              color: '#52525b',
              marginBottom: '6px',
            }}
          >
            Ø COCO-SSD INFERENZ
          </div>
          <div
            style={{
              fontSize: '28px',
              fontWeight: 400,
              letterSpacing: '-0.03em',
              color: '#fafafa',
              fontFamily: "'JetBrains Mono', monospace",
            }}
          >
            {perf.avgInferenceMs} ms
          </div>
          <div style={{ fontSize: '12px', color: '#71717a', marginTop: '4px' }}>
            {perf.totalCocoRuns} KI-Durchläufe · {perf.totalTriggersFired} Trigger ausgelöst
          </div>
        </div>

        <div>
          <div
            style={{
              fontSize: '11px',
              fontWeight: 500,
              letterSpacing: '0.08em',
              textTransform: 'uppercase',
              color: '#52525b',
              marginBottom: '6px',
            }}
          >
            SPEICHER & TENSORFLOW.JS
          </div>
          <div
            style={{
              fontSize: '28px',
              fontWeight: 400,
              letterSpacing: '-0.03em',
              color: '#fafafa',
              fontFamily: "'JetBrains Mono', monospace",
            }}
          >
            {perf.memory.heapUsedMb} MB
          </div>
          <div style={{ fontSize: '12px', color: '#71717a', marginTop: '4px' }}>
            RSS {perf.memory.rssMb} MB · {perf.memory.tfTensors} Tensoren ({perf.memory.tfBytesMb}{' '}
            MB · {perf.memory.tfBackend.toUpperCase()})
          </div>
        </div>

        <div>
          <div
            style={{
              fontSize: '11px',
              fontWeight: 500,
              letterSpacing: '0.08em',
              textTransform: 'uppercase',
              color: '#52525b',
              marginBottom: '6px',
            }}
          >
            RAW-STREAM INGEST
          </div>
          <div
            style={{
              fontSize: '28px',
              fontWeight: 400,
              letterSpacing: '-0.03em',
              color: '#fafafa',
              fontFamily: "'JetBrains Mono', monospace",
            }}
          >
            {perf.totalFramesIngested}
          </div>
          <div style={{ fontSize: '12px', color: '#71717a', marginTop: '4px' }}>
            {perf.activeStreamWorkers} aktive MJPEG-Worker · {perf.totalFramesDecoded} dekodiert
          </div>
        </div>
      </div>

      {/* PIPELINE ARCHITECTURE CONTROL BAR */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: '16px',
          padding: '14px 16px',
          background: '#111113',
          border: '1px solid rgba(255,255,255,0.08)',
          borderRadius: '4px',
        }}
      >
        <div>
          <div style={{ fontSize: '13px', fontWeight: 500, color: '#fafafa' }}>
            Hochfrequente Hintergrund-Abtastung (Motion-Gated Pipeline)
          </div>
          <div style={{ fontSize: '12px', color: '#a1a1aa', marginTop: '2px' }}>
            Prüft aktive Kameras im Sekunden-Takt auf Pixel-Bewegung (~0,5 ms) und startet COCO-SSD
            nur bei überschrittenem Kamera-Schwellwert.
          </div>
        </div>

        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
          <button
            onClick={() => onToggleHighFreq(!highFreqEnabled)}
            style={{
              background: highFreqEnabled ? '#fafafa' : 'transparent',
              color: highFreqEnabled ? '#09090b' : '#fafafa',
              border: '1px solid rgba(255,255,255,0.16)',
              borderRadius: '4px',
              padding: '6px 14px',
              fontSize: '12px',
              fontWeight: 500,
              cursor: 'pointer',
            }}
          >
            {highFreqEnabled ? 'High-Freq Sampler: AKTIV' : 'High-Freq Sampler: PAUSIERT'}
          </button>
          <button
            onClick={onRefreshPerf}
            style={{
              background: 'transparent',
              color: '#a1a1aa',
              border: '1px solid rgba(255,255,255,0.08)',
              borderRadius: '4px',
              padding: '6px 12px',
              fontSize: '12px',
              cursor: 'pointer',
            }}
          >
            Aktualisieren
          </button>
        </div>
      </div>

      {/* PER-CAMERA TELEMETRY & THRESHOLD OVERVIEW TABLE */}
      <div>
        <div
          style={{
            fontSize: '11px',
            fontWeight: 500,
            letterSpacing: '0.08em',
            textTransform: 'uppercase',
            color: '#52525b',
            marginBottom: '12px',
          }}
        >
          LEISTUNGS- & SCHWELLWERT-MATRIX PRO KAMERA
        </div>

        <div style={{ borderTop: '1px solid rgba(255,255,255,0.06)' }}>
          {cameras.map((cam) => {
            const st = perf.cameraBreakdown.find((b) => b.cameraId === cam.id);
            const gateOn = (cam.motion_gate_enabled ?? 1) === 1;
            return (
              <div
                key={cam.id}
                style={{
                  padding: '12px 0',
                  borderBottom: '1px solid rgba(255,255,255,0.06)',
                  display: 'grid',
                  gridTemplateColumns: 'minmax(200px, 1.4fr) minmax(180px, 1.1fr) minmax(220px, 1.3fr) auto',
                  gap: '16px',
                  alignItems: 'center',
                  fontSize: '12.5px',
                }}
              >
                {/* Col 1: Camera Identity & Worker */}
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span
                      style={{
                        width: '6px',
                        height: '6px',
                        borderRadius: '50%',
                        background: st?.streamWorkerActive ? '#10b981' : '#52525b',
                      }}
                    />
                    <span style={{ fontWeight: 500, color: '#fafafa' }}>{cam.name}</span>
                  </div>
                  <div
                    style={{
                      fontSize: '11px',
                      color: '#71717a',
                      fontFamily: "'JetBrains Mono', monospace",
                      marginTop: '3px',
                    }}
                  >
                    {cam.id} · Poll {cam.high_freq_poll_sec ?? 3}s · Tensor {cam.ai_input_width ?? 300}px
                  </div>
                </div>

                {/* Col 2: Configured Thresholds */}
                <div
                  style={{
                    fontFamily: "'JetBrains Mono', monospace",
                    fontSize: '11.5px',
                    color: '#a1a1aa',
                  }}
                >
                  <div>
                    Gate: <span style={{ color: gateOn ? '#10b981' : '#f59e0b' }}>{gateOn ? 'AN' : 'AUS'}</span> · Δ &ge;{' '}
                    {cam.motion_threshold_pct ?? 0.8}%
                  </div>
                  <div style={{ color: '#71717a', marginTop: '2px' }}>
                    Konfidenz &ge; {Math.round((cam.min_confidence ?? 0.25) * 100)}%
                  </div>
                </div>

                {/* Col 3: Live Counters & Latencies */}
                <div
                  style={{
                    fontFamily: "'JetBrains Mono', monospace",
                    fontSize: '11.5px',
                    color: '#a1a1aa',
                  }}
                >
                  <div>
                    Raw: {st?.framesIngested ?? 0} · Luma: {st?.lumaChecks ?? 0} · KI:{' '}
                    {st?.cocoRuns ?? 0} (Skip {st?.skipRatePct ?? 0}%)
                  </div>
                  <div style={{ color: '#71717a', marginTop: '2px' }}>
                    Decode {st?.lastDecodeMs ?? 0}ms · Luma {st?.lastLumaMs ?? 0}ms · KI{' '}
                    {st?.lastInferenceMs ?? 0}ms · Δ {st?.lastMotionPct ?? 0}%
                  </div>
                </div>

                {/* Col 4: Action */}
                <button
                  onClick={() => onOpenCameraConfig(cam.id)}
                  style={{
                    background: 'transparent',
                    color: '#fafafa',
                    border: '1px solid rgba(255,255,255,0.12)',
                    borderRadius: '4px',
                    padding: '5px 10px',
                    fontSize: '11.5px',
                    cursor: 'pointer',
                    whiteSpace: 'nowrap',
                  }}
                >
                  Schwellwerte ⚙
                </button>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
