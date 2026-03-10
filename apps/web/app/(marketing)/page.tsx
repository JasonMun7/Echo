import dynamic from "next/dynamic";
import Hero from "@/components/marketing/hero";
import { getSEOTags } from "@/lib/seo";

const LogoCloud = dynamic(() =>
  import("@/components/marketing/logo-cloud").then((m) => ({
    default: m.LogoCloud,
  })),
);
const FeaturesOne = dynamic(() =>
  import("@/components/marketing/features-one").then((m) => ({
    default: m.FeaturesOne,
  })),
);
const FeaturesTwo = dynamic(() =>
  import("@/components/marketing/features-two").then((m) => ({
    default: m.FeaturesTwo,
  })),
);
const Testimonials = dynamic(() =>
  import("@/components/marketing/testimonials").then((m) => ({
    default: m.Testimonials,
  })),
);
const Pricing = dynamic(() =>
  import("@/components/marketing/pricing").then((m) => ({
    default: m.Pricing,
  })),
);
const FAQs = dynamic(() =>
  import("@/components/marketing/faqs").then((m) => ({ default: m.FAQs })),
);
const CTA = dynamic(() =>
  import("@/components/marketing/cta").then((m) => ({ default: m.CTA })),
);

export const metadata = getSEOTags();

export default function MarketingHomePage() {
  return (
    <main>
      <Hero />
      <LogoCloud />
      <FeaturesOne />
      <Testimonials />
      <FeaturesTwo />
      <Pricing />
      <FAQs />
      <CTA />
    </main>
  );
}
