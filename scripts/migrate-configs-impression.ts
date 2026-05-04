import fs from "fs";
import { globSync } from "glob";

const FILES = globSync("configs/maps/*/characters/*.json");
for (const file of FILES) {
  const data = JSON.parse(fs.readFileSync(file, "utf-8"));

  // Remove affection and note from each relation
  if (data.relations) {
    for (const [, rel] of Object.entries(data.relations) as [string, any][]) {
      delete rel.affection;
      delete rel.note;
    }
  }

  // Add empty impressionBook if not present
  data.impressionBook = data.impressionBook || {};

  fs.writeFileSync(file, JSON.stringify(data, null, 2) + "\n");
  console.log(`Migrated: ${file}`);
}
