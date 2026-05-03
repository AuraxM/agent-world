import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from "node:fs";
import path from "node:path";
import os from "node:os";
import {
  firstEntryNodeId,
  listMapPackIds,
  loadAllCharacters,
  loadAllMaps,
  loadCharacter,
  loadCharactersForMap,
  loadManifest,
  loadMap,
  validateMapPack,
} from "./loader";

let tmp: string;

beforeEach(() => {
  tmp = mkdtempSync(path.join(os.tmpdir(), "agent-world-cfg-"));
  mkdirSync(path.join(tmp, "maps"));
  process.env.AGENT_WORLD_CONFIGS_DIR = tmp;
});

afterEach(() => {
  delete process.env.AGENT_WORLD_CONFIGS_DIR;
  rmSync(tmp, { recursive: true, force: true });
});

const validMap = {
  id: "tiny",
  nodes: [
    {
      id: "root",
      parentId: null,
      name: "根节点",
      description: "",
      tags: ["public", "outdoor"],
      capacity: null,
      privacy: "public",
      visibleFromParent: true,
      shortcuts: [],
      isEntry: true,
    },
  ],
};

const validManifest = {
  id: "tiny",
  name: "小镇",
  description: "一个测试小镇",
  language: "zh",
};

const validChar = {
  id: "char-test",
  name: "测试君",
  age: 25,
  gender: "male" as const,
  profession: "farmer" as const,
  origin: "local" as const,
  biography: "私はテストキャラクターです。",
  personality: { ei: 0, sn: 0, tf: 0, jp: 0 },
  abilities: [],
  relations: {},
};

function writePack(
  packId: string,
  manifest: object,
  map: object,
  chars: Record<string, object> = {},
) {
  const dir = path.join(tmp, "maps", packId);
  mkdirSync(path.join(dir, "characters"), { recursive: true });
  writeFileSync(path.join(dir, "manifest.json"), JSON.stringify(manifest), "utf8");
  writeFileSync(path.join(dir, "map.json"), JSON.stringify(map), "utf8");
  for (const [charId, data] of Object.entries(chars)) {
    writeFileSync(
      path.join(dir, "characters", `${charId}.json`),
      JSON.stringify(data),
      "utf8",
    );
  }
}

describe("listMapPackIds", () => {
  it("returns empty when no packs", () => {
    expect(listMapPackIds()).toEqual([]);
  });

  it("lists pack directory names sorted", () => {
    writePack("tiny", validManifest, validMap);
    writePack("big", { ...validManifest, id: "big" }, { ...validMap, id: "big" });
    expect(listMapPackIds()).toEqual(["big", "tiny"]);
  });
});

describe("loadManifest", () => {
  it("loads a valid manifest", () => {
    writePack("tiny", validManifest, validMap);
    const m = loadManifest("tiny");
    expect(m.id).toBe("tiny");
    expect(m.language).toBe("zh");
  });

  it("rejects manifest.id ≠ directory name", () => {
    writePack("tiny", { ...validManifest, id: "wrong" }, validMap);
    expect(() => loadManifest("tiny")).toThrow(/does not match directory name/);
  });

  it("rejects invalid language", () => {
    writePack("tiny", { ...validManifest, language: "fr" }, validMap);
    expect(() => loadManifest("tiny")).toThrow(/language/);
  });
});

describe("loadMap", () => {
  it("loads a valid map", () => {
    writePack("tiny", validManifest, validMap);
    const m = loadMap("tiny");
    expect(m.id).toBe("tiny");
    expect(m.nodes).toHaveLength(1);
  });

  it("rejects map with no entry node", () => {
    writePack("tiny", validManifest, {
      ...validMap,
      nodes: [{ ...validMap.nodes[0], isEntry: false }],
    });
    expect(() => loadMap("tiny")).toThrow(/at least one entry node/);
  });

  it("rejects map.id ≠ directory name", () => {
    writePack("tiny", validManifest, { ...validMap, id: "wrong" });
    expect(() => loadMap("tiny")).toThrow(/does not match directory name/);
  });

  it("rejects duplicate node ids", () => {
    writePack("tiny", validManifest, {
      ...validMap,
      nodes: [validMap.nodes[0], { ...validMap.nodes[0] }],
    });
    expect(() => loadMap("tiny")).toThrow(/duplicate node id/);
  });

  it("rejects bad parentId", () => {
    writePack("tiny", validManifest, {
      ...validMap,
      nodes: [
        validMap.nodes[0],
        { ...validMap.nodes[0], id: "child", parentId: "ghost" },
      ],
    });
    expect(() => loadMap("tiny")).toThrow(/missing node: ghost/);
  });
});

