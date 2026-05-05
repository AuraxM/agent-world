# Dialog Context Optimization Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix NPC identity loss during dialog by adding self-image and peer-image blocks to accept-decision and dialog-turn prompts, compressing personality to one line, and fixing relation direction ambiguity.

**Architecture:** Three new exported functions in `src/llm/prompt.ts` (`buildSelfImage`, `buildPeerImage`, `describeRelationBidirectional`), plus signature changes to `buildAcceptDecisionPrompt` and `buildDialogTurnPrompt`. Type changes propagate through `src/llm/decide.ts` and `src/engine/dialog.ts`.

**Tech Stack:** TypeScript, Vitest

---

### Task 1: Add `describeRelationBidirectional` with reverse mapping

**Files:**
- Modify: `src/llm/prompt.ts` (add after `DIRECTIONAL_KIND_LABELS`)
- Modify: `src/llm/prompt.test.ts`

- [ ] **Step 1: Add the reverse relation mapping and `describeRelationBidirectional` function**

In `src/llm/prompt.ts`, add after the existing `DIRECTIONAL_KIND_LABELS` block (after line 122):

```typescript
const REVERSE_KIND: Record<string, string | ((gender: string) => string)> = {
  boss: "你的下属",
  subordinate: "你的老板",
  spouse: "你的配偶",
  partner: "你的伴侣",
  colleague: "你的同事",
  father: (g) => (g === "male" ? "你的儿子" : "你的女儿"),
  mother: (g) => (g === "male" ? "你的儿子" : "你的女儿"),
  son: (g) => (g === "male" ? "你的父亲" : "你的母亲"),
  daughter: (g) => (g === "male" ? "你的父亲" : "你的母亲"),
  older_brother: (g) => (g === "male" ? "你的弟弟" : "你的妹妹"),
  younger_brother: (g) => (g === "male" ? "你的哥哥" : "你的姐姐"),
  older_sister: (g) => (g === "male" ? "你的弟弟" : "你的妹妹"),
  younger_sister: (g) => (g === "male" ? "你的哥哥" : "你的姐姐"),
  ex_partner: "前伴侣",
};

export function describeRelationBidirectional(self: Character, targetId: string): string {
  const rel = self.relations[targetId];
  if (!rel || rel.kinds.length === 0) {
    return "客观关系：你与 TA 尚无正式关系";
  }
  return rel.kinds.map((k) => {
    const forward = DIRECTIONAL_KIND_LABELS[k] ?? k;
    const revRaw = REVERSE_KIND[k];
    if (!revRaw) return `- 客观关系：TA 是你的 ${forward}`;
    const rev = typeof revRaw === "function" ? revRaw(self.gender) : revRaw;
    if (forward === rev) {
      return `- 客观关系：你们互为 ${forward}`;
    }
    return `- 客观关系：TA 是你的 ${forward}（你是 TA 的 ${rev}）`;
  }).join("\n");
}
```

Note: When `DIRECTIONAL_KIND_LABELS` lacks an entry for a kind (e.g., `classmate`, `friend`, `acquaintance`), the raw kind string is used as-is.

- [ ] **Step 2: Write test for `describeRelationBidirectional`**

In `src/llm/prompt.test.ts`, add to imports:
```typescript
import {
  // ... existing imports ...
  describeRelationBidirectional,
} from "./prompt";
```

