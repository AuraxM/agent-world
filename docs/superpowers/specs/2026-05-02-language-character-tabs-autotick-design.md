# 多语言切换 / 角色入场 Tab / 24-tick 自动推进 — 设计文档

- 创建时间：2026-05-02
- 范围：3 个独立但相邻的小功能；共用一份 spec & 一份 plan，按顺序实现
- 不在范围：地图入口选择 UI、角色移除入口、auto-tick 数量自定义（v1 写死 24）

---

## 背景

agent-world 当前：

- LLM prompt 在 `src/llm/prompt.ts` 中硬编码"输出语言必须使用简体中文"
- 角色栏 `src/app/_components/character-rail.tsx` 把世界中**所有**角色平铺成一个列表；configs/characters 下的模板若没在 `seed.ts` 的 CAST 中，则永远不会出现
- 顶栏 `src/app/_components/top-bar.tsx` 只有"推进 1 小时"按钮；要观察一整天必须手点 24 次

3 个增量功能由同一个 admin/导演用户提出，都属于"在不动核心模拟逻辑的前提下提升观察与控制力"。

---

## Feature 1：admin 动态切换游戏世界语言

### 目标

让 admin 在 UI 上选择 LLM 输出语言（zh/en/ja），切换后**新生成**的 reasoning / free_text / emotion_tag 使用所选语言；已生成的历史记忆保留原文，不回填。

### 设计

#### 数据层

`src/engine/settings.ts` 扩展全局 settings：

```ts
type Language = 'zh' | 'en' | 'ja';

declare global {
  var __agent_world_settings__:
    | { thinkingEnabled: boolean; language: Language }
    | undefined;
}

// 默认 language: 'zh'
export function getLanguage(): Language { ... }
export function setLanguage(lang: Language): void { ... }
```

#### API 层

`src/app/api/admin/settings/route.ts` GET 与 POST 同步增加 `language` 字段：

- GET 返回 `{ thinkingEnabled, language }`
- POST 接受可选 `language: 'zh' | 'en' | 'ja'`；非法值返回 400

#### Prompt 层

`src/llm/prompt.ts` 当前在 `WORLD_RULES` 末尾和 `buildUserPrompt` 末尾两处都写了"必须使用简体中文"。改造：

1. 抽取函数 `languageInstruction(lang: Language): string`：
   - `zh` → 现有简体中文段（保留地名/人名可用原文等细节）
   - `en` → "Your `reasoning`, `free_text`, and `emotion_tag` MUST be written in English. Place names and personal names may stay in their original language."
   - `ja` → "あなたの `reasoning` / `free_text` / `emotion_tag` は必ず日本語で書いてください。地名・人名は原語のままで構いません。"
2. `buildSystemPrompt` 与 `buildUserPrompt` 接收新参数 `language: Language`，在原"输出语言"位置调用 `languageInstruction(language)` 替换。
3. `buildUserPrompt` 末尾的"务必在 reasoning 中显式引用一项你的性格特征的文字描述。所有输出..."一行也按语言改写。
4. **跨语言记忆提示**：当 `language !== 'zh'` 时，在 user prompt 里追加一行："Note: your earlier short/long memories may be written in a different language. Continue in <X> regardless." / 日语对应翻译。原因：历史 shortMemory 大概率是中文，避免 LLM 被旧记忆带偏。

#### 调用链

`tick.ts` / `addCharacter` 决策路径里调用 `buildSystemPrompt` / `buildUserPrompt` 的地方，注入 `getLanguage()`。最简：在 `decide.ts` 里读取一次。

#### UI

`src/app/admin/page.tsx` 顶栏 `AdminContent` 在 "LLM Thinking" toggle **左侧**加一个 `<select>`：

```
[语言: 简体中文 ▾]   LLM Thinking ON/OFF
```

3 个 option：`简体中文 / English / 日本語`。`onChange` 立即 POST `/api/admin/settings` 并更新本地 state。

### 不做

- 不翻译 system prompt 中的世界规则与性格描述（这些是给 LLM 的"资料"，输出语言由末尾强制行决定）
- 不回写历史记忆/事件
- 不做按世界独立的 language（用全局一个就够）

---

## Feature 2：角色栏分 Tab + 投放即决策

### 目标

把角色栏分两个 tab：「在场」（已在世界中的角色）和「未入场」（configs/characters 下未被加入此世界的模板）。点击未入场角色 → 自动落到地图入口节点 → 立刻跑一次该角色的 LLM 决策，prompt 里要求 TA 编造"为什么来到这里"的来由。

### 设计

#### 后端

##### 新接口：`POST /api/worlds/[id]/characters/place`（SSE）

