/**
 * Centralised pricing constants and eligibility logic.
 *
 * Display prices are USD only and must not be auto-converted.
 * The intro offer is a UX hint — server-side `is_eligible_for_pro_intro_offer`
 * RPC remains the source of truth before any discount is applied at checkout.
 */
export const PRICING = {
  free: {
    name: "Free",
    price: 0,
    interval: "month",
    displayPrice: "$0/month",
  },
  pro: {
    name: "Pro",
    price: 29,
    interval: "month",
    displayPrice: "$29/month",
    introOffer: {
      price: 19,
      displayPrice: "$19 first month",
      renewsAt: "$29/month",
      eligibleOnly: true,
    },
  },
  coach_plus: {
    name: "Coach+",
    price: 79,
    interval: "month",
    displayPrice: "$79/month",
  },
} as const;

export function isEligibleForProIntroOffer({
  plan,
  prepSessionCount,
  hasReachedQuestionLimit,
  proIntroOfferRedeemed,
}: {
  plan: "free" | "pro" | "coach_plus";
  prepSessionCount: number;
  hasReachedQuestionLimit: boolean;
  proIntroOfferRedeemed: boolean;
}) {
  return (
    plan === "free" &&
    prepSessionCount >= 1 &&
    hasReachedQuestionLimit &&
    !proIntroOfferRedeemed
  );
}
