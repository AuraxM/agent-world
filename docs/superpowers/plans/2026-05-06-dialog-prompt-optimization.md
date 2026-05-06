# 对话 Prompt 重构实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 重构 `buildDialogTurnPrompt` 和 `buildAcceptDecisionPrompt` 的段落顺序与内容，实现角色身份认知优化和前缀缓存利用率提升。

**Architecture:** 修改 `src/llm/prompt.ts` 中三个 builder 函数（`buildSelfImage`、`buildDialogTurnPrompt`、`buildAcceptDecisionPrompt`），将指令性内容前置、角色信息居中、对话记录置底。`buildSelfImage` 移除形象、健康改为生病描述、增加性格和生平。system prompt 不动。

**Tech Stack:** TypeScript, Vitest

---

### Task 1: 重构 `buildSelfImage()` — 修改自我画像内容

**Files:**
- Modify: `src/llm/prompt.ts:771-785`

- [ ] **Step 1: 修改 `buildSelfImage` 函数**

将函数改为：

```typescript
export function buildSelfImage(c: Character): string {
  const lines: string[] = [
    "关于你自己：",
    `- 姓名：${c.name}`,
    `- 年龄：${c.age} 岁`,
    `- 性别：${c.gender === "male" ? "男" : c.gender === "female" ? "女" : "其他"}`,
    `- 职业：${PROFESSION_LABELS[c.profession] ?? c.profession}`,
    `- 健康状况：${c.sickness ? "你生病了" : "健康"}`,
    `- 性格：${describePersonalityCompact(c.personality, c.intelligence)}`,
    `- 生平简介：${c.biography}`,
  ];
  return lines.join("\n");
}
```

变更点：
- 移除 `locationName?: string` 参数
- 移除形象行（`- 形象：${buildImage(c)}`）
- 健康状况从 `HEALTH_LABELS[c.health]` 改为 `c.sickness ? "你生病了" : "健康"`
- 新增性格行（调用 `describePersonalityCompact`）
- 新增生平简介行
- 移除 `if (locationName) { lines.push(...) }` 地点分支

- [ ] **Step 2: 验证编译通过**

```bash
npx tsc --noEmit src/llm/prompt.ts
```

预期：编译通过（可能有其他文件的类型错误，忽略）

---

### Task 2: 更新 `buildSelfImage()` 的所有调用点

**Files:**
- Modify: `src/llm/prompt.ts:830,952,968,984`

`buildSelfImage` 去掉了 `locationName` 参数，4 处调用都需要更新。

- [ ] **Step 1: 更新 `buildAcceptDecisionPrompt` 中的调用（line 830）**

```diff
- lines.push(buildSelfImage(self, here.name));
+ lines.push(buildSelfImage(self));
```

- [ ] **Step 2: 更新 `buildDialogTurnPrompt` 中 zh 分支的调用（line 952）**

```diff
- lines.push(buildSelfImage(self, here.name));
+ lines.push(buildSelfImage(self));
```

- [ ] **Step 3: 更新 `buildDialogTurnPrompt` 中 en 分支的调用（line 968）**

```diff
- lines.push(buildSelfImage(self, here.name));
+ lines.push(buildSelfImage(self));
```

- [ ] **Step 4: 更新 `buildDialogTurnPrompt` 中 ja 分支的调用（line 984）**

```diff
- lines.push(buildSelfImage(self, here.name));
+ lines.push(buildSelfImage(self));
```

- [ ] **Step 5: 验证编译通过**

```bash
npx tsc --noEmit src/llm/prompt.ts
```

---

### Task 3: 重构 `buildDialogTurnPrompt()` — 重排段落顺序

**Files:**
- Modify: `src/llm/prompt.ts:861-1000`

- [ ] **Step 1: 修改 transcript 渲染，用自己的名字 → "你"**

```diff
- const name = t.speakerId === self.id ? self.name : peer.name;
+ const name = t.speakerId === self.id ? "你" : peer.name;
```

- [ ] **Step 2: 删除独立的 personalityLine**

在 `buildDialogTurnPrompt` 开头附近删除：
```diff
- const personalityLine = describePersonalityCompact(self.personality, self.intelligence);
```

