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
    input, textarea, select { user-select: text !important; -webkit-user-select: text !important; }
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
      bottom: 46px;
      height: 31vh;
      min-height: 220px;
      z-index: 20;
      background: linear-gradient(
        to top,
        rgba(3, 6, 15, 0.88) 0%,
        rgba(5, 10, 24, 0.58) 55%,
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
      height: calc(31vh - 28px);
      min-height: 192px;
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

    /* 6. SUBTLE ROOM-GROUPED DEVICE QUICK-ACCESS BAR BELOW TIMELINE */
    #room-dock-bar {
      position: fixed;
      left: 0;
      right: 0;
      bottom: 0;
      height: 46px;
      z-index: 28;
      background: rgba(3, 6, 15, 0.92);
      backdrop-filter: blur(20px);
      -webkit-backdrop-filter: blur(20px);
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 0 4.2vw;
      gap: 8px;
      overflow-x: auto;
      scrollbar-width: none;
    }
    #room-dock-bar::-webkit-scrollbar { display: none; }

    .room-dock-group {
      display: flex;
      align-items: center;
      gap: 6px;
    }
    .room-pill {
      background: transparent;
      border: none;
      border-radius: 99px;
      padding: 6px 13px;
      color: rgba(248, 250, 252, 0.56);
      font-family: var(--font-sans);
      font-size: 11.5px;
      font-weight: 400;
      letter-spacing: 0.03em;
      display: inline-flex;
      align-items: center;
      gap: 8px;
      cursor: pointer;
      white-space: nowrap;
      transition: color 0.22s ease, background 0.22s ease, transform 0.2s ease;
    }
    .room-pill:hover {
      color: rgba(248, 250, 252, 0.92);
      background: rgba(255, 255, 255, 0.045);
    }
    .room-pill.active-flyout {
      color: #ffffff;
      background: rgba(56, 189, 248, 0.13);
    }
    .room-pill.has-on {
      color: rgba(248, 250, 252, 0.88);
    }
    .room-dot {
      width: 5.5px;
      height: 5.5px;
      border-radius: 50%;
      background: rgba(255, 255, 255, 0.22);
      transition: background 0.25s ease, box-shadow 0.25s ease;
    }
    .room-pill.has-on .room-dot {
      background: #fbbf24;
      box-shadow: 0 0 9px rgba(251, 191, 36, 0.85);
    }
    .room-pill.has-motion .room-dot {
      background: #4ade80;
      box-shadow: 0 0 9px rgba(74, 222, 128, 0.85);
    }
    .room-meta {
      font-size: 10px;
      color: rgba(248, 250, 252, 0.36);
      font-variant-numeric: tabular-nums;
    }
    .room-pill.has-on .room-meta {
      color: rgba(251, 191, 36, 0.78);
    }

    /* Upward Glassmorphic Room Flyout */
    #room-flyout {
      position: fixed;
      bottom: 54px;
      left: 4.2vw;
      z-index: 45;
      width: 340px;
      max-width: 92vw;
      background: rgba(6, 10, 22, 0.78);
      backdrop-filter: blur(32px) saturate(150%);
      -webkit-backdrop-filter: blur(32px) saturate(150%);
      border-radius: 22px;
      padding: 18px 20px;
      box-shadow: 0 24px 64px rgba(0, 0, 0, 0.65);
      display: none;
      flex-direction: column;
      gap: 12px;
      animation: flyoutRise 0.24s cubic-bezier(0.16, 1, 0.3, 1);
    }
    @keyframes flyoutRise {
      from { opacity: 0; transform: translateY(10px) scale(0.98); }
      to { opacity: 1; transform: translateY(0) scale(1); }
    }
    .rf-header {
      display: flex;
      justify-content: space-between;
      align-items: baseline;
      padding-bottom: 4px;
    }
    .rf-title {
      font-size: 13px;
      font-weight: 600;
      letter-spacing: 0.08em;
      text-transform: uppercase;
      color: #ffffff;
    }
    .rf-subtitle {
      font-size: 11px;
      color: rgba(248, 250, 252, 0.48);
      font-variant-numeric: tabular-nums;
    }
    .rf-dev-list {
      display: flex;
      flex-direction: column;
      gap: 8px;
      max-height: 44vh;
      overflow-y: auto;
    }
    .rf-dev-row {
      display: flex;
      flex-direction: column;
      gap: 6px;
      padding: 9px 12px;
      border-radius: 13px;
      background: rgba(255, 255, 255, 0.035);
      transition: background 0.2s ease;
    }
    .rf-dev-row.is-on {
      background: rgba(251, 191, 36, 0.09);
    }
    .rf-dev-main {
      display: flex;
      justify-content: space-between;
      align-items: center;
      gap: 10px;
    }
    .rf-dev-label {
      font-size: 12.5px;
      font-weight: 400;
      color: rgba(248, 250, 252, 0.88);
    }
    .rf-dev-row.is-on .rf-dev-label {
      color: #ffffff;
      font-weight: 500;
    }
    .rf-dev-right {
      display: flex;
      align-items: center;
      gap: 8px;
    }
    .rf-power-badge {
      font-size: 10.5px;
      color: rgba(248, 250, 252, 0.45);
      font-variant-numeric: tabular-nums;
    }
    .rf-toggle-btn {
      border: none;
      border-radius: 99px;
      padding: 4px 12px;
      font-size: 11px;
      font-weight: 600;
      cursor: pointer;
      transition: all 0.2s ease;
      background: rgba(255, 255, 255, 0.08);
      color: rgba(248, 250, 252, 0.65);
    }
    .rf-toggle-btn.on {
      background: #fbbf24;
      color: #040711;
      box-shadow: 0 0 14px rgba(251, 191, 36, 0.45);
    }
    .rf-slider-row {
      display: flex;
      align-items: center;
      gap: 8px;
      padding-top: 2px;
    }
    .rf-slider {
      flex: 1;
      accent-color: #38bdf8;
      height: 4px;
      cursor: pointer;
    }
    .rf-effect-pills {
      display: flex;
      gap: 5px;
      flex-wrap: wrap;
      padding-top: 2px;
    }
    .rf-fx-pill {
      border: none;
      border-radius: 99px;
      padding: 2px 8px;
      font-size: 10px;
      background: rgba(255, 255, 255, 0.06);
      color: rgba(255, 255, 255, 0.6);
      cursor: pointer;
    }
    .rf-fx-pill.active {
      background: #a855f7;
      color: #fff;
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

    <!-- FINANCES WIDGET (HIDDEN BY DEFAULT, CLICK TO TOGGLE VISIBILITY, CONFIGURABLE ELEMENTS + QUICK IMPORT) -->
    <div class="ambient-widget" id="widget-finances" onclick="toggleWidget('finances', event)">
      <div class="w-header">
        <div class="w-label-row" style="gap:8px;">
          <span>thassi.finances</span>
          <button id="finances-eye-btn"
                  onclick="toggleFinancesVisibility(event)"
                  title="Klicken, um Finanzdaten ein-/auszublenden"
                  style="background:rgba(255,255,255,0.08); border:1px solid rgba(255,255,255,0.14); color:#cbd5e1; border-radius:99px; padding:1px 7px; font-size:9.5px; cursor:pointer; display:inline-flex; align-items:center; gap:4px;">
            🔒 versteckt
          </button>
          <span class="w-dot" id="dot-finances" style="background:#a855f7; box-shadow:0 0 10px #a855f7;"></span>
        </div>
        <div class="w-primary" id="compact-finances" onclick="handleCompactFinancesClick(event)" title="Klicken zum Ein-/Ausblenden">🔒 •••• €</div>
        <div class="w-sub" id="sub-finances">Klick auf 🔒 zum Anzeigen · Sparkasse George</div>
      </div>
      <div class="w-expand-body" onclick="event.stopPropagation()" style="min-width:270px;">
        <div id="finances-preview-dynamic"
             onclick="toggleFinancesVisibility(event)"
             title="Klicken, um Zahlen ein-/auszublenden"
             style="display:flex; flex-direction:column; gap:8px; cursor:pointer; margin-bottom:10px;">
          <div class="w-stat-grid">
            <div class="w-stat-item"><span class="w-stat-k">Aktueller Kontostand</span><span class="w-stat-v" id="ef-bal" style="color:#38bdf8;">•••• €</span></div>
            <div class="w-stat-item"><span class="w-stat-k">Ausgaben (Tag / Woche)</span><span class="w-stat-v" id="ef-exp" style="color:#f87171;">•••• €</span></div>
          </div>
        </div>
        <div id="finances-quick-import-slot" style="margin-bottom:8px;"></div>
        <div style="display:flex; justify-content:space-between; align-items:center; gap:8px; border-top:1px solid rgba(255,255,255,0.07); padding-top:8px;">
          <button class="w-action-link" style="margin:0; color:#fbbf24;" onclick="toggleFinancesVisibility(event)" id="finances-toggle-link">👁️ Anzeigen</button>
          <button class="w-action-link" style="margin:0; color:#94a3b8;" onclick="openFullService('finance-analytics', 'thassi.finances', '#preview-config')">🎛️ Preview</button>
          <button class="w-action-link" style="margin:0;" onclick="openFullService('finance-analytics', 'thassi.finances')">Finances →</button>
        </div>
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

    <!-- 3D DRUCK MINI-PREVIEW WIDGET (MINIATURE 3D OBJECT + PROGRESS BAR + PLACEHOLDER) -->
    <div class="ambient-widget" id="widget-3dprint" onclick="toggleWidget('3dprint', event)">
      <div class="w-header">
        <div class="w-label-row">
          <span>3d druck · bambulab</span>
          <span class="w-dot" id="dot-3dprint" style="background:#00AE42; box-shadow:0 0 10px #00AE42;"></span>
        </div>
        <div style="display:flex; align-items:center; justify-content:flex-end; gap:12px; margin-top:2px;">
          <div style="position:relative; width:82px; height:64px; border-radius:12px; background:rgba(4,7,17,0.72); border:1px solid rgba(56,189,248,0.22); overflow:hidden; flex-shrink:0;"
               title="Miniatur 3D-Objekt (mit Maus/Touch drehbar)"
               onclick="event.stopPropagation()">
            <canvas id="mini-3d-canvas" width="164" height="128" style="width:82px; height:64px; display:block; cursor:grab; touch-action:none;"></canvas>
          </div>
          <div style="display:flex; flex-direction:column; align-items:flex-end; min-width:145px;">
            <div class="w-primary" id="compact-3dprint" style="font-size:15.5px;">Kein Projekt aktiv</div>
            <div class="w-sub" id="sub-3dprint">Platzhalter · 0% Leerlauf</div>
            <div style="width:100%; height:5px; border-radius:99px; background:rgba(255,255,255,0.1); overflow:hidden; margin-top:6px;">
              <div id="mini-3d-progress-fill" style="width:0%; height:100%; background:linear-gradient(90deg, #00AE42, #38bdf8); transition:width 0.35s ease;"></div>
            </div>
          </div>
        </div>
      </div>
      <div class="w-expand-body" onclick="event.stopPropagation()">
        <div class="w-stat-grid" style="margin-bottom:10px;">
          <div class="w-stat-item"><span class="w-stat-k">Drucker / Modus</span><span class="w-stat-v" id="e3d-printer">Bambu Lab P1S</span></div>
          <div class="w-stat-item"><span class="w-stat-k">Fortschritt / Layer</span><span class="w-stat-v" id="e3d-layer" style="color:#00AE42;">0% (0/0)</span></div>
          <div class="w-stat-item"><span class="w-stat-k">Maße / Gewicht</span><span class="w-stat-v" id="e3d-dims">--</span></div>
          <div class="w-stat-item"><span class="w-stat-k">Düse / Heizbett</span><span class="w-stat-v" id="e3d-temps">24°C / 24°C</span></div>
        </div>
        <form onsubmit="submitMini3dPrompt(event)" style="display:flex; gap:6px; margin-bottom:10px;">
          <input id="mini-3d-prompt" class="minimal-input" placeholder="Prompt: 3D-Objekt ändern oder neu erstellen…" />
          <button type="submit" id="mini-3d-prompt-btn" style="background:#38bdf8; color:#040711; border:none; border-radius:10px; padding:0 12px; font-weight:700; font-size:11.5px; cursor:pointer; white-space:nowrap;">KI</button>
        </form>
        <div style="display:flex; justify-content:space-between; align-items:center; gap:8px;">
          <button class="w-action-link" style="color:#fbbf24; margin:0;" onclick="toggleMini3dPlaceholder()" id="btn-mini-3d-toggle">Platzhalter testen</button>
          <button class="w-action-link" style="color:#4ade80; margin:0;" onclick="triggerMini3dPrint()" id="btn-mini-3d-print">🖨️ Druck starten</button>
          <button class="w-action-link" style="margin:0;" onclick="openFullService('3d-print', '3D Druck Studio')">3D Editor →</button>
        </div>
      </div>
    </div>
  </div>

  <!-- QUICK IMPORT ONLINE-BANKING POPUP FLYOUT -->
  <div id="quick-import-flyout-modal"
       onclick="closeQuickImportFlyout()"
       style="position:fixed; inset:0; z-index:95; background:rgba(4,7,17,0.68); backdrop-filter:blur(8px); display:none; justify-content:flex-end;">
    <div onclick="event.stopPropagation()"
         style="width:min(540px, 95vw); height:100vh; background:#0b1120; border-left:1px solid #1e293b; display:flex; flex-direction:column; box-shadow:-20px 0 60px rgba(0,0,0,0.75);">
      <div style="padding:16px 20px; border-bottom:1px solid #1e293b; display:flex; justify-content:space-between; align-items:center; background:#0f172a;">
        <div>
          <div style="font-size:15px; font-weight:700; color:#f8fafc;">⚡ Quick Import — Online-Banking Flyout</div>
          <div style="font-size:11px; color:#94a3b8; margin-top:2px;">Sparkasse George Auto-Login, Cookie-Tresor & automatischer Datei-Import</div>
        </div>
        <button onclick="closeQuickImportFlyout()" style="background:#1e293b; border:1px solid #334155; color:#cbd5e1; border-radius:8px; padding:5px 10px; cursor:pointer; font-size:12px;">✕</button>
      </div>
      <div style="padding:14px 18px; display:flex; gap:8px; flex-wrap:wrap; border-bottom:1px solid #1e293b; background:#0b1120;">
        <button onclick="launchBankingPopupFromDashboard()"
                style="padding:8px 13px; border-radius:9px; border:1px solid #38bdf8; background:linear-gradient(135deg,#0284c7,#2563eb); color:#fff; font-size:12px; font-weight:700; cursor:pointer;">
          🪟 Banking-Popup öffnen
        </button>
        <button onclick="triggerDashboardQuickImportSample()"
                style="padding:8px 13px; border-radius:9px; border:1px solid rgba(16,185,129,0.45); background:rgba(16,185,129,0.15); color:#34d399; font-size:12px; font-weight:700; cursor:pointer;">
          ⚡ George Export herunterladen & Auto-Import
        </button>
        <button onclick="triggerDashboardDownloadsScan()"
                style="padding:8px 12px; border-radius:9px; border:1px solid #334155; background:#1e293b; color:#e2e8f0; font-size:11.5px; font-weight:600; cursor:pointer;">
          📂 Downloads scannen
        </button>
      </div>
      <div id="qi-dash-status" style="display:none; margin:10px 18px 0; padding:9px 12px; border-radius:9px; font-size:12px; font-weight:600;"></div>
      <div style="flex:1; padding:12px 18px; display:flex; flex-direction:column; gap:10px; overflow:hidden;">
        <iframe id="qi-dash-frame"
                src="about:blank"
                style="flex:1; width:100%; border:1px solid #1e293b; border-radius:12px; background:#090d16;"></iframe>
        <label style="padding:10px 14px; border-radius:10px; border:1px dashed #38bdf8; background:rgba(56,189,248,0.06); text-align:center; font-size:12px; color:#cbd5e1; cursor:pointer;">
          📥 Bank-Export (.csv, .xml, .sta) hier ablegen oder klicken für sofortigen Auto-Import
          <input type="file" accept=".csv,.xml,.sta,.mt940,.json,.txt" onchange="handleDashboardQuickFileSelect(event)" style="display:none;" />
        </label>
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

  <!-- 6. SUBTLE ROOM-GROUPED DEVICE QUICK-ACCESS BAR & UPWARD FLYOUT -->
  <div id="room-flyout" onclick="event.stopPropagation()"></div>
  <div id="room-dock-bar">
    <div class="room-dock-group" id="room-pills-container"></div>
    <div style="display:flex; align-items:center; gap:6px;">
      <button class="room-pill" onclick="openFullService('3d-print', '3D Druck Studio')" title="3D Druck Editor & BambuLab Steuerung öffnen">
        <span class="room-dot" id="print3d-dock-dot" style="background:#00AE42; box-shadow:0 0 8px #00AE42;"></span>
        <span>3D Druck</span>
        <span class="room-meta" id="print3d-dock-meta">Bambu P1S</span>
      </button>
      <button class="room-pill" onclick="openFullService('camera-vision', 'Camera Vision')" title="Kamera-Objekterkennung & Streams öffnen">
        <span class="room-dot" id="vision-dock-dot" style="background:#38bdf8; box-shadow:0 0 8px #38bdf8;"></span>
        <span>Vision AI</span>
        <span class="room-meta" id="vision-dock-meta">Zyklisch</span>
      </button>
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

    const base = (
      window.__THASSI_INGRESS_PATH__ ||
      ((window.location.pathname || '').match(/^(\/api\/hassio_ingress\/[^/]+)/) || [])[1] ||
      ''
    ).replace(/\/+$/, '');
    const NOW_ANCHOR_RATIO = 0.22;

    let calendarEvents = [];
    let roomsData = [];
    let visionSummaryData = null;
    let activeRoomFlyoutId = null;
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
      if (!e.target.closest('#room-flyout') && !e.target.closest('.room-pill')) {
        closeRoomFlyout();
      }
    });

    function closeRoomFlyout() {
      activeRoomFlyoutId = null;
      const flyout = document.getElementById('room-flyout');
      if (flyout) flyout.style.display = 'none';
      document.querySelectorAll('.room-pill').forEach((p) => p.classList.remove('active-flyout'));
    }

    function openRoomFlyout(roomId, ev) {
      if (ev) ev.stopPropagation();
      if (activeRoomFlyoutId === roomId) {
        closeRoomFlyout();
        return;
      }
      activeRoomFlyoutId = roomId;
      renderRoomDockBar();

      const flyout = document.getElementById('room-flyout');
      const pillEl = document.getElementById('room-pill-' + roomId);
      if (pillEl && flyout) {
        const rect = pillEl.getBoundingClientRect();
        const maxLeft = Math.max(16, window.innerWidth - 360);
        const targetLeft = Math.min(maxLeft, Math.max(16, rect.left));
        flyout.style.left = targetLeft + 'px';
      }
      renderActiveRoomFlyout();
    }

    function renderRoomDockBar() {
      const container = document.getElementById('room-pills-container');
      if (!container) return;

      container.innerHTML = roomsData
        .map((r) => {
          const hasOn = r.activeCount > 0;
          const hasMotion = Boolean(r.motionActive);
          const isActive = activeRoomFlyoutId === r.id;

          const metaParts = [];
          if (r.tempC != null) metaParts.push(r.tempC.toFixed(1) + '°');
          if (r.activeCount > 0) metaParts.push(r.activeCount + ' an');
          if (r.totalPowerW > 0.5) metaParts.push(Math.round(r.totalPowerW) + 'W');
          if (hasMotion) metaParts.push('Bewegung');
          if (r.id === 'kameras_vision') {
            metaParts.push(
              visionSummaryData?.lastTotalObjects
                ? visionSummaryData.lastTotalObjects + ' Obj'
                : r.devices.length + ' Cams'
            );
          }

          return \`
            <button id="room-pill-\${r.id}"
                    class="room-pill \${hasOn ? 'has-on' : ''} \${hasMotion ? 'has-motion' : ''} \${isActive ? 'active-flyout' : ''}"
                    onclick="openRoomFlyout('\${r.id}', event)">
              <span class="room-dot"></span>
              <span>\${r.name}</span>
              \${metaParts.length > 0 ? \`<span class="room-meta">\${metaParts.join(' · ')}</span>\` : ''}
            </button>
          \`;
        })
        .join('');

      const vMeta = document.getElementById('vision-dock-meta');
      if (vMeta && visionSummaryData) {
        vMeta.textContent = visionSummaryData.lastSceneSummary
          ? (visionSummaryData.lastTotalObjects || 0) + ' Objekte'
          : 'Zyklisch';
      }
    }

    function renderActiveRoomFlyout() {
      const flyout = document.getElementById('room-flyout');
      if (!flyout || !activeRoomFlyoutId) return;
      const room = roomsData.find((r) => r.id === activeRoomFlyoutId);
      if (!room) {
        closeRoomFlyout();
        return;
      }

      const subParts = [];
      if (room.tempC != null) subParts.push(room.tempC.toFixed(1) + ' °C');
      if (room.humidityPct != null) subParts.push(Math.round(room.humidityPct) + '% rF');
      if (room.totalPowerW > 0) subParts.push(room.totalPowerW.toFixed(1) + ' W');

      const rowsHtml = room.devices
        .map((d) => {
          const pwr = d.powerW != null && d.powerW > 0 ? \`<span class="rf-power-badge">\${d.powerW.toFixed(1)} W</span>\` : '';

          if (d.kind === 'toggle' || d.kind === 'rgbw') {
            const extraRgbw =
              d.kind === 'rgbw' && d.isOn
                ? \`
                  <div class="rf-slider-row">
                    <span style="font-size:10px; color:rgba(255,255,255,0.45);">Dim</span>
                    <input type="range" min="5" max="100" value="\${d.brightness || 80}" class="rf-slider"
                           onchange="triggerDeviceAction('\${d.entityId}', 'brightness', { brightnessPct: Number(this.value) })" />
                  </div>
                  \${
                    Array.isArray(d.effectList) && d.effectList.length > 0
                      ? \`<div class="rf-effect-pills">
                          \${d.effectList
                            .map(
                              (fx) =>
                                \`<button class="rf-fx-pill \${d.effect === fx ? 'active' : ''}" onclick="triggerDeviceAction('\${d.entityId}', 'effect', { effect: '\${fx}' })">\${fx}</button>\`
                            )
                            .join('')}
                        </div>\`
                      : ''
                  }
                \`
                : '';

            return \`
              <div class="rf-dev-row \${d.isOn ? 'is-on' : ''}">
                <div class="rf-dev-main">
                  <span class="rf-dev-label">\${d.label}</span>
                  <div class="rf-dev-right">
                    \${pwr}
                    <button class="rf-toggle-btn \${d.isOn ? 'on' : ''}"
                            onclick="triggerDeviceAction('\${d.entityId}', 'toggle')">
                      \${d.isOn ? 'AN' : 'AUS'}
                    </button>
                  </div>
                </div>
                \${extraRgbw}
              </div>
            \`;
          }

          if (d.kind === 'camera') {
            const camLive = d.state === 'recording' || d.state === 'streaming';
            const currentMode = (visionSummaryData?.cameraModes && visionSummaryData.cameraModes[d.entityId]) || 'Personen';
            const modes = ['Personen', 'Fahrzeuge', 'Objekte', 'Kamera', 'Aktivitäten'];
            return \`
              <div class="rf-dev-row \${camLive ? 'is-on' : ''}">
                <div class="rf-dev-main">
                  <span class="rf-dev-label">\${d.label}</span>
                  <div class="rf-dev-right">
                    <span class="rf-power-badge" style="color:\${camLive ? '#4ade80' : '#fbbf24'};">
                      \${camLive ? 'Aktiv' : 'QR-Auth'}
                    </span>
                    <button class="rf-toggle-btn" onclick="triggerQuickVisionSample('\${d.entityId}', this)">
                      Abtasten
                    </button>
                  </div>
                </div>
                <div class="rf-effect-pills">
                  \${modes
                    .map(
                      (m) =>
                        \`<button class="rf-fx-pill \${currentMode === m ? 'active' : ''}" style="\${currentMode === m ? 'background:#38bdf8; color:#040711; font-weight:600;' : ''}" onclick="setCameraModeFromFlyout('\${d.entityId}', '\${m}')">\${m}</button>\`
                    )
                    .join('')}
                </div>
              </div>
            \`;
          }

          // Sensor row
          const formattedState =
            d.state === 'on'
              ? 'Bewegung erkannt'
              : d.state === 'off'
                ? 'Ruhig'
                : d.state === 'unavailable'
                  ? 'Offline'
                  : \`\${d.state}\${d.unit ? ' ' + d.unit : ''}\`;

          return \`
            <div class="rf-dev-row">
              <div class="rf-dev-main">
                <span class="rf-dev-label">\${d.label}</span>
                <span class="rf-power-badge" style="color:rgba(248,250,252,0.75);">\${formattedState}</span>
              </div>
            </div>
          \`;
        })
        .join('');

      const footerHtml =
        room.id === 'kameras_vision'
          ? \`
            <div style="display:flex; justify-content:space-between; align-items:center; padding-top:4px;">
              <span style="font-size:11px; color:rgba(255,255,255,0.48);">
                \${visionSummaryData?.lastSceneSummary ? visionSummaryData.lastSceneSummary.slice(0, 36) : 'Lokales COCO-SSD aktiv'}
              </span>
              <button class="w-action-link" style="margin:0;" onclick="closeRoomFlyout(); openFullService('camera-vision', 'Camera Vision')">
                Vision öffnen →
              </button>
            </div>
          \`
          : room.activeCount > 0
            ? \`
              <div style="display:flex; justify-content:space-between; align-items:center; padding-top:4px;">
                <button class="w-action-link" style="margin:0; color:#fbbf24;" onclick="turnOffAllInRoom('\${room.id}')">
                  Alle im Raum ausschalten
                </button>
                <button class="w-action-link" style="margin:0;" onclick="closeRoomFlyout(); openFullService('smart-canvas', 'Smart Home')">
                  Canvas →
                </button>
              </div>
            \`
            : \`
              <div style="display:flex; justify-content:flex-end; padding-top:4px;">
                <button class="w-action-link" style="margin:0;" onclick="closeRoomFlyout(); openFullService('smart-canvas', 'Smart Home')">
                  Smart Canvas →
                </button>
              </div>
            \`;

      flyout.innerHTML = \`
        <div class="rf-header">
          <span class="rf-title">\${room.name}</span>
          <span class="rf-subtitle">\${subParts.join(' · ') || (room.activeCount + ' aktiv')}</span>
        </div>
        <div class="rf-dev-list">\${rowsHtml}</div>
        \${footerHtml}
      \`;
      flyout.style.display = 'flex';
    }

    async function setCameraModeFromFlyout(cameraId, mode) {
      try {
        await fetch(base + '/api/apps/camera-vision/camera-mode', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ camera_id: cameraId, optimization_mode: mode }),
        });
        await loadRoomsQuickAccess();
      } catch (e) {
        console.error('Failed setting camera mode:', e);
      }
    }

    async function triggerDeviceAction(entityId, action, extra) {
      try {
        await fetch(base + '/api/system/device-action', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ entityId, action, ...(extra || {}) }),
        });
        await loadRoomsQuickAccess();
      } catch (e) {
        console.error('Device action failed:', e);
      }
    }

    async function turnOffAllInRoom(roomId) {
      const room = roomsData.find((r) => r.id === roomId);
      if (!room) return;
      const activeDevs = room.devices.filter((d) => (d.kind === 'toggle' || d.kind === 'rgbw') && d.isOn);
      await Promise.all(
        activeDevs.map((d) =>
          fetch(base + '/api/system/device-action', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ entityId: d.entityId, action: 'turn_off' }),
          })
        )
      );
      await loadRoomsQuickAccess();
    }

    async function triggerQuickVisionSample(cameraId, btnEl) {
      if (btnEl) btnEl.textContent = 'Prüfe…';
      try {
        await fetch(base + '/api/apps/camera-vision/sample-now', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ camera_id: cameraId }),
        });
        await loadRoomsQuickAccess();
      } finally {
        if (btnEl) btnEl.textContent = 'Abtasten';
      }
    }

    async function loadRoomsQuickAccess() {
      try {
        const res = await fetch(base + '/api/system/rooms');
        if (!res.ok) return;
        const data = await res.json();
        roomsData = data.rooms || [];
        visionSummaryData = data.visionSummary || null;
        renderRoomDockBar();
        if (activeRoomFlyoutId) {
          renderActiveRoomFlyout();
        }
      } catch (e) {
        console.error('Failed loading rooms quick access:', e);
      }
    }

    function openFullService(appId, title, hash) {
      document.getElementById('full-app-title').textContent = title;
      document.getElementById('full-app-frame').src = base + '/apps/' + appId + '/' + (hash || '');
      document.getElementById('full-app-overlay').style.display = 'flex';
    }

    function closeFullService() {
      document.getElementById('full-app-overlay').style.display = 'none';
      document.getElementById('full-app-frame').src = 'about:blank';
      loadAllLiveData();
    }

    // ============================================================================
    // THASSI.FINANCES CONFIGURABLE PREVIEW & QUICK IMPORT FLYOUT
    // ============================================================================
    let financesDashData = null;
    let financesPrivacyInitialized = false;
    let financesHidden = true; // Hidden by default until user clicks to toggle

    function fmtEurDash(val, masked) {
      if (masked) return '•••• €';
      return Number(val || 0).toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €';
    }

    function toggleFinancesVisibility(ev) {
      if (ev) ev.stopPropagation();
      financesHidden = !financesHidden;
      renderFinancesPreviewWidget();
    }

    function handleCompactFinancesClick(ev) {
      const w = document.getElementById('widget-finances');
      if (w && w.classList.contains('expanded')) {
        ev.stopPropagation();
        toggleFinancesVisibility(ev);
      }
    }

    async function refreshFinancesWidget(fallbackSummary) {
      try {
        const res = await fetch(base + '/api/apps/finance-analytics/dashboard');
        if (res.ok) {
          financesDashData = await res.json();
          if (!financesPrivacyInitialized && financesDashData.previewConfig) {
            financesHidden = financesDashData.previewConfig.hiddenByDefault !== false;
            financesPrivacyInitialized = true;
          }
          renderFinancesPreviewWidget();
          return;
        }
      } catch (err) {
        console.warn('Finance dashboard endpoint fallback:', err);
      }

      if (fallbackSummary) {
        financesDashData = {
          kpis: {
            activeMonth: fallbackSummary.activeMonth || 'Aktuell',
            currentBalance: 4850,
            accountName: 'Sparkasse George Girokonto',
            expensesDay: 0,
            expensesWeek: 0,
            income: fallbackSummary.income || 0,
            expenses: fallbackSummary.expenses || 0,
            net: fallbackSummary.netCashflow || 0,
          },
          balanceConfig: {
            currentBalance: 4850,
            accountName: 'Sparkasse George Girokonto',
          },
          previewGroupBudgets: [],
          previewConfig: {
            hiddenByDefault: true,
            primaryMetric: 'current_balance',
            enabledElements: ['current_balance', 'expenses_day', 'expenses_week', 'quick_import']
          }
        };
        renderFinancesPreviewWidget();
      }
    }

    function renderFinancesPreviewWidget() {
      const d = financesDashData;
      const compactEl = document.getElementById('compact-finances');
      const subEl = document.getElementById('sub-finances');
      const eyeBtn = document.getElementById('finances-eye-btn');
      const toggleLink = document.getElementById('finances-toggle-link');
      const dynEl = document.getElementById('finances-preview-dynamic');
      const qiSlot = document.getElementById('finances-quick-import-slot');

      if (!d || !compactEl || !dynEl) return;

      const k = d.kpis || {};
      const bal = d.balanceConfig || {};
      const currentBalance = bal.currentBalance !== undefined ? bal.currentBalance : (k.currentBalance || 0);
      const accountName = bal.accountName || k.accountName || 'Sparkasse George';
      const expensesDay = k.expensesDay !== undefined ? k.expensesDay : (d.expensesToday || 0);
      const expensesWeek = k.expensesWeek !== undefined ? k.expensesWeek : (d.expensesWeek || 0);
      const netCashflow = k.net !== undefined ? k.net : (d.netCashflowMonth || 0);
      const activeMonth = k.activeMonth || d.activeMonth || '';
      const groupBudgets = d.previewGroupBudgets || d.groupBudgets || [];

      const cfg = d.previewConfig || {
        hiddenByDefault: true,
        primaryMetric: 'current_balance',
        enabledElements: ['current_balance', 'expenses_day', 'expenses_week', 'group_budgets', 'quick_import']
      };
      const enabled = cfg.enabledElements || [];

      if (eyeBtn) {
        eyeBtn.innerHTML = financesHidden ? '🔒 versteckt' : '👁️ sichtbar';
        eyeBtn.style.color = financesHidden ? '#fbbf24' : '#34d399';
        eyeBtn.style.borderColor = financesHidden ? 'rgba(251,191,36,0.35)' : 'rgba(52,211,153,0.35)';
      }
      if (toggleLink) {
        toggleLink.innerHTML = financesHidden ? '👁️ Zahlen anzeigen' : '🔒 Zahlen verbergen';
      }

      // Primary headline
      if (financesHidden) {
        compactEl.innerHTML = '<strong>🔒 •••• €</strong>';
        subEl.textContent = 'Klick zum Anzeigen · ' + accountName;
      } else {
        let headlineVal = fmtEurDash(currentBalance, false);
        let headlineSub = accountName + ' · Kontostand';
        if (cfg.primaryMetric === 'expenses_day') {
          headlineVal = '-' + fmtEurDash(expensesDay, false);
          headlineSub = 'Ausgaben Tag (' + (k.expensesDayDate || 'Heute') + ')';
        } else if (cfg.primaryMetric === 'expenses_week') {
          headlineVal = '-' + fmtEurDash(expensesWeek, false);
          headlineSub = 'Ausgaben 7-Tage (' + (k.expensesWeekRangeLabel || 'Woche') + ')';
        } else if (cfg.primaryMetric === 'net_cashflow') {
          const sign = Number(netCashflow) >= 0 ? '+' : '';
          headlineVal = sign + fmtEurDash(netCashflow, false);
          headlineSub = 'Cashflow ' + activeMonth;
        }
        compactEl.innerHTML = '<strong>' + headlineVal + '</strong>';
        subEl.textContent = headlineSub;
      }

      // Build configurable dynamic body
      const statCards = [];
      if (enabled.includes('current_balance')) {
        statCards.push(\`
          <div class="w-stat-item">
            <span class="w-stat-k">🏦 Aktueller Kontostand</span>
            <span class="w-stat-v" style="color:#38bdf8;">\${fmtEurDash(currentBalance, financesHidden)}</span>
          </div>
        \`);
      }
      if (enabled.includes('expenses_day')) {
        statCards.push(\`
          <div class="w-stat-item">
            <span class="w-stat-k">📅 Ausgaben (Tag)</span>
            <span class="w-stat-v" style="color:#f8fafc;">-\${fmtEurDash(expensesDay, financesHidden)}</span>
          </div>
        \`);
      }
      if (enabled.includes('expenses_week')) {
        statCards.push(\`
          <div class="w-stat-item">
            <span class="w-stat-k">📆 Ausgaben (Woche)</span>
            <span class="w-stat-v" style="color:#fbbf24;">-\${fmtEurDash(expensesWeek, financesHidden)}</span>
          </div>
        \`);
      }

      let html = '';
      if (statCards.length > 0) {
        html += \`<div class="w-stat-grid">\${statCards.join('')}</div>\`;
      }

      if (enabled.includes('group_budgets') && Array.isArray(groupBudgets) && groupBudgets.length > 0) {
        const budgetRows = groupBudgets.slice(0, 4).map((b) => {
          const pct = Math.min(100, Math.round(b.pctUsed !== undefined ? b.pctUsed : (b.pct || 0)));
          const limit = b.budgetLimit !== undefined ? b.budgetLimit : (b.limit || 0);
          const barColor = b.overBudget ? '#ef4444' : (b.color || '#38bdf8');
          const valText = financesHidden
            ? '•••• / •••• €'
            : \`\${Math.round(b.spent || 0)} / \${Math.round(limit)} €\`;
          return \`
            <div style="display:flex; flex-direction:column; gap:3px;">
              <div style="display:flex; justify-content:space-between; font-size:11px; color:rgba(248,250,252,0.88);">
                <span>\${b.icon || '📦'} \${b.labelDe || b.category}</span>
                <span style="font-variant-numeric:tabular-nums; color:rgba(248,250,252,0.68);">\${valText}</span>
              </div>
              <div style="height:4px; background:rgba(255,255,255,0.08); border-radius:99px; overflow:hidden;">
                <div style="width:\${financesHidden ? 35 : pct}%; height:100%; background:\${barColor};"></div>
              </div>
            </div>
          \`;
        }).join('');
        html += \`<div style="display:flex; flex-direction:column; gap:6px; padding-top:4px;">\${budgetRows}</div>\`;
      }

      dynEl.innerHTML = html || '<div style="font-size:11.5px; color:rgba(255,255,255,0.5);">Keine Preview-Felder ausgewählt</div>';

      if (qiSlot) {
        if (enabled.includes('quick_import')) {
          qiSlot.innerHTML = \`
            <button onclick="openQuickImportFlyout(event)"
                    style="width:100%; padding:7px 12px; border-radius:9px; border:1px solid rgba(56,189,248,0.4); background:linear-gradient(135deg, rgba(2,132,199,0.28), rgba(37,99,235,0.28)); color:#38bdf8; font-size:11.5px; font-weight:700; cursor:pointer; display:flex; align-items:center; justify-content:center; gap:6px;">
              ⚡ Quick Import (Online-Banking Flyout)
            </button>
          \`;
        } else {
          qiSlot.innerHTML = '';
        }
      }
    }

    function openQuickImportFlyout(ev) {
      if (ev) ev.stopPropagation();
      const modal = document.getElementById('quick-import-flyout-modal');
      const frame = document.getElementById('qi-dash-frame');
      if (frame) {
        frame.src = base + '/api/apps/finance-analytics/quick-import/portal';
      }
      if (modal) {
        modal.style.display = 'flex';
      }
    }

    function closeQuickImportFlyout() {
      const modal = document.getElementById('quick-import-flyout-modal');
      const frame = document.getElementById('qi-dash-frame');
      if (modal) modal.style.display = 'none';
      if (frame) frame.src = 'about:blank';
      loadAllLiveData();
    }

    function showQiDashStatus(msg, ok) {
      const el = document.getElementById('qi-dash-status');
      if (!el) return;
      el.style.display = 'block';
      el.style.background = ok ? 'rgba(16,185,129,0.16)' : 'rgba(239,68,68,0.16)';
      el.style.border = '1px solid ' + (ok ? '#10b981' : '#ef4444');
      el.style.color = ok ? '#34d399' : '#f87171';
      el.textContent = msg;
    }

    function launchBankingPopupFromDashboard() {
      const url = (financesDashData && financesDashData.quickImportConfig && financesDashData.quickImportConfig.loginUrl)
        || 'https://george.sparkasse.at/index.html#/login';
      const w = 1040, h = 760;
      const left = Math.max(0, Math.round((window.screen.width - w) / 2));
      const top = Math.max(0, Math.round((window.screen.height - h) / 2));
      window.open(url, 'ThassiOnlineBankingPopup', 'width=' + w + ',height=' + h + ',left=' + left + ',top=' + top + ',resizable=yes,scrollbars=yes');
      showQiDashStatus('🪟 Online-Banking Popup geöffnet. Nach Download wird der Export automatisch importiert.', true);
    }

    async function triggerDashboardQuickImportSample() {
      try {
        showQiDashStatus('⏳ Lade George-Umsatzexport herunter & importiere...', true);
        const impRes = await fetch(base + '/api/apps/finance-analytics/quick-import/simulate-download', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ accountName: 'Girokonto' })
        });
        const json = await impRes.json();
        showQiDashStatus('✅ ' + (json.insertedCount || 0) + ' neue Buchungen importiert (' + (json.skippedDuplicates || 0) + ' Duplikate übersprungen)', true);
        await refreshFinancesWidget();
      } catch (e) {
        showQiDashStatus('❌ Fehler beim Quick-Import', false);
      }
    }

    async function triggerDashboardDownloadsScan() {
      try {
        showQiDashStatus('🔍 Scanne Downloads-Ordner nach neuen Kontoauszügen...', true);
        const res = await fetch(base + '/api/apps/finance-analytics/quick-import/scan-downloads', { method: 'POST' });
        const json = await res.json();
        const evts = json.events || [];
        if (evts.length > 0) {
          const totalIns = evts.reduce((s, x) => s + (x.insertedCount || 0), 0);
          showQiDashStatus('✅ ' + evts.length + ' Datei(en) erkannt: ' + totalIns + ' neue Buchungen importiert!', true);
        } else {
          showQiDashStatus('ℹ️ Keine neuen Bank-Exporte in Downloads gefunden.', true);
        }
        await refreshFinancesWidget();
      } catch (e) {
        showQiDashStatus('❌ Downloads-Scan fehlgeschlagen', false);
      }
    }

    async function handleDashboardQuickFileSelect(ev) {
      const file = ev.target.files && ev.target.files[0];
      if (!file) return;
      try {
        showQiDashStatus('⏳ Importiere ' + file.name + '...', true);
        const buf = await file.arrayBuffer();
        const bytes = new Uint8Array(buf);
        let binary = '';
        for (let i = 0; i < bytes.byteLength; i++) binary += String.fromCharCode(bytes[i]);
        const b64 = window.btoa(binary);
        const res = await fetch(base + '/api/apps/finance-analytics/import-bank-csv', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ fileName: file.name, base64Content: b64 })
        });
        const json = await res.json();
        showQiDashStatus('✅ ' + file.name + ': ' + (json.importedCount || 0) + ' Buchungen importiert!', true);
        await refreshFinancesWidget();
      } catch (e) {
        showQiDashStatus('❌ Datei-Import fehlgeschlagen', false);
      }
    }

    window.addEventListener('message', (ev) => {
      if (!ev.data || typeof ev.data !== 'object') return;
      if (ev.data.type === 'THASSI_QUICK_IMPORT_DONE') {
        const p = ev.data.payload || {};
        showQiDashStatus('✅ Auto-Import abgeschlossen: ' + (p.insertedCount || p.imported || 0) + ' neue Buchungen!', true);
        refreshFinancesWidget();
      } else if (ev.data.type === 'THASSI_OPEN_BANK_POPUP') {
        launchBankingPopupFromDashboard();
      }
    });

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
        void loadRoomsQuickAccess();
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

        // 2. Update FINANCES widget (Configurable preview, hidden by default)
        await refreshFinancesWidget(sys.summaries?.finance);

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

        // 5. Update 3D PRINT Mini-Preview Widget
        await refreshMini3dData(sys.summaries?.print3d);
      } catch (err) {
        console.error('Failed loading dashboard data:', err);
      }
    }

    // ============================================================================
    // 3D PRINT MINI-PREVIEW RENDERER & CONTROLS (3D OBJECT + PROGRESS + PLACEHOLDER)
    // ============================================================================
    let mini3dState = {
      hasActiveProject: false,
      activeProjectId: null,
      projectName: null,
      scene: null,
      stats: null,
      printer: {
        name: 'Bambu Lab P1S',
        status: 'IDLE',
        progressPercent: 0,
        currentLayer: 0,
        totalLayers: 0,
        remainingMinutes: 0,
        nozzleTemp: 24,
        bedTemp: 24,
      },
      yaw: 0.65,
      pitch: 0.42,
      dragging: false,
      lastX: 0,
      lastY: 0,
      triangles: [],
      maxExtent: 60,
      centerZ: 20,
    };

    function transformMiniPt(pt, pos, rotDeg, scale) {
      let x = pt[0] * ((scale && scale[0]) || 1);
      let y = pt[1] * ((scale && scale[1]) || 1);
      let z = pt[2] * ((scale && scale[2]) || 1);
      const rx = (((rotDeg && rotDeg[0]) || 0) * Math.PI) / 180;
      const ry = (((rotDeg && rotDeg[1]) || 0) * Math.PI) / 180;
      const rz = (((rotDeg && rotDeg[2]) || 0) * Math.PI) / 180;
      if (rx !== 0) {
        const c = Math.cos(rx), s = Math.sin(rx);
        const ny = y * c - z * s, nz = y * s + z * c;
        y = ny; z = nz;
      }
      if (ry !== 0) {
        const c = Math.cos(ry), s = Math.sin(ry);
        const nx = x * c + z * s, nz = -x * s + z * c;
        x = nx; z = nz;
      }
      if (rz !== 0) {
        const c = Math.cos(rz), s = Math.sin(rz);
        const nx = x * c - y * s, ny = x * s + y * c;
        x = nx; y = ny;
      }
      return [
        x + ((pos && pos[0]) || 0),
        y + ((pos && pos[1]) || 0),
        z + ((pos && pos[2]) || 0),
      ];
    }

    function buildMiniTrianglesFromScene(scene) {
      if (!scene || !Array.isArray(scene.nodes) || scene.nodes.length === 0) return [];
      const tris = [];
      for (const n of scene.nodes) {
        if (n.operation === 'subtract') continue;
        const p = n.params || {};
        const pos = n.position || [0, 0, 0];
        const rot = n.rotation || [0, 0, 0];
        const scl = n.scale || [1, 1, 1];
        const col = n.color || (scene.printProfile && scene.printProfile.filamentColor) || '#00AE42';
        const local = [];
        const addQ = (a, b, c, d) => {
          local.push([a, b, c]);
          local.push([a, c, d]);
        };

        if (n.type === 'apple') {
          const rad = Math.max(8, p.radius || 34);
          const h = Math.max(12, p.height || 58);
          const topInd = p.topIndent || h * 0.21;
          const botInd = p.bottomIndent || h * 0.09;
          const prof = [
            [0.0, botInd],
            [0.35, 0.0],
            [0.78, h * 0.18],
            [1.03, h * 0.54],
            [0.85, h * 0.88],
            [0.54, h],
            [0.24, h - topInd * 0.55],
            [0.0, h - topInd],
          ];
          const segs = 18;
          for (let ri = 0; ri < prof.length - 1; ri++) {
            const [rf0, z0] = prof[ri];
            const [rf1, z1] = prof[ri + 1];
            for (let li = 0; li < segs; li++) {
              const a0 = (li / segs) * Math.PI * 2;
              const a1 = ((li + 1) / segs) * Math.PI * 2;
              const r0 = rad * rf0, r1 = rad * rf1;
              const p00 = [r0 * Math.cos(a0), r0 * Math.sin(a0), z0];
              const p10 = [r0 * Math.cos(a1), r0 * Math.sin(a1), z0];
              const p11 = [r1 * Math.cos(a1), r1 * Math.sin(a1), z1];
              const p01 = [r1 * Math.cos(a0), r1 * Math.sin(a0), z1];
              if (rf0 <= 1e-4) local.push([p00, p11, p01]);
              else if (rf1 <= 1e-4) local.push([p00, p10, p11]);
              else addQ(p00, p10, p11, p01);
            }
          }
        } else if (n.type === 'lathe') {
          const h = Math.max(10, p.height || 65);
          const ctrl = [
            p.rBottom || p.radiusBottom || 22,
            p.rLower || p.rBelly || 28,
            p.rMid || 26,
            p.rUpper || 20,
            p.rNeck || 14,
            p.rTop || p.radiusTop || 14,
          ];
          const segs = 16;
          for (let ri = 0; ri < ctrl.length - 1; ri++) {
            const r0 = ctrl[ri], r1 = ctrl[ri + 1];
            const z0 = (ri / (ctrl.length - 1)) * h;
            const z1 = ((ri + 1) / (ctrl.length - 1)) * h;
            for (let li = 0; li < segs; li++) {
              const a0 = (li / segs) * Math.PI * 2;
              const a1 = ((li + 1) / segs) * Math.PI * 2;
              addQ(
                [r0 * Math.cos(a0), r0 * Math.sin(a0), z0],
                [r0 * Math.cos(a1), r0 * Math.sin(a1), z0],
                [r1 * Math.cos(a1), r1 * Math.sin(a1), z1],
                [r1 * Math.cos(a0), r1 * Math.sin(a0), z1]
              );
            }
          }
        } else if (n.type === 'sphere') {
          const rad = Math.max(2, p.radius || 20);
          const dome = Boolean(p.domeOnly);
          const latS = dome ? 6 : 10;
          const lonS = 16;
          for (let la = 0; la < latS; la++) {
            const t0 = dome ? (la / latS) * (Math.PI / 2) : -Math.PI / 2 + (la / latS) * Math.PI;
            const t1 = dome ? ((la + 1) / latS) * (Math.PI / 2) : -Math.PI / 2 + ((la + 1) / latS) * Math.PI;
            const z0 = dome ? rad * Math.sin(t0) : rad + rad * Math.sin(t0);
            const z1 = dome ? rad * Math.sin(t1) : rad + rad * Math.sin(t1);
            const r0 = rad * Math.cos(t0), r1 = rad * Math.cos(t1);
            for (let lo = 0; lo < lonS; lo++) {
              const a0 = (lo / lonS) * Math.PI * 2, a1 = ((lo + 1) / lonS) * Math.PI * 2;
              addQ(
                [r0 * Math.cos(a0), r0 * Math.sin(a0), z0],
                [r0 * Math.cos(a1), r0 * Math.sin(a1), z0],
                [r1 * Math.cos(a1), r1 * Math.sin(a1), z1],
                [r1 * Math.cos(a0), r1 * Math.sin(a0), z1]
              );
            }
          }
        } else if (n.type === 'torus') {
          const R = Math.max(4, p.radius || 22);
          const r = Math.max(1, p.tubeRadius || 5);
          const majS = 16, minS = 10;
          for (let i = 0; i < majS; i++) {
            const u0 = (i / majS) * Math.PI * 2, u1 = ((i + 1) / majS) * Math.PI * 2;
            for (let j = 0; j < minS; j++) {
              const v0 = (j / minS) * Math.PI * 2, v1 = ((j + 1) / minS) * Math.PI * 2;
              const tp = (u, v) => [(R + r * Math.cos(v)) * Math.cos(u), (R + r * Math.cos(v)) * Math.sin(u), r + r * Math.sin(v)];
              addQ(tp(u0, v0), tp(u1, v0), tp(u1, v1), tp(u0, v1));
            }
          }
        } else if (n.type === 'cylinder' || n.type === 'cone' || n.type === 'gear' || n.type === 'twisted_vase' || n.type === 'hex_organizer' || n.type === 'star' || n.type === 'heart') {
          const segs = n.type === 'hex_organizer' ? 6 : 18;
          const rBot = p.radiusBottom || p.outerRadius || p.radius || (p.width ? p.width / 2 : 20);
          const rTop = n.type === 'cone' ? (p.radiusTop != null ? p.radiusTop : 1) : (p.radiusTop || rBot);
          const h = p.height || 30;
          for (let i = 0; i < segs; i++) {
            const a0 = (i / segs) * Math.PI * 2;
            const a1 = ((i + 1) / segs) * Math.PI * 2;
            const m0 = n.type === 'star' && i % 2 === 1 ? 0.45 : 1;
            const m1 = n.type === 'star' && (i + 1) % 2 === 1 ? 0.45 : 1;
            const x0b = Math.cos(a0) * rBot * m0, y0b = Math.sin(a0) * rBot * m0;
            const x1b = Math.cos(a1) * rBot * m1, y1b = Math.sin(a1) * rBot * m1;
            const x0t = Math.cos(a0) * rTop * m0, y0t = Math.sin(a0) * rTop * m0;
            const x1t = Math.cos(a1) * rTop * m1, y1t = Math.sin(a1) * rTop * m1;
            addQ([x0b, y0b, 0], [x1b, y1b, 0], [x1t, y1t, h], [x0t, y0t, h]);
            local.push([[0, 0, h], [x0t, y0t, h], [x1t, y1t, h]]);
          }
        } else {
          const w = (p.width || 36) / 2;
          const d = (p.depth || 36) / 2;
          const h = p.height || 30;
          const v = [
            [-w, -d, 0], [w, -d, 0], [w, d, 0], [-w, d, 0],
            [-w, -d, h], [w, -d, h], [w, d, h], [-w, d, h]
          ];
          const faces = [
            [4, 5, 6], [4, 6, 7],
            [0, 1, 5], [0, 5, 4],
            [1, 2, 6], [1, 6, 5],
            [2, 3, 7], [2, 7, 6],
            [3, 0, 4], [3, 4, 7]
          ];
          for (const f of faces) local.push([v[f[0]], v[f[1]], v[f[2]]]);
        }

        for (const [p0, p1, p2] of local) {
          tris.push({
            v: [
              transformMiniPt(p0, pos, rot, scl),
              transformMiniPt(p1, pos, rot, scl),
              transformMiniPt(p2, pos, rot, scl),
            ],
            c: col,
          });
        }
      }
      return tris;
    }

    async function refreshMini3dData(summaryFromSys) {
      try {
        const res = await fetch(base + '/api/apps/3d-print/dashboard');
        if (res.ok) {
          const data = await res.json();
          applyMini3dDashboardPayload(data);
          return;
        }
      } catch {}
      if (summaryFromSys) {
        applyMini3dDashboardPayload(summaryFromSys);
      }
    }

    function applyMini3dDashboardPayload(data) {
      if (!data) return;
      const hasProj = Boolean(data.hasActiveProject && (data.activeProject || data.scene));
      const proj = data.activeProject || data;
      const scene = proj.scene || data.scene || null;
      const stats = proj.stats || data.stats || null;
      const tel = data.telemetry || data.printer || {};
      const cfg = data.printerConfig || {};

      const printer = {
        name: cfg.printerName || tel.name || 'Bambu Lab P1S',
        status: tel.printerState || tel.status || 'IDLE',
        progressPercent: Number(tel.progressPercent ?? proj.progressPct ?? 0),
        currentLayer: Number(tel.currentLayer ?? 0),
        totalLayers: Number(tel.totalLayers ?? (stats && stats.layerCount ? stats.layerCount : 0)),
        remainingMinutes: Number(tel.remainingMinutes ?? (stats && stats.estimatedPrintMinutes ? stats.estimatedPrintMinutes : 0)),
        nozzleTemp: Number(tel.nozzleTempC ?? tel.nozzleTemp ?? 24),
        bedTemp: Number(tel.bedTempC ?? tel.bedTemp ?? 24),
      };

      mini3dState.hasActiveProject = hasProj;
      mini3dState.activeProjectId = proj.id || data.activeProjectId || null;
      mini3dState.projectName = proj.title || proj.name || data.projectName || null;
      mini3dState.scene = scene;
      mini3dState.stats = stats;
      mini3dState.printer = printer;

      const rawDims = stats && stats.dimensionsMm ? stats.dimensionsMm : null;
      const dimX = rawDims ? (Array.isArray(rawDims) ? rawDims[0] : rawDims.x) : 60;
      const dimY = rawDims ? (Array.isArray(rawDims) ? rawDims[1] : rawDims.y) : 60;
      const dimZ = rawDims ? (Array.isArray(rawDims) ? rawDims[2] : rawDims.z) : 45;

      if (hasProj && scene) {
        mini3dState.triangles = buildMiniTrianglesFromScene(scene);
        mini3dState.maxExtent = Math.max(dimX || 50, dimY || 50, dimZ || 40, 35);
        mini3dState.centerZ = (dimZ || 40) * 0.45;
      } else {
        mini3dState.triangles = [];
      }

      const compactEl = document.getElementById('compact-3dprint');
      const subEl = document.getElementById('sub-3dprint');
      const fillEl = document.getElementById('mini-3d-progress-fill');
      const dotEl = document.getElementById('dot-3dprint');
      const ePrinter = document.getElementById('e3d-printer');
      const eLayer = document.getElementById('e3d-layer');
      const eDims = document.getElementById('e3d-dims');
      const eTemps = document.getElementById('e3d-temps');
      const btnToggle = document.getElementById('btn-mini-3d-toggle');

      const pct = Number(printer.progressPercent || 0);
      if (fillEl) fillEl.style.width = Math.max(0, Math.min(100, pct)) + '%';

      if (!hasProj) {
        if (compactEl) compactEl.textContent = 'Kein 3D-Projekt';
        if (subEl) subEl.textContent = 'Platzhalter aktiv · 0%';
        if (dotEl) {
          dotEl.style.background = '#94a3b8';
          dotEl.style.boxShadow = '0 0 8px rgba(148,163,184,0.5)';
        }
        if (eDims) eDims.textContent = 'Kein Objekt geladen';
        if (btnToggle) btnToggle.textContent = 'Projekt laden';
      } else {
        if (compactEl) compactEl.textContent = mini3dState.projectName || '3D Objekt';
        const isPrinting = printer.status === 'RUNNING' || printer.status === 'PREPARE';
        const statusLabel = isPrinting
          ? ('Druckt · ' + pct + '% (' + (printer.remainingMinutes || 0) + 'm)')
          : (rawDims
              ? (Math.round(dimX) + '×' + Math.round(dimY) + '×' + Math.round(dimZ) + 'mm · ' + (pct > 0 ? pct + '%' : 'Bereit'))
              : 'Bereit zum Druck');
        if (subEl) subEl.textContent = statusLabel;
        if (dotEl) {
          const c = isPrinting ? '#38bdf8' : '#00AE42';
          dotEl.style.background = c;
          dotEl.style.boxShadow = '0 0 10px ' + c;
        }
        if (eDims && rawDims) {
          const weightG = stats.filamentWeightG || stats.estimatedWeightGrams || 15;
          eDims.textContent = Math.round(dimX) + '×' + Math.round(dimY) + '×' + Math.round(dimZ) + 'mm · ' + weightG + 'g';
        }
        if (btnToggle) btnToggle.textContent = 'Platzhalter testen';
      }

      if (ePrinter) ePrinter.textContent = (printer.name || 'Bambu Lab P1S') + ' (' + (printer.status || 'IDLE') + ')';
      if (eLayer) eLayer.textContent = pct + '% (' + (printer.currentLayer || 0) + '/' + (printer.totalLayers || 0) + ')';
      if (eTemps) eTemps.textContent = Math.round(printer.nozzleTemp || 24) + '°C / ' + Math.round(printer.bedTemp || 24) + '°C';
    }

    function initMini3dCanvas() {
      const canvas = document.getElementById('mini-3d-canvas');
      if (!canvas) return;

      canvas.addEventListener('pointerdown', (e) => {
        e.stopPropagation();
        mini3dState.dragging = true;
        mini3dState.lastX = e.clientX;
        mini3dState.lastY = e.clientY;
        canvas.setPointerCapture(e.pointerId);
      });
      canvas.addEventListener('pointermove', (e) => {
        if (!mini3dState.dragging) return;
        e.stopPropagation();
        const dx = e.clientX - mini3dState.lastX;
        const dy = e.clientY - mini3dState.lastY;
        mini3dState.lastX = e.clientX;
        mini3dState.lastY = e.clientY;
        mini3dState.yaw += dx * 0.018;
        mini3dState.pitch = Math.max(-1.2, Math.min(1.2, mini3dState.pitch + dy * 0.018));
      });
      canvas.addEventListener('pointerup', (e) => {
        mini3dState.dragging = false;
        try { canvas.releasePointerCapture(e.pointerId); } catch {}
      });

      function renderLoop() {
        const ctx = canvas.getContext('2d');
        if (ctx) {
          const w = canvas.width;
          const h = canvas.height;
          ctx.clearRect(0, 0, w, h);

          if (!mini3dState.dragging) {
            mini3dState.yaw += 0.012;
          }

          const cy = Math.cos(mini3dState.yaw), sy = Math.sin(mini3dState.yaw);
          const cp = Math.cos(mini3dState.pitch), sp = Math.sin(mini3dState.pitch);

          function projectPt(pt, scale, zOff) {
            const x = pt[0], y = pt[1], z = pt[2] - zOff;
            const rx = x * cy - y * sy;
            const ry = x * sy + y * cy;
            const rz = z * cp - ry * sp;
            const ry2 = z * sp + ry * cp;
            const fov = 220 / (220 + ry2 * 0.6);
            return {
              x: w / 2 + rx * scale * fov,
              y: h / 2 - rz * scale * fov,
              depth: ry2
            };
          }

          if (!mini3dState.hasActiveProject || mini3dState.triangles.length === 0) {
            // PLACEHOLDER STATE: Dashed rotating wireframe cube + "Kein Projekt" badge
            const r = 20;
            const verts = [
              [-r, -r, 0], [r, -r, 0], [r, r, 0], [-r, r, 0],
              [-r, -r, r*1.6], [r, -r, r*1.6], [r, r, r*1.6], [-r, r, r*1.6]
            ].map(v => projectPt(v, 1.15, r * 0.8));
            const edges = [
              [0,1],[1,2],[2,3],[3,0],
              [4,5],[5,6],[6,7],[7,4],
              [0,4],[1,5],[2,6],[3,7]
            ];
            ctx.save();
            ctx.setLineDash([4, 4]);
            ctx.strokeStyle = 'rgba(148, 163, 184, 0.55)';
            ctx.lineWidth = 1.6;
            for (const [a, b] of edges) {
              ctx.beginPath();
              ctx.moveTo(verts[a].x, verts[a].y);
              ctx.lineTo(verts[b].x, verts[b].y);
              ctx.stroke();
            }
            ctx.restore();
            ctx.fillStyle = 'rgba(148, 163, 184, 0.85)';
            ctx.font = '600 15px Inter, sans-serif';
            ctx.textAlign = 'center';
            ctx.fillText('KEIN 3D OBJEKT', w / 2, h - 10);
          } else {
            // ACTIVE 3D OBJECT: Build plate grid + lit 3D mesh
            const scale = 68 / Math.max(30, mini3dState.maxExtent);
            const zOff = mini3dState.centerZ;

            // Mini build plate outline
            const plateR = mini3dState.maxExtent * 0.65;
            const pCorners = [
              [-plateR, -plateR, 0], [plateR, -plateR, 0],
              [plateR, plateR, 0], [-plateR, plateR, 0]
            ].map(v => projectPt(v, scale, zOff));
            ctx.beginPath();
            ctx.moveTo(pCorners[0].x, pCorners[0].y);
            for (let i = 1; i < 4; i++) ctx.lineTo(pCorners[i].x, pCorners[i].y);
            ctx.closePath();
            ctx.strokeStyle = 'rgba(0, 174, 66, 0.35)';
            ctx.lineWidth = 1.2;
            ctx.stroke();

            // Project & sort triangles
            const projected = [];
            for (const t of mini3dState.triangles) {
              const p0 = projectPt(t.v[0], scale, zOff);
              const p1 = projectPt(t.v[1], scale, zOff);
              const p2 = projectPt(t.v[2], scale, zOff);
              // Compute 3D normal for shading
              const ux = t.v[1][0] - t.v[0][0], uy = t.v[1][1] - t.v[0][1], uz = t.v[1][2] - t.v[0][2];
              const vx = t.v[2][0] - t.v[0][0], vy = t.v[2][1] - t.v[0][1], vz = t.v[2][2] - t.v[0][2];
              const nx = uy * vz - uz * vy;
              const ny = uz * vx - ux * vz;
              const nz = ux * vy - uy * vx;
              const nl = Math.hypot(nx, ny, nz) || 1;
              const light = Math.max(0.32, Math.min(1.12, 0.55 + ((nx / nl) * 0.35 + (nz / nl) * 0.45)));
              projected.push({
                p0, p1, p2,
                depth: (p0.depth + p1.depth + p2.depth) / 3,
                color: t.c,
                light
              });
            }
            projected.sort((a, b) => b.depth - a.depth);

            for (const tri of projected) {
              ctx.beginPath();
              ctx.moveTo(tri.p0.x, tri.p0.y);
              ctx.lineTo(tri.p1.x, tri.p1.y);
              ctx.lineTo(tri.p2.x, tri.p2.y);
              ctx.closePath();
              const hex = (tri.color || '#00AE42').replace('#', '');
              const r = Math.min(255, Math.round(parseInt(hex.substring(0, 2) || '00', 16) * tri.light));
              const g = Math.min(255, Math.round(parseInt(hex.substring(2, 4) || 'ae', 16) * tri.light));
              const b = Math.min(255, Math.round(parseInt(hex.substring(4, 6) || '42', 16) * tri.light));
              ctx.fillStyle = 'rgb(' + r + ',' + g + ',' + b + ')';
              ctx.fill();
              ctx.strokeStyle = 'rgba(4, 7, 17, 0.22)';
              ctx.lineWidth = 0.6;
              ctx.stroke();
            }
          }
        }
        requestAnimationFrame(renderLoop);
      }
      requestAnimationFrame(renderLoop);
    }

    async function submitMini3dPrompt(e) {
      e.preventDefault();
      e.stopPropagation();
      const input = document.getElementById('mini-3d-prompt');
      const btn = document.getElementById('mini-3d-prompt-btn');
      if (!input || !input.value.trim()) return;
      const prompt = input.value.trim();
      if (btn) btn.textContent = '...';
      try {
        const endpoint = mini3dState.hasActiveProject && mini3dState.activeProjectId
          ? base + '/api/apps/3d-print/projects/modify'
          : base + '/api/apps/3d-print/projects/generate';
        const res = await fetch(endpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ prompt, projectId: mini3dState.activeProjectId })
        });
        if (res.ok) {
          input.value = '';
          await refreshMini3dData();
        }
      } catch (err) {
        console.error('3D prompt failed:', err);
      } finally {
        if (btn) btn.textContent = 'KI';
      }
    }

    async function toggleMini3dPlaceholder() {
      try {
        const nextId = mini3dState.hasActiveProject ? null : 'preset-organic-apple';
        await fetch(base + '/api/apps/3d-print/projects/select', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ projectId: nextId })
        });
        await refreshMini3dData();
      } catch (err) {
        console.error('Failed toggling 3D placeholder:', err);
      }
    }

    async function triggerMini3dPrint() {
      try {
        await fetch(base + '/api/apps/3d-print/printer/print', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ projectId: mini3dState.activeProjectId })
        });
        await refreshMini3dData();
      } catch (err) {
        console.error('Failed starting 3D print:', err);
      }
    }

    window.openFullService = openFullService;
    window.closeFullService = closeFullService;
    window.submitMini3dPrompt = submitMini3dPrompt;
    window.toggleMini3dPlaceholder = toggleMini3dPlaceholder;
    window.triggerMini3dPrint = triggerMini3dPrint;

    window.addEventListener('resize', () => {
      renderSolarArcPaths();
      renderTimelineGeometry();
    });

    renderSolarArcPaths();
    initMini3dCanvas();
    tickClockAndTimeline();
    setInterval(tickClockAndTimeline, 1000);
    loadAllLiveData();
    setInterval(loadAllLiveData, 60000);
    setInterval(() => refreshMini3dData(), 5000);
    setInterval(loadRoomsQuickAccess, 12000);

    function checkHashFor3dPrint() {
      try {
        const h = (window.top ? window.top.location.hash : window.location.hash) || window.location.hash;
        if (h === '#3d-print') {
          openFullService('3d-print', '3D Druck Studio');
        }
      } catch (_e) {}
    }
    checkHashFor3dPrint();
    window.addEventListener('hashchange', checkHashFor3dPrint);
  </script>
</body>
</html>`;
}
