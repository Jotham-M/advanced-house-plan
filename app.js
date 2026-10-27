const svg = document.getElementById('planCanvas');
const snapSlider = document.getElementById('snapSize');
const snapValue = document.getElementById('snapValue');
const clearCanvasButton = document.getElementById('clearCanvas');
const exportButton = document.getElementById('exportSvg');
const saveButton = document.getElementById('savePlan');
const importButton = document.getElementById('importPlan');
const importFile = document.getElementById('importFile');
const printButton = document.getElementById('printPlan');
const generatePlanButton = document.getElementById('generatePlan');
const groundAreaInput = document.getElementById('groundArea');
const bedroomCountInput = document.getElementById('bedroomCount');
const bathroomCountInput = document.getElementById('bathroomCount');
const designStyleInput = document.getElementById('designStyle');
const buildingTypeInput = document.getElementById('buildingType');
const roofStyleInput = document.getElementById('roofStyle');
const floorCountInput = document.getElementById('floorCount');
const wallHeightInput = document.getElementById('wallHeight');
const projectNameInput = document.getElementById('projectName');
const materialResults = document.getElementById('materialResults');
const toast = document.getElementById('toast');

const STORAGE_KEY = 'planform-house-plan-v1';
const SVG_WIDTH = 1100;
const SVG_HEIGHT = 750;
const DEFAULT_VIEWBOX = { x: 0, y: 0, width: SVG_WIDTH, height: SVG_HEIGHT };
const state = {
  tool: 'wall',
  snap: Number(snapSlider.value),
  viewMode: '2d',
  rooms: [],
  walls: [],
  labels: [],
  openings: [],
  scale: 30,
  wallHeight: 2.8,
  designStyle: 'urban',
  buildingType: 'house',
  roofStyle: 'auto',
  floorCount: 1,
  activeFloor: 0,
  draft: null,
  viewBox: { ...DEFAULT_VIEWBOX },
};

const undoStack = [];
const redoStack = [];
let toastTimer;

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (character) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  })[character]);
}

function formatNumber(value, decimals = 0) {
  return new Intl.NumberFormat('en-US', {
    maximumFractionDigits: decimals,
    minimumFractionDigits: decimals,
  }).format(value);
}

function snap(value) {
  return Math.round(value / state.snap) * state.snap;
}

function notify(message) {
  toast.textContent = message;
  toast.classList.add('visible');
  window.clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => toast.classList.remove('visible'), 3200);
}

function currentPlan() {
  return {
    projectName: projectNameInput.value.trim() || 'Untitled plan',
    groundArea: Number(groundAreaInput.value) || 180,
    bedrooms: Number(bedroomCountInput.value) || 3,
    bathrooms: Number(bathroomCountInput.value) || 2,
    designStyle: state.designStyle,
    buildingType: state.buildingType,
    roofStyle: state.roofStyle,
    floorCount: state.floorCount,
    snap: state.snap,
    scale: state.scale,
    wallHeight: state.wallHeight,
    rooms: state.rooms,
    walls: state.walls,
    labels: state.labels,
    openings: state.openings,
  };
}

function snapshotPlan() {
  return JSON.parse(JSON.stringify(currentPlan()));
}

function updateHistoryButtons() {
  document.getElementById('undoButton').disabled = undoStack.length === 0;
  document.getElementById('redoButton').disabled = redoStack.length === 0;
}

function pushHistory() {
  undoStack.push(snapshotPlan());
  if (undoStack.length > 60) undoStack.shift();
  redoStack.length = 0;
  updateHistoryButtons();
}

function applyPlan(plan) {
  projectNameInput.value = plan.projectName;
  groundAreaInput.value = plan.groundArea;
  bedroomCountInput.value = plan.bedrooms;
  bathroomCountInput.value = plan.bathrooms;
  designStyleInput.value = plan.designStyle;
  buildingTypeInput.value = plan.buildingType;
  roofStyleInput.value = plan.roofStyle;
  floorCountInput.value = plan.floorCount;
  wallHeightInput.value = plan.wallHeight;
  state.snap = plan.snap;
  state.scale = plan.scale;
  state.wallHeight = plan.wallHeight;
  state.designStyle = plan.designStyle;
  state.buildingType = plan.buildingType;
  state.roofStyle = plan.roofStyle;
  state.floorCount = plan.floorCount;
  state.activeFloor = clamp(state.activeFloor, 0, state.floorCount - 1);
  state.rooms = plan.rooms;
  state.walls = plan.walls;
  state.labels = plan.labels;
  state.openings = plan.openings;
  state.draft = null;
  snapSlider.value = String(state.snap);
  snapValue.textContent = `${state.snap} px`;
  updateWorkspaceTitle();
  updatePresetDescription();
  renderFloorTabs();
  fitPlanToView(false);
  render();
}

function undo() {
  if (!undoStack.length) return;
  redoStack.push(snapshotPlan());
  applyPlan(undoStack.pop());
  updateHistoryButtons();
  persistPlan();
  notify('Last change undone.');
}

function redo() {
  if (!redoStack.length) return;
  undoStack.push(snapshotPlan());
  applyPlan(redoStack.pop());
  updateHistoryButtons();
  persistPlan();
  notify('Change restored.');
}

function setTool(toolName) {
  state.tool = toolName;
  state.draft = null;
  document.querySelectorAll('.tool-button').forEach((button) => {
    button.classList.toggle('active', button.dataset.tool === toolName);
  });
  updateCanvasHint();
  render();
}

function setViewMode(viewMode) {
  state.viewMode = viewMode;
  state.draft = null;
  document.querySelectorAll('.view-btn').forEach((button) => {
    button.classList.toggle('active', button.dataset.view === viewMode);
  });
  document.querySelectorAll('.tool-button').forEach((button) => {
    button.disabled = viewMode !== '2d';
    button.setAttribute('aria-pressed', String(button.dataset.tool === state.tool));
  });
  fitPlanToView(false);
  const floorCaption = viewMode === '2d' || viewMode === 'top'
    ? ` · Floor ${state.activeFloor + 1} of ${state.floorCount}`
    : '';
  document.getElementById('viewCaption').innerHTML = `${escapeHtml(viewName(viewMode))}${floorCaption} <span>·</span> 1 px = ${formatNumber(1 / state.scale, 2)} m`;
  updateCanvasHint();
  render();
}

function viewName(viewMode) {
  return {
    '2d': 'Floor plan',
    top: 'Top view',
    front: 'Front elevation',
    side: 'Side elevation',
    isometric: '3D isometric',
  }[viewMode] || 'Floor plan';
}

function updatePresetDescription() {
  const style = state.designStyle === 'rural' ? 'Rural / country' : 'Modern urban';
  const building = state.buildingType === 'highrise' ? 'apartment building' : 'home';
  const details = state.designStyle === 'rural'
    ? 'Includes a generous veranda and more spacious country-style rooms.'
    : 'Uses a compact footprint with an open-plan living and dining space.';
  const roof = effectiveRoofStyle();
  document.getElementById('presetDescription').textContent =
    `${style} ${building}: ${details} ${roof[0].toUpperCase()}${roof.slice(1)} roof. Each storey is generated as an editable floor.`;
}

function effectiveRoofStyle() {
  if (state.roofStyle !== 'auto') return state.roofStyle;
  if (state.buildingType === 'highrise' || state.designStyle === 'urban') return 'flat';
  return 'gable';
}

function roofGeometry(bounds) {
  const style = effectiveRoofStyle();
  const base = state.wallHeight * state.floorCount;
  const rise = style === 'flat'
    ? 0.3
    : clamp(Math.min(bounds.width, bounds.height) / state.scale * 0.22, 0.8, 3.2);
  const centerX = (bounds.minX + bounds.maxX) / 2;
  const inset = (bounds.maxY - bounds.minY) * 0.2;
  return {
    style,
    base,
    rise,
    corners: {
      frontLeft: { x: bounds.minX, y: bounds.minY, z: base },
      frontRight: { x: bounds.maxX, y: bounds.minY, z: base },
      backLeft: { x: bounds.minX, y: bounds.maxY, z: base },
      backRight: { x: bounds.maxX, y: bounds.maxY, z: base },
    },
    ridgeFront: { x: centerX, y: bounds.minY + (style === 'hip' ? inset : 0), z: base + rise },
    ridgeBack: { x: centerX, y: bounds.maxY - (style === 'hip' ? inset : 0), z: base + rise },
  };
}

