import React, { useEffect, useMemo, useRef, useState } from "react";
import ReactDOM from "react-dom/client";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import {
  getCurrentWindow,
  LogicalSize,
  PhysicalPosition,
  PhysicalSize
} from "@tauri-apps/api/window";
import "./styles.css";

type CaptureResult = {
  image: string;
  width: number;
  height: number;
};

type ScreenBounds = {
  left: number;
  top: number;
  width: number;
  height: number;
};

type Point = {
  x: number;
  y: number;
};

type Rect = {
  left: number;
  top: number;
  width: number;
  height: number;
};

type Mode = "toolbar" | "selecting";

type AnnotationTool = "pen" | "rect" | "arrow";

type Annotation =
  | {
      id: string;
      type: "pen";
      color: string;
      width: number;
      points: Point[];
    }
  | {
      id: string;
      type: "rect" | "arrow";
      color: string;
      width: number;
      start: Point;
      end: Point;
    };

const TOOLBAR_SIZE = new LogicalSize(420, 70);
const ANNOTATION_COLORS = ["#f87171", "#fbbf24", "#34d399", "#38bdf8", "#f8fafc"];
const ANNOTATION_WIDTHS = [4, 7, 10];

const wait = (ms: number) => new Promise((resolve) => window.setTimeout(resolve, ms));

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function rectFromPoints(start: Point, end: Point): Rect {
  return {
    left: Math.min(start.x, end.x),
    top: Math.min(start.y, end.y),
    width: Math.abs(start.x - end.x),
    height: Math.abs(start.y - end.y)
  };
}

function displayRectForImage(imageWidth: number, imageHeight: number): Rect {
  const viewportWidth = window.innerWidth;
  const viewportHeight = window.innerHeight;
  const imageRatio = imageWidth / imageHeight;
  const viewportRatio = viewportWidth / viewportHeight;

  if (viewportRatio > imageRatio) {
    const height = viewportHeight;
    const width = height * imageRatio;
    return {
      left: (viewportWidth - width) / 2,
      top: 0,
      width,
      height
    };
  }

  const width = viewportWidth;
  const height = width / imageRatio;
  return {
    left: 0,
    top: (viewportHeight - height) / 2,
    width,
    height
  };
}

function pointsToPath(points: Point[]) {
  return points
    .map((point, index) => `${index === 0 ? "M" : "L"} ${point.x.toFixed(1)} ${point.y.toFixed(1)}`)
    .join(" ");
}

function arrowHeadShape(start: Point, end: Point, width: number) {
  const angle = Math.atan2(end.y - start.y, end.x - start.x);
  const length = Math.max(14, width * 4.2);
  const spread = Math.PI / 7;
  const left = {
    x: end.x - Math.cos(angle - spread) * length,
    y: end.y - Math.sin(angle - spread) * length
  };
  const right = {
    x: end.x - Math.cos(angle + spread) * length,
    y: end.y - Math.sin(angle + spread) * length
  };

  return [end, left, right];
}

function arrowHeadPoints(start: Point, end: Point, width: number) {
  return arrowHeadShape(start, end, width)
    .map((point) => `${point.x},${point.y}`)
    .join(" ");
}

function annotationDistance(annotation: Annotation) {
  if (annotation.type === "pen") {
    return annotation.points.length;
  }

  return Math.hypot(annotation.end.x - annotation.start.x, annotation.end.y - annotation.start.y);
}

function annotationWithPoint(annotation: Annotation, point: Point): Annotation {
  if (annotation.type === "pen") {
    return {
      ...annotation,
      points: [...annotation.points, point]
    };
  }

  return {
    ...annotation,
    end: point
  };
}

function Root() {
  const shotId = new URLSearchParams(window.location.search).get("shot");
  return shotId ? <ShotWindow shotId={shotId} /> : <ToolbarApp />;
}

