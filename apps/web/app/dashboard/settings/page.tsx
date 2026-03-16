"use client";

import React, { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { auth } from "@/lib/firebase";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { IconAlertTriangle } from "@tabler/icons-react";

export default function SettingsPage() {
  const router = useRouter();
  const [notifRuns, setNotifRuns] = useState(true);
  const [notifCallUser, setNotifCallUser] = useState(true);

  useEffect(() => {
    const unsub = auth?.onAuthStateChanged((u) => {
      if (!u) router.replace("/signin");
    });
    return () => unsub?.();
  }, [router]);

  return (
    <div className="flex flex-1 flex-col gap-6 rounded-tl-2xl border border-[#A577FF]/20 bg-white p-6 md:p-10">
      <h1 className="text-2xl font-bold text-[#1A1A2E]">Settings</h1>

      <div className="max-w-2xl flex flex-col gap-6">
        {/* Notifications */}
        <Card className="border-[#A577FF]/20">
          <CardHeader>
            <CardTitle className="text-base text-[#1A1A2E]">Notifications</CardTitle>
            <CardDescription className="text-sm">
              Control when Echo alerts you about agent activity.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <div className="flex items-center justify-between">
              <div>
                <Label className="text-sm font-medium text-[#1A1A2E]">Run completions</Label>
                <p className="text-xs text-gray-400 mt-0.5">Notify when a workflow run finishes</p>
              </div>
              <Switch
                checked={notifRuns}
                onCheckedChange={setNotifRuns}
                className="data-[state=checked]:bg-[#A577FF]"
              />
            </div>
            <Separator className="bg-[#A577FF]/10" />
            <div className="flex items-center justify-between">
              <div>
                <Label className="text-sm font-medium text-[#1A1A2E]">Awaiting input alerts</Label>
                <p className="text-xs text-gray-400 mt-0.5">
                  Notify when EchoPrism needs your help (CallUser)
                </p>
              </div>
              <Switch
                checked={notifCallUser}
                onCheckedChange={setNotifCallUser}
                className="data-[state=checked]:bg-[#A577FF]"
              />
            </div>
          </CardContent>
        </Card>

        {/* Danger Zone */}
        <Card className="border-red-200">
          <CardHeader>
            <div className="flex items-center gap-2">
              <IconAlertTriangle className="h-5 w-5 text-red-500" />
              <CardTitle className="text-base text-red-600">Danger Zone</CardTitle>
            </div>
          </CardHeader>
          <CardContent>
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-[#1A1A2E]">Delete account</p>
                <p className="text-xs text-gray-400 mt-0.5">
                  Permanently delete your account and all data. This cannot be undone.
                </p>
              </div>
              <Button
                variant="outline"
                size="sm"
                disabled
                className="border-red-200 text-red-400 cursor-not-allowed"
                title="Contact support to delete your account"
              >
                Delete Account
              </Button>
            </div>
            <p className="mt-2 text-xs text-gray-400">
              Contact{" "}
              <a href="mailto:support@echo.ai" className="underline">
                support@echo.ai
              </a>{" "}
              to request account deletion.
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
