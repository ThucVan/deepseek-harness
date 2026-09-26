# Agent Note：在设置中提供本地 9router 与 Work 设置

状态：已实现

[English](2026-09-26-9router-settings-integration.md) | 中文

## 问题

本地 9router 控制台与 Codex 导入器运行在 dsh Web 旁边，用户必须记住多个 localhost URL 并手动配置模型路由。若通过 dsh Host 代理凭据处理，会扩大其信任边界。

## 决策

浏览器插件拥有一个 id 为 `9router` 的本地化 `settings.section`。它链接 `127.0.0.1:20128` 的 9router 控制台，链接并懒加载嵌入 `127.0.0.1:20129` 的导入器，而且绝不处理 OAuth token。导入器继续拥有自己的 loopback session-token 与 Origin 检查。

用户触发的刷新通过经过认证的 LLM Remote 读取每个已注册 provider 的目录，并在可用时加入实时/已配置发现结果。它去重路由，排除 provider/model id 包含 `deepseek` 的大脑候选，应用有文档说明的确定性名称启发式，以 Gemini 为首启用可选择 worker 路由，然后通过 revision 检查的 settings mutation 写入 `agent-default-model` 与 `subagent-model-selection`。单个发现失败互相隔离，transport 错误会显示出来。现有会话保持原路由。

Web bundle 将 planning-first 的 `work` preset 作为默认值发布。其 persona 会发现可用 worker 路由，而非假设安装特定 id；它委派执行、执行有限 fallback，并验证集成结果。

Host 入口验证 typed config、探测 loopback 端口、按需启动已安装的 9router CLI，并启动显式配置或相邻的导入器。自定义路径使用 `DSH_9ROUTER_ENTRY`/`NINER_CLI` 与 `DSH_9ROUTER_IMPORTER_ENTRY`。Antigravity 系统修改仍然是在 9router 内明确执行的操作。

## 后果

全新 clone 会获得 UI 与 Work preset，但 9router 和导入器仍是有文档说明的外部前置条件。固定 loopback URL 有意将集成限制为浏览器与 Host 同机。detached companion 可能在 DSH 退出后继续运行，端口探测不能验证监听进程身份。大脑选择是启发式，不是配额/能力探测。

## 验证

单元测试覆盖 Host 解析、确定性的端口开启/关闭探测、注册生命周期、语言切换、精确的 dashboard/importer/MITM 目标、全 provider 目录、发现隔离、DeepSeek 排除、worker 设置、settings revision 与刷新拒绝恢复。发布前运行 package/client/Host typecheck、bundle、生成目录、文档配对与 package verifier。
