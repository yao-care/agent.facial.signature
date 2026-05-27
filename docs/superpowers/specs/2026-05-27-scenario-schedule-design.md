# 情境設定改為時段排程 Design Spec

**Goal:** 把「情境設定」從「每天手動更新一組 serviceRecord」改成「一次設定時段排程（分星期 + 自訂時間區間 + 特定日期一次性時段），報到時依當下時間自動解析出對應的服務項目/活動，戳進該筆紀錄」。

**Architecture:** `scenarioConfig` 記錄內容由單組 `serviceRecord` 換成 `schedule`（weekly 規則 + specific 規則）。新增純模組 `schedule-resolve.js`：`resolveServiceRecord(schedule, ts)` 報到時解析、`buildScheduleAgenda(schedule, today)` 給編輯畫面排版，皆無 DB/DOM 依賴可單元測試。報表與資料庫 schema 不變。

**Tech Stack:** 純前端 PWA、IndexedDB（settings store）、vitest。無新增函式庫。

取代先前 `2026-05-26-social-bureau-b-table-alignment-design.md` 中「§2 單組 serviceRecord、每天手動更新」的部分；該 spec 其餘（人員連結欄位、報表彙總、B 表欄位）仍有效。

---

## § 0 背景

先前 `情境設定` 是「一頁一組固定 serviceRecord，管理者每天活動前手動改今日主題/服務項目」。實務上服務時段是**固定排程**（如週一上午健促、週五中午共餐），不該每天重設。改為一次設定排程、報到時依時間自動套用。

---

## § 1 資料模型

`scenarioConfig:<scenarioId>`（settings store，**schema 不變**）內容：

```json
{
  "id": "scenarioConfig:example-checkin",
  "scenarioId": "example-checkin",
  "schedule": {
    "weekly": [
      { "weekday": 1, "start": "09:00", "end": "11:00",
        "時段": "上午", "服務項目": "健康促進", "活動編號": "HP-115060101",
        "活動主題": "匹克球", "餐飲類型": "", "服務志工": "王" },
      { "weekday": 5, "start": "12:00", "end": "13:00",
        "時段": "中午", "服務項目": "餐飲服務", "活動編號": "ML-115060501",
        "活動主題": "共餐", "餐飲類型": "共餐", "服務志工": "李" }
    ],
    "specific": [
      { "date": "2026-05-30", "start": "10:00", "end": "11:30",
        "時段": "上午", "服務項目": "關懷訪視", "活動編號": "",
        "活動主題": "局長視察", "餐飲類型": "", "服務志工": "" }
    ]
  },
  "updatedAt": 1716800000000
}
```

- 每條規則 = 時間區間（`start`/`end`，`"HH:MM"` 零補位，比對用）+ serviceRecord 六欄（時段/服務項目/活動編號/活動主題/餐飲類型/服務志工，報到時戳上）。
- `weekday`：0=日、1=一…6=六。
- 一條 weekly 規則綁一個星期（多天就建多條）。
- `時段` 是規則裡的標籤欄位（報表分組/顯示用），與時間區間分工：區間決定「哪條命中」、時段是「報到後標到報表的標籤」。

---

## § 2 報到時解析（純函式 `resolveServiceRecord`）

`shared/schedule-resolve.js` 匯出 `resolveServiceRecord(schedule, timestamp) → serviceRecord | {}`：

1. 由 `timestamp` 算 `T = "HH:MM"`（零補位）、`wd`（0~6）、`dateStr`（當地 `YYYY-MM-DD`）
2. **特定日期優先**：`schedule.specific` 中 `date === dateStr 且 start <= T < end` → 命中第一條
3. **再星期規則**：`schedule.weekly` 中 `weekday === wd 且 start <= T < end` → 命中第一條
4. 都沒命中 → 回 `{}`（情境留空，照常報到）
5. 命中 → 回該規則的 serviceRecord 六欄

`"HH:MM"` 零補位字串可直接字典序比較。

**串接**：`face-checkin-template.js` 寫 event 前呼叫 `resolveServiceRecord(schedule, Date.now())`，結果戳進 `event.meta.serviceRecord`（行為同現在，只是來源改為依時間解析）。

---

## § 3 編輯畫面（情境設定 tab，agenda 排版）

每情境一張卡，呈現成週模板 agenda。

