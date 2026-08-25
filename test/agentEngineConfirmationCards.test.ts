import { assert } from "chai";

import type { AgentPendingAction } from "../src/agent/types";
import { createPendingConfirmationCardCoordinator } from "../src/modules/contextPanel/agentMode/agentEngine";

function pendingAction(title = "Review note update"): AgentPendingAction {
  return {
    toolName: "note_write",
    title,
    confirmLabel: "Apply",
    cancelLabel: "Cancel",
    fields: [],
  };
}

describe("agent approval card coordination", function () {
  it("renders the trace first and uses an inline card only as a fallback", function () {
    const scheduled: Array<{ callback: () => void; delayMs: number }> = [];
    const shown: string[] = [];
    let refreshes = 0;
    const coordinator = createPendingConfirmationCardCoordinator({
      queueRefresh: () => {
        refreshes += 1;
      },
      scheduleFallback: (callback, delayMs) => {
        scheduled.push({ callback, delayMs });
      },
      showFallback: (requestId) => {
        shown.push(requestId);
      },
      closeFallback: () => undefined,
    });

    coordinator.required("confirm-1", pendingAction());

    assert.equal(refreshes, 1);
    assert.deepEqual(shown, []);
    assert.equal(scheduled.length, 1);
    assert.equal(scheduled[0]?.delayMs, 90);

    scheduled[0]?.callback();
    assert.deepEqual(shown, ["confirm-1"]);
  });

  it("cancels the fallback when approval resolves before the timer", function () {
    const scheduled: Array<() => void> = [];
    const shown: string[] = [];
    const closed: string[] = [];
    let refreshes = 0;
    const coordinator = createPendingConfirmationCardCoordinator({
      queueRefresh: () => {
        refreshes += 1;
      },
      scheduleFallback: (callback) => {
        scheduled.push(callback);
      },
      showFallback: (requestId) => {
        shown.push(requestId);
      },
      closeFallback: (requestId) => {
        closed.push(requestId);
      },
    });

    coordinator.required("confirm-2", pendingAction());
    coordinator.resolved("confirm-2");
    scheduled[0]?.();

    assert.deepEqual(shown, []);
    assert.deepEqual(closed, ["confirm-2"]);
    assert.equal(refreshes, 2);
  });

  it("invalidates an older fallback when the same request is replayed", function () {
    const scheduled: Array<() => void> = [];
    const shown: string[] = [];
    const coordinator = createPendingConfirmationCardCoordinator({
      queueRefresh: () => undefined,
      scheduleFallback: (callback) => {
        scheduled.push(callback);
      },
      showFallback: (_requestId, action) => {
        shown.push(action.title);
      },
      closeFallback: () => undefined,
    });

    coordinator.required("confirm-3", pendingAction("First"));
    coordinator.required("confirm-3", pendingAction("Latest"));
    for (const callback of scheduled) callback();

    assert.deepEqual(shown, ["Latest"]);
  });
});
