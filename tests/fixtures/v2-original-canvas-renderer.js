/* Review-only Canvas renderer. The SVG remains the geometry source. */
(() => {
  'use strict';

  const PIXEL_BUDGET = 64 * 1024 * 1024 / 4;
  const number = (value, fallback = 0) => Number.isFinite(Number(value)) ? Number(value) : fallback;
  const clamp = (value, low, high) => Math.max(low, Math.min(high, value));
  const clock = () => typeof performance === 'undefined' ? Date.now() : performance.now();

  function ease(progress) {
    if (progress <= 0) return 0;
    if (progress >= 1) return 1;
    // CSS ease-in-out uses the cubic curve (0.42, 0, 0.58, 1).
    let low = 0, high = 1, t = progress;
    for (let i = 0; i < 24; i++) {
      const s = 1 - t;
      const x = 3 * s * s * t * .42 + 3 * s * t * t * .58 + t * t * t;
      if (x < progress) low = t; else high = t;
      t = (low + high) / 2;
    }
    return 3 * (1 - t) * t * t + t * t * t;
  }

  function create({ garden, getTime, pixelRatio = window.devicePixelRatio || 1, cacheFinished = true }) {
    const requestedPixelRatio = clamp(number(pixelRatio, 1), .25, 2);
    const canvas = document.createElement('canvas');
    canvas.setAttribute('aria-hidden', 'true');
    canvas.className = 'garden-canvas';
    Object.assign(canvas.style, { position: 'absolute', inset: '0', width: '100%', height: '100%', pointerEvents: 'none' });
    garden.parentElement.append(canvas);
    garden.style.visibility = 'hidden';
    const output = canvas.getContext('2d', { alpha: true });
    if (!output) throw new Error('Flowers needs a Canvas 2D context for this experiment.');

    let layers = [];
    let source = null;
    let cssWidth = 0, cssHeight = 0, logicalWidth = 0, logicalHeight = 0;
    let dpr = 1;
    let colors = { ink: '#252622', paper: '#f8f7f2' };
    let frame = 0, running = false, forcedFinish = false;
    let duration = 0;
    let geometryPreparations = 0, replayCount = 0, drawnFrames = 0;
    let renderedLayers = 0, renderedMarks = 0, activeLayers = 0;
    let estimatedPixelBytes = 0, sourceMarks = 0;
    let reservedPixelBytes = 0, prefixPixelBytes = 0;
    let renderMs = 0, maxRenderMs = 0, prepareMs = 0, maxPrepareMs = 0;
    let reusedMarks = 0, cacheBuildMarks = 0, spriteRenders = 0, cacheBudgetMisses = 0;

    function pause() {
      running = false;
      cancelAnimationFrame(frame);
      frame = 0;
    }

    function readColors() {
      const style = getComputedStyle(document.documentElement);
      const ink = style.getPropertyValue('--ink').trim() || '#252622';
      const paper = style.getPropertyValue('--paper').trim() || '#f8f7f2';
      const changed = ink !== colors.ink || paper !== colors.paper;
      colors = { ink, paper };
      if (changed) for (const layer of layers) {
        layer.dirty = true;
        resetPrefix(layer);
        for (const mark of layer.marks) if (mark.sprite) mark.sprite.dirty = true;
      }
    }

    function pathLength(element, sx, sy) {
      const length = element.getTotalLength();
      // Ignore the scale error from the source viewBox's two-decimal rounding.
      if (Math.abs(sx - sy) <= Math.max(sx, sy) * .00001) return length * (sx + sy) / 2;
      // Only extreme viewports reach the source renderer's aspect-ratio clamp.
      const count = Math.max(8, Math.ceil(length * Math.max(sx, sy) / .5));
      let previous = element.getPointAtLength(0), transformed = 0;
      for (let i = 1; i <= count; i++) {
        const point = element.getPointAtLength(length * i / count);
        transformed += Math.hypot((point.x - previous.x) * sx, (point.y - previous.y) * sy);
        previous = point;
      }
      return transformed;
    }

    function prepare({ width, height, schedule }) {
      const before = clock();
      pause();
      const bounds = garden.getBoundingClientRect();
      const nextWidth = Math.max(1, bounds.width), nextHeight = Math.max(1, bounds.height);
      readColors();
      if (source === garden.firstElementChild && cssWidth === nextWidth && cssHeight === nextHeight && logicalWidth === width && logicalHeight === height) {
        const cost = clock() - before; prepareMs += cost; maxPrepareMs = Math.max(maxPrepareMs, cost); return;
      }

      for (const layer of layers) disposeLayer(layer);
      source = garden.firstElementChild;
      cssWidth = nextWidth; cssHeight = nextHeight; logicalWidth = width; logicalHeight = height;
      const sx = cssWidth / width, sy = cssHeight / height;
      const timed = new Map(schedule.map(record => [record.el, record]));
      duration = schedule.reduce((end, record) => Math.max(end, record.start + record.duration), 0);
      sourceMarks = schedule.length;
      const specs = [];
      let totalArea = cssWidth * cssHeight;

      for (const group of garden.children) {
        const box = group.getBBox();
        const left = clamp(Math.floor(box.x * sx - 3), 0, cssWidth);
        const top = clamp(Math.floor(box.y * sy - 3), 0, cssHeight);
        const right = clamp(Math.ceil((box.x + box.width) * sx + 3), 0, cssWidth);
        const bottom = clamp(Math.ceil((box.y + box.height) * sy + 3), 0, cssHeight);
        if (right <= left || bottom <= top) continue;
        const rect = { x: left, y: top, width: right - left, height: bottom - top };
        specs.push({ group, rect });
        totalArea += rect.width * rect.height;
        for (const element of group.children) if (element.tagName.toLowerCase() === 'circle') {
          const diameter = 2 * number(element.getAttribute('r'));
          const weight = number(element.getAttribute('stroke-width')) * (sx + sy) / 2;
          totalArea += (diameter * sx + weight + 4) * (diameter * sy + weight + 4);
        }
      }

      // This budget counts raw RGBA buffers, not browser bookkeeping or paths.
      dpr = Math.min(requestedPixelRatio, Math.sqrt(PIXEL_BUDGET / Math.max(1, totalArea)) * .98);
      canvas.width = Math.ceil(cssWidth * dpr);
      canvas.height = Math.ceil(cssHeight * dpr);
      // Keep the pixel pitch exact. The parent clips the excess fraction.
      canvas.style.width = `${canvas.width / dpr}px`;
      canvas.style.height = `${canvas.height / dpr}px`;
      estimatedPixelBytes = canvas.width * canvas.height * 4;
      reservedPixelBytes = estimatedPixelBytes; prefixPixelBytes = 0;
      layers = specs.map(({ group, rect }) => {
        const bitmap = document.createElement('canvas');
        bitmap.width = Math.ceil(rect.width * dpr);
        bitmap.height = Math.ceil(rect.height * dpr);
        estimatedPixelBytes += bitmap.width * bitmap.height * 4;
        reservedPixelBytes += bitmap.width * bitmap.height * 4;
        const context = bitmap.getContext('2d', { alpha: true });
        if (!context) throw new Error('Flowers could not allocate a plant layer.');
        const matrix = new DOMMatrix([sx, 0, 0, sy, -rect.x, -rect.y]);
        const marks = [];
        let start = Infinity, end = 0;
        for (const element of group.children) {
          const timing = timed.get(element);
          const tag = element.tagName.toLowerCase();
          const dot = tag === 'circle';
          const fillOnly = element.getAttribute('class') === 'ink-fill';
          const path = new Path2D();
          let length = 0, sprite = null;
          const weight = number(element.getAttribute('stroke-width'), .7) * (dot ? (sx + sy) / 2 : 1);
          if (dot) {
            const x = number(element.getAttribute('cx')) * sx - rect.x;
            const y = number(element.getAttribute('cy')) * sy - rect.y;
            const rx = number(element.getAttribute('r')) * sx, ry = number(element.getAttribute('r')) * sy;
            path.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2);
            const left = Math.floor((x - rx - weight / 2) * dpr) - 1;
            const top = Math.floor((y - ry - weight / 2) * dpr) - 1;
            const right = Math.ceil((x + rx + weight / 2) * dpr) + 1;
            const bottom = Math.ceil((y + ry + weight / 2) * dpr) + 1;
            sprite = { x: left, y: top, width: right - left, height: bottom - top, canvas: null, dirty: true };
            reservedPixelBytes += sprite.width * sprite.height * 4;
          } else {
            path.addPath(new Path2D(element.getAttribute('d') || ''), matrix);
            if (timing) length = pathLength(element, sx, sy);
          }
          if (timing) { start = Math.min(start, timing.start); end = Math.max(end, timing.start + timing.duration); }
          marks.push({ path, dot, fillOnly, length, sprite,
            start: timing?.start ?? -Infinity, duration: timing?.duration ?? 0,
            opacity: number(element.getAttribute('opacity') ?? 1, 1),
            paper: fillOnly || element.getAttribute('fill') === 'var(--paper)',
            weight
          });
        }
        return { canvas: bitmap, context, rect, marks, start, end,
          opacity: number(group.getAttribute('opacity') ?? 1, 1), state: null, dirty: true,
          prefix: null, prefixIndex: 0, lastTime: -Infinity };
      });
      geometryPreparations++;
      const cost = clock() - before; prepareMs += cost; maxPrepareMs = Math.max(maxPrepareMs, cost);
    }

    function resetPrefix(layer) {
      if (layer.prefix) {
        const bytes = layer.prefix.width * layer.prefix.height * 4;
        estimatedPixelBytes -= bytes; prefixPixelBytes -= bytes;
        layer.prefix.width = 0; layer.prefix.height = 0; layer.prefix = null;
      }
      layer.prefixIndex = 0;
      layer.lastTime = -Infinity;
    }

    function disposeLayer(layer) {
      resetPrefix(layer);
      for (const mark of layer.marks) if (mark.sprite?.canvas) { mark.sprite.canvas.width = 0; mark.sprite.canvas.height = 0; }
      layer.canvas.width = 0; layer.canvas.height = 0;
    }

    function getSprite(mark) {
      const sprite = mark.sprite;
      if (!sprite.canvas) {
        sprite.canvas = document.createElement('canvas');
        sprite.canvas.width = sprite.width; sprite.canvas.height = sprite.height;
        estimatedPixelBytes += sprite.width * sprite.height * 4;
      }
      if (sprite.dirty) {
        const context = sprite.canvas.getContext('2d', { alpha: true });
        context.setTransform(1, 0, 0, 1, 0, 0);
        context.clearRect(0, 0, sprite.width, sprite.height);
        context.setTransform(dpr, 0, 0, dpr, -sprite.x, -sprite.y);
        context.globalAlpha = 1;
        context.setLineDash([]); context.lineDashOffset = 0;
        context.fillStyle = mark.paper ? colors.paper : colors.ink;
        context.strokeStyle = colors.ink; context.lineWidth = mark.weight;
        context.fill(mark.path); context.stroke(mark.path);
        sprite.dirty = false; spriteRenders++;
      }
      return sprite;
    }

    function paintMark(context, mark, time) {
      if (mark.fillOnly) {
        context.globalAlpha = mark.opacity;
        context.fillStyle = colors.paper;
        context.fill(mark.path);
      } else {
        const progress = mark.duration ? ease((time - mark.start) / mark.duration) : 1;
        if (progress <= 0) return false;
        context.globalAlpha = mark.opacity * (mark.dot ? progress : 1);
        if (mark.dot) {
          // Apply opacity once to the combined fill and stroke of this element.
          const sprite = getSprite(mark);
          context.drawImage(sprite.canvas, sprite.x / dpr, sprite.y / dpr, sprite.width / dpr, sprite.height / dpr);
        } else {
          context.lineWidth = mark.weight; context.strokeStyle = colors.ink;
          context.setLineDash(progress < 1 ? [mark.length, mark.length] : []);
          context.lineDashOffset = progress < 1 ? (1 - progress) * mark.length : 0;
          context.stroke(mark.path);
        }
      }
      renderedMarks++;
      return true;
    }

    function prefixFor(layer, time) {
      if (time < layer.lastTime) resetPrefix(layer);
      let end = layer.prefixIndex;
      while (end < layer.marks.length) {
        const mark = layer.marks[end];
        if (!mark.fillOnly && time < mark.start + mark.duration) break;
        end++;
      }
      if (!cacheFinished || layer.marks.length < 8 || (!layer.prefix && (end === 0 || end === layer.marks.length))) return 0;
      if (!layer.prefix) {
        const bytes = layer.canvas.width * layer.canvas.height * 4;
        if (reservedPixelBytes + prefixPixelBytes + bytes > PIXEL_BUDGET * 4) { cacheBudgetMisses++; return 0; }
        layer.prefix = document.createElement('canvas');
        layer.prefix.width = layer.canvas.width; layer.prefix.height = layer.canvas.height;
        estimatedPixelBytes += bytes; prefixPixelBytes += bytes;
      }
      const context = layer.prefix.getContext('2d', { alpha: true });
      context.setTransform(dpr, 0, 0, dpr, 0, 0);
      context.lineCap = 'round'; context.lineJoin = 'round';
      for (let index = layer.prefixIndex; index < end; index++) {
        paintMark(context, layer.marks[index], Infinity); cacheBuildMarks++;
      }
      layer.prefixIndex = end;
      return end;
    }

    function renderLayer(layer, time) {
      if (layer.dirty) resetPrefix(layer);
      const prefix = prefixFor(layer, time);
      const context = layer.context;
      context.setTransform(1, 0, 0, 1, 0, 0);
      context.clearRect(0, 0, layer.canvas.width, layer.canvas.height);
      context.globalAlpha = 1;
      if (prefix) { context.drawImage(layer.prefix, 0, 0); reusedMarks += prefix; }
      context.setTransform(dpr, 0, 0, dpr, 0, 0);
      context.lineCap = 'round';
      context.lineJoin = 'round';
      for (let index = prefix; index < layer.marks.length; index++) paintMark(context, layer.marks[index], time);
      if (time >= layer.end) resetPrefix(layer);
      layer.lastTime = time;
      layer.dirty = false;
      renderedLayers++;
    }

    function render(time, force = false) {
      const before = clock();
      let changed = force;
      activeLayers = 0;
      for (const layer of layers) {
        const state = time < layer.start ? 'pending' : time >= layer.end ? 'complete' : 'active';
        if (state === 'active') activeLayers++;
        if (force || layer.dirty || state !== layer.state || state === 'active') {
          renderLayer(layer, time);
          layer.state = state;
          changed = true;
        }
      }
      if (!changed) return;
      output.setTransform(1, 0, 0, 1, 0, 0);
      output.clearRect(0, 0, canvas.width, canvas.height);
      output.setTransform(dpr, 0, 0, dpr, 0, 0);
      for (const layer of layers) {
        output.globalAlpha = layer.opacity;
        output.drawImage(layer.canvas, 0, 0, layer.rect.width * dpr, layer.rect.height * dpr,
          layer.rect.x, layer.rect.y, layer.rect.width, layer.rect.height);
      }
      output.globalAlpha = 1;
      drawnFrames++;
      const cost = clock() - before; renderMs += cost; maxRenderMs = Math.max(maxRenderMs, cost);
    }

    function tick() {
      frame = 0;
      if (!running) return;
      const time = getTime();
      render(time);
      if (time < duration) frame = requestAnimationFrame(tick);
      else running = false;
    }

    function resume() {
      if (forcedFinish || running) return;
      running = true;
      tick();
    }

    return {
      prepare, pause, resume,
      replay(still = false) {
        pause(); replayCount++; drawnFrames = 0; renderedLayers = 0; renderedMarks = 0;
        renderMs = 0; maxRenderMs = 0; reusedMarks = 0; cacheBuildMarks = 0; spriteRenders = 0; cacheBudgetMisses = 0;
        forcedFinish = still;
        readColors();
        for (const layer of layers) resetPrefix(layer);
        render(still ? Infinity : 0, true);
      },
      finish() { pause(); forcedFinish = true; render(Infinity); },
      seek(time) { pause(); forcedFinish = false; render(time); },
      getState: () => ({ layers: layers.length, sourceMarks, requestedPixelRatio, dpr, qualityCapped: dpr < requestedPixelRatio,
        estimatedPixelBytes, reservedPixelBytes, prefixPixelBytes, pixelBudgetBytes: PIXEL_BUDGET * 4, geometryPreparations,
        replayCount, drawnFrames, renderedLayers, renderedMarks, reusedMarks, cacheBuildMarks, spriteRenders, cacheBudgetMisses,
        renderMs, maxRenderMs, prepareMs, maxPrepareMs, activeLayers, running, drawDuration: duration }),
      destroy() { pause(); for (const layer of layers) disposeLayer(layer); layers = []; canvas.width = 0; canvas.height = 0; canvas.remove(); garden.style.visibility = ''; estimatedPixelBytes = 0; reservedPixelBytes = 0; }
    };
  }

  window.FlowersCanvas = Object.freeze({ create });
})();
