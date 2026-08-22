export function createTearPath() {
  let points = "50% 0%";
  const segments = 25;
  for (let index = 1; index < segments; index += 1) {
    const y = (index / segments) * 100;
    const x = 50 + (Math.random() * 6 - 3);
    points += `, ${x}% ${y}%`;
  }
  return `${points}, 50% 100%`;
}

export function createShredPaths() {
  const stripCount = 8;
  const segments = 16;
  const boundaries = Array.from({ length: stripCount + 1 }, (_, boundaryIndex) =>
    Array.from({ length: segments + 1 }, (_, pointIndex) => {
      const y =
        pointIndex === 0
          ? 0
          : pointIndex === segments
            ? 100
            : ((pointIndex + (Math.random() * 0.55 - 0.275)) / segments) * 100;
      if (boundaryIndex === 0) return { x: 0, y };
      if (boundaryIndex === stripCount) return { x: 100, y };
      const baseX = (boundaryIndex / stripCount) * 100;
      if (pointIndex === 0 || pointIndex === segments) return { x: baseX, y };
      const direction = Math.random() < 0.5 ? -1 : 1;
      return { x: baseX + direction * (0.35 + Math.random() * 0.7), y };
    }),
  );

  return Array.from({ length: stripCount }, (_, stripIndex) => {
    const left = boundaries[stripIndex];
    const right = boundaries[stripIndex + 1];
    const points = [
      ...right.map((point) => `${point.x}% ${point.y}%`),
      ...[...left].reverse().map((point) => `${point.x}% ${point.y}%`),
    ];
    const goesUp = Math.random() < 0.5;
    return {
      clipPath: `polygon(${points.join(", ")})`,
      delay: Math.round(Math.random() * 70),
      x: `${(Math.random() * 12 - 6).toFixed(2)}%`,
      y: `${((goesUp ? -1 : 1) * (48 + Math.random() * 14)).toFixed(2)}%`,
      rotate: `${(Math.random() * 4.4 - 2.2).toFixed(2)}deg`,
      kickX: `${(Math.random() * 1.4 - 0.7).toFixed(2)}%`,
      kickY: `${((goesUp ? -1 : 1) * (1.5 + Math.random() * 1.5)).toFixed(2)}%`,
    };
  });
}
