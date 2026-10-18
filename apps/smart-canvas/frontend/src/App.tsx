import React, { useEffect, useRef, useState } from 'react';
import { createAppClient, type HaEntityState } from '@thassi/sdk/client';

const api = createAppClient('smart-canvas');

interface CanvasTile {
  id: number;
  entity_id: string;
  sub_entity_id: string;
  custom_label: string;
  zone: string;
  col_span: number;
  row_span: number;
  sort_order: number;
  pos_x: number;
  pos_y: number;
  accent_color: string;
  icon: string;
}

const PRESET_COLORS = ['#facc15', '#fb923c', '#38bdf8', '#4ade80', '#2dd4bf', '#a855f7', '#f43f5e'];
const PRESET_ICONS = ['💡', '🔆', '🔌', '✨', '🌡️', '🌱', '🧺', '🪟', '🚨', '🌈', '🍲', '📅', '⚡', '📺'];

function isControllableDomain(entityId: string): boolean {
  const domain = entityId.split('.')[0];
  return ['light', 'switch', 'input_boolean', 'fan', 'script', 'scene'].includes(domain);
}

export default function App() {
  const [tiles, setTiles] = useState<CanvasTile[]>([]);
  const [stateMap, setStateMap] = useState<Record<string, HaEntityState>>({});
  const [layoutMode, setLayoutMode] = useState<'grid' | 'freeform'>('grid');
  const [editMode, setEditMode] = useState<boolean>(false);
  const [showAddDrawer, setShowAddDrawer] = useState<boolean>(false);
  const [editingTile, setEditingTile] = useState<CanvasTile | null>(null);
  const [entitySearch, setEntitySearch] = useState<string>('');
  const [domainFilter, setDomainFilter] = useState<string>('all');
  const [newTileZone, setNewTileZone] = useState<string>('Büro OG');
  const [draggedTileId, setDraggedTileId] = useState<number | null>(null);
  const [toast, setToast] = useState<string | null>(null);

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
    setTimeout(() => setToast(null), 3000);
  };

  const loadBoard = async () => {
    try {
      const data = await api.get<{
        tiles: CanvasTile[];
        stateMap: Record<string, HaEntityState>;
        haConnected: boolean;
      }>('/board');
      setTiles(data.tiles);
      setStateMap(data.stateMap || {});
    } catch (err) {
      console.error(err);
    }
  };

  useEffect(() => {
    void loadBoard();
    const timer = setInterval(() => {
      if (!draggingFreeform.current) {
        void loadBoard();
      }
    }, 3500);
    return () => clearInterval(timer);
  }, []);

  const handleToggleEntity = async (tile: CanvasTile) => {
    if (editMode) {
      setEditingTile({ ...tile });
      return;
    }
    if (!isControllableDomain(tile.entity_id)) return;

    // Optimistic state flip
    const curState = stateMap[tile.entity_id]?.state;
    const nextState = curState === 'on' ? 'off' : 'on';
    if (stateMap[tile.entity_id]) {
      setStateMap((prev) => ({
        ...prev,
        [tile.entity_id]: {
          ...prev[tile.entity_id],
          state: nextState,
        },
      }));
    }

    try {
      const res = await api.post<{ state?: HaEntityState | null }>('/toggle', {
        entity_id: tile.entity_id,
      });
      if (res.state) {
        setStateMap((prev) => ({
          ...prev,
          [tile.entity_id]: res.state!,
        }));
      } else {
        await loadBoard();
      }
    } catch (err) {
      notify(err instanceof Error ? err.message : String(err));
      await loadBoard();
    }
  };

  // Drag & Drop reordering in Grid Mode
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

  const handleDropOnZoneHeader = async (zoneName: string) => {
    if (draggedTileId === null) return;
    const updated = tiles.map((t, idx) =>
      t.id === draggedTileId ? { ...t, zone: zoneName, sort_order: idx + 1 } : t
    );
    setTiles(updated);
    setDraggedTileId(null);
    await api.post('/tiles/reorder', {
      updates: updated.map((t) => ({ id: t.id, sort_order: t.sort_order, zone: t.zone })),
    });
  };

  // Freeform 2D Canvas mouse dragging
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
    // Snap to 10px grid for clean alignment
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
    notify('Saved tile settings!');
    await loadBoard();
  };

  const handleAddEntityToCanvas = async (entity: HaEntityState) => {
    const domain = entity.entity_id.split('.')[0];
    const icon =
      domain === 'light'
        ? '💡'
        : domain === 'switch'
          ? '🔌'
          : domain === 'sensor'
            ? '🌡️'
            : '⚡';
    await api.post('/tiles', {
      entity_id: entity.entity_id,
      custom_label: (entity.attributes.friendly_name as string) || entity.entity_id,
      zone: newTileZone || 'Büro OG',
      col_span: 1,
      row_span: 1,
      pos_x: 40 + ((tiles.length * 40) % 600),
      pos_y: 40 + ((tiles.length * 40) % 400),
      accent_color: domain === 'light' ? '#facc15' : '#38bdf8',
      icon,
    });
    notify(`Added ${(entity.attributes.friendly_name as string) || entity.entity_id} to ${newTileZone}!`);
    await loadBoard();
  };

  // Group tiles by Zone
  const zones = Array.from(new Set(tiles.map((t) => t.zone)));
  const allEntities = Object.values(stateMap).sort((a, b) =>
    a.entity_id.localeCompare(b.entity_id)
  );
  const filteredEntities = allEntities.filter((e) => {
    const dom = e.entity_id.split('.')[0];
    if (
      !['light', 'switch', 'sensor', 'binary_sensor', 'weather', 'climate', 'media_player'].includes(
        dom
      )
    ) {
      return false;
    }
    if (domainFilter !== 'all' && dom !== domainFilter) return false;
    if (!entitySearch.trim()) return true;
    const q = entitySearch.toLowerCase();
    const fn = String(e.attributes.friendly_name || '').toLowerCase();
    return e.entity_id.toLowerCase().includes(q) || fn.includes(q);
  });

  const activeLightsAndSwitches = tiles.filter((t) => {
    const st = stateMap[t.entity_id]?.state;
    return isControllableDomain(t.entity_id) && st === 'on';
  }).length;

  const renderTileCard = (tile: CanvasTile, isFreeform = false) => {
    const st = stateMap[tile.entity_id];
    const subSt = tile.sub_entity_id ? stateMap[tile.sub_entity_id] : undefined;
    const controllable = isControllableDomain(tile.entity_id);
    const isOn = st?.state === 'on';
    const isUnavailable = !st || st.state === 'unavailable' || st.state === 'unknown';
    const unit = (st?.attributes?.unit_of_measurement as string) || '';
    const subUnit = (subSt?.attributes?.unit_of_measurement as string) || '';

    return (
      <div
        key={tile.id}
        draggable={editMode && !isFreeform}
        onDragStart={() => setDraggedTileId(tile.id)}
        onDragOver={(e) => {
          if (editMode && !isFreeform) e.preventDefault();
        }}
        onDrop={() => {
          if (editMode && !isFreeform) void handleDropOnTile(tile);
        }}
        onMouseDown={(e) => {
          if (isFreeform && editMode) startFreeformDrag(e, tile);
        }}
        onClick={() => void handleToggleEntity(tile)}
        style={{
          gridColumn: !isFreeform ? `span ${tile.col_span || 1}` : undefined,
          gridRow: !isFreeform ? `span ${tile.row_span || 1}` : undefined,
          position: isFreeform ? 'absolute' : 'relative',
          left: isFreeform ? tile.pos_x : undefined,
          top: isFreeform ? tile.pos_y : undefined,
          width: isFreeform ? (tile.col_span === 2 ? 420 : 210) : undefined,
          minHeight: 118,
          padding: '16px',
          borderRadius: 16,
          background:
            controllable && isOn
              ? `linear-gradient(135deg, ${tile.accent_color}28 0%, #1e293b 100%)`
              : '#1e293b',
          border: editMode
            ? '2px dashed #38bdf8'
            : controllable && isOn
              ? `2px solid ${tile.accent_color}`
              : '1px solid #334155',
          boxShadow:
            controllable && isOn ? `0 0 24px -6px ${tile.accent_color}55` : '0 4px 12px rgba(0,0,0,0.2)',
          cursor: editMode ? 'grab' : controllable ? 'pointer' : 'default',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          transition: isFreeform ? 'none' : 'all 0.18s ease',
          userSelect: 'none',
          opacity: isUnavailable && !editMode ? 0.55 : 1,
        }}
      >
        {/* Top Row: Icon + Status Pill or Edit Controls */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div
            style={{
              width: 38,
              height: 38,
              borderRadius: 10,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: 20,
              background: controllable && isOn ? tile.accent_color : '#0f172a',
              color: controllable && isOn ? '#0f172a' : '#f8fafc',
            }}
          >
            {tile.icon}
          </div>

          {editMode ? (
            <div style={{ display: 'flex', gap: 4 }} onClick={(e) => e.stopPropagation()}>
              <button
                onClick={async () => {
                  const nextSpan = tile.col_span === 1 ? 2 : 1;
                  await api.put('/tiles', { id: tile.id, col_span: nextSpan });
                  await loadBoard();
                }}
                title="Resize tile width (1x vs 2x)"
                style={miniBtn}
              >
                {tile.col_span === 2 ? '2x1' : '1x1'}
              </button>
              <button
                onClick={() => setEditingTile({ ...tile })}
                title="Configure tile"
                style={miniBtn}
              >
                ⚙️
              </button>
              <button
                onClick={async () => {
                  await api.delete(`/tiles?id=${tile.id}`);
                  await loadBoard();
                }}
                title="Remove from canvas"
                style={{ ...miniBtn, color: '#ef4444', borderColor: '#ef4444' }}
              >
                ✕
              </button>
            </div>
          ) : (
            <div style={{ textAlign: 'right' }}>
              {controllable ? (
                <span
                  style={{
                    display: 'inline-block',
                    padding: '3px 10px',
                    borderRadius: 99,
                    fontSize: 11,
                    fontWeight: 700,
                    textTransform: 'uppercase',
                    background: isOn ? tile.accent_color : '#0f172a',
                    color: isOn ? '#0f172a' : '#64748b',
                  }}
                >
                  {st?.state || 'offline'}
                </span>
              ) : (
                <span style={{ fontSize: 18, fontWeight: 700, color: tile.accent_color }}>
                  {st ? `${st.state}${unit ? ` ${unit}` : ''}` : '—'}
                </span>
              )}
            </div>
          )}
        </div>

        {/* Bottom Row: Label + Secondary Sensor Badge */}
        <div style={{ marginTop: 14 }}>
          <div
            style={{
              fontWeight: 600,
              fontSize: 15,
              color: '#f8fafc',
              lineHeight: 1.25,
              marginBottom: 4,
            }}
          >
            {tile.custom_label}
          </div>

          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              fontSize: 12,
              color: '#94a3b8',
            }}
          >
            <span style={{ fontSize: 11, color: '#64748b' }}>
              {editMode ? tile.entity_id : tile.entity_id.split('.')[0]}
            </span>
            {subSt && (
              <span
                style={{
                  color: '#38bdf8',
                  fontWeight: 600,
                  background: '#0f172a',
                  padding: '2px 8px',
                  borderRadius: 99,
                  fontSize: 11,
                }}
              >
                {subSt.state} {subUnit}
              </span>
            )}
          </div>
        </div>
      </div>
    );
  };

  return (
    <div style={{ maxWidth: 1320, margin: '0 auto', padding: '20px 24px' }}>
      {/* Top Bar */}
      <header
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: 12,
          marginBottom: 24,
          paddingBottom: 16,
          borderBottom: '1px solid #1e293b',
        }}
      >
        <div>
          <h1 style={{ margin: 0, fontSize: 24, color: '#38bdf8' }}>
            🎛️ Smart Control Canvas
          </h1>
          <p style={{ margin: '4px 0 0', color: '#94a3b8', fontSize: 13 }}>
            <strong>{activeLightsAndSwitches}</strong> Lights/Switches Active •{' '}
            <strong>{tiles.length}</strong> Tiles on Board •{' '}
            {editMode
              ? '🛠️ Edit Mode: Drag tiles to rearrange, click 1x1/2x1 to resize, or click ⚙️ to customize!'
              : 'Click any light or switch tile to toggle immediately'}
          </p>
        </div>

        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button
            onClick={() => setLayoutMode(layoutMode === 'grid' ? 'freeform' : 'grid')}
            style={btnTab}
          >
            {layoutMode === 'grid' ? '🗺️ Switch to 2D Freeform Canvas' : '🔲 Switch to Zone Grid'}
          </button>

          <button
            onClick={() => setEditMode(!editMode)}
            style={{
              ...btnTab,
              background: editMode ? '#f59e0b' : '#1e293b',
              color: editMode ? '#0f172a' : '#f8fafc',
              borderColor: editMode ? '#f59e0b' : '#334155',
            }}
          >
            {editMode ? '✓ Done Rearranging' : '✋ Rearrange / Edit Layout'}
          </button>

          <button
            onClick={() => setShowAddDrawer(!showAddDrawer)}
            style={btnPrimary}
          >
            + Add Entity Tile
          </button>
        </div>
      </header>

      {toast && (
        <div
          style={{
            background: '#0284c7',
            color: '#fff',
            padding: '10px 16px',
            borderRadius: 8,
            marginBottom: 16,
            fontWeight: 500,
          }}
        >
          {toast}
        </div>
      )}

      {/* Entity Browser / Add Tile Drawer */}
      {showAddDrawer && (
        <div
          style={{
            background: '#1e293b',
            border: '1px solid #38bdf8',
            borderRadius: 14,
            padding: 20,
            marginBottom: 24,
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 12 }}>
            <h3 style={{ margin: 0, color: '#38bdf8' }}>
              Add Home Assistant Entity to Canvas ({filteredEntities.length} found)
            </h3>
            <button onClick={() => setShowAddDrawer(false)} style={miniBtn}>
              Close ✕
            </button>
          </div>

          <div
            style={{
              display: 'grid',
              gridTemplateColumns: '2fr 1fr 1fr',
              gap: 12,
              marginBottom: 14,
            }}
          >
            <input
              value={entitySearch}
              onChange={(e) => setEntitySearch(e.target.value)}
              placeholder="Search by name or entity_id (e.g. buro, wohnkueche, shelly, light)..."
              style={{ ...inputStyle, marginBottom: 0 }}
            />
            <select
              value={domainFilter}
              onChange={(e) => setDomainFilter(e.target.value)}
              style={{ ...inputStyle, marginBottom: 0 }}
            >
              <option value="all">All Domains</option>
              <option value="light">💡 Lights</option>
              <option value="switch">🔌 Switches</option>
              <option value="sensor">🌡️ Sensors</option>
              <option value="binary_sensor">🔔 Binary Sensors</option>
              <option value="weather">⛅ Weather</option>
            </select>
            <input
              value={newTileZone}
              onChange={(e) => setNewTileZone(e.target.value)}
              placeholder="Target Zone (e.g. Büro OG)"
              style={{ ...inputStyle, marginBottom: 0 }}
            />
          </div>

          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))',
              gap: 8,
              maxHeight: 280,
              overflowY: 'auto',
            }}
          >
            {filteredEntities.map((ent) => (
              <div
                key={ent.entity_id}
                style={{
                  background: '#0f172a',
                  border: '1px solid #334155',
                  borderRadius: 8,
                  padding: '8px 12px',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                }}
              >
                <div style={{ overflow: 'hidden', paddingRight: 8 }}>
                  <div
                    style={{
                      fontSize: 13,
                      fontWeight: 600,
                      whiteSpace: 'nowrap',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                    }}
                  >
                    {(ent.attributes.friendly_name as string) || ent.entity_id}
                  </div>
                  <div style={{ fontSize: 11, color: '#64748b' }}>
                    {ent.entity_id} • <strong>{ent.state}</strong>
                  </div>
                </div>
                <button
                  onClick={() => void handleAddEntityToCanvas(ent)}
                  style={{ ...btnPrimary, padding: '5px 10px', fontSize: 12 }}
                >
                  + Add
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Tile Customization Modal */}
      {editingTile && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.65)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 100,
          }}
        >
          <form
            onSubmit={handleSaveTileEdit}
            style={{
              background: '#1e293b',
              border: '1px solid #38bdf8',
              borderRadius: 16,
              padding: 24,
              width: 440,
              maxWidth: '92vw',
            }}
          >
            <h3 style={{ marginTop: 0, color: '#38bdf8' }}>Customize Tile</h3>
            <label style={labelStyle}>Custom Display Label</label>
            <input
              value={editingTile.custom_label}
              onChange={(e) =>
                setEditingTile({ ...editingTile, custom_label: e.target.value })
              }
              style={inputStyle}
            />

            <label style={labelStyle}>Zone / Room Group</label>
            <input
              value={editingTile.zone}
              onChange={(e) => setEditingTile({ ...editingTile, zone: e.target.value })}
              placeholder="e.g. Büro OG, Wohnküche"
              style={inputStyle}
            />

            <label style={labelStyle}>
              Paired Secondary Sensor (e.g. Shelly Wattage / Humidity badge)
            </label>
            <select
              value={editingTile.sub_entity_id}
              onChange={(e) =>
                setEditingTile({ ...editingTile, sub_entity_id: e.target.value })
              }
              style={inputStyle}
            >
              <option value="">-- None --</option>
              {allEntities
                .filter((e) => e.entity_id.startsWith('sensor.'))
                .map((s) => (
                  <option key={s.entity_id} value={s.entity_id}>
                    {(s.attributes.friendly_name as string) || s.entity_id} ({s.state}{' '}
                    {(s.attributes.unit_of_measurement as string) || ''})
                  </option>
                ))}
            </select>

            <label style={labelStyle}>Icon</label>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 12 }}>
              {PRESET_ICONS.map((ic) => (
                <button
                  type="button"
                  key={ic}
                  onClick={() => setEditingTile({ ...editingTile, icon: ic })}
                  style={{
                    padding: '6px 10px',
                    borderRadius: 8,
                    border:
                      editingTile.icon === ic ? '2px solid #38bdf8' : '1px solid #334155',
                    background: '#0f172a',
                    cursor: 'pointer',
                    fontSize: 16,
                  }}
                >
                  {ic}
                </button>
              ))}
            </div>

            <label style={labelStyle}>Accent Glow Color</label>
            <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
              {PRESET_COLORS.map((col) => (
                <button
                  type="button"
                  key={col}
                  onClick={() => setEditingTile({ ...editingTile, accent_color: col })}
                  style={{
                    width: 28,
                    height: 28,
                    borderRadius: 99,
                    background: col,
                    border:
                      editingTile.accent_color === col
                        ? '3px solid #fff'
                        : '1px solid transparent',
                    cursor: 'pointer',
                  }}
                />
              ))}
            </div>

            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button
                type="button"
                onClick={() => setEditingTile(null)}
                style={btnTab}
              >
                Cancel
              </button>
              <button type="submit" style={btnPrimary}>
                Save Changes
              </button>
            </div>
          </form>
        </div>
      )}

      {/* MODE 1: Dynamic Drag & Drop Zone Grid */}
      {layoutMode === 'grid' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 28 }}>
          {zones.map((zoneName) => {
            const zoneTiles = tiles.filter((t) => t.zone === zoneName);
            return (
              <section
                key={zoneName}
                onDragOver={(e) => {
                  if (editMode) e.preventDefault();
                }}
                onDrop={() => {
                  if (editMode) void handleDropOnZoneHeader(zoneName);
                }}
              >
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 10,
                    marginBottom: 12,
                  }}
                >
                  <h2 style={{ margin: 0, fontSize: 17, color: '#e2e8f0' }}>{zoneName}</h2>
                  <span
                    style={{
                      fontSize: 11,
                      color: '#64748b',
                      background: '#1e293b',
                      padding: '2px 8px',
                      borderRadius: 99,
                    }}
                  >
                    {zoneTiles.length}
                  </span>
                </div>

                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))',
                    gap: 14,
                  }}
                >
                  {zoneTiles.map((tile) => renderTileCard(tile, false))}
                </div>
              </section>
            );
          })}
        </div>
      )}

      {/* MODE 2: 2D Freeform Spatial Canvas */}
      {layoutMode === 'freeform' && (
        <div>
          <p style={{ fontSize: 13, color: '#94a3b8', marginTop: 0 }}>
            {editMode
              ? '✋ Drag any tile anywhere on the 2D canvas below—positions snap to a 10px grid and save automatically to SQLite!'
              : 'Click "Rearrange / Edit Layout" in the top bar to drag tiles anywhere on this 2D surface.'}
          </p>
          <div
            ref={freeformRef}
            onMouseMove={onFreeformMouseMove}
            onMouseUp={() => void endFreeformDrag()}
            onMouseLeave={() => void endFreeformDrag()}
            style={{
              position: 'relative',
              width: '100%',
              height: 720,
              background:
                'radial-gradient(#334155 1px, transparent 1px) 0 0 / 20px 20px #0b1120',
              border: '1px solid #334155',
              borderRadius: 16,
              overflow: 'auto',
            }}
          >
            {tiles.map((tile) => renderTileCard(tile, true))}
          </div>
        </div>
      )}
    </div>
  );
}

const labelStyle: React.CSSProperties = {
  display: 'block',
  fontSize: 12,
  color: '#94a3b8',
  marginBottom: 4,
};

const inputStyle: React.CSSProperties = {
  width: '100%',
  boxSizing: 'border-box',
  padding: '8px 12px',
  borderRadius: 6,
  border: '1px solid #334155',
  background: '#0f172a',
  color: '#f8fafc',
  marginBottom: 12,
};

const btnPrimary: React.CSSProperties = {
  padding: '8px 16px',
  borderRadius: 8,
  border: 'none',
  background: '#0284c7',
  color: '#fff',
  fontWeight: 600,
  cursor: 'pointer',
};

const btnTab: React.CSSProperties = {
  padding: '8px 14px',
  borderRadius: 8,
  border: '1px solid #334155',
  background: '#1e293b',
  color: '#f8fafc',
  fontWeight: 600,
  cursor: 'pointer',
};

const miniBtn: React.CSSProperties = {
  background: '#0f172a',
  border: '1px solid #475569',
  color: '#e2e8f0',
  borderRadius: 6,
  padding: '3px 7px',
  fontSize: 11,
  cursor: 'pointer',
};
