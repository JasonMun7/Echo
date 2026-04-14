/**
 * Echo Flow persisted canvas (React Flow–compatible JSON) and DAG execution order.
 */

export interface FlowGraphEdge {
  id?: string;
  source: string;
  target: string;
}

export interface FlowGraphNode {
  id: string;
  type?: string;
  data?: Record<string, unknown>;
}

/** Stored on `workflows/{id}` as `flow_graph` */
export interface FlowGraph {
  nodes?: FlowGraphNode[];
  edges?: FlowGraphEdge[];
  viewport?: Record<string, unknown>;
}

function sortStepsByOrder<T extends { order: number }>(steps: T[]): T[] {
  return [...steps].sort((a, b) => a.order - b.order);
}

/**
 * Topological order of step ids from edges; falls back to `order` field on cycle or missing graph.
 */
export function orderStepsByFlowGraph<T extends { id: string; order: number }>(
  steps: T[],
  flowGraph: FlowGraph | null | undefined,
): T[] {
  const sortedFallback = sortStepsByOrder(steps);
  const edges = flowGraph?.edges;
  if (!edges?.length) return sortedFallback;

  const byId = new Map(steps.map((s) => [s.id, s]));
  const stepIds = new Set(steps.map((s) => s.id));

  const adj = new Map<string, string[]>();
  const indeg = new Map<string, number>();
  for (const id of stepIds) {
    indeg.set(id, 0);
    adj.set(id, []);
  }

  for (const e of edges) {
    const src = e.source;
    const tgt = e.target;
    if (!stepIds.has(src) || !stepIds.has(tgt)) continue;
    adj.get(src)!.push(tgt);
    indeg.set(tgt, (indeg.get(tgt) ?? 0) + 1);
  }

  const queue: string[] = [];
  for (const [id, d] of indeg) {
    if (d === 0) queue.push(id);
  }
  queue.sort((a, b) => (byId.get(a)!.order ?? 0) - (byId.get(b)!.order ?? 0));

  const out: string[] = [];
  while (queue.length) {
    const u = queue.shift()!;
    out.push(u);
    for (const v of adj.get(u) ?? []) {
      const next = (indeg.get(v) ?? 0) - 1;
      indeg.set(v, next);
      if (next === 0) queue.push(v);
    }
    queue.sort((a, b) => (byId.get(a)!.order ?? 0) - (byId.get(b)!.order ?? 0));
  }

  if (out.length !== stepIds.size) {
    return sortedFallback;
  }

  const seen = new Set(out);
  const rest = steps.filter((s) => !seen.has(s.id));
  return [...out.map((id) => byId.get(id)!), ...sortStepsByOrder(rest)];
}
