# my-ai-platform（线上静态镜像）

本仓库用于 Cloudflare Pages 部署 `educlass.cn`。

## 当前发布策略
- `site/`：线上发布的“权威静态镜像”（来自测试版的整站构建产物）。
- `npm run build`：将 `site/` 原样复制到 `dist/`，Cloudflare Pages 直接发布 `dist/`。
- `legacy-src/`：旧版源码留底备份，不参与构建与发布。
 - `site-archive/`：每次大更新前的整站留底快照（可随时回滚，本地留底，不进 Git）。
 - 推荐在分支上做第二次大更新，合并到 `main` 才会触发上线（详见 `WORKFLOW.md`）。

## 本地验证
```bash
npm install
npm run build
```

构建完成后检查：
- `dist/index.html`
- `dist/stitch/**`

## 留底与回滚（第二次大更新开始建议按此流程）
- 大改之前先留底：
```bash
npm run snapshot
```
- 回滚到某个留底版本（先查看 `site-archive/` 下的文件夹名）：
```bash
npm run restore -- 20260204-120000-710bca3
npm run build
```

## 回滚
回滚到任意历史 commit 并 push，Cloudflare Pages 会自动回到对应版本。
