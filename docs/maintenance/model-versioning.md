# 辨識模型版本與升級策略

完整規格見 [`../superpowers/specs/2026-05-23-facial-signature-design.md`](../superpowers/specs/2026-05-23-facial-signature-design.md) §6.5。

## 當前版本

`shared/face-engine.js`：

```js
export const MODEL_VERSION = 'human-3.3.5-faceres'; // 模型升級時改這裡
```

模型本體 vendored 在 `vendor/human/`，首次連網下載後快取，離線可用。

## 升級策略：「新 person、舊 person 凍結」

模型升級（Human 升級或換到 ArcFace）時，**新舊向量無法互相比對**（維度／embedding space 不同）。

- **不自動升級**：只有向量、沒有原始臉部資料，數學上無法重算舊向量。
- 升級後新採樣的向量標 `modelVersion='v2'`；舊 person 的向量標 `v1`，**不再用於比對**（`face-worker` 啟動時依當前 modelVersion 過濾比對範圍）。
- 該人下次入鏡被當新人 → 自動建一筆新的 v2 person record。
- 管理介面提供「**v1 → v2 合併**」入口：管理員發現「這個 v2 新人」其實是「那個 v1 舊人」時按合併。
  - 合併語意：events 全部改 personId 指向新 v2 person；舊 v1 person 標刪除；**舊 v1 向量直接丟棄**（不加入 v2）。
  - 歷史連續性由 `events.modelVersion` 保留（歷史 event 仍標 v1，可查）。
- 全庫遷移完成（沒有 v1 person）後可清理 v1 殘留。
