# 对话协议（Dialogue Protocol）— 设计文档

- 创建时间：2026-05-02
- 范围：`src/engine/tick.ts` 增量编排 + 新增 `src/engine/dialog.ts` 模块；扩展 `src/llm/prompt.ts`、`src/llm/decide.ts`；扩展 `src/domain/enums.ts` 与 `src/domain/types.ts`；调整 `src/engine/execute.ts` 中的 `speak` 副作用；调整 `src/engine/actions.ts` 中 `speak` hint；调整对话事件在 `events-pane.tsx` 的呈现
- 不在范围：旁观者实时偷听对话（仍走"事件 → 下一 tick perception"路径）；UI 上的"聊天气泡"动画细节；多人/群聊（>2 人同对话）；玩家干预对话流程

---

## 背景

当前对话机制（`src/engine/execute.ts` 的 `speak` case）是单 tick 单句：A 选 `speak(B, freeText="...")` 立即生成一条 `social` 事件并给 B 写记忆；B 要到下一 tick 才在 perception 里看到 A 说过什么，然后另起一次决策回应。这导致：

1. **对话感弱**：每 tick 只有一句话，断断续续；玩家要观察一段对话需要追看很多 tick
2. **缺乏协议性**：A 单方面"开口"，B 没有"接受/拒绝"的机会，只能事后被动看到事件
3. **拟真度差**：现实中对话是双方协议（"我可以打扰你一下吗？"→"好"），目前的设计只能模拟单向广播
4. **D3 描述的"逐轮展开"未落地**：需求文档 `docs/requirements/03-event-action-system.md` D3 节早就标注了对话该是"先生成意图，逐轮展开，可被打断"，本设计是对那个 hint 的具体化

本次重构把 `speak` 升级为"对话请求"，引入 accept/reject 协议、单 tick 内多轮展开、对话摘要、补救轮——保留 D3 的核心思想（混合方案），但把"逐轮展开"压缩到单个 tick 内完成。

---

## 总览

### 核心机制（同一 tick 内分阶段执行）

```
阶段 4：常规决策（并发，所有角色）
  ├─ A 选 speak(B, freeText="...")    ← 必带 freeText（双用：开场白+给 B 判断）
  └─ B 选 read（非 speak）

阶段 4.5：runDialogPhase（新增；委托给 dialog.ts）
  ├─ 4.5a — pairSpeakRequests
  │     A↔B 互相 speak       → mutual pair（自动配对）
  │     A→B（B 非 speak）     → pending acceptance
  │     A→B & D→B（B 非 speak）→ B 对每个独立 pending
  │     B 在 sleep/跨节点/target 不存在/freeText 缺失 → autoFails
  ├─ 4.5b — accept 决策（每对 1 次独立 LLM 调用）
  │     输入：B 的画像 + B 当前感知 + A 的 freeText（开场白可见，A 的 reasoning 不可见）
  │     输出：完整 Action 结构，type 限制 accept_speak | reject_speak
  ├─ 4.5c — 对话展开（被接受的每对，组间并行 + 组内串行）
  │     第 1 句 = 发起方 freeText（不重新生成）
  │     第 2..10 句：双方交替，每句 1 次 llmDialogTurn
  │     软上限：第 8 句起 prompt 加"该收尾"提示
  │     硬上限：第 12 句强制截断
  │     LLM 可在任意 turn 输出 leave_dialog 显式退出
  │     结束后 1 次 llmDialogSummarize 生成摘要
  ├─ 4.5d — 补救轮（被拒/autoFails 的发起方）
  │     输入黑盒（只见"被拒"或"她已经走了"）
  │     不许任何 speak（含转向第三方）
  │     违规重试 1 次，再违规 → fallback wait

阶段 5：execute（用 dialog 阶段的 finalActions 替换原 rawActions 中所有 speak 发起方的 action）
```

### 副作用约定

- **不动 affection、emotion**：拒绝/接受/对话过程都不直接改关系或情绪。原 `speak` 的 `social_satiety+1` 双方逻辑**移除**
- **写 memory**：
  - 拒绝：A 写"我邀请 B 说话被拒了"（importance=2）；B 写"我拒绝了 A 的搭话邀请"（importance=1）
  - autoFails：A 写一条情境化记忆（"想找 B 但她已经走了/在睡觉"，importance=1）
  - 接受 + 对话结束：A、B 各写"和 X 聊了：${summary}"，importance = `clamp(max(双方 selfImportance), 2, 4)`
  - 不重复写"接受决策本身"的记忆——对话摘要顶替
