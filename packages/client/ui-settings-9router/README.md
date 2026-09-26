---
description: "Local 9router dashboard, Codex importer, and Work route setup in Web Settings."
kind: "package-reference"
---

# @deepseek-ai/dsh-client-ui-settings-9router

English | [中文](README.zh.md)

## Summary

This package contributes **Settings → 9router** for same-machine Web deployments. It links the 9router dashboard at `127.0.0.1:20128`, links and lazily embeds the Codex importer at `127.0.0.1:20129`, and exposes the Antigravity MITM dashboard without enabling MITM automatically.

## Fresh-clone setup

Install the audited 9router version first: `npm install --global 9router@0.5.86`. Clone [Import-9Router-JsCodex](https://github.com/CBNN999999/Import-9Router-JsCodex) beside the DSH checkout, or set `DSH_9ROUTER_IMPORTER_ENTRY` to its absolute `gui.js` path. Custom router installs may use `DSH_9ROUTER_ENTRY` or `NINER_CLI`. Build DSH before launching production Web.

Open **Settings → 9router** and choose **Refresh brain model**. The operation reads registered catalogs plus configurable-provider discovery, combines and deduplicates routes, excludes DeepSeek routes from brain eligibility, and uses a deterministic name-based heuristic to choose the default route for new sessions. It also enables selectable subagent routes and orders Gemini workers first. Existing sessions keep their recorded route.

## Configuration

- `routerEntry`: optional absolute 9router `cli.js` or executable path.
- `importerEntry`: optional absolute importer `gui.js` path.
- `autoStartRouter`, `autoStartImporter`: default to `true`.

The environment fallbacks are preferable for local checkouts because profile YAML stays machine-independent. The Host only probes loopback ports and detached companions may outlive DSH. A listener on a port is not an authenticated process identity.

## Implementation

The browser half owns `settings.9router`, uses authenticated LLM/settings Remotes, and writes `agent-default-model` plus `subagent-model-selection` with revision checks. Individual provider discovery failures are tolerated; transport and mutation failures are reported in the UI. The Host half validates config, probes ports `20128`/`20129`, and starts installed local companions when configured.

## Model Experience

The model ranking is heuristic, not a quota or billable inference probe. DeepSeek remains available for other uses and worker routing but cannot become the selected Work brain. No prompt content is added by this package; the shipped `work` preset owns planning and delegation instructions.

#### KV Cache effect

None; this package does not add model-facing prompt content.

## Limitations and safety

- Browser and DSH Host must run on the same machine because all URLs are loopback-only.
- 9router and the importer are external prerequisites; failed auto-start leaves the links visible.
- Framing policy can block the importer iframe; the external link remains available.
- MITM can install a local CA, edit hosts, and bind port 443 only after explicit action in 9router. Do not run DSH/importer elevated.
- OAuth JSON, API keys, databases, and backups are secrets and must never be committed.