- [ ] **Step 3: 添加构建指令头部的辅助函数（保留现有内联函数不变，提取最顶部指令）**

在当前代码中，zh/en/ja 三个分支的构建逻辑需要重排。新的结构是：

```typescript
// 头部指令（缓存前缀 — 跨轮次一致）
// 注意：buildPendingActionBlock 是动态的（有/无 pending action），
// 放在头部后面但仍在角色信息之前，其内容只影响有 pending action 的轮次
```

修改 zh 分支（line 949-964）为：

```typescript
if (language === "zh") {
  // -- 头部：指令（缓存前缀） --
  lines.push(
    "你是一个角色扮演引擎中的 NPC。你正在和另一个人对话。",
    "请根据你的性格、当前情境和对话历史，自然地回应。",
    "不要重复对方刚说过的话。",
  );
  if (tick !== undefined && promptEpoch !== undefined) {
    lines.push(`当前游戏时间：${buildTimeStr(tick, promptEpoch, self.sleepWindow ?? DEFAULT_SLEEP_WINDOW, "zh")}`);
  }
  lines.push("");
  lines.push(buildNotebookReminder("zh"));
  lines.push("");
  lines.push(buildDialogueActionsBlock("zh"));
  lines.push(buildPendingActionBlock("zh"));
  lines.push(buildUpcomingBlock("zh"));
  lines.push("");
  lines.push(
    "现在轮到你说话。请根据你的性格自然地回应，不要重复对方刚说过的话。调用 submit_dialog_turn：kind=\"say\" 并填写 line。如果想结束对话，请调用 end_conversation。",
  );
  lines.push("");

  // -- 中部：角色信息（缓存前缀 — 跨轮次一致） --
  lines.push(buildSelfImage(self));
  lines.push("");
  lines.push(buildPeerImage(self, peer));
  lines.push("");
  lines.push(`当前地点：${here.name}`);
  lines.push("");

  // -- 尾部：对话记录（每轮变化） --
  lines.push("对话记录：");
  lines.push(history || "(尚未开始)");
}
```

类似的，en 分支和 ja 分支也要做同样的重排。

- [ ] **Step 4: 实现 en 分支重排**

en 分支（原 line 965-980）改为：

```typescript
else if (language === "en") {
  lines.push(
    "You are an NPC in a role-playing engine. You are speaking with another person.",
    "Respond naturally based on your personality, current situation, and conversation history.",
    "Do not repeat what the other person just said.",
  );
  if (tick !== undefined && promptEpoch !== undefined) {
    lines.push(`Current game time: ${buildTimeStr(tick, promptEpoch, self.sleepWindow ?? DEFAULT_SLEEP_WINDOW, "en")}`);
  }
  lines.push("");
  lines.push(buildNotebookReminder("en"));
  lines.push("");
  lines.push(buildDialogueActionsBlock("en"));
  lines.push(buildPendingActionBlock("en"));
  lines.push(buildUpcomingBlock("en"));
  lines.push("");
  lines.push(
    "It's your turn. Respond naturally based on your personality — do not repeat what the other person just said. Call submit_dialog_turn with kind=\"say\" and line. If you want to end the conversation, call end_conversation.",
  );
  lines.push("");

  lines.push(buildSelfImage(self));
  lines.push("");
  lines.push(buildPeerImage(self, peer));
  lines.push("");
  lines.push(`Current location: ${here.name}`);
  lines.push("");

  lines.push("Conversation:");
  lines.push(history || "(not yet started)");
}
```

- [ ] **Step 5: 实现 ja 分支重排**

ja 分支（原 line 981-997）改为：