describe("loadCharactersForMap", () => {
  it("loads characters from pack directory", () => {
    writePack("tiny", validManifest, validMap, { "char-test": validChar });
    const chars = loadCharactersForMap("tiny");
    expect(chars).toHaveLength(1);
    expect(chars[0].id).toBe("char-test");
  });

  it("returns empty array when no characters dir", () => {
    writePack("tiny", validManifest, validMap);
    expect(loadCharactersForMap("tiny")).toEqual([]);
  });
});

describe("loadAllCharacters", () => {
  it("loads characters from all packs", () => {
    writePack("a", validManifest, validMap, { "char-x": validChar });
    writePack(
      "b",
      { ...validManifest, id: "b" },
      { ...validMap, id: "b" },
      { "char-y": { ...validChar, id: "char-y" } },
    );
    expect(loadAllCharacters()).toHaveLength(2);
  });
});

describe("loadCharacter", () => {
  it("finds character by id across packs", () => {
    writePack(
      "a",
      { ...validManifest, id: "a" },
      { ...validMap, id: "a" },
      { "char-x": { ...validChar, id: "char-x" } },
    );
    writePack(
      "b",
      { ...validManifest, id: "b" },
      { ...validMap, id: "b" },
      { "char-y": { ...validChar, id: "char-y" } },
    );
    expect(loadCharacter("char-x").id).toBe("char-x");
    expect(loadCharacter("char-y").id).toBe("char-y");
  });

  it("throws for missing id", () => {
    writePack("tiny", validManifest, validMap);
    expect(() => loadCharacter("nope")).toThrow(/character template not found/);
  });

  it("rejects character with missing biography", () => {
    const { biography: _, ...noBio } = validChar;
    writePack("tiny", validManifest, validMap, { "no-bio": noBio });
    expect(() => loadCharacter("no-bio")).toThrow(/biography/);
  });

  it("rejects character with out-of-range personality", () => {
    writePack("tiny", validManifest, validMap, {
      "bad": { ...validChar, personality: { ei: 9, sn: 0, tf: 0, jp: 0 } },
    });
    expect(() => loadCharacter("bad")).toThrow(/personality/);
  });
});

describe("loadAllMaps", () => {
  it("loads maps from all packs", () => {
    writePack("tiny", validManifest, validMap);
    writePack("big", { ...validManifest, id: "big" }, { ...validMap, id: "big" });
    const maps = loadAllMaps();
    expect(maps).toHaveLength(2);
    expect(maps.map((m) => m.id).sort()).toEqual(["big", "tiny"]);
  });
});

describe("validateMapPack", () => {
  it("reports valid pack", () => {
    writePack("tiny", validManifest, validMap, { "char-test": validChar });
    const v = validateMapPack("tiny");
    expect(v.valid).toBe(true);
    expect(v.errors).toEqual([]);
    expect(v.language).toBe("zh");
    expect(v.nodeCount).toBe(1);
    expect(v.characterCount).toBe(1);
  });

  it("collects partial errors without throwing", () => {
    const dir = path.join(tmp, "maps", "broken");
    mkdirSync(path.join(dir, "characters"), { recursive: true });
    writeFileSync(path.join(dir, "manifest.json"), "{bad json", "utf8");
    writeFileSync(path.join(dir, "map.json"), "{}", "utf8");
    writeFileSync(
      path.join(dir, "characters", "bad.json"),
      JSON.stringify({ id: "bad" }),
      "utf8",
    );
    const v = validateMapPack("broken");
    expect(v.valid).toBe(false);
    expect(v.errors.length).toBeGreaterThanOrEqual(3);
  });

  it("handles missing characters directory", () => {
    const dir = path.join(tmp, "maps", "nochars");
    mkdirSync(dir, { recursive: true });
    writeFileSync(path.join(dir, "manifest.json"), JSON.stringify({ ...validManifest, id: "nochars" }), "utf8");
    writeFileSync(path.join(dir, "map.json"), JSON.stringify({ ...validMap, id: "nochars" }), "utf8");
    const v = validateMapPack("nochars");
    expect(v.valid).toBe(true);
    expect(v.characterCount).toBe(0);
  });

  it("preserves manifest info even when invalid", () => {
    writePack("tiny", validManifest, {
      ...validMap,
      nodes: [{ ...validMap.nodes[0], isEntry: false }],
    });
    const v = validateMapPack("tiny");
    expect(v.valid).toBe(false);
    expect(v.name).toBe("小镇");
    expect(v.nodeCount).toBe(1);
  });
});

describe("firstEntryNodeId", () => {
  it("returns entry node id", () => {
    writePack("tiny", validManifest, validMap);
    expect(firstEntryNodeId(loadMap("tiny"))).toBe("root");
  });
});