- **对话事件**：对话作为单一原子事件落 events_log，`category="social"`，`description=summary`，scope=node，`participants=[A, B]`，`intensity=2`；新增 `dialogTranscript` 与 `dialogEndedBy` 字段
- **旁观者感知**：dispatchPerception 已在阶段 3 跑过；对话事件在阶段 4.5 才生成 → **同节点旁观者本 tick 看不到对话**，下一 tick 通过 events_log 拉取摘要（与所有 actor 衍生事件一致，无需改感知逻辑）
- **B 在 sleep 中**：自动拒绝（不调 LLM）；nap 不豁免

### 接受方的"叠加"语义

`speak` action **只消耗发起方**的本 tick 行动槽：

- A 选 speak(B)：A 的本 tick 行动 = 对话本身（执行阶段以占位 wait 形式存在，reasoning="刚和 B 聊完"）
- B 选 read 并接受 A：B 的 read 仍照常执行（边读书边和 A 聊几句），叠加 1 组对话事件
- B 选 read 并被 A、D 同时请求且都接受：B 的 read 仍执行 + 2 组对话事件
- 唯一硬约束：B 在 sleep `currentAction` 中时自动拒绝（睡觉不可被叫醒说话）

---

## 详细设计

### §1 模块边界与文件改动

```
┌─────────────────────────────────────────────────────────────────┐
│  src/engine/tick.ts  (主循环编排，~590 行 → +30 行)                │
│  阶段 4 收 rawActions → 调 runDialogPhase → 阶段 5 执行 final     │
└──────────────────────────────────────────────┬──────────────────┘
                                               ▼
┌─────────────────────────────────────────────────────────────────┐
│  src/engine/dialog.ts  (新文件，~250 行)                            │
│   pairSpeakRequests(rawActions, characters, nodes)                 │
│   runDialogPhase({ rawActions, characters, perceptions,            │
│                    decideAccept, decideTurn,                       │
│                    decideSummary, decideSalvage })                 │
│     → { finalActions, dialogEvents, memoryWrites }                 │
└──────────────────────────────────────────────┬──────────────────┘
                                               ▼
┌─────────────────────────────────────────────────────────────────┐
│  src/llm/prompt.ts  (新增 3 个 builder)                              │
│   buildAcceptDecisionPrompt(self, requesterName, freeText, …)      │
│   buildDialogTurnPrompt(self, peer, transcript, isSoftLimit, …)    │
│   buildDialogSummaryPrompt(participants, transcript)               │
└──────────────────────────────────────────────┬──────────────────┘
                                               ▼
┌─────────────────────────────────────────────────────────────────┐
│  src/llm/decide.ts  (新增 2 个轻量调用入口)                          │
│   llmDecide(...)            ← 现有；接受/拒绝/补救都走它             │
│   llmDialogTurn(...)        ← 新；输出 { kind:"say"|"leave", line? }│
│   llmDialogSummarize(...)   ← 新；输出摘要文本                       │
└─────────────────────────────────────────────────────────────────┘
```

**模块职责红线**：

- `tick.ts`：只做世界推进编排，不知道对话内部如何展开
- `dialog.ts`：纯函数式（无 IO）；通过依赖注入接收 4 个 decide 函数；测试时全部 mock
- `prompt.ts`：所有 prompt 文本归集；测试用 snapshot 验证输出稳定性
- `decide.ts`：负责 LLM schema、调用、容错重试

**受影响的现有文件**：

- `src/domain/enums.ts` — `ACTION_TYPES` 增加 `accept_speak`、`reject_speak`、`leave_dialog`
- `src/domain/types.ts` — `WorldEvent` 增加可选 `dialogTranscript` 与 `dialogEndedBy` 字段
- `src/engine/actions.ts` — `speak` hint 改为"邀请说话（需对方接受），必须给出开场白作为 freeText"
- `src/engine/execute.ts` — 移除 `speak` case 的所有副作用（事件生成 / 记忆 / social_satiety / lastInteractionTick），改为不可达分支（speak 不应到达 execute；如到达则视为非法并 fallback wait 事件）
- `src/llm/prompt.ts` — 主 prompt 中 `speak` 描述更新为"邀请对方说话，必须给出 freeText 作为开场白；对方有可能拒绝"
- `src/app/_components/events-pane.tsx` — 对话事件卡支持折叠（仅 summary）/ 展开（完整 transcript，气泡式）

