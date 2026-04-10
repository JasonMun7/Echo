import { LegalPageTemplate } from "@/components/legal-page-template";
import { getSEOTags } from "@/lib/seo";

export const metadata = getSEOTags({
  title: "Privacy Policy | Echo",
  description: "Echo Privacy Policy.",
});

export default function PrivacyPage() {
  return (
    <LegalPageTemplate title="Privacy Policy">
      <p className="mb-4">
        <strong>Last updated:</strong> April 9, 2026
      </p>
      <p className="mb-4">
        This Privacy Policy describes how Echo (&quot;we,&quot; &quot;us&quot;) collects, uses, and
        shares information when you use the Echo Service.
      </p>
      <h2 className="mt-8 mb-2 font-semibold text-[#150A35]">1. Information we collect</h2>
      <p className="mb-4">
        We collect information you provide (such as account details, profile information, and
        content you submit), technical data (such as device, log, and usage information), and
        information from integrations you connect when you authorize them.
      </p>
      <h2 className="mt-8 mb-2 font-semibold text-[#150A35]">2. How we use information</h2>
      <p className="mb-4">
        We use information to operate and improve the Service, provide support, secure our systems,
        comply with law, and communicate with you about the Service.
      </p>
      <h2 className="mt-8 mb-2 font-semibold text-[#150A35]">3. Sharing</h2>
      <p className="mb-4">
        We may share information with service providers who assist in hosting, analytics, or
        security, when required by law, or to protect rights and safety. We do not sell your
        personal information.
      </p>
      <h2 className="mt-8 mb-2 font-semibold text-[#150A35]">4. Retention</h2>
      <p className="mb-4">
        We retain information for as long as needed to provide the Service and fulfill the purposes
        described in this policy, unless a longer period is required by law.
      </p>
      <h2 className="mt-8 mb-2 font-semibold text-[#150A35]">5. Security</h2>
      <p className="mb-4">
        We implement technical and organizational measures designed to protect information. No
        method of transmission or storage is completely secure.
      </p>
      <h2 className="mt-8 mb-2 font-semibold text-[#150A35]">6. Your choices</h2>
      <p className="mb-4">
        Depending on your region, you may have rights to access, correct, or delete certain personal
        information. Contact us as described below to exercise applicable rights.
      </p>
      <h2 className="mt-8 mb-2 font-semibold text-[#150A35]">7. Changes</h2>
      <p className="mb-4">
        We may update this Privacy Policy from time to time. We will post updates on this page and
        revise the &quot;Last updated&quot; date.
      </p>
      <h2 className="mt-8 mb-2 font-semibold text-[#150A35]">8. Contact</h2>
      <p>
        For privacy questions, contact the Echo team through the support channel listed on your
        deployment or organization&apos;s documentation.
      </p>
    </LegalPageTemplate>
  );
}
