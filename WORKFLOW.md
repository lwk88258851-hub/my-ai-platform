# 第二次大更新工作流（建议固定执行）

## 目标
- 基于当前已上线版本继续大改，但不立刻上线。
- 所有大改都有留底（可随时回滚到任意一次留底版本）。
- 最终统一合并到 `main`，触发 Cloudflare Pages 一次性上线。

## 日常开发（不影响线上）
1. 从最新 `main` 拉取代码
2. 新建开发分支（示例）：
   - `update-v2`
3. 每次“大改”前先留底：
   - `npm run snapshot`
4. 修改 `site/`（这是线上镜像源；你所有页面与功能的最终成果都要落在这里）
5. 本地构建验证：
   - `npm run build`
   - 重点检查 `dist/index.html`、`dist/stitch/**`、以及 AI 调用是否统一指向 `ai-gateway`
6. 分支内提交（可多次提交），但不要合并到 `main`。

## 统一上线（一次性发布）
1. 确认分支构建通过：
   - `npm run build`
2. 将分支合并到 `main`（或直接把分支 PR 合并到 main）
3. 推送 `main` 到 GitHub
4. Cloudflare Pages 自动部署 `dist`（由 `npm run build` 生成）

## 回滚（两种方式）
- Git 回滚：回退到历史 commit 并 push（Cloudflare 会随之回退）
- 镜像回滚：从 `site-archive/` 里恢复某个留底版本：
  - `npm run restore -- <文件夹名>`
  - `npm run build`
  - 提交并推送（用于线上快速回退到某个留底版本）
