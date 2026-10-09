import { useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { GIFEncoder, applyPalette, quantize } from "gifenc";
import { Icons } from "../icons.jsx";
import PageHeaderActions from "../components/PageHeaderActions.jsx";
import karamahLogoUrl from "../assets/karamah-wordmark.svg";

const QR_API = "https://api.qrserver.com/v1/create-qr-code/";
const QR_READ_API = "https://api.qrserver.com/v1/read-qr-code/";
const QR_COLORS = {
  green: { label: "Karamah green", hex: "#08705B" },
  blue: { label: "Karamah deep blue", hex: "#0B3C49" },
  gold: { label: "Karamah gold", hex: "#F2C879" },
};
const QR_DARK_COLORS = {
  green: { label: "Karamah light green", hex: "#E6F2EF" },
  blue: { label: "Karamah light blue", hex: "#E7F0FB" },
  gold: QR_COLORS.gold,
};
const QR_BACKGROUNDS = {
  white: { label: "White", hex: "#FFFFFF" },
  lightGold: { label: "Light gold", hex: "#FDF6E8" },
  blue: { label: "Deep blue", hex: "#0B3C49" },
};
const LOGO_GOLD = "#E2B85B";
const BODY_SHAPES = { dots: "Dots", rounded: "Rounded", square: "Square" };
const EYE_SHAPES = { rounded: "Rounded", square: "Square", circle: "Circle" };
const QR_ANIMATIONS = {
  none: { label: "Still", description: "A classic, static PNG." },
  auto: { label: "Match design", description: "Motion tailored to the selected body shape." },
  ripple: { label: "Ripple", description: "Concentric color rings travel through the modules." },
  sweep: { label: "Sweep", description: "A soft diagonal band crosses the code." },
  signal: { label: "Signal", description: "Alternating color lanes pulse in sequence." },
};
const ANIMATION_FRAME_COUNT = 8;
const ANIMATION_FRAME_DELAY = 160;
const imageCache = new Map();

function qrUrl(value, ecc) {
  const params = new URLSearchParams({
    size: "1000x1000",
    data: value,
    ecc,
    qzone: "4",
    margin: "0",
    format: "png",
    color: "000000",
    bgcolor: "ffffff",
    "charset-source": "UTF-8",
    "charset-target": "UTF-8",
  });
  return `${QR_API}?${params.toString()}`;
}

function loadImage(source) {
  if (imageCache.has(source)) return imageCache.get(source);
  const request = new Promise((resolve, reject) => {
    const image = new Image();
    image.crossOrigin = "anonymous";
    image.onload = () => resolve(image);
    image.onerror = () => {
      imageCache.delete(source);
      reject(new Error("The QR artwork could not be loaded."));
    };
    image.src = source;
  });
  imageCache.set(source, request);
  return request;
}

function canvasBlob(canvas) {
  return new Promise((resolve, reject) => {
    canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error("The QR image could not be prepared.")), "image/png");
  });
}

function mix(base, color, alpha) {
  return [
    Math.round(color[0] * alpha + base[0] * (1 - alpha)),
    Math.round(color[1] * alpha + base[1] * (1 - alpha)),
    Math.round(color[2] * alpha + base[2] * (1 - alpha)),
  ];
}

const rgb = hex => hex.match(/[0-9a-f]{2}/gi).map(value => parseInt(value, 16));
const luminance = hex => rgb(hex).map(value => value / 255).map(value => value <= .03928 ? value / 12.92 : ((value + .055) / 1.055) ** 2.4).reduce((sum, value, index) => sum + value * [.2126, .7152, .0722][index], 0);
const contrastRatio = (first, second) => { const a = luminance(first), b = luminance(second); return (Math.max(a, b) + .05) / (Math.min(a, b) + .05); };
const colorDistance = (first, second) => Math.hypot(first[0] - second[0], first[1] - second[1], first[2] - second[2]);
const randomItem = values => values[Math.floor(Math.random() * values.length)];
const randomStep = (minimum, maximum, step = 2) => minimum + Math.floor(Math.random() * (Math.floor((maximum - minimum) / step) + 1)) * step;

function roundedRect(context, x, y, width, height, radius) {
  const r = Math.min(radius, width / 2, height / 2);
  context.beginPath();
  context.roundRect(x, y, width, height, r);
  context.fill();
}

function finderModule(column, row, count) {
  return (column < 7 && row < 7) || (column >= count - 7 && row < 7) || (column < 7 && row >= count - 7);
}

function resolveAnimation(animation, bodyShape) {
  if (animation !== "auto") return animation;
  if (bodyShape === "dots") return "ripple";
  if (bodyShape === "rounded") return "sweep";
  return "signal";
}

function moduleAnimationStrength(animation, column, row, count, phase) {
  if (animation === "none") return 0;
  const progress = phase * Math.PI * 2;
  let wave;
  if (animation === "ripple") {
    const distance = Math.hypot(column - count / 2, row - count / 2);
    wave = Math.sin(distance * .92 - progress);
  } else if (animation === "sweep") {
    wave = Math.sin((column + row) * .52 - progress);
  } else {
    wave = Math.sin(column * 1.08 + progress) * Math.cos(row * .34 - progress * .5);
  }
  return Math.max(0, wave) * .82;
}