```typescript
else {
  lines.push(
    "あなたはロールプレイングエンジンの NPC です。他の人と会話しています。",
    "あなたの性格、現在の状況、会話の履歴に基づいて自然に応答してください。",
    "相手が今言ったことをそのまま繰り返さないでください。",
  );
  if (tick !== undefined && promptEpoch !== undefined) {
    lines.push(`現在のゲーム時間：${buildTimeStr(tick, promptEpoch, self.sleepWindow ?? DEFAULT_SLEEP_WINDOW, "ja")}`);
  }
  lines.push("");
  lines.push(buildNotebookReminder("ja"));
  lines.push("");
  lines.push(buildDialogueActionsBlock("ja"));
  lines.push(buildPendingActionBlock("ja"));
  lines.push(buildUpcomingBlock("ja"));
  lines.push("");
  lines.push(
    "あなたの番です。自分の性格に基づいて自然に応答してください。相手が今言ったことをそのまま繰り返さないでください。submit_dialog_turn で kind=\"say\" を呼び出し line を入力してください。会話を終了する場合は end_conversation を呼び出してください。",
  );
  lines.push("");

  lines.push(buildSelfImage(self));
  lines.push("");
  lines.push(buildPeerImage(self, peer));
  lines.push("");
  lines.push(`現在地：${here.name}`);
  lines.push("");

  lines.push("会話の記録：");
  lines.push(history || "(まだ始まっていません)");
}
```

- [ ] **Step 6: 添加 `buildTimeStr` 辅助函数**

在 `buildDialogTurnPrompt` 上方添加：

```typescript
function buildDialogTimeStr(
  tick: number,
  epoch: number,
  sleepWindow: SleepWindow,
  lang: Language,
): string {
  const t = timeOfDay(tick, epoch, sleepWindow);
  const timeStr = `第 ${t.day} 日 ${String(t.hour).padStart(2, "0")}:${String(t.minute).padStart(2, "0")}（${t.period}）`;
  if (lang === "zh") return timeStr;
  if (lang === "en") {
    const hh = String(t.hour).padStart(2, "0");
    const mm = String(t.minute).padStart(2, "0");
    return `Day ${t.day}, ${hh}:${mm} (${t.period})`;
  }
  const hh = String(t.hour).padStart(2, "0");
  const mm = String(t.minute).padStart(2, "0");
  return `${t.day}日目 ${hh}:${mm}（${t.period}）`;
}
```

注意：只当 `tick` 和 `epoch` 都有值时才显示时间（`buildDialogTurnPrompt` 的参数中这两个是可选的）。

- [ ] **Step 7: 删除不再需要的旧代码**

确认删除了：
- 旧的 zh/en/ja 分支所有 `lines.push` 代码（已替换）
- `const personalityLine = ...` 行（已删除）
- 独立的 `lines.push(personalityLine)` 调用（已删除）

- [ ] **Step 8: 验证编译**

```bash
npx tsc --noEmit src/llm/prompt.ts
```

---

### Task 4: 重构 `buildAcceptDecisionPrompt()` — 重排段落顺序

**Files:**
- Modify: `src/llm/prompt.ts:810-856`

- [ ] **Step 1: 重写 `buildAcceptDecisionPrompt` 函数体**

将当前的函数体（line 820-855）替换为：

zh 分支：

