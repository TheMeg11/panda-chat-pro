import { describe, expect, it } from "vitest";
import { TUTORIAL_STEPS } from "@/components/tutorial/tutorial-overlay";
import { dictionaries } from "@/lib/i18n";

describe("interactive tutorial (§5)", () => {
  it("covers all 8 required sections from the mission", () => {
    const targets = TUTORIAL_STEPS.map((s) => s.target);
    expect(targets).toEqual([
      "chat-list",
      "user-search",
      "new-chat",
      "composer",
      "rooms",
      "online-status",
      "vault",
      "security",
    ]);
  });

  it("every step has a title and text in BOTH languages", () => {
    for (const step of TUTORIAL_STEPS) {
      const titleKey = step.titleKey.replace("tutorial.steps.", "");
      const textKey = step.textKey.replace("tutorial.steps.", "");
      for (const lang of ["en", "fa"] as const) {
        const steps = (dictionaries[lang].tutorial as { steps: Record<string, string> }).steps;
        expect(steps[titleKey], `${lang} title for ${titleKey}`).toBeTruthy();
        expect(steps[textKey], `${lang} text for ${textKey}`).toBeTruthy();
        expect(steps[textKey].length).toBeGreaterThan(20); // real guidance, not a stub
      }
    }
  });

  it("uses element targets that exist as data-tutorial attributes in the app", async () => {
    const { execFileSync } = await import("node:child_process");
    const source = execFileSync("grep", ["-rho", "data-tutorial=\"[a-z-]*\"", "src", "--include=*.tsx"], { encoding: "utf8" });
    const present = new Set(source.split("\n").filter(Boolean).map((l) => l.replace('data-tutorial="', "").replace('"', "")));
    for (const step of TUTORIAL_STEPS) {
      expect(present.has(step.target), `data-tutorial="${step.target}" must exist in the UI`).toBe(true);
    }
  });
});
