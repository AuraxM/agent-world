# 对话 Prompt 重构：角色认知与缓存优化

**日期：2026-05-06**
**范围：`buildDialogTurnPrompt` + `buildAcceptDecisionPrompt`（行为决策 prompt 不动）**

## 变更概述

四项优化，目标：提升角色身份认知、利用前缀缓存减少 LLM token 传输。

## 最终结构

### User Prompt

```
[缓存头部 — 跨轮次完全一致]

你是一个角色扮演引擎中的NPC。你正在和另一个人对话。
当前游戏时间：第 N 日 HH:MM（时段）。
请根据你的性格、当前情境和对话历史，自然地回应。
不要重复对方刚说过的话。
{语言指令}

如果你们在这次对话中达成了约定，请记得调用 add_notebook_entry 记录到你的记事本中。

你可以在此对话中发起的行为：
- action_type_1
- action_type_2

现在轮到你说话。调用 submit_dialog_turn：kind="say" 并填写 line。如果想结束对话，请调用 end_conversation。

关于你自己：
- 姓名：{name}
- 年龄：{age} 岁
- 性别：{gender}
- 职业：{profession}
- 健康状况：{sick / 健康}
- 性格：{MBTI}，{intelligence}
- 生平简介：{biography}

关于 {peer.name}：
- 年龄：{age} 岁
- 性别：{gender}
- 职业：{profession}
- 形象：{appearance}
- 关系：{relation}
- 印象：{impression}

当前地点：{here.name}

[缓存尾部 — 每轮变化]
对话记录：
你: xxx
{peer.name}: xxx
```

### System Prompt

**不动。** 维持 `decide.ts` 中现有内联构造。

## 具体变更

### 1. 对话记录：自己名字 → "你"

**文件：** `src/llm/prompt.ts` — `buildDialogTurnPrompt()`

```diff
- const name = t.speakerId === self.id ? self.name : peer.name;
+ const name = t.speakerId === self.id ? "你" : peer.name;
```

### 2. `buildSelfImage()` 重构

**文件：** `src/llm/prompt.ts` line 771-785

- **移除：** 形象行（`buildImage()` 结果）
- **变更：** 健康状况从 `HEALTH_LABELS[health]`（体弱/健康/非常健康）改为 `sickness ? "你生病了" : "健康"`
- **新增：** 性格行（`describePersonalityCompact` 内容）
- **新增：** 生平简介行（`character.biography`）
- **不移除：** 当前地点行后续由调用方在 "关于对方" 后追加

### 3. `describePersonalityCompact` 不再独立输出

原在 dialog prompt 中作为独立行 `性格：ENFJ，...`，现合并进 `buildSelfImage()` 的"关于你自己"块中。

### 4. 段落重排

`buildDialogTurnPrompt()` 和 `buildAcceptDecisionPrompt()`：

```
旧：  开幕 → 关于自己 → 关于对方 → 性格 → 对话记录 → 指令
新：  指令 → 关于自己 → 关于对方 → 当前地点 → 对话记录
```

### 5. 健康描述简化

不修改 `Character.health` / `Character.sickness` 属性，只改 prompt 渲染：

```diff
- `- 健康状况：${HEALTH_LABELS[c.health] ?? HEALTH_LABELS[2]}`
+ `- 健康状况：${c.sickness ? "你生病了" : "健康"}`
```

### 6. `buildAcceptDecisionPrompt` 同步重构

- 段落顺序与 dialog turn 一致
- 状态行（疲惫/饥饿/心情/压力/社交）放在"关于你自己"之后、"关于对方"之前

## 不变

- `buildPeerImage()` 保留形象（对方形象对认知有用）
- `buildCharacterStaticBlock()` 不动（行为决策 prompt 暂不改）
- 行为决策 user prompt 不动
- System prompt 构造不动

## 涉及文件

| 文件 | 变更 |
|------|------|
| `src/llm/prompt.ts` | `buildSelfImage()` 重构、`buildDialogTurnPrompt()` 重排、`buildAcceptDecisionPrompt()` 重排、对话记录名称替换 |
| `src/llm/decide.ts` | 可能需要调整 inline system prompt（如时间已移到 user prompt 头部则移除重复） |
| `src/llm/prompt.test.ts` | 更新相关测试用例 |
