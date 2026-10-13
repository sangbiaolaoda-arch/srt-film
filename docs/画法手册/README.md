# 画法手册

「一个图形具体怎么画出来」这一层的操作手册。来源：2026-10-13 用 agent-reach 抓取 31 篇
权威源（MDN、Sara Soueidan、CSS-Tricks、Emil Kowalski、GSAP、D3/Chart.js/ECharts、
three.js manual、The Book of Shaders、Ciechanowski、Red Blob Games、Codrops）蒸馏而成。

## 怎么用

1. **先查 [`00-速查总览.md`](00-速查总览.md)**：选型决策树（要画 X 该用 SVG / Canvas /
   CSS / 着色器哪条路）+ 35 条反模式清单。30 秒定路线，再进对应分册。
2. 手册里的每条技法都带可复制的最小代码；配套的 **`snippets/` 下 15 个自包含 HTML**
   双击就能看效果（viewBox 陷阱对照、合成模式网格、缓动曲线赛跑、确定性时间轴、
   手绘图表、WebGL 距离场等），改参数比读文字快。

## 分册

| 分册 | 覆盖 | 什么时候读 |
| --- | --- | --- |
| [01-SVG画法](01-SVG画法.md) | viewBox/路径语法/渐变图案/裁剪遮罩/线条生长（30 技法） | 写 figures、版式装饰前 |
| [02-Canvas画法](02-Canvas画法.md) | 状态机/变换/合成模式/DPR/性能清单（44 技法） | 写海报风 canvas 特效前 |
| [03-纯CSS画图](03-纯CSS画图.md) | border 造形/clip-path/渐变画笔/filter（40 技法） | 页面 UI、画廊样式 |
| [04-动效编排](04-动效编排.md) | 缓动全表/时长经验值/GSAP timeline/确定性动画（37 技法） | 写 motion、调 enter/exit 前 |
| [05-图表代码画法](05-图表代码画法.md) | 数据→屏幕映射/手绘 SVG 图表/三库选型（46 技法） | 写 charts 前与选型时 |
| [06-3D与着色器](06-3D与着色器.md) | three.js 骨架/材质光照/SDF 形状函数（42 技法） | 上 3D 或 shader 特效前 |
| [07-经典案例拆解](07-经典案例拆解.md) | Ciechanowski/Red Blob/数据叙事/粒子系统（24 案） | 设计一版新画面找参考时 |

## 本项目踩过、总览反模式清单里有的三条坑

1. **嵌套 `<svg>` 不写 x/y 会落在父级原点**（01-SVG画法 §坐标系）—— figures 的图形
   曾经全部画到画布左上角就是这么来的。
2. **`<defs>` 的 id 在多拍共存 DOM 里会冲突**（01-SVG画法 §渐变与图案）—— 23 拍图层
   在同一份 SVG 里，两个渐变共用 id 时后者被前者污染；figures 已用 `useId()` 前缀根治。
3. **yoyo + repeat 的 ambient 会把 timeline 撑长一倍**（04-动效编排 §确定性动画）——
   实测把 61s 时间线撑到 136s、采样全错位；实现层已改传拍长的一半。
