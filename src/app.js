import * as pdfjsLib from "https://cdn.jsdelivr.net/npm/pdfjs-dist@4.3.136/build/pdf.mjs";

pdfjsLib.GlobalWorkerOptions.workerSrc =
  "https://cdn.jsdelivr.net/npm/pdfjs-dist@4.3.136/build/pdf.worker.mjs";

const APP_DATA_FILE_NAME = ".score-manager-data.json";
const ROOT_HANDLE_DB_NAME = "score-manager-db";
const ROOT_HANDLE_STORE_NAME = "handles";
const ROOT_HANDLE_KEY = "library-root";
const STORAGE_KEYS = {
  currentFolderPath: "score-manager.current-folder-path.v2",
  view: "score-manager.view.v2",
  libraryColumns: "score-manager.library-columns.v1",
  singleLayout: "score-manager.single-layout.v1",
  singleWidthPercent: "score-manager.single-width-percent.v1",
  scrollDirection: "score-manager.scroll-direction.v1",
};
const READER_PADDING = {
  horizontal: 48,
  top: 84,
  bottom: 24,
  gap: 20,
};

const state = {
  libraryRootHandle: null,
  tree: null,
  currentFolderPath: loadCurrentFolderPath(),
  currentScore: null,
  currentPdf: null,
  currentPage: 1,
  mode: "single",
  singleLayout: loadSingleLayout(),
  singleWidthPercent: loadSingleWidthPercent(),
  scrollDirection: loadScrollDirection(),
  autoScrollTimer: null,
  autoScrollActive: false,
  cachedThumbs: new Map(),
  metadata: createEmptyMetadata(),
  currentView: loadViewState(),
  historyReady: false,
  libraryColumns: loadLibraryColumnCount(),
};

const elements = {
  pages: {
    library: document.querySelector("#library-page"),
    reader: document.querySelector("#reader-page"),
  },
  pickDirectoryButton: document.querySelector("#pick-directory-button"),
  changeRootButton: document.querySelector("#change-root-button"),
  reopenLibraryButton: document.querySelector("#reopen-library-button"),
  closeReaderMenuButton: document.querySelector("#close-reader-menu-button"),
  settingsRootFolder: document.querySelector("#settings-root-folder"),
  settingsCurrentFolder: document.querySelector("#settings-current-folder"),
  breadcrumb: document.querySelector("#breadcrumb"),
  libraryGrid: document.querySelector("#library-grid"),
  readerMenuButton: document.querySelector("#reader-menu-button"),
  readerMenu: document.querySelector("#reader-menu"),
  scrollLayoutSection: document.querySelector("#scroll-layout-section"),
  quickOpenVideoButton: document.querySelector("#quick-open-video-button"),
  readerTitle: document.querySelector("#reader-title"),
  pageIndicatorCurrent: document.querySelector("#page-indicator-current"),
  pageIndicatorTotal: document.querySelector("#page-indicator-total"),
  readerEmpty: document.querySelector("#reader-empty"),
  readerViewport: document.querySelector("#reader-viewport"),
  readerPages: document.querySelector("#reader-pages"),
  prevPageButton: document.querySelector("#prev-page-button"),
  nextPageButton: document.querySelector("#next-page-button"),
  backToLibraryButton: document.querySelector("#back-to-library-button"),
  bpmInput: document.querySelector("#bpm-input"),
  beatsPerPageInput: document.querySelector("#beats-per-page-input"),
  toggleAutoScrollButton: document.querySelector("#toggle-auto-scroll-button"),
  videoUrlInput: document.querySelector("#video-url-input"),
  saveVideoUrlButton: document.querySelector("#save-video-url-button"),
  openVideoButton: document.querySelector("#open-video-button"),
  touchZoneLeft: document.querySelector("#touch-zone-left"),
  touchZoneRight: document.querySelector("#touch-zone-right"),
  modeButtons: Array.from(document.querySelectorAll(".segmented-control__button[data-mode]")),
  scrollDirectionButtons: Array.from(document.querySelectorAll(".segmented-control__button[data-scroll-direction]")),
  libraryColumnButtons: Array.from(document.querySelectorAll(".library-columns__button")),
  singleLayoutButtons: Array.from(document.querySelectorAll(".segmented-control__button[data-single-layout]")),
  singleWidthPercentInput: document.querySelector("#single-width-percent-input"),
};

async function initialize() {
  setupEvents();
  applyLibraryColumns();
  syncScrollLayoutControls();
  applyView(state.currentView);
  initializeHistoryState();
  updateStatusLabels();
  renderLibrary();
  await restoreRootHandle();
}

