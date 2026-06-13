# CLAUDE.md — facial.signature 專案規則

全域通用紀律見 `~/.claude/CLAUDE.md`，本檔只放本專案特定的事。
服務本身的白話介紹見 [`README.md`](README.md)。

## 一句話定位

台灣社區據點／日照中心的**人臉辨識報到前端**：純前端 PWA、資料留瀏覽器、零雲端。對社會局平台採「選項 1」——只做報到自動化 + 輸出 B 表清單供管理者複製貼回平台，**不存**身分證、出生年月日等完整身分 PII。

## 最高優先紀律（漏了會直接出事）

1. **改 `shared/app.css` 或 `shared/**/*.js` 之後，一定要 bump `service-worker.js` 的 `VERSION`**。沒升版號＝瀏覽器吃舊快取，「改了沒效果」99% 是這個。
2. **新增的 `.js` 檔要加進 `service-worker.js` 的 `APP_SHELL`**，否則離線／PWA 模式拿不到。
3. **不在 `main` 分支直接開發**；feature 分支命名 `feat/<topic>`。
4. **新功能要補 vitest 測試**（測試在 `tests/`，`npm test` 跑）。
5. 全站只有一份 CSS：`shared/app.css`。所有頁面都載它，改完務必 bump SW（見第 1 點）。

## 詳細文件索引（需要時再讀，避免一次載入）

| 主題 | 文件 |
|---|---|
| 系統架構、模組職責、資料模型、核心流程 | [`docs/maintenance/architecture.md`](docs/maintenance/architecture.md) |
| 管理介面各 tab 操作、第一次使用流程 | [`docs/maintenance/admin-guide.md`](docs/maintenance/admin-guide.md) |
| 部署到 GH Pages／內網、上線後驗證流程、SW 踩雷 | [`docs/maintenance/deploy-and-verify.md`](docs/maintenance/deploy-and-verify.md) |
| 本機開發、跑測試、分支與 feature 完整流程 | [`docs/maintenance/local-development.md`](docs/maintenance/local-development.md) |
| 辨識模型版本與升級策略 | [`docs/maintenance/model-versioning.md`](docs/maintenance/model-versioning.md) |
| PWA 安裝、儲存授權、相機授權、已知限制、踩雷點 | [`docs/maintenance/operations.md`](docs/maintenance/operations.md) |

設計規格（spec）與實作計畫（plan）在 `docs/superpowers/specs/` 與 `docs/superpowers/plans/`。
