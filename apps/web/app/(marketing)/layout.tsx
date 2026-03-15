import { Navbar } from "@/components/marketing/navbar";
import { Footer } from "@/components/marketing/footer";
import { SplashCursorProvider } from "@/components/marketing/splash-cursor-provider";

export default function MarketingLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen bg-[#F5F7FC]">
      <SplashCursorProvider />
      <Navbar />
      {children}
      <Footer />
    </div>
  );
}
