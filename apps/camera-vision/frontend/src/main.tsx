import React, { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { createAppClient } from '@thassi/sdk/client';

const client = createAppClient('camera-vision');

interface DetectedObject {
  label: string;
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
  target_classes_parsed: string[];
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
  sampled_at: string;
  status: string;
  objects: DetectedObject[];
  total_objects: number;
  person_count: number;
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
    geminiModel: string;
    geminiApiKeyConfigured: boolean;
    geminiApiKeyMasked: string;
    go2rtcUrl: string;
    targetClasses: string[];
  };
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
  const [apiKeyInput, setApiKeyInput] = useState('');
  const [intervalInput, setIntervalInput] = useState(300);
  const [statusMsg, setStatusMsg] = useState('');

  async function refresh() {
    try {
      const res = await client.get<DashboardPayload>('/dashboard');
      setData(res);
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

  async function triggerSample(cameraId?: string) {
    setSamplingId(cameraId || 'ALL');
    setStatusMsg('Kamerabild wird abgetastet & auf Objekte analysiert…');
    try {
      const res = await client.post<{ results: Array<{ error?: string; scene_summary?: string }> }>(
        '/sample-now',
        cameraId ? { camera_id: cameraId } : {}
      );
      const first = res.results?.[0];
      if (first?.error) {
        setStatusMsg(`Hinweis: ${first.error}`);
      } else if (first?.scene_summary) {
        setStatusMsg(`Erkennung abgeschlossen: ${first.scene_summary}`);
      } else {
        setStatusMsg('Abtastung durchgeführt.');
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
    setStatusMsg(`Analysiere Bild "${file.name}" mit Objekterkennungs-Pipeline…`);
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
          camera_name: `Test-Bild (${file.name})`,
          image_base64: b64,
          mime_type: file.type || 'image/jpeg',
        });
        setStatusMsg(
          `✅ ${res.totalObjects} Objekte erkannt (${res.personCount} Personen) in ${res.processingMs}ms: ${res.sceneSummary}`
        );
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
      intervalSeconds: Number(intervalInput) || 300,
      ...(apiKeyInput.trim() ? { geminiApiKey: apiKeyInput.trim() } : {}),
    });
    setApiKeyInput('');
    setStatusMsg('Zyklische Abtast-Konfiguration aktualisiert.');
    await refresh();
  }

  if (loading && !data) {
    return (
      <div style={{ padding: '48px', color: 'rgba(248,250,252,0.6)' }}>
        Initialisiere Camera Vision & Netzwerk-Diagnose…
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
          marginBottom: '32px',
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
            THASSI VISION ENGINE · ZYKLISCHE OBJEKTERKENNung
          </div>
          <h1 style={{ margin: 0, fontSize: '32px', fontWeight: 200, letterSpacing: '-0.02em' }}>
            Netzwerk-Kameras & Bildverarbeitung
          </h1>
        </div>

        <div style={{ display: 'flex', gap: '12px', alignItems: 'center', flexWrap: 'wrap' }}>
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

          <label
            style={{
              background: 'rgba(255,255,255,0.07)',
              color: '#e2e8f0',
              borderRadius: '99px',
              padding: '10px 18px',
              fontSize: '12.5px',
              fontWeight: 500,
              cursor: 'pointer',
            }}
          >
            📷 Test-Bild analysieren
            <input type="file" accept="image/*" onChange={handleFileUpload} style={{ display: 'none' }} />
          </label>
        </div>
      </div>

      {statusMsg && (
        <div
          style={{
            marginBottom: '24px',
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
            Zyklischer Abtast-Dienst
          </div>
          <div style={{ fontSize: '20px', fontWeight: 500, marginTop: '6px', color: cfg?.cyclicEnabled ? '#4ade80' : '#fbbf24' }}>
            {cfg?.cyclicEnabled ? `Aktiv (alle ${cfg?.intervalSeconds || 300}s)` : 'Pausiert'}
          </div>
          <div style={{ fontSize: '11.5px', color: 'rgba(255,255,255,0.5)', marginTop: '4px' }}>
            Zielklassen: {(cfg?.targetClasses || []).join(', ')}
          </div>
        </div>

        <div style={{ background: 'rgba(10,16,34,0.65)', padding: '18px 22px', borderRadius: '18px' }}>
          <div style={{ fontSize: '10.5px', textTransform: 'uppercase', letterSpacing: '0.12em', color: 'rgba(255,255,255,0.45)' }}>
            go2rtc Stream-Relay (192.168.188.92:1984)
          </div>
          <div style={{ fontSize: '20px', fontWeight: 500, marginTop: '6px', color: data?.go2rtc?.online ? '#4ade80' : '#f87171' }}>
            {data?.go2rtc?.online ? 'Verbunden (Port 1984 / 8554)' : 'Nicht erreichbar'}
          </div>
          <div style={{ fontSize: '11.5px', color: 'rgba(255,255,255,0.5)', marginTop: '4px' }}>
            Streams: {Object.keys(data?.go2rtc?.streams || {}).join(', ') || 'Keine'}
          </div>
        </div>

        <div style={{ background: 'rgba(10,16,34,0.65)', padding: '18px 22px', borderRadius: '18px' }}>
          <div style={{ fontSize: '10.5px', textTransform: 'uppercase', letterSpacing: '0.12em', color: 'rgba(255,255,255,0.45)' }}>
            KI-Objekterkennungs-Engine
          </div>
          <div style={{ fontSize: '20px', fontWeight: 500, marginTop: '6px', color: cfg?.geminiApiKeyConfigured ? '#38bdf8' : '#fbbf24' }}>
            {cfg?.geminiApiKeyConfigured ? `Gemini Vision (${cfg.geminiApiKeyMasked})` : 'API-Key fehlt'}
          </div>
          <div style={{ fontSize: '11.5px', color: 'rgba(255,255,255,0.5)', marginTop: '4px' }}>
            Automatisches Modell-Routing aktiv
          </div>
        </div>
      </div>

      {/* DISCOVERED CAMERAS GRID */}
      <h2 style={{ fontSize: '14px', textTransform: 'uppercase', letterSpacing: '0.14em', color: 'rgba(255,255,255,0.55)', marginBottom: '16px' }}>
        Erkannte Kameras im Netzwerk & Home Assistant ({cams.length})
      </h2>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))',
          gap: '18px',
          marginBottom: '40px',
        }}
      >
        {cams.map((cam) => {
          const isOnline = cam.last_status === 'online' || cam.ha_state === 'recording' || cam.ha_state === 'streaming';
          return (
            <div
              key={cam.id}
              style={{
                background: 'rgba(10, 16, 34, 0.72)',
                backdropFilter: 'blur(20px)',
                borderRadius: '20px',
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
                        ? `LAN ${cam.lan_ip}:6668 aktiv · Tuya Re-Auth`
                        : `HA: ${cam.ha_state}`}
                  </span>
                </div>

                <div style={{ fontSize: '18px', fontWeight: 500, color: '#fff' }}>{cam.name}</div>
                <div style={{ fontSize: '11.5px', color: 'rgba(255,255,255,0.42)', fontFamily: 'monospace', marginTop: '2px' }}>
                  {cam.id} {cam.stream_url ? `· ${cam.stream_url}` : ''}
                </div>

                {cam.last_error && (
                  <div
                    style={{
                      marginTop: '10px',
                      fontSize: '11.5px',
                      color: '#fca5a5',
                      background: 'rgba(239, 68, 68, 0.09)',
                      padding: '8px 11px',
                      borderRadius: '10px',
                      lineHeight: 1.45,
                    }}
                  >
                    {cam.last_error}
                  </div>
                )}
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingTop: '8px' }}>
                <span style={{ fontSize: '11px', color: 'rgba(255,255,255,0.45)' }}>
                  {cam.enabled ? `Zyklisch alle ${cam.sample_interval_sec}s` : 'Zyklisch deaktiviert'}
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
                    Stream / RTSP
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

      {/* EDIT CAMERA STREAM MODAL */}
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
            <h3 style={{ margin: 0, fontSize: '18px', fontWeight: 500 }}>Kamera-Stream konfigurieren</h3>
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
              Raum-Zuordnung
              <input
                value={editingCam.room}
                onChange={(e) => setEditingCam({ ...editingCam, room: e.target.value })}
                style={{ width: '100%', marginTop: '4px', padding: '9px 12px', borderRadius: '10px', border: 'none', background: 'rgba(255,255,255,0.07)', color: '#fff' }}
              />
            </label>

            <label style={{ fontSize: '12px', color: 'rgba(255,255,255,0.7)' }}>
              Direkte RTSP / MJPEG / HTTP-Snapshot URL (optional, sonst via Home Assistant)
              <input
                value={editingCam.stream_url}
                placeholder="z.B. rtsp://admin:pass@192.168.188.121:554/stream1"
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
        Objekterkennungs-Protokoll ({dets.length})
      </h2>

      {dets.length === 0 ? (
        <div style={{ background: 'rgba(10,16,34,0.5)', padding: '28px', borderRadius: '18px', color: 'rgba(255,255,255,0.5)', fontSize: '13.5px' }}>
          Noch keine Kamerabilder ausgewertet. Klicke oben auf <strong>„📷 Test-Bild analysieren“</strong> oder authentifiziere die Tuya-Integration in Home Assistant neu, um Live-Kamerabilder abzutasten.
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
                  style={{ width: '120px', height: '78px', objectFit: 'cover', borderRadius: '10px' }}
                />
              )}
              <div style={{ flex: 1, minWidth: '240px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                  <span style={{ fontWeight: 600, color: '#fff', fontSize: '15px' }}>{d.camera_name}</span>
                  <span style={{ fontSize: '11.5px', color: 'rgba(255,255,255,0.45)' }}>
                    {new Date(d.sampled_at).toLocaleString()} · {d.processing_ms}ms · {d.engine_used}
                  </span>
                </div>
                <div style={{ fontSize: '13.5px', color: 'rgba(255,255,255,0.85)', marginBottom: '8px' }}>
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
                      {obj.count}× {obj.label} ({Math.round((obj.confidence || 0.9) * 100)}%)
                    </span>
                  ))}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* SETTINGS FOOTER */}
      <div style={{ background: 'rgba(10,16,34,0.55)', padding: '22px', borderRadius: '18px', display: 'flex', gap: '16px', alignItems: 'flex-end', flexWrap: 'wrap' }}>
        <div>
          <div style={{ fontSize: '11px', color: 'rgba(255,255,255,0.5)', marginBottom: '6px' }}>Abtast-Zyklus (Sekunden)</div>
          <input
            type="number"
            value={intervalInput}
            onChange={(e) => setIntervalInput(Number(e.target.value))}
            style={{ padding: '8px 12px', borderRadius: '10px', border: 'none', background: 'rgba(255,255,255,0.07)', color: '#fff', width: '130px' }}
          />
        </div>
        <div style={{ flex: 1, minWidth: '240px' }}>
          <div style={{ fontSize: '11px', color: 'rgba(255,255,255,0.5)', marginBottom: '6px' }}>
            Optionaler eigener Gemini Vision API-Key (überschreibt HA-Key)
          </div>
          <input
            type="password"
            placeholder={cfg?.geminiApiKeyMasked || 'AIza...'}
            value={apiKeyInput}
            onChange={(e) => setApiKeyInput(e.target.value)}
            style={{ padding: '8px 12px', borderRadius: '10px', border: 'none', background: 'rgba(255,255,255,0.07)', color: '#fff', width: '100%' }}
          />
        </div>
        <button
          onClick={() => saveVisionConfig(cfg?.cyclicEnabled ?? true)}
          style={{ background: '#38bdf8', color: '#040711', border: 'none', borderRadius: '10px', padding: '9px 18px', fontWeight: 600, cursor: 'pointer' }}
        >
          Konfiguration speichern
        </button>
      </div>
    </div>
  );
}

createRoot(document.getElementById('root')!).render(<CameraVisionApp />);