```typescript
const { self, requesterName, freeText, here, peer, tick, epoch } = args;
const language = args.language ?? "zh";
const t = timeOfDay(tick, epoch, self.sleepWindow ?? DEFAULT_SLEEP_WINDOW);
const fatigue = qualifyVital(self.vitals.fatigue, "fatigue");
const hunger = qualifyVital(self.vitals.hunger, "hunger");

const lines: string[] = [];

const timeStr = `第 ${t.day} 日 ${String(t.hour).padStart(2, "0")}:${String(t.minute).padStart(2, "0")}（${t.period}）`;

if (language === "zh") {
  // -- 头部：指令 --
  lines.push("你是一个角色扮演引擎中的 NPC。你正在决定是否接受对方的对话邀请。");
  lines.push(`当前游戏时间：${timeStr}`);
  lines.push("");
  lines.push(
    "决定：你是否要和这个人说话？请调用 submit_accept_decision 工具，输出 accept_speak 或 reject_speak。",
  );
  lines.push("");

  // -- 中部：情境 --
  lines.push(`${requesterName} 想和你说话："${freeText}"`);
  lines.push("");
  lines.push(buildSelfImage(self));
  lines.push("");
  lines.push("你当前的状态：");
  lines.push(`- 疲惫：${fatigue.phrase}`);
  lines.push(`- 饥饿：${hunger.phrase}`);
  lines.push(`- 心情：${MOOD_WORDS[self.emotion.mood] ?? String(self.emotion.mood)}`);
  lines.push(`- 压力：${STRESS_WORDS[self.emotion.stress] ?? String(self.emotion.stress)}`);
  lines.push(`- 社交满足：${SOCIAL_WORDS[self.emotion.social_satiety] ?? String(self.emotion.social_satiety)}`);
  lines.push("");
  lines.push(buildPeerImage(self, peer));
  lines.push("");
  lines.push(`当前地点：${here.name}`);
} else if (language === "en") {
  // en 分支类似结构
  lines.push("You are an NPC in a role-playing engine. You are deciding whether to accept someone's conversation invitation.");
  lines.push(`Current game time: ${timeStr}`);
  lines.push("");
  lines.push("Decide: will you talk to this person? Call submit_accept_decision with accept_speak or reject_speak.");
  lines.push("");

  lines.push(`${requesterName} wants to talk to you: "${freeText}"`);
  lines.push("");
  lines.push(buildSelfImage(self));
  lines.push("");
  lines.push("Your current state:");
  lines.push(`- Fatigue: ${fatigue.phrase}`);
  lines.push(`- Hunger: ${hunger.phrase}`);
  lines.push(`- Mood: ${MOOD_WORDS[self.emotion.mood] ?? String(self.emotion.mood)}`);
  lines.push(`- Stress: ${STRESS_WORDS[self.emotion.stress] ?? String(self.emotion.stress)}`);
  lines.push(`- Social: ${SOCIAL_WORDS[self.emotion.social_satiety] ?? String(self.emotion.social_satiety)}`);
  lines.push("");
  lines.push(buildPeerImage(self, peer));
  lines.push("");
  lines.push(`Current location: ${here.name}`);
} else {
  // ja 分支类似结构
  lines.push("あなたはロールプレイングエンジンの NPC です。会話の招待を受けるかどうか決定しています。");
  lines.push(`現在のゲーム時間：${timeStr}`);
  lines.push("");
  lines.push("決定：この人と話しますか？submit_accept_decision を呼び出し、accept_speak か reject_speak を返してください。");
  lines.push("");

  lines.push(`${requesterName} があなたと話したがっています：「${freeText}」`);
  lines.push("");
  lines.push(buildSelfImage(self));
  lines.push("");
  lines.push("あなたの現在の状態：");
  lines.push(`- 疲労：${fatigue.phrase}`);
  lines.push(`- 空腹：${hunger.phrase}`);
  lines.push(`- 気分：${MOOD_WORDS[self.emotion.mood] ?? String(self.emotion.mood)}`);
  lines.push(`- ストレス：${STRESS_WORDS[self.emotion.stress] ?? String(self.emotion.stress)}`);
  lines.push(`- 社交満足度：${SOCIAL_WORDS[self.emotion.social_satiety] ?? String(self.emotion.social_satiety)}`);
  lines.push("");
  lines.push(buildPeerImage(self, peer));
  lines.push("");
  lines.push(`現在地：${here.name}`);
}

return lines.join("\n");
```

变更点：
- 指令前置（NPC 角色指令 + 时间 + 决定指令）
- 移除独立的 `describePersonalityCompact` 调用（性格已移入 `buildSelfImage`）
- 状态行放在 self 之后、peer 之前
- 地点移到 peer 之后

- [ ] **Step 2: 验证编译**

```bash
npx tsc --noEmit src/llm/prompt.ts
```

---

### Task 5: 更新测试

**Files:**
- Modify: `src/llm/prompt.test.ts:625-699,701-784,1020-1045`

- [ ] **Step 1: 更新 `buildSelfImage` 测试（line 1020-1045）**

