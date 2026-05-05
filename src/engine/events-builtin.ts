import type { GlobalEventDef } from "@/domain/events";

export const BUILTIN_EVENTS: GlobalEventDef[] = [
  {
    id: "new-year",
    name: "新年",
    description:
      "一年之始，万象更新。街上张灯结彩，人们互相拜年问候。初诣的钟声回荡在城市上空，家家户户享用着御节料理。",
    start: "01-01",
    end: "01-03",
  },
];
