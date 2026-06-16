const DEFAULT_ROWS = 4;
const DEFAULT_COLUMNS = 3;
const MAX_LAYOUT_ROWS = 10;
const MAX_LAYOUT_COLUMNS = 6;
const EXPORT_WIDTH = 1800;
const BUBBLE_FONT = '900 34px "Comic Sans MS", "Comic Neue", "Bradley Hand", cursive';
const BUBBLE_OUTSIDE_RATIO = 0.4;
const TAIL_POSITIONS = ["left", "left-top", "right-top", "right", "right-bottom", "left-bottom"];
const DEFAULT_TAIL_POSITION = "right-bottom";
const STORAGE_KEY = "pegacomic:comic:v1";
const LEGACY_STORAGE_KEY = "pegacomic:bubbles:v1";

function createEmptyPanel() {
  return {
    image: null,
    bubbles: [],
  };
}

function createPanels(rows, columns) {
  return Array.from({ length: rows * columns }, createEmptyPanel);
}

const state = {
  rows: DEFAULT_ROWS,
  columns: DEFAULT_COLUMNS,
  selectedPanelId: 0,
  selectedBubbleId: null,
  panels: createPanels(DEFAULT_ROWS, DEFAULT_COLUMNS),
};

const newComicSelection = {
  rows: DEFAULT_ROWS,
  columns: DEFAULT_COLUMNS,
};

const comicPage = document.querySelector("#comicPage");
const newButton = document.querySelector("#newButton");
const uploadButton = document.querySelector("#uploadButton");
const bubbleButton = document.querySelector("#bubbleButton");
const exportButton = document.querySelector("#exportButton");
const deleteBubbleButton = document.querySelector("#deleteBubbleButton");
const imageInput = document.querySelector("#imageInput");
const selectionHint = document.querySelector("#selectionHint");
const newComicDialog = document.querySelector("#newComicDialog");
const layoutPicker = document.querySelector("#layoutPicker");
const cancelNewComicButton = document.querySelector("#cancelNewComicButton");

loadStoredComic();
renderLayoutPicker();

function render() {
  comicPage.innerHTML = "";
  comicPage.style.setProperty("--comic-columns", state.columns);
  comicPage.style.setProperty("--comic-rows", state.rows);
  comicPage.style.aspectRatio = `${state.columns} / ${state.rows}`;

  state.panels.forEach((panel, panelIndex) => {
    const panelElement = document.createElement("div");
    panelElement.className = "comic-panel";
    panelElement.dataset.panelId = String(panelIndex);
    panelElement.setAttribute("role", "button");
    panelElement.tabIndex = 0;
    panelElement.setAttribute("aria-label", `Panel ${panelIndex + 1}`);

    if (panelIndex === state.selectedPanelId) {
      panelElement.classList.add("is-selected");
    }

    if (panel.bubbles.length > 0) {
      panelElement.classList.add("has-bubbles");
    }

    if (panel.image) {
      const imageFrame = document.createElement("div");
      imageFrame.className = "panel-image-frame";

      const image = document.createElement("img");
      image.src = panel.image;
      image.alt = "";
      imageFrame.append(image);
      panelElement.append(imageFrame);
    } else {
      const emptyPanel = document.createElement("span");
      emptyPanel.className = "empty-panel";
      emptyPanel.textContent = `Panel ${panelIndex + 1}`;
      panelElement.append(emptyPanel);
    }

    panel.bubbles.forEach((bubble) => {
      panelElement.append(createBubbleElement(panelIndex, bubble));
    });

    panelElement.addEventListener("click", () => {
      selectPanel(panelIndex);

      if (!panel.image) {
        openImagePicker();
      }
    });
    panelElement.addEventListener("dblclick", () => {
      selectPanel(panelIndex);
      openImagePicker();
    });
    panelElement.addEventListener("keydown", (event) => {
      if (event.target.closest(".bubble-text")) {
        return;
      }

      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        selectPanel(panelIndex);

        if (!panel.image) {
          openImagePicker();
        }
      }
    });

    comicPage.append(panelElement);
  });

  updateControls();
}

