export type Plan = "free" | "pro" | "coach_plus";

export const PLAN_LIMITS = {
  free: {
    maxPrepSessions: 1,
    visibleQuestions: 10,
    answerTiers: false,
    savedAnswers: false,
    exports: false,
    realityCheck: false,
    priorityGeneration: false,
  },
  pro: {
    maxPrepSessions: Infinity,
    visibleQuestions: 100,
    answerTiers: true,
    savedAnswers: true,
    exports: true,
    realityCheck: false,
    priorityGeneration: false,
  },
  coach_plus: {
    maxPrepSessions: Infinity,
    visibleQuestions: 100,
    answerTiers: true,
    savedAnswers: true,
    exports: true,
    realityCheck: true,
    priorityGeneration: true,
  },
} as const;

export type PlanFeature = keyof typeof PLAN_LIMITS.free;

export function canAccessQuestion(plan: Plan, questionIndex: number) {
  return questionIndex < PLAN_LIMITS[plan].visibleQuestions;
}

export function canUseFeature(plan: Plan, feature: PlanFeature) {
  return Boolean(PLAN_LIMITS[plan][feature]);
}
