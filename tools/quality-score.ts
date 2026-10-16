// 十维记分卡 —— docs/project/visual-quality-rubric.md 的实现（项目档案 §6 落地）。
//
// 它回答「这条管线现在到底好不好」：把十个维度逐一落到证据上 ——
// 机器能判的走门禁（plan / constraint-audit / motion-audit / phase10-qa / visual-ab / ffprobe / 测试日志），
// 机器判不了的标「待人工」，绝不拍脑袋编分。混合维度只出机器层分数，主观锚点由盲评补齐。
//
// 用法:
//   node tools/run-ts.mjs tools/quality-score.ts [--corpus 01,03] [--mp4 f.mp4,...] \
//       [--phase10 .tmp/phase10/report.json] [--vab .tmp/vab-09/report.json,...] \
//       [--tests .tmp/quality-check.log] [--out .tmp/quality]
//   --corpus 缺省 = examples/ 下全部 .srt（按文件名前缀过滤，如 01,03,09）
//   --phase10 / --vab 缺省 = 自动发现 .tmp/phase10/report.json 与 .tmp/vab-*/report.json
//   --tests   = npm run check 的日志（含末尾 exit=0）
// 退出码：任一**自动维度** < 3 分 → 1；否则 0。待人工维度不影响退出码（它们本来就等人）。

import { readFileSync, readdirSync, existsSync, writeFileSync, mkdirSync } from "node:fs";
import { resolve, join } from "node:path";
import { execFileSync } from "node:child_process";
import { plan } from "../src/core/plan";
import { LAYOUTS } from "../src/layouts/catalog";
import { checkLayout } from "../src/layouts/constraints";
import type { RenderContent } from "../src/layouts/types";
import { buildMotionSchedule, slotTweens, type MotionPlan } from "../src/motion/schedule";
import { slotConflicts, describeConflict } from "../src/motion/conflict";
import type { Layout } from "../src/layouts/types";

const root = resolve(import.meta.dirname, "..");
const argOf = (k: string, d: string): string => {
  const i = process.argv.indexOf(k);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1]! : d;
};

/* ------------------------------- 证据收集 -------------------------------- */

type Dim = {
  id: string;
  name: string;
  type: "auto" | "hybrid" | "manual";
  score: number | null;
  basis: string;
  evidence: string[];
  pending?: string;
};

const dims: Dim[] = [];
const push = (d: Dim) => dims.push(d);

/* ① 规划干跑（进程内直接调 plan，与 plan-dry 同源） ------------------------- */
const corpusArg = argOf("--corpus", "");
const want = corpusArg ? new Set(corpusArg.split(",").map((s) => s.trim())) : null;
const srtFiles = readdirSync(join(root, "examples"))
  .filter((f) => f.endsWith(".srt"))
  .sort()
  .filter((f) => !want || want.has(f.split("-")[0]!));

type CorpusRow = {
  file: string;
  ov: boolean;
  shots: number;
  layouts: number;
  problems: string[];
  warnings: string[];
  styles: string;
  continuity: number;
  roles: string;
  planError?: string;
};
const corpusRows: CorpusRow[] = [];
for (const f of srtFiles) {
  const stem = f.replace(/\.srt$/, "");
  const ovPath = join(root, "examples", `${stem}.json`);
  const ovRaw = existsSync(ovPath) ? readFileSync(ovPath, "utf8") : "";
  try {
    const r = plan(readFileSync(join(root, "examples", f), "utf8"), ovRaw);
    const tally: Record<string, number> = {};
    for (const s of r.shots) tally[s.layout.style ?? "editorial"] = (tally[s.layout.style ?? "editorial"] ?? 0) + 1;
    const roles: Record<string, number> = {};
    for (const s of r.shots) {
      const role = s.narrative?.role ?? "?";
      roles[role] = (roles[role] ?? 0) + 1;
    }
    corpusRows.push({
      file: f,
      ov: ovRaw !== "",
      shots: r.shots.length,
      layouts: new Set(r.shots.map((s) => s.layout.id)).size,
      problems: r.problems,
      warnings: r.warnings ?? [],
      styles: Object.entries(tally).map(([k, v]) => `${k}×${v}`).join(" "),
      continuity: r.shots.filter((s) => s.continuity?.length).length,
      roles: Object.entries(roles).map(([k, v]) => `${k}×${v}`).join(" "),
    });
  } catch (e) {
    corpusRows.push({
      file: f, ov: false, shots: 0, layouts: 0, problems: [`规划崩：${(e as Error).message}`], warnings: [], styles: "-", continuity: 0, roles: "-", planError: (e as Error).message,
    });
  }
}
const problemsTotal = corpusRows.reduce((n, r) => n + r.problems.length, 0);
const warningsTotal = corpusRows.reduce((n, r) => n + r.warnings.length, 0);
const shotsTotal = corpusRows.reduce((n, r) => n + r.shots, 0);