function setupEvents() {
  elements.pickDirectoryButton.addEventListener("click", handlePickDirectory);
  elements.changeRootButton.addEventListener("click", handlePickDirectory);
  elements.reopenLibraryButton.addEventListener("click", () => navigateToLibrary());
  elements.readerMenuButton.addEventListener("click", (event) => { event.stopPropagation(); toggleReaderMenu(); });
  elements.closeReaderMenuButton.addEventListener("click", closeReaderMenu);
  elements.quickOpenVideoButton.addEventListener("click", openVideoUrl);
  elements.prevPageButton.addEventListener("click", () => changePage(-1));
  elements.nextPageButton.addEventListener("click", () => changePage(1));
  elements.backToLibraryButton.addEventListener("click", () => navigateToLibrary());
  elements.toggleAutoScrollButton.addEventListener("click", toggleAutoScroll);
  elements.saveVideoUrlButton.addEventListener("click", saveVideoUrl);
  elements.openVideoButton.addEventListener("click", openVideoUrl);
  document.addEventListener("pointerdown", handleDocumentPointerDown);
  elements.touchZoneLeft.addEventListener("click", () => changePage(-1));
  elements.touchZoneRight.addEventListener("click", () => changePage(1));

  for (const button of elements.modeButtons) {
    button.addEventListener("click", () => switchMode(button.dataset.mode));
  }

  for (const button of elements.libraryColumnButtons) {
    button.addEventListener("click", () => setLibraryColumns(Number(button.dataset.columns)));
  }

  for (const button of elements.scrollDirectionButtons) {
    button.addEventListener("click", () => {
      state.scrollDirection = button.dataset.scrollDirection === "horizontal" ? "horizontal" : "vertical";
      persistScrollDirection();
      syncScrollLayoutControls();
      if (state.mode === "scroll") {
        void renderReader();
      }
    });
  }

  for (const button of elements.singleLayoutButtons) {
    button.addEventListener("click", () => {
      state.singleLayout = button.dataset.singleLayout;
      persistSingleLayout();
      syncScrollLayoutControls();
      if (state.mode === "scroll") {
        void renderReader();
      }
    });
  }

  elements.singleWidthPercentInput.value = String(state.singleWidthPercent);
  elements.singleWidthPercentInput.addEventListener("change", () => {
    state.singleWidthPercent = clamp(Number(elements.singleWidthPercentInput.value) || 92, 40, 100);
    elements.singleWidthPercentInput.value = String(state.singleWidthPercent);
    persistSingleWidthPercent();
    if (state.mode === "scroll") {
      void renderReader();
    }
  });

  elements.readerViewport.addEventListener("scroll", () => {
    if (state.mode === "scroll") {
      syncScrollPageIndicator();
    }
  });

  window.addEventListener("keydown", handleKeyboardInput);
  window.addEventListener("beforeunload", stopAutoScroll);
  window.addEventListener("resize", () => {
    if (state.currentPdf) {
      void renderReader();
    }
  });
  window.addEventListener("popstate", (event) => {
    void handlePopState(event);
  });
}

function createEmptyMetadata() {
  return {
    version: 1,
    updatedAt: null,
    scores: {},
  };
}

function loadCurrentFolderPath() {
  try {
    const value = JSON.parse(localStorage.getItem(STORAGE_KEYS.currentFolderPath) ?? "[]");
    return Array.isArray(value) ? value : [];
  } catch {
    return [];
  }
}

function loadViewState() {
  const value = localStorage.getItem(STORAGE_KEYS.view);
  return value === "reader" ? value : "library";
}

/**
 * @brief 本棚の列数を localStorage から読み込む
 * @returns {2 | 3 | 4 | 5}
 */
function loadLibraryColumnCount() {
  const value = Number(localStorage.getItem(STORAGE_KEYS.libraryColumns));
  return [2, 3, 4, 5].includes(value) ? value : 4;
}

function loadSingleLayout() {
  const value = localStorage.getItem(STORAGE_KEYS.singleLayout);
  return value === "fit-width" ? "fit-width" : "fit-height";
}

function loadSingleWidthPercent() {
  const value = Number(localStorage.getItem(STORAGE_KEYS.singleWidthPercent) ?? 92);
  return Number.isFinite(value) ? clamp(value, 40, 100) : 92;
}

function loadScrollDirection() {
  const value = localStorage.getItem(STORAGE_KEYS.scrollDirection);
  return value === "horizontal" ? "horizontal" : "vertical";
}

function persistCurrentFolderPath() {
  localStorage.setItem(STORAGE_KEYS.currentFolderPath, JSON.stringify(state.currentFolderPath));
}

function persistViewState(view) {
  localStorage.setItem(STORAGE_KEYS.view, view);
}

/**
 * @brief 本棚の列数を localStorage に保存する
 * @returns {void}
 */
function persistLibraryColumnCount() {
  localStorage.setItem(STORAGE_KEYS.libraryColumns, String(state.libraryColumns));
}

