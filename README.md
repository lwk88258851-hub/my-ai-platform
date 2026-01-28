# v2-vite-vanilla

这是一个基于 Vite + 原生 JavaScript 的工程化项目，用来承载原来的单文件页面 `v2 .html`。

## 开发

```bash
npm install
npm run dev
```

## 环境变量（可选）

如果页面使用了 Supabase，把以下变量放到 `.env.local`（该文件默认不提交）：

```bash
VITE_SUPABASE_URL=你的_supabase_url
VITE_SUPABASE_ANON_KEY=你的_supabase_anon_key
```

