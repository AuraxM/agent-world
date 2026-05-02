# 多语言切换 / 角色入场 Tab / 24-tick 自动推进 — 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在 admin 加 LLM 输出语言切换；角色栏分「在场 / 未入场」两 tab 并允许投放后立即决策；顶栏加自动推进 24 tick + 停止按钮。

**Architecture:** 三个独立小功能共一份 plan。Feature 1 = 加 settings 字段 + 改 prompt 末段。Feature 2 = 加 SSE 端点串联 `addCharacterToWorld` + 单角色 `decide`，前端拆 tab。Feature 3 = 前端串行循环已有 `/tick`，refactor advance 返回 boolean 以便控制循环。

**Tech Stack:** Next.js (app router) / React 19 / Vitest / OpenAI SDK / drizzle-orm。

---

## File Structure

新增：
- `src/engine/decideForCharacter.ts` — 单角色决策入口（perception + decide + execute），不推进 tick
- `src/app/api/worlds/[id]/characters/place/route.ts` — SSE：add → decide → done

修改：
- `src/engine/settings.ts` — 新增 `language` 字段
- `src/app/api/admin/settings/route.ts` — GET/POST 加 language
- `src/llm/prompt.ts` — 抽 `languageInstruction(lang)`；`buildSystemPrompt` / `buildUserPrompt` 加 `language` 与 `arrivalIntro` 参数
- `src/llm/prompt.test.ts` — 增加语言 + arrivalIntro 用例
- `src/llm/decide.ts` — 注入 language；删除 tool description 里硬编码的"必须使用简体中文"
- `src/domain/schemas.ts` — 同上：去掉 ActionToolInputSchema 字段描述里的"必须使用简体中文"
- `src/app/admin/page.tsx` — admin 顶栏加语言 select
- `src/app/_components/character-rail.tsx` — tab 化、未入场列表、投放按钮
- `src/app/_components/top-bar.tsx` — 自动 24h 按钮 + 停止
- `src/app/_components/dashboard.tsx` — 把 autoMode / placeCharacter / 未入场模板列表向下传
- `src/app/_hooks/use-world-state.ts` — `advance` 返回 boolean；新增 `autoMode` / `startAuto` / `stopAuto` / `placeCharacter` / `availableTemplates`

---

## 实施顺序

**Phase 1（Task 1–4）：语言切换** — 最独立，先行
**Phase 2（Task 5–6）：24-tick 自动** — 纯前端
**Phase 3（Task 7–11）：未入场 tab + 投放即决策** — 后端 + UI 最重，最后做

---

## Phase 1：语言切换

### Task 1：settings 加 language + API 同步

**Files:**
- Modify: `src/engine/settings.ts`
- Modify: `src/app/api/admin/settings/route.ts`

- [ ] **Step 1：扩展 settings 模块**

替换 `src/engine/settings.ts` 全文：

```ts
/**
 * 全局运行时设置（内存存储，服务重启后恢复默认）。
 * 通过 /api/admin/settings 读写。
 */

export type Language = "zh" | "en" | "ja";

export const SUPPORTED_LANGUAGES: readonly Language[] = ["zh", "en", "ja"];

interface Settings {
  thinkingEnabled: boolean;
  language: Language;
}

declare global {
  // eslint-disable-next-line no-var
  var __agent_world_settings__: Settings | undefined;
}

function read(): Settings {
  if (!globalThis.__agent_world_settings__) {
    globalThis.__agent_world_settings__ = {
      thinkingEnabled: true,
      language: "zh",
    };
  }
  return globalThis.__agent_world_settings__;
}

export function getThinkingEnabled(): boolean {
  return read().thinkingEnabled;
}

export function setThinkingEnabled(v: boolean): void {
  read().thinkingEnabled = v;
}

export function getLanguage(): Language {
  return read().language;
}

export function setLanguage(v: Language): void {
  read().language = v;
}

export function isSupportedLanguage(v: unknown): v is Language {
  return typeof v === "string" && (SUPPORTED_LANGUAGES as readonly string[]).includes(v);
}
```

- [ ] **Step 2：修改 settings 路由**

替换 `src/app/api/admin/settings/route.ts`：

```ts
import {
  getLanguage,
  getThinkingEnabled,
  isSupportedLanguage,
  setLanguage,
  setThinkingEnabled,
} from "@/engine/settings";

export async function GET() {
  return Response.json({
    thinkingEnabled: getThinkingEnabled(),
    language: getLanguage(),
  });
}

export async function POST(request: Request) {
  let body: { thinkingEnabled?: boolean; language?: unknown };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "invalid JSON" }, { status: 400 });
  }

  if (typeof body.thinkingEnabled === "boolean") {
    setThinkingEnabled(body.thinkingEnabled);
  }
  if (body.language !== undefined) {
    if (!isSupportedLanguage(body.language)) {
      return Response.json(
        { error: "unsupported language; must be one of zh/en/ja" },
        { status: 400 },
      );
    }
    setLanguage(body.language);
  }

  return Response.json({
    thinkingEnabled: getThinkingEnabled(),
    language: getLanguage(),
  });
}
```

- [ ] **Step 3：跑一次 type check 确认无回归**

Run: `npx tsc --noEmit`
Expected: 通过（项目已有错误也应保持原状；新增不引入新错误）

- [ ] **Step 4：commit**

```bash
git add src/engine/settings.ts src/app/api/admin/settings/route.ts
git commit -m "feat(settings): add language field to global settings + API"
```

---

### Task 2：prompt.ts 抽出 languageInstruction + 改造 build*Prompt

**Files:**
- Modify: `src/llm/prompt.ts`
- Modify: `src/domain/schemas.ts`
- Test: `src/llm/prompt.test.ts`

- [ ] **Step 1：先写失败测试（语言指令存在性 + 跨语言记忆提示）**

在 `src/llm/prompt.test.ts` **末尾**追加新 describe 块：

```ts
describe("language", () => {
  it("zh 时 system prompt 含简体中文输出指令；不含跨语言记忆提示", () => {
    const sys = buildSystemPrompt({
      character: baseCharacter,
      worldName: "测试世界",
      nodes: [restaurant],
      language: "zh",
    });
    expect(sys).toContain("简体中文");
    expect(sys).not.toMatch(/may be written in a different language/i);
  });

  it("en 时 system + user prompt 都含 English 指令 + 跨语言提示", () => {
    const sys = buildSystemPrompt({
      character: baseCharacter,
      worldName: "测试世界",
      nodes: [restaurant],
      language: "en",
    });
    const user = buildUserPrompt({
      character: baseCharacter,
      here: restaurant,
      companions: [],
      perceived: [],
      options: [{ type: "wait", hint: "等" }],
      tick: 5,
      facts: emptyFacts,
      language: "en",
    });
    expect(sys).toMatch(/MUST be written in English/);
    expect(user).toMatch(/MUST be written in English/);
    expect(user).toMatch(/may be written in a different language/);
  });

  it("ja 时 system + user prompt 都含日本語指令 + 跨语言提示", () => {
    const sys = buildSystemPrompt({
      character: baseCharacter,
      worldName: "测试世界",
      nodes: [restaurant],
      language: "ja",
    });
    const user = buildUserPrompt({
      character: baseCharacter,
      here: restaurant,
      companions: [],
      perceived: [],
      options: [{ type: "wait", hint: "等" }],
      tick: 5,
      facts: emptyFacts,
      language: "ja",
    });
    expect(sys).toContain("日本語で書いてください");
    expect(user).toContain("日本語で書いてください");
    expect(user).toContain("別の言語");
  });

  it("language 缺省时按 zh 处理（向后兼容）", () => {
    const sys = buildSystemPrompt({
      character: baseCharacter,
      worldName: "测试世界",
      nodes: [restaurant],
    });
    expect(sys).toContain("简体中文");
  });
});
```