/**
 * @brief 本棚の列数を画面へ反映する
 * @returns {void}
 */
function applyLibraryColumns() {
  elements.libraryGrid.style.setProperty("--library-columns", String(state.libraryColumns));
  updateLibraryColumnButtons();
}

/**
 * @brief 列数ボタンの選択状態を同期する
 * @returns {void}
 */
function updateLibraryColumnButtons() {
  for (const button of elements.libraryColumnButtons) {
    button.classList.toggle("is-active", Number(button.dataset.columns) === state.libraryColumns);
  }
}

function persistSingleLayout() {
  localStorage.setItem(STORAGE_KEYS.singleLayout, state.singleLayout);
}

function persistSingleWidthPercent() {
  localStorage.setItem(STORAGE_KEYS.singleWidthPercent, String(state.singleWidthPercent));
}

function persistScrollDirection() {
  localStorage.setItem(STORAGE_KEYS.scrollDirection, state.scrollDirection);
}

function syncScrollLayoutControls() {
  const isScrollMode = state.mode === "scroll";
  const effectiveLayout = state.scrollDirection === "horizontal" ? "fit-height" : state.singleLayout;

  for (const button of elements.scrollDirectionButtons) {
    button.classList.toggle("is-active", button.dataset.scrollDirection === state.scrollDirection);
  }

  for (const button of elements.singleLayoutButtons) {
    const isWidthLayout = button.dataset.singleLayout === "fit-width";
    button.classList.toggle("is-active", button.dataset.singleLayout === effectiveLayout);
    button.disabled = !isScrollMode || (isWidthLayout && state.scrollDirection === "horizontal");
  }

  elements.scrollLayoutSection.hidden = !isScrollMode;
  elements.singleWidthPercentInput.disabled = !isScrollMode || state.scrollDirection !== "vertical" || state.singleLayout !== "fit-width";
}

async function restoreRootHandle() {
  const handle = await getStoredRootHandle();
  if (!handle) {
    return;
  }

  const permission = await handle.queryPermission({ mode: "readwrite" });
  if (permission !== "granted") {
    updateStatusLabels();
    return;
  }

  try {
    await loadLibraryFromHandle(handle);
  } catch (error) {
    console.warn("保存済みルートフォルダの復元に失敗しました", error);
  }
}

async function handlePickDirectory() {
  if (!window.showDirectoryPicker) {
    alert("このブラウザではフォルダ選択 API が利用できません。Chromium 系ブラウザで開いてください。");
    return;
  }

  try {
    const directoryHandle = await window.showDirectoryPicker({ mode: "readwrite" });
    const permission = await directoryHandle.requestPermission({ mode: "readwrite" });
    if (permission !== "granted") {
      alert("ルートフォルダへの読み書き権限が必要です。");
      return;
    }

    await storeRootHandle(directoryHandle);
    await loadLibraryFromHandle(directoryHandle);
    navigateToLibrary({ replaceHistory: true });
  } catch (error) {
    if (error?.name !== "AbortError") {
      console.error(error);
      alert("フォルダの読み込みに失敗しました。");
    }
  }
}

async function loadLibraryFromHandle(directoryHandle) {
  state.libraryRootHandle = directoryHandle;
  state.metadata = await readMetadata(directoryHandle);
  state.tree = await scanDirectory(directoryHandle, []);

  const currentFolder = resolveFolderPath(state.currentFolderPath);
  if (!currentFolder) {
    state.currentFolderPath = [];
    persistCurrentFolderPath();
  }

  updateStatusLabels();
  renderLibrary();
}

async function readMetadata(rootHandle) {
  try {
    const fileHandle = await rootHandle.getFileHandle(APP_DATA_FILE_NAME);
    const file = await fileHandle.getFile();
    const raw = await file.text();
    const parsed = JSON.parse(raw);
    return {
      ...createEmptyMetadata(),
      ...parsed,
      scores: parsed?.scores && typeof parsed.scores === "object" ? parsed.scores : {},
    };
  } catch (error) {
    if (error?.name !== "NotFoundError") {
      console.warn("メタデータ JSON の読み込みに失敗しました", error);
    }
    return createEmptyMetadata();
  }
}

async function writeMetadata() {
  if (!state.libraryRootHandle) {
    return;
  }

  state.metadata.updatedAt = new Date().toISOString();
  const fileHandle = await state.libraryRootHandle.getFileHandle(APP_DATA_FILE_NAME, { create: true });
  const writable = await fileHandle.createWritable();
  await writable.write(JSON.stringify(state.metadata, null, 2));
  await writable.close();
}

