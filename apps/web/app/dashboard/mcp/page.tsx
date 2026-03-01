"use client";

import React, { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { auth } from "@/lib/firebase";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
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
import {
  IconPlus,
  IconTrash,
  IconPlayerPlay,
  IconTool,
  IconCheck,
  IconX,
  IconPencil,
} from "@tabler/icons-react";
import { toast } from "sonner";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

interface McpTool {
  id: string;
  name: string;
  description: string;
  url: string;
  method: string;
  headers: Record<string, string>;
  input_schema: Record<string, unknown>;
  lastTestedAt?: unknown;
}

const emptyTool: Omit<McpTool, "id"> = {
  name: "",
  description: "",
  url: "",
  method: "POST",
  headers: { "Content-Type": "application/json" },
  input_schema: {},
};

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

export default function McpToolsPage() {
  const router = useRouter();
  const [tools, setTools] = useState<McpTool[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingTool, setEditingTool] = useState<McpTool | null>(null);
  const [form, setForm] = useState(emptyTool);
  const [testResults, setTestResults] = useState<Record<string, { ok: boolean; response?: string; error?: string }>>({});
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState<string | null>(null);

  useEffect(() => {
    const unsub = auth?.onAuthStateChanged((u) => {
      if (!u) router.replace("/signin");
      else loadTools();
    });
    return () => unsub?.();
  }, [router]);

  async function loadTools() {
    setLoading(true);
    try {
      const resp = await apiFetch("/api/mcp-tools");
      if (resp.ok) {
        const data = await resp.json();
        setTools(data.tools || []);
      }
    } catch {
      toast.error("Failed to load MCP tools");
    } finally {
      setLoading(false);
    }
  }

  async function saveTool() {
    setSaving(true);
    try {
      const body = JSON.stringify(form);
      let resp: Response;
      if (editingTool) {
        resp = await apiFetch(`/api/mcp-tools/${editingTool.id}`, { method: "PUT", body });
      } else {
        resp = await apiFetch("/api/mcp-tools", { method: "POST", body });
      }
      if (!resp.ok) throw new Error(await resp.text());
      toast.success(editingTool ? "Tool updated" : "Tool created");
      setDialogOpen(false);
      setEditingTool(null);
      setForm(emptyTool);
      await loadTools();
    } catch (e: unknown) {
      toast.error(`Failed to save tool: ${e instanceof Error ? e.message : "Unknown error"}`);
    } finally {
      setSaving(false);
    }
  }

  async function deleteTool(id: string) {
    try {
      const resp = await apiFetch(`/api/mcp-tools/${id}`, { method: "DELETE" });
      if (!resp.ok) throw new Error(await resp.text());
      toast.success("Tool deleted");
      await loadTools();
    } catch {
      toast.error("Failed to delete tool");
    }
  }

  async function testTool(id: string) {
    setTesting(id);
    try {
      const resp = await apiFetch(`/api/mcp-tools/${id}/test`, { method: "POST" });
      const data = await resp.json();
      setTestResults((prev) => ({ ...prev, [id]: data }));
      if (data.ok) toast.success("Test succeeded!");
      else toast.error(`Test failed: ${data.error || data.response}`);
    } catch {
      toast.error("Test request failed");
    } finally {
      setTesting(null);
    }
  }

  function openCreate() {
    setEditingTool(null);
    setForm(emptyTool);
    setDialogOpen(true);
  }

  function openEdit(tool: McpTool) {
    setEditingTool(tool);
    setForm({
      name: tool.name,
      description: tool.description,
      url: tool.url,
      method: tool.method,
      headers: tool.headers,
      input_schema: tool.input_schema,
    });
    setDialogOpen(true);
  }

  return (
    <div className="flex flex-1 flex-col gap-6 rounded-tl-2xl border border-[#A577FF]/20 bg-white p-6 md:p-10">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-[#1A1A2E]">MCP Tools</h1>
          <p className="mt-1 text-sm text-gray-500">
            Register custom HTTP tools that EchoPrism can call during workflow execution.
          </p>
        </div>
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button
              onClick={openCreate}
              className="bg-linear-to-r from-[#A577FF] to-[#7C3AED] text-white hover:opacity-90"
            >
              <IconPlus className="mr-2 h-4 w-4" />
              Add Tool
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle>{editingTool ? "Edit Tool" : "New MCP Tool"}</DialogTitle>
              <DialogDescription>
                Define an HTTP endpoint EchoPrism can call as a tool.
              </DialogDescription>
            </DialogHeader>
            <div className="grid gap-4 py-2">
              <div className="grid gap-1.5">
                <Label>Name</Label>
                <Input
                  placeholder="send_slack_message"
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                />
              </div>
              <div className="grid gap-1.5">
                <Label>Description</Label>
                <Textarea
                  placeholder="Describe what this tool does..."
                  value={form.description}
                  onChange={(e) => setForm({ ...form, description: e.target.value })}
                  rows={2}
                />
              </div>
              <div className="grid gap-1.5">
                <Label>Endpoint URL</Label>
                <Input
                  placeholder="https://hooks.slack.com/services/..."
                  value={form.url}
                  onChange={(e) => setForm({ ...form, url: e.target.value })}
                />
              </div>
              <div className="grid gap-1.5">
                <Label>Method</Label>
                <Select
                  value={form.method}
                  onValueChange={(v) => setForm({ ...form, method: v })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="POST">POST</SelectItem>
                    <SelectItem value="GET">GET</SelectItem>
                    <SelectItem value="PUT">PUT</SelectItem>
                    <SelectItem value="PATCH">PATCH</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-1.5">
                <Label>Input Schema (JSON)</Label>
                <Textarea
                  placeholder='{"type": "object", "properties": {"text": {"type": "string"}}}'
                  value={JSON.stringify(form.input_schema, null, 2)}
                  onChange={(e) => {
                    try {
                      setForm({ ...form, input_schema: JSON.parse(e.target.value) });
                    } catch {
                      // ignore invalid JSON while typing
                    }
                  }}
                  rows={4}
                  className="font-mono text-xs"
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setDialogOpen(false)}>
                Cancel
              </Button>
              <Button
                onClick={saveTool}
                disabled={!form.name || !form.url || saving}
                className="bg-linear-to-r from-[#A577FF] to-[#7C3AED] text-white hover:opacity-90"
              >
                {saving ? "Saving..." : "Save Tool"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {/* Info banner */}
      <div className="rounded-xl border border-[#A577FF]/20 bg-[#F5F3FF] px-4 py-3 text-sm text-[#5B3FA0]">
        <div className="flex items-center gap-2">
          <IconTool className="h-4 w-4 shrink-0" />
          <span>
            Tools registered here are available to EchoPrism during workflow execution. Combine
            them with UI clicks for powerful hybrid automations.
          </span>
        </div>
      </div>

      {/* Table */}
      {loading ? (
        <div className="flex flex-col gap-2">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-12 rounded-lg bg-gray-100 animate-pulse" />
          ))}
        </div>
      ) : tools.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-4 py-20 text-center text-gray-400">
          <IconTool className="h-12 w-12 opacity-30" />
          <div>
            <p className="font-medium text-[#1A1A2E]">No MCP tools yet</p>
            <p className="text-sm">Add your first custom tool to get started.</p>
          </div>
        </div>
      ) : (
        <Table>
          <TableHeader>
            <TableRow className="border-[#A577FF]/20">
              <TableHead>Name</TableHead>
              <TableHead>Description</TableHead>
              <TableHead>Method</TableHead>
              <TableHead>Last Tested</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {tools.map((tool) => {
              const testResult = testResults[tool.id];
              return (
                <TableRow key={tool.id} className="border-[#A577FF]/10 hover:bg-[#F5F3FF]/50">
                  <TableCell className="font-mono text-sm font-medium text-[#1A1A2E]">
                    {tool.name}
                  </TableCell>
                  <TableCell className="max-w-[200px] truncate text-sm text-gray-500">
                    {tool.description}
                  </TableCell>
                  <TableCell>
                    <Badge
                      variant="outline"
                      className="border-[#A577FF]/30 text-[#A577FF] text-xs"
                    >
                      {tool.method}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-xs text-gray-400">
                    {testResult ? (
                      <span
                        className={`flex items-center gap-1 ${testResult.ok ? "text-emerald-500" : "text-red-500"}`}
                      >
                        {testResult.ok ? (
                          <IconCheck className="h-3.5 w-3.5" />
                        ) : (
                          <IconX className="h-3.5 w-3.5" />
                        )}
                        {testResult.ok ? "Passed" : "Failed"}
                      </span>
                    ) : (
                      "—"
                    )}
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex items-center justify-end gap-2">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => testTool(tool.id)}
                        disabled={testing === tool.id}
                        className="h-8 text-xs text-[#A577FF] hover:bg-[#A577FF]/10"
                      >
                        <IconPlayerPlay className="mr-1 h-3 w-3" />
                        {testing === tool.id ? "Testing..." : "Test"}
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => openEdit(tool)}
                        className="h-8 text-xs text-gray-500 hover:bg-gray-100"
                      >
                        <IconPencil className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => deleteTool(tool.id)}
                        className="h-8 text-xs text-red-500 hover:bg-red-50"
                      >
                        <IconTrash className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      )}
    </div>
  );
}
