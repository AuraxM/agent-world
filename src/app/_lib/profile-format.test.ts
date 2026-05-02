import { describe, expect, it } from "vitest";
import { affectionTone, formatActionWindow, vitalThreshold } from "./profile-format";
import type { OngoingAction } from "@/domain/types";

describe("vitalThreshold", () => {
  it("returns ok when value below warn", () => {
    expect(vitalThreshold(5, 10, 6)).toBe("ok");
  });

  it("returns warn at exactly warn threshold", () => {
    expect(vitalThreshold(6, 10, 6)).toBe("warn");
  });

  it("returns warn between warn and danger", () => {
    expect(vitalThreshold(8, 10, 6)).toBe("warn");
  });

  it("returns danger at exactly danger threshold", () => {
    expect(vitalThreshold(10, 10, 6)).toBe("danger");
  });

  it("returns danger above danger threshold", () => {
    expect(vitalThreshold(15, 10, 6)).toBe("danger");
  });

  it("returns ok at zero", () => {
    expect(vitalThreshold(0, 10, 6)).toBe("ok");
  });
});

describe("affectionTone", () => {
  it("returns pos for positive values", () => {
    expect(affectionTone(3)).toBe("pos");
    expect(affectionTone(1)).toBe("pos");
  });

  it("returns neg for negative values", () => {
    expect(affectionTone(-1)).toBe("neg");
    expect(affectionTone(-4)).toBe("neg");
  });

  it("returns zero for zero", () => {
    expect(affectionTone(0)).toBe("zero");
  });
});

function mkAction(partial: Partial<OngoingAction> = {}): OngoingAction {
  return {
    type: "sleep",
    startedAt: 12,
    endsAt: 19,
    description: "在 张默家 睡觉",
    interruptThreshold: 3,
    ...partial,
  };
}

describe("formatActionWindow", () => {
  it("formats normal sleep window", () => {
    expect(formatActionWindow(mkAction())).toBe("在 张默家 睡觉 (t12→t19)");
  });

  it("formats instant action where endsAt equals startedAt", () => {
    expect(
      formatActionWindow(mkAction({ startedAt: 5, endsAt: 5, description: "等待" })),
    ).toBe("等待 (t5→t5)");
  });

  it("preserves arbitrary description text", () => {
    expect(
      formatActionWindow(
        mkAction({ description: "走去 学校 (3 步)", startedAt: 0, endsAt: 3 }),
      ),
    ).toBe("走去 学校 (3 步) (t0→t3)");
  });
});