async function scanDirectory(directoryHandle, pathSegments) {
  const folders = [];
  const scores = [];

  for await (const entry of directoryHandle.values()) {
    if (entry.kind === "directory") {
      folders.push(await scanDirectory(entry, [...pathSegments, entry.name]));
      continue;
    }

    if (!entry.name.toLowerCase().endsWith(".pdf") || entry.name === APP_DATA_FILE_NAME) {
      continue;
    }

    scores.push({
      type: "score",
      name: entry.name.replace(/\.pdf$/i, ""),
      fileName: entry.name,
      pathSegments: [...pathSegments, entry.name],
      fileHandle: entry,
      pageCount: null,
    });
  }

  folders.sort((a, b) => a.name.localeCompare(b.name, "ja"));
  scores.sort((a, b) => a.name.localeCompare(b.name, "ja"));

  return {
    type: "folder",
    name: pathSegments.at(-1) ?? directoryHandle.name ?? "ライブラリ",
    pathSegments,
    folders,
    scores,
  };
}

function resolveFolderPath(pathSegments) {
  if (!state.tree) {
    return null;
  }

  let current = state.tree;
  for (const segment of pathSegments) {
    const next = current.folders.find((folder) => folder.name === segment);
    if (!next) {
      return null;
    }
    current = next;
  }
  return current;
}

function getCurrentFolder() {
  return resolveFolderPath(state.currentFolderPath) ?? state.tree;
}

function renderLibrary() {
  renderBreadcrumb();
  updateStatusLabels();

  const currentFolder = getCurrentFolder();
  if (!currentFolder) {
    elements.libraryGrid.innerHTML = '<div class="empty-state">ルートフォルダを選択してください。</div>';
    return;
  }

  const entries = [...currentFolder.folders, ...currentFolder.scores];
  if (!entries.length) {
    elements.libraryGrid.innerHTML = '<div class="empty-state">このカテゴリに PDF はありません。</div>';
    return;
  }

  elements.libraryGrid.innerHTML = "";
  for (const entry of entries) {
    const card = createShelfCard(entry);
    elements.libraryGrid.append(card);
  }
}

function renderBreadcrumb() {
  elements.breadcrumb.innerHTML = "";
  const rootLabel = state.libraryRootHandle?.name ?? "ライブラリ";
  const items = [{ label: rootLabel, path: [] }];
  let path = [];
  for (const segment of state.currentFolderPath) {
    path = [...path, segment];
    items.push({ label: segment, path: [...path] });
  }

  for (const item of items) {
    const button = document.createElement("button");
    button.className = "breadcrumb__item";
    button.type = "button";
    button.textContent = item.label;
    button.addEventListener("click", () => navigateToFolder(item.path));
    elements.breadcrumb.append(button);
  }
}

/**
 * @brief 本棚の列数を切り替える
 * @param {number} columns 切り替え後の列数
 * @returns {void}
 */
function setLibraryColumns(columns) {
  if (![2, 3, 4, 5].includes(columns) || state.libraryColumns === columns) {
    return;
  }

  state.libraryColumns = columns;
  persistLibraryColumnCount();
  applyLibraryColumns();
}

function createShelfCard(entry) {
  const card = document.createElement("button");
  card.className = "shelf-card";
  card.type = "button";

  const thumb = document.createElement("div");
  thumb.className = "shelf-card__thumb";
  thumb.textContent = entry.type === "folder" ? "Folder" : "PDF";

  const body = document.createElement("div");

  const title = document.createElement("div");
  title.className = "shelf-card__title";
  title.textContent = entry.name;

  const meta = document.createElement("div");
  meta.className = "shelf-card__meta";
  meta.textContent =
    entry.type === "folder"
      ? `${entry.folders.length} folders / ${entry.scores.length} scores`
      : entry.fileName;

  body.append(title, meta);
  card.append(thumb, body);

  if (entry.type === "folder") {
    card.addEventListener("click", () => navigateToFolder(entry.pathSegments));
  } else {
    card.addEventListener("click", () => openScore(entry));
    void attachThumbnail(entry, thumb);
  }

  return card;
}


async function attachThumbnail(score, thumbElement) {
  const key = score.pathSegments.join("/");
  if (state.cachedThumbs.has(key)) {
    thumbElement.replaceChildren(createThumbnailImage(state.cachedThumbs.get(key), score.name));
    return;
  }

  try {
    const file = await score.fileHandle.getFile();
    const pdf = await pdfjsLib.getDocument({ data: await file.arrayBuffer() }).promise;
    score.pageCount = pdf.numPages;
    const page = await pdf.getPage(1);
    const viewport = page.getViewport({ scale: 0.24 });
    const canvas = document.createElement("canvas");
    canvas.width = Math.floor(viewport.width);
    canvas.height = Math.floor(viewport.height);
    const context = canvas.getContext("2d");
    await page.render({ canvasContext: context, viewport }).promise;
    const thumbnailUrl = canvas.toDataURL("image/png");
    state.cachedThumbs.set(key, thumbnailUrl);
    thumbElement.replaceChildren(createThumbnailImage(thumbnailUrl, score.name));
  } catch (error) {
    console.warn("サムネイル生成に失敗しました", score.fileName, error);
  }
}

