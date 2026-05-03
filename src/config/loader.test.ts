import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from "node:fs";
import path from "node:path";
import os from "node:os";
import {
  firstEntryNodeId,
  loadAllCharacters,
  loadAllMaps,
  loadCharacter,
  loadMap,
} from "./loader";

let tmp: string;

beforeEach(() => {
  tmp = mkdtempSync(path.join(os.tmpdir(), "agent-world-cfg-"));
  mkdirSync(path.join(tmp, "maps"));
  mkdirSync(path.join(tmp, "characters"));
  process.env.AGENT_WORLD_CONFIGS_DIR = tmp;
});

afterEach(() => {
  delete process.env.AGENT_WORLD_CONFIGS_DIR;
  rmSync(tmp, { recursive: true, force: true });
});

const validMap = {
  id: "tiny",
  name: "小镇",
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

const validChar = {
  id: "char-test",
  name: "测试君",
  age: 25,
  gender: "male" as const,
  profession: "farmer" as const,
  biography: "私はテストキャラクターです。",
  personality: { ei: 0, sn: 0, tf: 0, jp: 0 },
  abilities: [],
  relations: {},
};

function writeMap(name: string, body: unknown) {
  writeFileSync(
    path.join(tmp, "maps", `${name}.json`),
    JSON.stringify(body),
    "utf8",
  );
}

function writeChar(name: string, body: unknown) {
  writeFileSync(
    path.join(tmp, "characters", `${name}.json`),
    JSON.stringify(body),
    "utf8",
  );
}

describe("loadAllMaps", () => {
  it("loads a valid map", () => {
    writeMap("tiny", validMap);
    const maps = loadAllMaps();
    expect(maps).toHaveLength(1);
    expect(maps[0].id).toBe("tiny");
    expect(firstEntryNodeId(maps[0])).toBe("root");
  });

  it("rejects a map with no entry node", () => {
    const noEntry = {
      ...validMap,
      nodes: [{ ...validMap.nodes[0], isEntry: false }],
    };
    writeMap("no-entry", noEntry);
    expect(() => loadAllMaps()).toThrow(
      /at least one entry node/,
    );
  });

  it("rejects duplicate node ids", () => {
    const dup = {
      ...validMap,
      nodes: [validMap.nodes[0], { ...validMap.nodes[0] }],
    };
    writeMap("dup", dup);
    expect(() => loadAllMaps()).toThrow(/duplicate node id/);
  });

  it("rejects parentId pointing to a missing node", () => {
    const bad = {
      ...validMap,
      nodes: [
        validMap.nodes[0],
        {
          ...validMap.nodes[0],
          id: "child",
          parentId: "ghost",
          isEntry: false,
        },
      ],
    };
    writeMap("bad-parent", bad);
    expect(() => loadAllMaps()).toThrow(/missing node: ghost/);
  });
});

describe("loadAllCharacters", () => {
  it("loads a valid character template", () => {
    writeChar("char-test", validChar);
    const chars = loadAllCharacters();
    expect(chars).toHaveLength(1);
    expect(chars[0].id).toBe("char-test");
  });

  it("rejects out-of-range personality", () => {
    const bad = {
      ...validChar,
      personality: { ...validChar.personality, ei: 9 },
    };
    writeChar("bad", bad);
    expect(() => loadAllCharacters()).toThrow(/personality\.ei/);
  });

  it("activityNodeId 和 restNodeId 字段可选", () => {
    // 缺失：仍能加载
    writeChar("no-loc", validChar);
    const a = loadAllCharacters();
    expect(a[0].activityNodeId).toBeUndefined();
    expect(a[0].restNodeId).toBeUndefined();

    // 提供：正确解析
    writeChar("with-loc", {
      ...validChar,
      id: "char-l",
      activityNodeId: "node-farm",
      restNodeId: "node-home",
    });
    const all = loadAllCharacters();
    const withLoc = all.find((c) => c.id === "char-l");
    expect(withLoc?.activityNodeId).toBe("node-farm");
    expect(withLoc?.restNodeId).toBe("node-home");
  });

  it("缺少必填字段 biography 被拒", () => {
    const { biography: _, ...noBio } = validChar;
    writeChar("no-bio", noBio);
    expect(() => loadAllCharacters()).toThrow(/biography/);
  });

  it("profession 不是枚举值被拒", () => {
    writeChar("bad-prof", { ...validChar, profession: "astronaut" });
    expect(() => loadAllCharacters()).toThrow(/profession/);
  });

  it("age 超出范围被拒", () => {
    writeChar("bad-age", { ...validChar, age: 0 });
    expect(() => loadAllCharacters()).toThrow(/age/);
  });
});

describe("lookups", () => {
  it("loadMap throws on missing id", () => {
    writeMap("tiny", validMap);
    expect(() => loadMap("nope")).toThrow(/map not found: nope/);
  });

  it("loadCharacter throws on missing id", () => {
    writeChar("char-test", validChar);
    expect(() => loadCharacter("nope")).toThrow(
      /character template not found: nope/,
    );
  });
});