Body: `{ characterId: string }`（v1 不允许指定 entryNodeId，默认用世界首个 entry）

行为：

1. 调 `addCharacterToWorld({ worldId, characterId })`（已有逻辑：写 character 行 + 写抵达事件 `{name} 出现在了入口处。`）
2. SSE `event: placed`，data `{ characterId, entryNodeId }`
3. 立即对该角色单独跑一次 `decide`：
   - 走 `tick.ts` 中 per-character 的同样路径（perception → facts → buildPrompts → decide → executeAction），但**只跑这一个角色**
   - prompt 在 `buildUserPrompt` 中通过新参数 `arrivalIntro: true` 在末尾追加一段（zh/en/ja 三语对应）："你是刚抵达此地的访客或新住客。请在 reasoning 中编造一段简短的"我为何来到这里"的理由（1–2 句），与你的性格相符。"
4. SSE `event: decision`，data 同 `tick` 的 decision payload
5. SSE `event: done`，data `{ characterId, tick }`
6. 错误：`event: error`，HTTP 200 但 data 含 status

错误返回（在 SSE 启动前/启动失败时直接 4xx/5xx JSON）：
- 400：JSON 非法 / characterId 缺失 / 角色已在世界中
- 404：world / character template / entry node 不存在

##### 引擎复用

抽出 `decideForCharacter(worldId, characterId, opts: { arrivalIntro?: boolean })` 函数到 `src/engine/decideForCharacter.ts`（或放进 `tick.ts` 同模块），供 `place` 路由复用。该函数内部不推进 `currentTick`，只对单个角色跑一遍 perception+decide+execute（execute 会写事件、更新角色状态等）。

`tick.ts` 主流程**不变**。新增 char 的抵达事件已在 events 表，下个常规 tick 时其他角色感知到 → 自然反应。

##### `prompt.ts` 改造

`buildUserPrompt` 增加可选参数 `arrivalIntro?: boolean`；为 true 时在"请调用 submit_action 工具…"行**之前**插入新的指令段（zh/en/ja 三语都要有对应文案）。

##### `addCharacterToWorld` 调整

不必改逻辑，但若 `addCharacterToWorld` 返回值缺失 `entryNodeId` 则补上（已经返回了）。

#### 前端

##### `character-rail.tsx`

新增内部 state `tab: 'in' | 'out'`。

「在场」tab 即当前列表（不变）。

「未入场」tab：
- 数据源：`/api/configs/characters` 的全量减去 snapshot 中已有的 `id`
- 简化卡片：emoji/avatar + name + 一个 "投放到入口 ▶" 按钮
- 点击按钮 → fetch `POST /api/worlds/:id/characters/place`，按 SSE 流读 `placed` / `decision` / `done`
- 投放期间该卡片显示 loading，禁用其它"投放"按钮

##### `dashboard.tsx` / `useWorldState`

`useWorldState` 增加方法 `placeCharacter(characterId): Promise<void>`，逻辑同 `advance()` 的 SSE 解析（可抽公共函数 `consumeTickStream`）；完成后 `await refresh()`。

`character-rail` 通过 props 调用，不再单独管 SSE。

也可以把 `/api/configs/characters` 的拉取放进 `useWorldState`，避免组件级二次请求。

##### Tab 容器

为保留现有"角色档案"区块的滚动行为，把 tab 切换条放进 `PixelFrame` 的 title 区，列表本体仍用现有滚动结构。

### 不做（YAGNI）

- v1 不支持选择入场节点（强制默认 entry）
- 不支持把已入场角色"撤出"
- 不支持批量投放
- 不引入"自我介绍"独立 prompt 类型；用同一个 user prompt + `arrivalIntro` 标志位

---

## Feature 3：自动推 24 tick + 停止

### 目标

顶栏增加"自动 24h"按钮，点击后串行推进 24 个 tick；期间可点"停止"按钮，等当前正在跑的 tick 完成后立即终止。

### 设计

#### `useWorldState`

新增 state：

```ts
autoMode: {
  running: boolean;
  total: number;       // 24
  done: number;        // 已完成的 tick 数
} | null;
```

新增 ref `shouldStopRef = useRef(false)`。

新增方法：

- `startAuto(n: number = 24): Promise<void>`
  - 若已 `loading` 或 `autoMode?.running`，no-op
  - 设 `autoMode = { running: true, total: n, done: 0 }`
  - `for (let i = 0; i < n; i++)`：
    - 检查 `shouldStopRef.current`，true 则 break
    - `const ok = await advance()`（复用现有 SSE 跑完 1 tick + refresh 的流程）
    - 若 `!ok` 则 break（advance 错误时 setError 已发生，不需要重复处理）
    - `setAutoMode(prev => prev && { ...prev, done: prev.done + 1 })`
  - 清理：`shouldStopRef.current = false; setAutoMode(null)`

