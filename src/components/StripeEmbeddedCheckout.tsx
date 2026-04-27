import { EmbeddedCheckoutProvider, EmbeddedCheckout } from "@stripe/react-stripe-js";
import { getStripe, getStripeEnvironment } from "@/lib/stripe";
import { supabase } from "@/integrations/supabase/client";

interface Props {
  priceId: string;
  returnUrl?: string;
  /**
   * Apply the Pro first-month intro offer ($19 first invoice, then $29/month).
   * Server re-validates eligibility — never trust the client.
   */
  introOffer?: boolean;
}

export function StripeEmbeddedCheckout({ priceId, returnUrl, introOffer }: Props) {
  const fetchClientSecret = async (): Promise<string> => {
    const finalReturn =
      returnUrl ||
      `${window.location.origin}/dashboard?checkout=success&session_id={CHECKOUT_SESSION_ID}`;
    const { data, error } = await supabase.functions.invoke("create-checkout", {
      body: {
        priceId,
        returnUrl: finalReturn,
        environment: getStripeEnvironment(),
        ...(introOffer && { introOffer: true }),
      },
    });
    if (error || !data?.clientSecret) {
      throw new Error(error?.message || "Failed to create checkout session");
    }
    return data.clientSecret as string;
  };

  return (
    <div id="checkout">
      <EmbeddedCheckoutProvider stripe={getStripe()} options={{ fetchClientSecret }}>
        <EmbeddedCheckout />
      </EmbeddedCheckoutProvider>
    </div>
  );
}
