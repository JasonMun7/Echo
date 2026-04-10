import { View, Text, ScrollView, Pressable, RefreshControl, StyleSheet } from "react-native";
import { useRouter } from "expo-router";
import { useState, useCallback, useMemo } from "react";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import Svg, {
  Path,
  Polyline,
  Defs,
  LinearGradient as SvgLinearGradient,
  Stop,
} from "react-native-svg";
import { useAuthStore } from "@/stores/auth-store";
import { useOwnedWorkflows, useAllWorkflowRuns } from "@/hooks/use-firestore-listener";
import { GradientButton } from "@/components/ui/GradientButton";
import { StatusBadge } from "@/components/echo/StatusBadge";
import { colors, gradients } from "@echo/design-tokens";
import type { Workflow, Run } from "@echo/types";
import { useSafeAreaInsets } from "react-native-safe-area-context";

/* ─── helpers ─── */

function getTime(x: unknown): number {
  if (typeof (x as { toMillis?: () => number })?.toMillis === "function") {
    return (x as { toMillis: () => number }).toMillis();
  }
  if (typeof x === "number") return x > 1e12 ? x : x * 1000;
  const o = x as { seconds?: number; _seconds?: number };
  const sec = o?.seconds ?? o?._seconds;
  return typeof sec === "number" ? sec * 1000 : 0;
}

function formatDuration(startMs: number, endMs: number): string {
  if (!startMs || !endMs || endMs <= startMs) return "";
  const secs = Math.round((endMs - startMs) / 1000);
  if (secs < 60) return `${secs}s`;
  const mins = Math.floor(secs / 60);
  if (mins < 60) return `${mins}m ${secs % 60}s`;
  return `${Math.floor(mins / 60)}h ${mins % 60}m`;
}

function formatRelative(ms: number): string {
  if (!ms) return "";
  const diff = Date.now() - ms;
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "Just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

/* ─── run activity chart ─── */

type Period = "7d" | "30d" | "90d";
type ChartMode = "line" | "bar";

const VB_W = 400; // SVG viewBox logical width
const VB_H = 120; // SVG viewBox logical height (chart area only)
const GRID_LINES = 4;

function useRunActivity(allRuns: Run[], period: Period) {
  return useMemo(() => {
    const days = period === "7d" ? 7 : period === "30d" ? 30 : 90;
    const now = Date.now();
    const buckets: number[] = new Array(days).fill(0);
    const completedBuckets: number[] = new Array(days).fill(0);

    for (const run of allRuns) {
      const t = getTime(run.createdAt);
      if (!t) continue;
      const daysAgo = Math.floor((now - t) / 86400000);
      if (daysAgo >= 0 && daysAgo < days) {
        buckets[days - 1 - daysAgo]++;
        if (run.status === "completed") completedBuckets[days - 1 - daysAgo]++;
      }
    }

    const max = Math.max(...buckets, 1);
    return { buckets, completedBuckets, max, days };
  }, [allRuns, period]);
}

/** Build a smooth SVG area path using cubic bezier control points (Catmull-Rom style). */
function smoothArea(values: number[], max: number): { linePath: string; areaPath: string } {
  const n = values.length;
  if (n === 0) return { linePath: "", areaPath: "" };

  const pts = values.map((v, i) => ({
    x: (i / (n - 1 || 1)) * VB_W,
    y: VB_H - (v / max) * VB_H * 0.92, // 0.92 keeps peak slightly below top
  }));

  // Build cubic bezier path
  let d = `M ${pts[0].x} ${pts[0].y}`;
  for (let i = 1; i < n; i++) {
    const prev = pts[i - 1];
    const curr = pts[i];
    const tension = 0.35;
    const cp1x = prev.x + (curr.x - prev.x) * tension;
    const cp1y = prev.y;
    const cp2x = curr.x - (curr.x - prev.x) * tension;
    const cp2y = curr.y;
    d += ` C ${cp1x.toFixed(2)} ${cp1y.toFixed(2)} ${cp2x.toFixed(2)} ${cp2y.toFixed(2)} ${curr.x.toFixed(2)} ${curr.y.toFixed(2)}`;
  }

  const linePath = d;
  const areaPath = `${d} L ${pts[n - 1].x} ${VB_H} L ${pts[0].x} ${VB_H} Z`;
  return { linePath, areaPath };
}

/** X-axis label dates */
function getXLabels(days: number): { label: string; pct: number }[] {
  const step = days <= 7 ? 1 : days <= 30 ? 5 : 10;
  const now = Date.now();
  const out: { label: string; pct: number }[] = [];
  for (let i = 0; i < days; i += step) {
    const date = new Date(now - (days - 1 - i) * 86400000);
    const label = date.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
    });
    out.push({ label, pct: i / (days - 1) });
  }
  return out;
}

