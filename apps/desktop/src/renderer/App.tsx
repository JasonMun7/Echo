import { useState, useEffect, useRef, useCallback } from "react";
import {
  IconPlayerPlayFilled,
  IconUpload,
  IconPlayerRecord,
  IconLogin,
  IconLogout,
  IconTrash,
  IconExternalLink,
  IconSearch,
  IconCalendarClock,
  IconChevronLeft,
  IconSun,
  IconMoon,
  IconDots,
  IconMenu2,
  IconPencil,
  IconInfoCircle,
  IconSparkles,
  IconPower,
  IconDeviceDesktop,
  IconJumpRope,
} from "@tabler/icons-react";
import RecordingHud from "./RecordingHud";
import { EchoPrismLiveKitSession } from "./EchoPrismLiveKitSession";
import RunHud from "./RunHud";
import RunLogsSection from "./RunLogsSection";
import HazeOverlay from "./HazeOverlay";
import WorkflowDetailView from "./WorkflowDetailView";
import WorkflowEditView from "./WorkflowEditView";
import ScheduleView from "./ScheduleView";
import echoLogo from "./assets/echo_logo.png";
import GradientText from "./reactbits/GradientText";
import ShinyText from "./reactbits/ShinyText";
import SpotlightCard from "./reactbits/SpotlightCard";
import Threads from "@/components/Threads";
import Orb from "./reactbits/Orb";
import { useTheme } from "./useTheme";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import AnimatedList from "@/components/AnimatedList";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Input } from "@/components/ui/input";
import { AnimatePresence, motion } from "motion/react";
import {
  useAuthStore,
  useUIStore,
  useWorkflowsStore,
  useRunStore,
  useRecordingStore,
} from "@/stores";
import { isLatestOrLastModified } from "@/stores/workflows-store";
import { useRecording } from "@/hooks/use-recording";
function useWindowType(): { windowType: string; mode: string } {
  const [params, setParams] = useState({ windowType: "", mode: "" });
  useEffect(() => {
    const search = typeof window !== "undefined" ? window.location.search : "";
    const p = new URLSearchParams(search);
    setParams({
      windowType: p.get("windowType") ?? "",
      mode: p.get("mode") ?? "",
    });
  }, []);
  return params;
}

const API_URL =
  (import.meta as { env?: { VITE_API_URL?: string } }).env?.VITE_API_URL ??
  "http://localhost:8000";

