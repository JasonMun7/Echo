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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import {
  IconApi,
  IconAlertTriangle,
  IconCopy,
  IconCheck,
  IconKey,
} from "@tabler/icons-react";
import { toast } from "sonner";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

export default function SettingsPage() {
  const router = useRouter();
  const [defaultType, setDefaultType] = useState("browser");
  const [token, setToken] = useState("");
  const [copied, setCopied] = useState(false);
  const [notifRuns, setNotifRuns] = useState(true);
  const [notifCallUser, setNotifCallUser] = useState(true);

  useEffect(() => {
    const unsub = auth?.onAuthStateChanged(async (u) => {
      if (!u) { router.replace("/signin"); return; }
      try {
        const t = await u.getIdToken();
        setToken(t);
      } catch { /* ignore */ }
    });
    return () => unsub?.();
  }, [router]);

  async function copyToken() {
    const user = auth?.currentUser;
    if (!user) return;
    const t = await user.getIdToken(true);
    setToken(t);
    navigator.clipboard.writeText(t).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
      toast.success("Token copied to clipboard");
    });
  }

  async function saveDefaultType(value: string) {
    setDefaultType(value);
    try {
      const user = auth?.currentUser;
      if (!user) return;
      const t = await user.getIdToken();
      await fetch(`${API_URL}/api/users/me`, {
        method: "PUT",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${t}` },
        body: JSON.stringify({ default_workflow_type: value }),
      });
      toast.success("Default workflow type saved");
    } catch {
      toast.error("Failed to save preference");
    }
  }

  return (
    <div className="flex flex-1 flex-col gap-6 rounded-tl-2xl border border-[#A577FF]/20 bg-white p-6 md:p-10">
      <h1 className="text-2xl font-bold text-[#1A1A2E]">Settings</h1>

      <div className="max-w-2xl flex flex-col gap-6">
        {/* API Access */}
        <Card className="border-[#A577FF]/20">
          <CardHeader>
            <div className="flex items-center gap-2">
              <IconKey className="h-5 w-5 text-[#A577FF]" />
              <CardTitle className="text-base text-[#1A1A2E]">API Access</CardTitle>
            </div>
            <CardDescription className="text-sm">
              Use your Firebase ID token to authenticate API requests. Tokens expire after 1 hour.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            <div className="flex items-center gap-2">
              <code className="flex-1 rounded-lg border border-[#A577FF]/20 bg-[#F5F3FF] px-3 py-2 font-mono text-xs text-[#5B3FA0] truncate">
                {token ? `${token.slice(0, 60)}...` : "Loading token..."}
              </code>
              <Button
                variant="outline"
                size="sm"
                onClick={copyToken}
                className="shrink-0 border-[#A577FF]/30 text-[#A577FF] hover:bg-[#A577FF]/10"
              >
                {copied ? <IconCheck className="h-4 w-4" /> : <IconCopy className="h-4 w-4" />}
              </Button>
            </div>
            <a
              href={`${API_URL}/docs`}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1.5 text-sm text-[#A577FF] hover:underline"
            >
              <IconApi className="h-4 w-4" />
              Open API Documentation
            </a>
          </CardContent>
        </Card>

        {/* Workflow Preferences */}
        <Card className="border-[#A577FF]/20">
          <CardHeader>
            <CardTitle className="text-base text-[#1A1A2E]">Workflow Preferences</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <div className="flex items-center justify-between">
              <div>
                <Label className="text-sm font-medium text-[#1A1A2E]">Default Workflow Type</Label>
                <p className="text-xs text-gray-400 mt-0.5">
                  Whether new workflows default to browser or desktop automation
                </p>
              </div>
              <Select value={defaultType} onValueChange={saveDefaultType}>
                <SelectTrigger className="w-32 border-[#A577FF]/30">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="browser">Browser</SelectItem>
                  <SelectItem value="desktop">Desktop</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>

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