function roofFaces(bounds) {
  const roof = roofGeometry(bounds);
  const { corners, ridgeFront, ridgeBack } = roof;
  if (roof.style === 'flat') {
    return [{
      className: 'roof-flat',
      points: [
        { x: bounds.minX, y: bounds.minY, z: roof.base + roof.rise },
        { x: bounds.maxX, y: bounds.minY, z: roof.base + roof.rise },
        { x: bounds.maxX, y: bounds.maxY, z: roof.base + roof.rise },
        { x: bounds.minX, y: bounds.maxY, z: roof.base + roof.rise },
      ],
    }];
  }
  if (roof.style === 'gable') {
    return [
      { className: 'roof-slope roof-left', points: [corners.frontLeft, ridgeFront, ridgeBack, corners.backLeft] },
      { className: 'roof-slope roof-right', points: [corners.frontRight, ridgeFront, ridgeBack, corners.backRight] },
      { className: 'roof-gable', points: [corners.frontLeft, ridgeFront, corners.frontRight] },
      { className: 'roof-gable', points: [corners.backLeft, ridgeBack, corners.backRight] },
    ];
  }
  return [
    { className: 'roof-slope roof-left', points: [corners.frontLeft, corners.backLeft, ridgeBack, ridgeFront] },
    { className: 'roof-slope roof-right', points: [corners.frontRight, corners.backRight, ridgeBack, ridgeFront] },
    { className: 'roof-slope roof-front', points: [corners.frontLeft, corners.frontRight, ridgeFront] },
    { className: 'roof-slope roof-back', points: [corners.backLeft, corners.backRight, ridgeBack] },
  ];
}

function roofMarkup(projector, bounds) {
  const faces = roofFaces(bounds).map((face) => {
    const points = face.points.map((point) => projector(point.x, point.y, point.z));
    return `<polygon class="roof-face ${face.className}" points="${pointsAttribute(points)}" />`;
  }).join('');
  const roof = roofGeometry(bounds);
  const eaves = roof.style === 'flat' ? [] : [
    [{ x: bounds.minX, y: bounds.minY, z: roof.base }, roof.ridgeFront, { x: bounds.maxX, y: bounds.minY, z: roof.base }],
    [{ x: bounds.minX, y: bounds.maxY, z: roof.base }, roof.ridgeBack, { x: bounds.maxX, y: bounds.maxY, z: roof.base }],
  ];
  const outlines = eaves.map((line) => {
    const points = line.map((point) => projector(point.x, point.y, point.z));
    return `<polyline class="roof-ridge" points="${pointsAttribute(points)}" />`;
  }).join('');
  let ridgeMarkup = '';
  if (roof.style !== 'flat') {
    const ridge = [roof.ridgeFront, roof.ridgeBack].map((point) => projector(point.x, point.y, point.z));
    ridgeMarkup = `<polyline class="roof-ridge" points="${pointsAttribute(ridge)}" />`;
  }
  return `${faces}${outlines}${ridgeMarkup}`;
}

function renderFloorTabs() {
  const tabs = document.getElementById('floorTabs');
  tabs.hidden = state.floorCount <= 1;
  if (state.floorCount <= 1) {
    tabs.innerHTML = '';
    return;
  }
  tabs.innerHTML = Array.from({ length: state.floorCount }, (_, floor) => `
    <button class="floor-tab${floor === state.activeFloor ? ' active' : ''}" data-floor="${floor}" aria-pressed="${floor === state.activeFloor}">
      ${floor === 0 ? 'Ground floor' : `Floor ${floor + 1}`}
    </button>
  `).join('');
  tabs.querySelectorAll('.floor-tab').forEach((button) => {
    button.addEventListener('click', () => {
      state.activeFloor = Number(button.dataset.floor);
      renderFloorTabs();
      render();
    });
  });
}

function updateCanvasHint() {
  const hints = {
    wall: 'Drag to draw a wall · Hold and drag to create rooms',
    room: 'Click and drag to draw a room rectangle',
    door: 'Click near a room edge to place a door',
    window: 'Click near a room edge to place a window',
    label: 'Click to place a label',
    erase: 'Click a wall, room, opening, or label to erase it',
  };
  document.getElementById('canvasHint').textContent = state.viewMode === '2d'
    ? hints[state.tool]
    : 'Switch to 2D plan to edit rooms and walls';
}

function updateWorkspaceTitle() {
  const name = projectNameInput.value.trim() || 'Untitled plan';
  document.getElementById('workspaceProjectName').textContent = name;
  document.title = `${name} — Planform`;
}

function getSvgPoint(event) {
  const matrix = svg.getScreenCTM();
  if (!matrix) return { x: event.offsetX, y: event.offsetY };
  const point = svg.createSVGPoint();
  point.x = event.clientX;
  point.y = event.clientY;
  const transformed = point.matrixTransform(matrix.inverse());
  return { x: transformed.x, y: transformed.y };
}

function normalizeRoomRect(draft) {
  return {
    x: Math.min(draft.x, draft.x + draft.w),
    y: Math.min(draft.y, draft.y + draft.h),
    width: Math.abs(draft.w),
    height: Math.abs(draft.h),
  };
}

function planBounds(padding = 0) {
  const xs = [];
  const ys = [];
  state.rooms.forEach((room) => {
    xs.push(room.x, room.x + room.width);
    ys.push(room.y, room.y + room.height);
  });
  state.walls.forEach((wall) => {
    xs.push(wall.x1, wall.x2);
    ys.push(wall.y1, wall.y2);
  });
  state.labels.forEach((label) => {
    xs.push(label.x);
    ys.push(label.y);
  });
  if (!xs.length) return { minX: 180, minY: 150, maxX: 920, maxY: 610, width: 740, height: 460 };
  const minX = Math.min(...xs) - padding;
  const minY = Math.min(...ys) - padding;
  const maxX = Math.max(...xs) + padding;
  const maxY = Math.max(...ys) + padding;
  return { minX, minY, maxX, maxY, width: maxX - minX, height: maxY - minY };
}

function fitPlanToView(shouldRender = true) {
  if (state.viewMode !== '2d') {
    state.viewBox = { ...DEFAULT_VIEWBOX };
    svg.setAttribute('viewBox', `0 0 ${SVG_WIDTH} ${SVG_HEIGHT}`);
    document.getElementById('zoomValue').textContent = '100%';
    if (shouldRender) render();
    return;
  }
  const bounds = planBounds(58);
  const fitScale = Math.min(SVG_WIDTH / Math.max(bounds.width, 1), SVG_HEIGHT / Math.max(bounds.height, 1));
  const width = SVG_WIDTH / Math.max(fitScale, 0.1);
  const height = SVG_HEIGHT / Math.max(fitScale, 0.1);
  state.viewBox = {
    x: (bounds.minX + bounds.maxX - width) / 2,
    y: (bounds.minY + bounds.maxY - height) / 2,
    width,
    height,
  };
  svg.setAttribute('viewBox', `${state.viewBox.x} ${state.viewBox.y} ${width} ${height}`);
  document.getElementById('zoomValue').textContent = `${Math.round(fitScale * 100)}%`;
  if (shouldRender) render();
}

function changeZoom(factor) {
  const old = state.viewBox;
  const width = clamp(old.width * factor, 300, 2400);
  const height = width * SVG_HEIGHT / SVG_WIDTH;
  state.viewBox = {
    x: old.x + (old.width - width) / 2,
    y: old.y + (old.height - height) / 2,
    width,
    height,
  };
  svg.setAttribute('viewBox', `${state.viewBox.x} ${state.viewBox.y} ${width} ${height}`);
  document.getElementById('zoomValue').textContent = `${Math.round(SVG_WIDTH / width * 100)}%`;
}

function roomArea(room) {
  return room.width * room.height / (state.scale * state.scale);
}

