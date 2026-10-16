import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const root = ".claude/skills";
let bad = 0;
for (const d of readdirSync(root)) {
  const p = join(root, d, "SKILL.md");
  const t = readFileSync(p, "utf8");
  const m = /^---\r?\n([\s\S]*?)\r?\n---\r?\n/.exec(t);
  if (!m) { console.log(`✗ ${d}: 无 frontmatter`); bad++; continue; }
  const fm = m[1]!;
  const name = /^name:\s*(.+)$/m.exec(fm)?.[1]?.trim();
  const desc = /^description:\s*>?\s*([\s\S]*?)(?=\r?\n[a-z-]+:|$)/m.exec(fm)?.[1]?.trim();
  const dirOk = name === d;
  console.log(`${dirOk ? "✓" : "✗"} ${d}`);
  console.log(`   name: ${name}${dirOk ? "" : `（与目录名不符）`}`);
  console.log(`   description: ${(desc ?? "(缺失)").replace(/\s+/g, " ").slice(0, 70)}…`);
  if (!dirOk || !desc) bad++;
}
console.log(bad === 0 ? "\n全部合法" : `\n${bad} 个有问题`);
process.exit(bad === 0 ? 0 : 1);