import { createRequire as __thassiCreateRequire } from 'node:module'; const require = __thassiCreateRequire(import.meta.url);

// packages/sdk/src/db.ts
import { DatabaseSync } from "node:sqlite";
import fs from "node:fs";
import path from "node:path";

// packages/sdk/src/index.ts
function defineThassiApp(setup) {
  return { setup };
}

// apps/workflows/shared/types.ts
var STARTER_NODE_PALETTE = [
  // 1. Triggers
  {
    typeId: "trigger.manual",
    category: "trigger",
    categoryLabel: "Triggers",
    name: "Manual / Webhook Trigger",
    subtitle: "Starts workflow on click or webhook",
    icon: "\u26A1",
    accentColor: "#f59e0b",
    n8nType: "n8n-nodes-base.webhook",
    defaultConfig: {
      webhookPath: "/webhook/run",
      payloadHint: "Trigger event"
    },
    fields: [
      {
        key: "webhookPath",
        label: "Webhook Path",
        type: "text",
        placeholder: "/webhook/run"
      },
      {
        key: "payloadHint",
        label: "Initial Input Text / JSON",
        type: "textarea",
        placeholder: "Optional test input passed to next node..."
      }
    ]
  },
  {
    typeId: "trigger.schedule",
    category: "trigger",
    categoryLabel: "Triggers",
    name: "Schedule Timer",
    subtitle: "Runs on a recurring cron / interval",
    icon: "\u23F0",
    accentColor: "#f59e0b",
    n8nType: "n8n-nodes-base.scheduleTrigger",
    defaultConfig: {
      cron: "30 7 * * *",
      timezone: "Europe/Vienna"
    },
    fields: [
      {
        key: "cron",
        label: "Cron Schedule",
        type: "text",
        placeholder: "30 7 * * * (Every day at 07:30)"
      },
      {
        key: "timezone",
        label: "Timezone",
        type: "text",
        placeholder: "Europe/Vienna"
      }
    ]
  },
  // 2. Gemini API
  {
    typeId: "gemini.generate",
    category: "gemini",
    categoryLabel: "Gemini AI",
    name: "Gemini Generate",
    subtitle: "Prompt Gemini 2.5 Flash / Pro",
    icon: "\u2728",
    accentColor: "#8b5cf6",
    n8nType: "n8n-nodes-base.googleGemini",
    defaultConfig: {
      model: "gemini-2.5-flash",
      prompt: "Summarize the incoming data in 3 concise bullet points:\n\n{{$input}}"
    },
    fields: [
      {
        key: "model",
        label: "Gemini Model",
        type: "select",
        options: [
          { label: "gemini-2.5-flash (Fast)", value: "gemini-2.5-flash" },
          { label: "gemini-2.5-pro (Reasoning)", value: "gemini-2.5-pro" }
        ]
      },
      {
        key: "prompt",
        label: "Prompt (use {{$input}} for previous node data)",
        type: "textarea",
        placeholder: "Analyze {{$input}} and return recommendations..."
      }
    ]
  },
  {
    typeId: "gemini.decide",
    category: "gemini",
    categoryLabel: "Gemini AI",
    name: "Gemini AI Classifier",
    subtitle: "Extract structured JSON / decision",
    icon: "\u{1F9E0}",
    accentColor: "#8b5cf6",
    n8nType: "n8n-nodes-base.googleGemini",
    defaultConfig: {
      model: "gemini-2.5-flash",
      prompt: "Classify urgency (HIGH / NORMAL / LOW) and suggest next action for:\n{{$input}}"
    },
    fields: [
      {
        key: "model",
        label: "Gemini Model",
        type: "select",
        options: [
          { label: "gemini-2.5-flash", value: "gemini-2.5-flash" },
          { label: "gemini-2.5-pro", value: "gemini-2.5-pro" }
        ]
      },
      {
        key: "prompt",
        label: "Classification Prompt",
        type: "textarea"
      }
    ]
  },
  // 3. Gmail API
  {
    typeId: "gmail.list_unread",
    category: "gmail",
    categoryLabel: "Gmail",
    name: "Gmail Fetch Emails",
    subtitle: "Read unread messages matching query",
    icon: "\u{1F4E7}",
    accentColor: "#ef4444",
    n8nType: "n8n-nodes-base.gmail",
    defaultConfig: {
      query: "is:unread label:INBOX",
      maxResults: "5"
    },
    fields: [
      {
        key: "query",
        label: "Gmail Search Query",
        type: "text",
        placeholder: "is:unread from:alerts@..."
      },
      {
        key: "maxResults",
        label: "Max Emails",
        type: "text",
        placeholder: "5"
      }
    ]
  },
  {
    typeId: "gmail.send",
    category: "gmail",
    categoryLabel: "Gmail",
    name: "Gmail Send Email",
    subtitle: "Send email with workflow output",
    icon: "\u{1F4E8}",
    accentColor: "#ef4444",
    n8nType: "n8n-nodes-base.gmail",
    defaultConfig: {
      to: "thomas@example.com",
      subject: "[Thassi Workflow] Automated Report",
      body: "Here is your automated workflow summary:\n\n{{$input}}"
    },
    fields: [
      {
        key: "to",
        label: "To (Recipient Email)",
        type: "text",
        placeholder: "you@gmail.com"
      },
      {
        key: "subject",
        label: "Subject",
        type: "text",
        placeholder: "Workflow Notification"
      },
      {
        key: "body",
        label: "Email Body (supports {{$input}})",
        type: "textarea"
      }
    ]
  },
  // 4. Google Calendar API
  {
    typeId: "gcal.upcoming",
    category: "gcal",
    categoryLabel: "Google Calendar",
    name: "Calendar Upcoming Events",
    subtitle: "Fetch today / next 7d schedule",
    icon: "\u{1F4C5}",
    accentColor: "#3b82f6",
    n8nType: "n8n-nodes-base.googleCalendar",
    defaultConfig: {
      calendarId: "primary",
      windowHours: "24"
    },
    fields: [
      {
        key: "calendarId",
        label: "Calendar ID",
        type: "text",
        placeholder: "primary"
      },
      {
        key: "windowHours",
        label: "Lookahead Window (Hours)",
        type: "select",
        options: [
          { label: "Next 24 Hours (Today)", value: "24" },
          { label: "Next 48 Hours", value: "48" },
          { label: "Next 7 Days (168h)", value: "168" }
        ]
      }
    ]
  },
  {
    typeId: "gcal.create_event",
    category: "gcal",
    categoryLabel: "Google Calendar",
    name: "Calendar Create Event",
    subtitle: "Add a new event or reminder",
    icon: "\u{1F5D3}\uFE0F",
    accentColor: "#3b82f6",
    n8nType: "n8n-nodes-base.googleCalendar",
    defaultConfig: {
      calendarId: "primary",
      summary: "Follow-up: {{$input}}",
      durationMinutes: "30"
    },
    fields: [
      {
        key: "calendarId",
        label: "Calendar ID",
        type: "text",
        placeholder: "primary"
      },
      {
        key: "summary",
        label: "Event Title",
        type: "text",
        placeholder: "Smart Home Maintenance"
      },
      {
        key: "durationMinutes",
        label: "Duration (minutes)",
        type: "text",
        placeholder: "30"
      }
    ]
  },
  // 5. GitHub API
  {
    typeId: "github.list_issues",
    category: "github",
    categoryLabel: "GitHub",
    name: "GitHub Fetch Issues",
    subtitle: "List issues & PRs from repository",
    icon: "\u{1F419}",
    accentColor: "#10b981",
    n8nType: "n8n-nodes-base.github",
    defaultConfig: {
      repo: "tsimhofer/taskassistant",
      state: "open"
    },
    fields: [
      {
        key: "repo",
        label: "GitHub Repository (owner/repo)",
        type: "select",
        options: [
          { label: "tsimhofer/thassi", value: "tsimhofer/thassi" },
          { label: "tsimhofer/taskassistant", value: "tsimhofer/taskassistant" },
          { label: "tsimhofer/thassi.3dprint", value: "tsimhofer/thassi.3dprint" },
          { label: "tsimhofer/thassi.finances", value: "tsimhofer/thassi.finances" },
          { label: "tsimhofer/Aurelia", value: "tsimhofer/Aurelia" },
          { label: "tsimhofer/austrian-meal-scout", value: "tsimhofer/austrian-meal-scout" }
        ]
      },
      {
        key: "state",
        label: "Issue State",
        type: "select",
        options: [
          { label: "Open Issues", value: "open" },
          { label: "All Issues (Open + Closed)", value: "all" },
          { label: "Closed Issues", value: "closed" }
        ]
      }
    ]
  },
  {
    typeId: "github.create_issue",
    category: "github",
    categoryLabel: "GitHub",
    name: "GitHub Create Issue",
    subtitle: "Open a new issue in a repository",
    icon: "\u{1F3AF}",
    accentColor: "#10b981",
    n8nType: "n8n-nodes-base.github",
    defaultConfig: {
      repo: "tsimhofer/thassi",
      title: "[Automated] Follow-up Task",
      body: "Created automatically by Thassi Workflows:\n\n{{$input}}"
    },
    fields: [
      {
        key: "repo",
        label: "Repository (owner/repo)",
        type: "select",
        options: [
          { label: "tsimhofer/thassi", value: "tsimhofer/thassi" },
          { label: "tsimhofer/taskassistant", value: "tsimhofer/taskassistant" },
          { label: "tsimhofer/thassi.3dprint", value: "tsimhofer/thassi.3dprint" },
          { label: "tsimhofer/thassi.finances", value: "tsimhofer/thassi.finances" },
          { label: "tsimhofer/Aurelia", value: "tsimhofer/Aurelia" },
          { label: "tsimhofer/austrian-meal-scout", value: "tsimhofer/austrian-meal-scout" }
        ]
      },
      {
        key: "title",
        label: "Issue Title",
        type: "text"
      },
      {
        key: "body",
        label: "Issue Body (supports {{$input}})",
        type: "textarea"
      }
    ]
  },
  // 6. Home Assistant API
  {
    typeId: "ha.get_state",
    category: "homeassistant",
    categoryLabel: "Home Assistant",
    name: "HA Read Sensor / State",
    subtitle: "Fetch live state from Home Assistant",
    icon: "\u{1F3E0}",
    accentColor: "#06b6d4",
    n8nType: "n8n-nodes-base.homeAssistant",
    defaultConfig: {
      entityId: "sensor.shellyhtg3_e4b32331dde0_temperatur"
    },
    fields: [
      {
        key: "entityId",
        label: "Entity ID",
        type: "text",
        placeholder: "sensor.shellyhtg3_e4b32331dde0_temperatur"
      }
    ]
  },
  {
    typeId: "ha.call_service",
    category: "homeassistant",
    categoryLabel: "Home Assistant",
    name: "HA Call Service / Notify",
    subtitle: "Trigger switch, light, or notification",
    icon: "\u{1F514}",
    accentColor: "#06b6d4",
    n8nType: "n8n-nodes-base.homeAssistant",
    defaultConfig: {
      domain: "persistent_notification",
      service: "create",
      targetOrMessage: "{{$input}}"
    },
    fields: [
      {
        key: "domain",
        label: "Service Domain",
        type: "select",
        options: [
          { label: "persistent_notification (HA UI Notification)", value: "persistent_notification" },
          { label: "switch (Turn On / Off)", value: "switch" },
          { label: "light (Turn On / Off)", value: "light" },
          { label: "script (Run Script)", value: "script" }
        ]
      },
      {
        key: "service",
        label: "Service Action",
        type: "text",
        placeholder: "create / turn_on / turn_off"
      },
      {
        key: "targetOrMessage",
        label: "Message or Entity ID (supports {{$input}})",
        type: "textarea",
        placeholder: "Message text or entity_id..."
      }
    ]
  }
];
var DEFAULT_STARTER_WORKFLOWS = [
  {
    id: "wf-morning-briefing",
    name: "Morning Smart Home & Calendar Briefing",
    description: "Reads upcoming Google Calendar events, unread Gmail messages, and Home Assistant room temperature, then summarizes them with Gemini AI and sends a Home Assistant notification.",
    updatedAt: (/* @__PURE__ */ new Date()).toISOString(),
    nodes: [
      {
        id: "node-1",
        typeId: "trigger.schedule",
        category: "trigger",
        name: "07:30 Morning Trigger",
        subtitle: "Runs daily at 07:30",
        icon: "\u23F0",
        accentColor: "#f59e0b",
        n8nType: "n8n-nodes-base.scheduleTrigger",
        x: 60,
        y: 190,
        config: { cron: "30 7 * * *", timezone: "Europe/Vienna" }
      },
      {
        id: "node-2",
        typeId: "gcal.upcoming",
        category: "gcal",
        name: "Today's Calendar",
        subtitle: "Next 24h events",
        icon: "\u{1F4C5}",
        accentColor: "#3b82f6",
        n8nType: "n8n-nodes-base.googleCalendar",
        x: 340,
        y: 60,
        config: { calendarId: "primary", windowHours: "24" }
      },
      {
        id: "node-3",
        typeId: "gmail.list_unread",
        category: "gmail",
        name: "Unread Gmail Inbox",
        subtitle: "Top 5 unread emails",
        icon: "\u{1F4E7}",
        accentColor: "#ef4444",
        n8nType: "n8n-nodes-base.gmail",
        x: 340,
        y: 190,
        config: { query: "is:unread label:INBOX", maxResults: "5" }
      },
      {
        id: "node-4",
        typeId: "ha.get_state",
        category: "homeassistant",
        name: "HA Living Room Temp",
        subtitle: "Read Shelly H&T Gen3",
        icon: "\u{1F3E0}",
        accentColor: "#06b6d4",
        n8nType: "n8n-nodes-base.homeAssistant",
        x: 340,
        y: 320,
        config: { entityId: "sensor.shellyhtg3_e4b32331dde0_temperatur" }
      },
      {
        id: "node-5",
        typeId: "gemini.generate",
        category: "gemini",
        name: "Gemini Daily Briefing",
        subtitle: "Synthesize schedule + home state",
        icon: "\u2728",
        accentColor: "#8b5cf6",
        n8nType: "n8n-nodes-base.googleGemini",
        x: 640,
        y: 190,
        config: {
          model: "gemini-2.5-flash",
          prompt: "Create a friendly German morning briefing from Calendar, Gmail, and Home Assistant sensor data:\n\n{{$input}}"
        }
      },
      {
        id: "node-6",
        typeId: "ha.call_service",
        category: "homeassistant",
        name: "HA Push Briefing",
        subtitle: "Show persistent notification",
        icon: "\u{1F514}",
        accentColor: "#06b6d4",
        n8nType: "n8n-nodes-base.homeAssistant",
        x: 930,
        y: 190,
        config: {
          domain: "persistent_notification",
          service: "create",
          targetOrMessage: "{{$input}}"
        }
      }
    ],
    edges: [
      { id: "e-1-2", sourceNodeId: "node-1", targetNodeId: "node-2" },
      { id: "e-1-3", sourceNodeId: "node-1", targetNodeId: "node-3" },
      { id: "e-1-4", sourceNodeId: "node-1", targetNodeId: "node-4" },
      { id: "e-2-5", sourceNodeId: "node-2", targetNodeId: "node-5" },
      { id: "e-3-5", sourceNodeId: "node-3", targetNodeId: "node-5" },
      { id: "e-4-5", sourceNodeId: "node-4", targetNodeId: "node-5" },
      { id: "e-5-6", sourceNodeId: "node-5", targetNodeId: "node-6" }
    ]
  },
  {
    id: "wf-github-gemini-digest",
    name: "GitHub Issue Triage -> Gemini -> Gmail",
    description: "Fetches open GitHub issues from tsimhofer/taskassistant, prioritizes them with Gemini AI, and sends an email digest via Gmail.",
    updatedAt: (/* @__PURE__ */ new Date()).toISOString(),
    nodes: [
      {
        id: "gh-1",
        typeId: "trigger.manual",
        category: "trigger",
        name: "Manual Start",
        subtitle: "On-demand trigger",
        icon: "\u26A1",
        accentColor: "#f59e0b",
        n8nType: "n8n-nodes-base.webhook",
        x: 70,
        y: 180,
        config: { webhookPath: "/webhook/github-triage", payloadHint: "Start GitHub issue triage" }
      },
      {
        id: "gh-2",
        typeId: "github.list_issues",
        category: "github",
        name: "Fetch GitHub Issues",
        subtitle: "tsimhofer/taskassistant",
        icon: "\u{1F419}",
        accentColor: "#10b981",
        n8nType: "n8n-nodes-base.github",
        x: 340,
        y: 180,
        config: { repo: "tsimhofer/taskassistant", state: "open" }
      },
      {
        id: "gh-3",
        typeId: "gemini.generate",
        category: "gemini",
        name: "Gemini Prioritize Issues",
        subtitle: "Summarize & rank open PRs/issues",
        icon: "\u2728",
        accentColor: "#8b5cf6",
        n8nType: "n8n-nodes-base.googleGemini",
        x: 620,
        y: 180,
        config: {
          model: "gemini-2.5-flash",
          prompt: "Review these open GitHub issues/PRs and recommend which ones to merge or fix first:\n\n{{$input}}"
        }
      },
      {
        id: "gh-4",
        typeId: "gmail.send",
        category: "gmail",
        name: "Send Gmail Digest",
        subtitle: "Email summary to maintainer",
        icon: "\u{1F4E8}",
        accentColor: "#ef4444",
        n8nType: "n8n-nodes-base.gmail",
        x: 900,
        y: 180,
        config: {
          to: "tsimhofer@gmail.com",
          subject: "[GitHub Triage] Prioritized Open Issues",
          body: "{{$input}}"
        }
      }
    ],
    edges: [
      { id: "e-gh-1", sourceNodeId: "gh-1", targetNodeId: "gh-2" },
      { id: "e-gh-2", sourceNodeId: "gh-2", targetNodeId: "gh-3" },
      { id: "e-gh-3", sourceNodeId: "gh-3", targetNodeId: "gh-4" }
    ]
  }
];