- [ ] **Step 2：跑测试确认失败**

Run: `npx vitest run src/llm/prompt.test.ts -t "language"`
Expected: 4 个用例全部 FAIL，原因：`buildSystemPrompt` / `buildUserPrompt` 不接受 `language` 参数 → 类型错误或运行时无对应文本。

- [ ] **Step 3：在 prompt.ts 顶部加 `Language` 类型 + `languageInstruction` / `crossLanguageNote` 函数**

在 `src/llm/prompt.ts` 文件头部 import 之后插入：

```ts
import type { Language } from "@/engine/settings";
```

把当前 `WORLD_RULES` 末段（"输出语言：…必须使用简体中文…"）那一段从字符串里**删掉**（因为要改为按 language 动态拼接），然后在 `WORLD_RULES` 常量**后面**加：

```ts
// ---------------------------------------------------------------------------
// language instructions (system prompt 末段 + user prompt 末段共用)
// ---------------------------------------------------------------------------

function languageInstruction(lang: Language): string {
  if (lang === "zh") {
    return `输出语言：
- 你的 reasoning、free_text、emotion_tag 必须使用简体中文。
- 地名、人名等专有名词可以使用原文（如日文/英文），但叙述和内心活动**必须**是简体中文。
- 你的假想对话对象也使用简体中文（你所在世界的居民全部懂中文）。`;
  }
  if (lang === "en") {
    return `Output language:
- Your reasoning, free_text, and emotion_tag MUST be written in English.
- Place names and personal names may stay in their original language; narration and inner monologue MUST be English.
- Imagined conversation partners also speak English (every resident here understands English).`;
  }
  // ja
  return `出力言語：
- あなたの reasoning / free_text / emotion_tag は必ず日本語で書いてください。
- 地名・人名は原語のままで構いませんが、語りと内心の独白は必ず日本語で書きます。
- 想定する会話相手も日本語を話します（この世界の住人は全員日本語が分かります）。`;
}

function crossLanguageNote(lang: Language): string | null {
  if (lang === "zh") return null;
  if (lang === "en") {
    return "Note: your earlier short/long memories may be written in a different language. Continue replying in English regardless.";
  }
  return "注意：あなたの過去の短期・長期記憶は別の言語で書かれている可能性があります。それでも回答は必ず日本語で続けてください。";
}
```

- [ ] **Step 4：buildSystemPrompt 接受 language 并把指令拼到末尾**

把 `buildSystemPrompt` 的签名改为：

```ts
export function buildSystemPrompt(args: {
  character: Character;
  worldName: string;
  nodes: MapNode[];
  language?: Language;
}): string {
  const { character, worldName, nodes } = args;
  const language = args.language ?? "zh";
  const homeNodeId = character.homeNodeId ?? null;
  const lines: string[] = [
    WORLD_RULES,
    "",
    `你身处的世界：${worldName}。`,
  ];
  const mapGraph = describeMapGraph(nodes, homeNodeId);
  if (mapGraph) {
    lines.push("", mapGraph);
  }
  lines.push(
    "",
    "你的自我认知：",
    `- 名字：${character.name}`,
    "- 性格特征（用文字描述，**禁止在 reasoning 里写数值**）：",
    ...describePersonality(character.personality).map((s) => `  · ${s}`),
    character.abilities.length > 0
      ? `- 能力：${character.abilities.map((a) => `${a.kind}(tier ${a.tier})`).join("、")}`
      : "- 能力：（无值得一提的特殊能力）",
  );
  // 末尾追加输出语言指令
  lines.push("", languageInstruction(language));
  return lines.join("\n");
}
```

- [ ] **Step 5：buildUserPrompt 接受 language 并替换原"必须使用简体中文"那行**

把 `buildUserPrompt` 签名改为：

```ts
export function buildUserPrompt(args: {
  character: Character;
  here: MapNode;
  companions: Character[];
  perceived: WorldEvent[];
  options: ActionOption[];
  tick: number;
  facts: AggregatedFacts;
  language?: Language;
  arrivalIntro?: boolean;  // Task 7 用，先放上
}): string {
  const { character, here, companions, perceived, options, tick, facts } = args;
  const language = args.language ?? "zh";
  // ... 现有所有逻辑不变 ...
```

把函数末尾原来这两行：

```ts
  lines.push(
    "请**调用 submit_action 工具**返回你的决定（不要输出自然语言文本）。务必在 reasoning 中显式引用一项你的性格特征的文字描述。所有输出（reasoning、free_text、emotion_tag）必须使用简体中文。",
  );
```

替换为：

```ts
  // 跨语言记忆提示（仅 non-zh）
  const note = crossLanguageNote(language);
  if (note) {
    lines.push(note, "");
  }

  // 末尾的提交指令 + 输出语言要求
  if (language === "zh") {
    lines.push(
      "请**调用 submit_action 工具**返回你的决定（不要输出自然语言文本）。务必在 reasoning 中显式引用一项你的性格特征的文字描述。",
    );
  } else if (language === "en") {
    lines.push(
      "Please **call the submit_action tool** to return your decision (do not output any free-form natural-language text). You must explicitly cite one textual personality trait of yours in reasoning.",
    );
  } else {
    lines.push(
      "submit_action ツールを必ず呼び出して回答してください（自由形式の自然言語テキストは出力しないでください）。reasoning では自分の性格特徴の文字記述を 1 つ明示的に引用してください。",
    );
  }
  lines.push("", languageInstruction(language));

  return lines.join("\n");
}
```

- [ ] **Step 6：去掉 ActionToolInputSchema 描述里硬编码的语言要求**

修改 `src/domain/schemas.ts:55-69` 里 `ActionToolInputSchema.properties` 的字符串描述：

```ts
    free_text: {
      type: "string",
      description:
        "自由文本（说话内容、行动具体描述）。speak 必填；其它行动选填。",
    },
    reasoning: {
      type: "string",
      description:
        "内心独白。必须显式引用一项你的性格特征（用文字描述，不要写数值）。",
    },
    emotion_tag: {
      type: "string",
      description: "短情绪标签，例如 紧张 / 好奇 / 烦躁。",
    },
```

（删除三处"必须使用简体中文 / 必须使用简体中文，例如"等硬编码语言）

- [ ] **Step 7：跑测试确认通过**

Run: `npx vitest run src/llm/prompt.test.ts`
Expected: 全部 PASS（既包括新加的 language describe，也包括原有用例）

- [ ] **Step 8：commit**

```bash
git add src/llm/prompt.ts src/llm/prompt.test.ts src/domain/schemas.ts
git commit -m "feat(prompt): support language switching for output language instruction"
```

---

### Task 3：decide.ts 注入 language

**Files:**
- Modify: `src/llm/decide.ts`

- [ ] **Step 1：让 decide 读取 settings 并向下传**

修改 `src/llm/decide.ts:39-52` 的 `callLLM`：

