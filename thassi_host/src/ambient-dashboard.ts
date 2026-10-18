import { getHassSidebarStylerScript } from './hass-sidebar-sync.js';

export function renderUnifiedDashboardHtml(ingressPath: string): string {
  const sidebarStylerScript = getHassSidebarStylerScript();

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Thassi Horizon</title>
  <script>window.__THASSI_INGRESS_PATH__ = ${JSON.stringify(ingressPath)};</script>
  <style>
    :root {
      --text: #f8fafc;
      --text-soft: rgba(248, 250, 252, 0.72);
      --text-muted: rgba(248, 250, 252, 0.45);
      --accent: #38bdf8;
      --sun-glow: #fbbf24;
      --font-sans: "Inter", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
    }
    * { box-sizing: border-box; user-select: none; }
    html, body {
      margin: 0;
      padding: 0;
      width: 100vw;
      height: 100vh;
      overflow: hidden;
      background: #040711;
      color: var(--text);
      font-family: var(--font-sans);
      -webkit-font-smoothing: antialiased;
    }

    /* 1. DYNAMIC DAYTIME SKY & CELESTIAL SUN STAGE */
    #sky-stage {
      position: fixed;
      inset: 0;
      z-index: 1;
      pointer-events: none;
      transition: background 1.2s cubic-bezier(0.22, 1, 0.36, 1);
      overflow: hidden;
    }
    #starfield {
      position: absolute;
      inset: 0;
      transition: opacity 1.5s ease;
    }
    .star {
      position: absolute;
      background: #fff;
      border-radius: 50%;
      animation: twinkle var(--dur, 4s) ease-in-out infinite alternate;
    }
    @keyframes twinkle {
      0% { opacity: 0.15; transform: scale(0.8); }
      100% { opacity: 0.95; transform: scale(1.2); }
    }

    /* Atmospheric horizon mist & glow */
    #horizon-glow {
      position: absolute;
      left: -10%;
      right: -10%;
      bottom: 18vh;
      height: 38vh;
      filter: blur(55px);
      opacity: 0.75;
      transition: background 1.2s ease, opacity 1.2s ease;
    }

    /* Delicate Solar Arc SVG Path */
    #solar-arc-svg {
      position: absolute;
      inset: 0;
      width: 100%;
      height: 100%;
      overflow: visible;
    }

    /* The Rising & Setting Sun */
    #sun-assembly {
      position: absolute;
      width: 0;
      height: 0;
      transform: translate3d(0, 0, 0);
      transition: left 0.6s cubic-bezier(0.22, 1, 0.36, 1), top 0.6s cubic-bezier(0.22, 1, 0.36, 1), opacity 0.8s ease;
      will-change: left, top;
    }
    .sun-core {
      position: absolute;
      width: 84px;
      height: 84px;
      left: -42px;
      top: -42px;
      border-radius: 50%;
      background: radial-gradient(circle, #ffffff 0%, #fef08a 38%, #fbbf24 72%, rgba(245, 158, 11, 0) 100%);
      box-shadow:
        0 0 60px 20px rgba(251, 191, 36, 0.65),
        0 0 140px 55px rgba(249, 115, 22, 0.42),
        0 0 260px 110px rgba(234, 88, 12, 0.24);
      animation: sunPulse 6s ease-in-out infinite alternate;
    }
    .sun-corona {
      position: absolute;
      width: 240px;
      height: 240px;
      left: -120px;
      top: -120px;
      border-radius: 50%;
      background: conic-gradient(
        from 0deg,
        transparent 0deg,
        rgba(254, 240, 138, 0.16) 20deg,
        transparent 45deg,
        rgba(251, 191, 36, 0.12) 90deg,
        transparent 130deg,
        rgba(254, 240, 138, 0.18) 180deg,
        transparent 220deg,
        rgba(251, 191, 36, 0.14) 275deg,
        transparent 320deg,
        rgba(254, 240, 138, 0.15) 350deg,
        transparent 360deg
      );
      filter: blur(8px);
      animation: rotateCorona 60s linear infinite;
    }
    @keyframes sunPulse {
      0% { transform: scale(0.96); }
      100% { transform: scale(1.05); }
    }
    @keyframes rotateCorona {
      from { transform: rotate(0deg); }
      to { transform: rotate(360deg); }
    }

    /* Nocturnal Moon (when sun is below horizon) */
    #moon-assembly {
      position: absolute;
      width: 0;
      height: 0;
      transition: left 0.8s ease, top 0.8s ease, opacity 1s ease;
    }
    .moon-core {
      position: absolute;
      width: 46px;
      height: 46px;
      left: -23px;
      top: -23px;
      border-radius: 50%;
      background: radial-gradient(circle at 35% 35%, #f8fafc 0%, #cbd5e1 65%, #64748b 100%);
      box-shadow: 0 0 45px 12px rgba(186, 230, 253, 0.32), 0 0 110px 35px rgba(56, 189, 248, 0.14);
    }

    /* 2. MONUMENTAL DATE & TIME TYPOGRAPHY */
    #hero-clock-region {
      position: fixed;
      top: 5.5vh;
      left: 4.2vw;
      z-index: 15;
      pointer-events: none;
    }
    .clock-row {
      display: flex;
      align-items: baseline;
      gap: 10px;
      line-height: 0.92;
    }
    #hero-time {
      font-size: clamp(5rem, 10.2vw, 9.4rem);
      font-weight: 200;
      letter-spacing: -0.045em;
      font-variant-numeric: tabular-nums;
      color: #ffffff;
      text-shadow: 0 12px 45px rgba(0, 0, 0, 0.35);
    }
    #hero-seconds {
      font-size: clamp(1.4rem, 2.6vw, 2.4rem);
      font-weight: 300;
      color: rgba(255, 255, 255, 0.56);
      font-variant-numeric: tabular-nums;
      letter-spacing: -0.02em;
    }
    #hero-date {
      margin-top: 10px;
      font-size: clamp(1.15rem, 1.9vw, 1.75rem);
      font-weight: 300;
      letter-spacing: 0.06em;
      color: rgba(255, 255, 255, 0.84);
      text-shadow: 0 4px 20px rgba(0, 0, 0, 0.35);
    }
    #solar-telemetry {
      margin-top: 6px;
      font-size: 11.5px;
      font-weight: 400;
      letter-spacing: 0.08em;
      text-transform: uppercase;
      color: rgba(255, 255, 255, 0.45);
    }

    /* 5. TOP-RIGHT BORDERLESS EXPANDABLE SERVICE WIDGETS */
    #top-right-widgets {
      position: fixed;
      top: 5.5vh;
      right: 4.2vw;
      z-index: 30;
      display: flex;
      flex-direction: column;
      align-items: flex-end;
      gap: 22px;
      max-height: 60vh;
    }
    .ambient-widget {
      text-align: right;
      cursor: pointer;
      transition: transform 0.35s cubic-bezier(0.16, 1, 0.3, 1), background 0.35s ease, padding 0.35s ease, backdrop-filter 0.35s ease;
      border: none;
      background: transparent;
      padding: 4px 0;
      border-radius: 20px;
      max-width: 390px;
    }
    .ambient-widget:hover:not(.expanded) {
      transform: translateX(-6px);
    }
    .ambient-widget.expanded {
      cursor: default;
      padding: 18px 22px;
      background: rgba(6, 10, 22, 0.56);
      backdrop-filter: blur(28px) saturate(140%);
      -webkit-backdrop-filter: blur(28px) saturate(140%);
      box-shadow: 0 24px 60px rgba(0, 0, 0, 0.45);
      transform: translateX(-4px);
      width: 340px;
    }
    .w-header {
      display: flex;
      flex-direction: column;
      align-items: flex-end;
      gap: 3px;
      cursor: pointer;
    }
    .w-label-row {
      display: flex;
      align-items: center;
      gap: 7px;
      font-size: 10px;
      font-weight: 600;
      letter-spacing: 0.18em;
      text-transform: uppercase;
      color: rgba(255, 255, 255, 0.48);
    }
    .w-dot {
      width: 6px;
      height: 6px;
      border-radius: 50%;
      background: var(--accent);
      box-shadow: 0 0 10px var(--accent);
    }
    .w-primary {
      font-size: 18px;
      font-weight: 300;
      letter-spacing: -0.01em;
      color: #ffffff;
      text-shadow: 0 4px 18px rgba(0, 0, 0, 0.45);
      display: flex;
      align-items: baseline;
      gap: 10px;
      justify-content: flex-end;
    }
    .w-primary strong {
      font-weight: 500;
    }
    .w-sub {
      font-size: 11.5px;
      color: rgba(255, 255, 255, 0.52);
      font-weight: 400;
    }
    .w-expand-body {
      max-height: 0;
      opacity: 0;
      overflow: hidden;
      transition: max-height 0.42s cubic-bezier(0.16, 1, 0.3, 1), opacity 0.3s ease, margin-top 0.3s ease;
      text-align: left;
    }
    .ambient-widget.expanded .w-expand-body {
      max-height: 360px;
      opacity: 1;
      margin-top: 14px;
    }
    .w-stat-grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 10px 18px;
      margin-bottom: 14px;
    }
    .w-stat-item {
      display: flex;
      flex-direction: column;
      gap: 2px;
    }
    .w-stat-k {
      font-size: 10px;
      text-transform: uppercase;
      letter-spacing: 0.08em;
      color: rgba(255, 255, 255, 0.45);
    }
    .w-stat-v {
      font-size: 14px;
      font-weight: 500;
      color: #fff;
    }
    .w-action-link {
      display: inline-block;
      margin-top: 6px;
      font-size: 11.5px;
      font-weight: 500;
      letter-spacing: 0.04em;
      color: #38bdf8;
      text-decoration: none;
      background: none;
      border: none;
      padding: 0;
      cursor: pointer;
    }
    .w-action-link:hover { text-decoration: underline; }
    .minimal-input {
      width: 100%;
      background: rgba(255, 255, 255, 0.07);
      border: none;
      border-radius: 10px;
      padding: 8px 11px;
      color: #fff;
      font-size: 12.5px;
      outline: none;
      user-select: text;
    }
    .minimal-input::placeholder { color: rgba(255, 255, 255, 0.38); }
    .note-row {
      display: flex;
      justify-content: space-between;
      align-items: center;
      gap: 8px;
      padding: 6px 0;
      font-size: 12.5px;
      color: rgba(255, 255, 255, 0.88);
    }
    .note-del {
      background: none;
      border: none;
      color: rgba(255, 255, 255, 0.35);
      cursor: pointer;
      font-size: 13px;
      padding: 0 4px;
    }
    .note-del:hover { color: #f87171; }

    /* 3 & 4. BOTTOM-ALIGNED MOVING TIMELINE WITH FIXED "NOW" MARKER */
    #timeline-dock {
      position: fixed;
      left: 0;
      right: 0;
      bottom: 0;
      height: 34vh;
      min-height: 245px;
      z-index: 20;
      background: linear-gradient(
        to top,
        rgba(3, 6, 15, 0.90) 0%,
        rgba(5, 10, 24, 0.62) 55%,
        rgba(5, 10, 24, 0.0) 100%
      );
      display: flex;
      flex-direction: column;
      justify-content: flex-end;
    }

    /* Whisper-quiet minimal controls right above the timeline */
    #timeline-toolbar {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 0 4.2vw 6px 4.2vw;
      font-size: 11px;
      letter-spacing: 0.08em;
    }
    .tl-controls {
      display: flex;
      align-items: center;
      gap: 14px;
      opacity: 0.42;
      transition: opacity 0.25s ease;
    }
    .tl-controls:hover {
      opacity: 0.95;
    }
    .tl-pill {
      background: none;
      border: none;
      color: rgba(255, 255, 255, 0.55);
      font-size: 10.5px;
      font-weight: 500;
      letter-spacing: 0.1em;
      text-transform: uppercase;
      cursor: pointer;
      padding: 2px 0;
      transition: color 0.2s ease;
    }
    .tl-pill:hover, .tl-pill.active {
      color: #ffffff;
    }
    .tl-pill.return-now {
      color: #38bdf8;
      display: none;
    }

    /* Timeline viewport & moving canvas */
    #timeline-viewport {
      position: relative;
      width: 100vw;
      height: calc(34vh - 28px);
      min-height: 215px;
      overflow: hidden;
      cursor: grab;
    }
    #timeline-viewport:active { cursor: grabbing; }

    /* Fixed "NOW" Marker at 22% from left */
    #fixed-now-marker {
      position: absolute;
      left: 22vw;
      top: 6px;
      bottom: 0;
      width: 1.5px;
      background: linear-gradient(
        to bottom,
        rgba(56, 189, 248, 0) 0%,
        #38bdf8 22%,
        #fbbf24 85%,
        rgba(251, 191, 36, 0.2) 100%
      );
      box-shadow: 0 0 18px rgba(56, 189, 248, 0.85);
      z-index: 25;
      pointer-events: none;
    }
    #fixed-now-badge {
      position: absolute;
      top: 4px;
      left: 0;
      transform: translateX(-50%);
      padding: 2px 8px;
      border-radius: 99px;
      background: rgba(56, 189, 248, 0.16);
      backdrop-filter: blur(12px);
      color: #e0f2fe;
      font-size: 9.5px;
      font-weight: 600;
      letter-spacing: 0.14em;
      white-space: nowrap;
    }
    #fixed-now-orb {
      position: absolute;
      bottom: 37px;
      left: 0.75px;
      transform: translate(-50%, 50%);
      width: 9px;
      height: 9px;
      border-radius: 50%;
      background: #fbbf24;
      box-shadow: 0 0 16px 4px rgba(251, 191, 36, 0.9);
    }

    /* Moving World Track */
    #timeline-world {
      position: absolute;
      top: 0;
      bottom: 0;
      left: 0;
      will-change: transform;
    }

    /* Horizontal Axis Line */
    #timeline-axis-line {
      position: absolute;
      left: -20000px;
      width: 40000px;
      bottom: 38px;
      height: 1px;
      background: rgba(255, 255, 255, 0.14);
      pointer-events: none;
    }

    /* Hour Ticks & Day Dividers */
    .tl-tick {
      position: absolute;
      bottom: 0;
      height: 38px;
      transform: translateX(-50%);
      display: flex;
      flex-direction: column;
      align-items: center;
      pointer-events: none;
    }
    .tl-tick-mark {
      width: 1px;
      height: 6px;
      background: rgba(255, 255, 255, 0.2);
      margin-bottom: 6px;
    }
    .tl-tick.major .tl-tick-mark {
      height: 11px;
      background: rgba(255, 255, 255, 0.42);
    }
    .tl-tick-label {
      font-size: 10px;
      font-weight: 400;
      font-variant-numeric: tabular-nums;
      color: rgba(255, 255, 255, 0.38);
      white-space: nowrap;
    }
    .tl-tick.day-start .tl-tick-mark {
      height: 180px;
      margin-top: -142px;
      background: linear-gradient(to bottom, transparent, rgba(56, 189, 248, 0.38));
    }
    .tl-tick.day-start .tl-tick-label {
      color: #38bdf8;
      font-weight: 600;
      letter-spacing: 0.08em;
      text-transform: uppercase;
      font-size: 10.5px;
    }

    /* 4. GOOGLE CALENDAR EVENT RECTANGLES ON THE TIMELINE */
    .tl-event-rect {
      position: absolute;
      height: 44px;
      border-radius: 10px;
      padding: 6px 12px;
      background: rgba(12, 19, 36, 0.62);
      backdrop-filter: blur(16px);
      -webkit-backdrop-filter: blur(16px);
      border-left: 2.5px solid var(--ev-color, #38bdf8);
      box-shadow: 0 8px 24px rgba(0, 0, 0, 0.25);
      display: flex;
      flex-direction: column;
      justify-content: center;
      overflow: hidden;
      cursor: pointer;
      transition: transform 0.22s cubic-bezier(0.16, 1, 0.3, 1), background 0.22s ease, box-shadow 0.22s ease;
    }
    .tl-event-rect:hover {
      transform: translateY(-3px) scale(1.01);
      background: rgba(24, 35, 58, 0.85);
      box-shadow: 0 14px 34px rgba(0, 0, 0, 0.45), 0 0 20px var(--ev-glow, rgba(56, 189, 248, 0.25));
      z-index: 18;
    }
    .tl-event-rect.is-now {
      background: rgba(14, 116, 144, 0.42);
      box-shadow: 0 0 28px rgba(56, 189, 248, 0.35);
    }
    .tl-event-rect.is-past {
      opacity: 0.45;
    }
    .tl-ev-title {
      font-size: 12px;
      font-weight: 500;
      color: #ffffff;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      line-height: 1.2;
    }
    .tl-ev-meta {
      font-size: 10px;
      color: rgba(255, 255, 255, 0.56);
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      margin-top: 2px;
    }

    /* Quick Event Creator Popover */
    #quick-event-modal {
      position: fixed;
      bottom: 35vh;
      right: 4.2vw;
      z-index: 40;
      background: rgba(6, 10, 22, 0.78);
      backdrop-filter: blur(28px);
      padding: 18px 22px;
      border-radius: 18px;
      box-shadow: 0 24px 60px rgba(0, 0, 0, 0.55);
      display: none;
      width: 320px;
    }

    /* Fullscreen Service Overlay Iframe */
    #full-app-overlay {
      position: fixed;
      inset: 0;
      z-index: 100;
      background: #040711;
      display: none;
      flex-direction: column;
    }
    #full-app-bar {
      height: 44px;
      padding: 0 20px;
      display: flex;
      align-items: center;
      justify-content: space-between;
      background: #060914;
    }
    #full-app-frame {
      flex: 1;
      width: 100%;
      border: none;
    }
  </style>
