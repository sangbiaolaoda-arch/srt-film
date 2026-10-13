# srt-film

贴入字幕（SRT），得到一部逐拍演出的片子。浏览器内 GSAP 播放，可导出 MP4。

[![license](https://img.shields.io/badge/license-MIT-blue)](LICENSE)
![typescript](https://img.shields.io/badge/typescript-5.5-blue)
![vite](https://img.shields.io/badge/vite-5.4-purple)
![node](https://img.shields.io/badge/node-%E2%89%A518-green)

> **姊妹项目** — Agent 侧的 Python 实现见
> [`srt-media-director`](https://github.com/sangbiaolaoda-arch/srt-media-director)
> （110 套排版蓝图 / Visual DSL / 可验证渲染闭环）。
> 本仓库是**浏览器内运行的 TypeScript 参考实现**：零后端、打开页面即用、播放与导出同源。

四条核心理念：

1. **诚实约束** — 画面里出现的每个数字都必须能在旁白原文中找到，机器门禁强制执行，违规则拒绝播放。
2. **逐拍导演稿** — 每拍一个画面。自动规划可以被导演覆写，覆写永远优先。
3. **机器门禁** — 违反诚实约束或安全区（headline 显示宽度 > 16）即构建失败，不静默降级。
4. **画面零标点** — 上画面的一切文字不带标点符号。SRT 里的标点在渲染层统一换成空格
   （**源文件可以照常带标点**），空格成为天然的断行与停顿点。槽位版式与专属场景都在覆盖范围内，
   测试逐版式、逐场景断言。

## 用法

```bash
npm install
npm run dev        # 打开浏览器
```

左侧贴入 SRT → 「载入并规划」→ 播放 / 拖动进度条 / 点击拍列表跳转 → 「导出 MP4」。

## 导演覆写

key 为拍序号（从 1 开始）。覆写永远优先于自动规划。

```json
{
  "4": { "headline": "更短的标题", "layoutId": "nm-big-number", "bigNumber": "120毫秒", "source": "耗时120毫秒" }
}
```

| 字段 | 作用 |
| --- | --- |
| `layoutId` | 指定版式 id（见 `src/layouts/catalog.ts`，如 `st-huge-word` / `nm-big-number` / `ch-bar-v`），覆写自动挑选 |
| `layout` | 内联完整版式对象（专属场景的壳版式），**优先级高于 `layoutId`** —— `custom` 字段命中 `src/layouts/kaojin.tsx` / `wangji.tsx` 的场景注册表时，整拍由该场景渲染、`slots` 被绕过 |
| `slots` | 槽级覆写 `{ 槽序号: 要合并进该槽的字段 }`：放大图形槽的 `box`、换 `figure` 种类、改字号等。只作用于本拍的版式副本，不写回 `LAYOUT_BY_ID` |
| `animations` | 槽级入场动效覆写 `{ 槽序号: 动效 id }`（id 见 `src/motion/catalog.ts`，共 60 个）。缺省的槽仍按版式自带 `enter` 池轮转 |
| `style` | 强制视觉风格：`editorial`（纸白朱红）/ `poster`（暗底电光青绿）。会写进渲染用的 `layout.style`，底色与调色板随之切换 |
| `headline` / `bigNumber` / `source` / `left` / `right` | 文案与画面主数字 |

内联 `layout` 对象里另可写（专属场景片用）：

| 字段 | 作用 |
| --- | --- |
| `custom` | 场景 id。命中注册表 → 整拍交给该场景，画面与断行由场景自己负责 |
| `paper` | 底色（场景自绘 surface 时作为兜底） |
| `decor` | `false` 关掉母版装饰层（点阵 / 四角角标 / 底部进度条）。专属场景片应关 |
| `fx` | canvas 粒子特效，`"none"` 关闭 |
| `transition` / `exit` | 本拍的入场转场与出场动效 id（缺省按 `stage` 的轮转序列取） |

- 覆写 `bigNumber` 时必须给 `source`（包含该数字的原文片段），否则门禁拒绝

样例：`examples/01-overrides.json`（最简）/ `examples/05-overrides.json`（60 秒样片，槽级动效覆写）/
`examples/06-kaojin-v6.json`（图形当主角 + 转海报风）/ `examples/07-kaojin-v7.json`（23 拍全点名专属场景）/
`examples/08-forgetting-20s.json`（5 拍全手绘，关装饰层 + 按语义指定转场）。

## 分拍规则（可解释，无黑箱）

1. cue 以句末标点（。！？!?…）收尾 → 收拍
2. 拍时长 ≥ 6 秒且 cue 以停顿标点收尾 → 收拍
3. cue 间隔 > 0.5 秒 → 换景收拍
4. 拍正文 ≥ 28 字 → 按 cue 边界硬切
5. **无标点的 cue → 一条 cue 即一拍**（配合「画面零标点」：标点全换空格后，
   cue 边界就是拍边界，作者用空行分拍）

## 测试与检查

```bash
npm test           # vitest
npm run check      # tsc + HTML 内联脚本语法门禁 + vitest
```

CI 跑两件事（`.github/workflows/qa.yml`）：上表这套「代码层门禁」，以及**真浏览器逐帧
验收**样片 —— 后半段挡的是单元测试覆盖不到的失效（某一拍全黑 / 爆白、同一时刻两次渲染
不一致、验收工具的判定逻辑被改坏），并与仓库里的基线快照比**结构层**。
为什么只比结构层、为什么不判「这一拍没动」，两个理由都写在
`docs/流程-确定性动画与逐帧验收.md` §6。

## 制作流程与工具

三层文档：一层管「讲什么」，一层管「怎么渲」，一层管「一个图形怎么画」。

- **`docs/流程-叙事与信息设计.md`** — 这一拍该不该这么讲。事实与视觉隐喻分离记账、
  镜头表的 `forbidden` 字段、一个运动值不值得存在的六个问题、六种运动关系、
  镜间连续性的六种传递、反 PPT 检查表。每条都标注 `[可判定]`（能落成检查）
  还是 `[需人看]`（只能靠判断，但给出具体的自问）。
- **`docs/流程-确定性动画与逐帧验收.md`** — 确定性时间轴的三个契约、画面操控分层与
  时间轴原语、逐帧验收流水线、实锤坑清单。做新的视觉页面从这份文档入手。
- **`docs/画法手册/`** — 第三层：管「一个图形具体怎么画出来」。八份手册（入口
  `00-速查总览.md`：选型决策树 + 35 条反模式）+ 15 个可双击打开的片段页（snippets/），
  覆盖 SVG / Canvas / 纯 CSS / 动效编排 / 图表代码画法 / 3D 与着色器 / 经典案例拆解。
  给版式与图形层写代码前先查总览，不要凭记忆写 SVG —— 本项目踩过的嵌套 `<svg>` 不接
  x/y、defs id 多拍共存冲突、ambient yoyo 撑爆时间线三条坑都在总览的反模式清单里。

工具：

- **`npm run lint:html`** — 抽出 HTML 内联 `<script>` 做语法门禁（单文件片子没有构建
  步骤，这是挡住「改坏一个括号 → 全片白屏」的唯一关卡）。
- **`npm run qa:frames`** — 无头浏览器逐帧验收。每镜取 5 个采样点（起始 / 25% / 50% /
  75% / 结束前），自动识别 `window.__tl` / `__stage` / `__VIDEO_TEST__`（第三种是
  外部项目的通用写法，此时场景表从 DOM 的 `section.scene[data-start/data-end]` 读），
  量四种失效：YAVG 抓「全黑 / 爆白」，**结构差 Δ 抓「这一拍根本没动」**，
  **重复渲染差抓「看着能播、实际不能导出」**。
  产出 `report.md` + `report.json` + 接触印相。
- **`npm run qa:still`** — 把「某一拍没动」当失败，可用于 CI。⚠ 用在具体片子上之前先
  确认门槛对那种画面成立：Δ 对 canvas 几何渐变偏钝，样片「结论」场只有 1.128 < 1.2，
  而且它对采样密度敏感（同场 `--per-scene 3` 是 0.927、`4` 是 1.972）。见文档 §3③。
- **`npm run qa:det`** — 同一时刻渲染两次比像素，把非确定性当失败，可用于 CI。
- **`--roi x,y,w,h`** — 只测主图那块画面。治「主图在动、但只占一角，被静止背景
  平均掉」——实测 ROI 内幅值是整帧的 1.5~3.1 倍。做 ROI 分析时要配 `--selector`。
  量法与校准见文档 §3④⑤。
- **`--baseline <report.json>` + `--fail-on-drift`** — 验收**工具自己**：改 `qa-frames`
  之前跑一次存基线，改完用同一命令比。判据是「**判定结果是否相同**」而不是数值逐位
  相同 —— 截图有子像素渲染抖动，实测同一份代码连跑三次，同一帧亮度漂在
  28.6004~28.6007。跨环境比（本机基线拿到 Linux CI）要加 `--baseline-scope struct`，
  只比与像素无关的结构层。见文档 §3⑥。
- **`examples/reference/light-lag.qa-baseline.json`** — 上面那条用的基线快照，
  由 CI 里逐字相同的那条命令生成（去掉 `--baseline*` 三个参数即可重生成）。
- **`examples/reference/`** — 《光很慢 LIGHT LAG》45 秒单文件科普片，上面每条契约的
  可跑样本。
- **`examples/05-kaojin-60s.srt` + `examples/07-kaojin-v7.json`** — 60 秒样片：24 条 cue
  / 23 拍，全部点名 `src/layouts/kaojin.tsx` 里的专属场景（不复用 catalog 版式库），
  演示「一拍一幅手绘满版画面 + 内联 `layout` 覆写」这条通路。同题的
  `05-overrides.json`（槽级动效覆写）、`06-kaojin-v6.json`（图形放大 + 转海报风）
  记录了从「图形浮在纸上」到「图形当主角」的两次改法。
- **`examples/08-forgetting-20s.srt` + `.json`** — 20 秒抽象概念片（《遗忘》）：5 拍全点名
  `src/layouts/wangji.tsx` 的手绘场景，关掉母版装饰层与粒子特效，转场按语义逐拍指定
  （裂缝展开 / 关合 / 光扫）。SRT 故意保留标点，用来验证「源带标点 → 画面零标点」。
  语义色不命中通用词表，走片级词表（`emphasize(text, extra)`）。
