# my-ai-platform（线上静态镜像）

本仓库用于 Cloudflare Pages 部署 `educlass.cn`。

## 当前发布策略
- `site/`：线上发布的“权威静态镜像”（来自测试版的整站构建产物）。
- `npm run build`：将 `site/` 原样复制到 `dist/`，Cloudflare Pages 直接发布 `dist/`。
- `legacy-src/`：旧版源码留底备份，不参与构建与发布。

## 本地验证
```bash
npm install
npm run build
```

构建完成后检查：
- `dist/index.html`
- `dist/stitch/**`

## 回滚
回滚到任意历史 commit 并 push，Cloudflare Pages 会自动回到对应版本。
