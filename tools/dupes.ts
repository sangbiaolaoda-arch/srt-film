// 版式去重检查：分风格列出槽位布局完全相同的版式（人工差异化用）。
// 跨风格的同槽位版式不算重复——底色、色板、字号、逐字符拆分都不同，视觉结果不同。
import { LAYOUTS } from "../src/layouts/catalog";

const sig = (l: (typeof LAYOUTS)[number]) =>
  l.slots.map((s) => s.k + ":" + s.box.join(",")).join("|");

let totalDup = 0;
for (const style of ["editorial", "poster"] as const) {
  const list = LAYOUTS.filter((l) => (l.style ?? "editorial") === style);
  const map = new Map<string, string[]>();
  for (const l of list) {
    const k = sig(l);
    map.set(k, [...(map.get(k) ?? []), l.id]);
  }
  let dup = 0;
  for (const [, ids] of map) {
    if (ids.length > 1) {
      dup += ids.length - 1;
      console.log(`[${style}] ${ids.join("  ")}`);
    }
  }
  totalDup += dup;
  console.log(`${style}: ${list.length} 个版式，去重后 ${map.size} 个，重复 ${dup} 个`);
}

console.log(`\n共 ${LAYOUTS.length} 个版式，重复 ${totalDup} 个`);
if (totalDup > 0) process.exitCode = 1;