```ts
async function callLLM(input: DecideInput): Promise<Action> {
  const client = getLLMClient();
  const language = getLanguage();
  const system = buildSystemPrompt({
    character: input.character,
    worldName: input.worldName,
    nodes: input.nodes,
    language,
  });
  const user = buildUserPrompt({
    character: input.character,
    here: input.here,
    companions: input.companions,
    perceived: input.perceived,
    options: input.options,
    tick: input.tick,
    facts: input.facts,
    language,
  });
```

文件顶部 import 修改：

```ts
import { getLanguage, getThinkingEnabled } from "@/engine/settings";
```

- [ ] **Step 2：去掉 tool 描述里硬编码语言**

`src/llm/decide.ts:54-62` 改成：

```ts
  const tool: ChatCompletionTool = {
    type: "function",
    function: {
      name: ACTION_TOOL_NAME,
      description:
        "提交你这一 tick 的行动。type 必须是封闭枚举之一；reasoning 必须显式引用一项你自己的性格特征（用文字描述，不要写数值）。",
      parameters: ActionToolInputSchema,
    },
  };
```

- [ ] **Step 3：跑全部测试确保未破坏**

Run: `npx vitest run`
Expected: 全部 PASS。

- [ ] **Step 4：commit**

```bash
git add src/llm/decide.ts
git commit -m "feat(decide): inject runtime language into system + user prompts"
```

---

### Task 4：admin 顶栏加语言 select

**Files:**
- Modify: `src/app/admin/page.tsx`

- [ ] **Step 1：在 AdminContent state 与 useEffect 中加 language**

定位 `src/app/admin/page.tsx:142-170`，把 `AdminContent` 头部改为：

```tsx
function AdminContent() {
  const [tab, setTab] = useState<Tab>("providers");
  const [thinkingEnabled, setThinkingEnabled] = useState(true);
  const [thinkingLoading, setThinkingLoading] = useState(false);
  const [language, setLanguage] = useState<"zh" | "en" | "ja">("zh");
  const [languageLoading, setLanguageLoading] = useState(false);

  useEffect(() => {
    fetch("/api/admin/settings")
      .then((r) => r.json())
      .then((d) => {
        setThinkingEnabled(d.thinkingEnabled);
        if (d.language === "zh" || d.language === "en" || d.language === "ja") {
          setLanguage(d.language);
        }
      })
      .catch(() => { /* keep default */ });
  }, []);

  async function handleThinkingToggle() {
    const next = !thinkingEnabled;
    setThinkingLoading(true);
    try {
      const res = await fetch("/api/admin/settings", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ thinkingEnabled: next }),
      });
      const data = await res.json();
      if (res.ok) setThinkingEnabled(data.thinkingEnabled);
    } catch {
      /* revert on error */
    } finally {
      setThinkingLoading(false);
    }
  }

  async function handleLanguageChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const next = e.target.value as "zh" | "en" | "ja";
    setLanguageLoading(true);
    try {
      const res = await fetch("/api/admin/settings", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ language: next }),
      });
      const data = await res.json();
      if (res.ok) setLanguage(data.language);
    } catch {
      /* revert on error */
    } finally {
      setLanguageLoading(false);
    }
  }
```

- [ ] **Step 2：在 thinking toggle 左边插入 select**

定位 `src/app/admin/page.tsx:179-201`（label 包裹 thinking toggle 那段）。在它**前面**插入：

```tsx
        <label className="flex items-center gap-2 ml-auto cursor-pointer select-none">
          <span className="text-game-xs text-(--color-pixel-muted) whitespace-nowrap">
            语言
          </span>
          <select
            value={language}
            onChange={handleLanguageChange}
            disabled={languageLoading}
            className="px-2 py-0.5 text-game-xs bg-(--color-pixel-bg-2) border border-(--color-pixel-border-light) text-(--color-pixel-fg) outline-none focus:border-(--color-pixel-accent) disabled:opacity-50"
          >
            <option value="zh">简体中文</option>
            <option value="en">English</option>
            <option value="ja">日本語</option>
          </select>
        </label>
```

并把原 thinking toggle 那个 label 的 `ml-auto` 删掉（因为 select 已经占了 `ml-auto` 位置）：把它的 className 改为 `flex items-center gap-2 cursor-pointer select-none`（无 `ml-auto`）。

- [ ] **Step 3：手测**

启动 dev server：`npm run dev`，打开 `http://localhost:3000/admin`。
Expected:
1. 顶栏从右到左依次是 [返回游戏] / [LLM Thinking 开关] / [语言 select 简体中文/English/日本語]
2. 切换 select → 网络面板看到 POST /api/admin/settings body `{"language":"en"}`，响应 200。
3. 刷新页面，select 保持服务端最新值。

- [ ] **Step 4：commit**

```bash
git add src/app/admin/page.tsx
git commit -m "feat(admin): add language select in admin top bar"
```

---

## Phase 2：自动 24-tick

### Task 5：useWorldState 加 autoMode + advance 返回 boolean

**Files:**
- Modify: `src/app/_hooks/use-world-state.ts`

- [ ] **Step 1：把 advance 改成返回 `Promise<boolean>`**

定位 `src/app/_hooks/use-world-state.ts:81-191` 的 `advance` 函数。把其 try/catch 改造为：

- 成功（SSE 收到 `done`） → return true
- 失败（throw / abort / SSE error）→ return false（abort 也算 false）

具体：

将函数声明从 `const advance = useCallback(async () => {` 改为 `const advance = useCallback(async (): Promise<boolean> => {`。

在原 `await refresh();` 行（约 :184）后面追加：

```ts
      return tickDone;
```

把原 catch 块（约 :185-190）改为：

```ts
    } catch (e) {
      if (e instanceof DOMException && e.name === "AbortError") return false;
      setError(e instanceof Error ? e.message : String(e));
      setLoading(false);
      setTickProgress(null);
      return false;
    }
```

- [ ] **Step 2：在 useWorldState 增加 autoMode state + ref**

在 hook 顶部其他 useState 旁加：

```ts
  const [autoMode, setAutoMode] = useState<{
    running: boolean;
    total: number;
    done: number;
  } | null>(null);
  const shouldStopRef = useRef(false);
```

- [ ] **Step 3：增加 startAuto / stopAuto，扩展 UseWorldState 接口**

在 `UseWorldState` interface（约 :29-40）末尾插入：

```ts
  autoMode: { running: boolean; total: number; done: number } | null;
  startAuto: (n?: number) => Promise<void>;
  stopAuto: () => void;
```

并在 hook 内 advance 之后定义：

```ts
  const startAuto = useCallback(
    async (n: number = 24) => {
      if (loading || autoMode?.running) return;
      shouldStopRef.current = false;
      setAutoMode({ running: true, total: n, done: 0 });
      try {
        for (let i = 0; i < n; i++) {
          if (shouldStopRef.current) break;
          const ok = await advance();
          if (!ok) break;
          setAutoMode((prev) => (prev ? { ...prev, done: prev.done + 1 } : prev));
        }
      } finally {
        shouldStopRef.current = false;
        setAutoMode(null);
      }
    },
    [advance, loading, autoMode],
  );

  const stopAuto = useCallback(() => {
    shouldStopRef.current = true;
  }, []);
```

修改 hook return 块，加入新字段：

```ts
  return {
    snapshot,
    events,
    loading,
    error,
    lastTickMs,
    tickProgress,
    refresh,
    advance,
    autoMode,
    startAuto,
    stopAuto,
  };
```

