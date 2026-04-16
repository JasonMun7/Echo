"use client";

import type { ComponentType } from "react";
import { IconPlug } from "@tabler/icons-react";
import { DashboardEmptyState } from "@/components/dashboard-empty-state";

type IconComp = ComponentType<{ className?: string; "aria-hidden"?: boolean }>;

type IntegrationsEmptyStateProps = {
  title: string;
  description?: string;
  icon?: IconComp;
};

/**
 * Empty state for integrations — uses shared {@link DashboardEmptyState}.
 */
export function IntegrationsEmptyState({
  title,
  description,
  icon: Icon = IconPlug,
}: IntegrationsEmptyStateProps) {
  return <DashboardEmptyState title={title} description={description} icon={Icon} />;
}
