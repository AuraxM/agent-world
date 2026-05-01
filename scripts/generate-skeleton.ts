/**
 * 从参数生成布局骨架。
 *
 * 用法：
 *   tsx scripts/generate-skeleton.ts [--output <path>] [--params '<json>']
 *
 * 示例：
 *   tsx scripts/generate-skeleton.ts --output .claude/skills/agent-world-config/skeleton.json
 *   tsx scripts/generate-skeleton.ts --params '{"canvasW":32,"elevationLayers":2}' --output skeleton.json
 */
import { writeFileSync } from "node:fs";
import { generateSkeleton, resolveParams } from "@/engine/layout";
import type { LayoutParams } from "@/engine/layout-types";

function parseArgs(argv: string[]): { output: string; params: Partial<LayoutParams> } {
  let output = "skeleton.json";
  let params: Partial<LayoutParams> = {};

  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--output" || argv[i] === "-o") {
      output = argv[++i];
    } else if (argv[i] === "--params" || argv[i] === "-p") {
      try {
        params = JSON.parse(argv[++i]);
      } catch {
        console.error("invalid JSON for --params");
        process.exit(1);
      }
    } else if (argv[i] === "--help" || argv[i] === "-h") {
      console.log([
        "generate-skeleton.ts — 生成地图布局骨架",
        "",
        "用法: tsx scripts/generate-skeleton.ts [options]",
        "",
        "选项:",
        "  --output, -o <path>   输出文件路径（默认 skeleton.json）",
        "  --params, -p <json>   JSON 格式的布局参数（可选）",
        "  --help, -h            显示帮助",
        "",
        "参数键（均可选，含默认值）:",
        '  canvasW, canvasH, elevationLayers, mainRoadCount,',
        '  crossRoadMin, crossRoadMax, density, zoneRatios, seed',
      ].join("\n"));
      process.exit(0);
    }
  }

  return { output, params };
}

function main() {
  const args = process.argv.slice(2);
  const { output, params } = parseArgs(args);

  const resolved = resolveParams(params);
  const skeleton = generateSkeleton(resolved);

  writeFileSync(output, JSON.stringify(skeleton, null, 2), "utf8");
  console.log(`skeleton written to ${output} (${skeleton.slots.length} slots, ${skeleton.roads.length} roads, ${skeleton.elevations.length} elevations)`);
}

main();