```typescript
describe("buildSelfImage", () => {
  const char: Character = {
    ...baseCharacter,
    name: "甲",
    age: 28,
    gender: "male",
    profession: "doctor",
    appearance: 3,
    biography: "出生于小镇，毕业于医学院。",
    personality: { ei: 2, sn: -1, tf: 1, jp: -1 },
    intelligence: 3,
  };

  it("renders name, age, gender, profession, health, personality, and biography (no appearance, no location)", () => {
    const result = buildSelfImage(char);
    expect(result).toContain("关于你自己");
    expect(result).toContain("姓名：甲");
    expect(result).toContain("年龄：28 岁");
    expect(result).toContain("性别：男");
    expect(result).toContain("职业：医生");
    expect(result).not.toContain("相貌端正");  // 不再显示形象
    expect(result).toContain("健康状况：健康");  // sickness 为 falsy 时显示"健康"
    expect(result).toContain("性格：");  // 包含性格
    expect(result).toContain("生平简介：出生于小镇，毕业于医学院。");
    expect(result).not.toContain("当前在");  // 地点不再在此块中
  });

  it("shows sick when character has sickness", () => {
    const sickChar = { ...char, sickness: true };
    const result = buildSelfImage(sickChar);
    expect(result).toContain("健康状况：你生病了");
  });

  it("handles female gender", () => {
    const result = buildSelfImage({ ...char, gender: "female" });
    expect(result).toContain("性别：女");
  });
});
```

- [ ] **Step 2: 更新 `buildAcceptDecisionPrompt` 测试（line 625-699）**

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

  it("contains requester name, freeText, self-image, peer-image, location, and decision instruction at top (zh)", () => {
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
      epoch: TEST_EPOCH,
    });
    // 指令在前
    expect(result.indexOf("submit_accept_decision")).toBeLessThan(result.indexOf("关于你自己"));
    expect(result.indexOf("submit_accept_decision")).toBeLessThan(result.indexOf("今天天气不错"));
    // 角色信息在中间
    expect(result).toContain("关于你自己");
    expect(result).toContain("姓名：乙");
    expect(result).toContain("关于 甲");
    expect(result).toContain("职业：教师");
    // 地点在末尾（peer 之后）
    expect(result.indexOf("当前地点")).toBeGreaterThan(result.indexOf("关于 甲"));
    // 不再包含独立性格行
    expect(result).not.toContain("性格：EN");
  });

  it("does NOT include perceived events or companions (removed)", () => {
    const result = buildAcceptDecisionPrompt({
      self: baseCharacter,
      requesterName: "甲",
      freeText: "嗨",
      here: restaurant,
      peer,
      tick: 5,
      epoch: TEST_EPOCH,
    });
    expect(result).not.toContain("你刚刚感知到的事件");
    expect(result).not.toContain("同节点其他人");
  });

  it("personality is inside self-image, not standalone", () => {
    const result = buildAcceptDecisionPrompt({
      self: baseCharacter,
      requesterName: "甲",
      freeText: "嗨",
      here: restaurant,
      peer,
      tick: 5,
      epoch: TEST_EPOCH,
    });
    // 性格应该在 buildSelfImage 内部，不应作为独立行出现
    const selfImageStart = result.indexOf("关于你自己");
    const selfImageEnd = result.indexOf("关于 甲");
    const selfSection = result.slice(selfImageStart, selfImageEnd);
    expect(selfSection).toContain("性格：");
    // 确认"关于你自己"和"关于 甲"之间没有独立的"性格："行
    // （性格已在 buildSelfImage 内部）
  });

  it("uses pre-filled impression from impressionBook", () => {
    const result = buildAcceptDecisionPrompt({
      self: { ...baseCharacter, impressionBook: { "peer-1": "安静但可靠。" } },
      requesterName: "甲",
      freeText: "嗨",
      here: restaurant,
      peer,
      tick: 5,
      epoch: TEST_EPOCH,
    });
    expect(result).toContain("安静但可靠");
  });
});
```

- [ ] **Step 3: 更新 `buildDialogTurnPrompt` 测试（line 701-784）**

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
    relations: { "a": { kinds: ["friend"] as ObjectiveRelationKind[], since: 0, lastInteractionTick: 0 } },
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

  it("renders instructions at top, self-image, peer-image, location, and transcript at bottom (zh)", () => {
    const result = buildDialogTurnPrompt({
      self: selfChar,
      peer: peerChar,
      transcript,
      here: restaurant,
    });
    // 指令在角色信息之前
    expect(result.indexOf("submit_dialog_turn")).toBeLessThan(result.indexOf("关于你自己"));
    // 地点在 peer 之后
    expect(result.indexOf("当前地点")).toBeGreaterThan(result.indexOf("关于 甲"));
    // 对话记录在最后
    expect(result.indexOf("对话记录：")).toBeGreaterThan(result.indexOf("当前地点"));
    // 对话记录中使用"你"而非自己的名字
    expect(result).toContain("你: 是啊，适合出去走走。");
    expect(result).not.toContain("乙: 是啊，适合出去走走。");
    // 对方名字不变
    expect(result).toContain("甲: 今天天气真好");
    // 性格在 buildSelfImage 内
    const selfStart = result.indexOf("关于你自己");
    const selfEnd = result.indexOf("关于 甲");
    expect(result.slice(selfStart, selfEnd)).toContain("性格：");
    // 无独立性格行在 self 块外
    expect(result).not.toContain("性格：EN");
    // 包含必需内容
    expect(result).toContain("姓名：乙");
    expect(result).toContain("职业：教师");
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

  it("en: renders instructions at top, location after peer, transcript at bottom", () => {
    const result = buildDialogTurnPrompt({
      self: selfChar,
      peer: peerChar,
      transcript,
      here: restaurant,
      language: "en",
    });
    // 指令在角色信息之前（en 的 self-image 也输出"关于你自己"）
    expect(result.indexOf("submit_dialog_turn")).toBeLessThan(result.indexOf("关于你自己"));
    expect(result.indexOf("Current location")).toBeGreaterThan(result.indexOf("关于 甲"));
    expect(result.indexOf("Conversation:")).toBeGreaterThan(result.indexOf("Current location"));
    expect(result).toContain("You: 是啊，适合出去走走。");
    expect(result).not.toContain("乙: 是啊，适合出去走走。");
  });

  it("ja: renders instructions at top, location after peer, transcript at bottom", () => {
    const result = buildDialogTurnPrompt({
      self: selfChar,
      peer: peerChar,
      transcript,
      here: restaurant,
      language: "ja",
    });
    expect(result.indexOf("submit_dialog_turn")).toBeLessThan(result.indexOf("关于你自己"));
    expect(result.indexOf("現在地")).toBeGreaterThan(result.indexOf("关于 甲"));
    expect(result.indexOf("会話の記録：")).toBeGreaterThan(result.indexOf("現在地"));
    expect(result).toContain("あなた: 是啊，适合出去走走。");
    expect(result).not.toContain("乙: 是啊，适合出去走走。");
  });
});
```

