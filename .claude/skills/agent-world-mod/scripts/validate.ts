/**
 * 用项目内的 Zod schema 校验一份 manifest / 地图 / 角色 JSON 文件。
 *
 * 用法（从仓库根目录运行——通过 `pnpm --dir backend exec` 让脚本继承 backend 的 node_modules）：
 *
 *   pnpm --dir backend exec tsx ../.claude/skills/agent-world-mod/scripts/validate.ts <path>
 *
 * 自动按文件路径/文件名推断格式：
 *   - basename 是 manifest.json 或含 "manifest" → ManifestSchema
 *   - 路径含 backend/scenes/<id>/characters/，或文件名含 "character"/"char" → CharacterTemplateSchema
 *   - 路径含 backend/scenes/，或文件名含 "map" → MapConfigSchema
 *   - 否则三种都试，给出最接近的错误集
 *
 * 退出码：0 = 通过，1 = 失败。
 */
import { readFileSync, existsSync } from "node:fs";
import path from "node:path";
import {
  CharacterTemplateSchema,
  ManifestSchema,
  MapConfigSchema,
} from "../../../../backend/src/config/schemas";

function fail(msg: string): never {
  console.error(msg);
  process.exit(1);
}

type Kind = "map" | "character" | "manifest" | "unknown";

function inferKind(filePath: string): Kind {
  const norm = filePath.replace(/\\/g, "/");
  const base = path.basename(norm);
  if (base === "manifest.json" || /manifest/i.test(base)) {
    return "manifest";
  }
  if (
    /\/scenes\/[^/]+\/characters\//.test(norm) ||
    /character|^char-/i.test(base)
  ) {
    return "character";
  }
  if (
    /\/scenes\//.test(norm) ||
    base === "map.json" ||
    /map/i.test(base)
  ) {
    return "map";
  }
  return "unknown";
}

function main(): void {
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
              { name: "ManifestSchema", schema: ManifestSchema },
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
  console.error(
    `✗ ${arg} matches none of ManifestSchema / MapConfigSchema / CharacterTemplateSchema`,
  );
  console.error(
    "tip: place the file under backend/scenes/<scene-id>/, or use a recognizable filename (manifest.json / map.json / char-*.json).",
  );
  process.exit(1);
}

main();