function ToolbarApp() {
  const appWindow = useMemo(() => getCurrentWindow(), []);
  const [mode, setMode] = useState<Mode>("toolbar");
  const [screenBounds, setScreenBounds] = useState<ScreenBounds | null>(null);
  const [dragStart, setDragStart] = useState<Point | null>(null);
  const [dragCurrent, setDragCurrent] = useState<Point | null>(null);
  const [isCapturing, setIsCapturing] = useState(false);
  const [shortcutHint, setShortcutHint] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const modeRef = useRef(mode);
  const isCapturingRef = useRef(isCapturing);

  const selection = dragStart && dragCurrent ? rectFromPoints(dragStart, dragCurrent) : null;

  async function configureToolbar(bounds?: ScreenBounds) {
    const currentBounds = bounds ?? (await invoke<ScreenBounds>("screen_bounds"));
    setScreenBounds(currentBounds);
    setMode("toolbar");
    setDragStart(null);
    setDragCurrent(null);

    await appWindow.setSkipTaskbar(false);
    await appWindow.setAlwaysOnTop(true);
    await appWindow.setDecorations(false);
    await appWindow.setResizable(false);
    await appWindow.setSize(TOOLBAR_SIZE);
    await appWindow.setPosition(new PhysicalPosition(currentBounds.left + 28, currentBounds.top + 28));
    await appWindow.show();
    await appWindow.setFocus();
  }

  useEffect(() => {
    configureToolbar().catch((reason) => setError(String(reason)));
    invoke<string | null>("shortcut_hint")
      .then((hint) => setShortcutHint(hint))
      .catch(() => setShortcutHint(null));
  }, []);

  useEffect(() => {
    modeRef.current = mode;
  }, [mode]);

  useEffect(() => {
    isCapturingRef.current = isCapturing;
  }, [isCapturing]);

  useEffect(() => {
    const unlisteners: Array<() => void> = [];
    let disposed = false;

    function keep(handler: () => void) {
      if (disposed) {
        handler();
      } else {
        unlisteners.push(handler);
      }
    }

    listen("kcap://start-selection", () => {
      if (!isCapturingRef.current && modeRef.current !== "selecting") {
        void startSelection();
      }
    }).then(keep).catch((reason) => setError(String(reason)));

    listen("kcap://show-toolbar", () => {
      if (!isCapturingRef.current) {
        void configureToolbar(screenBounds ?? undefined);
      }
    }).then(keep).catch((reason) => setError(String(reason)));

    return () => {
      disposed = true;
      unlisteners.forEach((handler) => handler());
    };
  }, [screenBounds]);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape" && mode === "selecting") {
        event.preventDefault();
        configureToolbar(screenBounds ?? undefined).catch((reason) => setError(String(reason)));
      }
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [mode, screenBounds]);

  async function startSelection() {
    setError(null);
    setIsCapturing(false);

    try {
      const bounds = await invoke<ScreenBounds>("screen_bounds");
      setScreenBounds(bounds);
      setDragStart(null);
      setDragCurrent(null);
      setMode("selecting");

      await appWindow.setSkipTaskbar(false);
      await appWindow.setAlwaysOnTop(true);
      await appWindow.setDecorations(false);
      await appWindow.setResizable(false);
      await appWindow.setPosition(new PhysicalPosition(bounds.left, bounds.top));
      await appWindow.setSize(new PhysicalSize(bounds.width, bounds.height));
      await appWindow.show();
      await appWindow.setFocus();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason));
    }
  }

  async function finishSelection(rect: Rect) {
    if (!screenBounds || rect.width < 8 || rect.height < 8) {
      await configureToolbar(screenBounds ?? undefined);
      return;
    }

    const scaleX = screenBounds.width / window.innerWidth;
    const scaleY = screenBounds.height / window.innerHeight;
    const region = {
      left: Math.round(screenBounds.left + rect.left * scaleX),
      top: Math.round(screenBounds.top + rect.top * scaleY),
      width: Math.max(1, Math.round(rect.width * scaleX)),
      height: Math.max(1, Math.round(rect.height * scaleY))
    };

    setIsCapturing(true);
    setError(null);

    try {
      await appWindow.hide();
      await wait(140);
      await invoke("capture_region_window", region);
      await configureToolbar(screenBounds);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason));
      await configureToolbar(screenBounds);
    } finally {
      setIsCapturing(false);
    }
  }

  function handlePointerDown(event: React.PointerEvent<HTMLElement>) {
    if (event.button !== 0 || isCapturing) {
      return;
    }

    const point = { x: event.clientX, y: event.clientY };
    event.currentTarget.setPointerCapture(event.pointerId);
    setDragStart(point);
    setDragCurrent(point);
  }

  function handlePointerMove(event: React.PointerEvent<HTMLElement>) {
    if (!dragStart || isCapturing) {
      return;
    }

    setDragCurrent({ x: event.clientX, y: event.clientY });
  }

  async function handlePointerUp(event: React.PointerEvent<HTMLElement>) {
    if (!dragStart || isCapturing) {
      return;
    }

    event.currentTarget.releasePointerCapture(event.pointerId);
    await finishSelection(rectFromPoints(dragStart, { x: event.clientX, y: event.clientY }));
  }

  async function hideToolbar() {
    setError(null);
    await appWindow.hide();
  }

  function ignoreToolbarRightClick(event: React.MouseEvent<HTMLElement>) {
    if (event.button !== 0) {
      event.preventDefault();
      event.stopPropagation();
    }
  }

  function ignoreToolbarContextMenu(event: React.MouseEvent<HTMLElement>) {
    event.preventDefault();
    event.stopPropagation();
  }

  if (mode === "selecting") {
    return (
      <main
        className="selection-shell"
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
      >
        <div className="selection-topbar" onPointerDown={(event) => event.stopPropagation()}>
          <span>KCap</span>
          <button onClick={() => configureToolbar(screenBounds ?? undefined)}>取消</button>
        </div>

        {selection ? (
          <div
            className="selection-box"
            style={{
              left: selection.left,
              top: selection.top,
              width: selection.width,
              height: selection.height
            }}
          >
            <span>
              {Math.round(selection.width)} x {Math.round(selection.height)}
            </span>
          </div>
        ) : null}

        {isCapturing ? <div className="capture-badge">正在截图</div> : null}
      </main>
    );
  }

  return (
    <main
      className="toolbar-shell"
      onMouseDown={ignoreToolbarRightClick}
      onContextMenu={ignoreToolbarContextMenu}
    >
      <section
        className="mini-bar"
        data-tauri-drag-region
        onMouseDown={ignoreToolbarRightClick}
        onContextMenu={ignoreToolbarContextMenu}
      >
        <div className="title-pill" data-tauri-drag-region>
          <span className="status-dot" />
          KCap
        </div>
        <div
          className="bar-actions"
          onMouseDown={(event) => {
            event.stopPropagation();
            ignoreToolbarRightClick(event);
          }}
          onContextMenu={ignoreToolbarContextMenu}
        >
          <button onClick={startSelection} disabled={isCapturing}>
            截图{shortcutHint ? ` ${shortcutHint}` : ""}
          </button>
          <button className="close-button" onClick={hideToolbar} aria-label="隐藏工具栏">
            x
          </button>
        </div>
      </section>
      {error ? <div className="toolbar-error">{error}</div> : null}
    </main>
  );
}

