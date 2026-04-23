import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  formatWorkflowAbsoluteTime,
  formatWorkflowListTime,
  workflowActivityMillis,
  workflowTimestampMillis,
} from "./workflow-timestamps";

describe("workflowTimestampMillis", () => {
  it("uses toMillis when present", () => {
    expect(workflowTimestampMillis({ toMillis: () => 1_700_000_000_000 })).toBe(1_700_000_000_000);
  });

  it("treats small numbers as seconds and large as millis", () => {
    expect(workflowTimestampMillis(1_700_000_000)).toBe(1_700_000_000_000);
    expect(workflowTimestampMillis(1_700_000_000_000)).toBe(1_700_000_000_000);
  });

  it("parses ISO strings", () => {
    expect(workflowTimestampMillis("2023-11-15T12:00:00.000Z")).toBe(
      new Date("2023-11-15T12:00:00.000Z").getTime(),
    );
  });

  it("reads seconds or _seconds", () => {
    expect(workflowTimestampMillis({ seconds: 1_700_000_000 })).toBe(1_700_000_000_000);
    expect(workflowTimestampMillis({ _seconds: 1_700_000_000 })).toBe(1_700_000_000_000);
  });

  it("returns 0 for unknown shapes", () => {
    expect(workflowTimestampMillis(null)).toBe(0);
    expect(workflowTimestampMillis(undefined)).toBe(0);
    expect(workflowTimestampMillis({})).toBe(0);
    expect(workflowTimestampMillis("not a date")).toBe(0);
  });
});

describe("workflowActivityMillis", () => {
  it("returns max when both timestamps are valid", () => {
    const created = 1_700_000_000_000;
    const updated = 1_700_000_060_000;
    expect(workflowActivityMillis(updated, created)).toBe(updated);
    expect(workflowActivityMillis(created, updated)).toBe(updated);
  });

  it("falls back to whichever side is non-zero", () => {
    const onlyUpdated = 1_700_000_100_000;
    expect(workflowActivityMillis(onlyUpdated, 0)).toBe(onlyUpdated);
    expect(workflowActivityMillis(0, onlyUpdated)).toBe(onlyUpdated);
  });

  it("returns 0 when neither parses", () => {
    expect(workflowActivityMillis(undefined, null)).toBe(0);
  });
});

describe("formatWorkflowListTime", () => {
  const base = new Date("2026-04-23T15:00:00.000Z").getTime();

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(base);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("returns empty when no activity time", () => {
    expect(formatWorkflowListTime(undefined, undefined)).toBe("");
  });

  it('returns "Just now" under one minute', () => {
    const ts = base - 30_000;
    expect(formatWorkflowListTime(ts, ts)).toBe("Just now");
  });

  it("formats minutes and hours", () => {
    expect(formatWorkflowListTime(base - 2 * 60_000, base - 2 * 60_000)).toBe("2 min ago");
    expect(formatWorkflowListTime(base - 60_000, base - 60_000)).toBe("1 min ago");
    expect(formatWorkflowListTime(base - 3_600_000, base - 3_600_000)).toBe("1 hour ago");
    expect(formatWorkflowListTime(base - 5 * 3_600_000, base - 5 * 3_600_000)).toBe("5 hours ago");
  });

  it("uses day labels before switching to absolute", () => {
    expect(formatWorkflowListTime(base - 86_400_000, base - 86_400_000)).toBe("Yesterday");
    expect(formatWorkflowListTime(base - 3 * 86_400_000, base - 3 * 86_400_000)).toBe("3 days ago");
  });

  it("uses absolute formatting for future timestamps", () => {
    const future = base + 86_400_000;
    const s = formatWorkflowListTime(future, future);
    expect(s.length).toBeGreaterThan(0);
    expect(s).not.toMatch(/ago$/);
  });
});

describe("formatWorkflowAbsoluteTime", () => {
  it("returns empty when no timestamp", () => {
    expect(formatWorkflowAbsoluteTime(undefined, undefined)).toBe("");
  });

  it("returns a non-empty localized string when valid", () => {
    const s = formatWorkflowAbsoluteTime(1_700_000_000_000, 1_700_000_000_000);
    expect(s.length).toBeGreaterThan(0);
  });
});