function MainWindowApp() {
  const { theme, toggleTheme } = useTheme();
  const workflowSearchRef = useRef<HTMLDivElement>(null);

  const token = useAuthStore((s) => s.token);
  const screenPermissionRequired = useAuthStore(
    (s) => s.screenPermissionRequired
  );
  const loadToken = useAuthStore((s) => s.loadToken);
  const signIn = useAuthStore((s) => s.signIn);
  const signOut = useAuthStore((s) => s.signOut);
  const setScreenPermissionRequired = useAuthStore(
    (s) => s.setScreenPermissionRequired
  );

  const page = useUIStore((s) => s.page);
  const setPage = useUIStore((s) => s.setPage);
  const echoPrismModalOpen = useUIStore((s) => s.echoPrismModalOpen);
  const setEchoPrismModalOpen = useUIStore((s) => s.setEchoPrismModalOpen);
  const isCollapsed = useUIStore((s) => s.isCollapsed);
  const setIsCollapsed = useUIStore((s) => s.setIsCollapsed);
  const workflowSearchOpen = useUIStore((s) => s.workflowSearchOpen);
  const setWorkflowSearchOpen = useUIStore((s) => s.setWorkflowSearchOpen);
  const workflowSearchQuery = useUIStore((s) => s.workflowSearchQuery);
  const setWorkflowSearchQuery = useUIStore((s) => s.setWorkflowSearchQuery);

  const workflows = useWorkflowsStore((s) => s.workflows);
  const workflowsLoading = useWorkflowsStore((s) => s.workflowsLoading);
  const workflowsError = useWorkflowsStore((s) => s.workflowsError);
  const selectedWorkflowId = useWorkflowsStore((s) => s.selectedWorkflowId);
  const selectedWorkflowType = useWorkflowsStore((s) => s.selectedWorkflowType);
  const workflow = useWorkflowsStore((s) => s.workflow);
  const steps = useWorkflowsStore((s) => s.steps);
  const fetching = useWorkflowsStore((s) => s.fetching);
  const fetchError = useWorkflowsStore((s) => s.fetchError);
  const loadWorkflows = useWorkflowsStore((s) => s.loadWorkflows);
  const handleSelectWorkflow = useWorkflowsStore((s) => s.handleSelectWorkflow);
  const handleDeleteWorkflow = useWorkflowsStore((s) => s.handleDeleteWorkflow);
  const selectWorkflow = useWorkflowsStore((s) => s.selectWorkflow);

  const runResult = useRunStore((s) => s.runResult);
  const runResultDismissed = useRunStore((s) => s.runResultDismissed);
  const dismissRunResult = useRunStore((s) => s.dismissRunResult);
  const handleRunWorkflow = useRunStore((s) => s.handleRunWorkflow);
  const handleRunStarted = useRunStore((s) => s.handleRunStarted);

  const recording = useRecordingStore((s) => s.recording);
  const recordedBlob = useRecordingStore((s) => s.recordedBlob);
  const recordedDuration = useRecordingStore((s) => s.recordedDuration);
  const recordStatus = useRecordingStore((s) => s.recordStatus);
  const recordError = useRecordingStore((s) => s.recordError);
  const uploadAndSynthesize = useRecordingStore((s) => s.uploadAndSynthesize);

  const {
    startRecording,
    stopRecording,
    pauseResumeRecording,
    discardRecording,
    redoRecording,
  } = useRecording();

  const refreshAuth = useRef<() => void>(() => {});
  refreshAuth.current = async () => {
    const t = await loadToken();
    if (t) loadWorkflows();
  };

  // Permission screen: poll to auto-dismiss when user grants permission
  useEffect(() => {
    if (!screenPermissionRequired) return;
    const interval = setInterval(async () => {
      const granted = await window.electronAPI?.checkScreenPermission?.();
      if (granted) setScreenPermissionRequired(false);
    }, 2000);
    return () => clearInterval(interval);
  }, [screenPermissionRequired, setScreenPermissionRequired]);

  useEffect(() => {
    loadToken();
  }, [loadToken]);

  useEffect(() => {
    const handler = () => refreshAuth.current();
    window.electronAPI?.onAuthTokenReceived?.(handler);
    return () => window.electronAPI?.removeAuthTokenReceivedListener?.();
  }, []);

  useEffect(() => {
    const onFocus = () => refreshAuth.current();
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, []);

  useEffect(() => {
    if (token) loadWorkflows();
    else useWorkflowsStore.getState().resetOnSignOut();
  }, [token, loadWorkflows]);

  useEffect(() => {
    if (!workflowSearchOpen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setWorkflowSearchOpen(false);
    };
    const onClickOutside = (e: MouseEvent) => {
      if (
        workflowSearchRef.current &&
        !workflowSearchRef.current.contains(e.target as Node)
      ) {
        setWorkflowSearchOpen(false);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("mousedown", onClickOutside);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("mousedown", onClickOutside);
    };
  }, [workflowSearchOpen, setWorkflowSearchOpen]);

  useEffect(() => {
    window.electronAPI?.onRunFromUrl?.(handleRunStarted);
    return () => window.electronAPI?.removeRunFromUrlListener?.();
  }, [handleRunStarted]);

  // Handle open-echoprism (web opens EchoPrism modal)
  useEffect(() => {
    window.electronAPI?.onOpenEchoPrism?.(() => setEchoPrismModalOpen(true));
    return () => window.electronAPI?.removeOpenEchoPrismListener?.();
  }, [setEchoPrismModalOpen]);

  const startRecordingRef = useRef<() => Promise<void>>(() => Promise.resolve());
  startRecordingRef.current = startRecording;

  useEffect(() => {
    window.electronAPI?.onStartCapture?.(() => startRecordingRef.current?.());
    return () => window.electronAPI?.removeStartCaptureListener?.();
  }, []);

  useEffect(() => {
    const handler = (payload: { action: string; duration?: number }) => {
      if (payload.action === "pause") pauseResumeRecording();
      if (payload.action === "stop") {
        stopRecording(payload.duration);
        window.electronAPI?.exitRecordingMode?.();
      }
      if (payload.action === "discard") {
        discardRecording();
        window.electronAPI?.exitRecordingMode?.();
      }
      if (payload.action === "redo") redoRecording();
    };
    window.electronAPI?.onRecordingCommand?.(handler);
    return () => window.electronAPI?.removeRecordingCommandListener?.();
  }, [pauseResumeRecording, stopRecording, discardRecording, redoRecording]);

  // Sync collapse state from main process
  useEffect(() => {
    window.electronAPI?.onDesktopStateChanged?.((arg) =>
      setIsCollapsed(arg.collapsed)
    );
    return () => window.electronAPI?.removeDesktopStateChangedListener?.();
  }, [setIsCollapsed]);

  const handleSignOut = async () => {
    await signOut();
    useWorkflowsStore.getState().resetOnSignOut();
    setPage("home");
  };

  const formatDuration = (secs: number) => {
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    return `${m}:${s.toString().padStart(2, "0")}`;
  };

  const handleRunFromList = async (w: {
    id: string;
    workflow_type?: string;
  }) => {
    const t = token ?? (await loadToken());
    if (!t) return;
    const result = await window.electronAPI?.fetchWorkflow?.({
      workflowId: w.id,
      token: t,
    });
    if (!result || "error" in result) return;
    const { workflow, steps: fetchedSteps } = result;
    if (!fetchedSteps?.length) return;
    await handleRunWorkflow({
      workflowId: w.id,
      steps: fetchedSteps,
      workflowType:
        (workflow as { workflow_type?: string }).workflow_type ?? "desktop",
    });
  };

  if (screenPermissionRequired) {
    const isDark = theme === "dark";
    return (
      <div
        style={{
          position: "relative",
          minHeight: "100vh",
          overflow: "hidden",
          background: isDark
            ? "linear-gradient(135deg, #150a35 0%, #2d1b69 50%, #0d0620 100%)"
            : "linear-gradient(135deg, #f5f0ff 0%, #ede5fc 50%, #e8e0f5 100%)",
        }}
      >
        <button
          type="button"
          className="echo-theme-toggle"
          onClick={toggleTheme}
          title={isDark ? "Switch to light mode" : "Switch to dark mode"}
          style={{
            position: "absolute",
            top: 16,
            right: 16,
            zIndex: 10,
          }}
        >
          {isDark ? <IconSun size={18} /> : <IconMoon size={18} />}
        </button>
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            minHeight: "100vh",
            padding: 32,
          }}
        >
          <div
            style={{
              maxWidth: 440,
              width: "100%",
              padding: 40,
              textAlign: "center",
              background: isDark
                ? "rgba(255, 255, 255, 0.08)"
                : "rgba(255, 255, 255, 0.9)",
              backdropFilter: "blur(16px)",
              WebkitBackdropFilter: "blur(16px)",
              border: isDark
                ? "1px solid rgba(165, 119, 255, 0.15)"
                : "1px solid rgba(165, 119, 255, 0.2)",
              borderRadius: "1rem",
              boxShadow: isDark
                ? "0 4px 24px rgba(0, 0, 0, 0.2)"
                : "0 4px 24px rgba(100, 60, 180, 0.08)",
            }}
          >
            <div
              style={{
                width: 56,
                height: 56,
                borderRadius: "0.75rem",
                background: "rgba(165, 119, 255, 0.15)",
                border: "1px solid rgba(165, 119, 255, 0.25)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                margin: "0 auto 24px",
                color: "var(--echo-lavender)",
              }}
            >
              <IconDeviceDesktop size={28} stroke={1.5} />
            </div>
            <h1
              style={{
                fontSize: "1.5rem",
                fontWeight: 600,
                color: "var(--echo-text)",
                marginBottom: 12,
                lineHeight: 1.3,
              }}
            >
              Screen recording permission
            </h1>
            <p
              style={{
                fontSize: 15,
                color: "var(--echo-text-secondary)",
                marginBottom: 12,
                lineHeight: 1.6,
              }}
            >
              Echo needs Screen Recording access to capture workflows, run
              automations, and power EchoPrism.
            </p>
            <p
              style={{
                fontSize: 14,
                color: "var(--echo-text-secondary)",
                marginBottom: 28,
                lineHeight: 1.6,
              }}
            >
              Go to{" "}
              <strong style={{ color: "var(--echo-text)" }}>
                System Settings → Privacy &amp; Security → Screen Recording
              </strong>{" "}
              and enable Echo.
            </p>
            <button
              type="button"
              className="echo-btn-cyan-lavender"
              style={{
                width: "100%",
                marginBottom: 20,
                padding: "0.625rem 1.25rem",
                borderRadius: "0.75rem",
                fontWeight: 600,
              }}
              onClick={() => window.electronAPI?.openSystemSettings?.()}
            >
              Open System Settings
            </button>
            <p
              style={{
                fontSize: 13,
                color: "var(--echo-text-dim)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: 8,
              }}
            >
              <span
                style={{
                  display: "inline-block",
                  width: 8,
                  height: 8,
                  borderRadius: "50%",
                  background: "var(--echo-lavender)",
                  animation: "echo-pulse 1.2s ease-in-out infinite",
                }}
              />
              Permission will be detected automatically once granted
            </p>
          </div>
        </div>
      </div>
    );
  }

  if (!token) {
    const isDark = theme === "dark";
    return (
      <div
        style={{
          position: "relative",
          minHeight: "100vh",
          overflow: "hidden",
          background: isDark
            ? "linear-gradient(135deg, #150a35 0%, #2d1b69 50%, #0d0620 100%)"
            : "linear-gradient(135deg, #f5f0ff 0%, #ede5fc 50%, #e8e0f5 100%)",
        }}
      >
        <button
          type="button"
          className="echo-theme-toggle"
          onClick={toggleTheme}
          title={isDark ? "Switch to light mode" : "Switch to dark mode"}
          style={{
            position: "absolute",
            top: 16,
            right: 16,
            zIndex: 10,
          }}
        >
          {isDark ? <IconSun size={18} /> : <IconMoon size={18} />}
        </button>
        <div
          style={{
            position: "relative",
            zIndex: 1,
            padding: 32,
            maxWidth: 400,
            margin: "0 auto",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            minHeight: "100vh",
          }}
        >
          <div
            style={{
              background: isDark
                ? "rgba(255, 255, 255, 0.08)"
                : "rgba(255, 255, 255, 0.9)",
              backdropFilter: "blur(16px)",
              WebkitBackdropFilter: "blur(16px)",
              border: isDark
                ? "1px solid rgba(255, 255, 255, 0.12)"
                : "1px solid rgba(165, 119, 255, 0.2)",
              borderRadius: 24,
              padding: 40,
              width: "100%",
              boxShadow: isDark
                ? "0 8px 32px rgba(0, 0, 0, 0.2)"
                : "0 8px 32px rgba(165, 119, 255, 0.12)",
            }}
          >
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                gap: 20,
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
                <img
                  src={echoLogo}
                  alt="Echo"
                  width={56}
                  height={56}
                  style={{ width: 56, height: 56, objectFit: "contain" }}
                />
                <GradientText
                  colors={["#A577FF", "#21C4DD", "#A577FF"]}
                  animationSpeed={6}
                >
                  <h1
                    style={{ fontSize: "1.75rem", fontWeight: 700, margin: 0 }}
                  >
                    Echo Desktop
                  </h1>
                </GradientText>
              </div>
              <p
                style={{
                  color: isDark
                    ? "rgba(255, 255, 255, 0.75)"
                    : "var(--echo-text-secondary)",
                  fontSize: 14,
                  textAlign: "center",
                  margin: 0,
                  lineHeight: 1.5,
                }}
              >
                Sign in to access/run workflows
              </p>
              <button
                type="button"
                className="echo-btn-cyan-lavender"
                onClick={signIn}
                style={{
                  width: "100%",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 10,
                  padding: "14px 24px",
                  borderRadius: 12,
                  fontSize: 15,
                  fontWeight: 600,
                }}
              >
                <IconLogin size={20} />
                Sign in
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  const handleDeleteWithConfirm = async (workflowId: string) => {
    if (!confirm("Delete this workflow? This cannot be undone.")) return;
    await handleDeleteWorkflow(workflowId);
  };

  const handleCollapse = () => {
    window.electronAPI?.desktopCollapse?.();
  };

  const handleExpand = () => {
    window.electronAPI?.desktopExpand?.();
  };

  return (
    <>
      <TooltipProvider>
        <AnimatePresence mode="wait">
          {isCollapsed ? (
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  key="collapsed"
                  type="button"
                  onClick={handleExpand}
                  style={{
                    position: "fixed",
                    inset: 0,
                    width: "100%",
                    height: "100%",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    borderRadius: 14,
                    cursor: "pointer",
                    border: "none",
                    background:
                      theme === "dark"
                        ? "rgba(21, 10, 53, 0.92)"
                        : "rgba(255, 255, 255, 0.98)",
                    boxShadow:
                      theme === "dark"
                        ? "0 4px 24px rgba(0,0,0,0.35), 0 0 0 1px rgba(165, 119, 255, 0.2)"
                        : "0 6px 28px rgba(165, 119, 255, 0.25), 0 0 0 1px rgba(165, 119, 255, 0.15)",
                    backdropFilter: "blur(20px)",
                    WebkitBackdropFilter: "blur(20px)",
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.transform = "scale(1.06)";
                    e.currentTarget.style.boxShadow =
                      theme === "dark"
                        ? "0 8px 32px rgba(0,0,0,0.4), 0 0 0 1px rgba(165, 119, 255, 0.3)"
                        : "0 8px 32px rgba(165, 119, 255, 0.35), 0 0 0 1px rgba(165, 119, 255, 0.25)";
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.transform = "scale(1)";
                    e.currentTarget.style.boxShadow =
                      theme === "dark"
                        ? "0 4px 24px rgba(0,0,0,0.35), 0 0 0 1px rgba(165, 119, 255, 0.2)"
                        : "0 6px 28px rgba(165, 119, 255, 0.25), 0 0 0 1px rgba(165, 119, 255, 0.15)";
                  }}
                >
                  <img
                    src={echoLogo}
                    alt="Echo"
                    width={36}
                    height={36}
                    style={{ width: 36, height: 36, objectFit: "contain" }}
                  />
                </button>
              </TooltipTrigger>
              <TooltipContent>Expand</TooltipContent>
            </Tooltip>
          ) : (
            <div
              key="expanded"
              style={{
                position: "relative",
                zIndex: 1,
                padding: 16,
                width: "100%",
                minHeight: "100vh",
                display: "flex",
                flexDirection: "column",
                overflow: "hidden",
              }}
            >
              {/* Header — collapse, icon-only Start Capture, dropdown, theme toggle */}
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  marginBottom: 20,
                  gap: 8,
                }}
              >
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 10,
                    cursor: "pointer",
                    flex: 1,
                    minWidth: 0,
                  }}
                  onClick={() => setPage("home")}
                >
                  <img
                    src={echoLogo}
                    alt="Echo"
                    width={36}
                    height={36}
                    style={{
                      width: 36,
                      height: 36,
                      objectFit: "contain",
                      flexShrink: 0,
                    }}
                  />
                  <div style={{ minWidth: 0 }}>
                    <GradientText
                      colors={["#A577FF", "#7C3AED", "#21C4DD", "#A577FF"]}
                      animationSpeed={6}
                    >
                      <h1
                        style={{
                          fontSize: "1.1rem",
                          fontWeight: 700,
                          margin: 0,
                        }}
                      >
                        Echo
                      </h1>
                    </GradientText>
                    <p
                      style={{
                        fontSize: 11,
                        color: "var(--echo-text-muted)",
                        margin: 0,
                      }}
                    >
                      {workflows.length} workflow
                      {workflows.length !== 1 ? "s" : ""}
                    </p>
                  </div>
                </div>
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 4,
                    flexShrink: 0,
                  }}
                >
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <button
                        type="button"
                        onClick={() => setEchoPrismModalOpen(true)}
                        style={{
                          width: 36,
                          height: 36,
                          borderRadius: "50%",
                          padding: 0,
                          border: "none",
                          cursor: "pointer",
                          overflow: "hidden",
                          flexShrink: 0,
                          boxShadow: "0 2px 12px rgba(165,119,255,0.35)",
                        }}
                        onMouseEnter={(e) => {
                          e.currentTarget.style.transform = "scale(1.08)";
                          e.currentTarget.style.boxShadow =
                            "0 4px 16px rgba(165,119,255,0.45)";
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.style.transform = "scale(1)";
                          e.currentTarget.style.boxShadow =
                            "0 2px 12px rgba(165,119,255,0.35)";
                        }}
                      >
                        <div style={{ width: "100%", height: "100%" }}>
                          <Orb
                            hue={0}
                            hoverIntensity={0.3}
                            rotateOnHover
                            forceHoverState={false}
                            backgroundColor={
                              theme === "dark" ? "#0a0414" : "#f5f0ff"
                            }
                          />
                        </div>
                      </button>
                    </TooltipTrigger>
                    <TooltipContent>EchoPrism</TooltipContent>
                  </Tooltip>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={toggleTheme}
                        className="h-8 w-8 rounded-lg"
                      >
                        {theme === "dark" ? (
                          <IconSun size={18} />
                        ) : (
                          <IconMoon size={18} />
                        )}
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>
                      {theme === "dark"
                        ? "Switch to light mode"
                        : "Switch to dark mode"}
                    </TooltipContent>
                  </Tooltip>
                  <DropdownMenu>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <DropdownMenuTrigger asChild>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 rounded-lg"
                          >
                            <IconMenu2 size={18} />
                          </Button>
                        </DropdownMenuTrigger>
                      </TooltipTrigger>
                      <TooltipContent>Menu</TooltipContent>
                    </Tooltip>
                    <DropdownMenuContent
                      align="end"
                      className="w-48 bg-[var(--echo-surface-solid)] text-[var(--echo-text)] border border-[var(--echo-border)] shadow-lg"
                    >
                      <DropdownMenuItem
                        onClick={() => setEchoPrismModalOpen(true)}
                      >
                        <IconSparkles size={16} />
                        EchoPrism
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        onClick={() => {
                          setPage(page === "schedule" ? "home" : "schedule");
                        }}
                      >
                        <IconCalendarClock size={16} />
                        Schedule
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        onClick={() => window.electronAPI?.openWebUI?.()}
                      >
                        <IconExternalLink size={16} />
                        Open in web
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={handleSignOut}>
                        <IconLogout size={16} />
                        Sign out
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        onClick={() => window.electronAPI?.quitApp?.()}
                      >
                        <IconPower size={16} />
                        Quit
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 rounded-lg"
                        onClick={handleCollapse}
                      >
                        <IconChevronLeft size={18} />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>Collapse to side</TooltipContent>
                  </Tooltip>
                </div>
              </div>

              {/* Page-based content */}
              {page === "home" && (
                <div
                  style={{
                    flex: 1,
                    display: "flex",
                    flexDirection: "column",
                    minHeight: 0,
                    overflow: "hidden",
                  }}
                >
                  {/* Start Capture — gradient button */}
                  <div style={{ marginBottom: 20 }}>
                    {!recording && !recordedBlob && (
                      <button
                        type="button"
                        onClick={startRecording}
                        className="echo-btn-cyan-lavender mt-4 w-full flex items-center justify-center gap-2 rounded-lg px-4 py-3 font-medium text-white"
                      >
                        <IconPlayerRecord size={18} />
                        Start Capture
                      </button>
                    )}

                    {/* Review state: recording stopped, blob ready */}
                    {!recording && recordedBlob && (
                      <div className="echo-recording-bar rounded-lg border border-[#A577FF]/20 bg-[#F5F7FC] dark:bg-[#150A35]/30 p-4 flex items-center gap-4">
                        <span
                          style={{
                            fontSize: 13,
                            color: "var(--echo-text-secondary)",
                            flexGrow: 1,
                          }}
                        >
                          Recording ready — {formatDuration(recordedDuration)}
                        </span>
                        <button
                          type="button"
                          className="echo-btn-cyan-lavender flex items-center gap-1.5 rounded-lg px-4 py-2 text-sm font-semibold text-white disabled:opacity-40 disabled:cursor-not-allowed"
                          onClick={uploadAndSynthesize}
                          disabled={!!recordStatus}
                        >
                          <IconUpload size={16} />
                          {recordStatus || "Synthesize workflow"}
                        </button>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <button
                              type="button"
                              className="echo-btn-danger flex shrink-0 items-center justify-center rounded-lg p-2"
                              onClick={discardRecording}
                              aria-label="Discard"
                            >
                              <IconTrash size={16} />
                            </button>
                          </TooltipTrigger>
                          <TooltipContent>Discard</TooltipContent>
                        </Tooltip>
                      </div>
                    )}

                    {(recordError || recordStatus) && (
                      <p
                        style={{
                          color: recordError
                            ? "var(--echo-error)"
                            : "var(--echo-success)",
                          fontSize: 13,
                          marginTop: 8,
                        }}
                      >
                        {recordError || recordStatus}
                      </p>
                    )}
                  </div>

                  {/* Workflows list */}
                  <SpotlightCard style={{ padding: 20, marginBottom: 20 }}>
                    <div
                      ref={workflowSearchRef}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 8,
                        marginBottom: 12,
                      }}
                    >
                      <h2
                        style={{
                          fontSize: "1rem",
                          fontWeight: 600,
                          color: "var(--echo-lavender)",
                          margin: 0,
                          flexShrink: 0,
                        }}
                      >
                        Workflows
                      </h2>
                      <AnimatePresence>
                        {workflowSearchOpen && (
                          <motion.div
                            initial={{ opacity: 0, width: 0 }}
                            animate={{ opacity: 1, width: 180 }}
                            exit={{ opacity: 0, width: 0 }}
                            transition={{ duration: 0.2, ease: "easeOut" }}
                            style={{ overflow: "hidden" }}
                          >
                            <Input
                              placeholder="Search workflows…"
                              value={workflowSearchQuery}
                              onChange={(e) =>
                                setWorkflowSearchQuery(e.target.value)
                              }
                              autoFocus
                              className="w-full border-[rgba(165,119,255,0.2)] text-[var(--echo-text)] placeholder:text-[var(--echo-text-secondary)] focus-visible:ring-[#A577FF]/30"
                              style={{
                                fontSize: 14,
                                backgroundColor: "var(--echo-surface-solid)",
                              }}
                            />
                          </motion.div>
                        )}
                      </AnimatePresence>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <button
                            type="button"
                            onClick={() =>
                              setWorkflowSearchOpen((open) => !open)
                            }
                            style={{
                              background: "none",
                              border: "none",
                              cursor: "pointer",
                              color: "#A577FF",
                              padding: 4,
                              display: "flex",
                              alignItems: "center",
                              flexShrink: 0,
                            }}
                          >
                            <IconSearch size={18} />
                          </button>
                        </TooltipTrigger>
                        <TooltipContent>Search workflows</TooltipContent>
                      </Tooltip>
                    </div>
                    {workflowsLoading ? (
                      <p
                        style={{
                          color: "var(--echo-text-secondary)",
                          fontSize: 14,
                        }}
                      >
                        Loading workflows…
                      </p>
                    ) : workflowsError ? (
                      <p style={{ color: "#ef4444", fontSize: 14 }}>
                        {workflowsError}
                      </p>
                    ) : workflows.length === 0 ? (
                      <div
                        style={{
                          position: "relative",
                          minHeight: 250,
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
                              animation:
                                "run-logs-placeholder-pulse 3s ease-in-out infinite",
                            }}
                          >
                            <IconJumpRope
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
                            No workflows yet. Record a screen to create one.
                          </p>
                        </div>
                      </div>
                    ) : (
                      (() => {
                        const q = workflowSearchQuery.trim().toLowerCase();
                        const filtered = q
                          ? workflows.filter((w) => {
                              const name = (w.name ?? w.id).toLowerCase();
                              const type = (
                                w.workflow_type ?? ""
                              ).toLowerCase();
                              return name.includes(q) || type.includes(q);
                            })
                          : workflows;
                        if (filtered.length === 0 && q) {
                          return (
                            <p
                              style={{
                                color: "var(--echo-text-secondary)",
                                fontSize: 14,
                                margin: 0,
                                padding: 16,
                                textAlign: "center",
                              }}
                            >
                              No workflows match &quot;{workflowSearchQuery}
                              &quot;
                            </p>
                          );
                        }
                        return (
                          <AnimatedList
                            items={filtered}
                            onItemSelect={(w: {
                              id: string;
                              workflow_type?: string;
                            }) => handleRunFromList(w)}
                            renderItem={(w: {
                              id: string;
                              name?: string;
                              workflow_type?: string;
                              createdAt?: unknown;
                              updatedAt?: unknown;
                            }) => {
                              const isLatest = isLatestOrLastModified(w, filtered);
                              return (
                              <div
                                key={w.id}
                                className="group/workflow cursor-default relative"
                                style={{
                                  padding: "10px 12px",
                                  borderRadius: 8,
                                  border: isLatest
                                    ? "1px solid rgba(165,119,255,0.4)"
                                    : "1px solid rgba(165,119,255,0.12)",
                                  background: isLatest
                                    ? "rgba(165,119,255,0.06)"
                                    : "var(--echo-surface)",
                                  display: "flex",
                                  alignItems: "center",
                                  overflow: "hidden",
                                }}
                                onClick={(e) => e.stopPropagation()}
                              >
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <button
                                      type="button"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        handleRunFromList(w);
                                      }}
                                      className="workflow-play-icon inline-flex shrink-0 items-center justify-center rounded-md p-1.5 pr-2 transition-all hover:bg-accent hover:shadow-[0_0_16px_var(--echo-glow)]"
                                      style={{
                                        border: "none",
                                        cursor: "pointer",
                                        color: "var(--echo-text-secondary)",
                                      }}
                                    >
                                      <IconPlayerPlayFilled
                                        size={14}
                                        color="currentColor"
                                      />
                                    </button>
                                  </TooltipTrigger>
                                  <TooltipContent>Run workflow</TooltipContent>
                                </Tooltip>
                                <span
                                  style={{
                                    flex: 1,
                                    fontWeight: 500,
                                    color: "var(--echo-text)",
                                    fontSize: 13,
                                    overflow: "hidden",
                                    textOverflow: "ellipsis",
                                    whiteSpace: "nowrap",
                                    paddingRight: 8,
                                  }}
                                >
                                  {w.name ?? w.id}
                                </span>
                                {w.workflow_type && (
                                  <span
                                    style={{
                                      fontSize: 10,
                                      fontWeight: 600,
                                      padding: "2px 5px",
                                      borderRadius: 99,
                                      background:
                                        w.workflow_type === "desktop"
                                          ? "rgba(165,119,255,0.15)"
                                          : "rgba(34,197,94,0.12)",
                                      color:
                                        w.workflow_type === "desktop"
                                          ? "#A577FF"
                                          : "#16a34a",
                                      flexShrink: 0,
                                    }}
                                  >
                                    {w.workflow_type === "desktop"
                                      ? "Desktop"
                                      : "Browser"}
                                  </span>
                                )}
                                <DropdownMenu>
                                  <Tooltip>
                                    <TooltipTrigger asChild>
                                      <DropdownMenuTrigger asChild>
                                        <Button
                                          variant="ghost"
                                          size="icon"
                                          className="h-7 w-7 shrink-0 ml-auto rounded-md text-black px-2 transition-shadow hover:shadow-[0_0_16px_var(--echo-glow)]"
                                          onClick={(e) => e.stopPropagation()}
                                        >
                                          <IconDots size={14} />
                                        </Button>
                                      </DropdownMenuTrigger>
                                    </TooltipTrigger>
                                    <TooltipContent>
                                      Workflow options
                                    </TooltipContent>
                                  </Tooltip>
                                  <DropdownMenuContent
                                    align="end"
                                    className="w-40 bg-[var(--echo-surface-solid)] text-[var(--echo-text)] border border-[var(--echo-border)] shadow-lg"
                                  >
                                    <DropdownMenuItem
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        selectWorkflow(w.id);
                                        handleSelectWorkflow(w.id);
                                        setPage("detail");
                                      }}
                                    >
                                      <IconInfoCircle size={14} />
                                      Summary
                                    </DropdownMenuItem>
                                    <DropdownMenuItem
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        selectWorkflow(w.id);
                                        setPage("edit");
                                      }}
                                    >
                                      <IconPencil size={14} />
                                      Edit
                                    </DropdownMenuItem>
                                    <DropdownMenuItem
                                      variant="destructive"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        handleDeleteWithConfirm(w.id);
                                      }}
                                    >
                                      <IconTrash size={14} />
                                      Delete
                                    </DropdownMenuItem>
                                  </DropdownMenuContent>
                                </DropdownMenu>
                              </div>
                            );
                            }}
                            maxHeight="280px"
                            displayScrollbar={true}
                            showGradients={true}
                            enableArrowNavigation={true}
                            className="p-0"
                            scrollContainerClassName="!p-0"
                            keyExtractor={(w: { id: string }) => w.id}
                          />
                        );
                      })()
                    )}
                    {fetching && (
                      <p
                        style={{
                          color: "var(--echo-text-secondary)",
                          fontSize: 13,
                          marginTop: 8,
                        }}
                      >
                        Loading workflow…
                      </p>
                    )}
                    {fetchError && (
                      <p
                        style={{ color: "#ef4444", fontSize: 13, marginTop: 8 }}
                      >
                        {fetchError}
                      </p>
                    )}
                  </SpotlightCard>

                  {/* Run Logs — placeholder until first run; logs + success/failure after run */}
                  <RunLogsSection
                    runResult={runResult}
                    dismissed={runResultDismissed}
                    onDismiss={dismissRunResult}
                    onOpenWebUI={(path) =>
                      window.electronAPI?.openWebUI?.(path)
                    }
                    workflowName={
                      runResult?.workflowId
                        ? (workflows.find((w) => w.id === runResult.workflowId)
                            ?.name ?? runResult.workflowId)
                        : undefined
                    }
                  />
                </div>
              )}

              {page === "detail" && selectedWorkflowId && (
                <WorkflowDetailView
                  workflowId={selectedWorkflowId}
                  token={token}
                  apiUrl={API_URL}
                  onBack={() => {
                    setPage("home");
                    loadWorkflows();
                  }}
                  onEdit={() => setPage("edit")}
                  onRun={handleRunWorkflow}
                  onDeleted={() => {
                    setPage("home");
                    loadWorkflows();
                  }}
                  onOpenWebUI={(p) => window.electronAPI?.openWebUI(p)}
                />
              )}

              {page === "edit" && selectedWorkflowId && (
                <WorkflowEditView
                  workflowId={selectedWorkflowId}
                  token={token}
                  apiUrl={API_URL}
                  onBack={() => setPage("detail")}
                  onSaved={() => setPage("detail")}
                />
              )}

              {page === "schedule" && (
                <ScheduleView
                  token={token}
                  apiUrl={API_URL}
                  onBack={() => setPage("home")}
                />
              )}
            </div>
          )}
        </AnimatePresence>
      </TooltipProvider>

      {/* EchoPrism (Voice + Chat) via LiveKit AgentSessionView */}
      {echoPrismModalOpen && (
        <EchoPrismLiveKitSession
          onClose={() => setEchoPrismModalOpen(false)}
          getToken={loadToken}
          onRunStarted={handleRunStarted}
        />
      )}
    </>
  );
}