function wallLengthMeters() {
  let length = state.rooms.reduce((total, room) => total + 2 * (room.width + room.height), 0);
  let sharedLength = 0;
  for (let first = 0; first < state.rooms.length; first += 1) {
    const roomA = state.rooms[first];
    for (let second = first + 1; second < state.rooms.length; second += 1) {
      const roomB = state.rooms[second];
      if ((roomA.floor || 0) !== (roomB.floor || 0)) continue;
      const verticalOverlap = Math.max(
        0,
        Math.min(roomA.y + roomA.height, roomB.y + roomB.height) - Math.max(roomA.y, roomB.y),
      );
      const horizontalOverlap = Math.max(
        0,
        Math.min(roomA.x + roomA.width, roomB.x + roomB.width) - Math.max(roomA.x, roomB.x),
      );
      if (Math.abs(roomA.x + roomA.width - roomB.x) < 0.01 ||
          Math.abs(roomB.x + roomB.width - roomA.x) < 0.01) {
        sharedLength += verticalOverlap;
      }
      if (Math.abs(roomA.y + roomA.height - roomB.y) < 0.01 ||
          Math.abs(roomB.y + roomB.height - roomA.y) < 0.01) {
        sharedLength += horizontalOverlap;
      }
    }
  }
  length -= sharedLength;

  state.walls.forEach((wall) => {
    const vertical = Math.abs(wall.x1 - wall.x2) < 0.01;
    const horizontal = Math.abs(wall.y1 - wall.y2) < 0.01;
    const segmentStart = vertical ? Math.min(wall.y1, wall.y2) : Math.min(wall.x1, wall.x2);
    const segmentEnd = vertical ? Math.max(wall.y1, wall.y2) : Math.max(wall.x1, wall.x2);
    const intervals = [];
    if (vertical || horizontal) {
      state.rooms.forEach((room) => {
        if ((room.floor || 0) !== (wall.floor || 0)) return;
        const matchingEdge = vertical
          ? Math.abs(wall.x1 - room.x) < 0.01 || Math.abs(wall.x1 - (room.x + room.width)) < 0.01
          : Math.abs(wall.y1 - room.y) < 0.01 || Math.abs(wall.y1 - (room.y + room.height)) < 0.01;
        if (!matchingEdge) return;
        const roomStart = vertical ? room.y : room.x;
        const roomEnd = vertical ? room.y + room.height : room.x + room.width;
        const start = Math.max(segmentStart, roomStart);
        const end = Math.min(segmentEnd, roomEnd);
        if (end > start) intervals.push([start, end]);
      });
    }
    intervals.sort((first, second) => first[0] - second[0]);
    let covered = 0;
    let rangeStart = null;
    let rangeEnd = null;
    intervals.forEach(([start, end]) => {
      if (rangeStart === null) {
        rangeStart = start;
        rangeEnd = end;
      } else if (start <= rangeEnd) {
        rangeEnd = Math.max(rangeEnd, end);
      } else {
        covered += rangeEnd - rangeStart;
        rangeStart = start;
        rangeEnd = end;
      }
    });
    if (rangeStart !== null) covered += rangeEnd - rangeStart;
    const wallLength = Math.hypot(wall.x2 - wall.x1, wall.y2 - wall.y1);
    length += Math.max(0, wallLength - covered);
  });
  return length / state.scale;
}

function renderPlanSummary() {
  const area = state.rooms.length
    ? state.rooms.reduce((total, room) => total + roomArea(room), 0)
    : Number(groundAreaInput.value) || 0;
  const length = wallLengthMeters();
  const wallSurface = length * state.wallHeight;
  const bricks = Math.round(wallSurface * 55);
  const concrete = area * 0.12;
  materialResults.innerHTML = `
    <div class="summary-stat"><span>Total floor area</span><strong>${formatNumber(area, 1)} m²</strong></div>
    <div class="summary-stat"><span>Storeys</span><strong>${state.floorCount}</strong></div>
    <div class="summary-stat"><span>Rooms per floor</span><strong>${state.rooms.filter((room) => (room.floor || 0) === state.activeFloor).length}</strong></div>
    <div class="summary-stat"><span>Wall length</span><strong>${formatNumber(length, 1)} m</strong></div>
    <div class="summary-stat"><span>Bricks · rough</span><strong>${formatNumber(bricks)}</strong></div>
    <div class="summary-stat"><span>Concrete · rough</span><strong>${formatNumber(concrete, 1)} m³</strong></div>
    <div class="summary-stat"><span>Wall height</span><strong>${formatNumber(state.wallHeight, 1)} m</strong></div>
  `;
  const floorRoomCount = state.rooms.filter((room) => (room.floor || 0) === state.activeFloor).length;
  document.getElementById('planStats').innerHTML =
    `${floorRoomCount} rooms · ${state.floorCount > 1 ? `Floor ${state.activeFloor + 1} of ${state.floorCount}` : 'Single storey'} <span>·</span> ${formatNumber(area, 1)} m² total`;
}

function createRoomSpecs(area, bedrooms, bathrooms, designStyle, buildingType) {
  const rooms = designStyle === 'rural'
    ? [
      { name: 'Living room', weight: 0.19 },
      { name: 'Dining', weight: 0.1 },
      { name: 'Kitchen', weight: 0.105 },
      { name: 'Veranda', weight: 0.12 },
      { name: 'Entry', weight: 0.04 },
    ]
    : [
      { name: 'Open-plan living / dining', weight: 0.28 },
      { name: 'Kitchen', weight: 0.105 },
      { name: 'Entry', weight: 0.04 },
    ];
  for (let index = 1; index <= bedrooms; index += 1) {
    rooms.push({
      name: index === 1 ? 'Primary bedroom' : `Bedroom ${index}`,
      weight: index === 1 ? 0.15 : 0.105,
    });
  }
  for (let index = 1; index <= bathrooms; index += 1) {
    rooms.push({ name: index === 1 ? 'Bathroom' : `Bath ${index}`, weight: 0.045 });
  }
  rooms.push({ name: 'Laundry', weight: 0.055 });
  if (buildingType === 'highrise') {
    rooms.push(
      { name: 'Lift lobby', weight: 0.055 },
      { name: 'Stairwell', weight: 0.05 },
      { name: 'Lift', weight: 0.025 },
      { name: 'Shared corridor', weight: 0.065 },
    );
  }

  const totalWeight = rooms.reduce((total, room) => total + room.weight, 0);
  rooms.forEach((room) => { room.area = area * room.weight / totalWeight; });
  return rooms;
}

function addUniqueWall(x1, y1, x2, y2, walls) {
  const key = [x1, y1, x2, y2].join(',');
  const reverseKey = [x2, y2, x1, y1].join(',');
  if (!walls.some((wall) => {
    const wallKey = [wall.x1, wall.y1, wall.x2, wall.y2].join(',');
    return wallKey === key || wallKey === reverseKey;
  })) walls.push({ x1, y1, x2, y2 });
}

function generateSmartPlan() {
  const groundArea = clamp(Number(groundAreaInput.value) || 180, 40, 5000);
  const bedrooms = clamp(Math.round(Number(bedroomCountInput.value) || 3), 1, 6);
  const bathrooms = clamp(Math.round(Number(bathroomCountInput.value) || 2), 1, 5);
  const designStyle = designStyleInput.value === 'rural' ? 'rural' : 'urban';
  const buildingType = buildingTypeInput.value === 'highrise' ? 'highrise' : 'house';
  const roofStyle = ['flat', 'gable', 'hip'].includes(roofStyleInput.value) ? roofStyleInput.value : 'auto';
  const floorCount = clamp(Math.round(Number(floorCountInput.value) || 1), buildingType === 'highrise' ? 2 : 1, 30);
  pushHistory();
  groundAreaInput.value = String(groundArea);
  bedroomCountInput.value = String(bedrooms);
  bathroomCountInput.value = String(bathrooms);
  designStyleInput.value = designStyle;
  buildingTypeInput.value = buildingType;
  roofStyleInput.value = roofStyle;
  floorCountInput.value = String(floorCount);
  state.designStyle = designStyle;
  state.buildingType = buildingType;
  state.roofStyle = roofStyle;
  state.floorCount = floorCount;
  state.activeFloor = 0;
  state.wallHeight = clamp(Number(wallHeightInput.value) || 2.8, 2, 6);
  wallHeightInput.value = String(state.wallHeight);

  const specs = createRoomSpecs(groundArea, bedrooms, bathrooms, designStyle, buildingType);
  const cols = Math.min(3, specs.length);
  const rows = [];
  for (let index = 0; index < specs.length; index += cols) rows.push(specs.slice(index, index + cols));

  const footprintRatio = designStyle === 'rural' ? 1.65 : buildingType === 'highrise' ? 1.12 : 1.35;
  const footprintWidth = Math.sqrt(groundArea * footprintRatio);
  const footprintHeight = groundArea / footprintWidth;
  const scale = Math.min(28, 820 / footprintWidth, 490 / footprintHeight);
  state.scale = Math.max(2.5, scale);
  const width = footprintWidth * state.scale;
  const height = footprintHeight * state.scale;
  const x = (SVG_WIDTH - width) / 2;
  const y = (SVG_HEIGHT - height) / 2;
  const rowTotals = rows.map((row) => row.reduce((total, room) => total + room.area, 0));
  let currentY = y;
  const generatedRooms = [];

  rows.forEach((row, rowIndex) => {
    const rowHeight = height * rowTotals[rowIndex] / groundArea;
    let currentX = x;
    row.forEach((room) => {
      const roomWidth = width * room.area / rowTotals[rowIndex];
      generatedRooms.push({
        x: currentX,
        y: currentY,
        width: roomWidth,
        height: rowHeight,
        name: room.name,
        floor: 0,
      });
      currentX += roomWidth;
    });
    currentY += rowHeight;
  });

  state.rooms = [];
  state.labels = [];
  state.openings = [];
  state.walls = [];
  const groundFloorWalls = [];
  addUniqueWall(x, y, x + width, y, groundFloorWalls);
  addUniqueWall(x + width, y, x + width, y + height, groundFloorWalls);
  addUniqueWall(x + width, y + height, x, y + height, groundFloorWalls);
  addUniqueWall(x, y + height, x, y, groundFloorWalls);

  rows.forEach((row, rowIndex) => {
    const rowRooms = generatedRooms.slice(rowIndex * cols, rowIndex * cols + row.length);
    for (let index = 0; index < rowRooms.length - 1; index += 1) {
      const room = rowRooms[index];
      addUniqueWall(room.x + room.width, room.y, room.x + room.width, room.y + room.height, groundFloorWalls);
    }
    if (rowIndex < rows.length - 1) {
      const room = rowRooms[0];
      addUniqueWall(x, room.y + room.height, x + width, room.y + room.height, groundFloorWalls);
    }
  });

  for (let floor = 0; floor < floorCount; floor += 1) {
    state.rooms.push(...generatedRooms.map((room) => ({ ...room, floor })));
    state.walls.push(...groundFloorWalls.map((wall) => ({ ...wall, floor })));
  }

  state.viewMode = '2d';
  document.querySelectorAll('.view-btn').forEach((button) => {
    button.classList.toggle('active', button.dataset.view === '2d');
  });
  renderFloorTabs();
  updatePresetDescription();
  updateCanvasHint();
  fitPlanToView(false);
  render();
  persistPlan();
  const totalArea = groundArea * floorCount;
  notify(`Generated a ${formatNumber(totalArea)} m² ${designStyle === 'rural' ? 'rural' : 'modern urban'} concept across ${floorCount} ${floorCount === 1 ? 'storey' : 'storeys'}.`);
}

