# Supabase 第三版上线（ai-gateway）

## 1. 前置准备
- 在 Supabase Dashboard 确认项目的 Project Ref（形如：`xxxxxxxxxxxx`）
- 准备 Supabase Access Token（Supabase 账号的个人访问令牌）
- 在 Supabase Dashboard → Project Settings → Functions/Secrets 配置以下 Secrets：
  - `SUPABASE_URL`
  - `SUPABASE_ANON_KEY`
  - `SUPABASE_SERVICE_ROLE_KEY`
  - `AI_CONFIG_ENC_KEY`
  - `ADMIN_UIDS`

## 2. 部署 Edge Function（ai-gateway）
在本仓库根目录 `my-ai-platform/` 执行：

```powershell
$env:SUPABASE_ACCESS_TOKEN = "<你的 Supabase Access Token>"
$ref = "<你的 Project Ref>"

npx --yes supabase@latest functions deploy ai-gateway --project-ref $ref
```

## 3. 初始化数据库与 Storage（仅首次启用时需要）
在 Supabase Dashboard → SQL Editor 依次执行：
- `supabase/ai-gateway.sql`
- `supabase/game-pages.sql`

## 4. 上线后验证
- 打开站点的 AI 接口管理，确认能读取 connectors/routes
- 为 `deepseek-chat（智能文本）` 绑定 DeepSeek connector（openai_compat，base_url=https://api.deepseek.com，model=deepseek-chat）
- 在备课中心测试：
  - 智能文本：多轮追问仍围绕上文主题
  - 图文生成：能正常打开嵌入的智绘班会页面

