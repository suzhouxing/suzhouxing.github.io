// data for calculation.
const MaxCoord = 2.25;
const MinRadius = 0.005;
const Err = 1e-6;
var n = 1; // circle number.
var p = [[0, 0]]; // circle center positions. p[0] is the container.
var r = 1; // circle radius.
var gridUnit = 1;
var gridSize = 1;
var grids = [];

// data for interaction.
var pickedCircle = null;

// data for optimization.
const InitStep = 0.01;
var opt = {
  r: 0, // best radius found.
  rr: 0, // best radius found in this round.
  f: new Map(), // forces. `f.get(c)` is the neighoring circles of circle `c` (the container will always be the last one if there is).
  step: InitStep,
  stepInc: 0.5,
  stepDecay: 0.9
};

// utility.
function cId(circleDiv) { return circleDiv.id.substring(1); }
function cDivId(c) { return "c" + c; }
function cDiv(c) { return sId(cDivId(c)); }

function setPos(circleDiv, pos) {
  p[cId(circleDiv)] = pos;
  circleDiv.setAttribute("cx", pos[0]);
  circleDiv.setAttribute("cy", pos[1]);
}

function syncPos() {
  for (let c of sCls("c")) { setPos(c, p[cId(c)]); }
}

function syncRadius() {
  for (let c of sCls("c")) { c.setAttribute("r", r); }
  sId("ro").innerHTML = opt.r.toString();
  sId("rr").innerHTML = opt.rr.toString();
  sId("rc").innerHTML = r.toString();
}

function flatten(gx, gy) { return (gy * gridSize) + gx; }
function flattenA(g) { return flatten(g[0], g[1]); }
function gridId(c) { return [Math.floor((p[c][0] + 1) / gridUnit), Math.floor((p[c][1] + 1) / gridUnit)]; }
function flatGridId(c) { return flattenA(gridId(c)); }

function genGrid() {
  gridUnit = Math.sqrt(0.9 / n) * 2; // max diameter of equal circles.
  gridSize = Math.ceil(2 / gridUnit);
  grids = new Array(gridSize * gridSize);
  for (let i = 0; i < grids.length; ++i) { grids[i] = new Set(); }
  gridDbg();
}

function calcHeatmap() {
  for (let i = 0; i < grids.length; ++i) { grids[i].clear(); }
  for (let c = 1; c <= n; ++c) { grids[flatGridId(c)].add(c); }
  heatmapDbg();
}

function scanCircles(onPair, onContainer) {
  for (let c = 1; c <= n; ++c) {
    function calcDistance(gx, gy) {
      if ((gx < 0) || (gx >= gridSize) || (gy < 0) || (gy >= gridSize)) { return; }
      let gs = grids[flatten(gx, gy)];
      for (nc of gs) {
        if (nc != c) { onPair(c, nc, powSum(p[c][0] - p[nc][0], p[c][1] - p[nc][1])); }
      }
    }
    let g = gridId(c);
    for (let dx = -1; dx <= 1; ++dx) {
      for (let dy = -1; dy <= 1; ++dy) {
        calcDistance(g[0] + dx, g[1] + dy);
      }
    }

    onContainer(c, powSum(p[c][0], p[c][1]));
  }
}

function calcRadius() {
  calcHeatmap();

  let d = 4; // (d^2) square of diameter of circles (distance between pairs of circles).
  let cr = 0; // (cr^2) square of radius of circles (distance between circles and container).
  scanCircles(
    function (c, nc, d2) { if (d2 < d) { d = d2; } },
    function (c, cr2) { if (cr2 > cr) { cr = cr2; } }
  );
  r = Math.max(MinRadius, Math.min(Math.sqrt(d) / 2, 1 - Math.sqrt(cr)));

  syncRadius();
}

function randomPack() {
  for (let c = 1; c <= n; ++c) {
    p[c] = [randReal(-0.7, 0.7), randReal(-0.7, 0.7)];
  }
}

function optimize(reset) {
  if (reset) { opt.step = InitStep; opt.rr = opt.r / 4; }
  if (r > opt.r) { opt.r = r; }
  if (opt.step < Err) { return; }

  let d = (opt.r + r) * (opt.r + r); // (d^2) square of diameter of circles (distance between pairs of circles).
  let cr = (1 - opt.r) * (1 - opt.r); // (cr^2) square of radius of circles (distance between circles and container).
  let f = []; // forces.
  opt.f.clear();
  scanCircles(
    function (c, nc, d2) { if (d2 < d + Err) { f.push(nc); } },
    function (c, cr2) {
      if (cr2 > cr - Err) { f.push(0); }
      if (f.length > 0) { opt.f.set(c, f); f = []; }
    }
  );

  let forceHtml = "";
  for (let [c, fs] of opt.f) {
    let rf = [0, 0]; // resultant force.
    if (fs[fs.length - 1] == 0) {
      let ccr = Math.sqrt(powSum(p[c][0], p[c][1]));
      rf[0] -= (2 * r * p[c][0] / ccr);
      rf[1] -= (2 * r * p[c][1] / ccr);
      fs.pop();
      forceHtml += "<path d='M " + p[c][0] + " " + p[c][1] + " L " + (p[c][0] + rf[0]) + " " + (p[c][1] + rf[1]) + "' />";
    }
    for (let f of fs) {
      rf[0] += (p[c][0] - p[f][0]);
      rf[1] += (p[c][1] - p[f][1]);
      forceHtml += "<path d='M " + p[c][0] + " " + p[c][1] + " L " + (2 * p[c][0] - p[f][0]) + " " + (2 * p[c][1] - p[f][1]) + "' />";
    }
    p[c][0] += (rf[0] * opt.step);
    p[c][1] += (rf[1] * opt.step);
    setPos(cDiv(c), p[c]);
  }
  sId("f").innerHTML = forceHtml;

  calcRadius();
  if (r < opt.rr + Err) {
    opt.step *= opt.stepDecay;
  } else {
    opt.step += (opt.stepInc * (2 * (r - opt.rr + 0.01)));
    opt.rr = r;
  }

  setTimeout(optimize, 0);
}

