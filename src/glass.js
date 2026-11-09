// Liquid glass: the backdrop under each .glass element bends near its rim, the
// way light does through the bevelled edge of a thick pane. The bend is an SVG
// displacement map sized to the element, which Chromium (and so WebView2)
// accepts as a backdrop-filter. Elsewhere the plain CSS blur stays in place.

const NS = 'http://www.w3.org/2000/svg';
const supported = /Chrome\//.test(navigator.userAgent);

let defs = null;
let count = 0;

function svgDefs() {
  if (defs) return defs;
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('width', '0');
  svg.setAttribute('height', '0');
  svg.style.position = 'absolute';
  defs = document.createElementNS(NS, 'defs');
  svg.append(defs);
  document.body.append(svg);
  return defs;
}

/**
 * Red and green hold the x and y offsets (128 = none). Within `bezel` px of the
 * rounded edge the backdrop is pulled inward, most strongly right at the rim.
 */
function displacementMap(width, height, radius, bezel) {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  const image = ctx.createImageData(width, height);
  const r = Math.min(radius, width / 2, height / 2);
  const hw = width / 2;
  const hh = height / 2;

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const px = x + 0.5 - hw;
      const py = y + 0.5 - hh;
      // Signed distance to the rounded rectangle, and the outward normal there
      const qx = Math.abs(px) - (hw - r);
      const qy = Math.abs(py) - (hh - r);
      let dist;
      let nx;
      let ny;
      if (qx > 0 && qy > 0) {
        const len = Math.hypot(qx, qy);
        dist = len - r;
        nx = qx / len;
        ny = qy / len;
      } else if (qx > qy) {
        dist = qx - r;
        nx = 1;
        ny = 0;
      } else {
        dist = qy - r;
        nx = 0;
        ny = 1;
      }
      nx *= Math.sign(px) || 1;
      ny *= Math.sign(py) || 1;

      const t = Math.min(Math.max(1 + dist / bezel, 0), 1); // 1 at the rim, 0 past the bezel
      const strength = t * t;
      const i = (y * width + x) * 4;
      image.data[i] = 128 - nx * strength * 127;
      image.data[i + 1] = 128 - ny * strength * 127;
      image.data[i + 2] = 128;
      image.data[i + 3] = 255;
    }
  }
  ctx.putImageData(image, 0, 0);
  return canvas.toDataURL();
}

function attr(node, attrs) {
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, v);
  return node;
}

/**
 * Give `el` a refracting edge. `bezel`: how far in from the edge the glass
 * bends (px). `depth`: the most the backdrop moves (px). `blur`, `saturate`,
 * `brightness` finish the look.
 */
export function liquidGlass(el, { bezel = 14, depth = 18, blur = 10, saturate = 1.7, brightness = 1.06 } = {}) {
  if (!supported) return;
  const id = `liquid-glass-${++count}`;
  const filter = attr(document.createElementNS(NS, 'filter'), {
    id,
    x: 0,
    y: 0,
    filterUnits: 'userSpaceOnUse',
    primitiveUnits: 'userSpaceOnUse',
    'color-interpolation-filters': 'sRGB',
  });
  const map = attr(document.createElementNS(NS, 'feImage'), { x: 0, y: 0, preserveAspectRatio: 'none', result: 'map' });
  const bend = attr(document.createElementNS(NS, 'feDisplacementMap'), {
    in: 'SourceGraphic',
    in2: 'map',
    scale: depth * 2,
    xChannelSelector: 'R',
    yChannelSelector: 'G',
  });
  filter.append(map, bend);
  svgDefs().append(filter);

  let size = '';
  const update = () => {
    const width = Math.round(el.offsetWidth);
    const height = Math.round(el.offsetHeight);
    if (!width || !height || `${width}x${height}` === size) return;
    size = `${width}x${height}`;
    const radius = parseFloat(getComputedStyle(el).borderTopLeftRadius) || 0;
    attr(filter, { width, height });
    attr(map, { width, height, href: displacementMap(width, height, radius, bezel) });
    const finish = `blur(${blur}px) saturate(${saturate}) brightness(${brightness})`;
    el.style.backdropFilter = `url(#${id}) ${finish}`;
    el.style.webkitBackdropFilter = el.style.backdropFilter;
  };
  new ResizeObserver(update).observe(el);
  update();
}
