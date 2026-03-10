import { cn } from "@/lib/utils";
import React from "react";

export function MarketingCard({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "rounded-2xl bg-white shadow-sm ring-1 shadow-black/10 ring-black/10",
        className
      )}
    >
      {children}
    </div>
  );
}

export function MarketingCardContent({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return <div className={cn("", className)}>{children}</div>;
}

export function MarketingCardHeader({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-col gap-2 p-6", className)}>{children}</div>
  );
}

export function MarketingCardTitle({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <h3 className={cn("text-sm font-semibold text-neutral-900", className)}>
      {children}
    </h3>
  );
}

export function MarketingCardDescription({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <p className={cn("text-sm text-balance text-neutral-600", className)}>
      {children}
    </p>
  );
}

export function MarketingCardSkeleton({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return <div className={cn(className)}>{children}</div>;
}

export function MarketingFeatureCard({
  icon,
  title,
  description,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
}) {
  return (
    <div className="group rounded-2xl bg-white p-6">
      {icon}
      <h3 className="mt-4 text-sm font-semibold text-neutral-900">{title}</h3>
      <p className="mt-2 text-sm text-balance text-neutral-600">
        {description}
      </p>
    </div>
  );
}

export function MarketingFeatureBlock({
  icon,
  title,
  description,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
}) {
  return (
    <div className="group rounded-2xl bg-white p-6 shadow-sm ring-1 ring-black/5">
      <div className="relative flex min-h-40 items-center justify-center mask-radial-from-20%">
        {icon}
      </div>
      <h3 className="mt-4 text-sm font-semibold text-neutral-900">{title}</h3>
      <p className="mt-2 text-sm text-balance text-neutral-600">
        {description}
      </p>
    </div>
  );
}