function createBubbleElement(panelIndex, bubble) {
  bubble.tailPosition ||= DEFAULT_TAIL_POSITION;

  const bubbleElement = document.createElement("div");
  bubbleElement.className = "bubble";
  bubbleElement.dataset.bubbleId = bubble.id;
  bubbleElement.style.left = `${bubble.x}%`;
  bubbleElement.style.top = `${bubble.y}%`;
  bubbleElement.style.width = `${bubble.width}%`;
  bubbleElement.setAttribute("role", "textbox");
  bubbleElement.setAttribute("aria-label", "Text bubble");
  bubbleElement.tabIndex = 0;

  if (bubble.id === state.selectedBubbleId) {
    bubbleElement.classList.add("is-selected");
  }

  const textElement = document.createElement("span");
  textElement.className = "bubble-text";
  textElement.contentEditable = "true";
  textElement.spellcheck = true;
  textElement.textContent = bubble.text;

  const tailElement = document.createElement("span");
  tailElement.className = `bubble-tail tail-${bubble.tailPosition}`;
  tailElement.role = "button";
  tailElement.tabIndex = 0;
  tailElement.title = "Move bubble peak";
  tailElement.setAttribute("aria-label", "Move bubble peak");

  tailElement.addEventListener("pointerdown", (event) => {
    event.stopPropagation();
  });
  tailElement.addEventListener("click", (event) => {
    event.stopPropagation();
    selectPanel(panelIndex, { keepBubbleSelection: true });
    selectBubble(bubble.id);
    cycleBubbleTail(bubble.id);
  });
  tailElement.addEventListener("keydown", (event) => {
    if (event.key !== "Enter" && event.key !== " ") {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    selectPanel(panelIndex, { keepBubbleSelection: true });
    selectBubble(bubble.id);
    cycleBubbleTail(bubble.id);
  });

  bubbleElement.append(tailElement);
  bubbleElement.append(textElement);

  bubbleElement.addEventListener("click", (event) => {
    event.stopPropagation();
    selectPanel(panelIndex, { keepBubbleSelection: true });
    selectBubble(bubble.id);
  });

  bubbleElement.addEventListener("dblclick", (event) => {
    event.stopPropagation();
    textElement.focus();
    selectText(textElement);
  });

  bubbleElement.addEventListener("pointerdown", (event) => {
    if (event.button !== 0) {
      return;
    }

    event.stopPropagation();
    selectPanel(panelIndex, { keepBubbleSelection: true });
    selectBubble(bubble.id);
    startBubbleDrag(event, bubbleElement, panelIndex, bubble.id);
  });

  textElement.addEventListener("input", () => {
    updateBubbleText(bubble.id, textElement.textContent || "");
  });

  return bubbleElement;
}

function selectPanel(panelIndex, options = {}) {
  state.selectedPanelId = panelIndex;

  const selectedBubbleIsInPanel = state.panels[panelIndex].bubbles.some((bubble) => {
    return bubble.id === state.selectedBubbleId;
  });

  if (!options.keepBubbleSelection || !selectedBubbleIsInPanel) {
    state.selectedBubbleId = null;
  }

  updateControls();
  updatePanelSelection();
  updateBubbleSelection();
}

function selectBubble(bubbleId) {
  state.selectedBubbleId = bubbleId;
  updateControls();
  updateBubbleSelection();
}

function updatePanelSelection() {
  document.querySelectorAll(".comic-panel").forEach((element) => {
    element.classList.toggle("is-selected", Number(element.dataset.panelId) === state.selectedPanelId);
  });
}

function updateBubbleSelection() {
  document.querySelectorAll(".bubble").forEach((element) => {
    element.classList.toggle("is-selected", element.dataset.bubbleId === state.selectedBubbleId);
  });
}

function updateControls() {
  const bubble = getSelectedBubble();

  selectionHint.textContent = `Editing panel ${state.selectedPanelId + 1}`;
  bubbleButton.hidden = Boolean(bubble);
  deleteBubbleButton.hidden = !bubble;
}

function getSelectedBubble() {
  if (!state.selectedBubbleId) {
    return null;
  }

  return state.panels
    .flatMap((panel) => panel.bubbles)
    .find((bubble) => bubble.id === state.selectedBubbleId) || null;
}

function updateBubbleText(bubbleId, text) {
  const bubble = getBubbleById(bubbleId);
  if (!bubble) {
    return;
  }

  bubble.text = text;
  saveComic();
}

function cycleBubbleTail(bubbleId) {
  const bubble = getBubbleById(bubbleId);
  if (!bubble) {
    return;
  }

  const currentIndex = TAIL_POSITIONS.indexOf(bubble.tailPosition || DEFAULT_TAIL_POSITION);
  const nextIndex = (currentIndex + 1) % TAIL_POSITIONS.length;
  bubble.tailPosition = TAIL_POSITIONS[nextIndex];
  saveComic();
  render();
}

function getBubbleById(bubbleId) {
  for (const panel of state.panels) {
    const bubble = panel.bubbles.find((candidate) => candidate.id === bubbleId);
    if (bubble) {
      return bubble;
    }
  }

  return null;
}

function openImagePicker() {
  imageInput.value = "";
  imageInput.click();
}

function placeImage(file) {
  if (!file || !file.type.startsWith("image/")) {
    return;
  }

  const reader = new FileReader();
  reader.addEventListener("load", () => {
    state.panels[state.selectedPanelId].image = String(reader.result);
    render();
  });
  reader.readAsDataURL(file);
}

function addBubble() {
  const panel = state.panels[state.selectedPanelId];
  const bubble = {
    id: createId(),
    text: "SAY SOMETHING!",
    x: 22,
    y: 18,
    width: 54,
    tailPosition: DEFAULT_TAIL_POSITION,
  };

  panel.bubbles.push(bubble);
  state.selectedBubbleId = bubble.id;
  saveComic();
  render();
}

function deleteSelectedBubble() {
  if (!state.selectedBubbleId) {
    return;
  }

  state.panels.forEach((panel) => {
    panel.bubbles = panel.bubbles.filter((bubble) => bubble.id !== state.selectedBubbleId);
  });

  state.selectedBubbleId = null;
  saveComic();
  render();
}

function createNewComic(rows, columns) {
  state.rows = rows;
  state.columns = columns;
  state.selectedPanelId = 0;
  state.selectedBubbleId = null;
  state.panels = createPanels(rows, columns);
  saveComic();
  render();
}

function openNewComicDialog() {
  newComicSelection.rows = state.rows;
  newComicSelection.columns = state.columns;
  renderLayoutPicker();
  newComicDialog.showModal();
}

function closeNewComicDialog() {
  newComicDialog.close();
}

function renderLayoutPicker() {
  layoutPicker.innerHTML = "";
  layoutPicker.style.setProperty("--picker-columns", MAX_LAYOUT_COLUMNS);

  for (let row = 1; row <= MAX_LAYOUT_ROWS; row += 1) {
    for (let column = 1; column <= MAX_LAYOUT_COLUMNS; column += 1) {
      const cell = document.createElement("button");
      cell.className = "layout-cell";
      cell.type = "button";
      cell.dataset.row = String(row);
      cell.dataset.column = String(column);
      cell.setAttribute("aria-label", `${column} columns by ${row} rows`);

      const updateSelection = () => {
        newComicSelection.rows = row;
        newComicSelection.columns = column;
        updateLayoutPickerSelection();
      };

      cell.addEventListener("pointerenter", updateSelection);
      cell.addEventListener("focus", updateSelection);
      cell.addEventListener("click", () => {
        updateSelection();
        createNewComic(row, column);
        closeNewComicDialog();
      });
      layoutPicker.append(cell);
    }
  }

  updateLayoutPickerSelection();
}

function updateLayoutPickerSelection() {
  layoutPicker.querySelectorAll(".layout-cell").forEach((cell) => {
    cell.textContent = "";

    const row = Number(cell.dataset.row);
    const column = Number(cell.dataset.column);
    const isCorner = row === newComicSelection.rows && column === newComicSelection.columns;

    cell.classList.toggle(
      "is-picked",
      row <= newComicSelection.rows && column <= newComicSelection.columns,
    );
    cell.classList.toggle("is-corner", isCorner);

    if (isCorner) {
      cell.textContent = `${newComicSelection.columns}x${newComicSelection.rows}`;
    }
  });
}

function startBubbleDrag(event, bubbleElement, panelIndex, bubbleId) {
  const panelElement = bubbleElement.closest(".comic-panel");
  const bubble = getBubbleById(bubbleId);

  if (!panelElement || !bubble) {
    return;
  }

  const panelRect = panelElement.getBoundingClientRect();
  const bubbleRect = bubbleElement.getBoundingClientRect();
  const grabOffsetX = event.clientX - bubbleRect.left;
  const grabOffsetY = event.clientY - bubbleRect.top;

  bubbleElement.classList.add("is-dragging");
  bubbleElement.setPointerCapture(event.pointerId);

  const moveBubble = (moveEvent) => {
    const widthPercent = (bubbleRect.width / panelRect.width) * 100;
    const heightPercent = (bubbleRect.height / panelRect.height) * 100;
    const nextX = ((moveEvent.clientX - panelRect.left - grabOffsetX) / panelRect.width) * 100;
    const nextY = ((moveEvent.clientY - panelRect.top - grabOffsetY) / panelRect.height) * 100;

    bubble.x = clamp(
      nextX,
      -widthPercent * BUBBLE_OUTSIDE_RATIO,
      100 - widthPercent * (1 - BUBBLE_OUTSIDE_RATIO),
    );
    bubble.y = clamp(
      nextY,
      -heightPercent * BUBBLE_OUTSIDE_RATIO,
      100 - heightPercent * (1 - BUBBLE_OUTSIDE_RATIO),
    );
    bubbleElement.style.left = `${bubble.x}%`;
    bubbleElement.style.top = `${bubble.y}%`;
  };

  const stopDragging = () => {
    bubbleElement.classList.remove("is-dragging");
    bubbleElement.removeEventListener("pointermove", moveBubble);
    bubbleElement.removeEventListener("pointerup", stopDragging);
    bubbleElement.removeEventListener("pointercancel", stopDragging);
    saveComic();
  };

  bubbleElement.addEventListener("pointermove", moveBubble);
  bubbleElement.addEventListener("pointerup", stopDragging);
  bubbleElement.addEventListener("pointercancel", stopDragging);
}

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function createId() {
  if (globalThis.crypto?.randomUUID) {
    return globalThis.crypto.randomUUID();
  }

  return `bubble-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function saveComic() {
  const savedPanels = state.panels.map((panel) => ({
    bubbles: panel.bubbles.map((bubble) => ({
      id: bubble.id,
      text: bubble.text,
      x: bubble.x,
      y: bubble.y,
      width: bubble.width,
      tailPosition: bubble.tailPosition || DEFAULT_TAIL_POSITION,
    })),
  }));

  localStorage.setItem(
    STORAGE_KEY,
    JSON.stringify({
      layout: {
        rows: state.rows,
        columns: state.columns,
      },
      panels: savedPanels,
    }),
  );
  localStorage.removeItem(LEGACY_STORAGE_KEY);
}

function loadStoredComic() {
  const rawValue = localStorage.getItem(STORAGE_KEY) || localStorage.getItem(LEGACY_STORAGE_KEY);
  if (!rawValue) {
    return;
  }

  let savedState;
  try {
    savedState = JSON.parse(rawValue);
  } catch (error) {
    console.warn("Stored comic data could not be read.", error);
    localStorage.removeItem(STORAGE_KEY);
    localStorage.removeItem(LEGACY_STORAGE_KEY);
    return;
  }

  if (!savedState || typeof savedState !== "object" || !Array.isArray(savedState.panels)) {
    console.warn("Stored comic data is invalid.");
    localStorage.removeItem(STORAGE_KEY);
    localStorage.removeItem(LEGACY_STORAGE_KEY);
    return;
  }

  const savedLayout = savedState.layout && typeof savedState.layout === "object"
    ? savedState.layout
    : savedState;
  const rows = Number.isInteger(savedLayout.rows) ? savedLayout.rows : DEFAULT_ROWS;
  const columns = Number.isInteger(savedLayout.columns) ? savedLayout.columns : DEFAULT_COLUMNS;

  state.rows = clamp(rows, 1, MAX_LAYOUT_ROWS);
  state.columns = clamp(columns, 1, MAX_LAYOUT_COLUMNS);
  state.panels = createPanels(state.rows, state.columns);

  savedState.panels.slice(0, state.panels.length).forEach((savedPanel, panelIndex) => {
    if (!Array.isArray(savedPanel?.bubbles)) {
      return;
    }

    state.panels[panelIndex].bubbles = savedPanel.bubbles.map(normalizeStoredBubble);
  });

  if (!localStorage.getItem(STORAGE_KEY)) {
    saveComic();
  }
}

function normalizeStoredBubble(bubble) {
  const storedBubble = bubble && typeof bubble === "object" ? bubble : {};
  const tailPosition = TAIL_POSITIONS.includes(storedBubble.tailPosition)
    ? storedBubble.tailPosition
    : DEFAULT_TAIL_POSITION;

  return {
    id: typeof storedBubble.id === "string" ? storedBubble.id : createId(),
    text: typeof storedBubble.text === "string" ? storedBubble.text : "",
    x: Number.isFinite(storedBubble.x) ? storedBubble.x : 22,
    y: Number.isFinite(storedBubble.y) ? storedBubble.y : 18,
    width: Number.isFinite(storedBubble.width) ? storedBubble.width : 54,
    tailPosition,
  };
}

function selectText(element) {
  const range = document.createRange();
  range.selectNodeContents(element);

  const selection = window.getSelection();
  selection.removeAllRanges();
  selection.addRange(range);
}

async function exportComic() {
  const canvas = document.createElement("canvas");
  canvas.width = EXPORT_WIDTH;
  canvas.height = Math.round(EXPORT_WIDTH * (state.rows / state.columns));

  const context = canvas.getContext("2d");
  if (!context) {
    throw new Error("Canvas export is not supported in this browser.");
  }

  const pagePadding = 40;
  const pageGap = 24;
  const panelWidth = (canvas.width - pagePadding * 2 - pageGap * (state.columns - 1)) / state.columns;
  const panelHeight = (canvas.height - pagePadding * 2 - pageGap * (state.rows - 1)) / state.rows;

  context.fillStyle = "#ffffff";
  context.fillRect(0, 0, canvas.width, canvas.height);

  const exportPanels = state.panels.map((panel, index) => {
    const column = index % state.columns;
    const row = Math.floor(index / state.columns);

    return {
      panel,
      index,
      x: pagePadding + column * (panelWidth + pageGap),
      y: pagePadding + row * (panelHeight + pageGap),
    };
  });

  for (const { index, panel, x, y } of exportPanels) {

    drawPanelFrame(context, x, y, panelWidth, panelHeight);

    if (panel.image) {
      const image = await loadImage(panel.image);
      drawCoverImage(context, image, x, y, panelWidth, panelHeight);
    } else {
      drawEmptyPanel(context, index, x, y, panelWidth, panelHeight);
    }

    drawPanelBorder(context, x, y, panelWidth, panelHeight);
  }

  exportPanels.forEach(({ panel, x, y }) => {
    panel.bubbles.forEach((bubble) => {
      drawBubble(context, bubble, x, y, panelWidth, panelHeight);
    });
  });

  await downloadCanvas(canvas);
}

function downloadCanvas(canvas) {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (!blob) {
        reject(new Error("The comic page could not be converted to a PNG."));
        return;
      }

      const link = document.createElement("a");
      const objectUrl = URL.createObjectURL(blob);

      link.download = `comic-page-${new Date().toISOString().slice(0, 10)}.png`;
      link.href = objectUrl;
      link.style.display = "none";
      document.body.append(link);
      link.click();
      link.remove();

      setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
      resolve();
    }, "image/png");
  });
}

function drawPanelFrame(context, x, y, width, height) {
  context.fillStyle = "#fff5cb";
  context.fillRect(x, y, width, height);
}

function drawEmptyPanel(context, index, x, y, width, height) {
  context.save();
  context.fillStyle = "#fff5cb";
  context.fillRect(x, y, width, height);
  context.fillStyle = "rgba(29, 27, 32, 0.5)";
  context.font = "900 42px system-ui, sans-serif";
  context.textAlign = "center";
  context.textBaseline = "middle";
  context.fillText(`Panel ${index + 1}`, x + width / 2, y + height / 2);
  context.restore();
}

function drawPanelBorder(context, x, y, width, height) {
  context.save();
  context.strokeStyle = "#181818";
  context.lineWidth = 10;
  context.strokeRect(x, y, width, height);
  context.restore();
}

function drawCoverImage(context, image, x, y, width, height) {
  const imageRatio = image.width / image.height;
  const frameRatio = width / height;
  let sourceWidth = image.width;
  let sourceHeight = image.height;
  let sourceX = 0;
  let sourceY = 0;

  if (imageRatio > frameRatio) {
    sourceWidth = image.height * frameRatio;
    sourceX = (image.width - sourceWidth) / 2;
  } else {
    sourceHeight = image.width / frameRatio;
    sourceY = (image.height - sourceHeight) / 2;
  }

  context.drawImage(image, sourceX, sourceY, sourceWidth, sourceHeight, x, y, width, height);
}

function drawBubble(context, bubble, panelX, panelY, panelWidth, panelHeight) {
  const x = panelX + (bubble.x / 100) * panelWidth;
  const y = panelY + (bubble.y / 100) * panelHeight;
  const width = (bubble.width / 100) * panelWidth;
  const lines = wrapText(context, (bubble.text || " ").toLocaleUpperCase(), width - 42);
  const lineHeight = 38;
  const height = Math.max(72, lines.length * lineHeight + 34);

  context.save();
  context.fillStyle = "#ffffff";
  context.strokeStyle = "#181818";
  context.lineWidth = 8;

  drawBubbleTail(context, bubble.tailPosition || DEFAULT_TAIL_POSITION, x, y, width, height);

  roundedRect(context, x, y, width, height, height / 2);
  context.fill();
  context.stroke();

  context.fillStyle = "#1d1b20";
  context.font = BUBBLE_FONT;
  context.textAlign = "center";
  context.textBaseline = "middle";

  const textY = y + height / 2 - ((lines.length - 1) * lineHeight) / 2;
  lines.forEach((line, index) => {
    context.fillText(line, x + width / 2, textY + index * lineHeight);
  });

  context.restore();
}

function drawBubbleTail(context, position, x, y, width, height) {
  const pointLength = 42;
  const points = getBubbleTailPoints(position, x, y, width, height, pointLength);

  context.beginPath();
  context.moveTo(points[0].x, points[0].y);
  context.lineTo(points[1].x, points[1].y);
  context.lineTo(points[2].x, points[2].y);
  context.closePath();
  context.fill();
  context.stroke();
}

function getBubbleTailPoints(position, x, y, width, height, pointLength) {
  const horizontalBase = width * 0.16;
  const verticalBase = height * 0.32;

  switch (position) {
    case "left":
      return [
        { x, y: y + height * 0.34 },
        { x: x - pointLength, y: y + height * 0.5 },
        { x, y: y + height * 0.66 },
      ];
    case "left-bottom":
      return [
        { x: x + width * 0.24, y: y + height },
        { x: x + width * 0.16, y: y + height + pointLength },
        { x: x + width * 0.24 + horizontalBase, y: y + height },
      ];
    case "right-bottom":
      return [
        { x: x + width * 0.6, y: y + height },
        { x: x + width * 0.84, y: y + height + pointLength },
        { x: x + width * 0.6 + horizontalBase, y: y + height },
      ];
    case "right":
      return [
        { x: x + width, y: y + height * 0.5 - verticalBase / 2 },
        { x: x + width + pointLength, y: y + height * 0.5 },
        { x: x + width, y: y + height * 0.5 + verticalBase / 2 },
      ];
    case "right-top":
      return [
        { x: x + width * 0.6, y },
        { x: x + width * 0.84, y: y - pointLength },
        { x: x + width * 0.6 + horizontalBase, y },
      ];
    case "left-top":
      return [
        { x: x + width * 0.24, y },
        { x: x + width * 0.16, y: y - pointLength },
        { x: x + width * 0.24 + horizontalBase, y },
      ];
    default:
      return getBubbleTailPoints(DEFAULT_TAIL_POSITION, x, y, width, height, pointLength);
  }
}

function roundedRect(context, x, y, width, height, radius) {
  const safeRadius = Math.min(radius, width / 2, height / 2);

  context.beginPath();
  context.moveTo(x + safeRadius, y);
  context.lineTo(x + width - safeRadius, y);
  context.quadraticCurveTo(x + width, y, x + width, y + safeRadius);
  context.lineTo(x + width, y + height - safeRadius);
  context.quadraticCurveTo(x + width, y + height, x + width - safeRadius, y + height);
  context.lineTo(x + safeRadius, y + height);
  context.quadraticCurveTo(x, y + height, x, y + height - safeRadius);
  context.lineTo(x, y + safeRadius);
  context.quadraticCurveTo(x, y, x + safeRadius, y);
  context.closePath();
}

function wrapText(context, text, maxWidth) {
  context.font = BUBBLE_FONT;

  const paragraphs = text.split("\n");
  const lines = [];

  paragraphs.forEach((paragraph) => {
    const words = paragraph.trim().split(/\s+/).filter(Boolean);

    if (words.length === 0) {
      lines.push("");
      return;
    }

    let line = words.shift();

    words.forEach((word) => {
      const candidate = `${line} ${word}`;
      if (context.measureText(candidate).width <= maxWidth) {
        line = candidate;
      } else {
        lines.push(line);
        line = word;
      }
    });

    lines.push(line);
  });

  return lines;
}

function loadImage(source) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = reject;
    image.src = source;
  });
}

function waitForPaint() {
  return new Promise((resolve) => {
    requestAnimationFrame(() => requestAnimationFrame(resolve));
  });
}

function wait(milliseconds) {
  return new Promise((resolve) => {
    setTimeout(resolve, milliseconds);
  });
}

newButton.addEventListener("click", openNewComicDialog);
cancelNewComicButton.addEventListener("click", closeNewComicDialog);
uploadButton.addEventListener("click", openImagePicker);
bubbleButton.addEventListener("click", addBubble);
deleteBubbleButton.addEventListener("click", deleteSelectedBubble);
exportButton.addEventListener("click", async () => {
  exportButton.disabled = true;
  exportButton.classList.remove("is-exported", "is-export-failed");
  exportButton.classList.add("is-exporting");
  exportButton.textContent = "Exporting...";
  await waitForPaint();

  try {
    await exportComic();
    exportButton.classList.remove("is-exporting");
    exportButton.classList.add("is-exported");
    exportButton.textContent = "Exported!";
    await wait(1400);
  } catch (error) {
    console.error(error);
    exportButton.classList.remove("is-exporting");
    exportButton.classList.add("is-export-failed");
    exportButton.textContent = "Export failed";
    window.alert(error.message || "Export failed.");
  } finally {
    exportButton.classList.remove("is-exporting", "is-exported", "is-export-failed");
    exportButton.textContent = "Export";
    exportButton.disabled = false;
  }
});
imageInput.addEventListener("change", () => placeImage(imageInput.files?.[0]));

render();
