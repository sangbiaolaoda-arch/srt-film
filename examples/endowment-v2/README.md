# 禀赋效应 · 叙事短片（endowment-v2 / v3 美术）

4 分 13 秒、无音轨、纯 SVG 逐帧渲染的说明性短片。数据源：`../12-endowment-effect.srt`（138 条字幕）。

## 跑起来

```bash
# 任意静态服务器指向本目录（ES modules 必须走 http，不能 file://）
npx serve .          # 或 python -m http.server
```

`index.html` → 自动播放；`window.__tl` 可直接 seek：

```js
window.__tl.pause(); window.__tl.seek(60); window.__updateOverlay(60);
```

## 出片

```bash
# 1280×720 / 24fps（默认）
node tools/render-cdp.mjs

# 1920×1080（矢量重渲染，不是放大）
node tools/render-cdp.mjs --scale 1.5

# 只渲一段（并行分片时用；--port 避免 CDP 端口冲突）
node tools/render-cdp.mjs --from 0 --to 84.5 --port 9371 --out out/part1.mp4
```

产物：`out/endowment_effect_v3.mp4` + `out/contact_sheet_v3.jpg`（8×5 接触印相）。
不依赖 agent-browser：本机 Chrome 的 CDP（node 24 自带 WebSocket）。

## 验收

```bash
node tools/verify-v2.mjs          # 布局碰撞 / 文字出血 / 字幕带 / 确定性 → 4 项
node tools/gen-storyboard-cues.mjs --check   # CUES 与 SRT 是否漂移
```

## 结构

| 文件 | 只负责 |
| --- | --- |
| `src/storyboard.js` | CUES（SRT 生成）+ 40 幕切分（cue 区间、机位、转场） |
| `src/palette.js` | 色板 + 空间/光 token + 色彩脚本（ACTS/SCENE_ART/STAGE） |
| `src/backgrounds.js` | 6 种环境 × 5 调色动作；地面/雾/光池/微尘 |
| `src/components.js` | 主体组件（人/杯/币/卡/天平等），三值 + 落地影 + 边缘光 |
| `src/illustrations.js` | 40 幕构图（画面里有什么、在哪里） |
| `src/choreography.js` | 幕内运动（让位/迟入场/强调/揭示） |
| `src/app.js` | 装配、主时间轴、字幕系统、导出钩子 |
| `src/charts.js` | 规范图表（选型见 `docs/chart-method.md`） |

美术规则与前后对比：`docs/art-direction.md`；管线防坑：`docs/conventions.md`。
