"use client";

import { useState } from "react";
import { Bell } from "lucide-react";

import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";
import { GradientIconWell } from "@/components/ui/gradient-icon-well";

export function ProfileNotificationsPanel() {
  const [notifRuns, setNotifRuns] = useState(true);
  const [notifCallUser, setNotifCallUser] = useState(true);

  return (
    <div className="rounded-2xl border border-border bg-card p-5 shadow-sm">
      <div className="mb-5 flex items-start gap-3">
        <GradientIconWell corners="lg" className="size-10 shrink-0">
          <Bell className="size-5 text-card-foreground" />
        </GradientIconWell>
        <div className="min-w-0 flex-1">
          <h3 className="text-sm font-semibold text-foreground">Notification preferences</h3>
          <p className="mt-1 text-sm text-muted-foreground">
            Control when Echo alerts you about agent activity and workflows.
          </p>
        </div>
      </div>

      <div className="flex flex-col gap-4">
        <div className="flex items-center justify-between gap-4">
          <div>
            <Label className="text-sm font-medium text-foreground">Run completions</Label>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Notify when a workflow run finishes
            </p>
          </div>
          <Switch
            checked={notifRuns}
            onCheckedChange={setNotifRuns}
            className="data-[state=checked]:bg-primary"
          />
        </div>
        <Separator className="bg-border" />
        <div className="flex items-center justify-between gap-4">
          <div>
            <Label className="text-sm font-medium text-foreground">Awaiting input alerts</Label>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Notify when EchoPrism needs your help (CallUser)
            </p>
          </div>
          <Switch
            checked={notifCallUser}
            onCheckedChange={setNotifCallUser}
            className="data-[state=checked]:bg-primary"
          />
        </div>
      </div>
    </div>
  );
}