### §2 数据结构

#### 2.1 ActionType 扩展（`src/domain/enums.ts`）

```ts
export const ACTION_TYPES = [
  // 既有 24 种
  ...,
  // 新增 3 种（仅在 dialog 流程中产生；常规 getAvailableActions 不暴露）
  "accept_speak",
  "reject_speak",
  "leave_dialog",
] as const;
```

这 3 种 type 永远不出现在 `getAvailableActions(...)` 的列表里，避免主决策 LLM 误选。它们只通过 `buildAcceptDecisionPrompt` / `buildDialogTurnPrompt` 的 schema 约束产生。

#### 2.2 Action 字段（`src/domain/types.ts`）

不增字段——`speak` 的 freeText 双用（开场白+判断依据）；`accept_speak/reject_speak` 沿用 `targetId=requester.id`；`leave_dialog` 仅出现在对话 turn schema 内部，不进入顶层 Action。

#### 2.3 Dialog 模块内部类型（`src/engine/dialog.ts`）

```ts
/** 配对结果 */
export interface SpeakPairing {
  mutualPairs: Array<{ a: string; b: string; aFreeText: string; bFreeText: string }>;
  pendingAcceptances: Array<{ requester: string; target: string; freeText: string }>;
  autoFails: Array<{
    requester: string;
    target: string;
    reason: "target_left" | "target_sleeping" | "cross_node" | "invalid_request";
  }>;
}

/** 对话内单轮（不进 events_log，仅在 transcript 中传递） */
export interface DialogTurn {
  speakerId: string;
  kind: "say" | "leave";
  line?: string;          // kind=say 时必有
  reasoning?: string;     // 不进顶层记忆，仅日志/调试
}

/** 一组对话的最终结果 */
export interface DialogOutcome {
  participants: [string, string];     // [opener, responder]
  transcript: DialogTurn[];           // 完整对话（含开场白）
  summary: string;                    // LLM 生成的摘要
  endedBy: "natural" | "leave" | "hard_limit" | "turn_failure";
  endedByCharacterId?: string;        // endedBy=leave 时的离开者
}
```

#### 2.4 WorldEvent 扩展（`src/domain/types.ts`）

```ts
export interface WorldEvent {
  // ... 既有字段保持不变
  category: EventCategory;            // dialog 事件用 "social"
  description: string;                // = summary（事件卡折叠态显示）
  intensity: 1|2|3|4|5;               // dialog 事件固定 intensity=2
  scope: EventScope;                  // dialog 事件固定 "node"

  // 新增：对话事件专用（其它 event 不填）
  dialogTranscript?: DialogTurn[];    // 完整对话（UI 展开态用）
  dialogEndedBy?: DialogOutcome["endedBy"];
}
```

复用 `category="social"` 不新增 EventCategory；只用可选字段标记"这是个对话事件"。perception/记忆等既有 pipeline 不需要新分支。

#### 2.5 Memory 写入约定

| 场景 | A 写 | B 写 | importance |
|------|------|------|-----------|
| autoFails(target_left) | "想找 B 说话但她已经走了" | — | 1 |
| autoFails(target_sleeping) | "想找 B 说话但她在睡觉" | — | 1 |
| autoFails(cross_node) | "想找 B 说话但她不在这里" | — | 1 |
| autoFails(invalid_request) | "想开口又咽了回去" | — | 1 |
| 接受决策返回 reject | "我邀请 B 说话被拒了" | "我拒绝了 A 的搭话邀请" | A=2, B=1 |
| 对话自然/leave/hard_limit/turn_failure 结束 | "和 B 聊了：${summary}" | "和 A 聊了：${summary}" | clamp(max(双方 selfImportance), 2, 4) |

接受决策本身不写记忆——直接由对话摘要顶替。

#### 2.6 现有 speak 副作用清理

`execute.ts` 的 `speak` case 中现存的：

