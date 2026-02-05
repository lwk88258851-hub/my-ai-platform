# 第三版上线指引（收集完成后一次性发布）

## 上线内容
- 备课区新增“游戏代码”入口与对应工具页面（模板 / 自主创造）。
- 教案生成 / 素材生成子选项支持收起/展开，避免遮挡新增入口。
- 游戏代码：预览（iframe）、HTML 下载、网页包（zip）下载、导出网页链接。
- Supabase Edge Function：`/text` 改为 DeepSeek 文本生成（教学助手提示词），新增 `/game` 生成网页游戏 HTML。
- Supabase Storage：新增 `game-pages` bucket 与读写策略（用于导出网页链接）。

## 静态站点发布（Cloudflare Pages）
1. 确保当前分支为 `update-v3`，且所有第三版改动均已提交。
2. 在 `my-ai-platform/` 执行构建（会把 `site/` 复制到 `dist/`）：`npm run build`。
3. 合并 `update-v3` 到 `main` 并 push，触发 Cloudflare Pages 自动部署 `dist/`。

## Supabase（第三版一起上线时执行）

### 1) Edge Function 更新（必须）
目标：更新线上 `zhipu-ai-service`，使 `POST /text` 调用 DeepSeek，`POST /game` 生成网页游戏 HTML。

- 函数代码位置（本仓库存档）：`supabase/functions/zhipu-ai-service/index.ts`
- 环境变量（在 Supabase Dashboard → Project Settings → Functions 或 Secrets 配置）：
  - `DEEPSEEK_API_KEY`：DeepSeek API Key
  - `DEEPSEEK_BASE_URL`：可选，默认 `https://api.deepseek.com`
  - `DEEPSEEK_MODEL`：可选，默认 `deepseek-chat`
  - `ZHIPU_API_KEY`：用于图片/视频生成（如线上仍需要这些能力）

说明：本仓库未内置 Supabase CLI 的 `supabase/config.toml`，因此可用以下两种方式发布函数：
- 使用你现有的 Supabase Functions 项目/仓库，将本文件内容同步到对应的 `zhipu-ai-service` 函数后部署。
- 或在 Supabase Dashboard 侧按你现有流程发布同名函数（函数名需保持 `zhipu-ai-service`，以兼容前端调用）。

### 2) Storage bucket & policy（用于导出网页链接）
在 Supabase Dashboard → SQL Editor 执行：
- `supabase/game-pages.sql`

执行后应看到：
- Storage bucket：`game-pages`（public）
- storage.objects 策略：读（anon/authenticated）与写（authenticated）

## 回滚
- 静态站点：回退 `main` 到上线前 commit 并 push（Pages 自动回到对应版本）。
- Supabase：
  - Edge Function：回滚到旧版本函数代码并重新部署。
  - Storage：如需回滚策略，删除 `game-pages` 相关 policy 或删除 bucket（谨慎，可能影响已导出的链接）。