function transformPos(x, y) { // from client coordinates of mouse pointer to SVG coordinates.
  let cr = sId("v").getBoundingClientRect();
  return [(((x - cr.x) / cr.width) - 0.5) * MaxCoord, (((y - cr.y) / cr.height) - 0.5) * MaxCoord];
}

function moveCircle(circleDiv, x, y) {
  setPos(circleDiv, transformPos(x, y));
  calcRadius();
  optimize(true);
}

function delCircle(circleDiv) {
  szxlog("r " + cId(circleDiv));

  setPos(circleDiv, p[n]);
  p.pop();
  cDiv(n--).remove();
  genGrid();
  calcRadius();
  sId("n").innerHTML = n.toString();
  optimize(true);
}
function addCircle(x, y) {
  p[++n] = transformPos(x, y);
  svgAdd(sId("c"), "circle", { id: cDivId(n), class: "c", cx: p[n][0], cy: p[n][1], r: r }).addEventListener("mousedown", clickCircle);
  genGrid();
  calcRadius();
  sId("n").innerHTML = n.toString();
  opt.r /= 2;
  optimize(true);
  
  szxlog("a " + n);
}

function clickCircle(e) {
  mouseDbg(e);
  if (e.which == 1) { // left button for move.
    if (pickedCircle != null) { return; }
    pickedCircle = e.currentTarget;
    szxlog("p " + cId(e.currentTarget));
  } else { // other buttons for delete.
    delCircle(e.currentTarget);
  }
  preventDefault(e);
  e.stopPropagation();
}

function clickBlank(e) {
  mouseDbg(e);
  if (e.button == MouseEventCode.LeftButton) { // left button for move.
    if (pickedCircle == null) { return; }
    szxlog("d " + cId(pickedCircle));
    pickedCircle = null;
  } else { // other buttons for add.
    addCircle(e.clientX, e.clientY);
    preventDefault(e);
    e.stopPropagation();
  }
}

// debug.
function mouseDbg(e) {
  // let r = e.target.getBoundingClientRect();
  // sId("mdbg").innerHTML = "pageX=" + e.pageX + " pageY=" + e.pageY
  //   + "<br />clientX=" + e.clientX + " clientY=" + e.clientY
  //   + "<br />screenX=" + e.screenX + " screenY=" + e.screenY
  //   + "<br />offsetX=" + e.offsetX + " offsetY=" + e.offsetY
  //   + "<br />target=" + e.target.id + " currentTarget=" + e.currentTarget.id
  //   + "<br />clientLeft=" + e.target.clientLeft + " clientTop=" + e.target.clientTop
  //   + "<br />r.x=" + r.x
  //   + "<br />r.y=" + r.y
  //   + "<br />r.w=" + r.width
  //   + "<br />r.h=" + r.height;
}

function gridDbg() {
  let gridHtml = "";
  for (let g = 0; g <= gridSize; ++g) {
    gridHtml += "<path d='M -1 " + (g * gridUnit - 1) + " 2 " + (g * gridUnit - 1) + "' />";
    gridHtml += "<path d='M " + (g * gridUnit - 1) + " -1 " + (g * gridUnit - 1) + " 2' />";
  }
  sId("g").innerHTML = gridHtml;
}

function heatmapDbg() {
  let gridHtml = "";
  for (let gy = 0; gy < gridSize; ++gy) {
    gridHtml += "<tr>";
    for (let gx = 0; gx < gridSize; ++gx) {
      gridHtml += ("<td>" + grids[flatten(gx, gy)].size + "</td>");
    }
    gridHtml += "</tr>";
  }
  sId("hdbg").innerHTML = gridHtml;
}


// main logic.
function showPacking() {
  sId("n").innerHTML = n.toString();
  randomPack();

  genGrid();
  calcRadius();

  let circlesHtml = "";
  for (let c = 1; c <= n; ++c) {
    circlesHtml += "<circle id='" + cDivId(c) + "' class='c' cx='" + p[c][0] + "' cy='" + p[c][1] + "' r='" + r + "' />";
  }
  sId("c").innerHTML = circlesHtml;

  for (let c of sCls("c")) { c.addEventListener("mousedown", clickCircle); }

  optimize(true);
}

// entry.
onDomReady(function () {
  sId("v").addEventListener("mousedown", clickBlank); // https://developer.mozilla.org/en-US/docs/Web/API/Event

  window.addEventListener("mousemove", function (e) {
    if (pickedCircle == null) { return; }
    moveCircle(pickedCircle, e.clientX, e.clientY);
  });

  n = randInt(4, 10);
  if (window.location.search && (window.location.search.length > 0)) {
    n = window.location.search.substring(1);
  }
  showPacking();
});
