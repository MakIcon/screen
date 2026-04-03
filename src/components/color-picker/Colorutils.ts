/* ─── Color conversion utilities ──────────────────── */

// HSV: h 0-360, s 0-1, v 0-1
export function hsvToRgb(h: number, s: number, v: number): [number, number, number] {
    const hi = Math.floor(h / 60) % 6;
    const f  = h / 60 - Math.floor(h / 60);
    const p  = v * (1 - s);
    const q  = v * (1 - f * s);
    const t  = v * (1 - (1 - f) * s);
    const m: [number, number, number][] = [
        [v, t, p], [q, v, p], [p, v, t],
        [p, q, v], [t, p, v], [v, p, q],
    ];
    return m[hi].map(x => Math.round(x * 255)) as [number, number, number];
}

export function rgbToHsv(r: number, g: number, b: number): [number, number, number] {
    const rr = r / 255, gg = g / 255, bb = b / 255;
    const max = Math.max(rr, gg, bb), min = Math.min(rr, gg, bb);
    const d = max - min;
    let h = 0;
    if (d !== 0) {
        if (max === rr)      h = ((gg - bb) / d) % 6;
        else if (max === gg) h = (bb - rr) / d + 2;
        else                 h = (rr - gg) / d + 4;
        h = Math.round(h * 60);
        if (h < 0) h += 360;
    }
    return [h, max === 0 ? 0 : d / max, max];
}

export function rgbToHex(r: number, g: number, b: number): string {
    return '#' + [r, g, b].map(x => x.toString(16).padStart(2, '0')).join('');
}

export function hexToRgb(hex: string): [number, number, number] {
    const clean = hex.replace('#', '').padEnd(6, '0').slice(0, 6);
    const r = parseInt(clean.slice(0, 2), 16) || 0;
    const g = parseInt(clean.slice(2, 4), 16) || 0;
    const b = parseInt(clean.slice(4, 6), 16) || 0;
    return [r, g, b];
}

export function hexToHsv(hex: string): [number, number, number] {
    return rgbToHsv(...hexToRgb(hex));
}

export function drawSVCanvas(canvas: HTMLCanvasElement, hue: number) {
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const { width: w, height: h } = canvas;
    const [r, g, b] = hsvToRgb(hue, 1, 1);
    // white → hue
    const gH = ctx.createLinearGradient(0, 0, w, 0);
    gH.addColorStop(0, '#ffffff');
    gH.addColorStop(1, `rgb(${r},${g},${b})`);
    ctx.fillStyle = gH;
    ctx.fillRect(0, 0, w, h);
    // transparent → black overlay
    const gV = ctx.createLinearGradient(0, 0, 0, h);
    gV.addColorStop(0, 'rgba(0,0,0,0)');
    gV.addColorStop(1, 'rgba(0,0,0,1)');
    ctx.fillStyle = gV;
    ctx.fillRect(0, 0, w, h);
}
