export type PinnedPaperMotion = {
  angle: number;
  angularVelocity: number;
  lift: number;
  liftVelocity: number;
};

export function createPinnedPaperMotion(): PinnedPaperMotion {
  return { angle: 0, angularVelocity: 0, lift: 0, liftVelocity: 0 };
}

export function getPinnedPaperTilt(horizontalVelocity: number): number {
  // A positive rotation around the top pin moves the bottom of the sheet left.
  return Math.max(-2, Math.min(2, horizontalVelocity * 0.006));
}

export function advancePinnedPaperMotion(
  motion: PinnedPaperMotion,
  targetAngle: number,
  lifted: boolean,
  elapsedSeconds: number,
): PinnedPaperMotion {
  const next = { ...motion };
  const duration = Math.max(0, Math.min(0.064, elapsedSeconds));
  const steps = Math.max(1, Math.ceil(duration * 120));
  const dt = duration / steps;
  const angleTarget = Math.max(-2, Math.min(2, targetAngle));
  const liftTarget = lifted ? 1 : 0;

  for (let step = 0; step < steps; step += 1) {
    next.angularVelocity += ((angleTarget - next.angle) * 90 - next.angularVelocity * 13) * dt;
    next.angle += next.angularVelocity * dt;
    if (Math.abs(next.angle) > 2.2) {
      next.angle = Math.sign(next.angle) * 2.2;
      if (next.angle * next.angularVelocity > 0) next.angularVelocity = 0;
    }

    next.liftVelocity += ((liftTarget - next.lift) * 240 - next.liftVelocity * 24) * dt;
    next.lift += next.liftVelocity * dt;
  }

  return next;
}

export function isPinnedPaperSettled(motion: PinnedPaperMotion, lifted: boolean): boolean {
  return (
    Math.abs(motion.angle) < 0.001 &&
    Math.abs(motion.angularVelocity) < 0.005 &&
    Math.abs(motion.lift - (lifted ? 1 : 0)) < 0.001 &&
    Math.abs(motion.liftVelocity) < 0.005
  );
}

export type PaperWindowPosition = { x: number; y: number };

export function createPaperPositionWriter(
  write: (position: PaperWindowPosition) => Promise<void>,
  onError: (error: unknown) => void,
) {
  let pending: PaperWindowPosition | null = null;
  let running: Promise<void> | null = null;
  let disposed = false;

  const drain = async () => {
    while (pending && !disposed) {
      const position = pending;
      pending = null;
      await write(position);
    }
  };

  const push = (position: PaperWindowPosition) => {
    if (disposed) return;
    pending = position;
    if (running) return;
    running = drain()
      .catch((error: unknown) => {
        pending = null;
        if (!disposed) onError(error);
      })
      .finally(() => {
        running = null;
        if (pending && !disposed) push(pending);
      });
  };

  return {
    push,
    async flush() {
      while (running) await running;
    },
    dispose() {
      disposed = true;
      pending = null;
    },
  };
}