const PERIOD_LABELS: Record<Period, string> = {
  "7d": "7 days",
  "30d": "30 days",
  "90d": "3 months",
};

function LineChart({ activity }: { activity: ReturnType<typeof useRunActivity> }) {
  const total = smoothArea(activity.buckets, activity.max);
  const completed = smoothArea(activity.completedBuckets, activity.max);
  const xLabels = getXLabels(activity.days);

  return (
    <View>
      {/* SVG chart */}
      <Svg width="100%" height={140} viewBox={`0 0 ${VB_W} ${VB_H}`} preserveAspectRatio="none">
        <Defs>
          <SvgLinearGradient id="totalFill" x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0%" stopColor="#A577FF" stopOpacity="0.28" />
            <Stop offset="100%" stopColor="#A577FF" stopOpacity="0.04" />
          </SvgLinearGradient>
          <SvgLinearGradient id="completedFill" x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0%" stopColor="#21c4dd" stopOpacity="0.45" />
            <Stop offset="100%" stopColor="#21c4dd" stopOpacity="0.04" />
          </SvgLinearGradient>
        </Defs>

        {/* Horizontal grid lines */}
        {Array.from({ length: GRID_LINES }).map((_, i) => {
          const y = (VB_H / GRID_LINES) * (i + 1);
          return (
            <Path key={i} d={`M 0 ${y} L ${VB_W} ${y}`} stroke="rgba(0,0,0,0.06)" strokeWidth="1" />
          );
        })}

        {/* Baseline */}
        <Path d={`M 0 ${VB_H} L ${VB_W} ${VB_H}`} stroke="rgba(165,119,255,0.3)" strokeWidth="1" />

        {/* Total runs area (back) */}
        <Path d={total.areaPath} fill="url(#totalFill)" />
        <Path d={total.linePath} fill="none" stroke="#A577FF" strokeWidth="1.5" />

        {/* Completed runs area (front) */}
        <Path d={completed.areaPath} fill="url(#completedFill)" />
        <Path d={completed.linePath} fill="none" stroke="#21c4dd" strokeWidth="1.5" />
      </Svg>

      {/* X-axis labels — evenly spaced across the full width */}
      <View style={styles.xAxisRow}>
        {xLabels.map(({ label }) => (
          <Text key={label} style={styles.xLabel}>
            {label}
          </Text>
        ))}
      </View>

      {/* Legend */}
      <View style={styles.chartLegend}>
        <View style={styles.legendItem}>
          <View style={[styles.legendDot, { backgroundColor: "#A577FF" }]} />
          <Text style={styles.legendText}>Total</Text>
        </View>
        <View style={styles.legendItem}>
          <View style={[styles.legendDot, { backgroundColor: "#21c4dd" }]} />
          <Text style={styles.legendText}>Completed</Text>
        </View>
      </View>
    </View>
  );
}

/* ─── stat card config ─── */

interface StatCardProps {
  icon: keyof typeof Ionicons.glyphMap;
  value: number;
  label: string;
  alert?: boolean;
}

