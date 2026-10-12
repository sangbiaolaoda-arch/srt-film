// 主入口：SRT → 分拍 → 构图 → 选版式 → 门禁 → 舞台播放 / 导出 MP4。

import { parseSRT } from "../core/srt";
import { planBeats } from "../core/beats";
import { composeScenes, validateScene, type BeatScene } from "../core/compose";
import { buildContent } from "../core/content";
import { applyOverride, type OverrideMap } from "../core/overrides";
import { LAYOUT_BY_ID } from "../layouts/catalog";
import { pickLayout, eligible, planStyles } from "../layouts/pick";
import { MOTION_BY_ID, validateMotionSet } from "../motion/catalog";
import { buildStage, type Shot, type StageHandle } from "./stage";
import { exportMp4 } from "../export/mp4";
import "../styles/main.css";

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const srtInput = $<HTMLTextAreaElement>("srt-input");
const ovInput = $<HTMLTextAreaElement>("override-input");
const btnLoad = $<HTMLButtonElement>("btn-load");
const btnPlay = $<HTMLButtonElement>("btn-play");
const btnExport = $<HTMLButtonElement>("btn-export");
const gateReport = $<HTMLUListElement>("gate-report");
const stageHost = $<HTMLDivElement>("stage");
const scrubber = $<HTMLInputElement>("scrubber");
const timecode = $<HTMLSpanElement>("timecode");
const beatList = $<HTMLOListElement>("beat-list");

let stage: StageHandle | null = null;
let shots: Shot[] = [];
let raf = 0;
let playing = false;

const fmt = (s: number) =>
  `${String(Math.floor(s / 60)).padStart(2, "0")}:${(s % 60).toFixed(1).padStart(4, "0")}`;

function report(items: string[], ok: boolean) {
  gateReport.hidden = false;
  gateReport.innerHTML = items
    .map((t) => `<li class="${ok ? "ok" : ""}">${t.replace(/</g, "&lt;")}</li>`)
    .join("");
}

function startTicker() {
  cancelAnimationFrame(raf);
  const loop = () => {
    if (stage) {
      const t = stage.time();
      scrubber.value = String(Math.round((t / (stage.duration || 1)) * Number(scrubber.max)));
      timecode.textContent = fmt(t);
    }
    raf = requestAnimationFrame(loop);
  };
  raf = requestAnimationFrame(loop);
}

/** 构建管线：返回拍计划与门禁问题（问题非空则不播放）。 */
export function plan(srt: string, ovRaw: string): { shots: Shot[]; problems: string[]; styles: string[] } {
  const ov: OverrideMap = ovRaw.trim() ? (JSON.parse(ovRaw) as OverrideMap) : {};
  const beats = planBeats(parseSRT(srt));
  const problems: string[] = [];
  const styles: string[] = [];

  // 第一遍：把每拍旁白变成内容（并做溯源校验）
  const prepared = beats.map((beat) => {
    const ovr = ov[String(beat.index)];
    const scene: BeatScene = composeScenes([beat])[0]!;
    const applied = ovr ? applyOverride(scene, ovr) : scene;
    problems.push(...validateScene(applied, ovr?.source));

    const content = buildContent(applied, beat, false);
    if (ovr?.headline) content.headline = ovr.headline;
    if (ovr?.bigNumber) content.bignum = ovr.bigNumber;
    if (ovr?.left) content.left = ovr.left;
    if (ovr?.right) content.right = ovr.right;
    return { beat, ovr, content };
  });

  // 第二遍：全片定风格（覆写优先，自动兜底按配额+锚点选海报风拍）
  const decisions = planStyles(
    prepared.map((p) => p.content),
    prepared.map((p) => p.ovr?.style),
  );

  // 第三遍：风格内挑版式 + 资格/动效门禁
  const out: Shot[] = [];
  let prevLayout: string | undefined;

  prepared.forEach(({ beat, ovr, content }, i) => {
    const decision = decisions[i]!;
    let layout = ovr?.layoutId ? LAYOUT_BY_ID.get(ovr.layoutId) : undefined;
    if (ovr?.layoutId && !layout) {
      problems.push(`拍 ${beat.index}：覆写的版式 id「${ovr.layoutId}」不存在`);
    }
    layout = layout ?? pickLayout(content, decision.style, prevLayout);
    prevLayout = layout.id;

    const realStyle = layout.style ?? "editorial";
    styles.push(
      `${String(beat.index).padStart(2, "0")} ${realStyle === "poster" ? "海报" : "编辑"}（${ovr?.layoutId ? "覆写版式" : decision.reason}）`,
    );

    // 资格门禁：图表版式必须拿得到足够多的可溯源数字
    if (!eligible(layout, content)) {
      problems.push(`拍 ${beat.index}：版式「${layout.name}」需要更多可溯源数字，旁白里不够`);
    }
    // 动效门禁：版式自带的动效必须存在且可组合
    const motions = [...layout.enter, ...(layout.emphasis ? [layout.emphasis] : [])];
    problems.push(...validateMotionSet(motions).map((e) => `拍 ${beat.index}：${e}`));
    for (const id of motions) if (!MOTION_BY_ID.has(id)) problems.push(`拍 ${beat.index}：版式引用了未知动效 ${id}`);

    out.push({ layout, content, start: beat.start, end: beat.end });
  });

  return { shots: out, problems, styles };
}

