// 分拍规划器：把 cue 流切成「拍」（beat）。
// 原则：一拍 = 一句完整的话（或一个语义单元），画面在拍内保持一致。
// 规则可解释、可测试，不做投机性智能。

import type { Cue } from "./srt";

export interface Beat {
  index: number; // 从 1 开始
  start: number;
  end: number;
  cues: Cue[]; // cue id 覆盖范围 = cues[0].id .. cues[cues.length-1].id
  text: string;
}

// 中文句末标点 / 英文句号，作为切拍首选点
const SENTENCE_ENDS = "。！？!?…";
// 停顿标点：拍超长时在此收拍
const PAUSE_ENDS = "，、；：,;:";
// 拍最长时长（秒）：超过即倾向于在停顿处收拍
const MAX_BEAT_SECONDS = 6;
// 拍正文长度硬上限（字）：旁白常无句末标点，超长即按 cue 边界硬切
const MAX_BEAT_CHARS = 28;
// cue 之间的间隔（秒）：超过即视为换景
const GAP_SECONDS = 0.5;

export function isSentenceEnd(text: string): boolean {
  const last = text.slice(-1);
  return last.length > 0 && SENTENCE_ENDS.includes(last);
}

function isPauseEnd(text: string): boolean {
  const last = text.slice(-1);
  return last.length > 0 && PAUSE_ENDS.includes(last);
}

/**
 * cue 里是否含任何切拍标点。
 * 项目规则（2026-10-14）：SRT 台词的一切标点都换成空格 → 标点不再是切拍依据，
 * 此时**一条 cue 即一拍**（作者用 cue 边界表达分拍）。含标点的 SRT 走原有逻辑，行为不变。
 */
function hasSplitPunct(text: string): boolean {
  for (const ch of text) if (SENTENCE_ENDS.includes(ch) || PAUSE_ENDS.includes(ch)) return true;
  return false;
}

export function planBeats(cues: Cue[]): Beat[] {
  const beats: Beat[] = [];
  let current: Cue[] = [];

  const flush = () => {
    if (current.length === 0) return;
    const first = current[0]!;
    const last = current[current.length - 1]!;
    beats.push({
      index: beats.length + 1,
      start: first.start,
      end: last.end,
      cues: [...current],
      text: current.map((c) => c.text).join("\n"),
    });
    current = [];
  };

  for (const cue of cues) {
    // 字幕间隙 = 换景信号
    const prev = current[current.length - 1];
    if (prev && cue.start - prev.end > GAP_SECONDS) flush();
    current.push(cue);

    const dur = cue.end - (current[0]!.start);
    const len = current.map((c) => c.text).join("").length;
    if (isSentenceEnd(cue.text)) flush(); // 句末：必收
    else if (!hasSplitPunct(cue.text)) flush(); // 无标点 SRT：一条 cue 即一拍
    else if (dur >= MAX_BEAT_SECONDS && isPauseEnd(cue.text)) flush(); // 长拍：停顿处收
    else if (len >= MAX_BEAT_CHARS) flush(); // 超长：按 cue 边界硬切
  }
  flush();

  return beats;
}
