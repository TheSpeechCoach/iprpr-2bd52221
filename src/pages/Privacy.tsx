import { SiteHeader } from "@/components/SiteHeader";
import { BRAND } from "@/config/brand";

const Privacy = () => (
  <div className="min-h-screen flex flex-col">
    <SiteHeader />
    <main className="container-tight py-16">
      <h1 className="font-display text-4xl font-semibold mb-4">Privacy Policy</h1>
      <p className="text-muted-foreground">
        This page is coming soon. For any queries, contact {BRAND.supportEmail}.
      </p>
    </main>
  </div>
);

export default Privacy;