Add test block at end of file:
```typescript
describe("describeRelationBidirectional", () => {
  const self: Character = { ...baseCharacter, gender: "male", relations: {} };

  it("returns no-relation message when no relations exist", () => {
    const result = describeRelationBidirectional({ ...self, relations: {} }, "peer-1");
    expect(result).toContain("尚无正式关系");
  });

  it("renders bidirectional boss relation", () => {
    const c = {
      ...self,
      relations: { "peer-1": { kinds: ["boss"] as const, sinceTick: 0 } },
    };
    const result = describeRelationBidirectional(c, "peer-1");
    expect(result).toContain("TA 是你的老板");
    expect(result).toContain("你是 TA 的下属");
  });

  it("renders symmetric relation as mutual", () => {
    const c = {
      ...self,
      relations: { "peer-1": { kinds: ["colleague"] as const, sinceTick: 0 } },
    };
    const result = describeRelationBidirectional(c, "peer-1");
    expect(result).toContain("你们互为 你的同事");
  });

  it("renders father relation with male self", () => {
    const c = {
      ...self,
      gender: "male" as const,
      relations: { "peer-1": { kinds: ["father"] as const, sinceTick: 0 } },
    };
    const result = describeRelationBidirectional(c, "peer-1");
    expect(result).toContain("TA 是你的父亲");
    expect(result).toContain("你是 TA 的儿子");
  });

  it("renders father relation with female self", () => {
    const c = {
      ...self,
      gender: "female" as const,
      relations: { "peer-1": { kinds: ["father"] as const, sinceTick: 0 } },
    };
    const result = describeRelationBidirectional(c, "peer-1");
    expect(result).toContain("TA 是你的父亲");
    expect(result).toContain("你是 TA 的女儿");
  });

  it("renders daughter relation with male self", () => {
    const c = {
      ...self,
      gender: "male" as const,
      relations: { "peer-1": { kinds: ["daughter"] as const, sinceTick: 0 } },
    };
    const result = describeRelationBidirectional(c, "peer-1");
    expect(result).toContain("TA 是你的女儿");
    expect(result).toContain("你是 TA 的父亲");
  });

  it("renders daughter relation with female self", () => {
    const c = {
      ...self,
      gender: "female" as const,
      relations: { "peer-1": { kinds: ["daughter"] as const, sinceTick: 0 } },
    };
    const result = describeRelationBidirectional(c, "peer-1");
    expect(result).toContain("TA 是你的女儿");
    expect(result).toContain("你是 TA 的母亲");
  });

  it("handles multiple relation kinds", () => {
    const c = {
      ...self,
      gender: "male" as const,
      relations: { "peer-1": { kinds: ["colleague", "friend"] as const, sinceTick: 0 } },
    };
    const result = describeRelationBidirectional(c, "peer-1");
    expect(result).toContain("colleague");
    expect(result).toContain("friend");
    // Should have two lines (one per kind)
    const lines = result.split("\n");
    expect(lines.length).toBe(2);
  });

  it("falls back to raw kind string when kind has no label", () => {
    const c = {
      ...self,
      relations: { "peer-1": { kinds: ["classmate"] as const, sinceTick: 0 } },
    };
    const result = describeRelationBidirectional(c, "peer-1");
    expect(result).toContain("classmate");
    // DIRECTIONAL_KIND_LABELS doesn't have classmate, so no "你的" prefix
    expect(result).toContain("TA 是你的 classmate");
  });
});
```

- [ ] **Step 3: Run tests**

Run: `npx vitest run src/llm/prompt.test.ts --reporter=verbose`
Expected: New tests FAIL (function not yet exported/imported) or PASS if import is already correct

- [ ] **Step 4: Verify test passes after adding import**

Run: `npx vitest run src/llm/prompt.test.ts -t "describeRelationBidirectional" --reporter=verbose`
Expected: All 8 tests PASS

- [ ] **Step 5: Commit**

```bash
git add src/llm/prompt.ts src/llm/prompt.test.ts
git commit -m "feat: add describeRelationBidirectional with reverse relation mapping"
```

---

### Task 2: Add `buildSelfImage` and `buildPeerImage` helpers

**Files:**
- Modify: `src/llm/prompt.ts`
- Modify: `src/llm/prompt.test.ts`

- [ ] **Step 1: Add `buildSelfImage` function**

In `src/llm/prompt.ts`, add after `buildImage` (after line 386):

```typescript
export function buildSelfImage(c: Character, locationName?: string): string {
  const lines: string[] = [
    "关于你自己：",
    `- 姓名：${c.name}`,
    `- 年龄：${c.age} 岁`,
    `- 性别：${c.gender === "male" ? "男" : c.gender === "female" ? "女" : "其他"}`,
    `- 职业：${PROFESSION_LABELS[c.profession] ?? c.profession}`,
    `- 形象：${buildImage(c)}`,
  ];
  if (locationName) {
    lines.push(`- 当前在：${locationName}`);
  }
  return lines.join("\n");
}
```

- [ ] **Step 2: Add `buildPeerImage` function**

In `src/llm/prompt.ts`, add after `buildSelfImage`:

```typescript
export function buildPeerImage(self: Character, peer: Character): string {
  const lines: string[] = [
    `关于 ${peer.name}：`,
    `- 年龄：${peer.age} 岁`,
    `- 性别：${peer.gender === "male" ? "男" : peer.gender === "female" ? "女" : "其他"}`,
    `- 职业：${PROFESSION_LABELS[peer.profession] ?? peer.profession}`,
    `- 形象：${buildImage(peer)}`,
  ];
  lines.push(describeRelationBidirectional(self, peer.id));
  const impression = self.impressionBook[peer.id];
  if (impression && impression.trim().length > 0) {
    lines.push(`- 你对 TA 的印象：${impression}`);
  } else {
    lines.push("- 你对 TA 的印象：暂无特别印象");
  }
  return lines.join("\n");
}
```

- [ ] **Step 3: Add personality compression helper**

In `src/llm/prompt.ts`, add after `describePersonality` (after line 101):

```typescript
function describePersonalityCompact(p: Personality, intelligence: number): string {
  const ei = p.ei >= 0 ? "E" : "I";
  const sn = p.sn >= 0 ? "N" : "S";
  const tf = p.tf >= 0 ? "F" : "T";
  const jp = p.jp >= 0 ? "J" : "P";
  const intel = INTELLIGENCE_LABELS[intelligence] ?? INTELLIGENCE_LABELS[2];
  return `性格：${ei}${sn}${tf}${jp}，${intel}`;
}
```

Note: The EI_LABELS use -4..4 scale where negative = I, positive = E. So `p.ei >= 0` maps to "E", `< 0` to "I". Same for SN (negative=S, positive=N), TF (negative=F, positive=T), JP (negative=J, positive=P).

- [ ] **Step 4: Write tests for `buildSelfImage` and `buildPeerImage`**

In `src/llm/prompt.test.ts`, add to imports:
```typescript
import {
  // ... existing imports ...
  buildSelfImage,
  buildPeerImage,
} from "./prompt";
```

Add test blocks:
```typescript
describe("buildSelfImage", () => {
  const char: Character = {
    ...baseCharacter,
    name: "甲",
    age: 28,
    gender: "male",
    profession: "doctor",
    appearance: 3,
  };

  it("renders name, age, gender, profession, appearance, and location", () => {
    const result = buildSelfImage(char, "镇医院");
    expect(result).toContain("关于你自己");
    expect(result).toContain("姓名：甲");
    expect(result).toContain("年龄：28 岁");
    expect(result).toContain("性别：男");
    expect(result).toContain("职业：医生");
    expect(result).toContain("相貌端正");
    expect(result).toContain("当前在：镇医院");
  });

  it("omits location line when locationName is undefined", () => {
    const result = buildSelfImage(char);
    expect(result).not.toContain("当前在");
  });

  it("handles female gender", () => {
    const result = buildSelfImage({ ...char, gender: "female" });
    expect(result).toContain("性别：女");
  });
});

describe("buildPeerImage", () => {
  const self: Character = {
    ...baseCharacter,
    name: "甲",
    gender: "male",
    impressionBook: { "peer-1": "很健谈的一个医生。" },
    relations: { "peer-1": { kinds: ["colleague"] as const, sinceTick: 0 } },
  };
  const peer: Character = {
    ...baseCharacter,
    id: "peer-1",
    name: "乙",
    age: 42,
    gender: "male",
    profession: "doctor",
    appearance: 4,
    vitals: { hunger: 3, fatigue: 0, hygiene: 0 },
    emotion: { mood: -1, stress: 1, social_satiety: 0 },
  };

  it("renders peer info with relation and impression", () => {
    const result = buildPeerImage(self, peer);
    expect(result).toContain("关于 乙");
    expect(result).toContain("年龄：42 岁");
    expect(result).toContain("性别：男");
    expect(result).toContain("职业：医生");
    expect(result).toContain("面容出众");
    expect(result).toContain("你的同事");
    expect(result).toContain("很健谈的一个医生");
  });

  it("shows no-impression placeholder when impressionBook is empty", () => {
    const result = buildPeerImage({ ...self, impressionBook: {} }, peer);
    expect(result).toContain("暂无特别印象");
  });

  it("does NOT expose vitals or emotion values as numbers", () => {
    const result = buildPeerImage(self, peer);
    expect(result).not.toContain("hunger");
    expect(result).not.toContain("fatigue");
    expect(result).not.toContain("3");
    expect(result).not.toContain("mood");
  });
});
```