function roomOverlaps(rect) {
  return state.rooms.some((room) =>
    (room.floor || 0) === state.activeFloor &&
    rect.x < room.x + room.width - 0.01 &&
    rect.x + rect.width > room.x + 0.01 &&
    rect.y < room.y + room.height - 0.01 &&
    rect.y + rect.height > room.y + 0.01,
  );
}

function addRoom(rect) {
  const room = {
    ...rect,
    name: `Room ${state.rooms.length + 1}`,
    floor: state.activeFloor,
  };
  state.rooms.push(room);
}

function addLabel(x, y, text) {
  state.labels.push({ x, y, text, floor: state.activeFloor });
}

function projectPoint(mode, x, y, z, bounds) {
  const centerX = (bounds.minX + bounds.maxX) / 2;
  const centerY = (bounds.minY + bounds.maxY) / 2;
  const elevation = z * state.scale;
  if (mode === 'front') return { x, y: -elevation };
  if (mode === 'side') return { x: y, y: -elevation };
  if (mode === 'isometric') {
    const localX = x - centerX;
    const localY = y - centerY;
    return {
      x: (localX - localY) * 0.72,
      y: (localX + localY) * 0.34 - elevation * 0.78,
    };
  }
  return { x, y };
}

function createProjector(mode, bounds) {
  const points = [];
  state.rooms.forEach((room) => {
    const corners = [
      [room.x, room.y],
      [room.x + room.width, room.y],
      [room.x + room.width, room.y + room.height],
      [room.x, room.y + room.height],
    ];
    corners.forEach(([x, y]) => {
      points.push(projectPoint(mode, x, y, 0, bounds));
      if (mode === 'isometric') points.push(projectPoint(mode, x, y, state.wallHeight, bounds));
    });
  });
  state.walls.forEach((wall) => {
    points.push(projectPoint(mode, wall.x1, wall.y1, 0, bounds));
    points.push(projectPoint(mode, wall.x2, wall.y2, 0, bounds));
    if (mode === 'isometric') {
      points.push(projectPoint(mode, wall.x1, wall.y1, state.wallHeight, bounds));
      points.push(projectPoint(mode, wall.x2, wall.y2, state.wallHeight, bounds));
    }
  });
  roofFaces(bounds).forEach((face) => {
    face.points.forEach((point) => points.push(projectPoint(mode, point.x, point.y, point.z, bounds)));
  });
  if (!points.length) {
    points.push({ x: 0, y: 0 }, { x: 800, y: 500 });
  }
  if (mode === 'front' || mode === 'side') {
    const totalHeight = state.wallHeight * state.floorCount;
    points.push(projectPoint(mode, bounds.minX, bounds.minY, totalHeight, bounds));
    points.push(projectPoint(mode, bounds.maxX, bounds.maxY, totalHeight, bounds));
  }
  if (mode === 'isometric') {
    const totalHeight = state.wallHeight * state.floorCount;
    points.push(projectPoint(mode, bounds.minX, bounds.minY, totalHeight, bounds));
    points.push(projectPoint(mode, bounds.maxX, bounds.maxY, totalHeight, bounds));
  }
  const minX = Math.min(...points.map((point) => point.x));
  const maxX = Math.max(...points.map((point) => point.x));
  const minY = Math.min(...points.map((point) => point.y));
  const maxY = Math.max(...points.map((point) => point.y));
  const scale = Math.min(900 / Math.max(maxX - minX, 1), 520 / Math.max(maxY - minY, 1));
  const shiftX = (SVG_WIDTH - (maxX - minX) * scale) / 2 - minX * scale;
  const shiftY = (SVG_HEIGHT - (maxY - minY) * scale) / 2 - minY * scale;
  return (x, y, z = 0) => {
    const point = projectPoint(mode, x, y, z, bounds);
    return { x: point.x * scale + shiftX, y: point.y * scale + shiftY };
  };
}

function pointsAttribute(points) {
  return points.map((point) => `${point.x},${point.y}`).join(' ');
}

function dimensionMarkup(bounds) {
  const width = (bounds.maxX - bounds.minX) / state.scale;
  const height = (bounds.maxY - bounds.minY) / state.scale;
  const top = bounds.minY - 25;
  const right = bounds.maxX + 25;
  return `
    <g class="dimensions" aria-label="Building dimensions">
      <line x1="${bounds.minX}" y1="${top}" x2="${bounds.maxX}" y2="${top}" />
      <line x1="${bounds.minX}" y1="${top - 5}" x2="${bounds.minX}" y2="${top + 5}" />
      <line x1="${bounds.maxX}" y1="${top - 5}" x2="${bounds.maxX}" y2="${top + 5}" />
      <text x="${(bounds.minX + bounds.maxX) / 2}" y="${top - 7}">${formatNumber(width, 1)} m</text>
      <line x1="${right}" y1="${bounds.minY}" x2="${right}" y2="${bounds.maxY}" />
      <line x1="${right - 5}" y1="${bounds.minY}" x2="${right + 5}" y2="${bounds.minY}" />
      <line x1="${right - 5}" y1="${bounds.maxY}" x2="${right + 5}" y2="${bounds.maxY}" />
      <text x="${right + 14}" y="${(bounds.minY + bounds.maxY) / 2}" transform="rotate(-90 ${right + 14} ${(bounds.minY + bounds.maxY) / 2})">${formatNumber(height, 1)} m</text>
    </g>
  `;
}

function openingMarkup(opening, index) {
  const horizontal = opening.edge === 'top' || opening.edge === 'bottom';
  const width = opening.width;
  const height = opening.type === 'window' ? 8 : 10;
  const x = opening.x - (horizontal ? width / 2 : height / 2);
  const y = opening.y - (horizontal ? height / 2 : width / 2);
  return `
    <g data-kind="opening" data-id="${index}" class="opening ${opening.type}" aria-label="${opening.type}">
      <rect x="${x}" y="${y}" width="${horizontal ? width : height}" height="${horizontal ? height : width}" rx="1" />
      <text x="${opening.x}" y="${opening.y + 3}">${opening.type === 'door' ? 'D' : 'W'}</text>
    </g>
  `;
}