function AnnotationShape({ annotation }: { annotation: Annotation }) {
  if (annotation.type === "pen") {
    return (
      <path
        d={pointsToPath(annotation.points)}
        fill="none"
        stroke={annotation.color}
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={annotation.width}
      />
    );
  }

  if (annotation.type === "rect") {
    const rect = rectFromPoints(annotation.start, annotation.end);
    return (
      <rect
        x={rect.left}
        y={rect.top}
        width={rect.width}
        height={rect.height}
        fill="none"
        stroke={annotation.color}
        strokeLinejoin="round"
        strokeWidth={annotation.width}
      />
    );
  }

  return (
    <>
      <line
        x1={annotation.start.x}
        y1={annotation.start.y}
        x2={annotation.end.x}
        y2={annotation.end.y}
        stroke={annotation.color}
        strokeLinecap="round"
        strokeWidth={annotation.width}
      />
      {annotationDistance(annotation) > 4 ? (
        <polygon points={arrowHeadPoints(annotation.start, annotation.end, annotation.width)} fill={annotation.color} />
      ) : null}
    </>
  );
}

function drawAnnotation(context: CanvasRenderingContext2D, annotation: Annotation) {
  context.save();
  context.strokeStyle = annotation.color;
  context.fillStyle = annotation.color;
  context.lineWidth = annotation.width;
  context.lineCap = "round";
  context.lineJoin = "round";

  if (annotation.type === "pen") {
    if (annotation.points.length > 1) {
      context.beginPath();
      annotation.points.forEach((point, index) => {
        if (index === 0) {
          context.moveTo(point.x, point.y);
        } else {
          context.lineTo(point.x, point.y);
        }
      });
      context.stroke();
    }
  } else if (annotation.type === "rect") {
    const rect = rectFromPoints(annotation.start, annotation.end);
    context.strokeRect(rect.left, rect.top, rect.width, rect.height);
  } else {
    context.beginPath();
    context.moveTo(annotation.start.x, annotation.start.y);
    context.lineTo(annotation.end.x, annotation.end.y);
    context.stroke();

    if (annotationDistance(annotation) > 4) {
      const [tip, left, right] = arrowHeadShape(annotation.start, annotation.end, annotation.width);
      context.beginPath();
      context.moveTo(tip.x, tip.y);
      context.lineTo(left.x, left.y);
      context.lineTo(right.x, right.y);
      context.closePath();
      context.fill();
    }
  }

  context.restore();
}