- [ ] **Step 4：跑 type check**

Run: `npx tsc --noEmit`
Expected: 通过；如果 dashboard / top-bar 因引用 advance 返回类型变化报错，修复（advance 仍可作为 `() => void` 调用，因为它返回 Promise，旧调用方使用 `void advance()`）。

- [ ] **Step 5：commit**

```bash
git add src/app/_hooks/use-world-state.ts
git commit -m "feat(use-world-state): autoMode + startAuto/stopAuto, advance returns boolean"
```

---

### Task 6：top-bar 自动 24h 按钮 + 停止；dashboard 透传

**Files:**
- Modify: `src/app/_components/top-bar.tsx`
- Modify: `src/app/_components/dashboard.tsx`

- [ ] **Step 1：扩展 TopBar 接口**

替换 `src/app/_components/top-bar.tsx` 全文：

```tsx
"use client";

import { formatGameTime } from "../_lib/format";

export function TopBar({
  tick,
  worldName,
  loading,
  onAdvance,
  lastTickMs,
  tickProgress,
  error,
  autoMode,
  onStartAuto,
  onStopAuto,
}: {
  tick: number;
  worldName: string;
  loading: boolean;
  onAdvance: () => void;
  lastTickMs: number | null;
  tickProgress?: { done: number; total: number } | null;
  error: string | null;
  autoMode: { running: boolean; total: number; done: number } | null;
  onStartAuto: () => void;
  onStopAuto: () => void;
}) {
  const auto = autoMode?.running ?? false;
  const stopRequested = false; // 当前轮 tick 还在跑、stopAuto 已点 → 这里不可见，UI 直接走 auto=false 即可
  return (
    <header className="flex items-center gap-4 px-4 py-2 bg-(--color-pixel-bg-2) border-b-2 border-(--color-pixel-border-dark)">
      <div className="flex items-baseline gap-3">
        <span className="text-(--color-pixel-accent) text-game-lg tracking-widest">
          ◆ {worldName}
        </span>
        <span className="text-(--color-pixel-fg) text-game-base">
          t={tick} · {formatGameTime(tick)}
        </span>
      </div>
      <div className="flex-1" />
      {lastTickMs !== null && (
        <span className="text-game-xs text-(--color-pixel-muted)">
          上次推进 {Math.round(lastTickMs)}ms
        </span>
      )}
      {error && (
        <span className="text-game-base text-(--color-pixel-danger) max-w-xs truncate">
          ⚠ {error}
        </span>
      )}
      {auto && autoMode && (
        <span className="text-game-xs text-(--color-pixel-accent)">
          自动 {autoMode.done}/{autoMode.total}
          {tickProgress && tickProgress.total > 0
            ? ` · 当前 ${tickProgress.done}/${tickProgress.total}`
            : ""}
        </span>
      )}
      {!auto && tickProgress && tickProgress.total > 0 && (
        <span className="text-game-xs text-(--color-pixel-accent)">
          {tickProgress.done}/{tickProgress.total}
        </span>
      )}
      {auto ? (
        <button
          type="button"
          onClick={onStopAuto}
          className="px-3 py-1 text-game-base bg-(--color-pixel-danger) text-(--color-pixel-border-dark) border-2 border-(--color-pixel-border-dark) shadow-[inset_0_-2px_0_var(--color-pixel-border-dark)] hover:brightness-110 active:translate-y-px"
        >
          停止 ⏹
        </button>
      ) : (
        <>
          <button
            type="button"
            onClick={onAdvance}
            disabled={loading}
            className="px-3 py-1 text-game-base bg-(--color-pixel-accent) text-(--color-pixel-border-dark) border-2 border-(--color-pixel-accent-dark) shadow-[inset_0_-2px_0_var(--color-pixel-accent-dark)] disabled:opacity-50 disabled:cursor-not-allowed hover:brightness-110 active:translate-y-px"
          >
            {loading ? "推进中…" : "推进 1 小时 ▶"}
          </button>
          <button
            type="button"
            onClick={onStartAuto}
            disabled={loading}
            className="px-3 py-1 text-game-base bg-(--color-pixel-bg) text-(--color-pixel-fg) border-2 border-(--color-pixel-border-light) hover:border-(--color-pixel-accent) hover:text-(--color-pixel-accent) disabled:opacity-50 disabled:cursor-not-allowed active:translate-y-px"
          >
            自动 24h ⏵⏵
          </button>
        </>
      )}
    </header>
  );
}
```

(**说明**：原文有未用变量 `stopRequested` 留作占位避免 lint 警告——可以删除并把行删干净；为了简化我建议把它和"// 当前轮 tick…"那两行**直接删除**保持 lint clean，否则 ESLint 可能报错。)

简化版：删除上面两行 `const stopRequested = false; // …`，组件内不需要这个变量。

- [ ] **Step 2：dashboard 透传 autoMode / startAuto / stopAuto**

修改 `src/app/_components/dashboard.tsx`：

`useWorldState()` 返回值解构里加 `autoMode, startAuto, stopAuto`。`<TopBar ... />` 多传：

```tsx
        autoMode={autoMode}
        onStartAuto={() => void startAuto()}
        onStopAuto={stopAuto}
```

- [ ] **Step 3：手测**

启动 dev server：`npm run dev`。

Expected:
1. 顶栏出现 "推进 1 小时 ▶" 与 "自动 24h ⏵⏵" 两个按钮。
2. 点 "自动 24h"：右侧出现 "自动 0/24 · 当前 N/M"，按钮变成红色 "停止 ⏹"。地图、事件实时刷新。计数从 0/24 一路涨到 24/24。
3. 跑到一半时点 "停止 ⏹"：当前 tick 跑完后，UI 回到常规两按钮，进度数字停在中间值（如 7/24）。
4. 自动模式中 "推进 1 小时" 不可见（被替换）。

- [ ] **Step 4：commit**

```bash
git add src/app/_components/top-bar.tsx src/app/_components/dashboard.tsx
git commit -m "feat(top-bar): add 24h auto-advance with stop button"
```

---

## Phase 3：未入场 tab + 投放即决策

### Task 7：prompt.ts 加 arrivalIntro 段 + 测试

**Files:**
- Modify: `src/llm/prompt.ts`
- Test: `src/llm/prompt.test.ts`

- [ ] **Step 1：先写失败测试**

在 `src/llm/prompt.test.ts` `describe("language", ...)` **后**追加：

```ts
describe("arrivalIntro", () => {
  it("zh：arrivalIntro=true 在 user prompt 末段加来由要求", () => {
    const out = buildUserPrompt({
      character: baseCharacter,
      here: restaurant,
      companions: [],
      perceived: [],
      options: [{ type: "wait", hint: "等" }],
      tick: 5,
      facts: emptyFacts,
      arrivalIntro: true,
    });
    expect(out).toContain("刚抵达此地");
    expect(out).toMatch(/编造.*来到这里.*理由/);
  });

  it("arrivalIntro=false / 缺省时不出现来由要求", () => {
    const out = buildUserPrompt({
      character: baseCharacter,
      here: restaurant,
      companions: [],
      perceived: [],
      options: [{ type: "wait", hint: "等" }],
      tick: 5,
      facts: emptyFacts,
    });
    expect(out).not.toContain("刚抵达此地");
  });

  it("en：arrivalIntro=true 用 English 来由提示", () => {
    const out = buildUserPrompt({
      character: baseCharacter,
      here: restaurant,
      companions: [],
      perceived: [],
      options: [{ type: "wait", hint: "等" }],
      tick: 5,
      facts: emptyFacts,
      language: "en",
      arrivalIntro: true,
    });
    expect(out).toMatch(/just arrived/i);
    expect(out).toMatch(/why you came/i);
  });

  it("ja：arrivalIntro=true 用日本語来由提示", () => {
    const out = buildUserPrompt({
      character: baseCharacter,
      here: restaurant,
      companions: [],
      perceived: [],
      options: [{ type: "wait", hint: "等" }],
      tick: 5,
      facts: emptyFacts,
      language: "ja",
      arrivalIntro: true,
    });
    expect(out).toContain("到着したばかり");
    expect(out).toContain("理由");
  });
});
```

