import React, { useEffect, useRef, useState, useMemo } from 'react';
import { createAppClient, getHostBaseUrl, type HaEntityState } from '@thassi/sdk/client';

const api = createAppClient('smart-canvas');
const WORKFLOWS_API = `${getHostBaseUrl()}/api/apps/workflows`;

interface CanvasTile {
  id: number;
  entity_id: string;
  sub_entity_id: string;
  custom_label: string;
  zone: string;
  col_span: number; // Flex size: 1=S (210px), 2=M (flex 1 260px), 3=L (flex 2 380px), 4=Full (100%)
  row_span: number; // 0=Force Badge, 1=Auto/Normal, 2=Tall
  sort_order: number;
  pos_x: number;
  pos_y: number;
  accent_color: string;
  icon: string;
}

interface PcBridgeState {
  ok: boolean;
  lastSeenAt: number;
  requestedMonitor: string;
  frameDataUrl: string | null;
  status: {
    hostname?: string;
    username?: string;
    ipAddress?: string;
    macAddress?: string;
    cpuUsagePercent?: number;
    memoryUsagePercent?: number;
    memoryUsedGb?: number;
    memoryTotalGb?: number;
    sessionLocked?: boolean;
    activeWindowTitle?: string;
    activeProcessName?: string;
    displayCount?: number;
    media?: {
      state?: string;
      title?: string;
      appName?: string;
      volumePercent?: number;
      muted?: boolean;
    };
  } | null;
}

function isControllableDomain(entityId: string): boolean {
  const domain = entityId.split('.')[0];
  return ['light', 'switch', 'input_boolean', 'fan', 'script', 'scene'].includes(domain);
}

function getFlexStyleForSpan(colSpan: number): React.CSSProperties {
  switch (colSpan) {
    case 1:
      return { flex: '0 1 220px', minWidth: 190 };
    case 3:
      return { flex: '2 1 380px', minWidth: 300 };
    case 4:
      return { flex: '1 1 100%', minWidth: '100%' };
    case 2:
    default:
      return { flex: '1 1 260px', minWidth: 230 };
  }
}

const GLOBAL_CSS = `
  :root {
    --bg-canvas: #09090b;
    --bg-elevated: #111114;
    --bg-btn: #151519;
    --bg-btn-hover: #1c1c22;
    --bg-btn-on: #1e2026;
    --bg-input: #141417;
    --line-hairline: rgba(255, 255, 255, 0.07);
    --line-btn: rgba(255, 255, 255, 0.12);
    --line-btn-on: rgba(255, 255, 255, 0.28);
    --line-focus: rgba(255, 255, 255, 0.34);
    --text-primary: #fafafa;
    --text-secondary: #a1a1aa;
    --text-muted: #52525b;
    --dot-ok: #10b981;
    --dot-warn: #f59e0b;
    --dot-err: #ef4444;
    --dot-idle: #3f3f46;
    --font-sans: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    --font-mono: 'JetBrains Mono', 'Fira Code', Consolas, monospace;
  }

  * {
    box-sizing: border-box;
    margin: 0;
    padding: 0;
  }

  html, body, #root {
    background-color: var(--bg-canvas);
    color: var(--text-primary);
    font-family: var(--font-sans);
    font-size: 13.5px;
    line-height: 1.5;
    -webkit-font-smoothing: antialiased;
    min-height: 100vh;
    overflow-y: auto !important;
    overflow-x: hidden !important;
  }

  .tabular {
    font-variant-numeric: tabular-nums;
  }

  .mono {
    font-family: var(--font-mono);
  }

  /* Tactile Hardware-Feel Button */
  .tactile-btn {
    background: var(--bg-btn);
    color: var(--text-secondary);
    border: 1px solid var(--line-btn);
    box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.05), 0 1px 2px rgba(0, 0, 0, 0.35);
    border-radius: 6px;
    padding: 6px 12px;
    font-size: 12px;
    font-weight: 500;
    font-family: var(--font-sans);
    cursor: pointer;
    user-select: none;
    transition: transform 70ms ease, background 110ms ease, border-color 110ms ease, color 110ms ease;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 6px;
  }

  .tactile-btn:hover:not(:disabled) {
    background: var(--bg-btn-hover);
    color: var(--text-primary);
    border-color: var(--line-focus);
  }

  .tactile-btn:active:not(:disabled) {
    transform: translateY(1px) scale(0.97);
  }

  .tactile-btn:disabled {
    opacity: 0.55;
    cursor: default;
  }

  .tactile-btn.active {
    background: var(--text-primary);
    color: var(--bg-canvas);
    border-color: var(--text-primary);
    box-shadow: 0 1px 3px rgba(0, 0, 0, 0.5);
  }

  .tactile-icon-btn {
    width: 32px;
    height: 32px;
    padding: 0;
    background: var(--bg-btn);
    color: var(--text-secondary);
    border: 1px solid var(--line-btn);
    box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.05), 0 1px 2px rgba(0, 0, 0, 0.35);
    border-radius: 6px;
    cursor: pointer;
    user-select: none;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    transition: transform 70ms ease, background 110ms ease, border-color 110ms ease, color 110ms ease;
  }

  .tactile-icon-btn:hover:not(:disabled) {
    background: var(--bg-btn-hover);
    color: var(--text-primary);
    border-color: var(--line-focus);
  }

  .tactile-icon-btn:active:not(:disabled) {
    transform: translateY(1px) scale(0.95);
  }

  .tactile-icon-btn.active {
    background: var(--text-primary);
    color: var(--bg-canvas);
    border-color: var(--text-primary);
  }

  /* Tactile Actuator Tile Button in Flexbox Layout */
  .actuator-flex-btn {
    background: var(--bg-btn);
    border: 1px solid var(--line-btn);
    box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.05), 0 2px 4px rgba(0, 0, 0, 0.3);
    border-radius: 6px;
    padding: 13px 16px;
    display: flex;
    flex-direction: column;
    justify-content: space-between;
    gap: 8px;
    cursor: pointer;
    user-select: none;
    transition: transform 80ms ease, background 120ms ease, border-color 120ms ease, box-shadow 120ms ease;
    position: relative;
  }

  .actuator-flex-btn:hover {
    background: var(--bg-btn-hover);
    border-color: var(--line-focus);
  }

  .actuator-flex-btn:active {
    transform: translateY(1px) scale(0.985);
  }

  .actuator-flex-btn.is-on {
    background: var(--bg-btn-on);
    border-color: var(--line-btn-on);
    box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.1), 0 2px 6px rgba(0, 0, 0, 0.45);
  }

  .sensor-badge {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    height: 28px;
    padding: 0 11px;
    background: var(--bg-elevated);
    border: 1px solid var(--line-hairline);
    border-radius: 5px;
    font-size: 12px;
    color: var(--text-secondary);
    white-space: nowrap;
  }

  .field-input {
    width: 100%;
    background: var(--bg-input);
    border: 1px solid var(--line-btn);
    border-radius: 5px;
    padding: 6px 10px;
    color: var(--text-primary);
    font-family: var(--font-mono);
    font-size: 12px;
    outline: none;
  }

  .field-input:focus {
    border-color: var(--line-focus);
  }

  .mini-ctrl-btn {
    background: var(--bg-canvas);
    color: var(--text-secondary);
    border: 1px solid var(--line-btn);
    border-radius: 4px;
    padding: 2px 6px;
    font-size: 10.5px;
    font-family: var(--font-mono);
    cursor: pointer;
  }

  .mini-ctrl-btn:hover {
    color: var(--text-primary);
    border-color: var(--line-focus);
  }

  .mini-ctrl-btn.active {
    background: var(--text-primary);
    color: var(--bg-canvas);
  }
`;

