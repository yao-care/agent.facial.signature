# 本機開發與測試

## 跑測試（vitest，無相機需求）

```bash
npm install
npm test          # vitest run
npm run test:watch
```

測試在 `tests/`，用 `fake-indexeddb` 模擬 IDB。**新增功能要補對應測試。**

## 本機 dev server

```bash
npm run serve        # python3 -m http.server 8000
# 或
npm run serve:node   # npx http-server -p 8000 -c-1
```

開 `http://localhost:8000/admin.html`（`localhost` 是 secure context，攝影機與 OPFS 可用）。

## 分支紀律

- **不在 `main` 直接開發**。feature 分支命名 `feat/<topic>`。

## 每個新 feature 的完整流程

1. brainstorm（superpowers）
2. spec（寫進 `docs/superpowers/specs/`）
3. plan（寫進 `docs/superpowers/plans/`）
4. subagent 驅動執行：每個 task 配 implementer + spec reviewer + code quality reviewer
5. Opus 最終整體審查
6. finishing 分支合併
7. Playwright 上線驗證（見 [`deploy-and-verify.md`](deploy-and-verify.md)）

## 規格不寫沒實測根據的數字

閾值／上限這類數字，spec 只描述「可調 + 校準機制」，不寫沒有實測根據的具體值。