- [ ] **Step 2：跑测试确认失败**

Run: `npx vitest run src/llm/prompt.test.ts -t "arrivalIntro"`
Expected: 4 个用例 FAIL。

- [ ] **Step 3：在 prompt.ts 加 `arrivalIntroBlock` 函数 + 在 buildUserPrompt 末段插入**

在 `prompt.ts` `crossLanguageNote` 函数后追加：

```ts
function arrivalIntroBlock(lang: Language): string {
  if (lang === "zh") {
    return `你是刚抵达此地的访客或新住客。请在 reasoning 中编造一段简短的「我为何来到这里」的理由（1–2 句），与你的性格相符。`;
  }
  if (lang === "en") {
    return "You have just arrived in this place as a visitor or new resident. In reasoning, fabricate a brief reason (1–2 sentences) for why you came here, consistent with your personality.";
  }
  return "あなたはこの場所に到着したばかりの訪問者または新しい住人です。reasoning の中で、自分の性格と矛盾しない「ここに来た理由」を 1〜2 文で簡潔に作り上げてください。";
}
```

修改 `buildUserPrompt` 末尾——在 "提交指令"那行**之前**插入：

```ts
  if (args.arrivalIntro) {
    lines.push(arrivalIntroBlock(language), "");
  }
```

完整顺序应为（自上而下）：

1. 跨语言提示（如有）
2. **arrivalIntro 段（如有）** ← 新插入
3. 提交指令（submit_action）
4. languageInstruction(language)

- [ ] **Step 4：跑测试确认通过**

Run: `npx vitest run src/llm/prompt.test.ts`
Expected: 全部 PASS。

- [ ] **Step 5：commit**

```bash
git add src/llm/prompt.ts src/llm/prompt.test.ts
git commit -m "feat(prompt): add arrivalIntro block for newly placed characters"
```

---

### Task 8：decideForCharacter 引擎入口

**Files:**
- Create: `src/engine/decideForCharacter.ts`

- [ ] **Step 1：写新文件**

创建 `src/engine/decideForCharacter.ts`：

```ts
/**
 * 单角色决策入口（用于"投放角色"等不推进 tick 的场景）。
 *
 * 流程：
 *   1. loadWorld → 找到目标角色
 *   2. 收集 currentTick 的所有事件（含外部预先写好的 arrival 事件）
 *   3. dispatchPerception 仅取该角色的可感知列表
 *   4. 构造 ActionContext + 决策上下文
 *   5. 调用 decideFn（强制 arrivalIntro=true）
 *   6. executeActions 仅对该角色 → 拿到 events / resolved action
 *   7. 追加 events_log + thought
 *
 * 不动 currentTick；其他角色不参与决策（他们看到 arrival 事件要等下一次 tick）。
 */
import { and, eq, gte } from "drizzle-orm";
import { buildActionContext, getAvailableActions } from "./actions";
import { executeActions } from "./execute";
import { deriveAggregatedFacts } from "./facts";
import { dispatchPerception } from "./perception";
import {
  appendEventsLog,
  appendThoughts,
  loadRecentThoughts,
  loadWorld,
  saveWorld,
} from "./store";
import { getLanguage } from "./settings";
import { db, schema } from "@/db/client";
import { loadAllCharacters } from "@/config/loader";
import { buildSystemPrompt, buildUserPrompt, timeOfDay } from "@/llm/prompt";
import type { Action, Character, MapNode, WorldEvent } from "@/domain/types";
import type { DecideInput } from "./tick";

const FACTS_LOOKBACK_TICKS = 48;

export interface DecideForCharacterResult {
  action: Action;
  success: boolean;
  events: WorldEvent[];
}

function fallbackWait(c: Character, reason: string): Action {
  return {
    type: "wait",
    actorId: c.id,
    reasoning: `LLM 调用失败：${reason}`,
    selfImportance: 1,
  };
}

function buildHomeMap(): Map<string, string> {
  const m = new Map<string, string>();
  try {
    for (const tpl of loadAllCharacters()) {
      if (tpl.homeNodeId) m.set(tpl.id, tpl.homeNodeId);
    }
  } catch {
    /* configs 不可读时静默 */
  }
  return m;
}

/**
 * 加载某 worldId 在 tick=currentTick 的所有事件（用于刚被 addCharacterToWorld
 * 写入的 arrival 事件参与感知）。
 */
function loadEventsAtTick(worldId: string, tick: number): WorldEvent[] {
  const rows = db
    .select()
    .from(schema.events)
    .where(
      and(eq(schema.events.worldId, worldId), eq(schema.events.tick, tick)),
    )
    .all();
  return rows.map((r) => ({
    id: r.id,
    worldId: r.worldId,
    tick: r.tick,
    category: r.category as WorldEvent["category"],
    description: r.description,
    participants: JSON.parse(r.participantsJson) as string[],
    source: r.source as WorldEvent["source"],
    intensity: r.intensity as WorldEvent["intensity"],
    scope: r.scope as WorldEvent["scope"],
    nodeId: r.nodeId ?? undefined,
    audienceCharacterId: r.audienceCharacterId ?? undefined,
    duration: r.duration,
    suggestedActions: r.suggestedActionsJson
      ? (JSON.parse(r.suggestedActionsJson) as string[])
      : undefined,
  }));
}

export interface DecideForCharacterOptions {
  /** 测试 / 内部 stub 用；缺省走 llmDecide。 */
  decide?: (input: DecideInput) => Promise<Action>;
}

export async function decideForCharacter(
  worldId: string,
  characterId: string,
  options: DecideForCharacterOptions = {},
): Promise<DecideForCharacterResult> {
  const loaded = loadWorld(worldId);
  const { world, nodes, characters } = loaded;
  const c = characters.find((x) => x.id === characterId);
  if (!c) throw new Error(`character not in world: ${characterId}`);

  const fromTick = world.currentTick;
  const homeMap = buildHomeMap();
  const homeNodeId = homeMap.get(c.id) ?? null;
  c.homeNodeId = homeNodeId;

  // 1. perception：当 tick 已写的事件
  const tickEvents = loadEventsAtTick(worldId, fromTick);
  const perceptions = dispatchPerception(nodes, characters, tickEvents);
  const perceived = perceptions.get(c.id) ?? [];

  // 2. facts + options
  const sinceTick = Math.max(0, fromTick - FACTS_LOOKBACK_TICKS);
  const recentThoughts = loadRecentThoughts(worldId, c.id, sinceTick);
  const facts = deriveAggregatedFacts({
    character: c,
    nodes,
    currentTick: fromTick,
    recentThoughts,
    homeNodeId,
  });
  const ctx = buildActionContext(c, nodes, characters);
  const dayInfo = timeOfDay(fromTick);
  const opts = getAvailableActions(ctx, {
    facts,
    isSleepHour: dayInfo.isSleepHour,
  });

  // 3. 决策（强制 arrivalIntro）
  const language = getLanguage();
  let action: Action;
  try {
    // 注意：当前 llmDecide 内部自己 build prompt，不接受 arrivalIntro。
    // 本场景需要 arrivalIntro，因此**绕开 llmDecide**：复制其骨架但传 arrivalIntro=true。
    // 测试时通过 options.decide 注入 stub，跳过真实 LLM。
    if (!options.decide) {
      const { hasApiKey, getLLMClient, getModelName } = await import(
        "@/llm/client"
      );
      if (!hasApiKey()) {
        action = fallbackWait(c, "没有激活的 LLM provider");
      } else {
        const {
          ACTION_TOOL_NAME,
          ActionSchema,
          ActionToolInputSchema,
        } = await import("@/domain/schemas");
        const { getThinkingEnabled } = await import("./settings");
        const OpenAI = (await import("openai")).default;

        const system = buildSystemPrompt({
          character: c,
          worldName: world.name,
          nodes,
          language,
        });
        const user = buildUserPrompt({
          character: c,
          here: ctx.here,
          companions: ctx.companions,
          perceived,
          options: opts,
          tick: fromTick,
          facts,
          language,
          arrivalIntro: true,
        });

        try {
          const client = getLLMClient();
          const extra: Record<string, unknown> = {};
          if (getThinkingEnabled()) extra.thinking = { type: "enabled" };
          const resp = await client.chat.completions.create({
            model: getModelName(),
            max_tokens: 4096,
            messages: [
              { role: "system", content: system },
              { role: "user", content: user },
            ],
            tools: [
              {
                type: "function",
                function: {
                  name: ACTION_TOOL_NAME,
                  description:
                    "提交你这一 tick 的行动。type 必须是封闭枚举之一；reasoning 必须显式引用一项你自己的性格特征（用文字描述，不要写数值）。",
                  parameters: ActionToolInputSchema,
                },
              },
            ],
            ...extra,
          });
          const tc = resp.choices[0]?.message?.tool_calls?.find(
            (x) => x.type === "function" && x.function.name === ACTION_TOOL_NAME,
          );
          if (!tc || tc.type !== "function") {
            throw new Error("LLM 没有返回 submit_action tool_call");
          }
          const parsed = ActionSchema.safeParse(JSON.parse(tc.function.arguments));
          if (!parsed.success) {
            throw new Error(`tool_call 参数不符合 ActionSchema：${parsed.error.message}`);
          }
          const p = parsed.data;
          action = {
            type: p.action_type,
            actorId: c.id,
            targetId: p.target_id,
            targetNodeId: p.target_node_id,
            freeText: p.free_text,
            reasoning: p.reasoning,
            emotionTag: p.emotion_tag,
            selfImportance: p.self_importance,
            changeType: p.change_type,
          };
        } catch (err) {
          const msg =
            err instanceof OpenAI.APIError
              ? `${err.constructor.name} status=${err.status}: ${err.message}`
              : err instanceof Error
                ? err.message
                : String(err);
          action = fallbackWait(c, msg);
        }
      }
    } else {
      // 测试 stub：直接调用，不走真实 LLM
      action = await options.decide({
        character: c,
        nodes,
        here: ctx.here,
        companions: ctx.companions,
        reachable: ctx.reachable,
        perceived,
        options: opts,
        worldName: world.name,
        tick: fromTick,
        facts,
      });
    }
  } catch (err) {
    action = fallbackWait(
      c,
      err instanceof Error ? err.message : String(err),
    );
  }

  // 4. execute
  const exec = executeActions({
    worldId,
    tick: fromTick,
    characters,
    nodes,
    actions: [action],
  });

  // 5. 持久化
  appendEventsLog(worldId, exec.events);
  saveWorld(loaded); // 不动 currentTick
  appendThoughts(
    worldId,
    exec.resolvedActions.map((r) => ({
      characterId: r.action.actorId,
      tick: fromTick,
      action: r.action,
      success: r.success,
    })),
  );

  const resolved = exec.resolvedActions[0];
  return {
    action: resolved?.action ?? action,
    success: resolved?.success ?? false,
    events: exec.events,
  };
}
```