export default function App() {
  const [tiles, setTiles] = useState<CanvasTile[]>([]);
  const [stateMap, setStateMap] = useState<Record<string, HaEntityState>>({});
  const [haConnected, setHaConnected] = useState<boolean>(false);
  const [layoutMode, setLayoutMode] = useState<'flex' | 'freeform'>('flex');
  const [editMode, setEditMode] = useState<boolean>(false);
  const [showAddDrawer, setShowAddDrawer] = useState<boolean>(false);
  const [editingTile, setEditingTile] = useState<CanvasTile | null>(null);
  const [entitySearch, setEntitySearch] = useState<string>('');
  const [domainFilter, setDomainFilter] = useState<string>('all');
  const [newTileZone, setNewTileZone] = useState<string>('Büro OG');
  const [draggedTileId, setDraggedTileId] = useState<number | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  // Optimistic lock & debounce maps so background polling never reverts a user click
  const optimisticEntityLocks = useRef<Record<string, { state: string; until: number }>>({});
  const lastClickTimeRef = useRef<Record<string, number>>({});
  const [pendingEntities, setPendingEntities] = useState<Record<string, boolean>>({});

  // PC Control & Screen Mirror state
  const [pcBridge, setPcBridge] = useState<PcBridgeState | null>(null);
  const [showPcMirror, setShowPcMirror] = useState<boolean>(false);
  const [pcBusyAction, setPcBusyAction] = useState<string | null>(null);
  const [kvmKeyText, setKvmKeyText] = useState<string>('');
  const pcOptimisticUntil = useRef<number>(0);

  // Freeform 2D Canvas drag tracking
  const freeformRef = useRef<HTMLDivElement | null>(null);
  const draggingFreeform = useRef<{
    id: number;
    startX: number;
    startY: number;
    origX: number;
    origY: number;
  } | null>(null);

  const notify = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 2400);
  };

  const loadBoard = async () => {
    try {
      const data = await api.get<{
        tiles: CanvasTile[];
        stateMap: Record<string, HaEntityState>;
        haConnected: boolean;
      }>('/board');
      setTiles(data.tiles);

      const now = Date.now();
      const incoming = { ...(data.stateMap || {}) };
      // Preserve optimistic states that were recently clicked
      for (const [entId, lock] of Object.entries(optimisticEntityLocks.current)) {
        if (now < lock.until && incoming[entId]) {
          incoming[entId] = { ...incoming[entId], state: lock.state };
        } else if (now >= lock.until) {
          delete optimisticEntityLocks.current[entId];
        }
      }
      setStateMap(incoming);
      setHaConnected(Boolean(data.haConnected));
    } catch (err) {
      console.error(err);
    }
  };

  const loadPcBridge = async () => {
    try {
      const res = await fetch(`${WORKFLOWS_API}/pc-bridge/frame`);
      if (!res.ok) return;
      const data = (await res.json()) as PcBridgeState;
      setPcBridge((prev) => {
        if (Date.now() < pcOptimisticUntil.current && prev?.status?.media && data.status?.media) {
          return {
            ...data,
            status: {
              ...data.status,
              media: prev.status.media,
            },
          };
        }
        return data;
      });
    } catch {}
  };

  useEffect(() => {
    void loadBoard();
    void loadPcBridge();
    const boardTimer = setInterval(() => {
      if (!draggingFreeform.current && !editMode) {
        void loadBoard();
      }
    }, 3500);
    const pcTimer = setInterval(() => {
      void loadPcBridge();
    }, showPcMirror ? 450 : 2000);
    return () => {
      clearInterval(boardTimer);
      clearInterval(pcTimer);
    };
  }, [showPcMirror, editMode]);

  // Debounced helper (returns false if clicked within debounceMs)
  const checkDebounce = (key: string, debounceMs = 320): boolean => {
    const now = Date.now();
    const prev = lastClickTimeRef.current[key] || 0;
    if (now - prev < debounceMs) return false;
    lastClickTimeRef.current[key] = now;
    return true;
  };

  // Execute a PC Axon with optimistic UI update and debounce
  const runPcAxon = async (axonId: string, input: Record<string, string>, label: string) => {
    if (!checkDebounce(`pc_${label}`, 280)) return;
    setPcBusyAction(label);
    try {
      const res = await fetch(`${WORKFLOWS_API}/execute-axon`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ axonId, input }),
      });
      const data = await res.json();
      if (data?.result?.data?.media) {
        const updatedMedia = data.result.data.media;
        pcOptimisticUntil.current = Date.now() + 1800;
        setPcBridge((prev) =>
          prev && prev.status
            ? { ...prev, status: { ...prev.status, media: updatedMedia } }
            : prev
        );
      } else {
        await loadPcBridge();
      }
    } catch (e) {
      notify(e instanceof Error ? e.message : String(e));
    } finally {
      setPcBusyAction(null);
    }
  };

  const handlePcMedia = async (action: string, explicitVol?: number) => {
    if (!checkDebounce(`media_${action}`, 220)) return;

    // Instant optimistic update for volume, mute, and play/pause
    pcOptimisticUntil.current = Date.now() + 2200;
    setPcBridge((prev) => {
      if (!prev || !prev.status || !prev.status.media) return prev;
      const curMedia = prev.status.media;
      const curVol = curMedia.volumePercent ?? 60;
      const nextMedia = { ...curMedia };

      if (action === 'vol_up') {
        nextMedia.volumePercent = Math.min(100, curVol + 5);
        nextMedia.muted = false;
      } else if (action === 'vol_down') {
        nextMedia.volumePercent = Math.max(0, curVol - 5);
      } else if (action === 'mute') {
        nextMedia.muted = !curMedia.muted;
      } else if (action === 'set_volume' && explicitVol !== undefined) {
        nextMedia.volumePercent = explicitVol;
        if (explicitVol > 0) nextMedia.muted = false;
      } else if (action === 'play_pause') {
        nextMedia.state = curMedia.state === 'playing' ? 'paused' : 'playing';
      }

      return {
        ...prev,
        status: {
          ...prev.status,
          media: nextMedia,
        },
      };
    });

    await runPcAxon(
      'pc.media.control',
      {
        action,
        ...(explicitVol !== undefined ? { volumePercent: String(explicitVol) } : {}),
      },
      action
    );
  };

  const handleKvmSwitchMonitor = async (m: string) => {
    setPcBridge((prev) => (prev ? { ...prev, requestedMonitor: m } : prev));
    await fetch(`${WORKFLOWS_API}/pc-bridge/input`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ setMonitor: m }),
    }).catch(() => {});
    setTimeout(() => void loadPcBridge(), 250);
  };

  const handleKvmImageClick = async (e: React.MouseEvent<HTMLImageElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const normalizedX = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    const normalizedY = Math.max(0, Math.min(1, (e.clientY - rect.top) / rect.height));
    await fetch(`${WORKFLOWS_API}/pc-bridge/input`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        type: 'click',
        monitor: pcBridge?.requestedMonitor || 'primary',
        normalizedX,
        normalizedY,
      }),
    }).catch(() => {});
  };

  const handleKvmSendText = async () => {
    if (!kvmKeyText) return;
    const text = kvmKeyText;
    setKvmKeyText('');
    await fetch(`${WORKFLOWS_API}/pc-bridge/input`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        type: 'text',
        monitor: pcBridge?.requestedMonitor || 'primary',
        text,
      }),
    }).catch(() => {});
  };

  // Debounced + Optimistic-Locked Actuator Toggle
  const handleToggleEntity = async (tile: CanvasTile) => {
    if (editMode) return;
    if (!isControllableDomain(tile.entity_id)) return;
    if (!checkDebounce(`tile_${tile.id}`, 350)) return;

    const curState = stateMap[tile.entity_id]?.state;
    const nextState = curState === 'on' ? 'off' : 'on';

    // Lock optimistic state for 2.8 seconds so background polls never bounce it back
    optimisticEntityLocks.current[tile.entity_id] = {
      state: nextState,
      until: Date.now() + 2800,
    };

    setPendingEntities((prev) => ({ ...prev, [tile.entity_id]: true }));
    setStateMap((prev) => ({
      ...prev,
      [tile.entity_id]: {
        ...(prev[tile.entity_id] || {
          entity_id: tile.entity_id,
          attributes: {},
          last_changed: '',
          last_updated: '',
        }),
        state: nextState,
      },
    }));

    try {
      await api.post('/toggle', { entity_id: tile.entity_id });
    } catch (err) {
      delete optimisticEntityLocks.current[tile.entity_id];
      notify(err instanceof Error ? err.message : String(err));
      await loadBoard();
    } finally {
      setTimeout(() => {
        setPendingEntities((prev) => ({ ...prev, [tile.entity_id]: false }));
      }, 240);
    }
  };

  // Flexbox Reordering & Sizing Controls
  const handleMoveTileOrder = async (tile: CanvasTile, direction: -1 | 1) => {
    const zonePeers = tiles
      .filter((t) => t.zone === tile.zone)
      .sort((a, b) => a.sort_order - b.sort_order || a.id - b.id);
    const idx = zonePeers.findIndex((t) => t.id === tile.id);
    const swapIdx = idx + direction;
    if (idx < 0 || swapIdx < 0 || swapIdx >= zonePeers.length) return;

    const reorderedZone = [...zonePeers];
    const [moved] = reorderedZone.splice(idx, 1);
    reorderedZone.splice(swapIdx, 0, moved);

    const updatedAll = tiles.map((t) => {
      const peerPos = reorderedZone.findIndex((p) => p.id === t.id);
      return peerPos >= 0 ? { ...t, sort_order: peerPos + 1 } : t;
    });
    updatedAll.sort((a, b) => a.sort_order - b.sort_order || a.id - b.id);
    setTiles(updatedAll);

    await api.post('/tiles/reorder', {
      updates: reorderedZone.map((t, i) => ({ id: t.id, sort_order: i + 1, zone: t.zone })),
    });
  };

  const handleResizeTileFlex = async (tile: CanvasTile, newColSpan: number) => {
    const updatedTile = { ...tile, col_span: newColSpan };
    setTiles((prev) => prev.map((t) => (t.id === tile.id ? updatedTile : t)));
    await api.put('/tiles', updatedTile);
  };

  const handleChangeTileZone = async (tile: CanvasTile, targetZone: string) => {
    if (!targetZone.trim()) return;
    const updatedTile = { ...tile, zone: targetZone.trim() };
    setTiles((prev) => prev.map((t) => (t.id === tile.id ? updatedTile : t)));
    await api.put('/tiles', updatedTile);
  };

  const handleToggleBadgeMode = async (tile: CanvasTile) => {
    const isCurrentlyBadge = tile.row_span === 0 || (!isControllableDomain(tile.entity_id) && tile.row_span === 1);
    const nextRowSpan = isCurrentlyBadge ? 2 : 0;
    const updatedTile = { ...tile, row_span: nextRowSpan };
    setTiles((prev) => prev.map((t) => (t.id === tile.id ? updatedTile : t)));
    await api.put('/tiles', updatedTile);
  };

  const handleDropOnTile = async (targetTile: CanvasTile) => {
    if (draggedTileId === null || draggedTileId === targetTile.id) return;
    const dragged = tiles.find((t) => t.id === draggedTileId);
    if (!dragged) return;

    const updated = tiles.filter((t) => t.id !== draggedTileId);
    const targetIdx = updated.findIndex((t) => t.id === targetTile.id);
    const movedTile: CanvasTile = { ...dragged, zone: targetTile.zone };
    updated.splice(targetIdx, 0, movedTile);

    const reindexed = updated.map((t, idx) => ({ ...t, sort_order: idx + 1 }));
    setTiles(reindexed);
    setDraggedTileId(null);

    await api.post('/tiles/reorder', {
      updates: reindexed.map((t) => ({ id: t.id, sort_order: t.sort_order, zone: t.zone })),
    });
  };

  const startFreeformDrag = (e: React.MouseEvent, tile: CanvasTile) => {
    if (!editMode) return;
    e.stopPropagation();
    draggingFreeform.current = {
      id: tile.id,
      startX: e.clientX,
      startY: e.clientY,
      origX: tile.pos_x,
      origY: tile.pos_y,
    };
  };

  const onFreeformMouseMove = (e: React.MouseEvent) => {
    if (!draggingFreeform.current) return;
    const { id, startX, startY, origX, origY } = draggingFreeform.current;
    const nextX = Math.max(10, Math.round((origX + (e.clientX - startX)) / 10) * 10);
    const nextY = Math.max(10, Math.round((origY + (e.clientY - startY)) / 10) * 10);
    setTiles((prev) =>
      prev.map((t) => (t.id === id ? { ...t, pos_x: nextX, pos_y: nextY } : t))
    );
  };

  const endFreeformDrag = async () => {
    if (!draggingFreeform.current) return;
    const { id } = draggingFreeform.current;
    draggingFreeform.current = null;
    const moved = tiles.find((t) => t.id === id);
    if (moved) {
      await api.post('/tiles/reorder', {
        updates: [{ id: moved.id, pos_x: moved.pos_x, pos_y: moved.pos_y }],
      });
    }
  };

  const handleSaveTileEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingTile) return;
    await api.put('/tiles', editingTile);
    setEditingTile(null);
    notify('Saved tile configuration.');
    await loadBoard();
  };

  const handleDeleteTile = async (id: number) => {
    await api.delete(`/tiles?id=${id}`);
    setEditingTile(null);
    notify('Removed entity.');
    await loadBoard();
  };

  const handleAddEntityToCanvas = async (entity: HaEntityState) => {
    const controllable = isControllableDomain(entity.entity_id);
    await api.post('/tiles', {
      entity_id: entity.entity_id,
      custom_label: (entity.attributes.friendly_name as string) || entity.entity_id,
      zone: newTileZone || 'Büro OG',
      col_span: controllable ? 2 : 1,
      row_span: controllable ? 1 : 0,
      pos_x: 40 + ((tiles.length * 40) % 600),
      pos_y: 40 + ((tiles.length * 40) % 400),
      accent_color: '#fafafa',
      icon: '',
    });
    notify(`Added ${(entity.attributes.friendly_name as string) || entity.entity_id}`);
    await loadBoard();
  };

  const zones = useMemo(() => Array.from(new Set(tiles.map((t) => t.zone))), [tiles]);

  const { activeCount, totalWatts } = useMemo(() => {
    let active = 0;
    let watts = 0;
    for (const t of tiles) {
      if (isControllableDomain(t.entity_id) && stateMap[t.entity_id]?.state === 'on') {
        active++;
      }
      if (t.sub_entity_id && stateMap[t.sub_entity_id]) {
        const sub = stateMap[t.sub_entity_id];
        if (sub.attributes.unit_of_measurement === 'W') {
          const val = parseFloat(sub.state);
          if (!Number.isNaN(val)) watts += val;
        }
      }
    }
    return { activeCount: active, totalWatts: Math.round(watts * 10) / 10 };
  }, [tiles, stateMap]);

  const pcOnline = Boolean(
    pcBridge?.ok && pcBridge.lastSeenAt && Date.now() - pcBridge.lastSeenAt < 15000
  );
  const pcStatus = pcBridge?.status;
  const pcVolume = pcStatus?.media?.volumePercent ?? 60;
  const pcMuted = Boolean(pcStatus?.media?.muted);
  const pcPlaying = pcStatus?.media?.state === 'playing';
  const pcLocked = Boolean(pcStatus?.sessionLocked);

  const allEntities = useMemo(
    () => Object.values(stateMap).sort((a, b) => a.entity_id.localeCompare(b.entity_id)),
    [stateMap]
  );

  const filteredEntities = useMemo(
    () =>
      allEntities.filter((e) => {
        const dom = e.entity_id.split('.')[0];
        if (
          ![
            'light',
            'switch',
            'sensor',
            'binary_sensor',
            'weather',
            'climate',
            'media_player',
          ].includes(dom)
        ) {
          return false;
        }
        if (domainFilter !== 'all' && dom !== domainFilter) return false;
        if (!entitySearch.trim()) return true;
        const q = entitySearch.toLowerCase();
        const fn = String(e.attributes.friendly_name || '').toLowerCase();
        return e.entity_id.toLowerCase().includes(q) || fn.includes(q);
      }),
    [allEntities, domainFilter, entitySearch]
  );

  const formatSensorBadgeValue = (tile: CanvasTile) => {
    const st = stateMap[tile.entity_id];
    const subSt = tile.sub_entity_id ? stateMap[tile.sub_entity_id] : undefined;
    const rawState = st?.state ?? '—';
    const unit = (st?.attributes?.unit_of_measurement as string) || '';
    const primary = `${rawState}${unit ? ` ${unit}` : ''}`.trim();

    if (subSt && subSt.state && subSt.state !== 'unavailable' && subSt.state !== 'unknown') {
      const subUnit = (subSt.attributes?.unit_of_measurement as string) || '';
      return `${primary} · ${subSt.state}${subUnit ? ` ${subUnit}` : ''}`;
    }
    return primary;
  };

  return (
    <div style={{ maxWidth: 1440, margin: '0 auto', padding: '32px 48px' }}>
      <style>{GLOBAL_CSS}</style>

      {/* 1. HEADER ZONE */}
      <header
        style={{
          display: 'flex',
          alignItems: 'baseline',
          justifyContent: 'space-between',
          paddingBottom: 22,
          borderBottom: '1px solid var(--line-hairline)',
          gap: 24,
          flexWrap: 'wrap',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 20, flexWrap: 'wrap' }}>
          <h1
            style={{
              fontSize: 20,
              fontWeight: 500,
              letterSpacing: '-0.025em',
              color: 'var(--text-primary)',
            }}
          >
            Smart Control
          </h1>
          <span className="tabular mono" style={{ fontSize: 12, color: 'var(--text-muted)' }}>
            {activeCount} Active · {totalWatts.toFixed(1)} W · {tiles.length} Entities ·{' '}
            {haConnected ? 'HA Online' : 'HA Standby'}
          </span>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <button
            className={`tactile-btn ${layoutMode === 'flex' ? 'active' : ''}`}
            onClick={() => setLayoutMode('flex')}
          >
            Flexbox Zones
          </button>
          <button
            className={`tactile-btn ${layoutMode === 'freeform' ? 'active' : ''}`}
            onClick={() => setLayoutMode('freeform')}
          >
            2D Spatial
          </button>
          <button
            className={`tactile-btn ${editMode ? 'active' : ''}`}
            onClick={() => setEditMode(!editMode)}
          >
            {editMode ? '✓ Layout speichern' : 'Layout bearbeiten'}
          </button>
          <button className="tactile-btn" onClick={() => setShowAddDrawer(!showAddDrawer)}>
            + Entity
          </button>
        </div>
      </header>

      {toast && (
        <div
          className="mono"
          style={{
            marginTop: 12,
            padding: '8px 12px',
            background: 'var(--bg-elevated)',
            border: '1px solid var(--line-btn-on)',
            borderRadius: 6,
            fontSize: 12,
            color: 'var(--text-primary)',
          }}
        >
          {toast}
        </div>
      )}

      {/* 2. DEVELOPER WORKSTATION CONTROL BAR (DESKTOP-M8TJERB) */}
      <section
        style={{
          marginTop: 22,
          border: '1px solid var(--line-btn)',
          background: 'var(--bg-elevated)',
          borderRadius: 6,
        }}
      >
        <div
          style={{
            padding: '12px 16px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 16,
            flexWrap: 'wrap',
          }}
        >
          {/* Left: Workstation Identity + Live Media / Telemetry */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', minWidth: 0 }}>
            <span
              style={{
                width: 7,
                height: 7,
                borderRadius: '50%',
                flexShrink: 0,
                background: !pcOnline
                  ? 'var(--dot-idle)'
                  : pcLocked
                    ? 'var(--dot-warn)'
                    : 'var(--dot-ok)',
              }}
            />
            <span style={{ fontWeight: 600, fontSize: 13.5, color: 'var(--text-primary)' }}>
              {pcStatus?.hostname || 'DESKTOP-M8TJERB'}
            </span>
            <span className="mono tabular" style={{ fontSize: 11.5, color: 'var(--text-muted)' }}>
              {pcOnline
                ? `CPU ${pcStatus?.cpuUsagePercent ?? 0}% · RAM ${pcStatus?.memoryUsedGb ?? 0}/${pcStatus?.memoryTotalGb ?? 16} GB`
                : 'OFFLINE / WOL READY'}
            </span>
            {pcOnline && pcStatus?.media?.title && (
              <span
                className="sensor-badge mono"
                style={{
                  maxWidth: 320,
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  height: 26,
                  fontSize: 11,
                }}
                title={pcStatus.media.title}
              >
                <span
                  style={{
                    width: 6,
                    height: 6,
                    borderRadius: '50%',
                    flexShrink: 0,
                    background: pcPlaying ? 'var(--dot-ok)' : 'var(--dot-idle)',
                  }}
                />
                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {pcStatus.media.title}
                </span>
              </span>
            )}
          </div>

          {/* Right: Power + Session + Synchronized Media & Volume + Screen Mirror Button */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            {/* Power & Session */}
            {!pcOnline ? (
              <button
                className="tactile-btn active"
                onClick={() => runPcAxon('pc.power.control', { action: 'wake_on_lan' }, 'wol')}
              >
                Wake PC (WOL)
              </button>
            ) : (
              <>
                {pcLocked ? (
                  <button
                    className="tactile-btn active"
                    onClick={() =>
                      runPcAxon('pc.session.login', { mode: 'unlock', username: 'thoma' }, 'unlock')
                    }
                    title="Windows-Sperrbildschirm aufwecken & entsperren"
                  >
                    Entsperren
                  </button>
                ) : (
                  <button
                    className="tactile-btn"
                    onClick={() => runPcAxon('pc.power.control', { action: 'lock' }, 'lock')}
                    title="Workstation sperren (Win+L)"
                  >
                    Sperren
                  </button>
                )}

                <button
                  className="tactile-btn"
                  onClick={() => {
                    if (confirm('DESKTOP-M8TJERB in den Standby (Sleep) versetzen?')) {
                      void runPcAxon('pc.power.control', { action: 'sleep' }, 'sleep');
                    }
                  }}
                  title="PC in Standby versetzen"
                >
                  Standby
                </button>

                <button
                  className="tactile-btn"
                  onClick={() => {
                    if (confirm('DESKTOP-M8TJERB wirklich herunterfahren (Shutdown)?')) {
                      void runPcAxon(
                        'pc.power.control',
                        { action: 'shutdown', delaySeconds: '5' },
                        'shutdown'
                      );
                    }
                  }}
                  title="PC herunterfahren"
                >
                  Aus
                </button>
              </>
            )}

            <span
              style={{
                width: 1,
                height: 20,
                background: 'var(--line-hairline)',
                display: 'inline-block',
              }}
            />

            {/* Media Transport Controls */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
              <button
                className="tactile-icon-btn"
                onClick={() => handlePcMedia('prev')}
                title="Vorheriger Titel"
              >
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <polygon points="19 20 9 12 19 4 19 20" />
                  <line x1="5" y1="19" x2="5" y2="5" />
                </svg>
              </button>

              <button
                className={`tactile-icon-btn ${pcPlaying ? 'active' : ''}`}
                onClick={() => handlePcMedia('play_pause')}
                title={pcPlaying ? 'Pausieren (Aktuell: Wiedergabe aktiv)' : 'Abspielen'}
              >
                {pcPlaying ? (
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                    <line x1="8" y1="5" x2="8" y2="19" />
                    <line x1="16" y1="5" x2="16" y2="19" />
                  </svg>
                ) : (
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <polygon points="6 4 20 12 6 20 6 4" />
                  </svg>
                )}
              </button>

              <button
                className="tactile-icon-btn"
                onClick={() => handlePcMedia('next')}
                title="Nächster Titel"
              >
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <polygon points="5 4 15 12 5 20 5 4" />
                  <line x1="19" y1="5" x2="19" y2="19" />
                </svg>
              </button>

              <button
                className="tactile-icon-btn mono"
                onClick={() => handlePcMedia('vol_down')}
                title="Lautstärke -5%"
              >
                −
              </button>

              <button
                className={`tactile-btn mono tabular ${pcMuted ? 'active' : ''}`}
                onClick={() => handlePcMedia('mute')}
                title="Stummschalten (Mute Toggle)"
                style={{ minWidth: 56, padding: '5px 8px' }}
              >
                {pcMuted ? 'MUTE' : `${pcVolume}%`}
              </button>

              <button
                className="tactile-icon-btn mono"
                onClick={() => handlePcMedia('vol_up')}
                title="Lautstärke +5%"
              >
                +
              </button>
            </div>

            <span
              style={{
                width: 1,
                height: 20,
                background: 'var(--line-hairline)',
                display: 'inline-block',
              }}
            />

            {/* Minimal Icon Button for Opening Screen Transmission (Web-VNC) */}
            <button
              className={`tactile-icon-btn ${showPcMirror ? 'active' : ''}`}
              onClick={() => setShowPcMirror(!showPcMirror)}
              title="Live Bildschirm-Übertragung (Web-VNC) öffnen/schließen"
              aria-label="Bildschirm-Übertragung öffnen"
            >
              <svg
                width="15"
                height="15"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.9"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <rect x="2" y="3" width="20" height="14" rx="2" ry="2" />
                <line x1="8" y1="21" x2="16" y2="21" />
                <line x1="12" y1="17" x2="12" y2="21" />
              </svg>
            </button>
          </div>
        </div>

        {/* Collapsible Live Screen Mirror Drawer */}
        {showPcMirror && (
          <div
            style={{
              borderTop: '1px solid var(--line-hairline)',
              padding: 16,
              background: 'var(--bg-canvas)',
            }}
          >
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                marginBottom: 10,
                gap: 12,
                flexWrap: 'wrap',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                <span
                  style={{
                    fontSize: 11,
                    textTransform: 'uppercase',
                    letterSpacing: '0.08em',
                    color: 'var(--text-muted)',
                    marginRight: 4,
                  }}
                >
                  Monitor
                </span>
                {[
                  { id: 'primary', label: 'Center (DISPLAY 3)' },
                  { id: '0', label: 'Right (DISPLAY 1)' },
                  { id: '1', label: 'Left (DISPLAY 2)' },
                  { id: 'all', label: 'All 3 (7680×1440)' },
                ].map((m) => (
                  <button
                    key={m.id}
                    className={`tactile-btn mono ${
                      (pcBridge?.requestedMonitor || 'primary') === m.id ? 'active' : ''
                    }`}
                    onClick={() => handleKvmSwitchMonitor(m.id)}
                    style={{ padding: '4px 10px', fontSize: 11 }}
                  >
                    {m.label}
                  </button>
                ))}
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <input
                  type="text"
                  className="field-input"
                  value={kvmKeyText}
                  onChange={(e) => setKvmKeyText(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      void handleKvmSendText();
                    }
                  }}
                  placeholder="Text an PC senden + Enter..."
                  style={{ width: 210, padding: '5px 9px', fontSize: 11.5 }}
                />
                <button className="tactile-btn" onClick={handleKvmSendText}>
                  Senden
                </button>
                <a
                  href="http://192.168.188.46:5185/kvm"
                  target="_blank"
                  rel="noreferrer"
                  className="tactile-btn mono"
                  style={{ textDecoration: 'none', fontSize: 11 }}
                >
                  Vollbild KVM ↗
                </a>
              </div>
            </div>

            {pcBridge?.frameDataUrl ? (
              <img
                src={pcBridge.frameDataUrl}
                onClick={handleKvmImageClick}
                alt="DESKTOP-M8TJERB Live Screen"
                title="Klicken, um Mausklick an dieser Position auf DESKTOP-M8TJERB auszuführen"
                style={{
                  width: '100%',
                  maxHeight: 580,
                  objectFit: 'contain',
                  border: '1px solid var(--line-btn)',
                  borderRadius: 6,
                  background: '#050506',
                  cursor: 'crosshair',
                  display: 'block',
                }}
              />
            ) : (
              <div
                className="mono"
                style={{
                  padding: 32,
                  textAlign: 'center',
                  color: 'var(--text-muted)',
                  border: '1px solid var(--line-hairline)',
                  borderRadius: 6,
                }}
              >
                Synchronisiere Live-Bild von DESKTOP-M8TJERB...
              </div>
            )}
          </div>
        )}
      </section>

      {/* 3. ENTITY PICKER DRAWER */}
      {showAddDrawer && (
        <section
          style={{
            marginTop: 16,
            padding: 18,
            border: '1px solid var(--line-btn)',
            background: 'var(--bg-elevated)',
            borderRadius: 6,
          }}
        >
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              marginBottom: 12,
              gap: 12,
              flexWrap: 'wrap',
            }}
          >
            <span
              style={{
                fontSize: 11,
                fontWeight: 600,
                textTransform: 'uppercase',
                letterSpacing: '0.08em',
                color: 'var(--text-muted)',
              }}
            >
              Add Home Assistant Entity to Zone
            </span>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <input
                type="text"
                className="field-input"
                value={newTileZone}
                onChange={(e) => setNewTileZone(e.target.value)}
                placeholder="Zone (z.B. Büro OG)"
                style={{ width: 160 }}
              />
              <select
                className="field-input"
                value={domainFilter}
                onChange={(e) => setDomainFilter(e.target.value)}
                style={{ width: 130 }}
              >
                <option value="all">All Domains</option>
                <option value="light">light.*</option>
                <option value="switch">switch.*</option>
                <option value="sensor">sensor.*</option>
              </select>
              <input
                type="text"
                className="field-input"
                value={entitySearch}
                onChange={(e) => setEntitySearch(e.target.value)}
                placeholder="Search entity..."
                style={{ width: 200 }}
              />
            </div>
          </div>

          <div
            style={{
              display: 'flex',
              flexWrap: 'wrap',
              gap: 8,
              maxHeight: 240,
              overflowY: 'auto',
            }}
          >
            {filteredEntities.slice(0, 48).map((ent) => (
              <button
                key={ent.entity_id}
                className="tactile-btn"
                onClick={() => handleAddEntityToCanvas(ent)}
                style={{
                  flex: '1 1 240px',
                  justifyContent: 'space-between',
                  padding: '8px 12px',
                  textAlign: 'left',
                }}
              >
                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {(ent.attributes.friendly_name as string) || ent.entity_id}
                </span>
                <span className="mono tabular" style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                  + {ent.state}
                </span>
              </button>
            ))}
          </div>
        </section>
      )}

      {/* 4. MAIN WORKSPACE: FLEXBOX ZONES OR 2D SPATIAL */}
      {layoutMode === 'flex' ? (
        <div style={{ marginTop: 28, display: 'flex', flexDirection: 'column', gap: 28 }}>
          {zones.map((zoneName) => {
            const zoneTiles = tiles
              .filter((t) => t.zone === zoneName)
              .sort((a, b) => a.sort_order - b.sort_order || a.id - b.id);

            const badgeTiles = zoneTiles.filter(
              (t) => t.row_span === 0 || (!isControllableDomain(t.entity_id) && t.row_span !== 2)
            );
            const flexTiles = zoneTiles.filter((t) => !badgeTiles.some((b) => b.id === t.id));

            return (
              <section key={zoneName}>
                {/* Zone Header + Compact Sensor Badges */}
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    paddingBottom: 10,
                    borderBottom: '1px solid var(--line-hairline)',
                    gap: 12,
                    flexWrap: 'wrap',
                  }}
                >
                  <span
                    style={{
                      fontSize: 11,
                      fontWeight: 600,
                      letterSpacing: '0.08em',
                      textTransform: 'uppercase',
                      color: 'var(--text-muted)',
                    }}
                  >
                    {zoneName}
                  </span>

                  {/* Compact Sensor Badges */}
                  {badgeTiles.length > 0 && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                      {badgeTiles.map((sTile) => (
                        <div
                          key={sTile.id}
                          className="sensor-badge"
                          title={sTile.entity_id}
                          style={{ height: editMode ? 32 : 28 }}
                        >
                          <span style={{ color: 'var(--text-muted)', fontSize: 11.5 }}>
                            {sTile.custom_label.replace(/\s*\(.*?\)\s*/g, '')}
                          </span>
                          <span
                            className="mono tabular"
                            style={{ color: 'var(--text-primary)', fontWeight: 500 }}
                          >
                            {formatSensorBadgeValue(sTile)}
                          </span>

                          {editMode && (
                            <span style={{ display: 'inline-flex', gap: 3, marginLeft: 4 }}>
                              <button
                                className="mini-ctrl-btn"
                                onClick={() => handleToggleBadgeMode(sTile)}
                                title="Als große Flexbox-Kachel anzeigen"
                              >
                                Tile
                              </button>
                              <button
                                className="mini-ctrl-btn"
                                onClick={() => setEditingTile({ ...sTile })}
                                title="Bearbeiten"
                              >
                                ✎
                              </button>
                            </span>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Flexbox Button Container */}
                {flexTiles.length > 0 && (
                  <div
                    style={{
                      marginTop: 12,
                      display: 'flex',
                      flexWrap: 'wrap',
                      gap: 10,
                      alignItems: 'stretch',
                    }}
                  >
                    {flexTiles.map((tile) => {
                      const st = stateMap[tile.entity_id];
                      const subSt = tile.sub_entity_id ? stateMap[tile.sub_entity_id] : undefined;
                      const controllable = isControllableDomain(tile.entity_id);
                      const isOn = st?.state === 'on';
                      const isPending = Boolean(pendingEntities[tile.entity_id]);
                      const subVal =
                        subSt && subSt.state !== 'unavailable' && subSt.state !== 'unknown'
                          ? `${subSt.state} ${(subSt.attributes?.unit_of_measurement as string) || ''}`.trim()
                          : null;

                      const flexStyle = getFlexStyleForSpan(tile.col_span || 2);

                      return (
                        <div
                          key={tile.id}
                          className={`actuator-flex-btn ${isOn ? 'is-on' : ''}`}
                          style={{
                            ...flexStyle,
                            opacity: isPending ? 0.82 : 1,
                          }}
                          draggable={editMode}
                          onDragStart={() => setDraggedTileId(tile.id)}
                          onDragOver={(e) => e.preventDefault()}
                          onDrop={() => handleDropOnTile(tile)}
                          onClick={() => handleToggleEntity(tile)}
                        >
                          {/* Top Row: Status Dot + Label + Pill State */}
                          <div
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'space-between',
                              gap: 12,
                            }}
                          >
                            <div
                              style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: 10,
                                minWidth: 0,
                              }}
                            >
                              <span
                                style={{
                                  width: 7,
                                  height: 7,
                                  borderRadius: '50%',
                                  flexShrink: 0,
                                  background: isOn ? 'var(--dot-ok)' : 'var(--dot-idle)',
                                  boxShadow: isOn ? '0 0 8px rgba(16, 185, 129, 0.5)' : 'none',
                                }}
                              />
                              <span
                                style={{
                                  fontSize: 13.5,
                                  fontWeight: 500,
                                  color: isOn ? 'var(--text-primary)' : 'var(--text-secondary)',
                                  overflow: 'hidden',
                                  textOverflow: 'ellipsis',
                                  whiteSpace: 'nowrap',
                                }}
                              >
                                {tile.custom_label}
                              </span>
                            </div>

                            <div
                              className="mono tabular"
                              style={{
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: 8,
                                flexShrink: 0,
                              }}
                            >
                              {subVal && (
                                <span style={{ fontSize: 11.5, color: 'var(--text-secondary)' }}>
                                  {subVal}
                                </span>
                              )}
                              <span
                                style={{
                                  fontSize: 11,
                                  fontWeight: 600,
                                  padding: '2px 7px',
                                  borderRadius: 4,
                                  background: isOn
                                    ? 'rgba(16, 185, 129, 0.16)'
                                    : 'rgba(255, 255, 255, 0.04)',
                                  color: isOn ? '#34d399' : 'var(--text-muted)',
                                  border: `1px solid ${
                                    isOn ? 'rgba(16, 185, 129, 0.35)' : 'var(--line-hairline)'
                                  }`,
                                }}
                              >
                                {controllable ? (isOn ? 'EIN' : 'AUS') : formatSensorBadgeValue(tile)}
                              </span>
                            </div>
                          </div>

                          {/* Edit Mode Inline Flexbox Toolbar */}
                          {editMode && (
                            <div
                              onClick={(e) => e.stopPropagation()}
                              style={{
                                marginTop: 6,
                                paddingTop: 8,
                                borderTop: '1px solid var(--line-hairline)',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'space-between',
                                gap: 6,
                                flexWrap: 'wrap',
                              }}
                            >
                              {/* Order Move Left / Right */}
                              <div style={{ display: 'flex', gap: 3 }}>
                                <button
                                  className="mini-ctrl-btn"
                                  onClick={() => handleMoveTileOrder(tile, -1)}
                                  title="Nach links / vorne verschieben"
                                >
                                  ←
                                </button>
                                <button
                                  className="mini-ctrl-btn"
                                  onClick={() => handleMoveTileOrder(tile, 1)}
                                  title="Nach rechts / hinten verschieben"
                                >
                                  →
                                </button>
                              </div>

                              {/* Flexbox Width Sizing: S / M / L / XL */}
                              <div style={{ display: 'flex', gap: 3 }}>
                                {[
                                  { span: 1, label: 'S' },
                                  { span: 2, label: 'M' },
                                  { span: 3, label: 'L' },
                                  { span: 4, label: '100%' },
                                ].map((sz) => (
                                  <button
                                    key={sz.span}
                                    className={`mini-ctrl-btn ${
                                      (tile.col_span || 2) === sz.span ? 'active' : ''
                                    }`}
                                    onClick={() => handleResizeTileFlex(tile, sz.span)}
                                    title={`Flexbox Breite: ${sz.label}`}
                                  >
                                    {sz.label}
                                  </button>
                                ))}
                              </div>

                              {/* Badge Toggle + Edit + Delete */}
                              <div style={{ display: 'flex', gap: 3 }}>
                                <button
                                  className="mini-ctrl-btn"
                                  onClick={() => handleToggleBadgeMode(tile)}
                                  title="Als kompaktes Kopfzeilen-Badge darstellen"
                                >
                                  Badge
                                </button>
                                <button
                                  className="mini-ctrl-btn"
                                  onClick={() => setEditingTile({ ...tile })}
                                  title="Name, Zone & Sensor bearbeiten"
                                >
                                  ✎
                                </button>
                                <button
                                  className="mini-ctrl-btn"
                                  onClick={() => handleDeleteTile(tile.id)}
                                  style={{ color: 'var(--dot-err)' }}
                                  title="Entfernen"
                                >
                                  ×
                                </button>
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </section>
            );
          })}
        </div>
      ) : (
        /* 2D SPATIAL CANVAS MODE */
        <div
          ref={freeformRef}
          onMouseMove={onFreeformMouseMove}
          onMouseUp={endFreeformDrag}
          onMouseLeave={endFreeformDrag}
          style={{
            marginTop: 24,
            position: 'relative',
            width: '100%',
            height: 680,
            border: '1px solid var(--line-btn)',
            borderRadius: 6,
            background:
              'radial-gradient(rgba(255,255,255,0.08) 1px, transparent 1px) 0 0 / 20px 20px var(--bg-canvas)',
            overflow: 'auto',
          }}
        >
          {tiles.map((tile) => {
            const controllable = isControllableDomain(tile.entity_id);
            const isOn = stateMap[tile.entity_id]?.state === 'on';
            return (
              <div
                key={tile.id}
                className={`actuator-flex-btn ${isOn ? 'is-on' : ''}`}
                onMouseDown={(e) => startFreeformDrag(e, tile)}
                onClick={() => handleToggleEntity(tile)}
                style={{
                  position: 'absolute',
                  left: tile.pos_x,
                  top: tile.pos_y,
                  width: controllable ? 230 : 'auto',
                  padding: controllable ? '11px 14px' : '6px 12px',
                  cursor: editMode ? 'grab' : controllable ? 'pointer' : 'default',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    {controllable && (
                      <span
                        style={{
                          width: 7,
                          height: 7,
                          borderRadius: '50%',
                          background: isOn ? 'var(--dot-ok)' : 'var(--dot-idle)',
                        }}
                      />
                    )}
                    <span
                      style={{
                        fontSize: 12.5,
                        color: isOn ? 'var(--text-primary)' : 'var(--text-secondary)',
                        fontWeight: 500,
                      }}
                    >
                      {tile.custom_label}
                    </span>
                  </div>
                  <span className="mono tabular" style={{ fontSize: 11.5, color: 'var(--text-muted)' }}>
                    {controllable ? (isOn ? 'EIN' : 'AUS') : formatSensorBadgeValue(tile)}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* 5. MINIMAL EDIT MODAL */}
      {editingTile && (
        <div
          onClick={() => setEditingTile(null)}
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0, 0, 0, 0.72)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 100,
            padding: 16,
          }}
        >
          <form
            onClick={(e) => e.stopPropagation()}
            onSubmit={handleSaveTileEdit}
            style={{
              width: '100%',
              maxWidth: 420,
              background: 'var(--bg-elevated)',
              border: '1px solid var(--line-btn-on)',
              borderRadius: 6,
              padding: 24,
              display: 'flex',
              flexDirection: 'column',
              gap: 14,
            }}
          >
            <div
              style={{
                fontSize: 12,
                fontWeight: 600,
                textTransform: 'uppercase',
                letterSpacing: '0.08em',
                color: 'var(--text-muted)',
              }}
            >
              Schaltfläche konfigurieren
            </div>

            <div>
              <label style={{ display: 'block', fontSize: 12, color: 'var(--text-secondary)', marginBottom: 4 }}>
                Anzeigename
              </label>
              <input
                type="text"
                className="field-input"
                value={editingTile.custom_label}
                onChange={(e) => setEditingTile({ ...editingTile, custom_label: e.target.value })}
              />
            </div>

            <div>
              <label style={{ display: 'block', fontSize: 12, color: 'var(--text-secondary)', marginBottom: 4 }}>
                Zone (Raum)
              </label>
              <input
                type="text"
                className="field-input"
                list="zone-list"
                value={editingTile.zone}
                onChange={(e) => setEditingTile({ ...editingTile, zone: e.target.value })}
              />
              <datalist id="zone-list">
                {zones.map((z) => (
                  <option key={z} value={z} />
                ))}
              </datalist>
            </div>

            <div>
              <label style={{ display: 'block', fontSize: 12, color: 'var(--text-secondary)', marginBottom: 4 }}>
                Flexbox-Breite
              </label>
              <select
                className="field-input"
                value={editingTile.col_span || 2}
                onChange={(e) =>
                  setEditingTile({ ...editingTile, col_span: Number(e.target.value) })
                }
              >
                <option value={1}>S — Kompakt (220px)</option>
                <option value={2}>M — Standard Flex (1x)</option>
                <option value={3}>L — Breit Flex (2x)</option>
                <option value={4}>100% — Volle Zeile</option>
              </select>
            </div>

            <div>
              <label style={{ display: 'block', fontSize: 12, color: 'var(--text-secondary)', marginBottom: 4 }}>
                Sekundärer Sensor (z.B. Watt oder Luftfeuchte entity_id)
              </label>
              <input
                type="text"
                className="field-input"
                value={editingTile.sub_entity_id}
                onChange={(e) => setEditingTile({ ...editingTile, sub_entity_id: e.target.value })}
              />
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', paddingTop: 8 }}>
              <button
                type="button"
                className="tactile-btn"
                onClick={() => handleDeleteTile(editingTile.id)}
                style={{ color: 'var(--dot-err)' }}
              >
                Löschen
              </button>
              <div style={{ display: 'flex', gap: 8 }}>
                <button type="button" className="tactile-btn" onClick={() => setEditingTile(null)}>
                  Abbrechen
                </button>
                <button type="submit" className="tactile-btn active">
                  Speichern
                </button>
              </div>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