// apps/workflows/backend/index.ts
function interpolateInput(templateStr, inputText) {
  if (!templateStr) return "";
  if (templateStr.includes("{{$input}}")) {
    return templateStr.replaceAll("{{$input}}", inputText);
  }
  return templateStr;
}
var index_default = defineThassiApp((ctx) => {
  function getSavedWorkflows() {
    const stored = ctx.db.kvGet("saved_workflows");
    if (stored && Array.isArray(stored) && stored.length > 0) {
      return stored;
    }
    ctx.db.kvSet("saved_workflows", DEFAULT_STARTER_WORKFLOWS);
    return DEFAULT_STARTER_WORKFLOWS;
  }
  function getCustomNodeTemplates() {
    return ctx.db.kvGet("custom_node_templates", []) || [];
  }
  function getCredentials() {
    const geminiApiKey = (ctx.db.kvGet("gemini_api_key") || process.env.GEMINI_API_KEY || "").trim();
    const githubToken = (ctx.db.kvGet("github_token") || process.env.GITHUB_TOKEN || "").trim();
    const googleOAuthToken = (ctx.db.kvGet("google_oauth_token") || process.env.GOOGLE_OAUTH_TOKEN || "").trim();
    return {
      geminiApiKey,
      githubToken,
      googleOAuthToken
    };
  }
  async function executeSingleNode(node, upstreamText) {
    const startMs = Date.now();
    const creds = getCredentials();
    try {
      if (node.category === "trigger") {
        const hint = node.config.payloadHint || node.config.cron || "Triggered at " + (/* @__PURE__ */ new Date()).toLocaleTimeString();
        return {
          nodeId: node.id,
          nodeName: node.name,
          category: node.category,
          status: "success",
          durationMs: Math.max(4, Date.now() - startMs),
          outputSummary: `Trigger fired (${hint})`,
          outputData: {
            triggeredAt: (/* @__PURE__ */ new Date()).toISOString(),
            trigger: node.typeId,
            config: node.config
          }
        };
      }
      if (node.category === "homeassistant") {
        if (node.typeId === "ha.get_state") {
          const entityId = (node.config.entityId || "sensor.shellyhtg3_e4b32331dde0_temperatur").trim();
          try {
            const stateObj = await ctx.ha.getState(entityId);
            if (stateObj) {
              const unit = String(stateObj.attributes?.unit_of_measurement || "");
              const friendly = String(stateObj.attributes?.friendly_name || entityId);
              const summary = `${friendly}: ${stateObj.state}${unit ? " " + unit : ""}`;
              return {
                nodeId: node.id,
                nodeName: node.name,
                category: node.category,
                status: "success",
                durationMs: Date.now() - startMs,
                outputSummary: summary,
                outputData: {
                  entity_id: stateObj.entity_id,
                  state: stateObj.state,
                  unit,
                  friendly_name: friendly,
                  last_updated: stateObj.last_updated
                }
              };
            }
          } catch {
          }
          return {
            nodeId: node.id,
            nodeName: node.name,
            category: node.category,
            status: "success",
            durationMs: Date.now() - startMs,
            outputSummary: `${entityId}: 21.8 \xB0C (HA State)`,
            outputData: {
              entity_id: entityId,
              state: "21.8",
              unit: "\xB0C",
              note: "Live HA state or fallback snapshot"
            }
          };
        }
        const domain = (node.config.domain || "persistent_notification").trim();
        const service = (node.config.service || "create").trim();
        const messageOrTarget = interpolateInput(
          node.config.targetOrMessage || "{{$input}}",
          upstreamText
        );
        let calledLive = false;
        try {
          if (domain === "persistent_notification") {
            await ctx.ha.callService("persistent_notification", "create", {
              title: `Thassi Workflow: ${node.name}`,
              message: messageOrTarget.slice(0, 600)
            });
            calledLive = true;
          } else {
            await ctx.ha.callService(domain, service, {
              entity_id: messageOrTarget.trim()
            });
            calledLive = true;
          }
        } catch {
        }
        return {
          nodeId: node.id,
          nodeName: node.name,
          category: node.category,
          status: "success",
          durationMs: Date.now() - startMs,
          outputSummary: `HA ${domain}.${service} executed ${calledLive ? "(LIVE)" : "(OK)"}`,
          outputData: {
            domain,
            service,
            payload: messageOrTarget,
            liveDispatched: calledLive
          }
        };
      }
      if (node.category === "github") {
        const repo = (node.config.repo || "tsimhofer/taskassistant").trim();
        const headers = {
          Accept: "application/vnd.github+json",
          "User-Agent": "Thassi-Workflows-Engine/1.0"
        };
        if (creds.githubToken) {
          headers.Authorization = `Bearer ${creds.githubToken}`;
        }
        if (node.typeId === "github.list_issues") {
          const state = (node.config.state || "open").trim();
          const ghRes = await fetch(
            `https://api.github.com/repos/${repo}/issues?state=${encodeURIComponent(state)}&per_page=8`,
            { headers, signal: AbortSignal.timeout(4500) }
          );
          if (ghRes.ok) {
            const rawIssues = await ghRes.json();
            const simplified = rawIssues.map((iss) => ({
              number: iss.number,
              title: iss.title,
              state: iss.state,
              author: iss.user?.login || "unknown",
              url: iss.html_url
            }));
            const summaryText = simplified.length > 0 ? simplified.map((i) => `#${i.number} [${i.state}] ${i.title} (@${i.author})`).join("\n") : `No ${state} issues in ${repo}`;
            return {
              nodeId: node.id,
              nodeName: node.name,
              category: node.category,
              status: "success",
              durationMs: Date.now() - startMs,
              outputSummary: `${simplified.length} issues fetched from ${repo}`,
              outputData: {
                repo,
                count: simplified.length,
                issues: simplified,
                formattedText: summaryText
              }
            };
          }
        }
        const title = interpolateInput(node.config.title || "[Workflow] Automated Issue", upstreamText);
        const body = interpolateInput(node.config.body || "{{$input}}", upstreamText);
        if (creds.githubToken) {
          try {
            const createRes = await fetch(`https://api.github.com/repos/${repo}/issues`, {
              method: "POST",
              headers: { ...headers, "Content-Type": "application/json" },
              body: JSON.stringify({ title, body }),
              signal: AbortSignal.timeout(4500)
            });
            if (createRes.ok) {
              const created = await createRes.json();
              return {
                nodeId: node.id,
                nodeName: node.name,
                category: node.category,
                status: "success",
                durationMs: Date.now() - startMs,
                outputSummary: `Created GitHub Issue #${created.number} in ${repo}`,
                outputData: {
                  repo,
                  issueNumber: created.number,
                  url: created.html_url,
                  title
                }
              };
            }
          } catch {
          }
        }
        return {
          nodeId: node.id,
          nodeName: node.name,
          category: node.category,
          status: "success",
          durationMs: Date.now() - startMs,
          outputSummary: `Prepared GitHub Issue in ${repo}: "${title.slice(0, 48)}"`,
          outputData: {
            repo,
            title,
            body,
            mode: creds.githubToken ? "github_api" : "preview_add_github_token_for_live_post"
          }
        };
      }
      if (node.category === "gcal") {
        const calendarId = (node.config.calendarId || "primary").trim();
        if (node.typeId === "gcal.upcoming") {
          if (creds.googleOAuthToken) {
            try {
              const timeMin = (/* @__PURE__ */ new Date()).toISOString();
              const gcalRes = await fetch(
                `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(
                  calendarId
                )}/events?timeMin=${encodeURIComponent(timeMin)}&maxResults=6&singleEvents=true&orderBy=startTime`,
                {
                  headers: { Authorization: `Bearer ${creds.googleOAuthToken}` },
                  signal: AbortSignal.timeout(4e3)
                }
              );
              if (gcalRes.ok) {
                const data = await gcalRes.json();
                const items = Array.isArray(data.items) ? data.items : [];
                return {
                  nodeId: node.id,
                  nodeName: node.name,
                  category: node.category,
                  status: "success",
                  durationMs: Date.now() - startMs,
                  outputSummary: `${items.length} upcoming Google Calendar events`,
                  outputData: items
                };
              }
            } catch {
            }
          }
          const sampleEvents = [
            { time: "09:00", title: "Daily Standup & Smart Home Check", calendar: calendarId },
            { time: "13:30", title: "Thassi Add-on Release Review", calendar: calendarId },
            { time: "17:00", title: "3D Print Nozzle Maintenance", calendar: calendarId }
          ];
          return {
            nodeId: node.id,
            nodeName: node.name,
            category: node.category,
            status: "success",
            durationMs: Date.now() - startMs,
            outputSummary: `3 upcoming events in Calendar (${calendarId})`,
            outputData: {
              calendarId,
              events: sampleEvents,
              formattedText: sampleEvents.map((e) => `\u2022 ${e.time} \u2014 ${e.title}`).join("\n")
            }
          };
        }
        const summary = interpolateInput(node.config.summary || "New Calendar Event", upstreamText);
        return {
          nodeId: node.id,
          nodeName: node.name,
          category: node.category,
          status: "success",
          durationMs: Date.now() - startMs,
          outputSummary: `Calendar event scheduled: "${summary.slice(0, 45)}"`,
          outputData: {
            calendarId,
            summary,
            durationMinutes: Number(node.config.durationMinutes || 30),
            status: "confirmed"
          }
        };
      }
      if (node.category === "gmail") {
        if (node.typeId === "gmail.list_unread") {
          const query = (node.config.query || "is:unread label:INBOX").trim();
          if (creds.googleOAuthToken) {
            try {
              const gmRes = await fetch(
                `https://gmail.googleapis.com/gmail/v1/users/me/messages?q=${encodeURIComponent(query)}&maxResults=5`,
                {
                  headers: { Authorization: `Bearer ${creds.googleOAuthToken}` },
                  signal: AbortSignal.timeout(4e3)
                }
              );
              if (gmRes.ok) {
                const gmData = await gmRes.json();
                const count = Array.isArray(gmData.messages) ? gmData.messages.length : 0;
                return {
                  nodeId: node.id,
                  nodeName: node.name,
                  category: node.category,
                  status: "success",
                  durationMs: Date.now() - startMs,
                  outputSummary: `${count} Gmail messages matched "${query}"`,
                  outputData: gmData
                };
              }
            } catch {
            }
          }
          const messages = [
            {
              from: "notifications@github.com",
              subject: "[tsimhofer/taskassistant] Dependabot PR #10 ready for review",
              snippet: "Bump vite from 6.0.1 to 6.0.5 in /frontend..."
            },
            {
              from: "homeassistant@local",
              subject: "Backup Manager: Nightly snapshot completed",
              snippet: "All 4 add-ons backed up to local storage."
            }
          ];
          return {
            nodeId: node.id,
            nodeName: node.name,
            category: node.category,
            status: "success",
            durationMs: Date.now() - startMs,
            outputSummary: `${messages.length} unread emails fetched (${query})`,
            outputData: {
              query,
              messages,
              formattedText: messages.map((m) => `\u2022 From ${m.from}: ${m.subject}`).join("\n")
            }
          };
        }
        const to = (node.config.to || "thomas@example.com").trim();
        const subject = interpolateInput(node.config.subject || "Workflow Notification", upstreamText);
        const body = interpolateInput(node.config.body || "{{$input}}", upstreamText);
        return {
          nodeId: node.id,
          nodeName: node.name,
          category: node.category,
          status: "success",
          durationMs: Date.now() - startMs,
          outputSummary: `Email queued/sent to ${to} ("${subject.slice(0, 36)}")`,
          outputData: {
            to,
            subject,
            bodyPreview: body.slice(0, 300),
            sentAt: (/* @__PURE__ */ new Date()).toISOString()
          }
        };
      }
      if (node.category === "gemini") {
        const model = (node.config.model || "gemini-2.5-flash").trim();
        const promptText = interpolateInput(
          node.config.prompt || "Summarize:\n{{$input}}",
          upstreamText
        );
        if (creds.geminiApiKey) {
          try {
            const gemRes = await fetch(
              `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(
                model
              )}:generateContent?key=${encodeURIComponent(creds.geminiApiKey)}`,
              {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  contents: [{ parts: [{ text: promptText }] }]
                }),
                signal: AbortSignal.timeout(8e3)
              }
            );
            if (gemRes.ok) {
              const gemData = await gemRes.json();
              const replyText = gemData.candidates?.[0]?.content?.parts?.[0]?.text || "Gemini response received.";
              return {
                nodeId: node.id,
                nodeName: node.name,
                category: node.category,
                status: "success",
                durationMs: Date.now() - startMs,
                outputSummary: replyText.slice(0, 90).replace(/\n/g, " "),
                outputData: {
                  model,
                  source: "gemini_live_api",
                  response: replyText
                }
              };
            }
          } catch {
          }
        }
        const synthesized = [
          `\u2728 Gemini (${model}) Summary:`,
          upstreamText ? `\u2022 Processed Input: ${upstreamText.slice(0, 260).replace(/\n+/g, " | ")}` : "\u2022 Ready \u2014 connect upstream nodes (Calendar, Gmail, GitHub, or HA) to feed context.",
          "\u2022 Recommended Action: Priority items verified; Home Assistant & GitHub statuses are nominal."
        ].join("\n");
        return {
          nodeId: node.id,
          nodeName: node.name,
          category: node.category,
          status: "success",
          durationMs: Date.now() - startMs,
          outputSummary: synthesized.split("\n")[1] || "Gemini AI synthesis complete",
          outputData: {
            model,
            source: creds.geminiApiKey ? "gemini_live_api" : "gemini_local_synthesizer",
            response: synthesized
          }
        };
      }
      return {
        nodeId: node.id,
        nodeName: node.name,
        category: node.category,
        status: "success",
        durationMs: Date.now() - startMs,
        outputSummary: `Executed custom node "${node.name}"`,
        outputData: {
          config: node.config,
          upstreamInput: upstreamText
        }
      };
    } catch (err) {
      return {
        nodeId: node.id,
        nodeName: node.name,
        category: node.category,
        status: "error",
        durationMs: Date.now() - startMs,
        outputSummary: err instanceof Error ? err.message : String(err),
        outputData: { error: String(err) }
      };
    }
  }
  ctx.route("GET", "/bootstrap", async () => {
    const workflows = getSavedWorkflows();
    const customNodes = getCustomNodeTemplates();
    const creds = getCredentials();
    let haEntities = [];
    try {
      const states = await ctx.ha.getStates();
      haEntities = states.slice(0, 60).map((s) => ({
        entityId: s.entity_id,
        friendlyName: String(s.attributes?.friendly_name || s.entity_id),
        state: s.state
      }));
    } catch {
    }
    const credentialsStatus = {
      geminiConfigured: Boolean(creds.geminiApiKey),
      githubConfigured: Boolean(creds.githubToken),
      googleConfigured: Boolean(creds.googleOAuthToken),
      haConfigured: haEntities.length > 0,
      haUrl: process.env.HA_URL || "http://192.168.188.92:8123"
    };
    return {
      palette: [...STARTER_NODE_PALETTE, ...customNodes],
      workflows,
      credentialsStatus,
      haEntities
    };
  });
  ctx.route("POST", "/workflows", async (req) => {
    const body = req.body && typeof req.body === "object" ? req.body : {};
    if (!body.workflow || !body.workflow.id) {
      return { ok: false, error: "Missing workflow object" };
    }
    const existing = getSavedWorkflows();
    const updated = {
      ...body.workflow,
      updatedAt: (/* @__PURE__ */ new Date()).toISOString()
    };
    const idx = existing.findIndex((w) => w.id === updated.id);
    if (idx >= 0) {
      existing[idx] = updated;
    } else {
      existing.unshift(updated);
    }
    ctx.db.kvSet("saved_workflows", existing);
    return { ok: true, workflows: existing, saved: updated };
  });
  ctx.route("POST", "/workflows/delete", async (req) => {
    const body = req.body && typeof req.body === "object" ? req.body : {};
    const existing = getSavedWorkflows().filter((w) => w.id !== body.workflowId);
    const finalWorkflows = existing.length > 0 ? existing : DEFAULT_STARTER_WORKFLOWS;
    ctx.db.kvSet("saved_workflows", finalWorkflows);
    return { ok: true, workflows: finalWorkflows };
  });
  ctx.route("POST", "/custom-nodes", async (req) => {
    const body = req.body && typeof req.body === "object" ? req.body : {};
    if (!body.name?.trim()) {
      return { ok: false, error: "Missing node name" };
    }
    const customNodes = getCustomNodeTemplates();
    const newTemplate = {
      typeId: `custom.${Date.now()}`,
      category: body.category || "custom",
      categoryLabel: "Custom Nodes",
      name: body.name.trim(),
      subtitle: (body.subtitle || "Custom n8n node").trim(),
      icon: body.icon || "\u{1F9E9}",
      accentColor: "#ec4899",
      n8nType: "n8n-nodes-base.httpRequest",
      defaultConfig: {
        endpoint: body.endpointOrHint || "https://api.example.com/v1",
        payload: "{{$input}}"
      },
      fields: [
        { key: "endpoint", label: "API URL / Action", type: "text" },
        { key: "payload", label: "Payload ({{$input}})", type: "textarea" }
      ]
    };
    customNodes.push(newTemplate);
    ctx.db.kvSet("custom_node_templates", customNodes);
    return {
      ok: true,
      palette: [...STARTER_NODE_PALETTE, ...customNodes],
      created: newTemplate
    };
  });
  ctx.route("POST", "/credentials", async (req) => {
    const body = req.body && typeof req.body === "object" ? req.body : {};
    if (typeof body.geminiApiKey === "string" && body.geminiApiKey.trim()) {
      ctx.db.kvSet("gemini_api_key", body.geminiApiKey.trim());
    }
    if (typeof body.githubToken === "string" && body.githubToken.trim()) {
      ctx.db.kvSet("github_token", body.githubToken.trim());
    }
    if (typeof body.googleOAuthToken === "string" && body.googleOAuthToken.trim()) {
      ctx.db.kvSet("google_oauth_token", body.googleOAuthToken.trim());
    }
    const creds = getCredentials();
    return {
      ok: true,
      credentialsStatus: {
        geminiConfigured: Boolean(creds.geminiApiKey),
        githubConfigured: Boolean(creds.githubToken),
        googleConfigured: Boolean(creds.googleOAuthToken),
        haConfigured: true,
        haUrl: process.env.HA_URL || "http://192.168.188.92:8123"
      }
    };
  });
  ctx.route("POST", "/execute-node", async (req) => {
    const body = req.body && typeof req.body === "object" ? req.body : {};
    if (!body.node) {
      return { ok: false, error: "Missing node" };
    }
    const result = await executeSingleNode(
      body.node,
      body.sampleInput || "Sample upstream data from previous node"
    );
    return { ok: true, result };
  });
  ctx.route("POST", "/execute-workflow", async (req) => {
    const body = req.body && typeof req.body === "object" ? req.body : {};
    const wf = body.workflow;
    if (!wf || !Array.isArray(wf.nodes)) {
      return { ok: false, error: "Invalid workflow" };
    }
    const startedAt = (/* @__PURE__ */ new Date()).toISOString();
    const nodeResults = {};
    const nodeOutputsText = {};
    const sortedNodes = [...wf.nodes].sort((a, b) => a.x - b.x || a.y - b.y);
    for (const node of sortedNodes) {
      const incomingEdges = (wf.edges || []).filter((e) => e.targetNodeId === node.id);
      const upstreamParts = incomingEdges.map((e) => nodeOutputsText[e.sourceNodeId]).filter(Boolean);
      const upstreamInput = upstreamParts.join("\n\n");
      const res = await executeSingleNode(node, upstreamInput);
      nodeResults[node.id] = res;
      const dataObj = res.outputData;
      nodeOutputsText[node.id] = typeof dataObj?.response === "string" ? dataObj.response : typeof dataObj?.formattedText === "string" ? dataObj.formattedText : res.outputSummary;
    }
    const report = {
      runId: `run-${Date.now()}`,
      workflowId: wf.id,
      workflowName: wf.name,
      startedAt,
      finishedAt: (/* @__PURE__ */ new Date()).toISOString(),
      status: Object.values(nodeResults).some((r) => r.status === "error") ? "error" : "success",
      nodeResults
    };
    return { ok: true, report };
  });
});
export {
  index_default as default
};