> 注：上面的 `decide` 调用路径有意把"测试 stub" 和"真实 LLM"两条分支分开写，避免把 `llmDecide` 与 arrivalIntro 强耦合。如果你之后愿意把 `llmDecide` 改造成接受 `arrivalIntro` 选项，这里可以收敛——**v1 不做**。

- [ ] **Step 2：检查 schema.events 列名**

如果 `loadEventsAtTick` 中的字段名（`participantsJson` / `nodeId` 等）与 `db/schema.ts` 不一致，按实际列名调整。可以先：

Run: `head -200 src/db/schema.ts`
确认列名（events 表的 jsonb / json text 字段命名习惯）。如果用 `participants_json` 等 snake_case，drizzle 会暴露为定义里的属性名，按定义调整。

- [ ] **Step 3：跑 type check**

Run: `npx tsc --noEmit`
Expected: 通过。

- [ ] **Step 4：commit**

```bash
git add src/engine/decideForCharacter.ts
git commit -m "feat(engine): decideForCharacter for single-character placement decisions"
```

---

### Task 9：/api/worlds/[id]/characters/place SSE 路由

**Files:**
- Create: `src/app/api/worlds/[id]/characters/place/route.ts`

- [ ] **Step 1：写新路由**

创建 `src/app/api/worlds/[id]/characters/place/route.ts`：

```ts
/**
 * POST /api/worlds/:id/characters/place
 * 把一个未在世界中的角色投放到地图入口节点，并立即跑一次它的 LLM 决策
 * （prompt 强制 arrivalIntro=true，让 LLM 编造它来到此地的理由）。
 *
 * SSE：
 *   event: placed     data: { characterId, entryNodeId }
 *   event: decision   data: { characterId, characterName, action }
 *   event: done       data: { characterId, tick }
 *   event: error      data: { error, status }
 */
import { z } from "zod";
import { addCharacterToWorld } from "@/engine/addCharacter";
import { decideForCharacter } from "@/engine/decideForCharacter";
import { loadWorld } from "@/engine/store";

export const maxDuration = 120;

const BodySchema = z.object({
  characterId: z.string().min(1),
});

export async function POST(
  request: Request,
  ctx: RouteContext<"/api/worlds/[id]/characters/place">,
) {
  const { id: worldId } = await ctx.params;

  let json: unknown;
  try {
    json = await request.json();
  } catch {
    return Response.json({ error: "invalid JSON body" }, { status: 400 });
  }
  const parsed = BodySchema.safeParse(json);
  if (!parsed.success) {
    return Response.json(
      { error: "invalid body: characterId required" },
      { status: 400 },
    );
  }
  const { characterId } = parsed.data;

  // 在 SSE 启动前先做同步可恢复错误检查（add 阶段）
  let entryNodeId: string;
  try {
    const r = addCharacterToWorld({ worldId, characterId });
    entryNodeId = r.entryNodeId;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (
      message.startsWith("world not found") ||
      message.startsWith("character template not found")
    ) {
      return Response.json({ error: message }, { status: 404 });
    }
    if (
      message.startsWith("character already in world") ||
      message.startsWith("entry node not in world") ||
      message.startsWith("world has no entry node")
    ) {
      return Response.json({ error: message }, { status: 400 });
    }
    return Response.json({ error: message }, { status: 500 });
  }

  const stream = new ReadableStream({
    async start(controller) {
      const encoder = new TextEncoder();
      function send(event: string, data: unknown) {
        controller.enqueue(
          encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`),
        );
      }

      try {
        send("placed", { characterId, entryNodeId });

        const result = await decideForCharacter(worldId, characterId);
        // 取角色名
        const loaded = loadWorld(worldId);
        const c = loaded.characters.find((x) => x.id === characterId);
        send("decision", {
          characterId,
          characterName: c?.name ?? characterId,
          action: result.action,
        });
        send("done", {
          characterId,
          tick: loaded.world.currentTick,
        });
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        send("error", { error: message, status: 500 });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}
```

- [ ] **Step 2：跑 type check**

Run: `npx tsc --noEmit`
Expected: 通过。

- [ ] **Step 3：commit**

```bash
git add src/app/api/worlds/[id]/characters/place/route.ts
git commit -m "feat(api): POST /worlds/:id/characters/place — add + immediate decide via SSE"
```

---

### Task 10：useWorldState 加 placeCharacter + 缓存模板列表

**Files:**
- Modify: `src/app/_hooks/use-world-state.ts`

- [ ] **Step 1：加 templates state + 拉取**

在 hook 顶部 state 列表中加：

```ts
  const [templates, setTemplates] = useState<Array<{ id: string; name: string; avatar: string | null }>>([]);