- [ ] **Step 5: Run tests**

Run: `npx vitest run src/llm/prompt.test.ts -t "buildSelfImage|buildPeerImage" --reporter=verbose`
Expected: All tests PASS

- [ ] **Step 6: Commit**

```bash
git add src/llm/prompt.ts src/llm/prompt.test.ts
git commit -m "feat: add buildSelfImage, buildPeerImage, and describePersonalityCompact helpers"
```

---

### Task 3: Refactor `buildAcceptDecisionPrompt`

**Files:**
- Modify: `src/llm/prompt.ts:722-784`

- [ ] **Step 1: Rewrite `buildAcceptDecisionPrompt`**

Replace the entire function body (lines 722-784) in `src/llm/prompt.ts`:

```typescript
export function buildAcceptDecisionPrompt(args: {
  self: Character;
  requesterName: string;
  freeText: string;
  here: MapNode;
  peer: Character;
  tick: number;
  language?: Language;
}): string {
  const { self, requesterName, freeText, here, peer, tick } = args;
  const language = args.language ?? "zh";
  const t = timeOfDay(tick, self.sleepWindow ?? DEFAULT_SLEEP_WINDOW);
  const fatigue = qualifyVital(self.vitals.fatigue, "fatigue");
  const hunger = qualifyVital(self.vitals.hunger, "hunger");

  const lines: string[] = [];

  lines.push(`${requesterName} 想和你说话："${freeText}"`);
  lines.push("");
  lines.push(buildSelfImage(self, here.name));
  lines.push("");
  lines.push(buildPeerImage(self, peer));
  lines.push("");
  lines.push("你当前的状态：");
  lines.push(`- 疲惫：${fatigue.phrase}`);
  lines.push(`- 饥饿：${hunger.phrase}`);
  lines.push(`- 心情：${MOOD_WORDS[self.emotion.mood] ?? String(self.emotion.mood)}`);
  lines.push(`- 压力：${STRESS_WORDS[self.emotion.stress] ?? String(self.emotion.stress)}`);
  lines.push(`- 社交满足：${SOCIAL_WORDS[self.emotion.social_satiety] ?? String(self.emotion.social_satiety)}`);
  lines.push("");
  lines.push(describePersonalityCompact(self.personality, self.intelligence));
  lines.push("");

  const timeStr = `第 ${t.day} 日 ${String(t.hour).padStart(2, "0")}:${String(t.minute).padStart(2, "0")}（${t.period}）`;
  lines.push(`当前时间：${timeStr}`, "");

  lines.push(
    language === "zh"
      ? "决定：你是否要和这个人说话？请调用 submit_accept_decision 工具，输出 accept_speak 或 reject_speak。"
      : language === "en"
        ? "Decide: will you talk to this person? Call submit_accept_decision with accept_speak or reject_speak."
        : "決定：この人と話しますか？submit_accept_decision を呼び出し、accept_speak か reject_speak を返してください。",
  );

  return lines.join("\n");
}
```

Key changes from original:
- `perceived: WorldEvent[]` and `companions: Character[]` params removed
- `peer: Character` param added
- Replaced `"你当前的状态："` first line that included `在 ${here.name}` (now covered by `buildSelfImage`)
- Replaced 4-line `describePersonality` expansion with `describePersonalityCompact`
- Removed perceived events and companions blocks entirely
- Added `buildSelfImage` and `buildPeerImage` calls

- [ ] **Step 2: Update existing `buildAcceptDecisionPrompt` tests**

In `src/llm/prompt.test.ts`, update the `buildAcceptDecisionPrompt` describe block:

