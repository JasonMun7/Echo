"use client";

import * as React from "react";
import Link from "next/link";
import {
  flexRender,
  getCoreRowModel,
  getFacetedRowModel,
  getFacetedUniqueValues,
  getFilteredRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  useReactTable,
  type ColumnDef,
  type ColumnFiltersState,
  type SortingState,
  type VisibilityState,
} from "@tanstack/react-table";
import {
  IconChevronDown,
  IconChevronLeft,
  IconChevronRight,
  IconChevronsLeft,
  IconChevronsRight,
  IconLayoutColumns,
  IconPlayerStop,
  IconList,
} from "@tabler/icons-react";
import { z } from "zod";
import { toast } from "sonner";

import { apiFetch } from "@/lib/api";
import { getRunStatusBadgeLabel, isCancellationLikeError } from "@/lib/run-terminal-ui";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

export const schema = z.object({
  id: z.string(),
  workflowId: z.string(),
  workflowName: z.string(),
  status: z.string(),
  createdAt: z.unknown(),
  completedAt: z.unknown().optional(),
  source: z.string().optional(),
  error: z.string().optional(),
});

type Run = z.infer<typeof schema>;

function getTime(x: unknown): number {
  if (typeof (x as { toMillis?: () => number })?.toMillis === "function") {
    return (x as { toMillis: () => number }).toMillis();
  }
  if (typeof x === "number") return x > 1e12 ? x : x * 1000;
  if (typeof x === "string") return new Date(x).getTime() || 0;
  const o = x as { seconds?: number; _seconds?: number } | null;
  const sec = o?.seconds ?? o?._seconds;
  return typeof sec === "number" ? sec * 1000 : 0;
}

