import Image from "next/image";
import Link from "next/link";
import { cn } from "@/lib/utils";

const sizeMap = {
  sm: { px: 32, cls: "size-8" },
  md: { px: 48, cls: "size-12" },
  lg: { px: 64, cls: "size-16" },
} as const;

export const Logo = ({ size = "lg" }: { size?: keyof typeof sizeMap }) => {
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
      <span
        className={cn(
          "font-medium text-[#150A35]",
          size === "sm" && "text-lg",
          size === "md" && "text-xl",
          size === "lg" && "text-2xl"
        )}
      >
        Echo
      </span>
    </Link>
  );
};
