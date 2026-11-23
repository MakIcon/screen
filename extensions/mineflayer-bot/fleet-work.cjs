"use strict";
const { performance, monitorEventLoopDelay } = require("node:perf_hooks");

// Every bot owns its event loop. Pace only background search, and only when
// observed scheduling lag warrants it; fleet size alone is not CPU pressure.
function createWorkBudget({ sampleMs = 500, observe = true } = {}) {
  const histogram = observe ? monitorEventLoopDelay({ resolution: 20 }) : null;
  histogram?.enable();
  let previous = performance.eventLoopUtilization(), delay = 0, slice = 5;
  function sample(lagMs, utilization) {
    const pressure = Math.max(0, lagMs - 12);
    const next = utilization > 0.6 ? Math.min(8, Math.ceil(pressure / 8)) : 0;
    delay = next > delay ? next : Math.max(next, delay - 2);
    slice = delay ? Math.max(1, 5 - delay) : 5;
  }
  const timer = observe ? setInterval(() => {
    const current = performance.eventLoopUtilization();
    const utilization = performance.eventLoopUtilization(current, previous).utilization;
    previous = current;
    sample(Math.max(0, histogram.percentile(95) / 1e6 - 20), utilization);
    histogram.reset();
  }, sampleMs) : null;
  timer?.unref();
  return {
    sample,
    get delayMs() { return delay; },
    get sliceMs() { return slice; },
    dispose() { clearInterval(timer); histogram?.disable(); },
  };
}
module.exports = { createWorkBudget };
