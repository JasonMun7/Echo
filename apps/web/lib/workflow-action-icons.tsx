"use client";

import type { LucideIcon } from "lucide-react";
import {
  AppWindow,
  Camera,
  Clock,
  Globe,
  Hourglass,
  Keyboard,
  ListFilter,
  MousePointer2,
  MousePointerClick,
  Move,
  MoveVertical,
  Plug,
  Type,
  XCircle,
} from "lucide-react";

import { IntegrationLogo } from "@/components/echo-flow/integration-logo";
import { cn } from "@/lib/utils";

/** Lucide icon per persisted `action` string (browser + desktop runners). */
const ACTION_ICONS: Record<string, LucideIcon> = {
  navigate: Globe,
  click_at: MousePointerClick,
  type_text_at: Type,
  scroll: MoveVertical,
  wait: Hourglass,
  take_screenshot: Camera,
  select_option: ListFilter,
  hover: MousePointer2,
  press_key: Keyboard,
  drag_drop: Move,
  wait_for_element: Clock,
  open_web_browser: AppWindow,
  close_web_browser: XCircle,
  api_call: Plug,
  right_click: MousePointer2,
  double_click: MousePointerClick,
  hotkey: Keyboard,
  drag: Move,
  open_app: AppWindow,
  focus_app: AppWindow,
};

export type WorkflowActionIconProps = {
  action: string;
  composioSlug?: string | null;
  className?: string;
  /** If true (default), api_call with a Composio slug shows the app logo instead of the plug. */
  preferComposioLogo?: boolean;
};

export function WorkflowActionIcon({
  action,
  composioSlug,
  className,
  preferComposioLogo = true,
}: WorkflowActionIconProps) {
  const slug = String(composioSlug ?? "").trim();
  if (preferComposioLogo && action === "api_call" && slug) {
    return <IntegrationLogo composioSlug={slug} className={cn("shrink-0", className)} />;
  }
  const Icon = ACTION_ICONS[action] ?? Plug;
  return <Icon className={cn("shrink-0", className)} strokeWidth={2} aria-hidden />;
}