```

在 hook 第一个 useEffect（refresh 触发）后追加：

```ts
  useEffect(() => {
    fetch("/api/configs/characters")
      .then((r) => r.json())
      .then((d) => {
        if (Array.isArray(d.characters)) {
          setTemplates(
            d.characters.map((c: { id: string; name: string; avatar?: string | null }) => ({
              id: c.id,
              name: c.name,
              avatar: c.avatar ?? null,
            })),
          );
        }
      })
      .catch(() => { /* 静默 */ });
  }, []);
```

- [ ] **Step 2：加 placeCharacter（SSE 复用 advance 的解析骨架）**

在 hook 内 stopAuto 之后追加：

```ts
  const placeCharacter = useCallback(
    async (characterId: string): Promise<boolean> => {
      if (loading || autoMode?.running) return false;
      setLoading(true);
      try {
        const res = await fetch(`/api/worlds/${worldId}/characters/place`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ characterId }),
        });
        if (!res.ok) {
          let msg = `place ${res.status}`;
          try {
            const body = await res.json();
            if (body.error) msg = body.error;
          } catch { /* ignore */ }
          throw new Error(msg);
        }
        const reader = res.body?.getReader();
        if (!reader) throw new Error("no response body");
        const decoder = new TextDecoder();
        let buffer = "";
        let placed = false;
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const parts = buffer.split("\n\n");
          buffer = parts.pop() ?? "";
          for (const part of parts) {
            const lines = part.split("\n");
            let eventType = "";
            let dataStr = "";
            for (const line of lines) {
              if (line.startsWith("event: ")) eventType = line.slice(7);
              else if (line.startsWith("data: ")) dataStr = line.slice(6);
            }
            if (!dataStr) continue;
            const data = JSON.parse(dataStr);
            if (eventType === "placed" || eventType === "decision") {
              placed = true;
            } else if (eventType === "error") {
              throw new Error(data.error ?? "unknown");
            }
          }
        }
        await refresh();
        return placed;
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
        return false;
      } finally {
        setLoading(false);
      }
    },
    [loading, autoMode, worldId, refresh],
  );
```

- [ ] **Step 3：扩展 UseWorldState 返回**

修改 interface 和 return：

```ts
  templates: Array<{ id: string; name: string; avatar: string | null }>;
  placeCharacter: (characterId: string) => Promise<boolean>;
```

- [ ] **Step 4：type check**

Run: `npx tsc --noEmit`
Expected: 通过。

- [ ] **Step 5：commit**

```bash
git add src/app/_hooks/use-world-state.ts
git commit -m "feat(use-world-state): templates list + placeCharacter via SSE"
```

---

### Task 11：character-rail 拆 tab + 投放按钮；dashboard 透传

**Files:**
- Modify: `src/app/_components/character-rail.tsx`
- Modify: `src/app/_components/dashboard.tsx`

- [ ] **Step 1：dashboard 透传新 props**

修改 `src/app/_components/dashboard.tsx` 中 useWorldState 解构与 `<CharacterRail ... />` 处：

```tsx
const { snapshot, events, loading, error, lastTickMs, tickProgress, advance, autoMode, startAuto, stopAuto, templates, placeCharacter } = useWorldState();
```

```tsx
<CharacterRail
  characters={snapshot.characters}
  nodes={snapshot.nodes}
  selectedId={view.selectedCharacterId}
  onSelect={(c) => view.selectCharacter(c.id, c.locationId)}
  templates={templates}
  onPlace={placeCharacter}
  disabled={loading || autoMode?.running || false}
/>
```

- [ ] **Step 2：character-rail 重写**

把 `src/app/_components/character-rail.tsx` 全文改造：

```tsx
"use client";

import { useState } from "react";
import type { Character, MapNode } from "@/domain/types";
import { NPC_EMOJI, NPC_FALLBACK_EMOJI } from "../_lib/sprite";
import { indexNodes } from "../_lib/world";
import { PixelFrame } from "./pixel-frame";

function VitalBar({ label, value }: { label: string; value: number }) {
  const pct = Math.min(100, value * 10);
  const danger = value >= 7;
  const warn = value >= 4;
  const color = danger
    ? "var(--color-pixel-danger)"
    : warn
      ? "var(--color-pixel-accent)"
      : "var(--color-pixel-success)";
  return (
    <div className="flex items-center gap-1 text-game-xs">
      <span className="text-(--color-pixel-muted) w-6">{label}</span>
      <div className="flex-1 h-2 bg-(--color-pixel-bg) border border-(--color-pixel-border-dark) overflow-hidden">
        <div
          className="h-full"
          style={{ width: `${pct}%`, background: color }}
        />
      </div>
      <span className="w-3 text-right text-(--color-pixel-fg)">{value}</span>
    </div>
  );
}

interface Template {
  id: string;
  name: string;
  avatar: string | null;
}