/* ② 版式约束审计（与 constraint-audit.tsx 同一判据：全量槽位版式 + 演示内容） */
const demo: RenderContent = {
  headline: "系统自动规划视觉内容",
  bullets: ["第一要点", "第二要点", "第三要点"],
  numbers: [85, 120, 3.2],
  bignum: "85",
  beat: 1,
};
const slotLayouts = LAYOUTS.filter((l) => !l.custom);
let auditErrs = 0;
let auditWarns = 0;
const auditMsgs: string[] = [];
for (const l of slotLayouts) {
  const r = checkLayout(l, demo);
  auditErrs += r.errors.length;
  auditWarns += r.warnings.length;
  for (const e of r.errors) auditMsgs.push(`ERR ${l.id}: ${e}`);
  for (const w of r.warnings) auditMsgs.push(`WRN ${l.id}: ${w}`);
}

/* ③ 运动审计（与 motion-audit [B] 同判据：真实语料 plan → schedule → 槽级冲突/越界） */
function overruns(layout: Layout, mp: MotionPlan): string[] {
  const out: string[] = [];
  const shotEnd = mp.at + mp.dur;
  layout.slots.forEach((slot, k) => {
    for (const tw of slotTweens(mp, k, slot)) {
      const over = tw.at + tw.dur - shotEnd;
      if (over > 0.01) out.push(`槽${k} ${tw.motion}(${tw.role}) 超出 ${over.toFixed(2)}s`);
    }
  });
  return out;
}
let motionConflicts = 0;
let motionOverruns = 0;
const motionMsgs: string[] = [];
for (const f of srtFiles) {
  const stem = f.replace(/\.srt$/, "");
  const ovPath = join(root, "examples", `${stem}.json`);
  const ovRaw = existsSync(ovPath) ? readFileSync(ovPath, "utf8") : "";
  let shots;
  try {
    shots = plan(readFileSync(join(root, "examples", f), "utf8"), ovRaw).shots;
  } catch {
    continue; // 规划已崩的语料在①记过，这里不重复计
  }
  const { plans } = buildMotionSchedule(shots);
  plans.forEach((p, i) => {
    const layout = shots[i]!.layout;
    for (const c of slotConflicts(layout, p)) {
      motionConflicts++;
      if (motionMsgs.length < 8) motionMsgs.push(`[冲突] ${f} 拍${shots[i]!.content.beat} ${layout.id} ${describeConflict(c)}`);
    }
    for (const o of overruns(layout, p)) {
      motionOverruns++;
      if (motionMsgs.length < 8) motionMsgs.push(`[越界] ${f} 拍${shots[i]!.content.beat} ${layout.id} ${o}`);
    }
  });
}

/* ④ phase10-qa 报告（A–F + G1 数字守恒） ------------------------------------- */
const phase10Path = argOf("--phase10", "") || (existsSync(join(root, ".tmp/phase10/report.json")) ? ".tmp/phase10/report.json" : "");
let p10: { cases: string[]; failures: { caseId: string; name: string; detail: string }[]; warnings: { caseId: string; name: string; detail: string }[] } | null = null;
if (phase10Path && existsSync(resolve(root, phase10Path))) {
  p10 = JSON.parse(readFileSync(resolve(root, phase10Path), "utf8"));
}
const g1Fails = p10 ? p10.failures.filter((f) => f.name.includes("G1")) : [];

