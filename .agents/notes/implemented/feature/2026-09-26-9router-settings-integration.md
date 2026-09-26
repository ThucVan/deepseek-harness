# Agent Note: Surface local 9router and Work setup in Settings

Status: implemented

English | [中文](2026-09-26-9router-settings-integration.zh.md)

## Problem

The local 9router dashboard and Codex importer ran beside dsh Web, while users had to remember separate localhost URLs and manually configure model routes. Proxying credential handling through the dsh Host would enlarge its trust boundary.

## Decision

A browser plugin owns one localized `settings.section` with id `9router`. It links the 9router dashboard at `127.0.0.1:20128`, links and lazily embeds the importer at `127.0.0.1:20129`, and never handles OAuth tokens itself. The importer retains its own loopback session-token and Origin checks.

A user-triggered refresh reads catalogs from every registered provider through the authenticated LLM Remote and adds live/configured discovery where available. It deduplicates routes, excludes provider/model ids containing `deepseek` from brain eligibility, applies a documented deterministic name heuristic, enables selectable worker routes with Gemini first, then writes `agent-default-model` and `subagent-model-selection` through revision-checked settings mutations. Discovery failures are isolated and transport failures are surfaced. Existing sessions remain pinned.

The Web bundle ships the planning-first `work` preset as its default. Its persona discovers available worker routes rather than assuming installation-specific ids, delegates execution, performs bounded fallback, and verifies integration.

The Host entry validates typed config, probes loopback ports, starts the installed 9router CLI when necessary, and starts an explicitly configured or sibling importer. Custom paths use `DSH_9ROUTER_ENTRY`/`NINER_CLI` and `DSH_9ROUTER_IMPORTER_ENTRY`. Antigravity system changes remain explicit actions inside 9router.

## Consequences

Fresh clones receive the UI and Work preset, but 9router and the importer remain documented external prerequisites. Fixed loopback URLs intentionally constrain this integration to browser and Host on the same machine. Detached companions may outlive DSH, and a port probe cannot authenticate the listener. The brain selection is heuristic rather than a quota/capability probe.

## Verification

Unit coverage asserts host resolution, deterministic open/closed port probing, registration lifecycle, locale switching, exact dashboard/importer/MITM targets, all-provider catalogs, discovery isolation, DeepSeek exclusion, worker setup, settings revisions, and rejected-refresh recovery. Package/client/Host typechecks, bundles, generated catalogs, documentation pairing, and package verifiers run before release.