- `actor.emotion.social_satiety += 1` / `target.emotion.social_satiety += 1`
- `target.relations[actor.id].lastInteractionTick = tick`（双向）
- 给 target 写"X 对我说……"的 memory
- 生成 `category="social"` 的事件

**全部移除**。新流程下 `speak` 只是"请求"，不直接落地任何事件/记忆/副作用。`speak` case 改为：

```ts
case "speak": {
  // speak 不应到达 execute（dialog 阶段已替换为占位 wait）
  // 防御性 fallback：作为非法 action 处理
  success = false;
  reason = "speak action 未被 dialog 阶段处理";
  break;
}
```

`relations 自动管理` 的 `manageRelations` 逻辑保留——对话事件 `category="social"` 仍会触发 ensureAcquaintance（相当于"通过对话认识"）。

### §3 数据流

#### 3.1 tick.ts 主循环改造（增量）

```
原 tick.ts 阶段：
  1. vitals decay
  2. emotion evolution
  3. perception
  4. 角色并发决策（每个角色 1 次 llmDecide）
  5. execute（用 actions 改世界）
  6. relations 自动管理
  7. 持久化

新 tick.ts 阶段：
  1. vitals decay              (不变)
  2. emotion evolution         (不变)
  3. perception                (不变)
  4. 角色并发决策              (不变；speak 仍是输出之一)
  ──────────────────── 新增 ────────────────────
  4.5. const dialogResult = await runDialogPhase({
         rawActions,
         characters,
         nodes,
         perceptions,
         decideAccept: (input) => llmDecide({ ...input, schema: AcceptSchema }),
         decideTurn: llmDialogTurn,
         decideSummary: llmDialogSummarize,
         decideSalvage: (input) => llmDecide({ ...input, schema: SalvageSchema }),
       });
  // dialogResult.finalActions 替换 rawActions 中所有 speak 发起方与被拒方的 action
  // dialogResult.dialogEvents 直接合并到 allEvents
  // dialogResult.memoryWrites 直接 push 到对应 character.shortMemory
  ─────────────────────────────────────────────
  5. execute(finalActions)     (不变；speak 已被替换/剥离)
  6. relations auto management (不变；对话事件仍触发 ensureAcquaintance)
  7. 持久化                    (不变)
```

#### 3.2 runDialogPhase 内部时序

```
                    rawActions
                        │
            ┌───────────▼───────────┐
            │  pairSpeakRequests()  │  纯计算，无 LLM
            └───────────┬───────────┘
                        │
        ┌───────────────┼───────────────┬───────────────┐
        ▼               ▼               ▼               ▼
   mutualPairs   pendingAccept[]    autoFails[]     non-speak actions
        │               │               │               │
        │               ▼               │               │
        │     await Promise.all(        │               │
        │       pendingAccept.map(      │               │
        │         decideAccept))        │               │
        │               │               │               │
        │       split: accepted|reject  │               │
        │               │               │               │
        ├───────accepted┤               │               │
        ▼               ▼               ▼               │
   ┌─────────────────────────┐    ┌────────────┐        │
   │  对话组列表 dialogGroups │    │ 失败列表    │        │
   │  (每组 [opener, resp.]) │    │ (req 写记忆) │        │
   └────────────┬────────────┘    └──────┬─────┘        │
                │                         │              │
                ▼                         ▼              │
   await Promise.all(                  收集需补救的       │
     dialogGroups.map(runOneDialog))   requesterIds      │
                │                         │              │
                ▼                         ▼              │
        DialogOutcome[]            await Promise.all(    │
                                     salvageList.map(   │
                                       decideSalvage))   │
                │                         │              │
                ▼                         ▼              │
        生成对话事件 +               补救 actions         │
        双方 memory                                       │
                │                         │              │
                └─────────────┬───────────┘──────────────┘
                              ▼
              return { finalActions, dialogEvents, memoryWrites }
```

**并发模型**：

- `rejected → salvage` 与 `accepted → dialog` 这两条分支**并行**执行（互不依赖）
- `dialog 组间并行`（`Promise.all(dialogGroups.map(runOneDialog))`），组内 turn 串行
- `autoFails` 不调 LLM——直接生成情境化记忆 + 让 A 进入补救轮
- `pendingAcceptances` 全部并行 decideAccept

#### 3.3 配对算法 pairSpeakRequests