function createThumbnailImage(src, name) {
  const image = document.createElement("img");
  image.src = src;
  image.alt = `${name} のサムネイル`;
  return image;
}

async function openScore(score, options = {}) {
  const { replaceHistory = false, skipHistory = false, page = 1, mode = state.mode } = options;

  stopAutoScroll();
  closeReaderMenu();
  state.currentScore = score;
  state.currentPage = page;
  state.mode = mode;
  elements.readerTitle.textContent = score.name;
  elements.readerEmpty.classList.add("is-hidden");
  elements.readerViewport.classList.remove("is-hidden");
  elements.videoUrlInput.value = getScoreMeta(score).videoUrl ?? "";

  try {
    const file = await score.fileHandle.getFile();
    state.currentPdf = await pdfjsLib.getDocument({ data: await file.arrayBuffer() }).promise;
    score.pageCount = state.currentPdf.numPages;
    applyView("reader");
    syncHistoryState({ replaceHistory, skipHistory });
    await renderReader();
  } catch (error) {
    console.error(error);
    alert("PDF の読み込みに失敗しました。");
  }
}

async function renderReader() {
  if (!state.currentPdf) {
    updatePageIndicator();
    return;
  }

  if (state.currentPage > state.currentPdf.numPages) {
    state.currentPage = state.currentPdf.numPages;
  }

  elements.readerViewport.dataset.mode = state.mode;
  elements.readerViewport.dataset.scrollDirection = state.scrollDirection;
  elements.readerPages.dataset.mode = state.mode;
  elements.readerPages.dataset.scrollDirection = state.scrollDirection;
  elements.readerPages.innerHTML = "";
  elements.readerViewport.scrollTop = 0;
  elements.readerViewport.scrollLeft = 0;

  let pageNumbers = [];
  if (state.mode === "single") {
    pageNumbers = [state.currentPage];
  } else if (state.mode === "spread") {
    const leftPage = state.currentPage % 2 === 0 ? state.currentPage - 1 : state.currentPage;
    pageNumbers = [leftPage, leftPage + 1].filter((pageNumber) => pageNumber <= state.currentPdf.numPages);
    state.currentPage = leftPage;
  } else {
    pageNumbers = Array.from({ length: state.currentPdf.numPages }, (_, index) => index + 1);
  }

  let firstSheet = null;
  for (const pageNumber of pageNumbers) {
    const sheet = await createReaderSheet(pageNumber);
    if (!firstSheet) {
      firstSheet = sheet;
    }
    elements.readerPages.append(sheet);
  }

  if (state.mode === "spread" && pageNumbers.length === 1 && firstSheet) {
    elements.readerPages.append(createSpreadPlaceholder(firstSheet));
  }

  updateModeButtons();
  syncScrollLayoutControls();
  updatePageIndicator();
}

async function createReaderSheet(pageNumber) {
  const page = await state.currentPdf.getPage(pageNumber);
  const scale = calculateReaderScale(page);
  const viewport = page.getViewport({ scale });
  const outputScale = window.devicePixelRatio || 1;
  const canvas = document.createElement("canvas");
  canvas.width = Math.floor(viewport.width * outputScale);
  canvas.height = Math.floor(viewport.height * outputScale);
  canvas.style.width = `${viewport.width}px`;
  canvas.style.height = `${viewport.height}px`;

  const context = canvas.getContext("2d");
  context.setTransform(outputScale, 0, 0, outputScale, 0, 0);
  await page.render({ canvasContext: context, viewport }).promise;

  const sheet = document.createElement("div");
  sheet.className = "reader-sheet";
  sheet.dataset.pageNumber = String(pageNumber);
  sheet.style.width = `${viewport.width}px`;
  sheet.style.height = `${viewport.height}px`;
  sheet.append(canvas);
  return sheet;
}

function createSpreadPlaceholder(referenceSheet) {
  const placeholder = document.createElement("div");
  placeholder.className = "reader-sheet reader-sheet--placeholder";
  placeholder.setAttribute("aria-hidden", "true");
  placeholder.style.width = referenceSheet.style.width;
  placeholder.style.height = referenceSheet.style.height;
  return placeholder;
}

