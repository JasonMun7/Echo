import { CTA } from "@/components/marketing/cta";
import { FAQs } from "@/components/marketing/faqs";
import { Pricing } from "@/components/marketing/pricing";
import { getSEOTags } from "@/lib/seo";

export const metadata = getSEOTags({
  title: "Pricing | Echo",
  description: "Simple, transparent pricing for Echo AI agents.",
});

export default function PricingPage() {
  return (
    <main className="bg-[#F5F7FC]">
      <Pricing />
      <FAQs />
      <CTA />
    </main>
  );
}
