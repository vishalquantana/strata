/// Sets up a hi-DPI canvas.
export function setupCanvas(canvas: HTMLCanvasElement): CanvasRenderingContext2D {
  const dpr = window.devicePixelRatio || 1;
  const rect = canvas.getBoundingClientRect();
  canvas.width = Math.floor(rect.width * dpr);
  canvas.height = Math.floor(rect.height * dpr);
  const ctx = canvas.getContext("2d")!;
  ctx.scale(dpr, dpr);
  return ctx;
}

export function clear(ctx: CanvasRenderingContext2D, w: number, h: number) {
  ctx.fillStyle = "#08080b";
  ctx.fillRect(0, 0, w, h);
}