Replace the old tests with:
```typescript
describe("buildAcceptDecisionPrompt", () => {
  const peer: Character = {
    ...baseCharacter,
    id: "peer-1",
    name: "甲",
    age: 30,
    gender: "female",
    profession: "teacher",
    appearance: 3,
  };

  it("contains requester name, freeText, self-image, peer-image, and submit instruction (zh)", () => {
    const result = buildAcceptDecisionPrompt({
      self: {
        ...baseCharacter,
        name: "乙",
        emotion: { mood: -1, stress: 1, social_satiety: 0 },
      },
      requesterName: "甲",
      freeText: "今天天气不错，一起散步吗？",
      here: restaurant,
      peer,
      tick: 12,
    });
    expect(result).toContain("甲");
    expect(result).toContain("今天天气不错，一起散步吗？");
    expect(result).toContain("关于你自己");
    expect(result).toContain("姓名：乙");
    expect(result).toContain("关于 甲");
    expect(result).toContain("职业：教师");
    expect(result).toContain("submit_accept_decision");
  });

  it("does NOT include perceived events or companions (removed)", () => {
    const result = buildAcceptDecisionPrompt({
      self: baseCharacter,
      requesterName: "甲",
      freeText: "嗨",
      here: restaurant,
      peer,
      tick: 5,
    });
    expect(result).not.toContain("你刚刚感知到的事件");
    expect(result).not.toContain("同节点其他人");
  });

  it("includes compact personality line instead of expanded traits", () => {
    const result = buildAcceptDecisionPrompt({
      self: baseCharacter,
      requesterName: "甲",
      freeText: "嗨",
      here: restaurant,
      peer,
      tick: 5,
    });
    expect(result).toContain("性格：ESFT");
    expect(result).not.toContain("内外向(E/I)");
    expect(result).not.toContain("直觉/实感(N/S)");
  });

  it("uses pre-filled impression from impressionBook", () => {
    const result = buildAcceptDecisionPrompt({
      self: { ...baseCharacter, impressionBook: { "peer-1": "安静但可靠。" } },
      requesterName: "甲",
      freeText: "嗨",
      here: restaurant,
      peer,
      tick: 5,
    });
    expect(result).toContain("安静但可靠");
  });
});
```

- [ ] **Step 3: Run tests**

Run: `npx vitest run src/llm/prompt.test.ts -t "buildAcceptDecisionPrompt" --reporter=verbose`
Expected: All 4 tests PASS

- [ ] **Step 4: Commit**

```bash
git add src/llm/prompt.ts src/llm/prompt.test.ts
git commit -m "refactor: rewrite buildAcceptDecisionPrompt with self/peer image blocks and compact personality"
```

---

### Task 4: Refactor `buildDialogTurnPrompt`

**Files:**
- Modify: `src/llm/prompt.ts:789-851`

- [ ] **Step 1: Rewrite `buildDialogTurnPrompt`**

Replace the entire function body (lines 789-851) in `src/llm/prompt.ts`:

```typescript
export function buildDialogTurnPrompt(args: {
  self: Character;
  peer: Character;
  transcript: DialogTurn[];
  here: MapNode;
  language?: Language;
}): string {
  const { self, peer, transcript, here } = args;
  const language = args.language ?? "zh";

  const history = transcript
    .map((t) => {
      if (t.speakerId === "__system__") {
        return `【${t.line ?? ""}】`;
      }
      const name = t.speakerId === self.id ? self.name : peer.name;
      return `${name}: ${t.line ?? ""}`;
    })
    .join("\n");

  const personalityLine = describePersonalityCompact(self.personality, self.intelligence);

  const lines: string[] = [];

  if (language === "zh") {
    lines.push(`你是 ${self.name}，正在和 ${peer.name} 对话。`);
    lines.push("");
    lines.push(buildSelfImage(self, here.name));
    lines.push("");
    lines.push(buildPeerImage(self, peer));
    lines.push("");
    lines.push(personalityLine);
    lines.push("");
    lines.push("对话记录：");
    lines.push(history || "(尚未开始)");
    lines.push("");
    lines.push(`现在轮到你说话。请根据你的性格自然地回应，不要重复对方刚说过的话。调用 submit_dialog_turn：kind="say" 并填写 line。如果想结束对话，请调用 end_conversation。`);
  } else if (language === "en") {
    lines.push(`You are ${self.name}, speaking with ${peer.name}.`);
    lines.push("");
    lines.push(buildSelfImage(self, here.name));
    lines.push("");
    lines.push(buildPeerImage(self, peer));
    lines.push("");
    lines.push(personalityLine);
    lines.push("");
    lines.push("Conversation:");
    lines.push(history || "(not yet started)");
    lines.push("");
    lines.push(`It's your turn. Respond naturally based on your personality — do not repeat what the other person just said. Call submit_dialog_turn with kind="say" and line. If you want to end the conversation, call end_conversation.`);
  } else {
    lines.push(`あなたは ${self.name} です。${peer.name} と会話しています。`);
    lines.push("");
    lines.push(buildSelfImage(self, here.name));
    lines.push("");
    lines.push(buildPeerImage(self, peer));
    lines.push("");
    lines.push(personalityLine);
    lines.push("");
    lines.push("会話の記録：");
    lines.push(history || "(まだ始まっていません)");
    lines.push("");
    lines.push(`あなたの番です。自分の性格に基づいて自然に応答してください。相手が今言ったことをそのまま繰り返さないでください。submit_dialog_turn で kind="say" を呼び出し line を入力してください。会話を終了する場合は end_conversation を呼び出してください。`);
  }

  return lines.join("\n");
}
```

Key changes from original:
- `here: MapNode` param added
- Replaced 4-line `describePersonality` expansion with `describePersonalityCompact`
- Added `buildSelfImage(self, here.name)` and `buildPeerImage(self, peer)` blocks after identity line and before personality
- The identity header line ("你是 X，正在和 Y 对话") is kept as a quick summary

- [ ] **Step 2: Update existing `buildDialogTurnPrompt` tests**

In `src/llm/prompt.test.ts`, replace the `buildDialogTurnPrompt` describe block:

```typescript
describe("buildDialogTurnPrompt", () => {
  const transcript: DialogTurn[] = [
    { speakerId: "a", kind: "say", line: "今天天气真好。" },
    { speakerId: "b", kind: "say", line: "是啊，适合出去走走。" },
    { speakerId: "a", kind: "say", line: "你最近在忙什么？" },
  ];

  const selfChar: Character = {
    ...baseCharacter,
    id: "b",
    name: "乙",
    age: 25,
    gender: "male",
    profession: "merchant",
    appearance: 2,
    personality: { ei: 0, sn: 0, tf: 0, jp: 0 },
    relations: { "a": { kinds: ["friend"] as const, sinceTick: 0 } },
  };
  const peerChar: Character = {
    ...baseCharacter,
    id: "a",
    name: "甲",
    age: 30,
    gender: "female",
    profession: "teacher",
    appearance: 3,
  };

  it("renders self-image, peer-image, compact personality, and transcript (zh)", () => {
    const result = buildDialogTurnPrompt({
      self: selfChar,
      peer: peerChar,
      transcript,
      here: restaurant,
    });
    // Self image
    expect(result).toContain("关于你自己");
    expect(result).toContain("姓名：乙");
    expect(result).toContain("当前在：老王饭馆");
    // Peer image
    expect(result).toContain("关于 甲");
    expect(result).toContain("职业：教师");
    // Compact personality
    expect(result).toContain("性格：ESFT");
    expect(result).not.toContain("内外向(E/I)");
    // Transcript
    expect(result).toContain("今天天气真好");
    expect(result).toContain("submit_dialog_turn");
  });

  it("renders system messages with 【】 brackets", () => {
    const transcriptWithSys: DialogTurn[] = [
      ...transcript,
      { speakerId: "__system__", kind: "say", line: "已过去 30 分钟。" },
    ];
    const result = buildDialogTurnPrompt({
      self: selfChar,
      peer: peerChar,
      transcript: transcriptWithSys,
      here: restaurant,
    });
    expect(result).toContain("【已过去 30 分钟。】");
  });

  it("en: renders in English with self/peer image", () => {
    const result = buildDialogTurnPrompt({
      self: selfChar,
      peer: peerChar,
      transcript,
      here: restaurant,
      language: "en",
    });
    expect(result).toContain("You are 乙, speaking with 甲");
    expect(result).toContain("submit_dialog_turn");
  });

  it("ja: renders in Japanese with self/peer image", () => {
    const result = buildDialogTurnPrompt({
      self: selfChar,
      peer: peerChar,
      transcript,
      here: restaurant,
      language: "ja",
    });
    expect(result).toContain("あなたは 乙 です");
    expect(result).toContain("submit_dialog_turn");
  });
});
```

- [ ] **Step 3: Run tests**

Run: `npx vitest run src/llm/prompt.test.ts -t "buildDialogTurnPrompt" --reporter=verbose`
Expected: All 4 tests PASS

- [ ] **Step 4: Commit**

```bash
git add src/llm/prompt.ts src/llm/prompt.test.ts
git commit -m "refactor: rewrite buildDialogTurnPrompt with self/peer image blocks and compact personality"
```

---

### Task 5: Update `llmAcceptDecide` call site in `src/llm/decide.ts`

**Files:**
- Modify: `src/llm/decide.ts:798-830`

- [ ] **Step 1: Update `AcceptDecisionInput` interface**

Replace lines 798-808:
```typescript
export interface AcceptDecisionInput {
  character: Character;
  requesterName: string;
  requesterId: string;
  freeText: string;
  here: MapNode;
  peer: Character;
  tick: number;
  language?: Language;
}
```

- [ ] **Step 2: Update `llmAcceptDecide` prompt construction**

Replace lines 821-830:
```typescript
  const prompt = buildAcceptDecisionPrompt({
    self: input.character,
    requesterName: input.requesterName,
    freeText: input.freeText,
    here: input.here,
    peer: input.peer,
    tick: input.tick,
    language,
  });
