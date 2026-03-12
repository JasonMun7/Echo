import { useState } from "react";
import {
  IconCircleCheck,
  IconAlertCircle,
  IconX,
  IconExternalLink,
  IconBrain,
  IconBolt,
} from "@tabler/icons-react";
import SpotlightCard from "./reactbits/SpotlightCard";
import Threads from "@/components/Threads";
import AnimatedList from "@/components/AnimatedList";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";

export interface RunResultEntry {
  thought: string;
  action: string;
  step: number;
}

export interface RunResult {
  success: boolean;
  error?: string;
  progress?: string[];
  entries?: RunResultEntry[];
  runId?: string;
  workflowId?: string;
}

interface RunLogsSectionProps {
  runResult: RunResult | null;
  dismissed: boolean;
  onDismiss: () => void;
  onOpenWebUI?: (path: string) => void;
  workflowName?: string;
}

export default function RunLogsSection({
  runResult,
  dismissed,
  onDismiss,
  onOpenWebUI,
  workflowName,
}: RunLogsSectionProps) {
  const showPlaceholder = runResult == null || dismissed;
  const showFilled = runResult != null && !dismissed;

  const entries: RunResultEntry[] =
    runResult?.entries && runResult.entries.length > 0
      ? runResult.entries
      : (runResult?.progress ?? []).map((msg, i) => ({
          thought: msg,
          action: "",
          step: i,
        }));

  return (
    <SpotlightCard
      style={{
        padding: 20,
        height: 450,
        minHeight: 450,
        flexShrink: 0,
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
      }}
    >
      {showPlaceholder && (
        <div
          style={{
            position: "relative",
            flex: 1,
            minHeight: 0,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "flex-start",
            padding: 24,
            overflow: "hidden",
            borderRadius: 12,
            border: "1px solid rgba(165, 119, 255, 0.12)",
            background: "rgba(165, 119, 255, 0.04)",
          }}
        >
          <div
            style={{
              position: "absolute",
              inset: 0,
              width: "100%",
              height: "100%",
              borderRadius: 12,
              overflow: "hidden",
            }}
          >
            <Threads
              color={[165 / 255, 119 / 255, 255 / 255]}
              amplitude={1.3}
              distance={0.3}
              enableMouseInteraction={false}
            />
          </div>
          <div
            style={{
              position: "relative",
              zIndex: 1,
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              gap: 12,
              textAlign: "center",
            }}
          >
            <div
              style={{
                animation: "run-logs-placeholder-pulse 3s ease-in-out infinite",
              }}
            >
              <IconBrain
                size={30}
                stroke={1.5}
                style={{
                  color: "var(--echo-lavender)",
                  opacity: 0.9,
                }}
              />
            </div>
            <p
              style={{
                fontSize: 14,
                color: "var(--echo-text-secondary)",
                margin: 0,
                maxWidth: 280,
                lineHeight: 1.5,
              }}
            >
              Run a workflow to see logs, thoughts, and results here
            </p>
          </div>
        </div>
      )}

      {showFilled && runResult && (
        <div
          style={{
            flex: 1,
            minHeight: 0,
            display: "flex",
            flexDirection: "column",
            gap: 12,
            overflow: "hidden",
          }}
        >
          {/* Header */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              flexWrap: "wrap",
              gap: 8,
            }}
          >
            <h2
              style={{
                fontSize: "1rem",
                fontWeight: 600,
                color: "var(--echo-lavender)",
                margin: 0,
              }}
            >
              Last Run
              {workflowName && (
                <span
                  style={{
                    fontWeight: 500,
                    color: "var(--echo-text-secondary)",
                    marginLeft: 6,
                  }}
                >
                  — {workflowName}
                </span>
              )}
            </h2>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
              }}
            >
              <span
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 4,
                  padding: "4px 10px",
                  borderRadius: 99,
                  fontSize: 12,
                  fontWeight: 600,
                  background: runResult.success
                    ? "rgba(34, 197, 94, 0.15)"
                    : "rgba(239, 68, 68, 0.15)",
                  color: runResult.success
                    ? "var(--echo-success)"
                    : "var(--echo-error)",
                }}
              >
                {runResult.success ? (
                  <IconCircleCheck size={14} />
                ) : (
                  <IconAlertCircle size={14} />
                )}
                {runResult.success ? "Success" : "Failed"}
              </span>
              {runResult.runId && runResult.workflowId && onOpenWebUI && (
                <Button
                  variant="ghost"
                  size="xs"
                  onClick={() =>
                    onOpenWebUI(
                      `/dashboard/workflows/${runResult.workflowId}/runs/${runResult.runId}`,
                    )
                  }
                  className="text-[var(--echo-lavender)] hover:bg-[#A577FF]/10"
                >
                  <IconExternalLink size={12} />
                  View in browser
                </Button>
              )}
              <Button
                variant="ghost"
                size="icon-xs"
                onClick={onDismiss}
                aria-label="Dismiss"
                className="text-[var(--echo-text-secondary)] hover:bg-[#A577FF]/10"
              >
                <IconX size={14} />
              </Button>
            </div>
          </div>

          {!runResult.success && runResult.error && (
            <div
              style={{
                padding: "10px 14px",
                borderRadius: 8,
                border: "1px solid rgba(239, 68, 68, 0.3)",
                background: "rgba(239, 68, 68, 0.08)",
              }}
            >
              <p
                style={{
                  fontSize: 13,
                  color: "var(--echo-error)",
                  margin: 0,
                  lineHeight: 1.5,
                }}
              >
                {runResult.error}
              </p>
            </div>
          )}

          <Separator
            className="opacity-60"
            style={{ borderColor: "rgba(165, 119, 255, 0.15)" }}
          />

          {/* Steps list with AnimatedList */}
          <div
            style={{
              flex: 1,
              minHeight: 0,
              display: "flex",
              flexDirection: "column",
              overflow: "hidden",
              borderRadius: 8,
              border: "1px solid rgba(165, 119, 255, 0.2)",
              background: "var(--echo-surface)",
            }}
          >
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                padding: "8px 12px",
                borderBottom: "1px solid rgba(165, 119, 255, 0.15)",
                background: "rgba(165, 119, 255, 0.04)",
              }}
            >
              <IconBrain size={14} style={{ color: "var(--echo-lavender)" }} />
              <span
                style={{
                  fontSize: 10,
                  fontWeight: 600,
                  color: "var(--echo-lavender)",
                  textTransform: "uppercase",
                  letterSpacing: "0.05em",
                }}
              >
                Steps &amp; Thoughts
              </span>
              <span
                style={{
                  marginLeft: "auto",
                  fontSize: 10,
                  color: "var(--echo-text-secondary)",
                }}
              >
                {entries.length} step{entries.length !== 1 ? "s" : ""}
              </span>
            </div>
            <div
              style={{
                flex: 1,
                minHeight: 0,
                overflow: "hidden",
                display: "flex",
                flexDirection: "column",
              }}
            >
              {entries.length === 0 ? (
                <p
                  style={{
                    padding: 16,
                    margin: 0,
                    fontSize: 13,
                    color: "var(--echo-text-secondary)",
                  }}
                >
                  No steps recorded.
                </p>
              ) : (
                <AnimatedList
                  items={entries}
                  showGradients={true}
                  enableArrowNavigation={false}
                  className="flex-1 min-h-0"
                  fillHeight
                  displayScrollbar={true}
                  interactive={false}
                  renderItem={(item: RunResultEntry) => (
                    <div
                      style={{
                        padding: "10px 12px",
                        borderRadius: 8,
                        background: "rgba(165, 119, 255, 0.04)",
                        border: "1px solid rgba(165, 119, 255, 0.1)",
                      }}
                    >
                      <div
                        style={{
                          display: "flex",
                          alignItems: "flex-start",
                          gap: 8,
                          marginBottom: 6,
                        }}
                      >
                        <span
                          style={{
                            fontSize: 10,
                            fontWeight: 700,
                            color: "var(--echo-lavender)",
                            flexShrink: 0,
                          }}
                        >
                          Step{" "}
                          {runResult?.entries?.length
                            ? item.step
                            : item.step + 1}
                        </span>
                        {item.action && (
                          <div
                            style={{
                              display: "flex",
                              alignItems: "center",
                              gap: 4,
                              flex: 1,
                              minWidth: 0,
                            }}
                          >
                            <IconBolt
                              size={12}
                              style={{
                                color: "var(--echo-cyan)",
                                flexShrink: 0,
                              }}
                            />
                            <span
                              style={{
                                fontSize: 11,
                                fontFamily: "ui-monospace, monospace",
                                color: "var(--echo-text)",
                                wordBreak: "break-all",
                              }}
                            >
                              {item.action}
                            </span>
                          </div>
                        )}
                      </div>
                      <div
                        style={{
                          display: "flex",
                          alignItems: "flex-start",
                          gap: 6,
                        }}
                      >
                        <IconBrain
                          size={12}
                          style={{
                            color: "var(--echo-lavender)",
                            flexShrink: 0,
                            marginTop: 2,
                          }}
                        />
                        <span
                          style={{
                            fontSize: 12,
                            color: "var(--echo-text-secondary)",
                            lineHeight: 1.5,
                            display: "-webkit-box",
                            WebkitLineClamp: 2,
                            WebkitBoxOrient: "vertical",
                            overflow: "hidden",
                          }}
                        >
                          {item.thought || "—"}
                        </span>
                      </div>
                    </div>
                  )}
                />
              )}
            </div>
          </div>
        </div>
      )}
    </SpotlightCard>
  );
}