function render2D() {
  const bounds = planBounds();
  const rooms = state.rooms.map((room, index) => ({ room, index }))
    .filter(({ room }) => (room.floor || 0) === state.activeFloor)
    .map(({ room, index }) => {
    const area = roomArea(room);
    return `
      <g data-kind="room" data-id="${index}" class="room-group">
        <rect class="room" x="${room.x}" y="${room.y}" width="${room.width}" height="${room.height}" />
        <text class="room-label" x="${room.x + room.width / 2}" y="${room.y + room.height / 2 - 4}">${escapeHtml(room.name)}</text>
        <text class="room-area" x="${room.x + room.width / 2}" y="${room.y + room.height / 2 + 14}">${formatNumber(area, 1)} m²</text>
      </g>
    `;
  }).join('');
  const walls = state.walls.map((wall, index) => ({ wall, index }))
    .filter(({ wall }) => (wall.floor || 0) === state.activeFloor)
    .map(({ wall, index }) => `
    <line data-kind="wall" data-id="${index}" class="wall" x1="${wall.x1}" y1="${wall.y1}" x2="${wall.x2}" y2="${wall.y2}" />
  `).join('');
  const labels = state.labels.map((label, index) => ({ label, index }))
    .filter(({ label }) => (label.floor || 0) === state.activeFloor)
    .map(({ label, index }) => `
    <text data-kind="label" data-id="${index}" class="plan-label" x="${label.x}" y="${label.y}">${escapeHtml(label.text)}</text>
  `).join('');
  const openings = state.openings.map((opening, index) => ({ opening, index }))
    .filter(({ opening }) => (opening.floor || 0) === state.activeFloor)
    .map(({ opening, index }) => openingMarkup(opening, index)).join('');
  let draftMarkup = '';
  if (state.draft?.kind === 'wall') {
    draftMarkup = `<line class="preview-wall" x1="${state.draft.x1}" y1="${state.draft.y1}" x2="${state.draft.x2}" y2="${state.draft.y2}" />`;
  } else if (state.draft?.kind === 'room') {
    const rect = normalizeRoomRect(state.draft);
    draftMarkup = `<rect class="preview-room" x="${rect.x}" y="${rect.y}" width="${rect.width}" height="${rect.height}" />`;
  }
  return `
    <defs>
      <pattern id="gridPattern" width="${state.snap}" height="${state.snap}" patternUnits="userSpaceOnUse">
        <path d="M ${state.snap} 0 L 0 0 0 ${state.snap}" fill="none" stroke="#e9edf2" stroke-width="1" />
      </pattern>
    </defs>
    <rect width="1100" height="750" fill="#fbfcfe" />
    <rect width="1100" height="750" fill="url(#gridPattern)" />
    ${rooms}
    ${walls}
    ${labels}
    ${openings}
    ${(state.rooms.length || state.walls.length) ? dimensionMarkup(bounds) : ''}
    ${draftMarkup}
  `;
}

function renderTopView() {
  const projector = createProjector('top', planBounds());
  const rooms = state.rooms.filter((room) => (room.floor || 0) === state.activeFloor).map((room) => {
    const points = [
      projector(room.x, room.y),
      projector(room.x + room.width, room.y),
      projector(room.x + room.width, room.y + room.height),
      projector(room.x, room.y + room.height),
    ];
    const center = projector(room.x + room.width / 2, room.y + room.height / 2);
    return `
      <polygon class="top-room" points="${pointsAttribute(points)}" />
      <text class="top-room-label" x="${center.x}" y="${center.y}">${escapeHtml(room.name)}</text>
    `;
  }).join('');
  const walls = state.walls.filter((wall) => (wall.floor || 0) === state.activeFloor).map((wall) => {
    const start = projector(wall.x1, wall.y1);
    const end = projector(wall.x2, wall.y2);
    return `<line class="top-wall" x1="${start.x}" y1="${start.y}" x2="${end.x}" y2="${end.y}" />`;
  }).join('');
  return `<rect width="1100" height="750" fill="#fbfcfe" />${rooms}${walls}<text class="view-title" x="550" y="52">Top view</text>`;
}

function renderElevation(mode, bounds) {
  const projector = createProjector(mode, bounds);
  const front = mode === 'front';
  const low = front ? bounds.maxY : bounds.minX;
  const high = front ? bounds.minY : bounds.maxX;
  const leftPoint = front
    ? projector(bounds.minX, low, 0)
    : projector(bounds.minY, bounds.minY, 0);
  const rightPoint = front
    ? projector(bounds.maxX, low, 0)
    : projector(bounds.maxY, bounds.maxY, 0);
  const totalHeight = state.wallHeight * state.floorCount;
  const topLeft = front
    ? projector(bounds.minX, low, totalHeight)
    : projector(bounds.minY, bounds.minY, totalHeight);
  const topRight = front
    ? projector(bounds.maxX, low, totalHeight)
    : projector(bounds.maxY, bounds.maxY, totalHeight);
  const width = Math.max(Math.abs(rightPoint.x - leftPoint.x), 1);
  const height = Math.abs(leftPoint.y - topLeft.y);
  const wallX = Math.min(leftPoint.x, rightPoint.x);
  const wallY = Math.min(topLeft.y, topRight.y);
  const wallWidth = width;
  const wallHeight = height;
  const openings = state.openings.filter((opening) => front
    ? opening.edge === 'bottom'
    : opening.edge === 'right');
  const openingShapes = Array.from({ length: state.floorCount }, (_, floor) => openings
    .filter((opening) => (opening.floor || 0) === floor)
    .map((opening) => {
      const centerX = projector(opening.x, opening.y, floor * state.wallHeight).x;
      const floorBottom = projector(opening.x, opening.y, floor * state.wallHeight).y;
      const openingWidth = Math.min(opening.width * (width / Math.max(Math.abs(high - low), 1)), wallWidth * 0.18);
      const openingHeight = Math.min(wallHeight / state.floorCount * 0.7, wallHeight / state.floorCount * (opening.type === 'door' ? 0.78 : 0.34));
      return `<rect class="elevation-opening ${opening.type}" x="${centerX - openingWidth / 2}" y="${floorBottom - openingHeight}" width="${openingWidth}" height="${openingHeight}" />`;
    }).join('')).join('');
  const facadeWindowWidth = Math.max(9, wallWidth * (state.floorCount > 1 ? 0.075 : 0.11));
  const facadeWindowHeight = Math.max(12, wallHeight / state.floorCount * 0.42);
  const facadeWindows = Array.from({ length: state.floorCount }, (_, floor) => {
    const windowCount = Math.max(2, Math.min(7, Math.floor(wallWidth / 105)));
    return Array.from({ length: windowCount }, (_, index) => {
      const progress = (index + 1) / (windowCount + 1);
      const coordinate = front
        ? bounds.minX + (bounds.maxX - bounds.minX) * progress
        : bounds.minY + (bounds.maxY - bounds.minY) * progress;
      const position = front
        ? projector(coordinate, bounds.maxY, floor * state.wallHeight)
        : projector(bounds.maxY, coordinate, floor * state.wallHeight);
      return `<rect class="facade-window" x="${position.x - facadeWindowWidth / 2}" y="${position.y - facadeWindowHeight}" width="${facadeWindowWidth}" height="${facadeWindowHeight}" />`;
    }).join('');
  }).join('');
  const floorLevels = Array.from({ length: Math.max(0, state.floorCount - 1) }, (_, index) => {
    const level = index + 1;
    const start = front
      ? projector(bounds.minX, low, level * state.wallHeight)
      : projector(bounds.minY, bounds.minY, level * state.wallHeight);
    const end = front
      ? projector(bounds.maxX, low, level * state.wallHeight)
      : projector(bounds.maxY, bounds.maxY, level * state.wallHeight);
    return `<line class="floor-level" x1="${start.x}" y1="${start.y}" x2="${end.x}" y2="${end.y}" />`;
  }).join('');
  const title = front ? 'Front elevation' : 'Side elevation';
  return `
    <rect width="1100" height="750" fill="#fbfcfe" />
    <line class="ground-line" x1="${wallX - 80}" y1="${wallY + wallHeight}" x2="${wallX + wallWidth + 80}" y2="${wallY + wallHeight}" />
    <rect class="elevation-wall" x="${wallX}" y="${wallY}" width="${wallWidth}" height="${wallHeight}" />
    ${floorLevels}
    ${facadeWindows}
    ${openingShapes}
    ${roofMarkup(projector, bounds)}
    <text class="view-title" x="550" y="54">${title} · ${effectiveRoofStyle()} roof · ${formatNumber(totalHeight, 1)} m · ${state.floorCount} ${state.floorCount === 1 ? 'storey' : 'storeys'}</text>
  `;
}