```ts
function pairSpeakRequests(rawActions, characters): SpeakPairing {
  const speakActions = rawActions.filter(a => a.type === "speak");
  const charById = new Map(characters.map(c => [c.id, c]));

  const mutualPairs = [];
  const pendingAcceptances = [];
  const autoFails = [];
  const consumed = new Set<string>();   // 已配成 mutual 的 actorId

  // 1. 识别 mutual pairs（A↔B）
  for (const a of speakActions) {
    if (consumed.has(a.actorId)) continue;
    if (!a.targetId) continue;
    const peer = speakActions.find(b =>
      b.actorId === a.targetId && b.targetId === a.actorId
    );
    if (peer && !consumed.has(peer.actorId)) {
      // 同节点检查（mutual 也要同节点；否则降级为单向 autoFail）
      const aChar = charById.get(a.actorId)!;
      const bChar = charById.get(peer.actorId)!;
      if (aChar.locationId === bChar.locationId) {
        mutualPairs.push({
          a: a.actorId, b: peer.actorId,
          aFreeText: a.freeText ?? "",
          bFreeText: peer.freeText ?? "",
        });
        consumed.add(a.actorId);
        consumed.add(peer.actorId);
      }
    }
  }

  // 2. 非 mutual 的 speak → 检查 autoFails 条件，否则进入 pending
  for (const a of speakActions) {
    if (consumed.has(a.actorId)) continue;
    const target = a.targetId ? charById.get(a.targetId) : null;
    const actor = charById.get(a.actorId)!;

    if (!target || target.id === actor.id) {
      autoFails.push({ requester: a.actorId, target: a.targetId ?? "", reason: "invalid_request" });
      continue;
    }
    if (!a.freeText || a.freeText.trim() === "") {
      autoFails.push({ requester: a.actorId, target: target.id, reason: "invalid_request" });
      continue;
    }
    if (target.locationId !== actor.locationId) {
      autoFails.push({ requester: a.actorId, target: target.id, reason: "cross_node" });
      continue;
    }
    if (target.currentAction?.type === "sleep") {
      autoFails.push({ requester: a.actorId, target: target.id, reason: "target_sleeping" });
      continue;
    }
    pendingAcceptances.push({
      requester: a.actorId,
      target: target.id,
      freeText: a.freeText,
    });
  }

  return { mutualPairs, pendingAcceptances, autoFails };
}
```

**位置漂移说明**：阶段 4 的 free-move 链让角色的 `locationId` 可能在 tick 内多次变化。dialog 阶段配对时使用**阶段 4 收尾的快照位置**（即 tick.ts 中各角色 `c.locationId` 在 `Promise.allSettled` 之后的值）。这样"A speak(B) 但 B 自由移动到别处"会被正确识别为 cross_node。

#### 3.4 单组对话展开 runOneDialog

```ts
async function runOneDialog(group: { opener: string, responder: string, openingLine: string },
                            ctx, decideTurn, decideSummary): Promise<DialogOutcome> {
  const transcript: DialogTurn[] = [
    { speakerId: group.opener, kind: "say", line: group.openingLine },
  ];

  const HARD_LIMIT = 12;
  const SOFT_LIMIT = 8;

  while (transcript.length < HARD_LIMIT) {
    const lastSpeaker = transcript[transcript.length - 1].speakerId;
    const nextSpeaker = lastSpeaker === group.opener ? group.responder : group.opener;
    const isSoftLimit = transcript.length >= SOFT_LIMIT;

    let turn: DialogTurn;
    try {
      turn = await retryOnce(() => decideTurn({
        self: charById.get(nextSpeaker),
        peer: charById.get(lastSpeaker),
        transcript,
        isSoftLimit,
      }));
    } catch {
      // 两次都失败
      const outcome = await summarizeOrFallback(group, transcript, "turn_failure", decideSummary);
      return outcome;
    }

    if (turn.kind === "leave" || (turn.kind === "say" && (!turn.line || !turn.line.trim()))) {
      // leave 或空 say 退化
      transcript.push({ speakerId: nextSpeaker, kind: "leave" });
      const outcome = await summarizeOrFallback(group, transcript, "leave", decideSummary, nextSpeaker);
      return outcome;
    }
    transcript.push(turn);
  }

  // 自然达到 5 来回（10 句）后第 11 句仍 say → 进入 11/12，硬截断
  return summarizeOrFallback(group, transcript,
    transcript.length >= HARD_LIMIT ? "hard_limit" : "natural", decideSummary);
}
```