```

- [ ] **Step 3: Verify no other references to removed fields**

Run: `grep -n 'perceived\|companions' src/llm/decide.ts`
Expected: No matches in the llmAcceptDecide function area (lines 810-893).

- [ ] **Step 4: Commit**

```bash
git add src/llm/decide.ts
git commit -m "refactor: update llmAcceptDecide to pass peer character instead of perceived/companions"
```

---

### Task 6: Update type signatures in `src/engine/dialog.ts`

**Files:**
- Modify: `src/engine/dialog.ts:75-95`

- [ ] **Step 1: Update `AcceptDecideFn` type**

Replace lines 75-85:
```typescript
export type AcceptDecideFn = (input: {
  character: Character;
  requesterName: string;
  requesterId: string;
  freeText: string;
  here: MapNode;
  peer: Character;
  tick: number;
  language: Language;
}) => Promise<AcceptDecideResult>;
```

- [ ] **Step 2: Update `TurnDecideFn` type**

Replace lines 87-95:
```typescript
export type TurnDecideFn = (input: {
  self: Character;
  peer: Character;
  transcript: DialogTurn[];
  here: MapNode;
  language: Language;
}) => Promise<
  | { kind: "turn"; turn: DialogTurn }
  | { kind: "end"; payload: EndConversationPayload }
>;
```

- [ ] **Step 3: Update `llmDialogTurn` to accept and pass `here`**

In `src/llm/decide.ts`, add `here` to `DialogTurnInput` (lines 381-385):
```typescript
interface DialogTurnInput {
  self: Character;
  peer: Character;
  transcript: DialogTurn[];
  here: MapNode;
  language?: Language;
}
```

And update the `buildDialogTurnPrompt` call in `llmDialogTurn` (lines 398-403):
```typescript
  const prompt = buildDialogTurnPrompt({
    self: input.self,
    peer: input.peer,
    transcript: input.transcript,
    here: input.here,
    language,
  });
