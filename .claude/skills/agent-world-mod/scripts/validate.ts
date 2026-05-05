/**
 * 用项目内的 Zod schema 校验一份地图或角色 JSON 文件。
 *
 * 用法：
 *   tsx .claude/skills/agent-world-config/scripts/validate.ts <path>
 *
 * 自动按文件所在目录推断格式：
 *   - configs/maps 或 path 中含 "map" → MapConfigSchema
 *   - configs/characters 或 path 中含 "character" → CharacterTemplateSchema
 *   - 否则尝试两种 schema，给出更接近的错误集
 *
 * 退出码：0 = 通过，1 = 失败。
 */
import { readFileSync, existsSync } from "node:fs";
import path from "node:path";
import {
  CharacterTemplateSchema,
  ManifestSchema,
  MapConfigSchema,
} from "@/config/schemas";

function fail(msg: string): never {
  console.error(msg);
  process.exit(1);
}

function inferKind(filePath: string): "map" | "character" | "manifest" | "unknown" {
  const norm = filePath.replace(/\\/g, "/");
  const base = path.basename(norm);
  if (base === "manifest.json" || /manifest/i.test(base)) {
    return "manifest";
  }
  if (
    /\/configs\/characters\//.test(norm) ||
    /character|char/i.test(base)
  ) {
    return "character";
  }
  if (/\/configs\/maps\//.test(norm) || /map/i.test(base)) {
    return "map";
  }
  return "unknown";
}

function main() {
  const arg = process.argv[2];
  if (!arg) fail("usage: validate.ts <path-to-json>");
  if (!existsSync(arg)) fail(`file not found: ${arg}`);

  const raw = readFileSync(arg, "utf8");
  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch (e) {
    fail(`not valid JSON: ${(e as Error).message}`);
  }

  const kind = inferKind(arg);
  const schemas =
    kind === "manifest"
      ? [{ name: "ManifestSchema", schema: ManifestSchema }]
      : kind === "map"
        ? [{ name: "MapConfigSchema", schema: MapConfigSchema }]
        : kind === "character"
          ? [
              {
                name: "CharacterTemplateSchema",
                schema: CharacterTemplateSchema,
              },
            ]
          : [
              { name: "MapConfigSchema", schema: MapConfigSchema },
              {
                name: "CharacterTemplateSchema",
                schema: CharacterTemplateSchema,
              },
            ];

  for (const { name, schema } of schemas) {
    const r = schema.safeParse(json);
    if (r.success) {
      console.log(`✓ ${arg} passes ${name}`);
      process.exit(0);
    }
    if (schemas.length === 1) {
      console.error(`✗ ${arg} fails ${name}:`);
      for (const issue of r.error.issues) {
        const loc = issue.path.length ? issue.path.join(".") : "<root>";
        console.error(`  ${loc}: ${issue.message}`);
      }
      process.exit(1);
    }
  }
  // unknown kind, both failed
  console.error(`✗ ${arg} matches neither ManifestSchema, MapConfigSchema nor CharacterTemplateSchema`);
  console.error(
    "tip: place the file under configs/maps/ or configs/characters/, or pass an explicit path",
  );
  process.exit(1);
}

main();