**轮次 / 上限语义**：

- transcript 数组的索引 0 是开场白；以**已落 transcript 长度** 作为 turnIndex
- 第 8 句起 `isSoftLimit=true`（8 = SOFT_LIMIT），prompt 里加"对话已 N 句，请考虑收尾"提示
- 第 12 句硬截断（HARD_LIMIT）；正常 5 来回 = 10 句应在软提示影响下自然结束
- LLM 任意 turn 可输出 `kind="leave"` 显式退出
- 空 `say`（line 为空字符串/null）按 leave 退化

**mutual pair 处理**：

- pairSpeakRequests 把 mutual pair 收集到 `mutualPairs`
- runDialogPhase 对每个 mutualPair 随机选一方作为 opener（`Math.random() < 0.5 ? a : b`），其 freeText 作为开场白
- 另一方的 freeText 作为内心动机被丢弃（对方已先开口，自然进入回应）
- 之后流程与 pendingAcceptances 接受路径完全一致（无 accept 决策步骤）

#### 3.5 finalActions 构造

`runDialogPhase` 返回的 `finalActions` 长度 = `characters.length`（不变量）：

- **非 speak 角色**：rawActions 中原 action 不变
- **speak 发起方且对话成功**（mutualPairs 双方 + accepted 的 requester）：替换为占位 wait（reasoning="刚和 X 聊完"，selfImportance=2）
- **speak 发起方但被拒**：替换为补救轮 LLM 输出的非对话 action
- **speak 发起方但 autoFails**：替换为补救轮 LLM 输出的非对话 action
- **接受方**（target）：rawActions 中的原非 speak action 不变（read 仍是 read）

memoryWrites 归集：每条按 `{ characterId, memory }` 记入，runDialogPhase 返回后由 tick.ts 直接 push 到对应 character.shortMemory（执行 SHORT_MEMORY_LIMIT 的 FIFO 截断逻辑）。

dialogEvents 归集：每组对话 1 条 WorldEvent，category="social"，description=summary，intensity=2，scope="node"，nodeId=opener.locationId，participants=[opener.id, responder.id]，dialogTranscript=完整 transcript，dialogEndedBy=outcome.endedBy。

### §4 错误处理

#### 4.1 LLM 调用失败矩阵

| 调用 | 失败兜底 | 写入 |
|------|---------|------|
| 主决策 `llmDecide`（既有） | fallback `wait`，reasoning="LLM 调用失败：…" | `lastThought` 走原路径 |
| 接受决策 `decideAccept` | 重试 1 次 → 仍失败按"拒绝" | reject memory（双方）+ A 进入补救轮 |
| 对话单轮 `decideTurn` | 重试 1 次 → 仍失败 → 对话结束 endedBy="turn_failure" | 截断的 transcript 仍生成摘要 |
| 摘要 `decideSummary` | 重试 1 次 → 仍失败 → summary="（摘要生成失败：双方聊了 N 句）" | 仍写记忆但内容是这条占位摘要 |
| 补救轮 `decideSalvage` | 重试 1 次 → 仍违规（输出 speak）→ fallback `wait` | reasoning="补救决策违规，回退等待" |

#### 4.2 校验与非法输入

| 校验项 | 处理 |
|-------|------|
| `speak` 没带 `freeText`（或仅空白） | autoFails reason="invalid_request"；A 写"想开口又咽了回去" |
| `speak.targetId === actorId`（自言自语） | 同上 |
| `speak.targetId` 不在 characters 列表 | 同上（target_left 与此合并视情况） |
| 接受决策 LLM 输出非 `accept_speak`/`reject_speak` | 视为拒绝（保守） |
| 对话 turn LLM 输出 `kind="say"` 但 `line` 为空 | 视为 `kind="leave"` |
| 对话 turn LLM 第 1 句就 leave（即 B 的第 1 句） | 允许；transcript 长度=2，仍生成摘要 |
| 补救轮 LLM 输出 `speak` | 重试 1 次；仍 speak → wait |
| 补救轮 LLM 输出 `accept_speak`/`reject_speak`/`leave_dialog` | 视为违规（这 3 种不应在主决策出现）→ 同上重试 |

#### 4.3 并发位置漂移

