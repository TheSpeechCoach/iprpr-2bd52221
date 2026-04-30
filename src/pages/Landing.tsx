import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { SiteHeader } from "@/components/SiteHeader";
import { ArrowRight, FileText, Target, Compass, Check } from "lucide-react";
import { BRAND } from "@/config/brand";

const Landing = () => {
  return (
    <div className="min-h-screen flex flex-col">
      <SiteHeader />

      {/* Hero */}
      <section className="border-b border-border">
        <div className="container-tight py-24 md:py-32">
          <div className="text-[11px] uppercase tracking-[0.2em] text-muted-foreground mb-6">
            From The Speech Coach
          </div>
          <h1 className="font-display text-5xl md:text-7xl font-semibold leading-[0.95] text-balance max-w-4xl">
            {BRAND.appName}.
          </h1>
          <p className="mt-6 max-w-xl text-lg text-muted-foreground whitespace-pre-line">
            {BRAND.tagline}
          </p>
          <div className="mt-10 flex flex-wrap gap-3">
            <Link to="/auth">
              <Button size="lg" className="bg-accent hover:bg-accent/90 text-accent-foreground">
                Start preparing <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            </Link>
            <a href="#how">
              <Button size="lg" variant="outline">See how it works</Button>
            </a>
          </div>
        </div>
      </section>

      {/* Features */}
      <section id="features" className="border-b border-border py-24">
        <div className="container-tight">
          <div className="grid md:grid-cols-3 gap-px bg-border">
            {[
              { icon: FileText, title: "50 tailored questions", body: "Generated against your CV and the exact job specification — never generic." },
              { icon: Target, title: "Role-specific practice", body: "Behavioural, technical, leadership and commercial — weighted to your level." },
              { icon: Compass, title: "Answer angle guidance", body: "What good answers cover, why each question matters, and probing follow-ups." },
            ].map((f) => (
              <div key={f.title} className="bg-background p-10">
                <f.icon className="h-6 w-6" strokeWidth={1.5} />
                <h3 className="mt-6 font-display text-xl font-semibold">{f.title}</h3>
                <p className="mt-2 text-muted-foreground text-sm leading-relaxed">{f.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* How it works */}
      <section id="how" className="border-b border-border py-24 bg-secondary/30">
        <div className="container-tight">
          <div className="max-w-2xl">
            <div className="text-[11px] uppercase tracking-[0.2em] text-muted-foreground mb-4">How it works</div>
            <h2 className="font-display text-4xl font-semibold">Four steps to a sharper interview.</h2>
          </div>
          <div className="mt-16 grid md:grid-cols-4 gap-12">
            {[
              ["01", "Upload", "Drop your CV in PDF or DOCX. We extract it securely."],
              ["02", "Add the role", "Paste the job spec, link to a public posting, or describe it."],
              ["03", "Generate", "Receive 100 questions tailored to you and the role."],
              ["04", "Practise", "Time yourself, save notes, and refine your answers."],
            ].map(([num, title, body]) => (
              <div key={num}>
                <div className="font-display text-3xl text-accent">{num}</div>
                <h3 className="mt-4 font-display text-lg font-semibold">{title}</h3>
                <p className="mt-2 text-sm text-muted-foreground">{body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Who for */}
      <section className="border-b border-border py-24">
        <div className="container-tight">
          <div className="grid md:grid-cols-2 gap-16">
            <div>
              <div className="text-[11px] uppercase tracking-[0.2em] text-muted-foreground mb-4">Built for</div>
              <h2 className="font-display text-4xl font-semibold">Anyone who treats the interview as a craft.</h2>
            </div>
            <div className="grid grid-cols-2 gap-y-4 text-sm">
              {["Executives", "Senior professionals", "Hiring managers", "Career changers", "Graduates", "Returners", "Consultants", "Founders"].map((x) => (
                <div key={x} className="flex items-center gap-2"><Check className="h-3.5 w-3.5 text-accent" />{x}</div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* Testimonials */}
      <section className="border-b border-border py-24 bg-secondary/30">
        <div className="container-tight">
          <div className="grid md:grid-cols-3 gap-8">
            {[
              ["“The questions felt like they came from the actual panel. I walked in calm.”", "Director, Financial Services"],
              ["“Took my prep from generic to surgical. The probing follow-ups were the best part.”", "Head of Product, SaaS"],
              ["“Helped me articulate my career pivot clearly. Got the offer.”", "Career changer, London"],
            ].map(([quote, attrib]) => (
              <figure key={attrib} className="bg-background border border-border p-8">
                <blockquote className="font-display text-lg leading-snug">{quote}</blockquote>
                <figcaption className="mt-6 text-xs uppercase tracking-widest text-muted-foreground">{attrib}</figcaption>
              </figure>
            ))}
          </div>
        </div>
      </section>

      {/* Pricing */}
      <section id="pricing" className="border-b border-border py-24">
        <div className="container-tight">
          <div className="max-w-2xl mb-12">
            <div className="text-[11px] uppercase tracking-[0.2em] text-muted-foreground mb-4">Pricing</div>
            <h2 className="font-display text-4xl font-semibold">Choose your level of preparation.</h2>
          </div>
          <div className="grid md:grid-cols-3 gap-px bg-border">
            {[
              { name: "Free", price: "$0", desc: "Try it once.", features: ["1 prep session", "10 questions", "Read in-app"] },
              { name: "Pro", price: "$29", desc: "For serious candidates.", features: ["Unlimited sessions", "100 questions per role", "Practice mode", "PDF & DOCX export", "Saved history"], featured: true },
              { name: "Coach+", price: "$79", desc: "For executives & coaches.", features: ["Everything in Pro", "AI answer guidance", "Practice analytics", "Premium templates", "Priority support"] },
            ].map((p) => (
              <div key={p.name} className={`bg-background p-8 ${p.featured ? "ring-1 ring-foreground" : ""}`}>
                {p.featured && <div className="text-[10px] uppercase tracking-widest text-accent mb-3">Most popular</div>}
                <h3 className="font-display text-2xl font-semibold">{p.name}</h3>
                <div className="mt-2 font-display text-4xl font-semibold">{p.price}<span className="text-sm text-muted-foreground font-normal">/mo</span></div>
                <p className="mt-2 text-sm text-muted-foreground">{p.desc}</p>
                <ul className="mt-6 space-y-2 text-sm">
                  {p.features.map((f) => <li key={f} className="flex gap-2"><Check className="h-4 w-4 text-accent shrink-0 mt-0.5" />{f}</li>)}
                </ul>
                <Link to="/auth" className="block mt-8">
                  <Button variant={p.featured ? "default" : "outline"} className="w-full">Get started</Button>
                </Link>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="py-12 mt-auto">
        <div className="container-tight flex flex-col md:flex-row justify-between gap-6 text-sm text-muted-foreground">
          <div>
            <div className="font-display font-semibold text-foreground">{BRAND.appName}</div>
            <p className="mt-2 text-xs whitespace-pre-line max-w-xs">{BRAND.tagline}</p>
            <div className="text-xs mt-3">© {new Date().getFullYear()} The Speech Coach. All rights reserved.</div>
          </div>
          <nav className="flex gap-6 text-xs">
            <a href="#" className="hover:text-foreground">Privacy</a>
            <a href="#" className="hover:text-foreground">Terms</a>
            <a href="#" className="hover:text-foreground">Contact</a>
          </nav>
        </div>
      </footer>
    </div>
  );
};

export default Landing;
