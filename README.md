# my-ai-platform (V3)

这是一个基于 Vite + 原生 JavaScript 的工程化项目，用来承载原来的单文件页面 `v2 .html`（已升级为 V3 工程化结构）。

## 开发

```bash
npm install
npm run dev
```

## 环境变量（可选）

如果页面使用了 Supabase，把以下变量放到 `.env.local`（该文件默认不提交；也可以参考 `.env.example`）：

```bash
VITE_SUPABASE_URL=你的_supabase_url
VITE_SUPABASE_ANON_KEY=你的_supabase_anon_key
```

如果页面需要调用 DeepSeek，请不要把 DeepSeek API Key 放在前端代码或任何 VITE_ 环境变量里；正确做法是部署一个中转代理（例如 Cloudflare Worker），由代理在服务端保存 Key，然后前端只配置：

```bash
VITE_DEEPSEEK_PROXY_URL=你的_deepseek_proxy_url
```

Deploy trigger: 2026-01-28