阶段 4 的 free-move 链让角色 `locationId` 可能 tick 内多次变化。dialog 阶段使用**阶段 4 结束时的位置快照**判断同节点：

- A speak(B)，B 自由移动到别处 → autoFails(cross_node)
- A speak(B)，A 自由移动后到了 B 的节点 → 同节点 → pendingAcceptances
- 双方都自由移动到同一个新节点 → 仍同节点 → 正常配对

#### 4.4 不变量

- `finalActions.length === characters.length`
- 角色 short memory 任何场景至少各写 1 条相关记忆（autoFails / 拒绝 / 接受 路径都覆盖）
- 对话事件即使 endedBy="turn_failure" 也仍落 events_log（带占位摘要），不能"对话静默消失"
- speak action 永远不到达 execute（被 dialog 阶段替换；execute 的 speak case 仅作防御性 fallback）

### §5 测试策略

#### 5.1 dialog.ts 单元测试（新增 `src/engine/dialog.test.ts`）

**`pairSpeakRequests` 纯函数测试**（无 LLM mock）：

| 用例 | 输入 | 期望 |
|------|------|------|
| mutual pair | A→B + B→A，同节点 | mutualPairs=1，pending=0，autoFails=0 |
| mutual pair 跨节点 | A→B + B→A，A.loc=N1, B.loc=N2 | mutualPairs=0；2 条 autoFails(cross_node) |
| 单向 speak | A→B（B 选 read），同节点 | pending=[{A,B,…}] |
| 多人请求同 target | A→B + D→B（B 选 read） | pending=2 |
| 错位三角 | A→B + B→C，三人同节点 | mutualPairs=0；pending 含 (A,B) 和 (B,C) |
| 跨节点 | A.loc=N1, B.loc=N2，A→B | autoFails reason="cross_node" |
| target 在 sleep | B.currentAction.type=sleep | autoFails reason="target_sleeping" |
| target 在 nap（不豁免） | B.currentAction.type=nap | pending 中（不是 autoFail） |
| target 不存在 | A→ghost | autoFails reason="invalid_request" |
| target=self | A→A | autoFails reason="invalid_request" |
| freeText 缺失/空白 | A→B 但 freeText="" 或 "   " | autoFails reason="invalid_request" |

**`runOneDialog` 测试**（注入 mock decideTurn / decideSummary）：

| 用例 | mock 行为 | 期望 |
|------|----------|------|
| 自然 5 来回 | turn 1..9 都返回 say | endedBy="natural"（或 hard_limit 前），transcript.length=10 |
| 第 N 轮 leave | turn 3 返回 leave | endedBy="leave"，endedByCharacterId=该轮 speaker |
| 软提示触发 | 看 prompt 调用记录 | 第 8、9、… 句 prompt 含 isSoftLimit=true |
| 硬截断 | turn 全部 say 直到 12 句 | endedBy="hard_limit"，transcript.length=12 |
| turn 失败重试 | turn 5 第 1 次抛错、第 2 次成功 | endedBy="natural" |
| turn 失败 2 次 | turn 5 两次都抛错 | endedBy="turn_failure"，transcript 截到 4 句 |
| 摘要失败 | summary 抛错两次 | summary="（摘要生成失败：…）" |
| 空 say 退化 leave | turn 3 返回 {kind:"say", line:""} | endedBy="leave" |

**`runDialogPhase` 集成测试**（mock 4 个 decide）：

| 用例 | 期望 |
|------|------|
| 1 mutual + 1 单向被接 | finalActions 4 个 wait 占位 + 其它非对话；2 条对话事件；4 条对话摘要记忆 |
| 单向被拒 | A.finalAction = 补救 LLM 输出（非 speak）；0 对话事件；双方各 1 条 reject 记忆 |
| 单向被拒 + 补救违规 | A.finalAction = wait（fallback）；reasoning 含"违规" |
| autoFails(target_sleeping) | A 走补救轮；A 写"B 在睡觉"记忆 |
| 多组对话 | events 数 = 接受组数 |
| 接受决策 LLM 输出非法 type | 视为拒绝，走 reject 路径 |

#### 5.2 prompt builder 测试（增量 `src/llm/prompt.test.ts`）

每个新 builder 1 个 snapshot 测试：