> 配套改造：现有 `advance()` 把内部 catch 的错误吞掉、仅 setError。需要改成额外**返回 `Promise<boolean>`**（成功 true / 异常或 abort false），这样 startAuto 才能正确终止循环。原有调用方（顶栏直接点 advance）忽略返回值即可，无破坏性。
- `stopAuto(): void`
  - `shouldStopRef.current = true`
  - 不动 `autoMode.running`，等 startAuto 的 finally 块清

#### `top-bar.tsx`

按钮组（从左到右）：
- "推进 1 小时 ▶"：`disabled = loading || autoMode?.running`
- 新增 "自动 24h ⏵⏵"：`disabled = loading || autoMode?.running`，`onClick = startAuto`
- 自动模式中两个按钮位置切换为单个 "停止 ⏹ ({done}/{total})"，`onClick = stopAuto`，停止已按下后变 "停止中…" 直到 autoMode 清空

进度条：自动模式时把 `tickProgress` 区域临时替换为 `{autoMode.done}/{autoMode.total} tick · 当前 tick 进度: {tickProgress.done}/{tickProgress.total}`，让用户同时看到"24 个里跑完几个 + 当前这个 tick 跑完几个角色"。

#### `character-rail.tsx`

自动模式中"投放"按钮也禁用（防止 tick 过程中并发改世界状态）。通过 `useWorldState` 暴露的 `autoMode` 判断。

### 不做

- 不持久化 autoMode（刷新页面就丢，简单）
- 不开放"自动 N tick"自由数字（v1 只有 24）
- 不支持自动模式中暂停后续推（只有"停"，没有"继续"；停了再点"自动 24h"重新跑 24 个）
- 不做后端 batch tick endpoint（前端循环已够用）

---

## 实现顺序（影响 plan 拆分）

1. **Feature 1（语言）** 最独立，触面小（settings + prompt + admin select），先做
2. **Feature 3（24-tick）** 纯前端 + UX，不依赖后端改动，独立做
3. **Feature 2（投放 + decide）** 最重，改后端 + prompt + UI，最后做

---

## 测试要点

### Feature 1
- `getLanguage` / `setLanguage` 单测
- POST /api/admin/settings 接受/拒绝合法/非法 language
- `prompt.test.ts` 增加：3 种 language 的 system + user prompt 都包含正确的"输出语言"指令；非 zh 时含跨语言记忆提示行；arrivalIntro=true 时含来由段
- 手测：admin 切换后下一次 advance，事件流的 reasoning/free_text 是否切语言

### Feature 2
- 新接口 happy path：add → place 事件 → decision 事件 → done
- 错误路径：角色已在世界中（400）；characterId 不存在（404）
- prompt.test.ts：arrivalIntro=true 在末尾正确插入来由段
- 手测：「未入场」tab 显示正确数量；点击投放后角色出现在地图入口、事件流出现"出现在了入口处" + 该角色第一句 reasoning

### Feature 3
- 手测：点击 "自动 24h" → 看到进度从 0/24 走到 24/24，期间 tick、地图、角色实时更新
- 手测：途中点 "停止" → 当前 tick 完成后停在 e.g. 7/24，按钮回归常规
- 手测：自动模式中 "推进 1 小时" 与 "投放" 按钮 disabled

---

## 文件影响清单

新增：
- `src/engine/decideForCharacter.ts`（或放进 tick.ts 同文件）
- `src/app/api/worlds/[id]/characters/place/route.ts`

修改：
- `src/engine/settings.ts`：加 language
- `src/app/api/admin/settings/route.ts`：GET/POST 加 language
- `src/llm/prompt.ts`：抽 `languageInstruction`、`buildSystemPrompt` / `buildUserPrompt` 加 language 与 arrivalIntro 参数
- `src/llm/decide.ts`：注入 language（从 settings 读）
- `src/llm/prompt.test.ts`：补语言 + arrivalIntro 用例
- `src/app/admin/page.tsx`：admin 顶栏加语言 select
- `src/app/_components/character-rail.tsx`：tab 化 + 未入场列表 + 投放按钮
- `src/app/_components/top-bar.tsx`：自动 24h 按钮 + 停止
- `src/app/_components/dashboard.tsx`：把新增的 autoMode/placeCharacter 传到子组件
- `src/app/_hooks/use-world-state.ts`：autoMode、startAuto、stopAuto、placeCharacter
- `src/app/_lib/api.ts`（如有）：新增 `placeCharacter` SSE 客户端封装（可选）
