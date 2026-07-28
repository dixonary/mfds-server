// Produce an SVG icon from an integer. These should be relatively 
// distinguishable, at least compared to the printed version of the number.
const getSenderIcon = (value) => {

  const getHue = (value) => (137.5 * value) % 360;

  const elem = document.createElementNS(
    "http://www.w3.org/2000/svg",
    "svg"
  );
  elem.classList.add("call-sign-icon");

  // Default scale
  const ICON_SIZE = 100;

  elem.setAttribute("xmlns", "http://www.w3.org/2000/svg");
  elem.setAttribute("viewBox", `0 0 ${ICON_SIZE} ${ICON_SIZE}`);

  const hue = getHue(value);
  let fgColor = `oklch(from hsl(${hue} 100% 50%) calc(l - 0.4) c h)`;
  let bgColor = `oklch(from hsl(${hue} 100% 50%) calc(l + 0.4) c h)`;

  // Swap fg and bg half the time
  if (value % 2 == 0) {
    const t = fgColor;
    fgColor = bgColor;
    bgColor = t;
  }

  // Get raw points corresponding to one 16th of the shape
  const drawShape = (style, subpos) => {
    const size = ICON_SIZE / 4;

    const left = (subpos % 2) * size;
    const top = Math.floor(subpos / 2) * size;
    const right = left + size;
    const bottom = top + size;

    const tl = [left, top];
    const tr = [right, top];
    const bl = [left, bottom];
    const br = [right, bottom];

    switch (style) {
      case 0: return [tl, tr, br, bl];
      case 1: return [];
      case 2: return [tl, br, bl];
      case 3: return [tr, bl, tl];
      case 4: return [tl, br, tr];
      case 5: return [tr, bl, br];
    }
  };

  const formats = [0, 1, 2, 3]
    .map(i => simpleHash("color" + ("" + value)[i]) % 6);

  const quarter = formats
    .map((format, i) => drawShape(format, i))
    .filter(points => points.length > 0);

  const transformPoint = ([x, y], tx, ty, rotation, flipX) => {
    const iq = ICON_SIZE / 4;

    x -= iq;
    y -= iq;
    x *= flipX;

    // Rotate around 0,0
    const angle = rotation * Math.PI / 180;
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);

    const rotatedX = x * cos - y * sin;
    const rotatedY = x * sin + y * cos;

    // final translate
    return [
      rotatedX + tx + iq,
      rotatedY + ty + iq
    ];
  };

  const useArrangementA = (simpleHash("arrangement" + value) % 2 == 0);

  const polygons = [];

  for (let i = 0; i < 4; i++) {
    const iq = ICON_SIZE / 4;
    const tx = iq * ((i % 2) * 2);
    const ty = iq * (Math.floor(i / 2) * 2);

    let flipX;
    let rotation;

    if (useArrangementA) {
      rotation = [90, 0, 180, 270][i];
      flipX = -1;
    } else {
      flipX = i === 1 || i === 2 ? -1 : 1;
      rotation = i > 1 ? 180 : 0;
    }

    quarter.forEach((poly) => {
      polygons.push(
        poly.map(point =>
          transformPoint(point, tx, ty, rotation, flipX)
        )
      );
    });
  }

  const pathData = polygons
    .map(points => {
      const [[x, y], ...rest] = points;

      return [
        `M ${x} ${y}`,
        ...rest.map(([x, y]) => `L ${x} ${y}`),
        "Z",
      ].join(" ");
    })
    .join(" ");

  elem.innerHTML = `
  <rect
    x="0"
    y="0"
    width="${ICON_SIZE}"
    height="${ICON_SIZE}"
    fill="${bgColor}"
    stroke="none"
  />

  <g transform="translate(${ICON_SIZE * 0.1} ${ICON_SIZE * 0.1}) scale(0.8)">
    <path
      d="${pathData}"
      fill="${fgColor}"
      stroke="none"
    />
  </g>
`;

  return elem.outerHTML;
}


//************************************************//
// HELPERS

function simpleHash(str) {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = (hash << 5) - hash + str.charCodeAt(i); // Shift and combine
    hash |= 0; // Convert to 32-bit integer
  }
  return hash >>> 0; // Ensure the result is unsigned
}