- `buildAcceptDecisionPrompt`：B（角色画像 + 当前感知）+ A（仅 freeText，无 reasoning）→ 输出含"X 想和你说话："+ freeText
- `buildDialogTurnPrompt`：transcript=3 句，isSoftLimit=true → 输出含软提示文案；isSoftLimit=false 时不含
- `buildDialogSummaryPrompt`：双方画像 + 完整 transcript → 输出含"请用 1-2 句话总结这次对话"

主决策 prompt 关于 `speak` 的描述变化：补 1 个 snapshot 验证新文案。

#### 5.3 tick.ts 集成测试增量（`src/engine/tick.test.ts`）

新增端到端用例（mock LLM 返回固定 action）：

- **对话路径**：A 输出 speak(B)、B 输出 read、accept 返回 accept、turn 返回 5 来回、summary 返回固定串 → events_log 含 1 条对话事件；A/B 短记忆各 +1（"和 X 聊了：…"）；B 的 read 仍执行；A 的 finalAction = wait 占位
- **拒绝路径**：B 输出 reject、salvage 返回 observe → A 的 events_log 中是 observe；A/B 短记忆各 +1（reject）
- **autoFail 跨节点路径**：A.loc=N1, B.loc=N2，A speak(B) → A 直接补救轮 + 写"已经走了"记忆
- **mutual 路径**：A speak(B) + B speak(A) → 1 条对话事件，双方各 wait 占位

#### 5.4 既有测试的回归更新

- `src/llm/decide.test.ts`：现存 `speak` 测试更新——`speak` 不再直接产生 social 事件
- `src/engine/tick.test.ts`：现存对 `speak` 落地的断言改为"speak 进入 dialog 流程，最终落 wait 占位"
- `src/engine/execute.ts` 的 `speak` 测试（如有）：删除或改为"speak 不应到达 execute"的反向断言

#### 5.5 不需要测试的范围

- LLM 调用本身的网络/重试基础设施已在现有 `decide.ts` / providers 层覆盖
- UI 层的对话事件展开/折叠交互细节（由 spec 引出，但本 spec 不细化 UI 测试）

---

## 成本估算

每组成功对话（5 来回）的 LLM 调用次数：

- 单向 + accept：1（accept）+ 9（turns，第 1 句已是 freeText）+ 1（summary）= **11 次**
- mutual：0 + 9 + 1 = **10 次**
- 拒绝路径：1（accept）+ 1（salvage）= **2 次**
- autoFails：0 + 1（salvage）= **1 次**

成本相对当前单 tick 单句 `speak`（1 次/对）的方案大幅上升。tick 中如果有 N 组并行成功对话，新增 ~10N 次 LLM 调用。设计假设：

- 早期玩法 ≤ 5 NPC，同 tick 同时有 ≥2 组对话的概率较低（多数 tick 有 0~1 组）
- 长 tick 时长（10 句对话需 ~10×LLM 单调用时长）由组间并行缓解
- 后续可加节流：同一 tick 内对话组数硬上限 / 软上限（以避免过载）；本 spec 暂不引入

---

## 开放问题（不阻塞实现，留待后续）

1. **旁观者实时偷听**：当前同节点旁观者只能在下一 tick 通过 events_log perception 看到对话摘要。未来若要支持"旁观者在对话进行中实时被影响"（如听到敏感内容立刻反应），需要引入 turn-level 感知钩子，超出本 spec
2. **对话节流**：未来 NPC 数 ≥ 10 时，每 tick 同时 5+ 组对话会显著拖慢 tick 时长。可能的策略：组数硬上限（超过则后到的 speak 自动 autoFails）/ 摘要更激进（更短轮数限制）/ 后台异步执行
3. **玩家干预对话**：玩家"投放事件"机制能否在对话中途触发（如"老师走进教室"）。当前 tick 内事件已经全部在阶段 3 分发；本 spec 不处理对话进行中的事件注入
4. **对话引发的衍生事件**：对话内提到的关键信息（如"我看见 X 偷东西"）是否自动衍生新事件给其他 NPC。目前仅靠摘要落 events_log，旁观者只能下一 tick 通过文本感知；未来可由 LLM 在 summary 阶段额外输出"建议衍生事件"
5. **多人对话（>2）**：当前模型仅支持 1v1；3+ 人围坐聊天的需求由 D3 提到但本 spec 不覆盖
