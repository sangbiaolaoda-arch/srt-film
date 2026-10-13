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

三条核心理念：

1. **诚实约束** — 画面里出现的每个数字都必须能在旁白原文中找到，机器门禁强制执行，违规则拒绝播放。
2. **逐拍导演稿** — 每拍一个画面。自动规划可以被导演覆写，覆写永远优先。
3. **机器门禁** — 违反诚实约束或安全区（headline 显示宽度 > 16）即构建失败，不静默降级。

## 用法

```bash
npm install
npm run dev        # 打开浏览器
```

左侧贴入 SRT → 「载入并规划」→ 播放 / 拖动进度条 / 点击拍列表跳转 → 「导出 MP4」。

## 导演覆写

key 为拍序号（从 1 开始）：

```json
{
  "4": { "headline": "更短的标题", "layout": "number", "bigNumber": "120毫秒", "source": "耗时120毫秒" }
}
```

- `layout`: `statement`（大字陈述）/ `number`（数字焦点）/ `contrast`（左右对照）
- 覆写 `bigNumber` 时必须给 `source`（包含该数字的原文片段），否则门禁拒绝
- 样例：`examples/01-overrides.json`

## 分拍规则（可解释，无黑箱）

1. cue 以句末标点（。！？!?…）收尾 → 收拍
2. 拍时长 ≥ 6 秒且 cue 以停顿标点收尾 → 收拍
3. cue 间隔 > 0.5 秒 → 换景收拍
4. 拍正文 ≥ 28 字 → 按 cue 边界硬切

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

两层文档：一层管「讲什么」，一层管「怎么渲」。

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
