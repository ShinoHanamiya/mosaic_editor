'use strict';
// Integer pixel replacement deliberately avoids antialiased Canvas clipping.
// Keeping this operation pure with respect to its supplied mosaic makes repeated
// dabs in one stroke idempotent, even at partially transparent source pixels.
(function (root) {
  function paint(ctx, width, height, op, mosaic, x, y, w, h, circle = false) {
    const left = circle ? x - w / 2 : x;
    const top = circle ? y - h / 2 : y;
    const x0 = Math.max(0, Math.floor(left));
    const y0 = Math.max(0, Math.floor(top));
    const x1 = Math.min(width, Math.ceil(left + w));
    const y1 = Math.min(height, Math.ceil(top + h));
    const rgba = op.effect === 'fill'
      ? [parseInt(op.color.slice(1, 3), 16), parseInt(op.color.slice(3, 5), 16), parseInt(op.color.slice(5, 7), 16), 255] : null;
    // Bound temporary allocations even for full-image rectangular selections.
    for (let ty = y0; ty < y1; ty += 256) {
      for (let tx = x0; tx < x1; tx += 256) {
        const tw = Math.min(256, x1 - tx), th = Math.min(256, y1 - ty);
        const patch = ctx.getImageData(tx, ty, tw, th);
        for (let py = 0; py < th; py++) {
          const gy = ty + py;
          for (let px = 0; px < tw; px++) {
            const gx = tx + px;
            if (circle) {
              if ((gx + 0.5 - x) ** 2 + (gy + 0.5 - y) ** 2 > (w / 2) ** 2) continue;
            } else if (gx + 0.5 < left || gx + 0.5 >= left + w || gy + 0.5 < top || gy + 0.5 >= top + h) continue;
            const out = (py * tw + px) * 4;
            if (rgba) {
              for (let c = 0; c < 4; c++) patch.data[out + c] = rgba[c];
            } else {
              const sx = Math.min(mosaic.width - 1, Math.floor((gx + 0.5) * mosaic.width / width));
              const sy = Math.min(mosaic.height - 1, Math.floor((gy + 0.5) * mosaic.height / height));
              const src = (sy * mosaic.width + sx) * 4;
              for (let c = 0; c < 4; c++) patch.data[out + c] = mosaic.data[src + c];
            }
          }
        }
        ctx.putImageData(patch, tx, ty);
      }
    }
  }
  if (typeof module === 'object' && module.exports) module.exports = { paint };
  else root.MosaicRaster = { paint };
})(typeof globalThis !== 'undefined' ? globalThis : this);
