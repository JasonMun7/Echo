import { ContactFormGridWithDetails } from "@/components/marketing/contact-form-grid";
import { getSEOTags } from "@/lib/seo";

export const metadata = getSEOTags({
  title: "Contact | Echo",
  description: "Get in touch with the Echo team.",
});

export default function ContactPage() {
  return (
    <main className="min-h-screen bg-[#F5F7FC]">
      <ContactFormGridWithDetails />
    </main>
  );
}