function renderIsometric(bounds) {
  const projector = createProjector('isometric', bounds);
  const roomData = state.rooms.map((room) => {
    const floorLevel = (room.floor || 0) * state.wallHeight;
    const floor = [
      projector(room.x, room.y, floorLevel),
      projector(room.x + room.width, room.y, floorLevel),
      projector(room.x + room.width, room.y + room.height, floorLevel),
      projector(room.x, room.y + room.height, floorLevel),
    ];
    const wallHeight = state.wallHeight;
    const backWall = [
      projector(room.x, room.y, floorLevel + wallHeight),
      projector(room.x + room.width, room.y, floorLevel + wallHeight),
      projector(room.x + room.width, room.y, floorLevel),
      projector(room.x, room.y, floorLevel),
    ];
    const sideWall = [
      projector(room.x + room.width, room.y, floorLevel + wallHeight),
      projector(room.x + room.width, room.y + room.height, floorLevel + wallHeight),
      projector(room.x + room.width, room.y + room.height, floorLevel),
      projector(room.x + room.width, room.y, floorLevel),
    ];
    const center = projector(room.x + room.width / 2, room.y + room.height / 2, floorLevel);
    return { floor, backWall, sideWall, center, room };
  });
  const floors = roomData.map(({ floor }, index) => `
    <polygon class="iso-floor iso-floor-${index % 4}" points="${pointsAttribute(floor)}" />
  `).join('');
  const walls = roomData.map(({ backWall, sideWall }) => `
    <polygon class="iso-wall iso-wall-back" points="${pointsAttribute(backWall)}" />
    <polygon class="iso-wall iso-wall-side" points="${pointsAttribute(sideWall)}" />
  `).join('');
  const drawnWalls = state.walls.map((wall) => {
    const floorLevel = (wall.floor || 0) * state.wallHeight;
    const baseStart = projector(wall.x1, wall.y1, floorLevel);
    const baseEnd = projector(wall.x2, wall.y2, floorLevel);
    const topStart = projector(wall.x1, wall.y1, floorLevel + state.wallHeight);
    const topEnd = projector(wall.x2, wall.y2, floorLevel + state.wallHeight);
    return `
      <polygon class="iso-wall iso-wall-side" points="${pointsAttribute([baseStart, baseEnd, topEnd, topStart])}" />
      <line class="iso-wall-top" x1="${topStart.x}" y1="${topStart.y}" x2="${topEnd.x}" y2="${topEnd.y}" />
    `;
  }).join('');
  const facadeWindows = roomData.map(({ room }) => {
    const floorLevel = (room.floor || 0) * state.wallHeight;
    const windowWidth = Math.min(state.scale * 1.1, room.width * 0.38);
    const windowBottom = floorLevel + state.wallHeight * 0.32;
    const windowTop = floorLevel + state.wallHeight * 0.66;
    const faces = [];
    if (Math.abs(room.y - bounds.minY) < 0.01) {
      const centerX = room.x + room.width / 2;
      faces.push([
        projector(centerX - windowWidth / 2, bounds.minY, windowBottom),
        projector(centerX + windowWidth / 2, bounds.minY, windowBottom),
        projector(centerX + windowWidth / 2, bounds.minY, windowTop),
        projector(centerX - windowWidth / 2, bounds.minY, windowTop),
      ]);
    }
    if (Math.abs(room.x + room.width - bounds.maxX) < 0.01) {
      const centerY = room.y + room.height / 2;
      faces.push([
        projector(bounds.maxX, centerY - windowWidth / 2, windowBottom),
        projector(bounds.maxX, centerY + windowWidth / 2, windowBottom),
        projector(bounds.maxX, centerY + windowWidth / 2, windowTop),
        projector(bounds.maxX, centerY - windowWidth / 2, windowTop),
      ]);
    }
    return faces.map((face) => `<polygon class="iso-window" points="${pointsAttribute(face)}" />`).join('');
  }).join('');
  const labels = roomData.filter(({ room }) => (room.floor || 0) === state.activeFloor).map(({ center, room }) => `
    <text class="iso-label" x="${center.x}" y="${center.y}">${escapeHtml(room.name)}</text>
  `).join('');
  return `
    <rect width="1100" height="750" fill="#fbfcfe" />
    ${floors}
    ${walls}
    ${drawnWalls}
    ${facadeWindows}
    ${labels}
    ${roofMarkup(projector, bounds)}
    <text class="view-title" x="550" y="52">3D isometric · ${effectiveRoofStyle()} roof · ${formatNumber(state.wallHeight * state.floorCount, 1)} m total · ${state.floorCount} ${state.floorCount === 1 ? 'storey' : 'storeys'}</text>
  `;
}

function render() {
  svg.dataset.view = state.viewMode;
  if (state.viewMode === '2d') {
    svg.innerHTML = render2D();
  } else if (state.viewMode === 'top') {
    svg.innerHTML = renderTopView();
  } else if (state.viewMode === 'front' || state.viewMode === 'side') {
    svg.innerHTML = renderElevation(state.viewMode, planBounds());
  } else {
    svg.innerHTML = renderIsometric(planBounds());
  }
  const floorCaption = state.viewMode === '2d' || state.viewMode === 'top'
    ? ` · Floor ${state.activeFloor + 1} of ${state.floorCount}`
    : '';
  document.getElementById('viewCaption').innerHTML =
    `${escapeHtml(viewName(state.viewMode))}${floorCaption} <span>·</span> 1 px = ${formatNumber(1 / state.scale, 2)} m`;
  renderPlanSummary();
}

function nearestRoomEdge(point) {
  let nearest = null;
  state.rooms.filter((room) => (room.floor || 0) === state.activeFloor).forEach((room) => {
    const candidates = [
      { edge: 'top', x: clamp(point.x, room.x, room.x + room.width), y: room.y, distance: Math.abs(point.y - room.y) },
      { edge: 'bottom', x: clamp(point.x, room.x, room.x + room.width), y: room.y + room.height, distance: Math.abs(point.y - (room.y + room.height)) },
      { edge: 'left', x: room.x, y: clamp(point.y, room.y, room.y + room.height), distance: Math.abs(point.x - room.x) },
      { edge: 'right', x: room.x + room.width, y: clamp(point.y, room.y, room.y + room.height), distance: Math.abs(point.x - (room.x + room.width)) },
    ];
    candidates.forEach((candidate) => {
      const distance = Math.hypot(point.x - candidate.x, point.y - candidate.y);
      if (!nearest || distance < nearest.distance) nearest = { ...candidate, distance };
    });
  });
  return nearest;
}

function placeOpening(point, type) {
  if (!state.rooms.length) {
    notify('Add a room before placing a door or window.');
    return;
  }
  const edge = nearestRoomEdge(point);
  if (!edge || edge.distance > Math.max(60, state.snap * 3)) {
    notify('Click closer to a room edge to place the opening.');
    return;
  }
  pushHistory();
  state.openings.push({
    x: edge.x,
    y: edge.y,
    edge: edge.edge,
    type,
    width: state.scale * (type === 'door' ? 0.85 : 1.15),
    floor: state.activeFloor,
  });
  render();
  persistPlan();
}

function eraseElement(target) {
  const kind = target.dataset.kind;
  const index = Number(target.dataset.id);
  if (!Number.isInteger(index)) return;
  pushHistory();
  if (kind === 'wall') state.walls.splice(index, 1);
  if (kind === 'room') state.rooms.splice(index, 1);
  if (kind === 'label') state.labels.splice(index, 1);
  if (kind === 'opening') state.openings.splice(index, 1);
  render();
  persistPlan();
}