function calculateReaderScale(page) {
  const baseViewport = page.getViewport({ scale: 1 });
  const viewportWidth = Math.max(elements.readerViewport.clientWidth, 320);
  const viewportHeight = Math.max(elements.readerViewport.clientHeight, 320);
  const topbarHeight = 24;

  if (state.mode === "scroll") {
    const availableWidth = Math.max(viewportWidth - READER_PADDING.horizontal * 2, 280);
    const availableHeight = Math.max(viewportHeight - topbarHeight - 24, 180);
    const widthScale = (availableWidth * (state.singleWidthPercent / 100)) / baseViewport.width;

    if (state.scrollDirection === "horizontal") {
      return availableHeight / baseViewport.height;
    }

    if (state.singleLayout === "fit-width") {
      return widthScale;
    }

    return availableHeight / baseViewport.height;
  }

  const availableHeight = Math.max(viewportHeight - topbarHeight - 24, 180);
  const heightScale = availableHeight / baseViewport.height;

  if (state.mode === "spread") {
    const availableWidthPerPage = Math.max((viewportWidth - READER_PADDING.horizontal * 2 - READER_PADDING.gap) / 2, 160);
    const widthScale = availableWidthPerPage / baseViewport.width;
    return Math.min(heightScale, widthScale);
  }

  if (state.singleLayout === "fit-width") {
    const availableWidth = Math.max(viewportWidth - READER_PADDING.horizontal * 2, 220);
    const widthScale = (availableWidth * (state.singleWidthPercent / 100)) / baseViewport.width;
    return Math.min(widthScale, heightScale);
  }

  return heightScale;
}

function updatePageIndicator() {
  elements.pageIndicatorCurrent.textContent = state.currentPdf ? String(state.currentPage) : "-";
  elements.pageIndicatorTotal.textContent = state.currentPdf ? String(state.currentPdf.numPages) : "-";
}

function updateModeButtons() {
  for (const button of elements.modeButtons) {
    button.classList.toggle("is-active", button.dataset.mode === state.mode);
  }
}

function switchMode(mode) {
  if (!mode || state.mode === mode) {
    return;
  }

  state.mode = mode;
  stopAutoScroll();
  void renderReader();
}

function changePage(delta) {
  if (!state.currentPdf) {
    return;
  }

  if (state.mode === "scroll") {
    const isHorizontal = state.scrollDirection === "horizontal";
    const amount = Math.round((isHorizontal ? elements.readerViewport.clientWidth : elements.readerViewport.clientHeight) * 0.82) * Math.sign(delta);
    elements.readerViewport.scrollBy({ left: isHorizontal ? amount : 0, top: isHorizontal ? 0 : amount, behavior: "smooth" });
    window.setTimeout(syncScrollPageIndicator, 140);
    return;
  }

  const step = state.mode === "spread" ? 2 : 1;
  const nextPage = clamp(state.currentPage + step * Math.sign(delta), 1, state.currentPdf.numPages);
  if (nextPage === state.currentPage) {
    return;
  }

  state.currentPage = nextPage;
  void renderReader();
}

function handleKeyboardInput(event) {
  if (["INPUT", "TEXTAREA"].includes(document.activeElement?.tagName)) {
    return;
  }

  if (event.key === "ArrowRight" || event.key === "PageDown") {
    event.preventDefault();
    changePage(1);
    return;
  }

  if (event.key === "ArrowLeft" || event.key === "PageUp") {
    event.preventDefault();
    changePage(-1);
    return;
  }

  if (event.key === " ") {
    event.preventDefault();
    toggleAutoScroll();
    return;
  }

  if (event.key === "1") {
    switchMode("single");
  } else if (event.key === "2") {
    switchMode("spread");
  } else if (event.key === "3") {
    switchMode("scroll");
  } else if (event.key === "Escape") {
    closeReaderMenu();
  }
}

function syncScrollPageIndicator() {
  if (state.mode !== "scroll") {
    return;
  }

  const sheets = Array.from(elements.readerPages.querySelectorAll(".reader-sheet:not(.reader-sheet--placeholder)"));
  const isHorizontal = state.scrollDirection === "horizontal";
  const threshold = isHorizontal
    ? elements.readerViewport.scrollLeft + elements.readerViewport.clientWidth * 0.3
    : elements.readerViewport.scrollTop + elements.readerViewport.clientHeight * 0.3;

  for (const sheet of sheets) {
    const sheetEnd = isHorizontal ? sheet.offsetLeft + sheet.clientWidth : sheet.offsetTop + sheet.clientHeight;
    if (sheetEnd > threshold) {
      state.currentPage = Number(sheet.dataset.pageNumber);
      updatePageIndicator();
      return;
    }
  }
}