function StatCard({ icon, value, label, alert }: StatCardProps) {
  return (
    <View style={[styles.statCard, alert && styles.statCardAlert]}>
      <View style={[styles.statIconWrap, alert && styles.statIconWrapAlert]}>
        <Ionicons name={icon} size={18} color={alert ? "#d97706" : colors.lavender} />
      </View>
      <Text style={[styles.statNumber, alert && styles.statNumberAlert]}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

/* ─── component ─── */

export default function HomeScreen() {
  const user = useAuthStore((s) => s.user);
  const uid = user?.uid ?? null;
  const router = useRouter();
  const [refreshing, setRefreshing] = useState(false);
  const [period, setPeriod] = useState<Period>("7d");
  const [chartMode, setChartMode] = useState<ChartMode>("line");

  const { data: rawWorkflows } = useOwnedWorkflows(uid);

  const allWorkflows = useMemo(
    () =>
      (rawWorkflows as Workflow[]).filter(
        (w) => (w as Workflow & { ephemeral?: boolean }).ephemeral !== true,
      ),
    [rawWorkflows],
  );

  // Collect workflow IDs so the batch runs hook can subscribe to each subcollection
  // directly — this avoids collectionGroup index/permission requirements
  const workflowIds = useMemo(() => allWorkflows.map((w) => w.id), [allWorkflows]);
  const { data: allRunsRaw } = useAllWorkflowRuns(workflowIds, 30);

  // Sort runs client-side by createdAt
  const allRuns = useMemo(
    () => [...(allRunsRaw as Run[])].sort((a, b) => getTime(b.createdAt) - getTime(a.createdAt)),
    [allRunsRaw],
  );

  // Derive active runs from the already-loaded runs data (avoids a second collectionGroup query)
  const activeRuns = useMemo(
    () => allRuns.filter((r) => ["running", "pending", "awaiting_user"].includes(r.status)),
    [allRuns],
  );

  const recentWorkflows = [...allWorkflows]
    .sort((a, b) => getTime(b.createdAt ?? b.updatedAt) - getTime(a.createdAt ?? a.updatedAt))
    .slice(0, 5);

  const activity = useRunActivity(allRuns, period);

  const totalWorkflows = allWorkflows.length;
  const activeWorkflows = allWorkflows.filter(
    (w) => w.status === "active" || w.status === "ready",
  ).length;
  const totalRuns = allRuns.length;
  const awaitingInput = activeRuns.filter((r) => r.status === "awaiting_user").length;

  const displayName = user?.displayName || user?.email?.split("@")[0] || "there";

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await new Promise((r) => setTimeout(r, 500));
    setRefreshing(false);
  }, []);

  const insets = useSafeAreaInsets();

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={[
        styles.content,
        {
          paddingTop: insets.top + 32,
          paddingBottom: insets.bottom + 112,
        },
      ]}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
    >
      {/* Hero */}
      <LinearGradient colors={["#EEF0FF", "#F8F9FE"]} style={styles.hero}>
        <Text style={styles.greeting}>Hey, {displayName}</Text>
        <Text style={styles.heroSub}>What would you like to automate?</Text>
      </LinearGradient>

      {/* Stats 2×2 grid */}
      <View style={styles.statsGrid}>
        <View style={styles.statsRow}>
          <StatCard icon="layers-outline" value={totalWorkflows} label="Workflows" />
          <StatCard icon="pulse-outline" value={activeWorkflows} label="Active" />
        </View>
        <View style={styles.statsRow}>
          <StatCard icon="play-circle-outline" value={totalRuns} label="Total Runs" />
          <StatCard
            icon="time-outline"
            value={awaitingInput}
            label="Awaiting Input"
            alert={awaitingInput > 0}
          />
        </View>
      </View>

      {/* Run Activity Chart */}
      <View style={styles.section}>
        <View style={styles.chartTitleRow}>
          <View>
            <Text style={styles.sectionTitle}>Run Activity</Text>
            <Text style={styles.chartSubtitle}>
              Total for last {PERIOD_LABELS[period].toLowerCase()}
            </Text>
          </View>
          <View style={styles.periodToggle}>
            {(["90d", "30d", "7d"] as Period[]).map((p) => (
              <Pressable
                key={p}
                style={[styles.periodBtn, period === p && styles.periodBtnActive]}
                onPress={() => setPeriod(p)}
              >
                <Text style={[styles.periodText, period === p && styles.periodTextActive]}>
                  {PERIOD_LABELS[p]}
                </Text>
              </Pressable>
            ))}
          </View>
        </View>
        <View style={styles.chartCard}>
          {activity.buckets.every((b) => b === 0) ? (
            <View style={styles.chartEmpty}>
              <Ionicons name="bar-chart-outline" size={28} color={colors.textLight} />
              <Text style={styles.chartEmptyText}>No runs in this period</Text>
            </View>
          ) : chartMode === "line" ? (
            <LineChart activity={activity} />
          ) : (
            <View style={styles.chart}>
              {activity.buckets.map((count, i) => {
                const height = (count / activity.max) * 72;
                const completedH = (activity.completedBuckets[i] / activity.max) * 72;
                return (
                  <View key={i} style={[styles.barWrapper, { flex: 1 }]}>
                    <View style={styles.barColumn}>
                      <View
                        style={[
                          styles.bar,
                          {
                            height: Math.max(height, count > 0 ? 3 : 0),
                            backgroundColor: "rgba(165,119,255,0.18)",
                          },
                        ]}
                      />
                      <View
                        style={[
                          styles.barOverlay,
                          {
                            height: Math.max(completedH, activity.completedBuckets[i] > 0 ? 3 : 0),
                            backgroundColor: colors.lavender,
                          },
                        ]}
                      />
                    </View>
                  </View>
                );
              })}
            </View>
          )}
        </View>
      </View>

      {/* Active Runs */}
      {activeRuns.length > 0 && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Active Runs</Text>
          {activeRuns.map((run) => (
            <Pressable
              key={run.id}
              style={styles.activeRunItem}
              onPress={() => router.push(`/(tabs)/workflows/${run.workflow_id}/runs/${run.id}`)}
            >
              <View style={styles.activeRunIconWrap}>
                <Ionicons name="play-outline" size={14} color="#21c4dd" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.activeRunText} numberOfLines={1}>
                  {run.id.slice(0, 10)}...
                </Text>
                <Text style={styles.activeRunTime}>{formatRelative(getTime(run.createdAt))}</Text>
              </View>
              <Ionicons name="chevron-forward" size={16} color={colors.textLight} />
            </Pressable>
          ))}
        </View>
      )}

      {/* Recent Runs */}
      <View style={styles.section}>
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Recent Runs</Text>
        </View>
        {allRuns.length === 0 ? (
          <View style={styles.emptyState}>
            <Ionicons name="play-circle-outline" size={32} color={colors.textLight} />
            <Text style={styles.emptyText}>No runs yet.</Text>
          </View>
        ) : (
          allRuns.slice(0, 8).map((run) => {
            const startMs = getTime(run.startedAt ?? run.createdAt);
            const endMs = getTime(run.completedAt);
            const duration = formatDuration(startMs, endMs);
            return (
              <Pressable
                key={run.id}
                style={styles.recentRunItem}
                onPress={() => router.push(`/(tabs)/workflows/${run.workflow_id}/runs/${run.id}`)}
              >
                <StatusBadge status={run.status} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.recentRunId} numberOfLines={1}>
                    {run.id.slice(0, 14)}...
                  </Text>
                  <Text style={styles.recentRunMeta}>
                    {formatRelative(startMs)}
                    {duration ? ` · ${duration}` : ""}
                  </Text>
                </View>
                <Ionicons name="chevron-forward" size={16} color={colors.textLight} />
              </Pressable>
            );
          })
        )}
      </View>

      {/* Recent Workflows */}
      <View style={styles.section}>
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Recent Workflows</Text>
          <Pressable onPress={() => router.push("/(tabs)/workflows")}>
            <Text style={styles.seeAll}>See All</Text>
          </Pressable>
        </View>
        {recentWorkflows.length === 0 ? (
          <View style={styles.emptyState}>
            <Text style={styles.emptyText}>No workflows yet. Create your first one!</Text>
          </View>
        ) : (
          recentWorkflows.map((wf) => (
            <Pressable
              key={wf.id}
              style={styles.workflowItem}
              onPress={() => router.push(`/(tabs)/workflows/${wf.id}`)}
            >
              <View style={styles.workflowItemContent}>
                <Text style={styles.workflowName} numberOfLines={1}>
                  {wf.name || "Untitled"}
                </Text>
                <StatusBadge status={wf.status} />
              </View>
            </Pressable>
          ))
        )}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.ghost },
  content: { paddingBottom: 32 },

  hero: { padding: 24, paddingTop: 16, paddingBottom: 28 },
  greeting: {
    fontSize: 26,
    fontWeight: "700",
    color: "#1a1a2e",
    fontFamily: "Inter-Bold",
  },
  heroSub: {
    fontSize: 15,
    color: "#6b7280",
    marginTop: 4,
    fontFamily: "Inter",
  },

  /* stats 2x2 grid */
  statsGrid: {
    paddingHorizontal: 16,
    marginTop: 0,
    marginBottom: 4,
    gap: 10,
  },
  statsRow: {
    flexDirection: "row",
    gap: 10,
  },
  statCard: {
    flex: 1,
    backgroundColor: colors.white,
    borderRadius: 14,
    padding: 16,
    borderWidth: 1,
    borderColor: colors.border,
    gap: 6,
  },
  statCardAlert: {
    borderColor: "rgba(245,158,11,0.35)",
    backgroundColor: "rgba(245,158,11,0.04)",
  },
  statIconWrap: {
    width: 34,
    height: 34,
    borderRadius: 10,
    backgroundColor: "rgba(165,119,255,0.1)",
    alignItems: "center",
    justifyContent: "center",
  },
  statIconWrapAlert: {
    backgroundColor: "rgba(245,158,11,0.1)",
  },
  statNumber: {
    fontSize: 26,
    fontWeight: "700",
    color: colors.text,
    fontFamily: "Inter-Bold",
    lineHeight: 30,
  },
  statNumberAlert: { color: "#d97706" },
  statLabel: {
    fontSize: 12,
    color: colors.textMuted,
    fontFamily: "Inter",
    fontWeight: "400",
  },

  /* chart */
  section: { paddingHorizontal: 16, paddingTop: 16 },
  sectionHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 12,
  },
  sectionTitle: {
    fontSize: 17,
    fontWeight: "600",
    color: colors.text,
    fontFamily: "Inter-SemiBold",
  },
  chartTitleRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: 12,
    gap: 8,
  },
  chartSubtitle: {
    fontSize: 12,
    color: colors.textMuted,
    fontFamily: "Inter",
    marginTop: 2,
  },
  periodToggle: { flexDirection: "row", gap: 4, flexShrink: 1 },
  periodBtn: {
    paddingHorizontal: 9,
    paddingVertical: 5,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.white,
  },
  periodBtnActive: {
    backgroundColor: "rgba(165,119,255,0.1)",
    borderColor: colors.lavender,
  },
  periodText: {
    fontSize: 11,
    color: colors.textMuted,
    fontFamily: "Inter-Medium",
    fontWeight: "500",
  },
  periodTextActive: { color: colors.lavender, fontWeight: "600" },

  chartCard: {
    backgroundColor: colors.white,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    paddingTop: 12,
    paddingBottom: 8,
    paddingHorizontal: 4,
    overflow: "hidden",
  },
  chartEmpty: {
    height: 160,
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
  },
  chartEmptyText: {
    fontSize: 13,
    color: colors.textLight,
    fontFamily: "Inter",
  },
  chart: {
    flexDirection: "row",
    height: 72,
    alignItems: "flex-end",
    gap: 2,
  },
  barWrapper: { alignItems: "center", justifyContent: "flex-end" },
  barColumn: {
    width: "100%",
    alignItems: "center",
    justifyContent: "flex-end",
    position: "relative",
  },
  bar: { width: "70%", borderRadius: 2, minWidth: 3 },
  barOverlay: {
    width: "70%",
    borderRadius: 2,
    minWidth: 3,
    position: "absolute",
    bottom: 0,
  },
  xAxisRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingHorizontal: 6,
    marginTop: 4,
  },
  xLabel: { fontSize: 9, color: colors.textLight, fontFamily: "Inter" },
  chartLegend: {
    flexDirection: "row",
    justifyContent: "center",
    gap: 16,
    marginTop: 4,
    paddingBottom: 4,
  },
  legendItem: { flexDirection: "row", alignItems: "center", gap: 6 },
  legendDot: { width: 8, height: 8, borderRadius: 4 },
  legendText: { fontSize: 11, color: colors.textMuted, fontFamily: "Inter" },

  /* active runs */
  activeRunItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    backgroundColor: "rgba(33,196,221,0.05)",
    borderWidth: 1,
    borderColor: "rgba(33,196,221,0.18)",
    borderRadius: 10,
    padding: 12,
    marginBottom: 8,
  },
  activeRunIconWrap: {
    width: 28,
    height: 28,
    borderRadius: 8,
    backgroundColor: "rgba(33,196,221,0.12)",
    alignItems: "center",
    justifyContent: "center",
  },
  activeRunText: {
    fontSize: 13,
    fontWeight: "500",
    color: colors.text,
    fontFamily: "Inter-Medium",
  },
  activeRunTime: {
    fontSize: 12,
    color: colors.textMuted,
    fontFamily: "Inter",
    marginTop: 1,
  },

  /* recent runs */
  recentRunItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    padding: 12,
    marginBottom: 8,
  },
  recentRunId: {
    fontSize: 13,
    fontWeight: "500",
    color: colors.text,
    fontFamily: "Inter-Medium",
  },
  recentRunMeta: {
    fontSize: 12,
    color: colors.textMuted,
    fontFamily: "Inter",
    marginTop: 1,
  },

  /* quick actions */
  quickActions: { flexDirection: "row", gap: 12 },
  quickBtn: { flex: 1 },

  /* workflows */
  seeAll: {
    fontSize: 14,
    color: colors.lavender,
    fontWeight: "600",
    fontFamily: "Inter",
  },
  workflowItem: {
    backgroundColor: colors.white,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 14,
    marginBottom: 8,
  },
  workflowItemContent: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  workflowName: {
    fontSize: 15,
    fontWeight: "500",
    color: colors.text,
    fontFamily: "Inter-Medium",
    flex: 1,
    marginRight: 8,
  },
  emptyState: { paddingVertical: 24, alignItems: "center", gap: 8 },
  emptyText: {
    fontSize: 14,
    color: colors.textMuted,
    fontFamily: "Inter",
    textAlign: "center",
  },
});