function loadImage(source: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("图片加载失败。"));
    image.src = source;
  });
}

function ShotWindow({ shotId }: { shotId: string }) {
  const appWindow = useMemo(() => getCurrentWindow(), []);
  const [capture, setCapture] = useState<CaptureResult | null>(null);
  const [menu, setMenu] = useState<Point | null>(null);
  const [pinned, setPinned] = useState(true);
  const [annotating, setAnnotating] = useState(false);
  const [annotationTool, setAnnotationTool] = useState<AnnotationTool>("arrow");
  const [annotationColor, setAnnotationColor] = useState(ANNOTATION_COLORS[0]);
  const [annotationWidth, setAnnotationWidth] = useState(ANNOTATION_WIDTHS[1]);
  const [annotations, setAnnotations] = useState<Annotation[]>([]);
  const [draftAnnotation, setDraftAnnotation] = useState<Annotation | null>(null);
  const [imageRect, setImageRect] = useState<Rect | null>(null);
  const [busyAction, setBusyAction] = useState<"copy" | "save" | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const annotationIdRef = useRef(0);

  useEffect(() => {
    invoke<CaptureResult | null>("get_capture", { id: shotId })
      .then((result) => {
        if (result) {
          setCapture(result);
        } else {
          setError("这张截图已经不存在。");
        }
      })
      .catch((reason) => setError(String(reason)));
  }, [shotId]);

  useEffect(() => {
    if (!capture) {
      return;
    }

    const currentCapture = capture;
    function updateImageRect() {
      setImageRect(displayRectForImage(currentCapture.width, currentCapture.height));
    }

    updateImageRect();
    window.addEventListener("resize", updateImageRect);
    return () => window.removeEventListener("resize", updateImageRect);
  }, [capture]);

  useEffect(() => {
    if (!notice) {
      return;
    }

    const timer = window.setTimeout(() => setNotice(null), 2600);
    return () => window.clearTimeout(timer);
  }, [notice]);

  function handleMouseDown(event: React.MouseEvent<HTMLElement>) {
    if (annotating) {
      return;
    }

    if (event.button === 0) {
      setMenu(null);
      void appWindow.startDragging();
    }
  }

  function handleContextMenu(event: React.MouseEvent<HTMLElement>) {
    event.preventDefault();
    setDraftAnnotation(null);
    setMenu({
      x: clamp(event.clientX, 8, Math.max(8, window.innerWidth - 166)),
      y: clamp(event.clientY, 8, Math.max(8, window.innerHeight - 250))
    });
  }

  function imagePointFromEvent(event: React.PointerEvent<SVGSVGElement>) {
    if (!capture || !imageRect || imageRect.width <= 0 || imageRect.height <= 0) {
      return null;
    }

    return {
      x: clamp(((event.clientX - imageRect.left) / imageRect.width) * capture.width, 0, capture.width),
      y: clamp(((event.clientY - imageRect.top) / imageRect.height) * capture.height, 0, capture.height)
    };
  }

  function makeAnnotation(point: Point): Annotation {
    const id = `annotation-${annotationIdRef.current++}`;
    if (annotationTool === "pen") {
      return {
        id,
        type: "pen",
        color: annotationColor,
        width: annotationWidth,
        points: [point]
      };
    }

    return {
      id,
      type: annotationTool,
      color: annotationColor,
      width: annotationWidth,
      start: point,
      end: point
    };
  }

  function handleAnnotationPointerDown(event: React.PointerEvent<SVGSVGElement>) {
    if (!annotating || event.button !== 0) {
      return;
    }

    const point = imagePointFromEvent(event);
    if (!point) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.setPointerCapture(event.pointerId);
    setMenu(null);
    setDraftAnnotation(makeAnnotation(point));
  }

  function handleAnnotationPointerMove(event: React.PointerEvent<SVGSVGElement>) {
    if (!annotating || !draftAnnotation) {
      return;
    }

    const point = imagePointFromEvent(event);
    if (!point) {
      return;
    }

    event.preventDefault();
    setDraftAnnotation((current) => (current ? annotationWithPoint(current, point) : current));
  }

  function handleAnnotationPointerUp(event: React.PointerEvent<SVGSVGElement>) {
    if (!annotating || !draftAnnotation) {
      return;
    }

    const point = imagePointFromEvent(event);
    const finished = point ? annotationWithPoint(draftAnnotation, point) : draftAnnotation;
    event.preventDefault();
    event.stopPropagation();
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    setDraftAnnotation(null);

    if (annotationDistance(finished) > 3) {
      setAnnotations((current) => [...current, finished]);
    }
  }

  async function currentImageData() {
    if (!capture) {
      throw new Error("这张截图还没有加载完成。");
    }

    if (annotations.length === 0) {
      return capture.image;
    }

    const image = await loadImage(capture.image);
    const canvas = document.createElement("canvas");
    canvas.width = capture.width;
    canvas.height = capture.height;
    const context = canvas.getContext("2d");

    if (!context) {
      throw new Error("无法创建图片导出画布。");
    }

    context.drawImage(image, 0, 0, capture.width, capture.height);
    annotations.forEach((annotation) => drawAnnotation(context, annotation));
    return canvas.toDataURL("image/png");
  }

  async function copyShot() {
    setMenu(null);
    setBusyAction("copy");
    setError(null);

    try {
      const imageData = await currentImageData();
      await invoke("copy_image_data_url", { imageData });
      setNotice("已复制到剪贴板");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason));
    } finally {
      setBusyAction(null);
    }
  }

  async function saveShot() {
    setMenu(null);
    setBusyAction("save");
    setError(null);

    try {
      const imageData = await currentImageData();
      const path = await invoke<string>("save_image_data_url", { imageData });
      setNotice(`已保存：${path}`);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason));
    } finally {
      setBusyAction(null);
    }
  }

  function toggleAnnotating() {
    setMenu(null);
    setDraftAnnotation(null);
    setAnnotating((current) => !current);
  }

  async function togglePinned() {
    const nextPinned = !pinned;
    setPinned(nextPinned);
    setMenu(null);
    await appWindow.setAlwaysOnTop(nextPinned);
  }

  async function closeShot() {
    await invoke("forget_capture", { id: shotId });
    await appWindow.close();
  }

  async function exitApp() {
    await invoke("exit_app");
  }

  return (
    <main
      className={`shot-shell${annotating ? " annotating" : ""}`}
      onMouseDown={handleMouseDown}
      onContextMenu={handleContextMenu}
    >
      {capture ? <img className="shot-image" src={capture.image} alt="截图" /> : null}
      {capture && imageRect ? (
        <svg
          className="annotation-layer"
          style={{
            left: imageRect.left,
            top: imageRect.top,
            width: imageRect.width,
            height: imageRect.height,
            pointerEvents: annotating ? "auto" : "none"
          }}
          viewBox={`0 0 ${capture.width} ${capture.height}`}
          onPointerDown={handleAnnotationPointerDown}
          onPointerMove={handleAnnotationPointerMove}
          onPointerUp={handleAnnotationPointerUp}
          onPointerCancel={() => setDraftAnnotation(null)}
        >
          {annotations.map((annotation) => (
            <AnnotationShape key={annotation.id} annotation={annotation} />
          ))}
          {draftAnnotation ? <AnnotationShape annotation={draftAnnotation} /> : null}
        </svg>
      ) : null}

      {annotating ? (
        <div
          className="annotation-toolbar"
          onMouseDown={(event) => event.stopPropagation()}
          onContextMenu={(event) => event.preventDefault()}
        >
          <div className="annotation-group">
            <button className={annotationTool === "arrow" ? "active" : ""} onClick={() => setAnnotationTool("arrow")}>
              箭头
            </button>
            <button className={annotationTool === "rect" ? "active" : ""} onClick={() => setAnnotationTool("rect")}>
              矩形
            </button>
            <button className={annotationTool === "pen" ? "active" : ""} onClick={() => setAnnotationTool("pen")}>
              画笔
            </button>
          </div>
          <div className="annotation-group swatches">
            {ANNOTATION_COLORS.map((color) => (
              <button
                key={color}
                className={annotationColor === color ? "swatch active" : "swatch"}
                style={{ backgroundColor: color }}
                onClick={() => setAnnotationColor(color)}
                aria-label={`颜色 ${color}`}
              />
            ))}
          </div>
          <div className="annotation-group widths">
            {ANNOTATION_WIDTHS.map((width) => (
              <button
                key={width}
                className={annotationWidth === width ? "active" : ""}
                onClick={() => setAnnotationWidth(width)}
              >
                {width}
              </button>
            ))}
          </div>
          <button onClick={() => setAnnotations([])} disabled={annotations.length === 0}>
            清空
          </button>
          <button onClick={toggleAnnotating}>完成</button>
        </div>
      ) : null}

      {error ? <div className="shot-error">{error}</div> : null}
      {notice ? <div className="shot-notice">{notice}</div> : null}

      {menu ? (
        <div
          className="shot-menu"
          style={{ left: menu.x, top: menu.y }}
          onMouseDown={(event) => event.stopPropagation()}
          onContextMenu={(event) => event.preventDefault()}
        >
          <button onClick={togglePinned}>{pinned ? "取消置顶" : "保持置顶"}</button>
          <button onClick={copyShot} disabled={busyAction !== null}>
            {busyAction === "copy" ? "复制中" : "复制图片"}
          </button>
          <button onClick={saveShot} disabled={busyAction !== null}>
            {busyAction === "save" ? "保存中" : "保存图片"}
          </button>
          <button onClick={toggleAnnotating}>{annotating ? "完成标注" : "标注"}</button>
          <button onClick={closeShot}>关闭此图</button>
          <button onClick={exitApp}>退出全部</button>
        </div>
      ) : null}
    </main>
  );
}

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <Root />
  </React.StrictMode>
);
