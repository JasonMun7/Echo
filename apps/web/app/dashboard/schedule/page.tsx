"use client";

import React, { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { auth, db } from "@/lib/firebase";
import { collection, query, where, getDocs } from "firebase/firestore";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { IconPlus, IconTrash, IconCalendarClock, IconClock } from "@tabler/icons-react";
import { toast } from "sonner";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

interface Workflow {
  id: string;
  name: string;
  status: string;
}

interface ScheduleEntry {
  workflowId: string;
  workflowName: string;
  cron: string;
  timezone: string;
}

const CRON_PRESETS = [
  { label: "Every hour", value: "0 * * * *" },
  { label: "Every day at 9am", value: "0 9 * * *" },
  { label: "Every Monday at 8am", value: "0 8 * * 1" },
  { label: "Every weekday at 9am", value: "0 9 * * 1-5" },
  { label: "Every Sunday at midnight", value: "0 0 * * 0" },
  { label: "Custom", value: "" },
];

async function apiFetch(path: string, options?: RequestInit) {
  const user = auth?.currentUser;
  const token = user ? await user.getIdToken() : "";
  return fetch(`${API_URL}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
      ...(options?.headers || {}),
    },
  });
}

function parseCronHuman(cron: string): string {
  const presets = CRON_PRESETS.filter((p) => p.value);
  const match = presets.find((p) => p.value === cron);
  if (match) return match.label;
  return cron;
}

export default function SchedulePage() {
  const router = useRouter();
  const [workflows, setWorkflows] = useState<Workflow[]>([]);
  const [schedules, setSchedules] = useState<ScheduleEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [selectedWorkflow, setSelectedWorkflow] = useState("");
  const [cronPreset, setCronPreset] = useState(CRON_PRESETS[0].value);
  const [customCron, setCustomCron] = useState("");
  const [timezone, setTimezone] = useState("UTC");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const unsub = auth?.onAuthStateChanged((u) => {
      if (!u) router.replace("/signin");
      else loadData();
    });
    return () => unsub?.();
  }, [router]);

  async function loadData() {
    setLoading(true);
    try {
      const user = auth?.currentUser;
      if (!user || !db) return;

      // Load workflows
      const wfQ = query(collection(db, "workflows"), where("owner_uid", "==", user.uid));
      const wfSnap = await getDocs(wfQ);
      const wfs: Workflow[] = wfSnap.docs.map((d) => ({
        id: d.id,
        name: d.data().name || "Untitled",
        status: d.data().status || "",
      }));
      setWorkflows(wfs.filter((w) => w.status === "active" || w.status === "ready"));

      // Load schedules from workflow docs that have schedule field
      const sched: ScheduleEntry[] = [];
      wfSnap.docs.forEach((d) => {
        const data = d.data();
        if (data.schedule) {
          sched.push({
            workflowId: d.id,
            workflowName: data.name || "Untitled",
            cron: data.schedule.cron || "",
            timezone: data.schedule.timezone || "UTC",
          });
        }
      });
      setSchedules(sched);
    } catch {
      toast.error("Failed to load data");
    } finally {
      setLoading(false);
    }
  }

  async function createSchedule() {
    const cron = cronPreset || customCron;
    if (!selectedWorkflow || !cron) {
      toast.error("Please select a workflow and schedule");
      return;
    }
    setSaving(true);
    try {
      const resp = await apiFetch(`/api/schedule/${selectedWorkflow}`, {
        method: "POST",
        body: JSON.stringify({ cron, timezone }),
      });
      if (!resp.ok) {
        const text = await resp.text();
        // If Cloud Scheduler not set up, still save locally
        if (text.includes("not set") || text.includes("not available")) {
          toast.warning("Cloud Scheduler not configured. Schedule saved locally only.");
        } else {
          throw new Error(text);
        }
      }
      toast.success("Schedule created!");
      setDialogOpen(false);
      setSelectedWorkflow("");
      setCronPreset(CRON_PRESETS[0].value);
      setCustomCron("");
      await loadData();
    } catch (e: unknown) {
      toast.error(`Failed: ${e instanceof Error ? e.message : "Unknown error"}`);
    } finally {
      setSaving(false);
    }
  }

  async function deleteSchedule(workflowId: string) {
    try {
      await apiFetch(`/api/schedule/${workflowId}`, { method: "DELETE" });
      toast.success("Schedule removed");
      await loadData();
    } catch {
      toast.error("Failed to remove schedule");
    }
  }

  return (
    <div className="flex flex-1 flex-col gap-6 rounded-tl-2xl border border-[#A577FF]/20 bg-white p-6 md:p-10">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-[#1A1A2E]">Scheduled Runs</h1>
          <p className="mt-1 text-sm text-gray-500">
            Automatically run workflows on a schedule using Cloud Scheduler.
          </p>
        </div>
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button className="bg-linear-to-r from-[#A577FF] to-[#7C3AED] text-white hover:opacity-90">
              <IconPlus className="mr-2 h-4 w-4" />
              New Schedule
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>Create Schedule</DialogTitle>
              <DialogDescription>
                Choose a workflow and how often it should run.
              </DialogDescription>
            </DialogHeader>
            <div className="grid gap-4 py-2">
              <div className="grid gap-1.5">
                <Label>Workflow</Label>
                <Select value={selectedWorkflow} onValueChange={setSelectedWorkflow}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select a workflow..." />
                  </SelectTrigger>
                  <SelectContent>
                    {workflows.map((w) => (
                      <SelectItem key={w.id} value={w.id}>
                        {w.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-1.5">
                <Label>Frequency</Label>
                <Select value={cronPreset} onValueChange={setCronPreset}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {CRON_PRESETS.map((p) => (
                      <SelectItem key={p.label} value={p.value || "custom"}>
                        {p.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              {(!cronPreset || cronPreset === "custom") && (
                <div className="grid gap-1.5">
                  <Label>Custom Cron Expression</Label>
                  <Input
                    placeholder="0 9 * * 1-5"
                    value={customCron}
                    onChange={(e) => setCustomCron(e.target.value)}
                    className="font-mono"
                  />
                  <p className="text-xs text-gray-400">
                    Format: minute hour day month weekday
                  </p>
                </div>
              )}
              <div className="grid gap-1.5">
                <Label>Timezone</Label>
                <Select value={timezone} onValueChange={setTimezone}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="UTC">UTC</SelectItem>
                    <SelectItem value="America/New_York">Eastern (ET)</SelectItem>
                    <SelectItem value="America/Los_Angeles">Pacific (PT)</SelectItem>
                    <SelectItem value="America/Chicago">Central (CT)</SelectItem>
                    <SelectItem value="Europe/London">London (GMT)</SelectItem>
                    <SelectItem value="Asia/Tokyo">Tokyo (JST)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setDialogOpen(false)}>
                Cancel
              </Button>
              <Button
                onClick={createSchedule}
                disabled={!selectedWorkflow || (!cronPreset && !customCron) || saving}
                className="bg-linear-to-r from-[#A577FF] to-[#7C3AED] text-white hover:opacity-90"
              >
                {saving ? "Saving..." : "Create Schedule"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {/* Schedules list */}
      {loading ? (
        <div className="flex flex-col gap-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-20 rounded-xl bg-gray-100 animate-pulse" />
          ))}
        </div>
      ) : schedules.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-4 py-20 text-center text-gray-400">
          <IconCalendarClock className="h-12 w-12 opacity-30" />
          <div>
            <p className="font-medium text-[#1A1A2E]">No schedules yet</p>
            <p className="text-sm">Create a schedule to automatically run workflows.</p>
          </div>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {schedules.map((sched) => (
            <div
              key={sched.workflowId}
              className="flex items-center justify-between rounded-xl border border-[#A577FF]/20 bg-[#F5F3FF]/30 p-4 hover:border-[#A577FF]/40"
            >
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#A577FF]/10 text-[#A577FF]">
                  <IconClock className="h-5 w-5" />
                </div>
                <div>
                  <p className="font-medium text-[#1A1A2E]">{sched.workflowName}</p>
                  <div className="flex items-center gap-2 mt-0.5">
                    <Badge
                      variant="outline"
                      className="border-[#A577FF]/30 text-[#A577FF] font-mono text-xs"
                    >
                      {sched.cron}
                    </Badge>
                    <span className="text-xs text-gray-400">{parseCronHuman(sched.cron)}</span>
                    <span className="text-xs text-gray-400">·</span>
                    <span className="text-xs text-gray-400">{sched.timezone}</span>
                  </div>
                </div>
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => deleteSchedule(sched.workflowId)}
                className="h-8 text-red-500 hover:bg-red-50"
              >
                <IconTrash className="h-4 w-4" />
              </Button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
