import Image from "next/image";
import Link from "next/link";
import { cn } from "@/lib/utils";
import GradientText from "@/components/reactbits/GradientText";

const sizeMap = {
  sm: { px: 32, cls: "size-8" },
  md: { px: 48, cls: "size-12" },
  lg: { px: 64, cls: "size-16" },
} as const;

export const Logo = ({ size = "md" }: { size?: keyof typeof sizeMap }) => {
  const { px, cls } = sizeMap[size];
  return (
    <Link href="/" className="flex items-center gap-2">
      <Image
        src="/echo_logo.png"
        alt="Echo"
        width={px}
        height={px}
        className={cn(cls, "shrink-0 object-contain")}
        style={{ aspectRatio: "1" }}
      />
      <GradientText
        colors={["#A577FF", "#21C4DD", "#A577FF"]}
        animationSpeed={6}
        className={cn(
          "font-medium",
          size === "sm" && "text-lg",
          size === "md" && "text-xl",
          size === "lg" && "text-2xl"
        )}
      >
        <span>Echo</span>
      </GradientText>
    </Link>
  );
};