function drawFinder(context, x, y, cell, frameShape, ballShape, foreground, background) {
  const drawShape = (shape, left, top, size, radius) => {
    if (shape === "circle") { context.beginPath(); context.arc(left + size / 2, top + size / 2, size / 2, 0, Math.PI * 2); context.fill(); }
    else roundedRect(context, left, top, size, size, shape === "rounded" ? radius : 0);
  };
  context.fillStyle = foreground;
  drawShape(frameShape, x, y, cell * 7, cell * 1.55);
  context.fillStyle = background;
  drawShape(frameShape, x + cell, y + cell, cell * 5, cell * 1.05);
  context.fillStyle = foreground;
  drawShape(ballShape, x + cell * 2, y + cell * 2, cell * 3, cell * .82);
}

function drawModernQr(context, qrImage, size, bodyShape, eyeFrame, eyeBall, foreground, background, animation = "none", animationPhase = 0, animationAccent = foreground) {
  const sourceSize = qrImage.naturalWidth || qrImage.width || 1000;
  const source = document.createElement("canvas"); source.width = sourceSize; source.height = sourceSize;
  const sourceContext = source.getContext("2d", { willReadFrequently: true });
  sourceContext.drawImage(qrImage, 0, 0, sourceSize, sourceSize);
  const pixels = sourceContext.getImageData(0, 0, sourceSize, sourceSize).data;
  let minX = sourceSize, minY = sourceSize;
  for (let index = 0; index < pixels.length; index += 4) {
    if ((pixels[index] + pixels[index + 1] + pixels[index + 2]) / 3 >= 96) continue;
    const pixel = index / 4, x = pixel % sourceSize, y = Math.floor(pixel / sourceSize);
    if (x < minX) minX = x; if (y < minY) minY = y;
  }
  const cellEstimate = Math.min(minX, minY) / 4;
  const total = Math.round(sourceSize / cellEstimate), count = total - 8;
  if (!Number.isFinite(cellEstimate) || cellEstimate < 2 || count < 21 || (count - 21) % 4 !== 0) return false;
  const cell = size / total, sourceCell = sourceSize / total, quiet = cell * 4;
  context.fillStyle = background; context.fillRect(0, 0, size, size);
  const foregroundRgb = rgb(foreground);
  const accentRgb = rgb(animationAccent);
  context.fillStyle = foreground;
  for (let row = 0; row < count; row++) for (let column = 0; column < count; column++) {
    if (finderModule(column, row, count)) continue;
    const sampleX = Math.min(sourceSize - 1, Math.floor((column + 4.5) * sourceCell));
    const sampleY = Math.min(sourceSize - 1, Math.floor((row + 4.5) * sourceCell));
    const index = (sampleY * sourceSize + sampleX) * 4;
    if ((pixels[index] + pixels[index + 1] + pixels[index + 2]) / 3 >= 128) continue;
    const x = quiet + column * cell, y = quiet + row * cell;
    const strength = moduleAnimationStrength(animation, column, row, count, animationPhase);
    if (strength > 0) {
      const animatedColor = mix(foregroundRgb, accentRgb, strength);
      context.fillStyle = `rgb(${animatedColor.join(" ")})`;
    } else context.fillStyle = foreground;
    if (bodyShape === "dots") { context.beginPath(); context.arc(x + cell / 2, y + cell / 2, cell * .31, 0, Math.PI * 2); context.fill(); }
    else { const inset = bodyShape === "rounded" ? cell * .08 : cell * .035; roundedRect(context, x + inset, y + inset, cell - inset * 2, cell - inset * 2, bodyShape === "rounded" ? cell * .25 : 0); }
  }
  drawFinder(context, quiet, quiet, cell, eyeFrame, eyeBall, foreground, background);
  drawFinder(context, quiet + (count - 7) * cell, quiet, cell, eyeFrame, eyeBall, foreground, background);
  drawFinder(context, quiet, quiet + (count - 7) * cell, cell, eyeFrame, eyeBall, foreground, background);
  return true;
}

