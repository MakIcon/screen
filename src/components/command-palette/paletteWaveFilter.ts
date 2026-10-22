import {
  getPaletteMeshOffset,
  paletteWaveLimit,
  samplePaletteMesh,
  type ElasticPoint,
  type PaletteMesh,
  type PaletteSize,
} from "./paletteElasticMotion";

export function paletteWaveSource(
  mesh: PaletteMesh,
  size: PaletteSize,
  base: ElasticPoint,
  x: number,
  y: number,
  result: ElasticPoint = { x: 0, y: 0 },
): ElasticPoint {
  let sx = x;
  let sy = y;
  // SVG displacement samples backwards: find the source pixel for this output pixel.
  for (let i = 0; i < 12; i++) {
    samplePaletteMesh(mesh, sx / size.width, sy / size.height, result);
    const nextX = x - result.x + base.x;
    const nextY = y - result.y + base.y;
    const error = Math.max(Math.abs(nextX - sx), Math.abs(nextY - sy));
    sx = nextX;
    sy = nextY;
    if (error < 0.02) break;
  }
  result.x = sx;
  result.y = sy;
  return result;
}

export function createPaletteWaveFilter(dialog: HTMLDialogElement, panel: HTMLElement) {
  const filter = dialog.querySelector<SVGFilterElement>(".command-palette-wave-filter");
  const image = filter?.querySelector("feImage");
  const displacement = filter?.querySelector("feDisplacementMap");
  if (!filter || !image || !displacement) return null;
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = 64;
  const context = canvas.getContext("2d");
  if (!context) return null;
  const pixels = context.createImageData(canvas.width, canvas.height);
  const source = { x: 0, y: 0 };
  let generation = 0;
  let dimensions = "";
  let decoding = false;
  let pending: { url: string; generation: number } | null = null;
  const reset = () => {
    generation++;
    pending = null;
    panel.style.filter = "";
    image.removeAttribute("href");
  };
  const upload = () => {
    if (decoding || !pending) return;
    const texture = pending;
    pending = null;
    decoding = true;
    const decoded = new Image();
    decoded.src = texture.url;
    // Activating an undecoded feImage can briefly displace the entire panel.
    // Keep at most one upload in flight and replace queued frames with the latest.
    void decoded
      .decode()
      .then(() => {
        if (texture.generation !== generation) return;
        image.setAttribute("href", texture.url);
        panel.style.filter = `url("#${filter.id}")`;
      })
      .catch(() => {})
      .finally(() => {
        decoding = false;
        upload();
      });
  };

  return {
    reset,
    render(mesh: PaletteMesh, size: PaletteSize) {
      const base = getPaletteMeshOffset(mesh, size, 0.5, 0.5);
      const amplitude = Math.max(
        ...mesh.map((p) => Math.max(Math.abs(p.x - base.x), Math.abs(p.y - base.y))),
      );
      if (amplitude < 0.15) {
        reset();
        return;
      }
      // Keep coordinates and scale fixed while textures decode. Reusing a previous
      // frame with a different scale produces a displaced ghost on sudden reversals.
      const range = paletteWaveLimit(size) + 4;
      const padding = Math.ceil(range) + 12;
      const width = size.width + padding * 2;
      const height = size.height + padding * 2;
      const nextDimensions = `${size.width}:${size.height}`;
      if (dimensions !== nextDimensions) {
        reset();
        dimensions = nextDimensions;
      }
      filter.setAttribute("x", String(-padding));
      filter.setAttribute("y", String(-padding));
      filter.setAttribute("width", String(width));
      filter.setAttribute("height", String(height));
      image.setAttribute("x", String(-padding));
      image.setAttribute("y", String(-padding));
      image.setAttribute("width", String(width));
      image.setAttribute("height", String(height));
      displacement.setAttribute("scale", String(range * 2));

      for (let row = 0; row < canvas.height; row++) {
        const y = ((row + 0.5) / canvas.height) * height - padding;
        for (let col = 0; col < canvas.width; col++) {
          const x = ((col + 0.5) / canvas.width) * width - padding;
          paletteWaveSource(mesh, size, base, x, y, source);
          const pixel = (row * canvas.width + col) * 4;
          pixels.data[pixel] = 127.5 + ((source.x - x) / (range * 2)) * 255;
          pixels.data[pixel + 1] = 127.5 + ((source.y - y) / (range * 2)) * 255;
          pixels.data[pixel + 2] = 128;
          pixels.data[pixel + 3] = 255;
        }
      }
      context.putImageData(pixels, 0, 0);
      pending = { url: canvas.toDataURL(), generation };
      upload();
    },
  };
}