```

- [ ] **Step 4: Commit**

```bash
git add src/engine/dialog.ts src/llm/decide.ts
git commit -m "refactor: update AcceptDecideFn and TurnDecideFn types for dialog context optimization"
```

---

### Task 7: Update `runDialogPhase` call sites in `src/engine/dialog.ts`

**Files:**
- Modify: `src/engine/dialog.ts:292-370` (runOneTickDialog)
- Modify: `src/engine/dialog.ts:515-538` (acceptDecide call site)

- [ ] **Step 1: Update `runOneTickDialog` to pass `here` to `turnDecide`**

The function already receives `chars: Map<string, Character>` and the characters have `locationId`. We need to also receive `nodeById: Map<string, MapNode>` or the nodes array.

Change `runOneTickDialog` signature (line 292) to add `nodeById`:
```typescript
async function runOneTickDialog(
  conv: Conversation,
  chars: Map<string, Character>,
  nodeById: Map<string, MapNode>,
  turnDecide: TurnDecideFn,
  language: Language,
  currentTick: number,
): Promise<TickDialogResult> {
```

Then on each `turnDecide` call, add `here`:
At line 335:
```typescript
      const speakerHere = nodeById.get(speaker.locationId)!;
      result = await retryOnce(() => turnDecide({ self: speaker, peer, transcript, here: speakerHere, language }));
```

At line 365:
```typescript
          const otherHere = nodeById.get(other.locationId)!;
          const extraResult = await turnDecide({
            self: other,
            peer: otherPeer,
            transcript,
            here: otherHere,
            language,
          });
```

- [ ] **Step 2: Update callers of `runOneTickDialog`**

At lines 469 and 582, update calls to pass `nodeById`:
```typescript
// Line 469 (Part 1: Resume ongoing conversations)
const tickResult = await runOneTickDialog(conv, charById, nodeById, input.turnDecide, input.language, tick);

// Line 582 (Part 3: New conversations)
const tickResult = await runOneTickDialog(conv, charById, nodeById, input.turnDecide, input.language, tick);
```

- [ ] **Step 3: Update `acceptDecide` call site**

Replace lines 515-538 with updated call that passes `peer` (the requester character) instead of `perceived` and `companions`:

```typescript
  const acceptResults = await Promise.all(
    pairing.pendingAcceptances.map(async (pa) => {
      const target = charById.get(pa.target)!;
      const requester = charById.get(pa.requester)!;
      const here = nodeById.get(target.locationId)!;
      let result: AcceptDecideResult;
      try {
        result = await input.acceptDecide({
          character: target, requesterName: requester.name, requesterId: pa.requester,
          freeText: pa.freeText, here, peer: requester, tick, language: input.language,
        });
      } catch {
        result = { type: "reject_speak", targetId: pa.requester, reasoning: "决策失败默认拒绝", selfImportance: 1 };
      }
      if (result.type !== "accept_speak" && result.type !== "reject_speak") {
        result = { type: "reject_speak", targetId: pa.requester, reasoning: "决策输出非法 type", selfImportance: 1 };
      }
      return { pa, result };
    }),
  );
```

Note: The `characters.filter(...)` for `companions` and `perceptions.get(...)` for `perceived` are no longer needed and should be removed.

- [ ] **Step 4: Commit**

```bash
git add src/engine/dialog.ts
git commit -m "refactor: update runDialogPhase to pass peer character and node location to dialog functions"
```

---

### Task 8: Update `tick.ts` call site

**Files:**
- Modify: `src/llm/decide.ts:388` (llmDialogTurn call)
- Verify: `src/engine/tick.ts:716-726` (no changes needed — injections pass through unchanged)

- [ ] **Step 1: Verify tick.ts doesn't need type-level changes**

The `tick.ts` file at lines 716-726 injects `llmAcceptDecide`, `llmDialogTurn`, and `llmDialogSummarize` as the `DecideFn` implementations. The type changes propagate through the function signatures — no additional changes needed in tick.ts since the function references remain the same.

- [ ] **Step 2: Run full test suite**

Run: `npx vitest run --reporter=verbose`
Expected: All tests PASS. Pay attention to:
- `src/llm/prompt.test.ts`
- `src/llm/decide.test.ts`
- `src/engine/dialog.test.ts`
- `src/engine/tick.test.ts`

- [ ] **Step 3: Commit**

If any test files needed updates (e.g., `dialog.test.ts` mock `turnDecide` signatures):

```bash
git add src/llm/decide.test.ts src/engine/dialog.test.ts src/engine/tick.test.ts
git commit -m "test: update dialog test mocks for new function signatures"
```

Otherwise, no commit needed if all tests already pass.

---

### Task 9: Final verification and cleanup

- [ ] **Step 1: Type check the project**

Run: `npx tsc --noEmit`
Expected: No type errors

- [ ] **Step 2: Run full test suite**

Run: `npx vitest run --reporter=verbose`
Expected: All tests PASS

- [ ] **Step 3: Quick manual check of generated prompts**

Run a single tick and verify the prompt structure via logs:
```bash
# Check that accept_decision logs show self-image and peer-image blocks
grep "buildAcceptDecision" -A 5 logs/llm-debug.log | head -40
```

- [ ] **Step 4: Commit any remaining changes**

```bash
git add -A
git commit -m "chore: final verification — all tests pass, no type errors"
```