async function composeQr({ value, ecc, qrScale, logoScale, logoBackgroundOpacity, bodyShape, eyeFrame, eyeBall, foreground, background, logoForeground, logoBackground, animation = "none", animationPhase = 0, animationAccent = foreground, withBlob = true }) {
  const size = 1000;
  const qrImage = await loadImage(qrUrl(value, ecc));
  const logoImage = await loadImage(karamahLogoUrl);
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const context = canvas.getContext("2d", { willReadFrequently: true });
  context.fillStyle = background; context.fillRect(0, 0, size, size);
  const qrSize = Math.round(size * qrScale);
  const qrInset = Math.round((size - qrSize) / 2);
  const qrCanvas = document.createElement("canvas");
  qrCanvas.width = qrSize;
  qrCanvas.height = qrSize;
  const qrContext = qrCanvas.getContext("2d", { willReadFrequently: true });
  const modern = drawModernQr(qrContext, qrImage, qrSize, bodyShape, eyeFrame, eyeBall, foreground, background, animation, animationPhase, animationAccent);
  if (!modern) {
    qrContext.drawImage(qrImage, 0, 0, qrSize, qrSize);
    const fallback = qrContext.getImageData(0, 0, qrSize, qrSize), foregroundRgb = rgb(foreground), backgroundRgb = rgb(background);
    for (let index = 0; index < fallback.data.length; index += 4) { const dark = (fallback.data[index] + fallback.data[index + 1] + fallback.data[index + 2]) / 3 < 128, color = dark ? foregroundRgb : backgroundRgb; fallback.data[index] = color[0]; fallback.data[index + 1] = color[1]; fallback.data[index + 2] = color[2]; }
    qrContext.putImageData(fallback, 0, 0);
  }
  context.drawImage(qrCanvas, qrInset, qrInset);
  const base = context.getImageData(0, 0, size, size);

  const maskCanvas = document.createElement("canvas");
  maskCanvas.width = size;
  maskCanvas.height = size;
  const mask = maskCanvas.getContext("2d", { willReadFrequently: true });
  mask.fillStyle = "#ffffff";
  mask.fillRect(0, 0, size, size);
  const logoSize = Math.round(size * logoScale);
  const logoInset = Math.round((size - logoSize) / 2);
  mask.drawImage(logoImage, logoInset, logoInset, logoSize, logoSize);
  const maskData = mask.getImageData(0, 0, size, size).data;

  const foregroundRgb = rgb(foreground), backgroundRgb = rgb(background), logoForegroundRgb = rgb(logoForeground), logoBackgroundRgb = rgb(logoBackground);
  for (let index = 0; index < base.data.length; index += 4) {
    const maskDarkness = 255 - ((maskData[index] + maskData[index + 1] + maskData[index + 2]) / 3);
    if (maskDarkness < 96) continue;
    const alpha = Math.min(1, Math.max(0, maskDarkness / 255));
    const current = [base.data[index], base.data[index + 1], base.data[index + 2]];
    const qrDark = colorDistance(current, foregroundRgb) < colorDistance(current, backgroundRgb);
    const color = qrDark ? logoForegroundRgb : logoBackgroundRgb;
    const strength = alpha * logoBackgroundOpacity;
    const out = mix(current, color, strength);
    base.data[index] = out[0];
    base.data[index + 1] = out[1];
    base.data[index + 2] = out[2];
  }
  context.putImageData(base, 0, 0);
  return { canvas, blob: withBlob ? await canvasBlob(canvas) : null };
}

function encodeAnimatedGif(frames) {
  const gif = GIFEncoder();
  frames.forEach(({ canvas }, index) => {
    const context = canvas.getContext("2d", { willReadFrequently: true });
    const image = context.getImageData(0, 0, canvas.width, canvas.height);
    const palette = quantize(image.data, 64);
    const indexed = applyPalette(image.data, palette);
    gif.writeFrame(indexed, canvas.width, canvas.height, {
      palette,
      delay: ANIMATION_FRAME_DELAY,
      repeat: index === 0 ? 0 : undefined,
    });
  });
  gif.finish();
  return new Blob([gif.bytes()], { type: "image/gif" });
}

async function readQrBlob(blob) {
  const body = new FormData();
  body.set("file", blob, "karamah-qr.png");
  body.set("outputformat", "json");
  const response = await fetch(QR_READ_API, { method: "POST", body });
  if (!response.ok) throw new Error("The QR scanner service could not read this image.");
  const result = await response.json();
  const symbol = result?.[0]?.symbol?.[0];
  if (symbol?.error) throw new Error("This design could not be scanned reliably. Reduce the logo size or logo background opacity, or try Auto mode.");
  if (!symbol?.data) throw new Error("This design could not be scanned reliably. Reduce the logo size or logo background opacity, or try Auto mode.");
  return symbol.data;
}

async function invertedCanvasBlob(canvas) {
  const copy = document.createElement("canvas");
  copy.width = canvas.width;
  copy.height = canvas.height;
  const context = copy.getContext("2d", { willReadFrequently: true });
  context.drawImage(canvas, 0, 0);
  const image = context.getImageData(0, 0, copy.width, copy.height);
  for (let index = 0; index < image.data.length; index += 4) {
    image.data[index] = 255 - image.data[index];
    image.data[index + 1] = 255 - image.data[index + 1];
    image.data[index + 2] = 255 - image.data[index + 2];
  }
  context.putImageData(image, 0, 0);
  return canvasBlob(copy);
}

async function validateQr(result, expected, foreground, background) {
  try {
    const decoded = await readQrBlob(result.blob);
    if (decoded === expected) return { normalized: false };
  } catch (error) {
    if (luminance(foreground) <= luminance(background)) throw error;
  }
  if (luminance(foreground) <= luminance(background)) throw new Error("The scanner read a different value, so this QR is not safe to use.");
  const decoded = await readQrBlob(await invertedCanvasBlob(result.canvas));
  if (decoded !== expected) throw new Error("The scanner read a different value, so this QR is not safe to use.");
  return { normalized: true };
}