function toggleAutoScroll() {
  if (state.mode !== "scroll") {
    alert("自動スクロールはスクロール表示モードでのみ使用できます。");
    return;
  }

  if (state.autoScrollActive) {
    stopAutoScroll();
    return;
  }

  const bpm = Number(elements.bpmInput.value);
  const beatsPerPage = Number(elements.beatsPerPageInput.value);
  if (!bpm || !beatsPerPage || bpm <= 0 || beatsPerPage <= 0) {
    alert("BPM と拍/ページには正の数を入力してください。");
    return;
  }

  const durationPerPageMs = (beatsPerPage * 60 * 1000) / bpm;
  const isHorizontal = state.scrollDirection === "horizontal";
  const viewportSize = isHorizontal ? elements.readerViewport.clientWidth : elements.readerViewport.clientHeight;
  const pixelsPerTick = (viewportSize * 0.82) / (durationPerPageMs / 50);

  state.autoScrollActive = true;
  elements.toggleAutoScrollButton.textContent = "自動スクロール停止";
  state.autoScrollTimer = window.setInterval(() => {
    if (isHorizontal) {
      const maxScrollLeft = elements.readerViewport.scrollWidth - elements.readerViewport.clientWidth;
      const nextScrollLeft = Math.min(elements.readerViewport.scrollLeft + pixelsPerTick, maxScrollLeft);
      elements.readerViewport.scrollLeft = nextScrollLeft;
      syncScrollPageIndicator();

      if (nextScrollLeft >= maxScrollLeft) {
        stopAutoScroll();
      }
      return;
    }

    const maxScrollTop = elements.readerViewport.scrollHeight - elements.readerViewport.clientHeight;
    const nextScrollTop = Math.min(elements.readerViewport.scrollTop + pixelsPerTick, maxScrollTop);
    elements.readerViewport.scrollTop = nextScrollTop;
    syncScrollPageIndicator();

    if (nextScrollTop >= maxScrollTop) {
      stopAutoScroll();
    }
  }, 50);
}

function stopAutoScroll() {
  if (state.autoScrollTimer) {
    window.clearInterval(state.autoScrollTimer);
    state.autoScrollTimer = null;
  }

  state.autoScrollActive = false;
  elements.toggleAutoScrollButton.textContent = "自動スクロール開始";
}

async function saveVideoUrl() {
  if (!state.currentScore || !state.libraryRootHandle) {
    return;
  }

  const key = state.currentScore.pathSegments.join("/");
  const value = elements.videoUrlInput.value.trim();
  state.metadata.scores[key] = {
    ...state.metadata.scores[key],
    videoUrl: value,
  };

  await writeMetadata();
}

function openVideoUrl() {
  const url = elements.videoUrlInput.value.trim();
  if (!url) {
    return;
  }

  window.open(url, "_blank", "noopener,noreferrer");
}

function getScoreMeta(score) {
  return state.metadata.scores[score.pathSegments.join("/")] ?? {};
}

function applyView(view) {
  state.currentView = view;
  persistViewState(view);

  for (const [pageName, pageElement] of Object.entries(elements.pages)) {
    pageElement.hidden = pageName !== view;
    pageElement.classList.toggle("page--active", pageName === view);
  }

  if (view !== "reader") {
    closeReaderMenu();
    stopAutoScroll();
  }
}

/**
 * @brief 現在状態をブラウザ履歴へ同期する
 * @param {{replaceHistory?: boolean, skipHistory?: boolean}} [options] 履歴更新オプション
 * @returns {void}
 */
function syncHistoryState(options = {}) {
  if (!state.historyReady || options.skipHistory) {
    return;
  }

  const snapshot = createHistorySnapshot();
  if (options.replaceHistory) {
    window.history.replaceState(snapshot, "");
  } else {
    window.history.pushState(snapshot, "");
  }
}

/**
 * @brief 現在状態の履歴スナップショットを生成する
 * @returns {{view:"library"|"reader", currentFolderPath:string[], scorePath:string[]|null, readerPage:number, mode:"single"|"spread"|"scroll", scrollDirection:"vertical"|"horizontal"}}
 */
function createHistorySnapshot() {
  return {
    view: state.currentView,
    currentFolderPath: [...state.currentFolderPath],
    scorePath: state.currentScore ? [...state.currentScore.pathSegments] : null,
    readerPage: state.currentPage,
    mode: state.mode,
    scrollDirection: state.scrollDirection,
  };
}

/**
 * @brief 履歴状態を初期化する
 * @returns {void}
 */
function initializeHistoryState() {
  window.history.replaceState(createHistorySnapshot(), "");
  state.historyReady = true;
}

/**
 * @brief ライブラリ内のカテゴリを移動する
 * @param {string[]} pathSegments 移動先カテゴリ
 * @param {{replaceHistory?: boolean, skipHistory?: boolean}} [options] 履歴更新オプション
 * @returns {void}
 */
function navigateToFolder(pathSegments, options = {}) {
  state.currentFolderPath = [...pathSegments];
  persistCurrentFolderPath();
  renderLibrary();

  if (state.currentView !== "library") {
    applyView("library");
  }

  syncHistoryState(options);
}

/**
 * @brief 本棚画面へ戻る
 * @param {{replaceHistory?: boolean, skipHistory?: boolean}} [options] 履歴更新オプション
 * @returns {void}
 */
