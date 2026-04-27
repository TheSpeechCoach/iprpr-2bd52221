import { createClient } from "npm:@supabase/supabase-js@2";
import { type StripeEnv, createStripeClient } from "../_shared/stripe.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

// Stable lookup key for the Pro intro coupon ($10 off once → $19 first month).
// Created lazily on first use; reused thereafter.
const INTRO_COUPON_LOOKUP_KEY = "pro_first_month_offer";

async function getOrCreateIntroCoupon(stripe: ReturnType<typeof createStripeClient>) {
  // Coupons don't have lookup_keys; use a stable id per env.
  // `coupon.id` is user-defined and unique per Stripe account.
  const couponId = INTRO_COUPON_LOOKUP_KEY;
  try {
    return await stripe.coupons.retrieve(couponId);
  } catch (_e) {
    // Not found → create. $10 off, applied once (first invoice only),
    // explicitly USD so it can only be applied to USD prices.
    return await stripe.coupons.create({
      id: couponId,
      name: "Pro first month offer",
      amount_off: 1000,
      currency: "usd",
      duration: "once",
    });
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405, headers: corsHeaders });
  }

  try {
    const body = await req.json();
    const { priceId, returnUrl, environment, introOffer } = body as {
      priceId: string;
      returnUrl: string;
      environment: StripeEnv;
      introOffer?: boolean;
    };

    if (!priceId || !/^[a-zA-Z0-9_-]+$/.test(priceId)) throw new Error("Invalid priceId");
    if (environment !== "sandbox" && environment !== "live") throw new Error("Invalid environment");

    // Identify the user. Intro offer requires an authenticated user so we can
    // verify eligibility server-side.
    const authHeader = req.headers.get("Authorization");
    let userId: string | undefined;
    let customerEmail: string | undefined;
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );
    if (authHeader?.startsWith("Bearer ")) {
      const { data } = await supabase.auth.getUser(authHeader.replace("Bearer ", ""));
      if (data.user) {
        userId = data.user.id;
        customerEmail = data.user.email ?? undefined;
      }
    }

    // Server-side eligibility check for the intro offer. Never trust the client.
    let applyIntro = false;
    if (introOffer) {
      if (!userId) throw new Error("Sign in required for the intro offer");
      if (priceId !== "pro_monthly") {
        throw new Error("Intro offer only applies to Pro monthly");
      }
      const { data: eligible, error: eligErr } = await supabase.rpc(
        "is_eligible_for_pro_intro_offer",
        { _user_id: userId },
      );
      if (eligErr) throw new Error(`Eligibility check failed: ${eligErr.message}`);
      applyIntro = !!eligible;
      if (!applyIntro) {
        throw new Error("Not eligible for the intro offer");
      }
    }

    const stripe = createStripeClient(environment);
    const prices = await stripe.prices.list({ lookup_keys: [priceId], limit: 1 });
    if (!prices.data.length) throw new Error("Price not found");
    const stripePrice = prices.data[0];
    const isRecurring = stripePrice.type === "recurring";

    // Build the session payload. The intro offer is implemented as a one-time
    // $10 coupon attached to the first invoice — Stripe automatically renews
    // at the full $29 list price afterwards.
    let discounts: { coupon: string }[] | undefined;
    if (applyIntro) {
      const coupon = await getOrCreateIntroCoupon(stripe);
      discounts = [{ coupon: coupon.id }];
    }

    const session = await stripe.checkout.sessions.create({
      line_items: [{ price: stripePrice.id, quantity: 1 }],
      mode: isRecurring ? "subscription" : "payment",
      ui_mode: "embedded",
      return_url: returnUrl,
      ...(discounts && { discounts }),
      ...(customerEmail && { customer_email: customerEmail }),
      ...(userId && {
        metadata: {
          userId,
          ...(applyIntro && { intro_offer: "pro_first_month" }),
        },
        ...(isRecurring && {
          subscription_data: {
            metadata: {
              userId,
              ...(applyIntro && { intro_offer: "pro_first_month" }),
            },
          },
        }),
      }),
    });

    return new Response(JSON.stringify({ clientSecret: session.client_secret }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 200,
    });
  } catch (e) {
    console.error("create-checkout error:", e);
    return new Response(JSON.stringify({ error: (e as Error).message }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
