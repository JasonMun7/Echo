import { LegalPageTemplate } from "@/components/legal-page-template";
import { getSEOTags } from "@/lib/seo";

export const metadata = getSEOTags({
  title: "Terms of Service | Echo",
  description: "Echo Terms of Service.",
});

export default function TermsPage() {
  return (
    <LegalPageTemplate title="Terms of Service">
      <p className="mb-4">
        <strong>Last updated:</strong> April 9, 2026
      </p>
      <p className="mb-4">
        These Terms of Service (&quot;Terms&quot;) govern your access to and use of Echo
        and related services (collectively, the &quot;Service&quot;). By using the Service,
        you agree to these Terms.
      </p>
      <h2 className="mt-8 mb-2 font-semibold text-[#150A35]">1. The Service</h2>
      <p className="mb-4">
        Echo provides workflow automation, integrations, and related features. We may modify,
        suspend, or discontinue parts of the Service with reasonable notice where practicable.
      </p>
      <h2 className="mt-8 mb-2 font-semibold text-[#150A35]">2. Accounts and eligibility</h2>
      <p className="mb-4">
        You are responsible for safeguarding your account credentials and for activity under your
        account. You must provide accurate information and comply with applicable laws when using
        the Service.
      </p>
      <h2 className="mt-8 mb-2 font-semibold text-[#150A35]">3. Acceptable use</h2>
      <p className="mb-4">
        You may not misuse the Service, including by attempting unauthorized access, interfering
        with other users, distributing malware, or violating others&apos; rights. We may suspend
        or terminate access for conduct that violates these Terms or creates risk for the Service
        or third parties.
      </p>
      <h2 className="mt-8 mb-2 font-semibold text-[#150A35]">4. Third-party services</h2>
      <p className="mb-4">
        The Service may interoperate with third-party products (for example, authentication or
        productivity tools). Those services are governed by their own terms; we are not
        responsible for third-party services.
      </p>
      <h2 className="mt-8 mb-2 font-semibold text-[#150A35]">5. Disclaimers</h2>
      <p className="mb-4">
        The Service is provided &quot;as is&quot; to the fullest extent permitted by law. We
        disclaim warranties of merchantability, fitness for a particular purpose, and
        non-infringement unless otherwise required by law.
      </p>
      <h2 className="mt-8 mb-2 font-semibold text-[#150A35]">6. Limitation of liability</h2>
      <p className="mb-4">
        To the maximum extent permitted by law, Echo and its suppliers will not be liable for any
        indirect, incidental, special, consequential, or punitive damages, or for loss of profits,
        data, or goodwill, arising from your use of the Service.
      </p>
      <h2 className="mt-8 mb-2 font-semibold text-[#150A35]">7. Changes</h2>
      <p className="mb-4">
        We may update these Terms from time to time. We will post the revised Terms on this page
        and update the &quot;Last updated&quot; date. Continued use after changes constitutes
        acceptance of the revised Terms.
      </p>
      <h2 className="mt-8 mb-2 font-semibold text-[#150A35]">8. Contact</h2>
      <p>
        For questions about these Terms, contact the Echo team through the support channel listed
        on your deployment or organization&apos;s documentation.
      </p>
    </LegalPageTemplate>
  );
}