function navigateToLibrary(options = {}) {
  state.currentScore = null;
  state.currentPdf = null;
  applyView("library");
  syncHistoryState(options);
}

/**
 * @brief ブラウザの戻る/進む操作に合わせて状態を復元する
 * @param {PopStateEvent} event 履歴イベント
 * @returns {Promise<void>}
 */
async function handlePopState(event) {
  const historyState = event.state;
  if (!historyState) {
    navigateToLibrary({ replaceHistory: true, skipHistory: true });
    return;
  }

  state.currentFolderPath = Array.isArray(historyState.currentFolderPath) ? [...historyState.currentFolderPath] : [];
  persistCurrentFolderPath();
  state.mode = historyState.mode === "spread" || historyState.mode === "scroll" ? historyState.mode : "single";
  state.scrollDirection = historyState.scrollDirection === "horizontal"
    ? "horizontal"
    : historyState.scrollDirection === "vertical"
      ? "vertical"
      : loadScrollDirection();
  renderLibrary();

  if (historyState.view === "reader" && Array.isArray(historyState.scorePath)) {
    const score = resolveScorePath(historyState.scorePath);
    if (score) {
      await openScore(score, {
        skipHistory: true,
        replaceHistory: true,
        page: Number(historyState.readerPage) || 1,
        mode: state.mode,
      });
      return;
    }
  }

  state.currentScore = null;
  state.currentPdf = null;
  applyView("library");
}

function toggleReaderMenu() {
  if (state.currentView !== "reader") {
    return;
  }

  if (elements.readerMenu.hidden) {
    updateStatusLabels();
  }

  elements.readerMenu.hidden = !elements.readerMenu.hidden;
}

function handleDocumentPointerDown(event) {
  if (elements.readerMenu.hidden || state.currentView !== "reader") {
    return;
  }

  const target = event.target;
  if (elements.readerMenu.contains(target) || elements.readerMenuButton.contains(target)) {
    return;
  }

  closeReaderMenu();
}

function closeReaderMenu() {
  elements.readerMenu.hidden = true;
}

function updateStatusLabels() {
  const rootLabel = state.libraryRootHandle?.name ?? "未選択";
  const folderLabel = state.currentFolderPath.length ? state.currentFolderPath.join(" / ") : rootLabel;
  elements.settingsRootFolder.textContent = rootLabel;
  elements.settingsCurrentFolder.textContent = state.tree ? folderLabel : "未選択";
}

/**
 * @brief 相対パスから楽譜エントリを解決する
 * @param {string[]} pathSegments 楽譜への相対パス
 * @returns {LibraryScore | null}
 */
function resolveScorePath(pathSegments) {
  if (!state.tree || !Array.isArray(pathSegments) || pathSegments.length === 0) {
    return null;
  }

  const folderPath = pathSegments.slice(0, -1);
  const fileName = pathSegments.at(-1);
  const folder = resolveFolderPath(folderPath);
  return folder?.scores.find((score) => score.fileName === fileName) ?? null;
}

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function openHandleDatabase() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(ROOT_HANDLE_DB_NAME, 1);
    request.onupgradeneeded = () => {
      request.result.createObjectStore(ROOT_HANDLE_STORE_NAME);
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function storeRootHandle(handle) {
  const db = await openHandleDatabase();
  await new Promise((resolve, reject) => {
    const transaction = db.transaction(ROOT_HANDLE_STORE_NAME, "readwrite");
    transaction.objectStore(ROOT_HANDLE_STORE_NAME).put(handle, ROOT_HANDLE_KEY);
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
  });
  db.close();
}

async function getStoredRootHandle() {
  const db = await openHandleDatabase();
  const result = await new Promise((resolve, reject) => {
    const transaction = db.transaction(ROOT_HANDLE_STORE_NAME, "readonly");
    const request = transaction.objectStore(ROOT_HANDLE_STORE_NAME).get(ROOT_HANDLE_KEY);
    request.onsuccess = () => resolve(request.result ?? null);
    request.onerror = () => reject(request.error);
  });
  db.close();
  return result;
}

initialize();

/**
 * @typedef {Object} LibraryFolder
 * @property {"folder"} type 種別
 * @property {string} name フォルダ表示名
 * @property {string[]} pathSegments 相対パス
 * @property {LibraryFolder[]} folders 子フォルダ
 * @property {LibraryScore[]} scores 子楽譜
 */

/**
 * @typedef {Object} LibraryScore
 * @property {"score"} type 種別
 * @property {string} name タイトル
 * @property {string} fileName ファイル名
 * @property {string[]} pathSegments 相対パス
 * @property {FileSystemFileHandle} fileHandle ファイルハンドル
 * @property {number | null} pageCount ページ数
 */