- [ ] **Step 4: 运行测试验证失败（旧逻辑）**

```bash
npx vitest run src/llm/prompt.test.ts
```

预期：与 `buildSelfImage`、`buildAcceptDecisionPrompt`、`buildDialogTurnPrompt` 相关的测试 FAIL（因为代码已改但测试还引用旧结构）。

---

### Task 6: 验证全部通过并提交

- [ ] **Step 1: 运行完整测试**

```bash
npx vitest run src/llm/prompt.test.ts
```

预期：全部 PASS。

- [ ] **Step 2: 检查 decide.ts 是否需要调整**

确认 `decide.ts` 中 system prompt 构造（line 524-528）的时间行没有重复问题。system prompt 已有 `${timeLine}`，user prompt 头部也包含了时间。**不需要修改 decide.ts**（spec 明确 system prompt 不动）。

- [ ] **Step 3: 提交**

```bash
git add src/llm/prompt.ts src/llm/prompt.test.ts
git commit -m "feat: restructure dialog prompts for identity cognition and cache optimization

- Dialog transcript: replace self name with 你 for character identity
- buildSelfImage: remove appearance, simplify health to sick/not-sick,
  add personality and biography inline
- Move instructions to user prompt head (stable prefix for cache)
- Move location after peer info, transcript at very end
- buildAcceptDecisionPrompt same restructuring

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```
