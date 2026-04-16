"use client";

import { useState } from "react";

import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";

export function ProfileNotificationsPanel() {
  const [notifRuns, setNotifRuns] = useState(true);
  const [notifCallUser, setNotifCallUser] = useState(true);

  return (
    <div className="rounded-2xl border border-border bg-card p-5 shadow-sm">
      <div className="flex flex-col gap-4">
        <div className="flex items-center justify-between gap-4">
          <div>
            <Label className="text-sm font-medium text-foreground">Run completions</Label>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Notify when a workflow run finishes
            </p>
          </div>
          <Switch checked={notifRuns} onCheckedChange={setNotifRuns} />
        </div>
        <Separator className="bg-border" />
        <div className="flex items-center justify-between gap-4">
          <div>
            <Label className="text-sm font-medium text-foreground">Awaiting input alerts</Label>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Notify when EchoPrism needs your help (CallUser)
            </p>
          </div>
          <Switch checked={notifCallUser} onCheckedChange={setNotifCallUser} />
        </div>
      </div>
    </div>
  );
}
