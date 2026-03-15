"use client";

import {
  IconAlertTriangle,
  IconCircleCheck,
  IconJumpRope,
  IconPlayerPlay,
} from "@tabler/icons-react";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export interface SectionCardsProps {
  totalWorkflows?: number;
  activeWorkflows?: number;
  totalRuns?: number;
  awaitingInput?: number;
  onAwaitingClick?: () => void;
}

export function SectionCards({
  totalWorkflows = 0,
  activeWorkflows = 0,
  totalRuns = 0,
  awaitingInput = 0,
  onAwaitingClick,
}: SectionCardsProps) {
  return (
    <div className="grid grid-cols-1 gap-4 px-4 lg:px-6 @xl/main:grid-cols-2 @5xl/main:grid-cols-4">
      <Card className="rounded-lg border border-[#A577FF]/20 bg-[#F5F7FC] shadow-sm @container/card">
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardDescription className="text-echo-text-muted">
            Total Workflows
          </CardDescription>
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-[#A577FF]/10">
            <IconJumpRope className="size-5 text-[#A577FF]" />
          </div>
        </CardHeader>
        <CardContent>
          <CardTitle className="text-2xl font-semibold tabular-nums text-[#150A35] @[250px]/card:text-3xl">
            {totalWorkflows}
          </CardTitle>
          <p className="text-xs text-echo-text-muted mt-1">
            Workflows you&apos;ve created
          </p>
        </CardContent>
      </Card>

      <Card className="rounded-lg border border-[#A577FF]/20 bg-[#F5F7FC] shadow-sm @container/card">
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardDescription className="text-echo-text-muted">
            Active Workflows
          </CardDescription>
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-echo-success/10">
            <IconCircleCheck className="size-5 text-echo-success" />
          </div>
        </CardHeader>
        <CardContent>
          <CardTitle className="text-2xl font-semibold tabular-nums text-[#150A35] @[250px]/card:text-3xl">
            {activeWorkflows}
          </CardTitle>
          <p className="text-xs text-echo-text-muted mt-1">
            Ready or live
          </p>
        </CardContent>
      </Card>

      <Card className="rounded-lg border border-[#A577FF]/20 bg-[#F5F7FC] shadow-sm @container/card">
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardDescription className="text-echo-text-muted">
            Total Runs
          </CardDescription>
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-[#A577FF]/10">
            <IconPlayerPlay className="size-5 text-[#A577FF]" />
          </div>
        </CardHeader>
        <CardContent>
          <CardTitle className="text-2xl font-semibold tabular-nums text-[#150A35] @[250px]/card:text-3xl">
            {totalRuns}
          </CardTitle>
          <p className="text-xs text-echo-text-muted mt-1">
            All workflow runs
          </p>
        </CardContent>
      </Card>

      <Card
        className={`rounded-lg border shadow-sm @container/card ${
          awaitingInput
            ? "cursor-pointer border-amber-200 bg-amber-50 hover:bg-amber-100/80"
            : "border-[#A577FF]/20 bg-[#F5F7FC]"
        }`}
        onClick={onAwaitingClick}
      >
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardDescription className="text-echo-text-muted">
            Awaiting Input
          </CardDescription>
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-amber-100">
            <IconAlertTriangle className="size-5 text-amber-500" />
          </div>
        </CardHeader>
        <CardContent>
          <CardTitle
            className={`text-2xl font-semibold tabular-nums @[250px]/card:text-3xl ${
              awaitingInput ? "text-amber-600" : "text-[#150A35]"
            }`}
          >
            {awaitingInput}
          </CardTitle>
          <p className="text-xs text-echo-text-muted mt-1">
            {awaitingInput ? "Click to view" : "No runs waiting"}
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
