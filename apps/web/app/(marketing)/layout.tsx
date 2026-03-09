import { Navbar } from "@/components/marketing/navbar";
import { Footer } from "@/components/marketing/footer";

export default function MarketingLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen bg-[#F5F7FC]">
      <Navbar />
      {children}
      <Footer />
    </div>
  );
}