export default function App() {
  const { windowType, mode } = useWindowType();
  useTheme(); // Sync theme (localStorage) to document for all windows including HUD

  useEffect(() => {
    if (windowType === "hud" || windowType === "haze") {
      document.body.style.background = "transparent";
      return () => {
        document.body.style.background = "";
      };
    }
  }, [windowType]);

  if (windowType === "hud") {
    if (mode === "recording") {
      return (
        <div
          style={{
            width: "100%",
            height: "100%",
            display: "flex",
            alignItems: "stretch",
          }}
        >
          <RecordingHud />
        </div>
      );
    }
    if (mode === "run") {
      return <RunHudWrapper />;
    }
    return null;
  }

  if (windowType === "haze") {
    return (
      <div style={{ width: "100%", height: "100%" }}>
        <HazeOverlay />
      </div>
    );
  }

  return <MainWindowApp />;
}

function RunHudWrapper() {
  const [runPaused, setRunPaused] = useState(false);
  const [liveProgress, setLiveProgress] = useState<
    Array<{ thought: string; action: string; step: number }>
  >([]);
  const [callUserReason, setCallUserReason] = useState<string | null>(null);
  const [isAwaitingUser, setIsAwaitingUser] = useState(false);

  useEffect(() => {
    const handler = (entry: {
      thought: string;
      action: string;
      step: number;
    }) => {
      setLiveProgress((prev) => [...prev.slice(-19), entry]);
    };
    window.electronAPI?.onRunProgress?.(handler);
    return () => window.electronAPI?.removeRunProgressListener?.();
  }, []);

  useEffect(() => {
    const handler = (arg: { reason: string }) => {
      setCallUserReason(arg.reason);
      setIsAwaitingUser(true);
    };
    window.electronAPI?.onRunAwaitingUser?.(handler);
    return () => window.electronAPI?.removeRunAwaitingUserListener?.();
  }, []);

  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        alignItems: "stretch",
        minHeight: 0,
      }}
    >
      <RunHud
        runPaused={runPaused}
        setRunPaused={setRunPaused}
        liveProgress={liveProgress}
        callUserReason={callUserReason}
        isAwaitingUser={isAwaitingUser}
        onCallUserFeedbackSent={() => {
          setIsAwaitingUser(false);
          setCallUserReason(null);
        }}
      />
    </div>
  );
}
