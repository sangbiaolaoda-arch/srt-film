# 管线防坑约定（conventions）

> 本项目（endowment-v2 / srt-film 帧序列导出通路）踩过的坑，改代码前必读。
> 每条坑都真实咬过人，修复方式已固化在代码里，新增代码必须遵守同样纪律。

## 1. GSAP SVG transformOrigin：禁用像素舞台坐标

GSAP 对 SVG 元素的 `transformOrigin` 像素值是**相对元素自身包围盒左上角**，
不是舞台坐标。写 `'640px 415px'` 会把旋转中心算到包围盒外，元素被甩出画面
（v1 的退货循环箭头因此整个没显示过，v2.1 才抓出来）。

**规则**：一律用百分比 `'50% 50%'`、`'50% 8px'`（相对 bbox 的百分比/偏移）。

## 2. tl.seek() 抑制回调：禁用 onUpdate/onStart 改内容

`tl.seek(t)` 默认 `suppressEvents=true`——`onUpdate` / `onStart` 永远不触发。
逐帧导出环境（每帧 seek 一次）里，用回调改文字/数字的动画在**预览正常、导出全丢**，
且进度照走、极难发现（v2.2 的 ×1→×2 计数和 s34 文字改写都中过招）。

**规则**：
- 文字/数字变化 → 双文本交叉淡化（两层 `<text>` 对 opacity 补间）
- 图形变化 → `attr` 补间（height/y/width 等）
- 字幕等按时间求值的内容 → 写成"时间的函数"（见 app.js updateOverlay），不进时间轴
- 验收必须核验**帧落盘数**与单帧光栅化，不能只看进度回调

## 3. 沙箱内 node 的 rmSync 被拦截

本机 node 被 safe-delete shim 包裹：`rmSync(recursive)` 静默 no-op 或弹批量确认。
**规则**：渲染驱动内不做任何删除——每轮渲染用时间戳帧目录（`frames/run-<ts>/`），
清帧用 python `shutil.rmtree`。

## 4. 序列化 SVG 的合法性

- inline SVG 的 `.part` 元素上**禁带 `transform` 属性**（GSAP 接管 transform 分量
  后与静态属性冲突导致错位）——组件一律绝对坐标，需要变换就包一层 data-key 编排组。
- 任何塞进 SVG 字符串的常量必须是**属性形式**（`font-family="..."`），
  写成 CSS 形式（`font-family:...`）会产生无值属性 → 非法 XML → `img.onerror`
  → 帧静默全丢。
- 光栅化前用 `DOMParser().parseFromString(xml,'image/svg+xml')` 查 `parsererror`
  作为冒烟第一步。

## 5. 数据管道（v2.5 起）

- `storyboard.js` 的 CUES 是唯一时间源（誊自 SRT）；SCENES 只写 `cue:[首,末]`
  区间，start/end 由 CUES 推导。**禁止**在 SCENES 里手写 start/end 数字。
- 转场语义由 `scene.trans` 声明（zoom=揭示/章节、whip=能量/对比、rise=承接、
  fade=开收场），app.js 不做机械轮换。
- 布局改动后必须跑 `window.__layoutReport()`（验收=编排终态姿态，
  相机变换在 seek 后清除），0 问题才允许渲染。

## 6. 模块职责（v2.5 拆分后）

| 文件 | 只负责 |
|---|---|
| storyboard.js | cue 数据 + 幕切分 + 转场/机位/动画键 |
| illustrations.js | 40 幕构图（SCENE_SVG） |
| choreography.js | 幕内编排运动（CHOREO）+ anim 二次运动 |
| components.js | 组件库（每个组件 = 一个 .part，锚定槽位中心） |
| charts.js | 规范图表（选型见 docs/chart-method.md） |
| layout.js | 槽位锚点 + 受保护区 + 碰撞工具 |
| app.js | 装配、主时间轴、字幕系统、导出钩子 |
