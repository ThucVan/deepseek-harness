---
description: "Web 设置中的本地 9router 控制台、Codex 导入器与 Work 路由设置。"
kind: "package-reference"
---

# @deepseek-ai/dsh-client-ui-settings-9router

[English](README.md) | 中文

## 概述

本包为同机 Web 部署贡献 **设置 → 9router**。它链接 `127.0.0.1:20128` 的 9router 控制台，链接并懒加载嵌入 `127.0.0.1:20129` 的 Codex 导入器，同时提供 Antigravity MITM 控制台入口，但不会自动启用 MITM。

## 全新克隆设置

先安装已审核版本：`npm install --global 9router@0.5.86`。将 [Import-9Router-JsCodex](https://github.com/CBNN999999/Import-9Router-JsCodex) 克隆到 DSH checkout 旁边，或将 `DSH_9ROUTER_IMPORTER_ENTRY` 设置为其 `gui.js` 绝对路径。自定义 9router 安装可使用 `DSH_9ROUTER_ENTRY` 或 `NINER_CLI`。启动生产 Web 前必须构建 DSH。

打开**设置 → 9router**并选择**刷新大脑模型**。该操作读取所有已注册目录及可配置 provider 的发现结果，合并并去重路由，排除 DeepSeek 大脑候选，然后用确定性的名称启发式为新会话选择默认路由。它也会启用可选择的 subagent 路由，并将 Gemini worker 排在前面。现有会话保留已记录路由。

## 配置

- `routerEntry`：可选的 9router `cli.js` 或可执行文件绝对路径。
- `importerEntry`：可选的导入器 `gui.js` 绝对路径。
- `autoStartRouter`、`autoStartImporter`：默认均为 `true`。

对于本地 checkout，建议使用环境变量 fallback，使 profile YAML 不包含机器路径。Host 只探测 loopback 端口，detached companion 可能在 DSH 退出后继续运行。端口监听者并不等同于已验证的进程身份。

## 实现

浏览器端拥有 `settings.9router`，使用经过认证的 LLM/settings Remote，并以 revision 检查写入 `agent-default-model` 与 `subagent-model-selection`。单个 provider 发现失败会被容忍；transport 与 mutation 错误会显示在 UI。Host 端验证配置、探测 `20128`/`20129`，并按配置启动已安装的本地 companion。

## 模型体验

模型排序是启发式，而不是配额或计费推理探测。DeepSeek 仍可用于其他用途和 worker 路由，但不能成为所选 Work 大脑。本包不添加提示词；planning/delegation 指令由随包发布的 `work` preset 拥有。

#### KV Cache 影响

无；本包不增加面向模型的提示词内容。

## 限制与安全

- 浏览器与 DSH Host 必须运行在同一台机器上，因为所有 URL 都是 loopback。
- 9router 与导入器是外部前置条件；自动启动失败时链接仍然可见。
- frame 策略可能阻止导入器 iframe；外部链接始终保留。
- MITM 只有在 9router 中明确操作后才可安装本地 CA、修改 hosts 并占用 443 端口。不要以管理员身份运行 DSH/导入器。
- OAuth JSON、API key、数据库与备份均为秘密，绝不能提交。