export function CharacterRail({
  characters,
  nodes,
  selectedId,
  onSelect,
  templates,
  onPlace,
  disabled,
}: {
  characters: Character[];
  nodes: MapNode[];
  selectedId: string | null;
  onSelect: (c: Character) => void;
  templates: Template[];
  onPlace: (characterId: string) => Promise<boolean>;
  disabled: boolean;
}) {
  const [tab, setTab] = useState<"in" | "out">("in");
  const [placingId, setPlacingId] = useState<string | null>(null);
  const nodeById = indexNodes(nodes);
  const inSceneIds = new Set(characters.map((c) => c.id));
  const offSceneTemplates = templates.filter((t) => !inSceneIds.has(t.id));

  async function handlePlace(id: string) {
    if (disabled || placingId) return;
    setPlacingId(id);
    try {
      await onPlace(id);
    } finally {
      setPlacingId(null);
    }
  }

  return (
    <PixelFrame
      title={
        <span className="flex items-center gap-2">
          <button
            onClick={() => setTab("in")}
            className={
              "px-2 py-0.5 text-game-xs " +
              (tab === "in"
                ? "text-(--color-pixel-accent) border-b border-(--color-pixel-accent)"
                : "text-(--color-pixel-muted) hover:text-(--color-pixel-fg)")
            }
          >
            在场 ({characters.length})
          </button>
          <button
            onClick={() => setTab("out")}
            className={
              "px-2 py-0.5 text-game-xs " +
              (tab === "out"
                ? "text-(--color-pixel-accent) border-b border-(--color-pixel-accent)"
                : "text-(--color-pixel-muted) hover:text-(--color-pixel-fg)")
            }
          >
            未入场 ({offSceneTemplates.length})
          </button>
        </span>
      }
      className="flex flex-col h-full min-h-0 overflow-hidden"
    >
      {tab === "in" ? (
        <ul className="flex-1 min-h-0 overflow-y-auto pixel-scroll p-2 space-y-2">
          {characters.map((c) => {
            const here = nodeById.get(c.locationId);
            const selected = c.id === selectedId;
            return (
              <li key={c.id}>
                <button
                  type="button"
                  onClick={() => onSelect(c)}
                  className={`w-full text-left p-2 flex gap-2 items-start border-2 transition-colors ${
                    selected
                      ? "border-(--color-pixel-accent) bg-(--color-pixel-bg-2)"
                      : "border-(--color-pixel-border-dark) bg-(--color-pixel-bg) hover:bg-(--color-pixel-bg-2)"
                  }`}
                >
                  <span
                    className={`npc-chip ${selected ? "npc-chip--selected" : ""}`}
                  >
                    {NPC_EMOJI[c.id] ?? NPC_FALLBACK_EMOJI}
                  </span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-baseline gap-1">
                      <span className="text-game-base text-(--color-pixel-fg) truncate">
                        {c.name}
                      </span>
                    </div>
                    <div className="text-game-xs text-(--color-pixel-muted) truncate">
                      @ {here?.name ?? c.locationId}
                    </div>
                    <div className="mt-1 space-y-0.5">
                      <VitalBar label="饿" value={c.vitals.hunger} />
                      <VitalBar label="累" value={c.vitals.fatigue} />
                    </div>
                  </div>
                </button>
              </li>
            );
          })}
        </ul>
      ) : (
        <ul className="flex-1 min-h-0 overflow-y-auto pixel-scroll p-2 space-y-2">
          {offSceneTemplates.length === 0 ? (
            <li className="text-game-xs text-(--color-pixel-muted) p-2">
              所有角色都已入场。
            </li>
          ) : (
            offSceneTemplates.map((t) => {
              const isPlacing = placingId === t.id;
              return (
                <li key={t.id}>
                  <div className="w-full text-left p-2 flex gap-2 items-center border-2 border-(--color-pixel-border-dark) bg-(--color-pixel-bg)">
                    <span className="npc-chip">
                      {NPC_EMOJI[t.id] ?? NPC_FALLBACK_EMOJI}
                    </span>
                    <span className="flex-1 text-game-base text-(--color-pixel-fg) truncate">
                      {t.name}
                    </span>
                    <button
                      type="button"
                      onClick={() => void handlePlace(t.id)}
                      disabled={disabled || placingId !== null}
                      className="px-2 py-0.5 text-game-xs border border-(--color-pixel-accent) text-(--color-pixel-accent) hover:bg-(--color-pixel-bg-2) disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                      {isPlacing ? "投放中…" : "投放 ▶"}
                    </button>
                  </div>
                </li>
              );
            })
          )}
        </ul>
      )}
    </PixelFrame>
  );
}
```

- [ ] **Step 3：核对 PixelFrame 是否接受 ReactNode 作为 title**

Run: `head -40 src/app/_components/pixel-frame.tsx`
Expected: 看到 `title?: string | ReactNode` 或 `title?: ReactNode`。如果只接受 string，把 PixelFrame 接口扩成 ReactNode（或 `string | ReactNode`），同时 head 渲染逻辑兼容；这是最小改动。

如果 PixelFrame 当前只支持 string title，改它的 props 类型：
```ts
title?: string | React.ReactNode;
```

- [ ] **Step 4：手测**

Start dev server: `npm run dev`，开 `http://localhost:3000/`。

Expected:
1. 角色栏标题区出现 "在场 (12)" / "未入场 (N)" 两个 tab。
2. 切到「未入场」→ 出现剩下的角色模板（没在 cast 中的那些），每行有 emoji + 名字 + "投放 ▶"。
3. 点 "投放 ▶" → 按钮变 "投放中…"；网络面板看到 SSE 事件 placed → decision → done；几秒后角色出现在地图入口节点；事件流出现两条新事件（"出现在了入口处" + 该角色 reasoning 中的来由）。
4. 自动模式中 / loading 中 → "投放" 按钮 disabled。

- [ ] **Step 5：commit**

```bash
git add src/app/_components/character-rail.tsx src/app/_components/dashboard.tsx src/app/_components/pixel-frame.tsx
git commit -m "feat(character-rail): split into in-scene / off-scene tabs with placement"
```

---

## Self-Review

**1. Spec 覆盖：**

| Spec 要求 | 任务 |
|---|---|
| settings 增加 language 字段 | Task 1 |
| /api/admin/settings GET/POST 接受 language | Task 1 |
| prompt.ts languageInstruction(zh/en/ja) | Task 2 |
| 跨语言记忆提示 | Task 2 |
| 移除 schema.ts 中硬编码语言 | Task 2 |
| decide.ts 注入 language | Task 3 |
| admin 顶栏 select | Task 4 |
| advance 返回 boolean | Task 5 |
| autoMode + startAuto/stopAuto | Task 5 |
| top-bar 自动 24h + 停止 | Task 6 |
| arrivalIntro 段（zh/en/ja） | Task 7 |
| decideForCharacter 引擎入口 | Task 8 |
| /api/worlds/:id/characters/place SSE | Task 9 |
| useWorldState placeCharacter + 模板列表 | Task 10 |
| character-rail 拆 tab + 投放 | Task 11 |
| 自动模式禁用投放 | Task 11（disabled prop） |

全覆盖。

**2. Placeholder 扫描：** 无 TBD/TODO；所有代码块直接给出。

**3. 类型一致性：**
- `Language` 类型在 `engine/settings.ts` 定义，被 prompt.ts 与 decide.ts import — 一致。
- `autoMode` shape 在 useWorldState 与 TopBar 一致：`{ running; total; done } | null`。
- `placeCharacter` 返回 `Promise<boolean>` 一致。

**4. 歧义检查：**
- decideForCharacter 中"测试 stub"分支不会传 arrivalIntro，因为测试自然会构造 buildUserPrompt 时自己控制；真实 LLM 分支在 inline 内显式调 `arrivalIntro: true`——这是有意为之，已在文末注释说明。
- `stopAuto` 在循环中检查 `shouldStopRef`，循环 break 后 finally 块清空 autoMode；这与"等当前 tick 完成"的需求一致。

---

## 执行交付

Plan complete and saved to `docs/superpowers/plans/2026-05-02-language-character-tabs-autotick.md`. Two execution options:

**1. Subagent-Driven (recommended)** — I dispatch a fresh subagent per task, review between tasks, fast iteration

**2. Inline Execution** — Execute tasks in this session using executing-plans, batch execution with checkpoints

哪种？