/* ⑤ visual-ab 报告（四层像素存在性 + 覆盖率） -------------------------------- */
const vabArg = argOf("--vab", "");
let vabPaths: string[] = [];
if (vabArg) {
  vabPaths = vabArg.split(",").map((s) => s.trim()).filter(Boolean);
} else {
  const vabDir = join(root, ".tmp");
  if (existsSync(vabDir)) {
    vabPaths = readdirSync(vabDir)
      .filter((d) => /^vab-/.test(d))
      .sort()
      .map((d) => `.tmp/${d}/report.json`)
      .filter((p) => existsSync(resolve(root, p)));
  }
}
type VabReport = { srt: string; rows: { beat: number; layer: string; ok: boolean; motion?: number; why?: string }[]; coverage: { layer: string; n: number; beats: number[] }[] };
const vabs: { path: string; r: VabReport }[] = [];
for (const p of vabPaths) {
  try {
    vabs.push({ path: p, r: JSON.parse(readFileSync(resolve(root, p), "utf8")) });
  } catch {
    /* 读不动的证据按不存在处理 —— 不猜 */
  }
}

/* ⑥ MP4 探测（ffprobe，与 phase10-qa 同一可执行；--mp4 可传逗号分隔的多个文件） */
const FFPROBE = "E:\\WorkBuddy\\tools\\ffprobe.exe";
const PRESETS = new Set(["1280x720", "1920x1080", "2560x1440"]);
const mp4Args = argOf("--mp4", "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);
const mp4Checks: { name: string; ok: boolean; detail: string }[] = [];
for (const mp4Path of mp4Args) {
  if (!existsSync(resolve(root, mp4Path))) {
    mp4Checks.push({ name: "文件存在", ok: false, detail: mp4Path });
    continue;
  }
  try {
    const out = execFileSync(
      FFPROBE,
      ["-v", "error", "-show_entries", "stream=codec_type,codec_name,width,height,r_frame_rate", "-show_entries", "format=duration,nb_streams", "-of", "json", resolve(root, mp4Path)],
      { encoding: "utf8" },
    );
    const j = JSON.parse(out);
    const vs = (j.streams ?? []).filter((s: { codec_type: string }) => s.codec_type === "video");
    const dur = Number(j.format?.duration ?? 0);
    const fps = vs[0] ? Number(vs[0].r_frame_rate.split("/")[0]) / Number(vs[0].r_frame_rate.split("/")[1] || 1) : 0;
    const dimsOk = vs[0] ? PRESETS.has(`${vs[0].width}x${vs[0].height}`) : false;
    const tag = `[${mp4Path.split("/").pop()}]`;
    mp4Checks.push(
      { name: `${tag} 可探测（封装/索引完好）`, ok: true, detail: `${dur.toFixed(2)}s` },
      { name: `${tag} 单一视频流、无音轨`, ok: vs.length === 1 && (j.streams ?? []).length === 1, detail: `流数 ${(j.streams ?? []).length}（视频 ${vs.length}）` },
      { name: `${tag} 编码 h264`, ok: vs[0]?.codec_name === "h264", detail: String(vs[0]?.codec_name) },
      { name: `${tag} 分辨率属导出档位`, ok: dimsOk, detail: `${vs[0]?.width}×${vs[0]?.height}` },
      { name: `${tag} 帧率属标准档`, ok: [24, 30, 60].includes(Math.round(fps)), detail: `${fps.toFixed(2)}fps` },
    );
  } catch (e) {
    mp4Checks.push({ name: `[${mp4Path.split("/").pop()}] 可探测（封装/索引完好）`, ok: false, detail: `ffprobe 失败：${(e as Error).message.slice(0, 120)}` });
  }
}

/* ⑦ 测试日志（npm run check 的输出，末尾 exit=0） ---------------------------- */
const testsPath = argOf("--tests", "");
let testsOk: boolean | null = null;
let testsBrief = "未提供测试日志（--tests）";
if (testsPath && existsSync(resolve(root, testsPath))) {
  const log = readFileSync(resolve(root, testsPath), "utf8");
  const m = log.match(/(\d+) 个测试文件全部通过/);
  testsOk = /全部通过/.test(log) && /exit=0/.test(log) && !/FAIL|failed/i.test(log.replace(/0 failed/g, ""));
  testsBrief = m ? `${m[1]} 个测试文件全部通过 · exit=0` : testsOk ? "日志含「全部通过 / exit=0」" : "日志未见全绿标记";
}

/* ------------------------------- 十维评分 -------------------------------- */
// 映射规则与 docs/project/visual-quality-rubric.md §三 一一对应，改规则必须同源改两处。

// 1 语义准确（自动）
if (p10) {
  push({
    id: "semantic", name: "语义准确", type: "auto",
    score: g1Fails.length === 0 ? 5 : 1,
    basis: g1Fails.length === 0 ? `phase10-qa（${p10.cases.join(",")}）A–F + G1 数字守恒 0 违规` : `G1 违规 ${g1Fails.length} 条`,
    evidence: [
      `phase10-qa 语料 ${p10.cases.join(",") || "（空）"} · 失败 ${p10.failures.length} · 告警 ${p10.warnings.length}`,
      ...g1Fails.slice(0, 3).map((f) => `G1：${f.detail}`),
    ],
    pending: "G1 只覆盖数字守恒；专名与事实漂移需 findings 式人工核查",
  });
} else {
  push({ id: "semantic", name: "语义准确", type: "auto", score: null, basis: "未提供 phase10-qa 报告", evidence: [], pending: "跑 node tools/phase10-qa.mjs 后重出记分卡" });
}

// 2 叙事推进（人工）
push({
  id: "narrative", name: "叙事推进", type: "manual", score: null,
  basis: "主观维度，工具只附证据",
  evidence: [
    `语料 ${corpusRows.length} 条 / 共 ${shotsTotal} 拍`,
    `版式多样性：${corpusRows.map((r) => `${r.file} ${r.layouts}/${r.shots}`).join("；")}`,
    `角色分布：${corpusRows.map((r) => r.roles).join("；")}`,
    `连续性承接拍：${corpusRows.reduce((n, r) => n + r.continuity, 0)}`,
  ],
  pending: "镜头表审查 + 全片观看（人工盲评，≥10 人）",
});

// 3 构图与焦点（混合：约束层自动）
{
  const s = auditErrs > 0 ? 2 : auditWarns > 0 ? 4 : 5;
  push({
    id: "composition", name: "构图与焦点", type: "hybrid", score: s,
    basis: `版式约束审计：硬错误 ${auditErrs} / 告警 ${auditWarns}（${slotLayouts.length} 个槽位版式）`,
    evidence: [`${slotLayouts.length} 个槽位版式过 checkLayout`, ...auditMsgs.slice(0, 5)],
    pending: "关键帧盲评（主次/负空间/拥挤度）",
  });
}

// 4 图形质量（人工）
push({
  id: "graphics", name: "图形质量", type: "manual", score: null,
  basis: "主观维度，工具只附证据",
  evidence: [
    `版式多样性：${corpusRows.map((r) => `${r.file} ${r.layouts} 种`).join("；")}`,
    `槽位版式 ${slotLayouts.length} 个（constraint-audit 同口径）；v2 满版板与专属场景是 custom 通路，不在此审计范围`,
  ],
  pending: "关键帧 + 参考案例对照（人工）",
});

// 5 排版可读性（混合：门禁 problems 自动）
{
  const s = problemsTotal > 0 ? 2 : warningsTotal > 0 ? 4 : 5;
  push({
    id: "typography", name: "排版可读性", type: "hybrid", score: s,
    basis: `规划门禁 problems ${problemsTotal} / warnings ${warningsTotal}（超宽/分句/安全区类）`,
    evidence: corpusRows.flatMap((r) => r.problems.slice(0, 3).map((p) => `${r.file}: ${p}`)),
    pending: "字号/行距/对比/密度人工抽查",
  });
}

// 6 动画质量（混合：运动审计自动）
{
  const bad = motionConflicts + motionOverruns;
  const fxMotion = vabs.flatMap((v) =>
    v.r.rows
      .filter((r) => r.layer === "fx")
      .map((r) => `${v.r.srt.split("/").pop()} 拍${r.beat} 运动量 ${r.motion?.toFixed(3) ?? "—"}`),
  );
  push({
    id: "motion", name: "动画质量", type: "hybrid",
    score: bad > 0 ? 2 : 5,
    basis: `运动审计：属性冲突 ${motionConflicts} / 跑出拍外 ${motionOverruns}`,
    evidence: [
      ...motionMsgs,
      ...(p10 && p10.warnings.length ? [`phase10 告警：${p10.warnings.map((w) => w.name).join("；")}`] : []),
      ...fxMotion.slice(0, 6),
    ],
    pending: "慢放检查（运动是否有目的、是否自然）",
  });
}

// 7 镜头连续性（混合：visual-ab 像素存在性 + 覆盖率自动）
{
  const perCorpus = vabs.map((v) => {
    const cov = v.r.coverage.find((c) => c.layer === "continuity");
    const rows = v.r.rows.filter((r) => r.layer === "continuity");
    const bad = rows.filter((r) => !r.ok).length;
    return { path: v.path, srt: v.r.srt, n: cov?.n ?? 0, bad };
  });
  const zeroCov = perCorpus.filter((c) => c.n === 0);
  const badRows = perCorpus.filter((c) => c.bad > 0);
  const s = perCorpus.length === 0 ? null : zeroCov.length > 0 || badRows.length > 0 ? 2 : 5;
  push({
    id: "continuity", name: "镜头连续性", type: "hybrid", score: s,
    basis: perCorpus.length === 0
      ? "未提供 visual-ab 报告"
      : `visual-ab：${perCorpus.map((c) => `${c.srt.split("/").pop()} 覆盖${c.n}${c.bad ? ` 不过${c.bad}` : ""}`).join("；")}`,
    evidence: [
      ...perCorpus.map((c) => c.n === 0 ? `覆盖缺口（按门禁设计即失败）：${c.srt}` : `${c.srt} continuity 可测 ${c.n} 拍全过`),
    ],
    pending: "接触印相 + 全片观看（ghost 是否真的传递了信息）",
  });
}

// 8 风格一致性（混合：plan 风格判定 + problems 自动）
{
  const s = problemsTotal > 0 ? 2 : 5;
  push({
    id: "style", name: "风格一致性", type: "hybrid", score: s,
    basis: `规划门禁 problems ${problemsTotal}（风格错配/暗底黑字类会被拦）`,
    evidence: corpusRows.map((r) => `${r.file}：${r.styles}`),
    pending: "全片评审（差异是否有意图）",
  });
}

// 9 工程稳定性（自动）
if (testsOk === null) {
  push({
    id: "engineering", name: "工程稳定性", type: "auto", score: null,
    basis: "缺测试日志（--tests），无法自动评分",
    evidence: [
      `规划门禁 problems ${problemsTotal} · 版式审计 硬错误 ${auditErrs}/告警 ${auditWarns} · 运动审计 冲突 ${motionConflicts}/越界 ${motionOverruns}`,
    ],
    pending: "npm run check 存日志后加 --tests 重跑",
  });
} else {
  const comps: { name: string; ok: boolean; detail: string }[] = [
    { name: "tsc + 单元测试", ok: testsOk, detail: testsBrief },
    { name: "规划门禁（problems）", ok: problemsTotal === 0, detail: `${problemsTotal} 条` },
    { name: "版式约束审计", ok: auditErrs === 0, detail: `硬错误 ${auditErrs} / 告警 ${auditWarns}` },
    { name: "运动审计", ok: motionConflicts + motionOverruns === 0, detail: `冲突 ${motionConflicts} / 越界 ${motionOverruns}` },
    // 覆盖缺口不算工程缺陷（那是内容维度，归「镜头连续性」评 2 分）——
    // 这里只问「有报告的语料里，测过的每一行是否都非零」。
    { name: "视觉层存在性", ok: vabs.length > 0 && vabs.every((v) => v.r.rows.every((r) => r.ok)), detail: vabs.length ? `${vabs.length} 份报告` : "未提供" },
  ];
  const fails = comps.filter((c) => !c.ok).length;
  const s = fails > 0 ? 1 : warningsTotal > 0 || auditWarns > 0 ? 4 : 5;
  push({
    id: "engineering", name: "工程稳定性", type: "auto", score: s,
    basis: `${comps.filter((c) => c.ok).length}/${comps.length} 项全绿`,
    evidence: comps.map((c) => `${c.ok ? "✓" : "✗"} ${c.name} —— ${c.detail}`),
  });
}

// 10 输出正确性（自动）
if (mp4Checks.length > 0) {
  const bad = mp4Checks.filter((c) => !c.ok);
  push({
    id: "output", name: "输出正确性", type: "auto",
    score: bad.length === 0 ? 5 : 1,
    basis: bad.length === 0 ? "ffprobe 全部检查通过" : `${bad.length} 项不符：${bad.map((b) => b.name).join("；")}`,
    evidence: mp4Checks.map((c) => `${c.ok ? "✓" : "✗"} ${c.name} —— ${c.detail}`),
    pending: p10 ? "完整解码结论以 phase10-qa F 项为准" : undefined,
  });
} else {
  push({ id: "output", name: "输出正确性", type: "auto", score: null, basis: "未提供 MP4（--mp4）", evidence: [], pending: "导出后补测" });
}

/* -------------------------------- 输出 ----------------------------------- */
const autoDims = dims.filter((d) => d.type !== "manual");
const autoBad = autoDims.filter((d) => d.score !== null && d.score < 3);
const pendingDims = dims.filter((d) => d.score === null);

const outDir = resolve(root, argOf("--out", ".tmp/quality"));
mkdirSync(outDir, { recursive: true });

const scoreLabel = (d: Dim) => (d.score === null ? "待人工" : String(d.score));
const md = [
  "# 十维记分卡（视觉质量与工程质量）",
  "",
  `规则：docs/project/visual-quality-rubric.md（项目档案 §6）· 语料 ${corpusRows.length} 条 / ${shotsTotal} 拍 · 生成 ${new Date().toISOString()}`,
  "",
  "| # | 维度 | 类型 | 分数 | 依据 |",
  "|---|---|---|---|---|",
  ...dims.map((d, i) => `| ${i + 1} | ${d.name} | ${d.type === "manual" ? "人工" : d.type === "hybrid" ? "混合" : "自动"} | ${scoreLabel(d)} | ${d.basis} |`),
  "",
  `**判定：自动维度 ${autoDims.length} 个（已评 ${autoDims.filter((d) => d.score !== null).length}，过低 ${autoBad.length}）· 待人工 ${pendingDims.length} 个 · 退出码 ${autoBad.length > 0 ? 1 : 0}**`,
  "",
  "> 混合维度的机器分只证明「约束/守恒/存在性层无缺陷」，不等于主观锚点达标；",
  "> 双轨通过（自动 + 盲评）以 visual-quality-rubric.md §四 为准。",
  "",
  "## 证据明细",
  "",
  ...dims.flatMap((d) => [
    `### ${d.name}（${scoreLabel(d)}）`,
    ...d.evidence.map((e) => `- ${e}`),
    ...(d.pending ? [`- 待人工：${d.pending}`] : []),
    "",
  ]),
  "## 语料摘要",
  "",
  ...corpusRows.map((r) => `- ${r.file}：${r.shots} 拍 / ${r.layouts} 版式 / ${r.styles} / problems ${r.problems.length} / warnings ${r.warnings.length}${r.planError ? ` / **规划崩：${r.planError}**` : ""}`),
];

writeFileSync(join(outDir, "scorecard.json"), JSON.stringify({ generatedAt: new Date().toISOString(), dims, corpus: corpusRows, autoBad: autoBad.length, exitCode: autoBad.length > 0 ? 1 : 0 }, null, 1), "utf8");
writeFileSync(join(outDir, "scorecard.md"), md.join("\n"), "utf8");

console.log(md.slice(0, 14).join("\n"));
console.log(`\n记分卡 → ${join(outDir, "scorecard.md")} + scorecard.json`);
for (const d of autoBad) console.error(`✗ ${d.name} ${d.score} 分 —— ${d.basis}`);
process.exit(autoBad.length > 0 ? 1 : 0);