function formatDate(ts: unknown): string {
  const ms = getTime(ts);
  if (!ms) return "—";
  return new Date(ms).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatDuration(start: unknown, end: unknown): string {
  const s = getTime(start);
  const e = getTime(end);
  if (!s || !e || e <= s) return "—";
  const ms = e - s;
  const secs = Math.floor(ms / 1000);
  if (secs < 60) return `${secs}s`;
  const mins = Math.floor(secs / 60);
  const remainSecs = secs % 60;
  if (mins < 60) return `${mins}m ${remainSecs}s`;
  const hours = Math.floor(mins / 60);
  return `${hours}h ${mins % 60}m`;
}

const STATUS_STYLES: Record<string, string> = {
  running: "bg-blue-100 text-blue-800 dark:bg-blue-950/55 dark:text-blue-200",
  pending: "bg-slate-100 text-slate-800 dark:bg-slate-800/80 dark:text-slate-200",
  completed: "bg-green-100 text-green-800 dark:bg-green-950/50 dark:text-green-200",
  failed: "bg-red-100 text-red-800 dark:bg-red-950/50 dark:text-red-200",
  cancelled:
    "border border-cyan-500/25 bg-cyan-500/10 text-cyan-800 dark:border-cyan-500/30 dark:bg-cyan-950/45 dark:text-cyan-200",
  stopped:
    "border border-cyan-500/25 bg-cyan-500/10 text-cyan-800 dark:border-cyan-500/30 dark:bg-cyan-950/45 dark:text-cyan-200",
  awaiting_user: "bg-amber-100 text-amber-800 dark:bg-amber-950/50 dark:text-amber-200",
};

const IN_PROGRESS_STATUSES = new Set(["running", "pending", "awaiting_user"]);
const TERMINAL_STATUSES = new Set(["completed", "failed", "cancelled"]);

const baseColumns: ColumnDef<Run>[] = [
  {
    accessorKey: "workflowName",
    header: "Workflow",
    cell: ({ row }) => (
      <Link
        href={`/dashboard/workflows/${row.original.workflowId}/runs/${row.original.id}`}
        className="font-medium text-foreground transition-colors hover:underline"
      >
        {row.original.workflowName}
      </Link>
    ),
    enableHiding: true,
  },
  {
    accessorKey: "status",
    header: "Status",
    cell: ({ row }) => {
      const s = row.original.status;
      const err = row.original.error;
      const stopped = s === "cancelled" || isCancellationLikeError(s, err);
      const styleKey = stopped ? "stopped" : s;
      const label = getRunStatusBadgeLabel(s, err);
      return (
        <Badge
          variant="outline"
          className={`px-2.5 py-0.5 text-xs font-medium border-0 ${STATUS_STYLES[styleKey] ?? STATUS_STYLES[s] ?? "bg-muted text-muted-foreground"}`}
        >
          {label}
        </Badge>
      );
    },
  },
  {
    accessorKey: "createdAt",
    header: "Started",
    cell: ({ row }) => (
      <span className="text-sm text-muted-foreground">{formatDate(row.original.createdAt)}</span>
    ),
  },
  {
    id: "duration",
    header: "Duration",
    cell: ({ row }) => (
      <span className="text-sm text-muted-foreground">
        {formatDuration(row.original.createdAt, row.original.completedAt)}
      </span>
    ),
  },
  {
    accessorKey: "source",
    header: "Source",
    cell: ({ row }) => (
      <span className="text-sm capitalize text-muted-foreground">
        {row.original.source ?? "desktop"}
      </span>
    ),
  },
];

const TABS = [
  { value: "all", label: "All Runs" },
  { value: "in_progress", label: "In progress" },
  { value: "completed", label: "Completed" },
  { value: "failed", label: "Failed" },
] as const;

export interface DataTableProps {
  data: Run[];
  /** When viewing a single workflow, hide the Workflow column */
  singleWorkflow?: { workflowId: string; workflowName: string };
}

export function DataTable({ data: initialData, singleWorkflow }: DataTableProps) {
  const [cancellingId, setCancellingId] = React.useState<string | null>(null);
  const [columnVisibility, setColumnVisibility] = React.useState<VisibilityState>(() =>
    singleWorkflow ? { workflowName: false } : { workflowName: true },
  );
  const [columnFilters, setColumnFilters] = React.useState<ColumnFiltersState>([]);
  const [sorting, setSorting] = React.useState<SortingState>([{ id: "createdAt", desc: true }]);
  const [pagination, setPagination] = React.useState({
    pageIndex: 0,
    pageSize: 10,
  });
  const [activeTab, setActiveTab] = React.useState("all");

  const handleCancelRun = React.useCallback(async (workflowId: string, runId: string) => {
    setCancellingId(runId);
    try {
      const res = await apiFetch(`/api/run/${workflowId}/${runId}`, {
        method: "DELETE",
      });
      if (!res.ok) throw new Error("Failed to cancel");
      toast.success("Run stopped", {
        description: "EchoPrism is ending this run.",
        classNames: {
          toast: "border-border bg-card",
          title: "text-foreground",
          description: "text-muted-foreground",
        },
      });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to cancel run");
    } finally {
      setCancellingId(null);
    }
  }, []);

  const columns = React.useMemo<ColumnDef<Run>[]>(
    () => [
      ...baseColumns,
      {
        id: "actions",
        header: "Actions",
        cell: ({ row }) => {
          const r = row.original;
          const inProgress = IN_PROGRESS_STATUSES.has(r.status);
          const terminal = TERMINAL_STATUSES.has(r.status);
          if (inProgress) {
            const busy = cancellingId === r.id;
            return (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="outline"
                    size="sm"
                    className="border-echo-error/40 text-echo-error hover:bg-echo-error/10"
                    onClick={() => handleCancelRun(r.workflowId, r.id)}
                    disabled={busy}
                  >
                    <IconPlayerStop className="h-3.5 w-3.5 shrink-0" />
                    <span className="ml-1.5">{busy ? "Cancelling…" : "Cancel"}</span>
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Cancel this run</TooltipContent>
              </Tooltip>
            );
          }
          if (terminal) {
            return (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Link
                    href={`/dashboard/workflows/${r.workflowId}/runs/${r.id}`}
                    className="echo-btn-secondary-accent inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-sm font-medium"
                  >
                    <IconList className="h-3.5 w-3.5 shrink-0" />
                    View logs
                  </Link>
                </TooltipTrigger>
                <TooltipContent>View run logs and details</TooltipContent>
              </Tooltip>
            );
          }
          return null;
        },
        enableHiding: false,
      },
    ],
    [cancellingId, handleCancelRun],
  );

  const filteredData = React.useMemo(() => {
    if (activeTab === "all") return initialData;
    if (activeTab === "in_progress")
      return initialData.filter(
        (r) => r.status === "running" || r.status === "pending" || r.status === "awaiting_user",
      );
    if (activeTab === "failed") {
      return initialData.filter(
        (r) => r.status === "failed" && !isCancellationLikeError(r.status, r.error),
      );
    }
    return initialData.filter((r) => r.status === activeTab);
  }, [initialData, activeTab]);

  const table = useReactTable({
    data: filteredData,
    columns,
    state: {
      sorting,
      columnVisibility,
      columnFilters,
      pagination,
    },
    getRowId: (row) => row.id,
    onSortingChange: setSorting,
    onColumnFiltersChange: setColumnFilters,
    onColumnVisibilityChange: setColumnVisibility,
    onPaginationChange: setPagination,
    getCoreRowModel: getCoreRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFacetedRowModel: getFacetedRowModel(),
    getFacetedUniqueValues: getFacetedUniqueValues(),
  });

  const countFor = (tab: string) => {
    if (tab === "all") return initialData.length;
    if (tab === "in_progress")
      return initialData.filter(
        (r) => r.status === "running" || r.status === "pending" || r.status === "awaiting_user",
      ).length;
    return initialData.filter((r) => r.status === tab).length;
  };

  const fillRunsPane = Boolean(singleWorkflow);

  return (
    <div className={cn("w-full flex flex-col gap-4", fillRunsPane && "min-h-0 flex-1 basis-0")}>
      {/* Tab bar + column toggle */}
      <div
        className={cn("flex items-center justify-between px-4 lg:px-6", fillRunsPane && "shrink-0")}
      >
        <div className="flex gap-1 rounded-lg bg-muted p-1">
          {TABS.map((tab) => {
            const count = countFor(tab.value);
            return (
              <button
                key={tab.value}
                onClick={() => {
                  setActiveTab(tab.value);
                  setPagination((p) => ({ ...p, pageIndex: 0 }));
                }}
                className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
                  activeTab === tab.value
                    ? "bg-card text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {tab.label}
                {count > 0 && tab.value !== "all" && (
                  <span
                    className={`rounded-full px-1.5 py-0.5 text-xs ${
                      activeTab === tab.value
                        ? "bg-primary/15 text-primary"
                        : "bg-muted-foreground/10 text-muted-foreground"
                    }`}
                  >
                    {count}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="outline"
              size="sm"
              className="border-border text-foreground hover:bg-muted"
            >
              <IconLayoutColumns />
              <span className="hidden lg:inline">Customize Columns</span>
              <span className="lg:hidden">Columns</span>
              <IconChevronDown />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-48">
            {table
              .getAllColumns()
              .filter((column) => typeof column.accessorFn !== "undefined" && column.getCanHide())
              .map((column) => (
                <DropdownMenuCheckboxItem
                  key={column.id}
                  className="capitalize"
                  checked={column.getIsVisible()}
                  onCheckedChange={(value) => column.toggleVisibility(!!value)}
                >
                  {column.id}
                </DropdownMenuCheckboxItem>
              ))}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {/* Table — workflow detail: plain <table> so one scroll container scrolls (Table wraps in extra div). */}
      <div
        className={cn(
          "rounded-lg border border-border bg-card shadow-sm mx-4 lg:mx-6",
          fillRunsPane
            ? "echo-runs-table-scroll min-h-0 flex-1 overflow-auto"
            : "overflow-hidden overflow-x-auto",
        )}
      >
        {fillRunsPane ? (
          <table className="w-full caption-bottom text-sm">
            <TableHeader className="sticky top-0 z-10 border-b border-border bg-card shadow-[0_1px_0_0_rgba(21,10,53,0.06)] dark:shadow-[0_1px_0_0_rgba(255,255,255,0.06)]">
              {table.getHeaderGroups().map((headerGroup) => (
                <TableRow key={headerGroup.id}>
                  {headerGroup.headers.map((header) => (
                    <TableHead key={header.id} colSpan={header.colSpan}>
                      {header.isPlaceholder
                        ? null
                        : flexRender(header.column.columnDef.header, header.getContext())}
                    </TableHead>
                  ))}
                </TableRow>
              ))}
            </TableHeader>
            <TableBody>
              {table.getRowModel().rows?.length ? (
                table.getRowModel().rows.map((row) => (
                  <TableRow key={row.id}>
                    {row.getVisibleCells().map((cell) => (
                      <TableCell key={cell.id}>
                        {flexRender(cell.column.columnDef.cell, cell.getContext())}
                      </TableCell>
                    ))}
                  </TableRow>
                ))
              ) : (
                <TableRow>
                  <TableCell
                    colSpan={columns.length}
                    className="h-24 text-center text-muted-foreground"
                  >
                    No runs yet.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </table>
        ) : (
          <Table>
            <TableHeader className="sticky top-0 z-10 border-b border-border bg-card shadow-[0_1px_0_0_rgba(21,10,53,0.06)] dark:shadow-[0_1px_0_0_rgba(255,255,255,0.06)]">
              {table.getHeaderGroups().map((headerGroup) => (
                <TableRow key={headerGroup.id}>
                  {headerGroup.headers.map((header) => (
                    <TableHead key={header.id} colSpan={header.colSpan}>
                      {header.isPlaceholder
                        ? null
                        : flexRender(header.column.columnDef.header, header.getContext())}
                    </TableHead>
                  ))}
                </TableRow>
              ))}
            </TableHeader>
            <TableBody>
              {table.getRowModel().rows?.length ? (
                table.getRowModel().rows.map((row) => (
                  <TableRow key={row.id}>
                    {row.getVisibleCells().map((cell) => (
                      <TableCell key={cell.id}>
                        {flexRender(cell.column.columnDef.cell, cell.getContext())}
                      </TableCell>
                    ))}
                  </TableRow>
                ))
              ) : (
                <TableRow>
                  <TableCell
                    colSpan={columns.length}
                    className="h-24 text-center text-muted-foreground"
                  >
                    No runs yet.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        )}
      </div>

      {/* Pagination */}
      <div
        className={cn("flex items-center justify-between px-4 lg:px-6", fillRunsPane && "shrink-0")}
      >
        <div className="hidden flex-1 text-sm text-muted-foreground lg:flex">
          {table.getFilteredRowModel().rows.length} run(s)
        </div>
        <div className="flex w-full items-center gap-8 lg:w-fit">
          <div className="hidden items-center gap-2 lg:flex">
            <Label htmlFor="rows-per-page" className="text-sm font-medium">
              Rows per page
            </Label>
            <Select
              value={`${table.getState().pagination.pageSize}`}
              onValueChange={(value) => table.setPageSize(Number(value))}
            >
              <SelectTrigger size="sm" className="w-20" id="rows-per-page">
                <SelectValue placeholder={table.getState().pagination.pageSize} />
              </SelectTrigger>
              <SelectContent side="top">
                {[10, 20, 30, 40, 50].map((pageSize) => (
                  <SelectItem key={pageSize} value={`${pageSize}`}>
                    {pageSize}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex w-fit items-center justify-center text-sm font-medium text-foreground">
            Page {table.getState().pagination.pageIndex + 1} of {table.getPageCount()}
          </div>
          <div className="ml-auto flex items-center gap-2 lg:ml-0">
            <Button
              variant="outline"
              className="hidden h-8 w-8 p-0 lg:flex"
              onClick={() => table.setPageIndex(0)}
              disabled={!table.getCanPreviousPage()}
            >
              <span className="sr-only">Go to first page</span>
              <IconChevronsLeft />
            </Button>
            <Button
              variant="outline"
              className="size-8"
              size="icon"
              onClick={() => table.previousPage()}
              disabled={!table.getCanPreviousPage()}
            >
              <span className="sr-only">Go to previous page</span>
              <IconChevronLeft />
            </Button>
            <Button
              variant="outline"
              className="size-8"
              size="icon"
              onClick={() => table.nextPage()}
              disabled={!table.getCanNextPage()}
            >
              <span className="sr-only">Go to next page</span>
              <IconChevronRight />
            </Button>
            <Button
              variant="outline"
              className="hidden size-8 lg:flex"
              size="icon"
              onClick={() => table.setPageIndex(table.getPageCount() - 1)}
              disabled={!table.getCanNextPage()}
            >
              <span className="sr-only">Go to last page</span>
              <IconChevronsRight />
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
