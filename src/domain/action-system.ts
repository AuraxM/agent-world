import type { AggregatedFacts } from "@/engine/facts";
import type { Character, MapNode } from "./types";
import type { EventCategory, EventScope } from "./enums";

// ---- ActionInput: LLM tool-call params, passed to execute() ----

export interface ActionInput {
  target_id?: string;
  target_node_id?: string;
  free_text?: string;
  reason?: string;
  amount?: number;
  arrival_action?: {
    action_type: string;
    free_text?: string;
    target_id?: string;
    target_node_id?: string;
  };
  [key: string]: unknown;
}

// ---- ActionContext: the world snapshot at decision time ----

export interface ActionContext {
  worldId: string;
  tick: number;
  self: Character;
  here: MapNode;
  companions: Character[];
  reachable: MapNode[];
  isSleepHour: boolean;
  facts: AggregatedFacts;
}

// ---- Outcome: what the action produced ----

export interface Outcome {
  memory: string;
  event?: {
    category: EventCategory;
    description: string;
    intensity?: 1 | 2 | 3 | 4 | 5;
    scope?: EventScope;
  };
  stateChanges?: StateChange[];
  dialogRequest?: {
    targetId: string;
    openingLine: string;
  };
}

// ---- StateChange: declarative side effects ----

export type StateChange =
  | { kind: "resetVital"; vital: "hunger" | "fatigue" | "hygiene" }
  | { kind: "adjustVital"; vital: "hunger" | "fatigue" | "hygiene"; delta: number }
  | { kind: "setLocation"; nodeId: string }
  | { kind: "adjustMood"; delta: number }
  | { kind: "adjustStress"; delta: number }
  | { kind: "setOngoingAction"; action: import("./types").OngoingAction }
  | { kind: "clearOngoingAction" }
  | { kind: "adjustMoney"; amount: number; reason: string };

// ---- ActionOption: presented to LLM ----

export interface ActionOption {
  type: string;
  hint: string;
  targetId?: string;
  targetNodeId?: string;
}

// ---- ActionDefinition: the core interface ----

export interface ActionDefinition {
  type: string;
  duration: "instant" | number;

  check(ctx: ActionContext): boolean;
  hint(ctx: ActionContext): string | Array<{ hint: string; targetId?: string; targetNodeId?: string }>;

  execute(ctx: ActionContext, input: ActionInput): Outcome;

  /** 校验 LLM 提供的参数。返回 null 表示合法，否则返回错误信息字符串（会反馈给 LLM 重试）。 */
  validateParams?(input: ActionInput, ctx: ActionContext): string | null;

  onTick?(ctx: ActionContext): Outcome | null;
  onComplete?(ctx: ActionContext): Outcome;
  onInterrupt?(ctx: ActionContext, reason: string): Outcome;

  /**
   * 专属 tool 参数 JSON Schema properties（不含 reasoning/self_importance/emotion_tag 公共字段）。
   * 不提供时 tool 只有公共参数。
   */
  extraParams?: Record<string, unknown>;
  /** extraParams 中必填字段名列表。 */
  extraRequired?: string[];
}

// ---- ActionRegistry ----

export class ActionRegistry {
  private _defs = new Map<string, ActionDefinition>();

  register(def: ActionDefinition): void {
    this._defs.set(def.type, def);
  }

  registerAll(defs: ActionDefinition[]): void {
    for (const d of defs) this.register(d);
  }

  has(type: string): boolean {
    return this._defs.has(type);
  }

  get(type: string): ActionDefinition | undefined {
    return this._defs.get(type);
  }

  types(): IterableIterator<string> {
    return this._defs.keys();
  }

  buildOptions(ctx: ActionContext): ActionOption[] {
    const opts: ActionOption[] = [];
    for (const [type, def] of this._defs) {
      if (!def.check(ctx)) continue;
      const hint = def.hint(ctx);
      if (Array.isArray(hint)) {
        for (const h of hint) {
          opts.push({ type, hint: h.hint, targetId: h.targetId, targetNodeId: h.targetNodeId });
        }
      } else {
        opts.push({ type, hint });
      }
    }
    return opts;
  }
}

/** Global singleton. */
export const actionRegistry = new ActionRegistry();