function normalizeUrl(value) {
  try {
    return new URL(value).toString();
  } catch {
    return "";
  }
}

function ColorChoices({ legend, palette, value, onChange, allowed = () => true, disabledReason = () => "" }) {
  return <fieldset className="qr-color-fieldset">
    <legend>{legend}</legend>
    <div className="qr-color-options">
      {Object.entries(palette).map(([id, item]) => {
        const isAllowed = allowed(id, item);
        const hint = !isAllowed ? disabledReason(id, item) : item.hex;
        return <label key={id} className={`qr-color-option${value === id ? " is-selected" : ""}${!isAllowed ? " is-disabled" : ""}`} title={hint} aria-label={`${legend}: ${item.label}${!isAllowed ? ", unavailable" : ""}`}>
          <input type="radio" name={`qr-${legend.toLowerCase().replace(/\s+/g, "-")}`} value={id} checked={value === id} disabled={!isAllowed} onChange={() => onChange(id)} />
          <i style={{ "--qr-swatch": item.hex }} aria-hidden="true" />
          <span className="sr-only">{item.label}</span>
        </label>;
      })}
    </div>
  </fieldset>;
}

function QrControlGroup({ id, title, summary, isPhone, open, onToggle, children }) {
  const contentId = `qr-control-${id}`;
  return <section className="qr-control-group" data-open={!isPhone || open}>
    <header>
      <div><strong>{title}</strong><small>{summary}</small></div>
      {isPhone && <button type="button" aria-expanded={open} aria-controls={contentId} onClick={onToggle}><span className="sr-only">{open ? "Collapse" : "Expand"} {title}</span><i aria-hidden="true" /></button>}
    </header>
    <div id={contentId} className="qr-control-group-content" hidden={isPhone && !open}>{children}</div>
  </section>;
}

