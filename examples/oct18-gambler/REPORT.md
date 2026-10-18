# oct18-gambler 成片报告 ·《赌徒谬误》

## 1 · 验证记录

- verify-v2 **5/5**：布局碰撞 0 / 出血 0 / 字幕带 ✓ / 确定性 same / 幕中点不空场 33 幕全过（门禁 5 为向 jensen SOP 学习后新增）
- 逐幕截图 40 张（33 幕 + 7 个长幕 mid 帧）多轮目检，修 12+ 处（插画文字与字幕逐字重复 8 处、禀赋残留 2 处、barSeries 标签漏挂 growBars、lockBoxes 参数化）
- 渲染自检 **49/49**：分辨率/帧率/时长/容器/零黑帧（YAVG≤16.5 帧 0/4640）/确定性

## 2 · 零侵入留证

palette.js / blob-glow.js / camera.js / charts.js / layout.js 自 endowment-v2 复制后**逐字未改**（背景固定配方参数未动）；改动集中在 storyboard / illustrations / typography / components / backgrounds(TONE 表) 五个每片必改文件。

## 3 · 实测代价

| 项 | 值 |
|---|---|
| 源稿 | 81 句（E:/成品/10月18日.srt）→ 33 幕（2.45 句/幕） |
| 成片 | 1280×720 · 24fps · 4640 帧 · 193.13s · 17.91MB · 0.74 Mbps · crf20 |
| 渲染 | --seg 20 × 10 段 · 10m16s |
| 新增图元 | 9 个（roulette / diceTriple / slotMachine / brainScan / dotRow / coinStack / personBroke / bleedCoins / endlessLine / pressDown） |
| 工具 | gen-storyboard-cues（SRT→CUES）/ shoot-scenes（CDP 逐幕截图）/ verify-v2（五道门禁）/ render-cdp |

## 4 · 与 endowment-v2 的区别

全新 33 幕分镜与插画（轮盘/骰子/老虎机/脑扫描主题）；typography 全新词表（ACCENT/WARN/COOL/ICON_TRIGGERS）；5 个手工文字幕（s02/s10/s24/s31/s33）；backgrounds 三档 TONE（cool/neutral/warm 按剧情段）。构图零复用。

## 5 · 回滚

工程整体在 `examples/oct18-gambler/`（commit 4364626），删目录即回滚；主引擎修复另在 935cc00。

## 6 · 目录

```
examples/oct18-gambler/
├── src/（storyboard/illustrations/typography/components/backgrounds/app + 复用五件）
├── tools/（gen-storyboard-cues / shoot-scenes / verify-v2 / render-cdp）
├── docs/（conventions / art-direction / chart-method / 文字编排法则 / learned-from-jensen）
└── out/（成片 + shots/ + verify-report.json，不入库）
```

## 7 · 本次踩坑

- 删 JSX/模板串行后**尾逗号**必须复查：python 批量删 pill 行把 s14/s15 的 `,` 一起删了，整页 SyntaxError、verify「页面就绪 ✗」——用 node 直接 import 定位。
- lockBoxes 这类 v2 老组件**复制进新片必须过一遍语义**：双锁标签「杯子/巧克力」是禀赋效应残留，靠逐幕截图目检抓出后参数化。
- CDP `Page.captureScreenshot` 的 clip **必须含 scale:1**，否则 deserialize 失败。
- 片尾数秒变暗是全局淡出设计；判黑帧以 render-cdp 的 YAVG 门禁为准，别被印相缩略图吓到。
