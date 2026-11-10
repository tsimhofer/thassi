/**
 * Canonical Thassi Design System (DESIGN.md — Swiss International Typographic Style / Linear / Braun)
 * Shared across the Home Command Center, Home Assistant Parent Chrome, and all 17 Thassi Apps.
 */

export const UNIFORM_DESIGN_TOKENS_CSS = `
  @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&family=JetBrains+Mono:wght@400;500;600&display=swap');

  :root {
    --bg-canvas: #09090b;
    --bg-elevated: #111113;
    --bg-input: #141417;
    --line-hairline: rgba(255, 255, 255, 0.06);
    --line-strong: rgba(255, 255, 255, 0.12);
    --line-focus: rgba(255, 255, 255, 0.22);
    --text-primary: #fafafa;
    --text-secondary: #a1a1aa;
    --text-muted: #52525b;
    --action-fg: #fafafa;
    --dot-ok: #10b981;
    --dot-warn: #f59e0b;
    --dot-err: #ef4444;
    --dot-idle: #52525b;
    --font-sans: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    --font-mono: 'JetBrains Mono', 'Fira Code', Consolas, monospace;
  }

  html, body {
    background-color: #09090b !important;
    color: #fafafa;
    font-family: var(--font-sans);
    -webkit-font-smoothing: antialiased;
    -moz-osx-font-smoothing: grayscale;
    color-scheme: dark;
  }

  ::-webkit-scrollbar {
    width: 6px;
    height: 6px;
  }
  ::-webkit-scrollbar-track {
    background: #09090b;
  }
  ::-webkit-scrollbar-thumb {
    background: #27272a;
    border-radius: 3px;
  }
  ::-webkit-scrollbar-thumb:hover {
    background: #3f3f46;
  }

  code, pre, kbd, samp, td, th, input[type="number"],
  .mono, [class*="mono"], [class*="kpi"], [class*="metric"], [class*="stat-v"], [class*="tabular"] {
    font-variant-numeric: tabular-nums;
  }

  /* Canonical Uniform Shell Primitives */
  .thassi-u-shell {
    min-height: 100vh;
    background: var(--bg-canvas);
    color: var(--text-primary);
    font-family: var(--font-sans);
    display: flex;
    flex-direction: column;
  }

  .thassi-u-header {
    min-height: 52px;
    padding: 0 32px;
    border-bottom: 1px solid var(--line-hairline);
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 16px;
    background: var(--bg-canvas);
    flex-wrap: wrap;
  }

  .thassi-u-header-left {
    display: flex;
    align-items: center;
    gap: 20px;
    min-width: 0;
  }

  .thassi-u-title {
    font-size: 18px;
    font-weight: 500;
    letter-spacing: -0.025em;
    color: var(--text-primary);
    margin: 0;
    white-space: nowrap;
  }

  .thassi-u-domain-code {
    font-family: var(--font-mono);
    font-size: 11px;
    font-weight: 500;
    letter-spacing: 0.06em;
    text-transform: uppercase;
    color: var(--text-muted);
    padding: 2px 6px;
    border: 1px solid var(--line-hairline);
    border-radius: 3px;
    background: var(--bg-elevated);
  }

  .thassi-u-tabs {
    display: flex;
    align-items: center;
    gap: 22px;
    height: 52px;
    overflow-x: auto;
    scrollbar-width: none;
  }
  .thassi-u-tabs::-webkit-scrollbar {
    display: none;
  }

  .thassi-u-tab {
    height: 52px;
    display: inline-flex;
    align-items: center;
    gap: 6px;
    background: transparent;
    border: none;
    border-bottom: 1px solid transparent;
    color: var(--text-muted);
    font-family: var(--font-sans);
    font-size: 12.5px;
    font-weight: 500;
    padding: 0 2px;
    cursor: pointer;
    white-space: nowrap;
    transition: color 0.15s ease, border-color 0.15s ease;
  }
  .thassi-u-tab:hover {
    color: var(--text-secondary);
  }
  .thassi-u-tab.active {
    color: var(--text-primary);
    border-bottom-color: var(--text-primary);
  }

  .thassi-u-freshness {
    display: flex;
    align-items: center;
    gap: 12px;
    font-family: var(--font-mono);
    font-size: 11.5px;
    color: var(--text-secondary);
    font-variant-numeric: tabular-nums;
    flex-wrap: wrap;
  }

  .thassi-u-dot {
    width: 6px;
    height: 6px;
    border-radius: 50%;
    display: inline-block;
    flex-shrink: 0;
  }
  .thassi-u-dot.ok { background: #10b981; }
  .thassi-u-dot.warn { background: #f59e0b; }
  .thassi-u-dot.err { background: #ef4444; }
  .thassi-u-dot.idle { background: #52525b; }

  .thassi-u-kpi-strip {
    display: grid;
    grid-template-columns: repeat(4, minmax(0, 1fr));
    border-bottom: 1px solid var(--line-hairline);
    background: var(--bg-canvas);
  }

  .thassi-u-kpi-cell {
    padding: 14px 32px;
    border-right: 1px solid var(--line-hairline);
    display: flex;
    flex-direction: column;
    justify-content: center;
    gap: 4px;
    min-width: 0;
  }
  .thassi-u-kpi-cell:last-child {
    border-right: none;
  }

  .thassi-u-kpi-label {
    font-size: 11px;
    font-weight: 500;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: var(--text-muted);
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
  }

  .thassi-u-kpi-value {
    font-family: var(--font-mono);
    font-size: 24px;
    font-weight: 400;
    letter-spacing: -0.03em;
    color: var(--text-primary);
    font-variant-numeric: tabular-nums;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .thassi-u-kpi-sub {
    font-size: 12px;
    color: var(--text-secondary);
    font-variant-numeric: tabular-nums;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .thassi-u-btn-primary {
    background: #fafafa;
    color: #09090b;
    font-family: var(--font-sans);
    font-size: 12px;
    font-weight: 500;
    padding: 6px 12px;
    border-radius: 4px;
    border: none;
    cursor: pointer;
    display: inline-flex;
    align-items: center;
    gap: 6px;
    white-space: nowrap;
  }
  .thassi-u-btn-primary:hover {
    background: #e4e4e7;
  }

  .thassi-u-btn-ghost {
    background: transparent;
    color: var(--text-secondary);
    font-family: var(--font-sans);
    font-size: 12px;
    font-weight: 500;
    padding: 5px 10px;
    border-radius: 4px;
    border: 1px solid var(--line-hairline);
    cursor: pointer;
    display: inline-flex;
    align-items: center;
    gap: 6px;
    white-space: nowrap;
    transition: color 0.15s ease, border-color 0.15s ease, background 0.15s ease;
  }
  .thassi-u-btn-ghost:hover {
    color: var(--text-primary);
    border-color: var(--line-focus);
    background: var(--bg-elevated);
  }

  .thassi-u-input {
    background: var(--bg-input);
    border: 1px solid var(--line-hairline);
    border-radius: 4px;
    padding: 6px 10px;
    color: var(--text-primary);
    font-family: var(--font-mono);
    font-size: 12.5px;
    outline: none;
  }
  .thassi-u-input:focus {
    border-color: var(--line-focus);
  }

  @media (max-width: 960px) {
    .thassi-u-header {
      padding: 8px 16px;
    }
    .thassi-u-kpi-strip {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }
    .thassi-u-kpi-cell {
      padding: 12px 16px;
      border-bottom: 1px solid var(--line-hairline);
    }
  }
`;

export function getUniformAppStylesheetTag(): string {
  return `<style id="thassi-uniform-design-system">${UNIFORM_DESIGN_TOKENS_CSS}</style>`;
}
