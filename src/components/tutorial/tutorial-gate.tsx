"use client";

import { useState } from "react";
import { GraduationCap } from "lucide-react";
import { useI18n } from "@/components/i18n-provider";
import { TutorialOverlay } from "@/components/tutorial/tutorial-overlay";
import {
  completeTutorialAction,
  resetTutorialAction,
  skipTutorialAction,
} from "@/app/actions/onboarding";
import type { OnboardingState } from "@/lib/onboarding";

/**
 * Server-state-driven tutorial gate: renders the overlay exactly when the
 * onboarding row for the logged-in user is still "pending" (first login of the
 * account, per version). Completion/Skipping is persisted in the DATABASE, so
 * a refresh — or another device — never shows the tour again.
 */
export function TutorialGate({ state }: { state: OnboardingState | null }) {
  const [visible, setVisible] = useState(state?.status === "pending");

  if (!visible || !state) return null;
  return (
    <TutorialOverlay
      onComplete={() => {
        setVisible(false);
        void completeTutorialAction({});
      }}
      onSkip={() => {
        setVisible(false);
        void skipTutorialAction({});
      }}
    />
  );
}

/** "Replay the tour" affordance used on the settings page. */
export function ReplayTutorialButton() {
  const { t } = useI18n();
  return (
    <button
      type="button"
      className="btn btn-secondary btn-sm"
      onClick={() => {
        // Mark pending server-side, then hard-navigate so the layout re-renders
        // the gate with fresh onboarding state.
        void (async () => {
          await resetTutorialAction({});
          window.location.href = "/dashboard";
        })();
      }}
    >
      <GraduationCap className="size-4" />
      {t.tutorial.replay}
    </button>
  );
}