btnLoad.addEventListener("click", () => {
  cancelAnimationFrame(raf);
  playing = false;
  stage?.destroy();
  stage = null;
  btnPlay.disabled = true;
  btnExport.disabled = true;
  scrubber.disabled = true;
  beatList.innerHTML = "";

  let result: { shots: Shot[]; problems: string[]; styles: string[] };
  try {
    result = plan(srtInput.value, ovInput.value);
  } catch (e) {
    report([(e as Error).message], false);
    return;
  }
  if (result.problems.length > 0) {
    report(result.problems, false);
    return;
  }

  shots = result.shots;
  const posterCount = shots.filter((s) => s.layout.style === "poster").length;
  report([
    `门禁通过：${shots.length} 拍，用到 ${new Set(shots.map((s) => s.layout.id)).size} 个版式，画面数字全部可溯源。`,
    `风格：编辑风 ${shots.length - posterCount} 拍 / 海报风 ${posterCount} 拍 —— ${result.styles.join("　")}`,
  ], true);

  renderBeatList();
  stage = buildStage(stageHost, shots);
  (window as unknown as { __stage?: StageHandle }).__stage = stage; // 调试钩子
  stage.onComplete(() => { playing = false; btnPlay.textContent = "重播"; });

  scrubber.disabled = false;
  btnPlay.disabled = false;
  btnExport.disabled = false;
  btnPlay.textContent = "播放";
  scrubber.value = "0";
  timecode.textContent = fmt(0);
  startTicker();

  scrubber.oninput = () => {
    if (!stage) return;
    playing = false;
    btnPlay.textContent = "播放";
    stage.seek((Number(scrubber.value) / Number(scrubber.max)) * stage.duration);
  };

  btnPlay.onclick = () => {
    if (!stage) return;
    if (playing) {
      stage.pause();
      playing = false;
      btnPlay.textContent = "播放";
    } else {
      if (stage.time() >= stage.duration) stage.seek(0);
      stage.play();
      playing = true;
      btnPlay.textContent = "暂停";
    }
  };
});

btnExport.addEventListener("click", async () => {
  if (!stage || shots.length === 0) return;
  btnExport.disabled = true;
  btnExport.textContent = "导出中…";
  try {
    const blob = await exportMp4(stage, stage.duration);
    (window as unknown as { __lastMp4?: Blob }).__lastMp4 = blob;
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "srt-film.mp4";
    a.click();
    URL.revokeObjectURL(a.href);
    report([`MP4 已导出（${shots.length} 拍 / ${(blob.size / 1e6).toFixed(1)}MB）。`], true);
  } catch (e) {
    report([`导出失败：${(e as Error).message}`], false);
  } finally {
    btnExport.disabled = false;
    btnExport.textContent = "导出 MP4";
  }
});

function renderBeatList() {
  beatList.innerHTML = shots
    .map((s, i) => `<li data-beat="${i}">
      <span class="beat-no">${String(i + 1).padStart(2, "0")}</span>
      <span class="beat-layout">${s.layout.name}</span>
      <span class="beat-text">${s.content.headline.replace(/</g, "&lt;")}</span>
    </li>`)
    .join("");
  beatList.querySelectorAll("li").forEach((li) => {
    li.addEventListener("click", () => {
      const idx = Number((li as HTMLElement).dataset.beat);
      const shot = shots[idx];
      if (shot && stage) {
        playing = false;
        btnPlay.textContent = "播放";
        // 时间轴时间 ≠ SRT 绝对时间（拍间有交叠），跳拍要用 tlStart
        stage.seek(shot.tlStart ?? shot.start);
      }
    });
  });
}
