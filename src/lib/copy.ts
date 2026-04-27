/**
 * Centralised UK-English copy dictionary.
 *
 * All user-facing strings should live here so we have one place to:
 *   - audit for tone & UK spelling (en-GB)
 *   - update copy without hunting through components
 *   - prevent US English creeping in via ad-hoc strings
 *
 * Rules for contributors:
 *   - Use UK spellings: organisation, behaviour, programme, optimise, centre…
 *   - Avoid Americanisms: "reach out", "gotten", "awesome".
 *   - Keep tone direct, professional, concise. No sales hype.
 *   - Group keys by surface (auth, dashboard, wizard, results, upgrade…).
 *   - Prefer functions for templated strings (so call sites don't concat).
 */

export const copy = {
  common: {
    appName: "The Stretch Coach",
    cta: {
      continue: "Continue",
      back: "Back",
      next: "Next",
      cancel: "Cancel",
      save: "Save",
      skip: "Skip",
      dismiss: "Dismiss",
      retry: "Try again",
      upgrade: "Upgrade",
      getStarted: "Get started",
      signIn: "Sign in",
      signUp: "Create account",
      signOut: "Sign out",
    },
    status: {
      loading: "Loading…",
      saving: "Saving…",
      generating: "Generating…",
      ready: "Ready",
    },
    errors: {
      generic: "Something went wrong. Please try again.",
      network: "Network error. Check your connection and try again.",
      unauthorised: "You need to sign in to continue.",
      upgradeRequired: "This is a Pro feature. Upgrade to continue.",
    },
  },

  auth: {
    signInTitle: "Welcome back",
    signUpTitle: "Create your account",
    emailLabel: "Email",
    passwordLabel: "Password",
    fullNameLabel: "Full name",
    forgotPassword: "Forgot password?",
    googleContinue: "Continue with Google",
    haveAccount: "Already have an account?",
    noAccount: "Don't have an account?",
  },

  dashboard: {
    title: "Your prep sessions",
    empty: "No sessions yet. Start your first prep to see it here.",
    newSession: "New prep session",
    planLabel: (plan: string) => `Current plan: ${plan}`,
  },

  wizard: {
    stepCv: "Upload your CV",
    stepRole: "Add the role",
    stepGenerate: "Generate questions",
    cvHelp: "PDF or DOCX, up to 10 MB.",
    jobUrlLabel: "Job advert URL",
    jobUrlHelp: "We'll fetch the job specification automatically.",
    pasteJobLabel: "Or paste the job description",
    generateCta: "Generate interview pack",
  },

  results: {
    title: "Your interview pack",
    coachInsightLabel: "Coach Insight",
    answerTiers: {
      foundation: "Foundation",
      strong: "Strong",
      standout: "Standout",
    },
    yourAnswerLabel: "Your answer",
    saveAnswer: "Save answer",
    questionsHeading: (n: number) => `${n} tailored questions`,
  },

  upgrade: {
    title: "Upgrade to Pro",
    subtitle: "Unlock the full prep experience.",
    proName: "Pro",
    coachPlusName: "Coach+",
    proPrice: "$29",
    proIntroPrice: "$19",
    coachPlusPrice: "$79",
    perMonth: "/month",
    sessionSavedNote:
      "This session will remain saved, but full access is limited until you upgrade.",
    socialProof:
      "Most users upgrade at this stage to complete their preparation properly.",
    softReminder:
      "Take your time — your progress is safe. Upgrade whenever you're ready.",
    upgradeCta: "Upgrade now",
    intro: {
      wallTitle: "You've seen the first 10 questions.",
      wallBody:
        "The next 90 are where the real preparation happens.\nUnlock Pro today for $19 for your first month.\nThen $29/month.",
      buttonCta: "Unlock Pro for $19",
      smallPrint: "First month only. Renews at $29/month. Cancel anytime.",
      dashboardPrompt:
        "Continue preparing with Pro. First month $19, then $29/month.",
      resultsLine:
        "Unlock Pro today for $19 for your first month. Then $29/month.",
    },
  },

  onboarding: {
    step1Title: "These are the questions you're likely to be asked",
    step1Body:
      "Every question is tailored to your CV and the role. Treat the first ten as the ones you must rehearse.",
    step2Title: "Use the answer tiers to understand structure",
    step2Body:
      "Foundation, Strong and Standout show you how an answer evolves — what's expected, what's good, and what stands out.",
    step3Title: "Then write your own answers in your own words",
    step3Body:
      "The tiers are a scaffold, not a script. Adapt the structure into your own voice so it sounds like you.",
  },
} as const;

export type Copy = typeof copy;