function exportSvg() {
  const clone = svg.cloneNode(true);
  clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
  clone.setAttribute('width', SVG_WIDTH);
  clone.setAttribute('height', SVG_HEIGHT);
  const style = document.createElementNS('http://www.w3.org/2000/svg', 'style');
  style.textContent = `
    .room{fill:#eef5f2;stroke:#8da99e;stroke-width:1.6}
    .room-label,.top-room-label,.iso-label{fill:#27394b;font-family:Arial,sans-serif;font-size:15px;font-weight:700;text-anchor:middle;dominant-baseline:middle}
    .room-area{fill:#7f8e9e;font-family:Arial,sans-serif;font-size:11px;text-anchor:middle}
    .wall{stroke:#31445b;stroke-width:5;stroke-linecap:round}
    .plan-label{fill:#26364b;font-family:Arial,sans-serif;font-size:14px;font-weight:600;text-anchor:middle}
    .dimensions{fill:#627087;font-family:Arial,sans-serif;font-size:11px;text-anchor:middle}
    .dimensions line{stroke:#9ba7b6;stroke-width:1}
    .opening rect{fill:#b78958;stroke:#fff;stroke-width:2}
    .opening.window rect{fill:#6bafc0}
    .opening text{fill:white;font:700 8px Arial;text-anchor:middle}
    .top-room{fill:#eef5f2;stroke:#8da99e;stroke-width:2}
    .top-wall{stroke:#31445b;stroke-width:5;stroke-linecap:round}
    .view-title{fill:#526176;font:700 17px Arial;text-anchor:middle}
    .iso-floor{stroke:#fff;stroke-width:2}
    .iso-floor-0{fill:#daeae5}.iso-floor-1{fill:#edf1e8}.iso-floor-2{fill:#e2ebf0}.iso-floor-3{fill:#f1e9df}
    .iso-wall-back{fill:#d7e3df;stroke:#879e96;stroke-width:1}
    .iso-wall-side{fill:#aebfb8;stroke:#788e85;stroke-width:1}
    .iso-wall-top{stroke:#657f75;stroke-width:2}
    .elevation-wall{fill:#edf3f0;stroke:#81978e;stroke-width:2}
    .elevation-opening{fill:#a9cbd0;stroke:#698b91;stroke-width:1.5}
    .facade-window,.iso-window{fill:#94c2c8;stroke:#638e94;stroke-width:1.5}
    .iso-window{stroke:#f7fbfa;stroke-width:1}
    .elevation-opening.door{fill:#bd9a74}
    .ground-line{stroke:#bcc6d0;stroke-width:1}
    .floor-level{stroke:#9aa99f;stroke-dasharray:6 4;stroke-width:1.5}
    .roof-face{fill:#53766b;fill-opacity:.9;stroke:#395c51;stroke-width:2;stroke-linejoin:round}
    .roof-left{fill:#63877b}.roof-right{fill:#46695e}.roof-front{fill:#729187}.roof-back{fill:#54766b}
    .roof-gable{fill:#e4e9e5;stroke:#395c51;stroke-width:2}.roof-flat{fill:#628378}
    .roof-ridge{fill:none;stroke:#304e45;stroke-width:3;stroke-linejoin:round}
  `;
  clone.insertBefore(style, clone.firstChild);
  const source = new XMLSerializer().serializeToString(clone);
  downloadBlob(source, 'image/svg+xml;charset=utf-8', `${safeFileName(projectNameInput.value)}.svg`);
  notify('SVG exported.');
}

function safeFileName(name) {
  return String(name || 'house-plan').trim().replace(/[<>:"/\\|?*\x00-\x1f]/g, '-').replace(/\s+/g, '-').slice(0, 60) || 'house-plan';
}

function downloadBlob(content, type, filename) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function savePlanFile() {
  const payload = {
    format: 'planform-house-plan',
    version: 1,
    ...currentPlan(),
  };
  downloadBlob(JSON.stringify(payload, null, 2), 'application/json;charset=utf-8', `${safeFileName(projectNameInput.value)}.json`);
  notify('Plan backup downloaded.');
}

function validateImportedPlan(data) {
  const validNumber = (value, min = -100000, max = 100000) => Number.isFinite(value) && value >= min && value <= max;
  if (!data || data.format !== 'planform-house-plan' || data.version !== 1) {
    throw new Error('This file is not a supported Planform project.');
  }
  if (!Array.isArray(data.rooms) || !Array.isArray(data.walls) || !Array.isArray(data.labels) || !Array.isArray(data.openings)) {
    throw new Error('The project file is missing required plan data.');
  }
  if (data.rooms.length > 1000 || data.walls.length > 2000 || data.labels.length > 500 || data.openings.length > 500) {
    throw new Error('The project contains too many drawing elements.');
  }
  const rooms = data.rooms.map((room) => {
    if (!room || ![room.x, room.y, room.width, room.height].every((value) => validNumber(value)) ||
        room.width <= 0 || room.height <= 0 || typeof room.name !== 'string' ||
        (room.floor !== undefined && !validNumber(room.floor, 0, 29))) {
      throw new Error('A room in this project has invalid dimensions.');
    }
    return { x: room.x, y: room.y, width: room.width, height: room.height, name: room.name.slice(0, 80), floor: room.floor || 0 };
  });
  const walls = data.walls.map((wall) => {
    if (!wall || ![wall.x1, wall.y1, wall.x2, wall.y2].every((value) => validNumber(value)) ||
        (wall.floor !== undefined && !validNumber(wall.floor, 0, 29))) {
      throw new Error('A wall in this project has invalid coordinates.');
    }
    return { x1: wall.x1, y1: wall.y1, x2: wall.x2, y2: wall.y2, floor: wall.floor || 0 };
  });
  const labels = data.labels.map((label) => {
    if (!label || !validNumber(label.x) || !validNumber(label.y) || typeof label.text !== 'string' ||
        (label.floor !== undefined && !validNumber(label.floor, 0, 29))) {
      throw new Error('A label in this project has invalid data.');
    }
    return { x: label.x, y: label.y, text: label.text.slice(0, 120), floor: label.floor || 0 };
  });
  const openings = data.openings.map((opening) => {
    if (!opening || !validNumber(opening.x) || !validNumber(opening.y) ||
        !validNumber(opening.width, 1, 1000) ||
        !['top', 'bottom', 'left', 'right'].includes(opening.edge) ||
        (opening.floor !== undefined && !validNumber(opening.floor, 0, 29)) ||
        !['door', 'window'].includes(opening.type)) {
      throw new Error('An opening in this project has invalid data.');
    }
    return { x: opening.x, y: opening.y, width: opening.width, edge: opening.edge, type: opening.type, floor: opening.floor || 0 };
  });
  const buildingType = data.buildingType === 'highrise' ? 'highrise' : 'house';
  const roofStyle = ['flat', 'gable', 'hip'].includes(data.roofStyle) ? data.roofStyle : 'auto';
  const floorCount = clamp(Math.round(Number(data.floorCount) || 1), buildingType === 'highrise' ? 2 : 1, 30);
  if ([...rooms, ...walls, ...labels, ...openings].some((item) => item.floor >= floorCount)) {
    throw new Error('The project contains items assigned to a floor that does not exist.');
  }
  return {
    projectName: typeof data.projectName === 'string' ? data.projectName.slice(0, 60) : 'Untitled plan',
    groundArea: clamp(Number(data.groundArea) || 180, 40, 5000),
    bedrooms: clamp(Math.round(Number(data.bedrooms) || 3), 1, 6),
    bathrooms: clamp(Math.round(Number(data.bathrooms) || 2), 1, 5),
    designStyle: data.designStyle === 'rural' ? 'rural' : 'urban',
    buildingType,
    roofStyle,
    floorCount,
    snap: clamp(Math.round(Number(data.snap) || 15), 5, 50),
    scale: clamp(Number(data.scale) || 30, 2, 100),
    wallHeight: clamp(Number(data.wallHeight) || 2.8, 2, 6),
    rooms,
    walls,
    labels,
    openings,
  };
}

function importPlanFile(file) {
  const reader = new FileReader();
  reader.addEventListener('load', () => {
    try {
      const plan = validateImportedPlan(JSON.parse(String(reader.result)));
      pushHistory();
      applyPlan(plan);
      persistPlan();
      notify('Plan opened successfully.');
    } catch (error) {
      notify(error instanceof Error ? error.message : 'Unable to open this plan file.');
    } finally {
      importFile.value = '';
    }
  });
  reader.addEventListener('error', () => {
    notify('The selected plan file could not be read.');
    importFile.value = '';
  });
  reader.readAsText(file);
}

function persistPlan() {
  const status = document.getElementById('saveStatus');
  const indicator = status.parentElement;
  indicator.classList.add('saving');
  status.textContent = 'Saving…';
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({
      format: 'planform-house-plan',
      version: 1,
      ...currentPlan(),
    }));
    status.textContent = 'Saved on this device';
    indicator.classList.remove('saving');
  } catch (error) {
    status.textContent = 'Unable to save';
    indicator.classList.remove('saving');
    notify('Could not save this plan in browser storage. Download a JSON backup instead.');
    console.error('Unable to persist the plan in local storage.', error);
  }
}

function restorePlan() {
  let stored;
  try {
    stored = localStorage.getItem(STORAGE_KEY);
  } catch (error) {
    notify('Browser storage is unavailable; this plan will not be saved automatically.');
    console.error('Unable to read plan data from local storage.', error);
    return false;
  }
  if (!stored) return false;
  try {
    const plan = validateImportedPlan(JSON.parse(stored));
    applyPlan(plan);
    return true;
  } catch (error) {
    console.error('The saved plan could not be restored.', error);
    notify('The saved plan could not be restored. A fresh plan is ready.');
    return false;
  }
}