### 3.1 排列與日期

- 固定七列：週一→週二→…→週六→週日。
- 每列標該週幾「從今天起算最近一次的實際日期」，格式 **`M/D (週幾)`**（無前導零、週幾單字），例 `5/27 (三)`、`6/1 (一)`；今天那列加註「今」。
- 七列日期即 `今天 ~ 今天+6`（每週幾各對應唯一一天）。

### 3.2 每個週幾列

- 顯示該週幾的 weekly 規則；**同一列內依 `start` 由小到大排序**（早的在上）。
- 每條規則含：開始/結束時間、時段、服務項目（下拉四選一）、活動編號、活動主題、餐飲類型（僅服務項目＝餐飲服務時顯示）、服務志工。
- 列內「＋ 新增規則」、每條可編輯/移除。

### 3.3 特定日期

- 日期落在本週窗（今天 ~ 今天+6）→ 插到對應週幾列，前加 ★，與該日 weekly 規則一起依 `start` 排序。
- 日期更遠 → 收在卡片下方「未來特定日期」區，依日期升序。
- 「＋ 新增特定日期」：選日期 + 時間區間 + serviceRecord 六欄。

### 3.4 純函式 `buildScheduleAgenda(schedule, today)`

`shared/schedule-resolve.js` 匯出。輸入排程 + 今天日期，回傳：

- `days`: 七列，每列 `{ weekday, date(YYYY-MM-DD), label("M/D (週幾)"), isToday, rules: [...依 start 排序，weekly 與「本週特定」合併，特定標 isSpecific] }`
- `future`: 本週窗之後的 specific 規則，依日期升序

純日期計算，無 DB/DOM，可單元測試。

### 3.5 儲存驗證

- 每條規則：服務項目＝健康促進/餐飲服務 時，活動編號必填，否則擋下並提示。
- 結束時間須晚於開始時間（`end > start` 字串比較）。
- weekly 規則需選星期；specific 規則需選日期。

### 3.6 空排程

無任何規則時顯示「尚未設定時段，報到時情境欄位會留空」。

---

## § 4 不變的部分

- 報表 `report-aggregate.js`：完全不動，讀 event 已戳好的 `meta.serviceRecord`。報表日期仍用**民國年**（`115/05/26`）——§3.1 的 `M/D (週幾)` 只用於編輯畫面 agenda。
- 人員連結欄位（個案編號/平台個案ID）、B 表彙總、簽到=min/簽退=max、報到方式＝人工補登：全部不變。
- DB schema 不變（settings store 的 `scenarioConfig:<id>`，內容由 serviceRecord 換 schedule）。

---

## § 5 影響的檔案

| 檔案 | 動作 |
|---|---|
| `shared/schedule-resolve.js` | 新增：`resolveServiceRecord` + `buildScheduleAgenda`（純函式） |
| `tests/schedule-resolve.test.js` | 新增：解析優先序、邊界、agenda 排版測試 |
| `shared/face-store-config.js` | `putScenarioConfig` 改存 `schedule`（取代 `serviceRecord`）；getter 對舊 serviceRecord 記錄做相容（見 §6） |
| `shared/face-checkin-template.js` | 載入 schedule；寫 event 前 `resolveServiceRecord(schedule, Date.now())` 戳 serviceRecord |
| `shared/admin/admin-tab-config.js` | 改寫為 agenda 排程編輯器 |
| `configs/example-checkin.json` | `serviceRecord` 改為 `schedule`（seed 用，含 1~2 條範例 weekly 規則） |
| `service-worker.js` | APP_SHELL 加 `schedule-resolve.js`，bump VERSION |

`report-aggregate.js`、`admin-tab-report.js`、`admin-tab-people.js`、`app.css` 不需改。

---

## § 6 舊資料相容

先前已上線的 `scenarioConfig` 記錄是 `{ serviceRecord: {...} }`（無 schedule）。`face-checkin-template.js` 載入時：若記錄有 `schedule` 用之；否則若有舊 `serviceRecord`，視為「全時段套用同一組」的單一隱含規則（不分時段，任何報到都套用），確保升級不丟資料。例範 config seed 直接用新 `schedule` 格式。

---

## § 7 Scope

單一 feature（情境設定改排程）。實作可一段完成：純解析模組（含測試）先行，再串 checkin、最後改編輯畫面。
