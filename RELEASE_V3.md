# 第三版上线指引（收集完成后一次性发布）

## 上线内容
- 备课区新增“游戏代码”入口与对应工具页面（模板 / 自主创造）。
- 教案生成 / 素材生成子选项支持收起/展开，避免遮挡新增入口。
- 游戏代码：预览（iframe）、HTML 下载、网页包（zip）下载、导出网页链接。
- 教案生成新增“智能文本（deepseek-chat）”入口：多轮对话上下文、追问不跑题、Markdown+KaTeX 公式渲染、下载仅截取 `---` 前正文。
- 图文生成入口改造：对话框区域替换为“智绘班会 smartclass-report”页面（iframe 方式完整复刻）；新增静态子页面 `/stitch/ai-home/smartclass-report/index.html`。
- AI 接口管理：deepseek-chat 显示名改为“智能文本”；移除“文本教案生成(lesson-text)”管理项（界面不再展示）。
- Supabase Edge Function：统一使用 `ai-gateway` 的 `POST /run`（按功能路由到对应 API）。
- Supabase Storage：新增 `game-pages` bucket 与读写策略（用于导出网页链接）。

## 静态站点发布（Cloudflare Pages）
1. 确保当前分支为 `update-v3`，且所有第三版改动均已提交。
2. 在 `my-ai-platform/` 执行构建（会把 `site/` 复制到 `dist/`）：`npm run build`。
3. 合并 `update-v3` 到 `main` 并 push，触发 Cloudflare Pages 自动部署 `dist/`。

## Supabase（第三版一起上线时执行）

### 1) Edge Function 更新（必须）
目标：上线 `ai-gateway`，所有 AI 功能统一通过 `POST /run` 调用，并由后端配置表决定每个功能走哪个 API。

- 函数代码位置（本仓库存档）：`supabase/functions/ai-gateway/index.ts`
- 环境变量（在 Supabase Dashboard → Project Settings → Functions 或 Secrets 配置）：
  - `SUPABASE_URL`
  - `SUPABASE_ANON_KEY`
  - `SUPABASE_SERVICE_ROLE_KEY`
  - `AI_CONFIG_ENC_KEY`：用于加解密保存的第三方 API Key
  - `ADMIN_UIDS`：管理员用户 ID（逗号分隔），用于启用管理端接口

说明：前端不再传任何第三方 API Key；所有 Key 由后端通过管理端配置写入数据库并加密保存。

补充：
- deepseek-chat（智能文本）依赖管理端配置 connector 与 route（openai_compat，base_url=https://api.deepseek.com，model=deepseek-chat）。
- smartclass-report 作为独立静态页面嵌入到图文生成中，API Key 由页面内输入并保存到浏览器 localStorage（仅本机生效），不经过 ai-gateway。

### 2) Storage bucket & policy（用于导出网页链接）
在 Supabase Dashboard → SQL Editor 执行：
- `supabase/ai-gateway.sql`
- `supabase/game-pages.sql`

执行后应看到：
- Storage bucket：`game-pages`（public）
- storage.objects 策略：读（anon/authenticated）与写（authenticated）

## 回滚
- 静态站点：回退 `main` 到上线前 commit 并 push（Pages 自动回到对应版本）。
- Supabase：
  - Edge Function：回滚到旧版本函数代码并重新部署。
  - Storage：如需回滚策略，删除 `game-pages` 相关 policy 或删除 bucket（谨慎，可能影响已导出的链接）。