function clearPlan() {
  if (state.rooms.length || state.walls.length || state.labels.length || state.openings.length) {
    if (!window.confirm('Clear every room, wall, label, and opening in this plan? You can undo this action.')) return;
    pushHistory();
  }
  state.rooms = [];
  state.walls = [];
  state.labels = [];
  state.openings = [];
  state.activeFloor = 0;
  renderFloorTabs();
  state.draft = null;
  state.scale = 30;
  state.viewMode = '2d';
  document.querySelectorAll('.view-btn').forEach((button) => {
    button.classList.toggle('active', button.dataset.view === '2d');
  });
  fitPlanToView(false);
  render();
  persistPlan();
  notify('Plan cleared.');
}

svg.addEventListener('pointerdown', (event) => {
  if (state.viewMode !== '2d') return;
  const point = getSvgPoint(event);
  const snapped = { x: snap(point.x), y: snap(point.y) };

  if (state.tool === 'wall' || state.tool === 'room') {
    state.draft = state.tool === 'wall'
      ? { kind: 'wall', x1: snapped.x, y1: snapped.y, x2: snapped.x, y2: snapped.y }
      : { kind: 'room', x: snapped.x, y: snapped.y, w: 0, h: 0 };
    try {
      svg.setPointerCapture(event.pointerId);
    } catch (error) {
      console.warn('Pointer capture was unavailable; drawing will end when the pointer leaves the canvas.', error);
    }
    render();
    return;
  }

  if (state.tool === 'label') {
    const text = window.prompt('Enter a label:', `Area ${state.labels.length + 1}`);
    if (text && text.trim()) {
      pushHistory();
      addLabel(snapped.x, snapped.y, text.trim().slice(0, 120));
      render();
      persistPlan();
    }
    return;
  }

  if (state.tool === 'door' || state.tool === 'window') {
    placeOpening(point, state.tool);
    return;
  }

  if (state.tool === 'erase') {
    const target = event.target.closest('[data-kind]');
    if (target) eraseElement(target);
  }
});

svg.addEventListener('pointermove', (event) => {
  if (!state.draft || state.viewMode !== '2d') return;
  const point = getSvgPoint(event);
  const snapped = { x: snap(point.x), y: snap(point.y) };
  if (state.draft.kind === 'wall') {
    state.draft.x2 = snapped.x;
    state.draft.y2 = snapped.y;
  } else {
    state.draft.w = snapped.x - state.draft.x;
    state.draft.h = snapped.y - state.draft.y;
  }
  render();
});

function finishDrawing() {
  if (!state.draft) return;
  const draft = state.draft;
  state.draft = null;
  if (draft.kind === 'wall') {
    if (Math.hypot(draft.x2 - draft.x1, draft.y2 - draft.y1) > 8) {
      pushHistory();
      state.walls.push({ x1: draft.x1, y1: draft.y1, x2: draft.x2, y2: draft.y2, floor: state.activeFloor });
      persistPlan();
    }
  } else {
    const room = normalizeRoomRect(draft);
    if (room.width >= state.snap && room.height >= state.snap) {
      if (roomOverlaps(room)) {
        notify('Rooms cannot overlap. Draw the new room beside an existing room.');
      } else {
        pushHistory();
        addRoom(room);
        persistPlan();
      }
    }
  }
  render();
}

svg.addEventListener('pointerup', finishDrawing);
svg.addEventListener('pointercancel', finishDrawing);

svg.addEventListener('dblclick', (event) => {
  if (state.viewMode !== '2d') return;
  const target = event.target.closest('[data-kind="room"]');
  if (!target) return;
  const room = state.rooms[Number(target.dataset.id)];
  if (!room) return;
  const name = window.prompt('Rename room:', room.name);
  if (name && name.trim()) {
    pushHistory();
    room.name = name.trim().slice(0, 80);
    render();
    persistPlan();
  }
});

snapSlider.addEventListener('input', (event) => {
  state.snap = Number(event.target.value);
  snapValue.textContent = `${state.snap} px`;
  render();
});

snapSlider.addEventListener('change', persistPlan);

[designStyleInput, buildingTypeInput].forEach((input) => {
  input.addEventListener('change', () => {
    state.designStyle = designStyleInput.value === 'rural' ? 'rural' : 'urban';
    state.buildingType = buildingTypeInput.value === 'highrise' ? 'highrise' : 'house';
    if (state.buildingType === 'highrise' && Number(floorCountInput.value) < 2) {
      floorCountInput.value = '8';
      floorCountInput.dispatchEvent(new Event('change', { bubbles: true }));
    }
    updatePresetDescription();
    render();
    persistPlan();
  });
});

roofStyleInput.addEventListener('change', () => {
  const roofStyle = ['flat', 'gable', 'hip'].includes(roofStyleInput.value) ? roofStyleInput.value : 'auto';
  if (state.roofStyle === roofStyle) return;
  pushHistory();
  state.roofStyle = roofStyle;
  updatePresetDescription();
  render();
  persistPlan();
});

floorCountInput.addEventListener('change', () => {
  const minimum = buildingTypeInput.value === 'highrise' ? 2 : 1;
  const count = clamp(Math.round(Number(floorCountInput.value) || minimum), minimum, 30);
  if (count === state.floorCount) {
    floorCountInput.value = String(count);
    return;
  }
  pushHistory();
  const previousCount = state.floorCount;
  if (count < previousCount) {
    state.rooms = state.rooms.filter((room) => (room.floor || 0) < count);
    state.walls = state.walls.filter((wall) => (wall.floor || 0) < count);
    state.labels = state.labels.filter((label) => (label.floor || 0) < count);
    state.openings = state.openings.filter((opening) => (opening.floor || 0) < count);
  } else {
    for (let floor = previousCount; floor < count; floor += 1) {
      state.rooms.push(...state.rooms.filter((room) => (room.floor || 0) === 0)
        .map((room) => ({ ...room, floor })));
      state.walls.push(...state.walls.filter((wall) => (wall.floor || 0) === 0)
        .map((wall) => ({ ...wall, floor })));
      state.labels.push(...state.labels.filter((label) => (label.floor || 0) === 0)
        .map((label) => ({ ...label, floor })));
      state.openings.push(...state.openings.filter((opening) => (opening.floor || 0) === 0)
        .map((opening) => ({ ...opening, floor })));
    }
  }
  floorCountInput.value = String(count);
  state.floorCount = count;
  state.activeFloor = clamp(state.activeFloor, 0, count - 1);
  renderFloorTabs();
  render();
  persistPlan();
});

document.getElementById('undoButton').addEventListener('click', undo);
document.getElementById('redoButton').addEventListener('click', redo);
document.getElementById('zoomIn').addEventListener('click', () => changeZoom(0.82));
document.getElementById('zoomOut').addEventListener('click', () => changeZoom(1.22));
document.getElementById('fitPlan').addEventListener('click', () => fitPlanToView());
clearCanvasButton.addEventListener('click', clearPlan);
exportButton.addEventListener('click', exportSvg);
saveButton.addEventListener('click', savePlanFile);
importButton.addEventListener('click', () => importFile.click());
importFile.addEventListener('change', () => {
  if (importFile.files?.[0]) importPlanFile(importFile.files[0]);
});
printButton.addEventListener('click', () => window.print());
generatePlanButton.addEventListener('click', generateSmartPlan);

document.querySelectorAll('.tool-button').forEach((button) => {
  button.addEventListener('click', () => setTool(button.dataset.tool));
});

document.querySelectorAll('.view-btn').forEach((button) => {
  button.addEventListener('click', () => setViewMode(button.dataset.view));
});

[groundAreaInput, bedroomCountInput, bathroomCountInput].forEach((input) => {
  input.addEventListener('change', renderPlanSummary);
});

wallHeightInput.addEventListener('change', () => {
  const nextHeight = clamp(Number(wallHeightInput.value) || state.wallHeight, 2, 6);
  wallHeightInput.value = String(nextHeight);
  if (nextHeight === state.wallHeight) return;
  pushHistory();
  state.wallHeight = nextHeight;
  render();
  persistPlan();
});

projectNameInput.addEventListener('input', () => {
  updateWorkspaceTitle();
  persistPlan();
});

window.addEventListener('keydown', (event) => {
  const target = event.target;
  const isTyping = target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement;
  if (event.key === 'Escape') {
    state.draft = null;
    render();
  } else if (!isTyping && (event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'z') {
    event.preventDefault();
    if (event.shiftKey) redo();
    else undo();
  } else if (!isTyping && (event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'y') {
    event.preventDefault();
    redo();
  }
});

updateWorkspaceTitle();
updatePresetDescription();
render();
if (!restorePlan()) generateSmartPlan();
updateHistoryButtons();