export default function QrGeneratorPage() {
  const [params, setParams] = useSearchParams();
  const canvasRef = useRef(null);
  const runRef = useRef(0);
  const autoRef = useRef({ active: false, attempt: 0, maximum: 8, token: 0, animationTimer: 0, finalKey: "" });
  const [url, setUrl] = useState(() => params.get("url") || "");
  const [ecc, setEcc] = useState("H");
  const [qrSize, setQrSize] = useState(90);
  const [logoSize, setLogoSize] = useState(86);
  const [logoBackgroundOpacity, setLogoBackgroundOpacity] = useState(42);
  const [bodyShape, setBodyShape] = useState("dots");
  const [eyeFrame, setEyeFrame] = useState("rounded");
  const [eyeBall, setEyeBall] = useState("rounded");
  const [backgroundId, setBackgroundId] = useState("white");
  const [dotColorId, setDotColorId] = useState("green");
  const [animationId, setAnimationId] = useState("none");
  const [status, setStatus] = useState({ state: "idle", message: "Enter a public URL to render a scan-tested QR." });
  const [downloadUrl, setDownloadUrl] = useState("");
  const [downloadType, setDownloadType] = useState("png");
  const [autoActive, setAutoActive] = useState(false);
  const [isPhone, setIsPhone] = useState(() => window.matchMedia("(max-width: 520px)").matches);
  const [openGroups, setOpenGroups] = useState({ size: false, structure: false, animation: false, palette: false });
  const [previewExpanded, setPreviewExpanded] = useState(false);
  const title = params.get("title") || "";
  const source = params.get("source") || "";
  const safeUrl = useMemo(() => normalizeUrl(url), [url]);
  const background = QR_BACKGROUNDS[backgroundId];
  const effectiveQrColors = backgroundId === "blue" ? QR_DARK_COLORS : QR_COLORS;
  const allowedColorIds = useMemo(() => Object.keys(effectiveQrColors).filter(id => contrastRatio(effectiveQrColors[id].hex, background.hex) >= 4.5), [background.hex, effectiveQrColors]);
  const dotColor = effectiveQrColors[dotColorId];
  const dotContrast = contrastRatio(dotColor.hex, background.hex);
  const animationAccent = useMemo(() => allowedColorIds
    .filter(id => id !== dotColorId)
    .map(id => effectiveQrColors[id])
    .sort((first, second) => colorDistance(rgb(second.hex), rgb(dotColor.hex)) - colorDistance(rgb(first.hex), rgb(dotColor.hex)))[0]?.hex || dotColor.hex,
  [allowedColorIds, dotColor.hex, dotColorId, effectiveQrColors]);
  const resolvedAnimation = resolveAnimation(animationId, bodyShape);
  const overlapPalette = backgroundId === "blue" ? QR_COLORS : QR_DARK_COLORS;
  const logoOverlapColor = useMemo(() => Object.entries(overlapPalette)
    .filter(([id]) => id !== dotColorId)
    .sort((first, second) => contrastRatio(second[1].hex, dotColor.hex) - contrastRatio(first[1].hex, dotColor.hex))[0][1].hex, [dotColor.hex, dotColorId, overlapPalette]);
  const designKey = [ecc, qrSize, logoSize, logoBackgroundOpacity, bodyShape, eyeFrame, eyeBall, backgroundId, dotColorId, animationId].join(":");

  useEffect(() => {
    const fallback = allowedColorIds[0];
    if (!allowedColorIds.includes(dotColorId)) setDotColorId(fallback);
  }, [allowedColorIds, dotColorId]);

  useEffect(() => {
    const media = window.matchMedia("(max-width: 520px)");
    const update = event => {
      setIsPhone(event.matches);
      if (!event.matches) setPreviewExpanded(false);
    };
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);

  function toggleGroup(id) {
    setOpenGroups(current => ({ ...current, [id]: !current[id] }));
  }

  useEffect(() => {
    if (autoRef.current.active || autoRef.current.finalKey === designKey) return undefined;
    const runId = runRef.current + 1;
    runRef.current = runId;
    let validationTimer;
    setDownloadUrl("");
    setDownloadType(animationId === "none" ? "png" : "gif");

    if (!url.trim()) {
      const preview = canvasRef.current;
      if (preview) preview.getContext("2d").clearRect(0, 0, preview.width, preview.height);
      setStatus({ state: "idle", message: "Enter a public URL to render a scan-tested QR." });
      return undefined;
    }

    if (!safeUrl) {
      setStatus({ state: "error", message: "Enter a complete public URL first." });
      return undefined;
    }

    setStatus({ state: "checking", message: "Updating preview..." });
    const renderTimer = window.setTimeout(async () => {
      try {
        const result = await composeQr({
          value: safeUrl,
          ecc,
          qrScale: qrSize / 100,
          logoScale: logoSize / 100,
          logoBackgroundOpacity: logoBackgroundOpacity / 100,
          bodyShape,
          eyeFrame,
          eyeBall,
          foreground: dotColor.hex,
          background: background.hex,
          logoForeground: logoOverlapColor,
          logoBackground: LOGO_GOLD,
          animation: resolvedAnimation,
          animationAccent,
        });
        if (runRef.current !== runId) return;
        const currentPreview = canvasRef.current;
        currentPreview.width = result.canvas.width;
        currentPreview.height = result.canvas.height;
        currentPreview.getContext("2d").drawImage(result.canvas, 0, 0);
        setStatus({ state: "checking", message: "Preview updated. Checking scan reliability..." });

        validationTimer = window.setTimeout(async () => {
          try {
            if (animationId !== "none") {
              const frames = [];
              for (let frameIndex = 0; frameIndex < ANIMATION_FRAME_COUNT; frameIndex += 1) {
                if (runRef.current !== runId) return;
                setStatus({ state: "checking", message: `Scan-testing animation frame ${frameIndex + 1} of ${ANIMATION_FRAME_COUNT}...` });
                const frame = await composeQr({
                  value: safeUrl,
                  ecc,
                  qrScale: qrSize / 100,
                  logoScale: logoSize / 100,
                  logoBackgroundOpacity: logoBackgroundOpacity / 100,
                  bodyShape,
                  eyeFrame,
                  eyeBall,
                  foreground: dotColor.hex,
                  background: background.hex,
                  logoForeground: logoOverlapColor,
                  logoBackground: LOGO_GOLD,
                  animation: resolvedAnimation,
                  animationPhase: frameIndex / ANIMATION_FRAME_COUNT,
                  animationAccent,
                });
                await validateQr(frame, safeUrl, dotColor.hex, background.hex);
                frames.push(frame);
              }
              if (runRef.current !== runId) return;
              const animatedBlob = encodeAnimatedGif(frames);
              setDownloadUrl(URL.createObjectURL(animatedBlob));
              setDownloadType("gif");
              setStatus({ state: "ok", message: `All ${ANIMATION_FRAME_COUNT} animation frames passed the scanner check. Animated GIF ready.` });
            } else {
              const validation = await validateQr(result, safeUrl, dotColor.hex, background.hex);
              if (runRef.current !== runId) return;
              setDownloadUrl(URL.createObjectURL(result.blob));
              setDownloadType("png");
              setStatus({ state: "ok", message: validation.normalized ? "Dark QR structure passed the scanner check. Ready to download." : "Scanner read the QR correctly. This version is ready to download." });
            }
            if (runRef.current !== runId) return;
            const currentQuery = new URLSearchParams(window.location.search);
            if (currentQuery.get("url") !== safeUrl) {
              currentQuery.set("url", safeUrl);
              if (title) currentQuery.set("title", title);
              if (source) currentQuery.set("source", source);
              setParams(currentQuery, { replace: true });
            }
          } catch (error) {
            if (runRef.current !== runId) return;
            setStatus({ state: "error", message: error.message || "This QR did not pass the scanner check." });
          }
        }, 320);
      } catch (error) {
        if (runRef.current !== runId) return;
        setStatus({ state: "error", message: error.message || "This QR did not pass the scanner check." });
      }
    }, 35);

    return () => {
      window.clearTimeout(renderTimer);
      window.clearTimeout(validationTimer);
      if (runRef.current === runId) runRef.current += 1;
    };
  }, [url, safeUrl, ecc, qrSize, logoSize, logoBackgroundOpacity, bodyShape, eyeFrame, eyeBall, dotColorId, dotColor.hex, logoOverlapColor, background.hex, designKey, animationId, resolvedAnimation, animationAccent, setParams, source, title]);

  useEffect(() => () => { if (downloadUrl) URL.revokeObjectURL(downloadUrl); }, [downloadUrl]);
  useEffect(() => () => {
    autoRef.current.active = false;
    autoRef.current.token += 1;
    window.clearTimeout(autoRef.current.animationTimer);
  }, []);

  function download() {
    if (!downloadUrl) return;
    const link = document.createElement("a");
    link.href = downloadUrl;
    link.download = `karamah-qr.${downloadType}`;
    link.click();
  }

  function cancelAuto() {
    autoRef.current.finalKey = "";
    if (!autoRef.current.active) return;
    autoRef.current.active = false;
    autoRef.current.token += 1;
    window.clearTimeout(autoRef.current.animationTimer);
    runRef.current += 1;
    setAutoActive(false);
  }

  function createRandomDesign(attempt = 1, showcase = false) {
    const nextBackgroundId = randomItem(Object.keys(QR_BACKGROUNDS));
    const nextBackground = QR_BACKGROUNDS[nextBackgroundId];
    const nextPalette = nextBackgroundId === "blue" ? QR_DARK_COLORS : QR_COLORS;
    const validDots = Object.keys(nextPalette).filter(id => contrastRatio(nextPalette[id].hex, nextBackground.hex) >= 4.5);
    const fallbackPass = !showcase && attempt > 5;
    return {
      backgroundId: nextBackgroundId,
      dotColorId: randomItem(validDots),
      bodyShape: randomItem(Object.keys(BODY_SHAPES)),
      eyeFrame: randomItem(Object.keys(EYE_SHAPES)),
      eyeBall: randomItem(Object.keys(EYE_SHAPES)),
      ecc: showcase ? randomItem(["L", "M", "Q", "H"]) : randomItem(["Q", "H", "H", "H"]),
      qrSize: showcase ? randomStep(70, 100) : fallbackPass ? randomStep(84, 96) : randomStep(78, 92),
      logoSize: showcase ? randomStep(58, 98) : fallbackPass ? randomStep(80, 90) : randomStep(84, 96),
      logoBackgroundOpacity: showcase ? randomStep(12, 76, 4) : fallbackPass ? randomStep(38, 58, 4) : randomStep(46, 70, 4),
    };
  }

  function resolveDesign(nextDesign) {
    const nextBackground = QR_BACKGROUNDS[nextDesign.backgroundId];
    const nextPalette = nextDesign.backgroundId === "blue" ? QR_DARK_COLORS : QR_COLORS;
    const nextDotColor = nextPalette[nextDesign.dotColorId];
    const nextOverlapPalette = nextDesign.backgroundId === "blue" ? QR_COLORS : QR_DARK_COLORS;
    const nextLogoOverlap = Object.entries(nextOverlapPalette)
      .filter(([id]) => id !== nextDesign.dotColorId)
      .sort((first, second) => contrastRatio(second[1].hex, nextDotColor.hex) - contrastRatio(first[1].hex, nextDotColor.hex))[0][1].hex;
    return { background: nextBackground, dotColor: nextDotColor, logoOverlap: nextLogoOverlap };
  }

  async function composeDesign(nextDesign, withBlob = true) {
    const resolved = resolveDesign(nextDesign);
    const result = await composeQr({
      value: safeUrl,
      ecc: nextDesign.ecc,
      qrScale: nextDesign.qrSize / 100,
      logoScale: nextDesign.logoSize / 100,
      logoBackgroundOpacity: nextDesign.logoBackgroundOpacity / 100,
      bodyShape: nextDesign.bodyShape,
      eyeFrame: nextDesign.eyeFrame,
      eyeBall: nextDesign.eyeBall,
      foreground: resolved.dotColor.hex,
      background: resolved.background.hex,
      logoForeground: resolved.logoOverlap,
      logoBackground: LOGO_GOLD,
      withBlob,
    });
    return { ...result, resolved };
  }

  function drawPreview(canvas) {
    const preview = canvasRef.current;
    if (!preview) return;
    preview.width = canvas.width;
    preview.height = canvas.height;
    preview.getContext("2d").drawImage(canvas, 0, 0);
  }

  function applyDesign(nextDesign) {
    setBackgroundId(nextDesign.backgroundId);
    setDotColorId(nextDesign.dotColorId);
    setBodyShape(nextDesign.bodyShape);
    setEyeFrame(nextDesign.eyeFrame);
    setEyeBall(nextDesign.eyeBall);
    setEcc(nextDesign.ecc);
    setQrSize(nextDesign.qrSize);
    setLogoSize(nextDesign.logoSize);
    setLogoBackgroundOpacity(nextDesign.logoBackgroundOpacity);
  }

  async function animateAuto(token) {
    if (!autoRef.current.active || autoRef.current.token !== token) return;
    try {
      const frame = await composeDesign(createRandomDesign(1, true), false);
      if (!autoRef.current.active || autoRef.current.token !== token) return;
      drawPreview(frame.canvas);
    } catch {
      // The checked candidate loop owns failures; decorative frames can simply skip.
    }
    if (!autoRef.current.active || autoRef.current.token !== token) return;
    autoRef.current.animationTimer = window.setTimeout(() => animateAuto(token), 200);
  }

  async function findAutoDesign(token) {
    let lastError;
    for (let attempt = 1; attempt <= autoRef.current.maximum; attempt += 1) {
      if (!autoRef.current.active || autoRef.current.token !== token) return;
      autoRef.current.attempt = attempt;
      setStatus({ state: "checking", message: `Checking automatic design ${attempt} of ${autoRef.current.maximum}...` });
      const candidate = createRandomDesign(attempt, false);
      try {
        const result = await composeDesign(candidate, true);
        const validation = await validateQr(result, safeUrl, result.resolved.dotColor.hex, result.resolved.background.hex);
        if (!autoRef.current.active || autoRef.current.token !== token) return;
        autoRef.current.active = false;
        window.clearTimeout(autoRef.current.animationTimer);
        const finalKey = [candidate.ecc, candidate.qrSize, candidate.logoSize, candidate.logoBackgroundOpacity, candidate.bodyShape, candidate.eyeFrame, candidate.eyeBall, candidate.backgroundId, candidate.dotColorId].join(":");
        autoRef.current.finalKey = finalKey;
        applyDesign(candidate);
        drawPreview(result.canvas);
        setDownloadUrl(URL.createObjectURL(result.blob));
        setAutoActive(false);
        setStatus({ state: "ok", message: validation.normalized ? "Auto mode found a scannable dark design. Ready to download." : "Auto mode found a scannable design. Ready to download." });
        const currentQuery = new URLSearchParams(window.location.search);
        if (currentQuery.get("url") !== safeUrl) {
          currentQuery.set("url", safeUrl);
          if (title) currentQuery.set("title", title);
          if (source) currentQuery.set("source", source);
          setParams(currentQuery, { replace: true });
        }
        return;
      } catch (error) {
        lastError = error;
      }
    }
    if (!autoRef.current.active || autoRef.current.token !== token) return;
    autoRef.current.active = false;
    window.clearTimeout(autoRef.current.animationTimer);
    setAutoActive(false);
    setStatus({ state: "error", message: lastError?.message || "Auto mode could not find a scannable design. Try again." });
  }

  function startAuto() {
    if (!safeUrl) {
      setStatus({ state: "error", message: "Enter a complete public URL before using Auto mode." });
      return;
    }
    runRef.current += 1;
    const token = autoRef.current.token + 1;
    autoRef.current = { active: true, attempt: 1, maximum: 8, token, animationTimer: 0, finalKey: "" };
    setAutoActive(true);
    setDownloadUrl("");
    setStatus({ state: "checking", message: `Checking automatic design 1 of ${autoRef.current.maximum}...` });
    animateAuto(token);
    findAutoDesign(token);
  }

  return <div className="pp-page qr-generator-page">
    {source === "form" && <PageHeaderActions><a className="pp-btn" href="/forms">Back to forms</a></PageHeaderActions>}
    <section className="qr-generator-layout">
      <div className="qr-controls">
        {title && <div className="qr-source-note"><Icons.forms size={18} /><span><strong>{title}</strong><small>Loaded from Forms sharing</small></span></div>}
        <label>Destination URL<input type="url" required value={url} onChange={event => { cancelAuto(); setUrl(event.target.value); }} placeholder="https://..." /></label>
        <section className="qr-appearance-panel" aria-labelledby="qr-appearance-title">
          <div className="qr-appearance-heading"><div><strong id="qr-appearance-title">Customize</strong><small>Open only what you want to change.</small></div><span>{dotContrast.toFixed(1)}:1</span></div>
          <div className="qr-auto-row"><div><strong>Auto mode</strong><small>Prioritizes a visible logo, then keeps trying until the design scans.</small></div><button className="pp-btn" type="button" onClick={startAuto} disabled={autoActive}>{autoActive ? "Finding design…" : "Auto design"}</button></div>
          <div className="qr-control-groups">
            <QrControlGroup id="size" title="Size & logo" summary={`${qrSize}% QR · ${logoSize}% logo`} isPhone={isPhone} open={openGroups.size} onToggle={() => toggleGroup("size")}>
              <div className="qr-size-controls">
                <label><span>QR size <output>{qrSize}%</output></span><input type="range" min="70" max="100" step="2" value={qrSize} onChange={event => { cancelAuto(); setQrSize(Number(event.target.value)); }} /></label>
                <label><span>Logo size <output>{logoSize}%</output></span><input type="range" min="58" max="98" step="2" value={logoSize} onChange={event => { cancelAuto(); setLogoSize(Number(event.target.value)); }} /></label>
                <label className="qr-opacity-control"><span>Logo background <output>{logoBackgroundOpacity}%</output></span><input type="range" min="0" max="80" step="2" value={logoBackgroundOpacity} onChange={event => { cancelAuto(); setLogoBackgroundOpacity(Number(event.target.value)); }} /></label>
              </div>
            </QrControlGroup>
            <QrControlGroup id="structure" title="Structure" summary={`${BODY_SHAPES[bodyShape]} body · ${ecc} correction`} isPhone={isPhone} open={openGroups.structure} onToggle={() => toggleGroup("structure")}>
              <div className="qr-appearance-grid">
                <label>Error correction<select value={ecc} onChange={event => { cancelAuto(); setEcc(event.target.value); }}><option value="L">L · most compact</option><option value="M">M · balanced</option><option value="Q">Q · resilient</option><option value="H">H · most resilient</option></select></label>
                <label>Body<select value={bodyShape} onChange={event => { cancelAuto(); setBodyShape(event.target.value); }}>{Object.entries(BODY_SHAPES).map(([id, label]) => <option key={id} value={id}>{label}</option>)}</select></label>
                <label>Eye frame<select value={eyeFrame} onChange={event => { cancelAuto(); setEyeFrame(event.target.value); }}>{Object.entries(EYE_SHAPES).map(([id, label]) => <option key={id} value={id}>{label}</option>)}</select></label>
                <label>Eye center<select value={eyeBall} onChange={event => { cancelAuto(); setEyeBall(event.target.value); }}>{Object.entries(EYE_SHAPES).map(([id, label]) => <option key={id} value={id}>{label}</option>)}</select></label>
              </div>
            </QrControlGroup>
            <QrControlGroup id="animation" title="Motion" summary={QR_ANIMATIONS[animationId].label} isPhone={isPhone} open={openGroups.animation} onToggle={() => toggleGroup("animation")}>
              <fieldset className="qr-animation-fieldset">
                <legend className="sr-only">Animation</legend>
                <div className="qr-animation-options">
                  {Object.entries(QR_ANIMATIONS).map(([id, item]) => <label key={id} className={animationId === id ? "is-selected" : ""}>
                    <input type="radio" name="qr-animation" value={id} checked={animationId === id} onChange={() => { cancelAuto(); setAnimationId(id); }} />
                    <i className="qr-motion-mark" aria-hidden="true"><b /><b /><b /></i>
                    <span><strong>{item.label}</strong></span>
                  </label>)}
                </div>
                <p className="qr-animation-description"><strong>{QR_ANIMATIONS[animationId].label}</strong> · {QR_ANIMATIONS[animationId].description} QR modules and finder eyes stay fixed.</p>
              </fieldset>
            </QrControlGroup>
            <QrControlGroup id="palette" title="Palette" summary={`${background.label} · ${dotColor.label}`} isPhone={isPhone} open={openGroups.palette} onToggle={() => toggleGroup("palette")}>
              <section className="qr-color-controls" aria-label="Palette">
                <div className="qr-color-grid">
                  <ColorChoices legend="Background" palette={QR_BACKGROUNDS} value={backgroundId} onChange={id => { cancelAuto(); setBackgroundId(id); }} />
                  <ColorChoices legend="QR dots" palette={effectiveQrColors} value={dotColorId} onChange={id => { cancelAuto(); setDotColorId(id); }} allowed={id => allowedColorIds.includes(id)} disabledReason={(id, item) => `${contrastRatio(item.hex, background.hex).toFixed(1)}:1 contrast; 4.5:1 is required.`} />
                </div>
                <p>Unavailable swatches do not meet the required contrast.</p>
              </section>
            </QrControlGroup>
          </div>
        </section>
        <div className={`qr-status is-${status.state}`} role="status"><Icons.qr size={18} /><span>{status.message}</span></div>
        <div className="qr-actions"><button className="pp-btn pp-btn-primary" type="button" onClick={download} disabled={!downloadUrl}>Download {downloadType.toUpperCase()}</button></div>
      </div>
      <aside className={`qr-preview-panel${previewExpanded ? " is-expanded" : ""}`}>
        <div className="qr-preview-frame">
          <canvas ref={canvasRef} width="1000" height="1000" aria-label="Generated QR preview" hidden={downloadType === "gif" && Boolean(downloadUrl)} />
          {downloadType === "gif" && downloadUrl && <img src={downloadUrl} alt="Animated QR preview" />}
        </div>
        <div className="qr-preview-copy"><strong>Live preview</strong><small>{status.state === "ok" ? "Scan-tested and ready" : status.state === "checking" ? "Updating…" : "Changes appear here"}</small></div>
        <button className="qr-preview-toggle" type="button" aria-expanded={previewExpanded} onClick={() => setPreviewExpanded(current => !current)}>{previewExpanded ? "Minimize" : "Enlarge"}</button>
      </aside>
    </section>
  </div>;
}
