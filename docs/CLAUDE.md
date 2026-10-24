# YT Ocean Travel — 開發規範

專案架構見 [ARCHITECTURE.md](ARCHITECTURE.md)。

## 開發前先查 three.js 官方資料

做任何功能開發或修改（模型、材質、燈光、特效、鏡頭、效能）之前，先查 three.js 官方資料，照官方做法實作：

1. **官方教學（Manual）**：https://threejs.org/manual/ ，先看相關主題的原理與建議做法。
2. **函式庫說明（Docs）**：https://threejs.org/docs/ ，確認要用的類別、參數與預設值，不要憑印象猜參數。
3. **官方範例（Examples）**：https://threejs.org/examples/ ，找功能最接近的範例，參考它的原始碼結構與寫法（原始碼在 https://github.com/mrdoob/three.js/tree/r180/examples ）。

注意事項：
- 專案用的是 **three.js r180**（`node_modules/three`），查文件與範例時以 r180 為準；新版才有的 API 不能直接用。
- 官方已提供的元件優先使用，不自己重寫：例如 `three/examples/jsm/` 下的 `RoomEnvironment`、`BufferGeometryUtils.mergeGeometries`、`RoundedBoxGeometry`、`Water`、`Sky`。
- 幾何優先用官方幾何類別組合：`LatheGeometry`（旋轉體）、`ExtrudeGeometry` + `Shape.holes`（挖孔的牆、拱門）、`TubeGeometry`（曲線管）、`InstancedMesh`（大量重複物件）。
- 大量網格要合併或用 InstancedMesh 減少 draw call（見官方 Manual 的 Optimizing 章節）。
- 開發完成要實際在遊戲裡截圖確認，不只看程式碼。

## 其他規則

- 回覆使用繁體中文，精簡。
- 未經要求不 git commit / push。
- 改完原始碼要重新打包（指令見 ARCHITECTURE.md「開發」一節），打包會自動更新 `index.html` 的版本號。

## 目錄與指令

以下指令皆從專案根目錄執行。根目錄只保留 Mac／Windows 啟動檔；文件放 `docs/`、開發與伺服器腳本放 `scripts/`、測試放 `tests/`、網站及資產放 `dist/`。隱藏的版本控制與工具設定保留原位。