</head>
<body>
  <!-- 1. LIVING DAYTIME SKY & CELESTIAL SUN -->
  <div id="sky-stage">
    <div id="starfield"></div>
    <div id="horizon-glow"></div>
    <svg id="solar-arc-svg" preserveAspectRatio="none">
      <path id="solar-arc-path" fill="none" stroke="rgba(255,255,255,0.08)" stroke-width="1" stroke-dasharray="4 6" />
      <path id="solar-day-path" fill="none" stroke="rgba(251,191,36,0.18)" stroke-width="1.4" />
    </svg>
    <div id="moon-assembly">
      <div class="moon-core"></div>
    </div>
    <div id="sun-assembly">
      <div class="sun-corona"></div>
      <div class="sun-core"></div>
    </div>
  </div>

  <!-- 2. LARGE DATE & TIME IN UPPER-LEFT -->
  <div id="hero-clock-region">
    <div class="clock-row">
      <div id="hero-time">--:--</div>
      <div id="hero-seconds">--</div>
    </div>
    <div id="hero-date"></div>
    <div id="solar-telemetry">
      <span id="solar-phase-text"></span>
    </div>
  </div>

  <!-- 5. TOP-RIGHT BORDERLESS EXPANDABLE SERVICE WIDGETS: (health), (finances), (notes), (meals) -->
  <div id="top-right-widgets">
    <!-- HEALTH WIDGET -->
    <div class="ambient-widget" id="widget-health" onclick="toggleWidget('health', event)">
      <div class="w-header">
        <div class="w-label-row">
          <span>health</span>
          <span class="w-dot" id="dot-health" style="background:#4ade80; box-shadow:0 0 10px #4ade80;"></span>
        </div>
        <div class="w-primary" id="compact-health">--</div>
        <div class="w-sub" id="sub-health">Pixel 10 Health Connect</div>
      </div>
      <div class="w-expand-body" onclick="event.stopPropagation()">
        <div class="w-stat-grid">
          <div class="w-stat-item"><span class="w-stat-k">Steps Today</span><span class="w-stat-v" id="eh-steps">--</span></div>
          <div class="w-stat-item"><span class="w-stat-k">Readiness</span><span class="w-stat-v" id="eh-ready">--</span></div>
          <div class="w-stat-item"><span class="w-stat-k">Heart Rate</span><span class="w-stat-v" id="eh-hr">--</span></div>
          <div class="w-stat-item"><span class="w-stat-k">Resting HR / HRV</span><span class="w-stat-v" id="eh-rhr">--</span></div>
          <div class="w-stat-item"><span class="w-stat-k">Sleep Duration</span><span class="w-stat-v" id="eh-sleep">--</span></div>
          <div class="w-stat-item"><span class="w-stat-k">Burned / Distance</span><span class="w-stat-v" id="eh-burn">--</span></div>
        </div>
        <button class="w-action-link" onclick="openFullService('google-health', 'Health')">Open Health →</button>
      </div>
    </div>

    <!-- FINANCES WIDGET -->
    <div class="ambient-widget" id="widget-finances" onclick="toggleWidget('finances', event)">
      <div class="w-header">
        <div class="w-label-row">
          <span>finances</span>
          <span class="w-dot" id="dot-finances" style="background:#a855f7; box-shadow:0 0 10px #a855f7;"></span>
        </div>
        <div class="w-primary" id="compact-finances">--</div>
        <div class="w-sub" id="sub-finances">Sparkasse George</div>
      </div>
      <div class="w-expand-body" onclick="event.stopPropagation()">
        <div class="w-stat-grid">
          <div class="w-stat-item"><span class="w-stat-k">Income</span><span class="w-stat-v" id="ef-inc" style="color:#4ade80;">--</span></div>
          <div class="w-stat-item"><span class="w-stat-k">Expenses</span><span class="w-stat-v" id="ef-exp" style="color:#f87171;">--</span></div>
          <div class="w-stat-item"><span class="w-stat-k">Investments</span><span class="w-stat-v" id="ef-inv" style="color:#38bdf8;">--</span></div>
          <div class="w-stat-item"><span class="w-stat-k">Groceries</span><span class="w-stat-v" id="ef-groc" style="color:#fbbf24;">--</span></div>
        </div>
        <button class="w-action-link" onclick="openFullService('finance-analytics', 'Finances')">Open Finances →</button>
      </div>
    </div>

    <!-- NOTES WIDGET -->
    <div class="ambient-widget" id="widget-notes" onclick="toggleWidget('notes', event)">
      <div class="w-header">
        <div class="w-label-row">
          <span>notes</span>
          <span class="w-dot" id="dot-notes" style="background:#fbbf24; box-shadow:0 0 10px #fbbf24;"></span>
        </div>
        <div class="w-primary" id="compact-notes">0 notes</div>
        <div class="w-sub" id="sub-notes">Tap to capture a note</div>
      </div>
      <div class="w-expand-body" onclick="event.stopPropagation()">
        <form onsubmit="addNote(event)" style="margin-bottom:10px;">
          <input id="note-input" class="minimal-input" placeholder="Write a note & press Enter..." />
        </form>
        <div id="notes-list" style="max-height:160px; overflow-y:auto;"></div>
      </div>
    </div>

    <!-- MEALS WIDGET -->
    <div class="ambient-widget" id="widget-meals" onclick="toggleWidget('meals', event)">
      <div class="w-header">
        <div class="w-label-row">
          <span>meals</span>
          <span class="w-dot" id="dot-meals" style="background:#fb923c; box-shadow:0 0 10px #fb923c;"></span>
        </div>
        <div class="w-primary" id="compact-meals">Unplanned</div>
        <div class="w-sub" id="sub-meals">Today's nutrition</div>
      </div>
      <div class="w-expand-body" onclick="event.stopPropagation()">
        <div id="em-slots" style="font-size:12.5px; color:rgba(255,255,255,0.85); line-height:1.7; margin-bottom:10px;"></div>
        <button class="w-action-link" onclick="openFullService('meal-planner', 'Meals')">Open Meals →</button>
      </div>
    </div>
  </div>

  <!-- QUICK EVENT MODAL -->
  <div id="quick-event-modal">
    <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:12px;">
      <span style="font-size:11px; font-weight:600; letter-spacing:0.12em; text-transform:uppercase; color:#38bdf8;">New Event</span>
      <button onclick="toggleEventModal(false)" style="background:none; border:none; color:rgba(255,255,255,0.5); cursor:pointer;">✕</button>
    </div>
    <form onsubmit="createQuickEvent(event)" style="display:flex; flex-direction:column; gap:10px;">
      <input id="qe-title" class="minimal-input" placeholder="Event title..." required />
      <input id="qe-start" type="datetime-local" class="minimal-input" required />
      <div style="display:flex; gap:8px;">
        <input id="qe-dur" type="number" value="60" min="15" step="15" class="minimal-input" placeholder="Minutes" />
        <button type="submit" style="background:#38bdf8; color:#040711; border:none; border-radius:10px; padding:0 16px; font-weight:600; font-size:12px; cursor:pointer; white-space:nowrap;">Add</button>
      </div>
    </form>
  </div>

  <!-- 3 & 4. BOTTOM-ALIGNED MOVING TIMELINE WITH FIXED "NOW" MARKER & GCAL EVENT RECTANGLES -->
  <div id="timeline-dock">
    <div id="timeline-toolbar">
      <div class="tl-controls">
        <button class="tl-pill return-now" id="btn-live-now" onclick="snapToLiveNow()">↺ Return to Now</button>
      </div>
      <div class="tl-controls">
        <button class="tl-pill" id="zoom-12" onclick="setTimelineSpan(12)">12h</button>
        <button class="tl-pill active" id="zoom-24" onclick="setTimelineSpan(24)">24h</button>
        <button class="tl-pill" id="zoom-72" onclick="setTimelineSpan(72)">3d</button>
        <button class="tl-pill" id="zoom-168" onclick="setTimelineSpan(168)">7d</button>
        <button class="tl-pill" onclick="toggleEventModal(true)" title="New Calendar Event">+</button>
      </div>
    </div>

    <div id="timeline-viewport">
      <!-- Fixed NOW vertical marker -->
      <div id="fixed-now-marker">
        <div id="fixed-now-badge">NOW</div>
        <div id="fixed-now-orb"></div>
      </div>

      <!-- Continuously moving timeline track -->
      <div id="timeline-world">
        <div id="timeline-axis-line"></div>
        <div id="timeline-ticks-layer"></div>
        <div id="timeline-events-layer"></div>
      </div>
    </div>
  </div>

  <!-- FULL SERVICE OVERLAY (WHEN LAUNCHING FULL VIEW) -->
  <div id="full-app-overlay">
    <div id="full-app-bar">
      <button onclick="closeFullService()" style="background:none; border:none; color:#38bdf8; font-size:12.5px; font-weight:500; cursor:pointer;">← Back to Horizon</button>
      <span id="full-app-title" style="font-size:12.5px; font-weight:500; color:rgba(255,255,255,0.65);"></span>
      <span></span>
    </div>
    <iframe id="full-app-frame" src="about:blank"></iframe>
  </div>

  <script>
    ${sidebarStylerScript}

    const base = window.__THASSI_INGRESS_PATH__ || '';
    const NOW_ANCHOR_RATIO = 0.22;

    let calendarEvents = [];
    let visibleHoursSpan = 24;
    let panOffsetMs = 0;
    let timelineBaseEpochMs = Date.now();

    // Generate twinkling stars once
    (function initStars() {
      const sf = document.getElementById('starfield');
      let html = '';
      for (let i = 0; i < 85; i++) {
        const x = (Math.random() * 100).toFixed(2);
        const y = (Math.random() * 68).toFixed(2);
        const sz = (1 + Math.random() * 2.2).toFixed(1);
        const dur = (2.5 + Math.random() * 4.5).toFixed(1);
        html += \`<div class="star" style="left:\${x}%; top:\${y}%; width:\${sz}px; height:\${sz}px; --dur:\${dur}s;"></div>\`;
      }
      sf.innerHTML = html;
    })();

    // 1. SOLAR POSITION & SKY COLOR ENGINE
    const SUNRISE_HOUR = 6.75; // 06:45
    const SUNSET_HOUR = 18.5;  // 18:30

    function getSkyPalette(h) {
      if (h < 5.2 || h >= 21.2) {
        return {
          sky: 'linear-gradient(180deg, #02040a 0%, #070d1f 48%, #0f172a 78%, #172554 100%)',
          sidebarBg: 'linear-gradient(180deg, #02040a 0%, #060b1a 55%, #03060f 100%)',
          glow: 'radial-gradient(ellipse at 50% 100%, rgba(56, 189, 248, 0.18), transparent 70%)',
          stars: 0.9,
          phase: 'Astronomical Night'
        };
      }
      if (h < 6.5) {
        return {
          sky: 'linear-gradient(180deg, #090d1e 0%, #1e1b4b 42%, #6d28d9 74%, #f97316 100%)',
          sidebarBg: 'linear-gradient(180deg, #070a18 0%, #131130 60%, #060813 100%)',
          glow: 'radial-gradient(ellipse at 25% 100%, rgba(251, 146, 60, 0.65), transparent 72%)',
          stars: 0.45,
          phase: 'Dawn Twilight'
        };
      }
      if (h < 8.0) {
        return {
          sky: 'linear-gradient(180deg, #1d4ed8 0%, #3b82f6 42%, #f472b6 75%, #fbbf24 100%)',
          sidebarBg: 'linear-gradient(180deg, #0c1f5e 0%, #172554 60%, #060b19 100%)',
          glow: 'radial-gradient(ellipse at 22% 100%, rgba(253, 224, 71, 0.8), transparent 75%)',
          stars: 0.05,
          phase: 'Golden Sunrise'
        };
      }
      if (h < 16.5) {
        return {
          sky: 'linear-gradient(180deg, #0369a1 0%, #0284c7 45%, #38bdf8 80%, #bae6fd 100%)',
          sidebarBg: 'linear-gradient(180deg, #042f4e 0%, #073b61 55%, #040917 100%)',
          glow: 'radial-gradient(ellipse at 50% 100%, rgba(254, 249, 195, 0.45), transparent 75%)',
          stars: 0,
          phase: h < 11.5 ? 'Morning Sky' : h < 14 ? 'Solar Noon' : 'Afternoon Sun'
        };
      }
      if (h < 18.8) {
        return {
          sky: 'linear-gradient(180deg, #1e1b4b 0%, #3730a3 36%, #c2410c 72%, #facc15 100%)',
          sidebarBg: 'linear-gradient(180deg, #0f0e29 0%, #1e1b4b 58%, #060814 100%)',
          glow: 'radial-gradient(ellipse at 78% 100%, rgba(251, 146, 60, 0.85), transparent 75%)',
          stars: 0.15,
          phase: 'Golden Hour'
        };
      }
      return {
        sky: 'linear-gradient(180deg, #050814 0%, #1e1b4b 46%, #4c1d95 76%, #9a3412 100%)',
        sidebarBg: 'linear-gradient(180deg, #040711 0%, #110f2b 58%, #04060f 100%)',
        glow: 'radial-gradient(ellipse at 82% 100%, rgba(234, 88, 12, 0.45), transparent 70%)',
        stars: 0.65,
        phase: 'Dusk Twilight'
      };
    }

    function computeSunPoint(hourFloat, vw, vh) {
      const horizonY = vh * 0.65;
      const zenithY = vh * 0.12;
      const nadirY = vh * 0.82;

      const x = vw * (0.06 + (hourFloat / 24) * 0.88);
      const daySpan = SUNSET_HOUR - SUNRISE_HOUR;
      const angle = ((hourFloat - SUNRISE_HOUR) / daySpan) * Math.PI;
      const sinVal = Math.sin(angle);
      const y = sinVal >= 0
        ? horizonY - sinVal * (horizonY - zenithY)
        : horizonY - sinVal * (nadirY - horizonY);

      return { x, y, aboveHorizon: sinVal >= -0.08, elevationPct: Math.round(sinVal * 100) };
    }

    function renderSolarArcPaths() {
      const vw = window.innerWidth;
      const vh = window.innerHeight;
      let fullPath = '';
      let dayPath = '';
      for (let h = 0; h <= 24; h += 0.25) {
        const pt = computeSunPoint(h, vw, vh);
        fullPath += (h === 0 ? 'M' : 'L') + pt.x.toFixed(1) + ',' + pt.y.toFixed(1) + ' ';
        if (h >= SUNRISE_HOUR && h <= SUNSET_HOUR) {
          dayPath += (dayPath === '' ? 'M' : 'L') + pt.x.toFixed(1) + ',' + pt.y.toFixed(1) + ' ';
        }
      }
      document.getElementById('solar-arc-path').setAttribute('d', fullPath);
      document.getElementById('solar-day-path').setAttribute('d', dayPath);
    }

    function updateSkyAndSun(now) {
      const effectiveHour = now.getHours() + now.getMinutes() / 60 + now.getSeconds() / 3600;
      const palette = getSkyPalette(effectiveHour);

      document.getElementById('sky-stage').style.background = palette.sky;
      document.getElementById('horizon-glow').style.background = palette.glow;
      document.getElementById('starfield').style.opacity = String(palette.stars);

      if (window.syncThassiSidebarSky) {
        window.syncThassiSidebarSky(palette.sidebarBg);
      }

      const vw = window.innerWidth;
      const vh = window.innerHeight;
      const sunPt = computeSunPoint(effectiveHour, vw, vh);

      const sunEl = document.getElementById('sun-assembly');
      sunEl.style.left = sunPt.x.toFixed(1) + 'px';
      sunEl.style.top = sunPt.y.toFixed(1) + 'px';
      sunEl.style.opacity = sunPt.aboveHorizon ? '1' : '0.28';

      const moonHour = (effectiveHour + 12) % 24;
      const moonPt = computeSunPoint(moonHour, vw, vh);
      const moonEl = document.getElementById('moon-assembly');
      moonEl.style.left = moonPt.x.toFixed(1) + 'px';
      moonEl.style.top = moonPt.y.toFixed(1) + 'px';
      moonEl.style.opacity = sunPt.aboveHorizon ? '0' : '0.92';

      document.getElementById('solar-phase-text').textContent =
        \`\${palette.phase}  ·  Sunrise 06:45  ·  Sunset 18:30\`;
    }

    // 2. LARGE CLOCK & CONTINUOUS LEFTWARD TIMELINE LOOP
    function getPxPerMs() {
      return window.innerWidth / (visibleHoursSpan * 3600 * 1000);
    }

    function tickClockAndTimeline() {
      const now = new Date();
      const hh = String(now.getHours()).padStart(2, '0');
      const mm = String(now.getMinutes()).padStart(2, '0');
      const ss = String(now.getSeconds()).padStart(2, '0');

      document.getElementById('hero-time').textContent = \`\${hh}:\${mm}\`;
      document.getElementById('hero-seconds').textContent = ss;
      document.getElementById('hero-date').textContent = now.toLocaleDateString(undefined, {
        weekday: 'long',
        month: 'long',
        day: 'numeric',
        year: 'numeric'
      });
      document.getElementById('fixed-now-badge').textContent = \`NOW · \${hh}:\${mm}\`;

      updateSkyAndSun(now);

      const pxPerMs = getPxPerMs();
      const nowOffsetFromBasePx = (now.getTime() + panOffsetMs - timelineBaseEpochMs) * pxPerMs;
      const fixedNowX = window.innerWidth * NOW_ANCHOR_RATIO;
      const worldTranslateX = fixedNowX - nowOffsetFromBasePx;
      document.getElementById('timeline-world').style.transform = \`translate3d(\${worldTranslateX.toFixed(2)}px, 0, 0)\`;
    }

    // 3 & 4. RENDER TIMELINE TICKS & GOOGLE CALENDAR EVENT RECTANGLES
    function renderTimelineGeometry() {
      const nowMs = Date.now();
      timelineBaseEpochMs = nowMs;
      const pxPerMs = getPxPerMs();

      const startSpanMs = nowMs - 36 * 3600 * 1000;
      const endSpanMs = nowMs + 8 * 24 * 3600 * 1000;

      const stepHours = visibleHoursSpan <= 12 ? 1 : visibleHoursSpan <= 24 ? 2 : visibleHoursSpan <= 72 ? 6 : 12;
      const firstTick = new Date(startSpanMs);
      firstTick.setMinutes(0, 0, 0);
      firstTick.setHours(Math.floor(firstTick.getHours() / stepHours) * stepHours);

      let ticksHtml = '';
      for (let t = firstTick.getTime(); t <= endSpanMs; t += stepHours * 3600 * 1000) {
        const d = new Date(t);
        const h = d.getHours();
        const isDayStart = h === 0;
        const isMajor = h % 6 === 0;
        const xPx = (t - timelineBaseEpochMs) * pxPerMs;

        const label = isDayStart
          ? d.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })
          : \`\${String(h).padStart(2, '0')}:00\`;

        ticksHtml += \`
          <div class="tl-tick \${isDayStart ? 'day-start' : isMajor ? 'major' : ''}" style="left:\${xPx.toFixed(1)}px;">
            <div class="tl-tick-mark"></div>
            <div class="tl-tick-label">\${label}</div>
          </div>
        \`;
      }
      document.getElementById('timeline-ticks-layer').innerHTML = ticksHtml;

      const catPalette = {
        work:     { border: '#38bdf8', glow: 'rgba(56, 189, 248, 0.35)' },
        focus:    { border: '#818cf8', glow: 'rgba(129, 140, 248, 0.35)' },
        health:   { border: '#4ade80', glow: 'rgba(74, 222, 128, 0.35)' },
        social:   { border: '#f472b6', glow: 'rgba(244, 114, 182, 0.35)' },
        personal: { border: '#fbbf24', glow: 'rgba(251, 191, 36, 0.35)' },
      };

      const sorted = [...calendarEvents]
        .map((ev) => {
          const s = new Date(ev.start_time).getTime();
          const e = Math.max(s + 30 * 60000, new Date(ev.end_time).getTime());
          return { ...ev, s, e };
        })
        .filter((ev) => Number.isFinite(ev.s) && ev.e >= startSpanMs && ev.s <= endSpanMs)
        .sort((a, b) => a.s - b.s);

      const laneEndPx = [-Infinity, -Infinity, -Infinity];
      let eventsHtml = '';

      for (const ev of sorted) {
        const leftPx = (ev.s - timelineBaseEpochMs) * pxPerMs;
        const rawWidthPx = (ev.e - ev.s) * pxPerMs;
        const widthPx = Math.max(135, rawWidthPx);

        let lane = 0;
        for (let l = 0; l < laneEndPx.length; l++) {
          if (leftPx >= laneEndPx[l] + 8) {
            lane = l;
            break;
          }
          if (l === laneEndPx.length - 1) lane = l;
        }
        laneEndPx[lane] = leftPx + widthPx;

        const bottomPx = 48 + lane * 52;
        const pal = catPalette[ev.category] || catPalette.personal;
        const isNow = ev.s <= nowMs && ev.e >= nowMs;
        const isPast = ev.e < nowMs;

        const startStr = new Date(ev.s).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        const endStr = new Date(ev.e).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        const dayStr = new Date(ev.s).toLocaleDateString([], { weekday: 'short', day: 'numeric', month: 'short' });

        eventsHtml += \`
          <div class="tl-event-rect \${isNow ? 'is-now' : ''} \${isPast ? 'is-past' : ''}"
               style="left:\${leftPx.toFixed(1)}px; width:\${widthPx.toFixed(1)}px; bottom:\${bottomPx}px; --ev-color:\${pal.border}; --ev-glow:\${pal.glow};"
               title="\${ev.title.replace(/"/g, '&quot;')} (\${dayStr}, \${startStr} – \${endStr}) · \${ev.calendar_name || 'Google Calendar'}">
            <div class="tl-ev-title">\${ev.title}</div>
            <div class="tl-ev-meta">\${startStr}–\${endStr} · \${ev.calendar_name || ev.category}</div>
          </div>
        \`;
      }

      document.getElementById('timeline-events-layer').innerHTML = eventsHtml;
      tickClockAndTimeline();
    }

    function setTimelineSpan(hours) {
      visibleHoursSpan = hours;
      ['12', '24', '72', '168'].forEach((id) => {
        const el = document.getElementById('zoom-' + id);
        if (el) el.classList.toggle('active', Number(id) === hours);
      });
      renderTimelineGeometry();
    }

    function snapToLiveNow() {
      panOffsetMs = 0;
      document.getElementById('btn-live-now').style.display = 'none';
      tickClockAndTimeline();
    }

    (function initTimelineDrag() {
      const vp = document.getElementById('timeline-viewport');
      let dragging = false;
      let startX = 0;
      let startPanMs = 0;

      vp.addEventListener('pointerdown', (e) => {
        if (e.target.closest('.tl-event-rect')) return;
        dragging = true;
        startX = e.clientX;
        startPanMs = panOffsetMs;
        vp.setPointerCapture(e.pointerId);
      });
      vp.addEventListener('pointermove', (e) => {
        if (!dragging) return;
        const dx = e.clientX - startX;
        panOffsetMs = startPanMs - dx / getPxPerMs();
        document.getElementById('btn-live-now').style.display = 'inline-block';
        tickClockAndTimeline();
      });
      vp.addEventListener('pointerup', () => { dragging = false; });
    })();

    function toggleWidget(id, ev) {
      if (ev) ev.stopPropagation();
      const target = document.getElementById('widget-' + id);
      const isAlreadyOpen = target.classList.contains('expanded');
      document.querySelectorAll('.ambient-widget').forEach((w) => w.classList.remove('expanded'));
      if (!isAlreadyOpen) {
        target.classList.add('expanded');
      }
    }

    document.addEventListener('click', (e) => {
      if (!e.target.closest('.ambient-widget')) {
        document.querySelectorAll('.ambient-widget').forEach((w) => w.classList.remove('expanded'));
      }
    });

    function openFullService(appId, title) {
      document.getElementById('full-app-title').textContent = title;
      document.getElementById('full-app-frame').src = base + '/apps/' + appId + '/';
      document.getElementById('full-app-overlay').style.display = 'flex';
    }

    function closeFullService() {
      document.getElementById('full-app-overlay').style.display = 'none';
      document.getElementById('full-app-frame').src = 'about:blank';
      loadAllLiveData();
    }

    function toggleEventModal(show) {
      const m = document.getElementById('quick-event-modal');
      m.style.display = show ? 'block' : 'none';
      if (show) {
        const now = new Date();
        now.setMinutes(now.getMinutes() - now.getTimezoneOffset());
        document.getElementById('qe-start').value = now.toISOString().slice(0, 16);
        document.getElementById('qe-title').focus();
      }
    }

    async function createQuickEvent(e) {
      e.preventDefault();
      const title = document.getElementById('qe-title').value.trim();
      const startVal = document.getElementById('qe-start').value;
      const dur = Number(document.getElementById('qe-dur').value || 60);
      if (!title || !startVal) return;

      await fetch(base + '/api/apps/google-calendar/events', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title,
          start_time: new Date(startVal).toISOString(),
          duration_minutes: dur
        })
      });
      document.getElementById('qe-title').value = '';
      toggleEventModal(false);
      await loadAllLiveData();
    }

    async function addNote(e) {
      e.preventDefault();
      const input = document.getElementById('note-input');
      const content = input.value.trim();
      if (!content) return;
      input.value = '';
      await fetch(base + '/api/system/notes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content })
      });
      await loadAllLiveData();
    }

    async function deleteNote(id) {
      await fetch(base + '/api/system/notes?id=' + id, { method: 'DELETE' });
      await loadAllLiveData();
    }

    async function loadAllLiveData() {
      try {
        const [sysRes, calRes] = await Promise.all([
          fetch(base + '/api/system/status'),
          fetch(base + '/api/apps/google-calendar/dashboard').catch(() => null)
        ]);
        const sys = await sysRes.json();
        const calData = calRes && calRes.ok ? await calRes.json() : { events: [] };

        calendarEvents = calData.events || [];
        renderTimelineGeometry();

        // 1. Update HEALTH widget
        const h = sys.summaries?.health;
        if (h && (h.steps != null || h.currentHr != null)) {
          const stepsTxt = h.steps != null ? Number(h.steps).toLocaleString() + ' steps' : 'No steps';
          const hrTxt = h.currentHr != null ? h.currentHr + ' bpm' : '';
          document.getElementById('compact-health').innerHTML = \`<strong>\${stepsTxt}</strong> \${hrTxt ? '· ' + hrTxt : ''}\`;
          document.getElementById('sub-health').textContent =
            h.readinessScore != null ? \`\${h.readinessScore}% readiness · \${h.readinessStatus || 'Pixel 10'}\` : (h.source || 'Pixel 10');
          document.getElementById('eh-steps').textContent = h.steps != null ? Number(h.steps).toLocaleString() : 'No data';
          document.getElementById('eh-ready').textContent = h.readinessScore != null ? h.readinessScore + '/100' : 'No data';
          document.getElementById('eh-hr').textContent = h.currentHr != null ? h.currentHr + ' bpm' : 'No data';
          document.getElementById('eh-rhr').textContent =
            (h.restingHr != null ? h.restingHr + ' bpm' : '--') + ' / ' + (h.hrvMs != null ? h.hrvMs + ' ms' : '--');
          document.getElementById('eh-sleep').textContent = h.sleepHours != null ? h.sleepHours + ' h' : 'No data';
          document.getElementById('eh-burn').textContent =
            (h.activeCalories != null ? h.activeCalories + ' kcal' : '--') + ' · ' + (h.distanceKm != null ? h.distanceKm + ' km' : '--');
        } else {
          document.getElementById('compact-health').textContent = 'No data';
          document.getElementById('sub-health').textContent = 'Waiting for Pixel 10 telemetry';
        }

        // 2. Update FINANCES widget
        const f = sys.summaries?.finance;
        if (f && (f.income || f.expenses)) {
          const net = Number(f.netCashflow || 0);
          const sign = net >= 0 ? '+' : '';
          document.getElementById('compact-finances').innerHTML = \`<strong>\${sign}€\${net.toFixed(0)}</strong> · -€\${Number(f.expenses || 0).toFixed(0)}\`;
          document.getElementById('sub-finances').textContent = \`George · \${f.activeMonth || 'Current'}\`;
          document.getElementById('ef-inc').textContent = '+€' + Number(f.income || 0).toFixed(0);
          document.getElementById('ef-exp').textContent = '-€' + Number(f.expenses || 0).toFixed(0);
          document.getElementById('ef-inv').textContent = '€' + Number(f.investments || 0).toFixed(0);
          document.getElementById('ef-groc').textContent = '€' + Number(f.grocerySpend || 0).toFixed(0);
        } else {
          document.getElementById('compact-finances').textContent = 'No data';
          document.getElementById('sub-finances').textContent = 'No bank CSV imported';
        }

        // 3. Update NOTES widget
        const notes = sys.notes || [];
        if (notes.length > 0) {
          const latest = notes[0].content;
          document.getElementById('compact-notes').innerHTML = \`<strong>\${notes.length} \${notes.length === 1 ? 'note' : 'notes'}</strong>\`;
          document.getElementById('sub-notes').textContent = latest.length > 28 ? latest.slice(0, 28) + '…' : latest;
          document.getElementById('notes-list').innerHTML = notes
            .map((n) => \`
              <div class="note-row">
                <span>\${n.content}</span>
                <button class="note-del" onclick="deleteNote(\${n.id})">✕</button>
              </div>
            \`)
            .join('');
        } else {
          document.getElementById('compact-notes').textContent = '0 notes';
          document.getElementById('sub-notes').textContent = 'Tap to write a quick note';
          document.getElementById('notes-list').innerHTML = '<div style="font-size:12px; color:rgba(255,255,255,0.4);">No notes saved yet.</div>';
        }

        // 4. Update MEALS widget
        const m = sys.summaries?.meals;
        if (m && (m.breakfast || m.lunch || m.dinner)) {
          const nextMeal = m.dinner || m.lunch || m.breakfast;
          document.getElementById('compact-meals').innerHTML = \`<strong>\${nextMeal}</strong>\`;
          document.getElementById('sub-meals').textContent = \`\${m.totalCalories || 0} kcal planned today\`;
          document.getElementById('em-slots').innerHTML = \`
            <div>🌅 <strong>Breakfast:</strong> \${m.breakfast || '—'}</div>
            <div>☀️ <strong>Lunch:</strong> \${m.lunch || '—'}</div>
            <div>🌙 <strong>Dinner:</strong> \${m.dinner || '—'}</div>
          \`;
        } else {
          document.getElementById('compact-meals').textContent = 'Unplanned';
          document.getElementById('sub-meals').textContent = 'No meals logged for today';
          document.getElementById('em-slots').innerHTML = 'No meals planned for today yet.';
        }
      } catch (err) {
        console.error('Failed loading dashboard data:', err);
      }
    }

    window.addEventListener('resize', () => {
      renderSolarArcPaths();
      renderTimelineGeometry();
    });

    renderSolarArcPaths();
    tickClockAndTimeline();
    setInterval(tickClockAndTimeline, 1000);
    loadAllLiveData();
    setInterval(loadAllLiveData, 60000);
  </script>
</body>
</html>`;
}
