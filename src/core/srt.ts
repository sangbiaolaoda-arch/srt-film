// SRT 解析器：最小实现，只做一件事——把 SRT 文本变成 Cue 列表。
// 不猜格式、不补错误：解析不了就抛出带行号的具体错误（诚实原则）。

export interface Cue {
  id: number;
  start: number; // 秒
  end: number; // 秒
  text: string; // 已合并多行、去掉 HTML 标签
}

const TIMESTAMP = /^(\d{2,}):(\d{2}):(\d{2})[,.](\d{1,3})\s*-->\s*(\d{2,}):(\d{2}):(\d{2})[,.](\d{1,3})\s*$/;

function toSeconds(h: string, m: string, s: string, ms: string): number {
  return Number(h) * 3600 + Number(m) * 60 + Number(s) + Number(ms.padEnd(3, "0")) / 1000;
}

function stripTags(line: string): string {
  return line.replace(/<[^>]+>/g, "").trim();
}

export function parseSRT(source: string): Cue[] {
  if (!source.trim()) throw new Error("SRT 内容为空");
  const lines = source.replace(/\r\n?/g, "\n").split("\n");
  const cues: Cue[] = [];
  let i = 0;

  while (i < lines.length) {
    // 跳过空行
    if (!lines[i]!.trim()) { i++; continue; }

    // 可选序号行（纯数字）；无序号格式也接受
    if (/^\d+$/.test(lines[i]!.trim())) i++;

    // 时间戳行
    const m = TIMESTAMP.exec(lines[i]?.trim() ?? "");
    if (!m) throw new Error(`第 ${i + 1} 行不是合法时间戳：${lines[i]}`);
    const start = toSeconds(m[1]!, m[2]!, m[3]!, m[4]!);
    const end = toSeconds(m[5]!, m[6]!, m[7]!, m[8]!);
    if (end <= start) throw new Error(`第 ${i + 1} 行：结束时间必须晚于开始时间`);
    i++;

    // 文本行：收集到空行或文件结束
    const textLines: string[] = [];
    while (i < lines.length && lines[i]!.trim()) {
      textLines.push(stripTags(lines[i]!));
      i++;
    }
    const text = textLines.join(" ");
    if (!text) throw new Error(`cue（${start}s）没有文本内容`);

    const id = cues.length + 1; // 重新编号，保持与拍内 cue_range 一致
    cues.push({ id, start, end, text });
  }

  if (cues.length === 0) throw new Error("未解析出任何字幕条目");
  return cues;
}
