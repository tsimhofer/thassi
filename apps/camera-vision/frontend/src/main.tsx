import React, { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { createAppClient } from '@thassi/sdk/client';

const client = createAppClient('camera-vision');

type OptimizationMode = 'Personen' | 'Fahrzeuge' | 'Objekte' | 'Kamera' | 'Aktivitäten';

const MODES: OptimizationMode[] = ['Personen', 'Fahrzeuge', 'Objekte', 'Kamera', 'Aktivitäten'];

const MODE_META: Record<OptimizationMode, { icon: string; desc: string; color: string }> = {
  Personen: { icon: '👤', desc: 'Personenerkennung & Positions-Tracking', color: '#38bdf8' },
  Fahrzeuge: { icon: '🚗', desc: 'Autos, LKW, Motorräder & Fahrräder', color: '#fbbf24' },
  Objekte: { icon: '📦', desc: 'Alle 80 COCO-Objektklassen, Pakete & Tiere', color: '#a855f7' },
  Kamera: { icon: '🎥', desc: 'Bildschärfe, Kontrast, Tag/Nacht & Sabotage-Check', color: '#4ade80' },
  Aktivitäten: { icon: '🏃', desc: 'Pixel-Bewegungs-Delta + Zonen- & Objekt-Tracking', color: '#fb923c' },
};

interface DetectedObject {
  label: string;
  rawClass?: string;
  confidence: number;
  count: number;
  details?: string;
}

interface CameraItem {
  id: string;
  name: string;
  room: string;
  source_type: string;
  stream_url: string;
  lan_ip: string;
  enabled: number;
  sample_interval_sec: number;
  optimization_mode: OptimizationMode;
  last_sampled_at: string;
  last_status: string;
  last_error: string;
  ha_state: string;
  lan_reachable_6668: boolean;
  lan_reachable_554: boolean;
}

interface DetectionRecord {
  id: number;
  camera_id: string;
  camera_name: string;
  optimization_mode: OptimizationMode;
  sampled_at: string;
  status: string;
  objects: DetectedObject[];
  metrics?: {
    luminancePct?: number;
    contrastScore?: number;
    sharpnessScore?: number;
    lightingMode?: string;
    occlusionAlert?: boolean;
    motionPct?: number;
    activeMotionZone?: string;
  };
  total_objects: number;
  person_count: number;
  vehicle_count: number;
  motion_pct: number;
  scene_summary: string;
  engine_used: string;
  processing_ms: number;
  snapshot_b64: string;
}

interface DashboardPayload {
  config: {
    cyclicEnabled: boolean;
    intervalSeconds: number;
    visionEngine: string;
    go2rtcUrl: string;
  };
  optimizationModes: OptimizationMode[];
  go2rtc: {
    online: boolean;
    url: string;
    streams: Record<string, unknown>;
  };
  cameras: CameraItem[];
  detections: DetectionRecord[];
}

function CameraVisionApp() {
  const [data, setData] = useState<DashboardPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [samplingId, setSamplingId] = useState<string | null>(null);
  const [editingCam, setEditingCam] = useState<CameraItem | null>(null);
  const [intervalInput, setIntervalInput] = useState(180);
  const [testMode, setTestMode] = useState<OptimizationMode>('Personen');
  const [statusMsg, setStatusMsg] = useState('');
  const [tuyaAuth, setTuyaAuth] = useState<{
    storedUserCode: string;
    storedEntryTitle: string;
    activeFlowId: string | null;
    qrData: string;
  } | null>(null);
  const [onvifIp, setOnvifIp] = useState('192.168.188.140');
  const [onvifPass, setOnvifPass] = useState('');

  async function refresh() {
    try {
      const [res, authRes] = await Promise.all([
        client.get<DashboardPayload>('/dashboard'),
        client
          .get<{
            storedUserCode: string;
            storedEntryTitle: string;
            activeFlowId: string | null;
            qrData: string;
          }>('/tuya-reauth')
          .catch(() => null),
      ]);
      setData(res);
      if (authRes) setTuyaAuth(authRes);
      if (res.config?.intervalSeconds) setIntervalInput(res.config.intervalSeconds);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void refresh();
    const timer = setInterval(refresh, 15000);
    return () => clearInterval(timer);
  }, []);

  async function refreshTuyaQrCode() {
    setStatusMsg('Generiere frischen 5-Minuten QR-Code für LSC / Tuya…');
    const res = await client.post<{
      storedUserCode: string;
      storedEntryTitle: string;
      activeFlowId: string | null;
      qrData: string;
    }>('/tuya-reauth-refresh', {});
    setTuyaAuth(res);
    setStatusMsg('Neuer QR-Code bereit! Bitte jetzt mit der App scannen.');
  }

  async function confirmTuyaQrScanned() {
    setStatusMsg('Prüfe QR-Code-Bestätigung bei Home Assistant & aktiviere LSC Smart PTZ Camera 2…');
    const res = await client.post<{ status: number; body?: { type?: string; errors?: Record<string, string> } }>(
      '/tuya-reauth',
      { flow_id: tuyaAuth?.activeFlowId }
    );
    if (res.body?.errors) {
      setStatusMsg('QR-Code wurde in der App noch nicht bestätigt. Bitte in der App auf „Anmeldung bestätigen“ tippen und erneut klicken.');
    } else {
      setStatusMsg('✅ Tuya / LSC erfolgreich verbunden! LSC Smart PTZ Camera 2 wird abgetastet…');
      await refresh();
    }
  }

  async function configureLocalOnvif(e: React.FormEvent) {
    e.preventDefault();
    setStatusMsg(`Verbinde LSC Smart PTZ Camera 2 lokal über RTSP/ONVIF (${onvifIp})…`);
    const res = await client.post<{
      rtspUrl: string;
      port554Open: boolean;
      sampleRes?: { error?: string; scene_summary?: string };
    }>('/configure-onvif', {
      camera_id: 'camera.lsc_smart_ptz_camera_2',
      lan_ip: onvifIp,
      password: onvifPass,
    });
    if (res.sampleRes?.scene_summary) {
      setStatusMsg(`✅ Lokaler Stream verbunden & ausgewertet: ${res.sampleRes.scene_summary}`);
    } else {
      setStatusMsg(
        `Stream gesetzt (${res.rtspUrl}). Hinweis: ${res.sampleRes?.error || 'Prüfe ONVIF-Schalter in der LSC App.'}`
      );
    }
    await refresh();
  }

  async function setCameraOptimizationMode(cameraId: string, mode: OptimizationMode) {
    setStatusMsg(`Optimierung für ${cameraId} auf „${mode}“ umgestellt.`);
    await client.post('/camera-mode', {
      camera_id: cameraId,
      optimization_mode: mode,
    });
    await refresh();
  }

  async function triggerSample(cameraId?: string) {
    setSamplingId(cameraId || 'ALL');
    setStatusMsg('Kamerabild wird lokal via COCO-SSD & Pixel-Analyse ausgewertet…');
    try {
      const res = await client.post<{ results: Array<{ error?: string; scene_summary?: string }> }>(
        '/sample-now',
        cameraId ? { camera_id: cameraId } : {}
      );
      const first = res.results?.[0];
      if (first?.error) {
        setStatusMsg(`Status: ${first.error}`);
      } else if (first?.scene_summary) {
        setStatusMsg(`✅ ${first.scene_summary}`);
      } else {
        setStatusMsg('Zyklische Abtastung ausgeführt.');
      }
      await refresh();
    } catch (e) {
      setStatusMsg(`Fehler: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setSamplingId(null);
    }
  }

  async function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setSamplingId('UPLOAD');
    setStatusMsg(`Analysiere „${file.name}“ lokal mit Profil „${testMode}“ (COCO-SSD)…`);
    const reader = new FileReader();
    reader.onload = async () => {
      try {
        const b64 = String(reader.result || '');
        const res = await client.post<{
          sceneSummary: string;
          totalObjects: number;
          personCount: number;
          processingMs: number;
        }>('/analyze-image', {
          camera_id: 'manual.snapshot',
          camera_name: `Test (${testMode}: ${file.name})`,
          optimization_mode: testMode,
          image_base64: b64,
          mime_type: file.type || 'image/jpeg',
        });
        setStatusMsg(`✅ [${testMode}] in ${res.processingMs}ms: ${res.sceneSummary}`);
        await refresh();
      } catch (err) {
        setStatusMsg(`Analyse-Fehler: ${err instanceof Error ? err.message : String(err)}`);
      } finally {
        setSamplingId(null);
      }
    };
    reader.readAsDataURL(file);
  }

  async function saveCameraEdit(e: React.FormEvent) {
    e.preventDefault();
    if (!editingCam) return;
    await client.post('/cameras', editingCam);
    setEditingCam(null);
    setStatusMsg('Kamera-Konfiguration gespeichert.');
    await refresh();
  }

  async function saveVisionConfig(cyclicEnabled: boolean) {
    await client.post('/config', {
      cyclicEnabled,
      intervalSeconds: Number(intervalInput) || 180,
    });
    setStatusMsg('Zyklische Abtast-Konfiguration gespeichert.');
    await refresh();
  }

  if (loading && !data) {
    return (
      <div style={{ padding: '48px', color: 'rgba(248,250,252,0.6)' }}>
        Lade lokale COCO-SSD Computer-Vision-Engine…
      </div>
    );
  }

  const cams = data?.cameras || [];
  const dets = data?.detections || [];
  const cfg = data?.config;

  return (
    <div
      style={{
        minHeight: '100vh',
        background: 'radial-gradient(circle at 20% 0%, #0c1938 0%, #040711 65%)',
        color: '#f8fafc',
        padding: '36px 4.2vw 80px',
      }}
    >
      {/* HEADER */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'flex-end',
          flexWrap: 'wrap',
          gap: '20px',
          marginBottom: '28px',
        }}
      >
        <div>
          <div
            style={{
              fontSize: '10.5px',
              letterSpacing: '0.2em',
              textTransform: 'uppercase',
              color: '#38bdf8',
              fontWeight: 600,
              marginBottom: '6px',
            }}
          >
            THASSI LOCAL VISION ENGINE · COCO-SSD & PIXEL ANALYTICS
          </div>
          <h1 style={{ margin: 0, fontSize: '30px', fontWeight: 200, letterSpacing: '-0.02em' }}>
            Kamera-Abtastung & Objekterkennung
          </h1>
        </div>

        <div style={{ display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap' }}>
          <button
            onClick={() => triggerSample()}
            disabled={samplingId !== null}
            style={{
              background: '#38bdf8',
              color: '#040711',
              border: 'none',
              borderRadius: '99px',
              padding: '10px 20px',
              fontSize: '12.5px',
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            {samplingId === 'ALL' ? 'Abtastung läuft…' : '⟳ Alle aktiven Kameras jetzt abtasten'}
          </button>

          <select
            value={testMode}
            onChange={(e) => setTestMode(e.target.value as OptimizationMode)}
            style={{
              background: 'rgba(255,255,255,0.08)',
              color: '#f8fafc',
              border: 'none',
              borderRadius: '99px',
              padding: '10px 14px',
              fontSize: '12px',
              outline: 'none',
            }}
          >
            {MODES.map((m) => (
              <option key={m} value={m} style={{ background: '#080e20' }}>
                Test-Profil: {m}
              </option>
            ))}
          </select>

          <label
            style={{
              background: 'rgba(255,255,255,0.08)',
              color: '#e2e8f0',
              borderRadius: '99px',
              padding: '10px 18px',
              fontSize: '12.5px',
              fontWeight: 500,
              cursor: 'pointer',
            }}
          >
            📷 Bild lokal testen
            <input type="file" accept="image/*" onChange={handleFileUpload} style={{ display: 'none' }} />
          </label>
        </div>
      </div>

      {statusMsg && (
        <div
          style={{
            marginBottom: '22px',
            padding: '12px 18px',
            borderRadius: '14px',
            background: 'rgba(56, 189, 248, 0.12)',
            color: '#bae6fd',
            fontSize: '13px',
          }}
        >
          {statusMsg}
        </div>
      )}

      {/* LSC SMART PTZ CAMERA 2 & TUYA ACTIVATION WIZARD */}
      {tuyaAuth?.activeFlowId && (
        <div
          style={{
            background: 'rgba(14, 24, 52, 0.78)',
            borderRadius: '22px',
            padding: '24px 26px',
            marginBottom: '32px',
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))',
            gap: '24px',
            alignItems: 'center',
          }}
        >
          <div>
            <div style={{ fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.14em', color: '#fbbf24', fontWeight: 600 }}>
              ⚡ LSC Smart PTZ Camera 2 aktivieren · Weg A (QR-Code Scan)
            </div>
            <h3 style={{ margin: '6px 0 10px', fontSize: '19px', fontWeight: 500 }}>
              Tuya / LSC QR-Code direkt scannen ({tuyaAuth.storedEntryTitle})
            </h3>
            <ol style={{ margin: '0 0 14px', paddingLeft: '18px', fontSize: '13px', color: 'rgba(248,250,252,0.8)', lineHeight: 1.65 }}>
              <li>Öffne auf dem Handy die <strong>LSC Smart Connect</strong> (oder <strong>Smart Life</strong>) App.</li>
              <li>Tippe unten rechts auf <strong>Profil („Ich“)</strong> und oben rechts auf das <strong>QR-Scanner-Symbol [ - ]</strong>.</li>
              <li>Scanne diesen QR-Code (User-Code: <code>{tuyaAuth.storedUserCode}</code>) und bestätige in der App.</li>
              <li>Klicke anschließend hier auf <strong>„✅ Ich habe gescannt – Jetzt aktivieren“</strong>.</li>
            </ol>
            <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
              <button
                onClick={confirmTuyaQrScanned}
                style={{
                  background: '#4ade80',
                  color: '#040711',
                  border: 'none',
                  borderRadius: '99px',
                  padding: '9px 18px',
                  fontSize: '12.5px',
                  fontWeight: 600,
                  cursor: 'pointer',
                }}
              >
                ✅ Ich habe gescannt – Jetzt aktivieren
              </button>
              <button
                onClick={refreshTuyaQrCode}
                style={{
                  background: 'rgba(255,255,255,0.08)',
                  color: '#e2e8f0',
                  border: 'none',
                  borderRadius: '99px',
                  padding: '9px 16px',
                  fontSize: '12px',
                  cursor: 'pointer',
                }}
              >
                🔄 Neuen QR-Code generieren
              </button>
            </div>
          </div>

          {tuyaAuth.qrData && (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px' }}>
              <div style={{ background: '#ffffff', padding: '12px', borderRadius: '16px' }}>
                <img
                  src={`https://api.qrserver.com/v1/create-qr-code/?size=180x180&data=${encodeURIComponent(tuyaAuth.qrData)}`}
                  alt="Tuya LSC QR Code"
                  style={{ width: '170px', height: '170px', display: 'block' }}
                />
              </div>
              <span style={{ fontSize: '11px', color: 'rgba(255,255,255,0.5)' }}>
                LSC / Tuya Login-QR
              </span>
            </div>
          )}

          <form onSubmit={configureLocalOnvif} style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            <div style={{ fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.14em', color: '#38bdf8', fontWeight: 600 }}>
              Weg B · Lokales ONVIF / RTSP in der LSC App
            </div>
            <div style={{ fontSize: '12.5px', color: 'rgba(248,250,252,0.75)', lineHeight: 1.55 }}>
              In der <strong>LSC App → LSC Smart PTZ Camera 2 → „...“ (Einstellungen) → ONVIF</strong> einschalten & Passwort festlegen:
            </div>
            <div style={{ display: 'flex', gap: '8px' }}>
              <select
                value={onvifIp}
                onChange={(e) => setOnvifIp(e.target.value)}
                style={{ padding: '8px 10px', borderRadius: '10px', border: 'none', background: '#111a33', color: '#fff', fontSize: '12px' }}
              >
                <option value="192.168.188.140">192.168.188.140 (LSC Cam)</option>
                <option value="192.168.188.121">192.168.188.121 (LSC Cam)</option>
              </select>
              <input
                type="password"
                placeholder="ONVIF-Passwort aus LSC App"
                value={onvifPass}
                onChange={(e) => setOnvifPass(e.target.value)}
                style={{ flex: 1, padding: '8px 12px', borderRadius: '10px', border: 'none', background: 'rgba(255,255,255,0.08)', color: '#fff', fontSize: '12px' }}
              />
            </div>
            <button
              type="submit"
              style={{
                background: '#38bdf8',
                color: '#040711',
                border: 'none',
                borderRadius: '99px',
                padding: '9px 16px',
                fontSize: '12px',
                fontWeight: 600,
                cursor: 'pointer',
                alignSelf: 'flex-start',
              }}
            >
              🔌 Lokalen RTSP/ONVIF-Stream verbinden
            </button>
          </form>
        </div>
      )}

      {/* PIPELINE STATUS STRIP */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
          gap: '16px',
          marginBottom: '32px',
        }}
      >
        <div style={{ background: 'rgba(10,16,34,0.65)', padding: '18px 22px', borderRadius: '18px' }}>
          <div style={{ fontSize: '10.5px', textTransform: 'uppercase', letterSpacing: '0.12em', color: 'rgba(255,255,255,0.45)' }}>
            Lokale Objekterkennungs-Engine
          </div>
          <div style={{ fontSize: '19px', fontWeight: 500, marginTop: '6px', color: '#4ade80' }}>
            COCO-SSD (lite_mobilenet_v2)
          </div>
          <div style={{ fontSize: '11.5px', color: 'rgba(255,255,255,0.5)', marginTop: '4px' }}>
            100% lokal im Dienst · Keine Cloud-Kosten
          </div>
        </div>

        <div style={{ background: 'rgba(10,16,34,0.65)', padding: '18px 22px', borderRadius: '18px' }}>
          <div style={{ fontSize: '10.5px', textTransform: 'uppercase', letterSpacing: '0.12em', color: 'rgba(255,255,255,0.45)' }}>
            Zyklischer Abtast-Dienst
          </div>
          <div style={{ fontSize: '19px', fontWeight: 500, marginTop: '6px', color: cfg?.cyclicEnabled ? '#38bdf8' : '#fbbf24' }}>
            {cfg?.cyclicEnabled ? `Aktiv (alle ${cfg?.intervalSeconds || 180}s)` : 'Pausiert'}
          </div>
          <div style={{ fontSize: '11.5px', color: 'rgba(255,255,255,0.5)', marginTop: '4px' }}>
            5 Optimierungs-Profile pro Kamera wählbar
          </div>
        </div>

        <div style={{ background: 'rgba(10,16,34,0.65)', padding: '18px 22px', borderRadius: '18px' }}>
          <div style={{ fontSize: '10.5px', textTransform: 'uppercase', letterSpacing: '0.12em', color: 'rgba(255,255,255,0.45)' }}>
            Stream-Relay & HLS-Frame-Grabber
          </div>
          <div style={{ fontSize: '19px', fontWeight: 500, marginTop: '6px', color: data?.go2rtc?.online ? '#4ade80' : '#f87171' }}>
            {data?.go2rtc?.online ? 'go2rtc (:1984 / :8554) bereit' : 'go2rtc offline'}
          </div>
          <div style={{ fontSize: '11.5px', color: 'rgba(255,255,255,0.5)', marginTop: '4px' }}>
            HA Proxy + HLS/RTSPS Einzelbild-Extraktion
          </div>
        </div>
      </div>

      {/* DISCOVERED CAMERAS GRID WITH PER-CAMERA OPTIMIZATION MODE SELECTOR */}
      <h2 style={{ fontSize: '14px', textTransform: 'uppercase', letterSpacing: '0.14em', color: 'rgba(255,255,255,0.55)', marginBottom: '16px' }}>
        Kameras & Erkennungs-Optimierung pro Kamera ({cams.length})
      </h2>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(370px, 1fr))',
          gap: '18px',
          marginBottom: '40px',
        }}
      >
        {cams.map((cam) => {
          const isOnline = cam.last_status === 'online' || cam.ha_state === 'recording' || cam.ha_state === 'streaming';
          const currentMode: OptimizationMode = MODES.includes(cam.optimization_mode)
            ? cam.optimization_mode
            : 'Personen';
          const meta = MODE_META[currentMode];

          return (
            <div
              key={cam.id}
              style={{
                background: 'rgba(10, 16, 34, 0.74)',
                backdropFilter: 'blur(20px)',
                borderRadius: '22px',
                padding: '20px 22px',
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'space-between',
                gap: '14px',
              }}
            >
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                  <span style={{ fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.12em', color: '#38bdf8', fontWeight: 600 }}>
                    {cam.room}
                  </span>
                  <span
                    style={{
                      fontSize: '10.5px',
                      padding: '3px 9px',
                      borderRadius: '99px',
                      background: isOnline
                        ? 'rgba(74, 222, 128, 0.16)'
                        : cam.lan_reachable_6668
                          ? 'rgba(251, 191, 36, 0.16)'
                          : 'rgba(248, 113, 113, 0.14)',
                      color: isOnline ? '#4ade80' : cam.lan_reachable_6668 ? '#fbbf24' : '#f87171',
                    }}
                  >
                    {isOnline
                      ? 'Stream bereit'
                      : cam.lan_reachable_6668
                        ? `LAN ${cam.lan_ip}:6668 aktiv · Tuya QR-Auth`
                        : `HA: ${cam.ha_state}`}
                  </span>
                </div>

                <div style={{ fontSize: '18px', fontWeight: 500, color: '#fff' }}>{cam.name}</div>
                <div style={{ fontSize: '11px', color: 'rgba(255,255,255,0.4)', fontFamily: 'monospace', marginTop: '2px' }}>
                  {cam.id}
                </div>

                {/* 5 OPTIMIZATION MODE PILLS PER CAMERA */}
                <div style={{ marginTop: '14px' }}>
                  <div style={{ fontSize: '10.5px', textTransform: 'uppercase', letterSpacing: '0.1em', color: 'rgba(255,255,255,0.48)', marginBottom: '7px' }}>
                    Erkennungs-Optimierung: <strong style={{ color: meta.color }}>{meta.icon} {currentMode}</strong>
                  </div>
                  <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                    {MODES.map((m) => {
                      const active = currentMode === m;
                      const mInfo = MODE_META[m];
                      return (
                        <button
                          key={m}
                          onClick={() => setCameraOptimizationMode(cam.id, m)}
                          style={{
                            border: 'none',
                            borderRadius: '99px',
                            padding: '5px 11px',
                            fontSize: '11px',
                            fontWeight: active ? 600 : 400,
                            cursor: 'pointer',
                            background: active ? mInfo.color : 'rgba(255,255,255,0.06)',
                            color: active ? '#040711' : 'rgba(248,250,252,0.72)',
                            transition: 'all 0.18s ease',
                          }}
                          title={mInfo.desc}
                        >
                          {mInfo.icon} {m}
                        </button>
                      );
                    })}
                  </div>
                  <div style={{ fontSize: '11px', color: 'rgba(255,255,255,0.45)', marginTop: '6px' }}>
                    {meta.desc}
                  </div>
                </div>

                {cam.last_error && (
                  <div
                    style={{
                      marginTop: '10px',
                      fontSize: '11.5px',
                      color: '#fcd34d',
                      background: 'rgba(251, 191, 36, 0.08)',
                      padding: '8px 11px',
                      borderRadius: '10px',
                      lineHeight: 1.45,
                    }}
                  >
                    {cam.last_error}
                  </div>
                )}
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingTop: '6px' }}>
                <span style={{ fontSize: '11px', color: 'rgba(255,255,255,0.42)' }}>
                  {cam.enabled ? `Zyklisch alle ${cam.sample_interval_sec}s` : 'Zyklisch pausiert'}
                </span>
                <div style={{ display: 'flex', gap: '8px' }}>
                  <button
                    onClick={() => setEditingCam(cam)}
                    style={{
                      background: 'rgba(255,255,255,0.06)',
                      color: '#cbd5e1',
                      border: 'none',
                      borderRadius: '10px',
                      padding: '6px 12px',
                      fontSize: '11.5px',
                      cursor: 'pointer',
                    }}
                  >
                    Einstellungen
                  </button>
                  <button
                    onClick={() => triggerSample(cam.id)}
                    disabled={samplingId !== null}
                    style={{
                      background: 'rgba(56, 189, 248, 0.16)',
                      color: '#38bdf8',
                      border: 'none',
                      borderRadius: '10px',
                      padding: '6px 12px',
                      fontSize: '11.5px',
                      fontWeight: 600,
                      cursor: 'pointer',
                    }}
                  >
                    {samplingId === cam.id ? 'Prüfe…' : 'Jetzt abtasten'}
                  </button>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* EDIT CAMERA MODAL */}
      {editingCam && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(2,4,10,0.75)',
            backdropFilter: 'blur(12px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 50,
          }}
        >
          <form
            onSubmit={saveCameraEdit}
            style={{
              background: '#080e20',
              padding: '28px',
              borderRadius: '22px',
              width: '440px',
              maxWidth: '92vw',
              display: 'flex',
              flexDirection: 'column',
              gap: '14px',
            }}
          >
            <h3 style={{ margin: 0, fontSize: '18px', fontWeight: 500 }}>Kamera konfigurieren</h3>
            <div style={{ fontSize: '12px', color: 'rgba(255,255,255,0.5)' }}>{editingCam.id}</div>

            <label style={{ fontSize: '12px', color: 'rgba(255,255,255,0.7)' }}>
              Anzeigename
              <input
                value={editingCam.name}
                onChange={(e) => setEditingCam({ ...editingCam, name: e.target.value })}
                style={{ width: '100%', marginTop: '4px', padding: '9px 12px', borderRadius: '10px', border: 'none', background: 'rgba(255,255,255,0.07)', color: '#fff' }}
              />
            </label>

            <label style={{ fontSize: '12px', color: 'rgba(255,255,255,0.7)' }}>
              Optimierungs-Profil
              <select
                value={editingCam.optimization_mode}
                onChange={(e) => setEditingCam({ ...editingCam, optimization_mode: e.target.value as OptimizationMode })}
                style={{ width: '100%', marginTop: '4px', padding: '9px 12px', borderRadius: '10px', border: 'none', background: '#111a33', color: '#fff' }}
              >
                {MODES.map((m) => (
                  <option key={m} value={m}>
                    {m} – {MODE_META[m].desc}
                  </option>
                ))}
              </select>
            </label>

            <label style={{ fontSize: '12px', color: 'rgba(255,255,255,0.7)' }}>
              Optionale direkte Stream-/Snapshot-URL (sonst automatisch via Home Assistant)
              <input
                value={editingCam.stream_url}
                placeholder="Leer lassen für Home Assistant Tuya/HLS Stream"
                onChange={(e) => setEditingCam({ ...editingCam, stream_url: e.target.value })}
                style={{ width: '100%', marginTop: '4px', padding: '9px 12px', borderRadius: '10px', border: 'none', background: 'rgba(255,255,255,0.07)', color: '#fff' }}
              />
            </label>

            <label style={{ fontSize: '12px', color: 'rgba(255,255,255,0.7)' }}>
              Abtast-Intervall (Sekunden)
              <input
                type="number"
                min={15}
                value={editingCam.sample_interval_sec}
                onChange={(e) => setEditingCam({ ...editingCam, sample_interval_sec: Number(e.target.value) })}
                style={{ width: '100%', marginTop: '4px', padding: '9px 12px', borderRadius: '10px', border: 'none', background: 'rgba(255,255,255,0.07)', color: '#fff' }}
              />
            </label>

            <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '12.5px', color: '#e2e8f0' }}>
              <input
                type="checkbox"
                checked={editingCam.enabled === 1}
                onChange={(e) => setEditingCam({ ...editingCam, enabled: e.target.checked ? 1 : 0 })}
              />
              In zyklische Abtastung einbeziehen
            </label>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '8px' }}>
              <button
                type="button"
                onClick={() => setEditingCam(null)}
                style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.5)', cursor: 'pointer', padding: '8px 14px' }}
              >
                Abbrechen
              </button>
              <button
                type="submit"
                style={{ background: '#38bdf8', color: '#040711', border: 'none', borderRadius: '10px', padding: '8px 18px', fontWeight: 600, cursor: 'pointer' }}
              >
                Speichern
              </button>
            </div>
          </form>
        </div>
      )}

      {/* DETECTION LOG */}
      <h2 style={{ fontSize: '14px', textTransform: 'uppercase', letterSpacing: '0.14em', color: 'rgba(255,255,255,0.55)', marginBottom: '16px' }}>
        Erkennungs- & Aktivitäts-Protokoll ({dets.length})
      </h2>

      {dets.length === 0 ? (
        <div style={{ background: 'rgba(10,16,34,0.5)', padding: '28px', borderRadius: '18px', color: 'rgba(255,255,255,0.5)', fontSize: '13.5px' }}>
          Noch keine Kamerabilder ausgewertet. Klicke oben auf <strong>„📷 Bild lokal testen“</strong> oder authentifiziere die Tuya-Integration in Home Assistant per QR-Code neu.
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '14px', marginBottom: '40px' }}>
          {dets.map((d) => (
            <div
              key={d.id}
              style={{
                background: 'rgba(10,16,34,0.68)',
                borderRadius: '18px',
                padding: '18px 22px',
                display: 'flex',
                gap: '20px',
                alignItems: 'center',
                flexWrap: 'wrap',
              }}
            >
              {d.snapshot_b64 && (
                <img
                  src={`data:image/jpeg;base64,${d.snapshot_b64}`}
                  alt={d.camera_name}
                  style={{ width: '124px', height: '82px', objectFit: 'cover', borderRadius: '10px' }}
                />
              )}
              <div style={{ flex: 1, minWidth: '240px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px', flexWrap: 'wrap', gap: '8px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span style={{ fontWeight: 600, color: '#fff', fontSize: '15px' }}>{d.camera_name}</span>
                    <span
                      style={{
                        fontSize: '10.5px',
                        padding: '2px 8px',
                        borderRadius: '99px',
                        background: 'rgba(56,189,248,0.14)',
                        color: '#38bdf8',
                      }}
                    >
                      Profil: {d.optimization_mode || 'Objekte'}
                    </span>
                  </div>
                  <span style={{ fontSize: '11.5px', color: 'rgba(255,255,255,0.45)' }}>
                    {new Date(d.sampled_at).toLocaleString()} · {d.processing_ms}ms · {d.engine_used}
                  </span>
                </div>
                <div style={{ fontSize: '13.5px', color: 'rgba(255,255,255,0.88)', marginBottom: '8px' }}>
                  {d.scene_summary}
                </div>
                <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                  {(d.objects || []).map((obj, idx) => (
                    <span
                      key={idx}
                      style={{
                        fontSize: '11px',
                        padding: '3px 10px',
                        borderRadius: '99px',
                        background: 'rgba(56, 189, 248, 0.15)',
                        color: '#7dd3fc',
                      }}
                    >
                      {obj.count}× {obj.label} ({Math.round((obj.confidence || 0.9) * 100)}%) {obj.details ? `· ${obj.details}` : ''}
                    </span>
                  ))}
                  {d.metrics?.sharpnessScore != null && (
                    <span style={{ fontSize: '11px', padding: '3px 10px', borderRadius: '99px', background: 'rgba(255,255,255,0.06)', color: 'rgba(255,255,255,0.6)' }}>
                      Schärfe {d.metrics.sharpnessScore}% · Licht {d.metrics.luminancePct}% · Δ {d.motion_pct || 0}%
                    </span>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

createRoot(document.getElementById('root')!).render(<CameraVisionApp />);
