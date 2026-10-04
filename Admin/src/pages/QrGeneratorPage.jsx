import { useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Icons } from "../icons.jsx";
import karamahLogoUrl from "../../../without a dot .svg";

const QR_API = "https://api.qrserver.com/v1/create-qr-code/";
const QR_READ_API = "https://api.qrserver.com/v1/read-qr-code/";
const BRAND_GREEN = [23, 77, 61];
const BRAND_GOLD = [226, 184, 91];
const WHITE = [255, 255, 255];

const STYLE_PRESETS = {
  safe: { label: "Safe", logoScale: 0.78, goldOpacity: 0.38, green: [43, 116, 92], protectFinders: true },
  high: { label: "High contrast", logoScale: 0.9, goldOpacity: 0.64, green: BRAND_GREEN, protectFinders: true },
  bold: { label: "Extreme test", logoScale: 0.94, goldOpacity: 0.76, green: BRAND_GREEN, protectFinders: true },
};

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
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.crossOrigin = "anonymous";
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("The QR artwork could not be loaded."));
    image.src = source;
  });
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

function isFinderPixel(x, y, size) {
  const guard = Math.round(size * 0.255);
  return (x < guard && y < guard) || (x > size - guard && y < guard) || (x < guard && y > size - guard);
}

async function composeQr({ value, ecc, presetId }) {
  const preset = STYLE_PRESETS[presetId] || STYLE_PRESETS.high;
  const size = 1000;
  const qrImage = await loadImage(qrUrl(value, ecc));
  const logoImage = await loadImage(karamahLogoUrl);
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const context = canvas.getContext("2d", { willReadFrequently: true });
  context.fillStyle = "#ffffff";
  context.fillRect(0, 0, size, size);
  context.drawImage(qrImage, 0, 0, size, size);
  const base = context.getImageData(0, 0, size, size);

  const maskCanvas = document.createElement("canvas");
  maskCanvas.width = size;
  maskCanvas.height = size;
  const mask = maskCanvas.getContext("2d", { willReadFrequently: true });
  mask.fillStyle = "#ffffff";
  mask.fillRect(0, 0, size, size);
  const logoSize = Math.round(size * preset.logoScale);
  const logoInset = Math.round((size - logoSize) / 2);
  mask.drawImage(logoImage, logoInset, logoInset, logoSize, logoSize);
  const maskData = mask.getImageData(0, 0, size, size).data;

  for (let index = 0; index < base.data.length; index += 4) {
    const pixel = index / 4;
    const x = pixel % size;
    const y = Math.floor(pixel / size);
    if (preset.protectFinders && isFinderPixel(x, y, size)) continue;
    const maskDarkness = 255 - ((maskData[index] + maskData[index + 1] + maskData[index + 2]) / 3);
    if (maskDarkness < 96) continue;
    const alpha = Math.min(1, Math.max(0, maskDarkness / 255));
    const qrDark = ((base.data[index] + base.data[index + 1] + base.data[index + 2]) / 3) < 128;
    const color = qrDark ? preset.green : mix(WHITE, BRAND_GOLD, preset.goldOpacity);
    const strength = qrDark ? alpha : alpha * 0.88;
    const current = [base.data[index], base.data[index + 1], base.data[index + 2]];
    const out = mix(current, color, strength);
    base.data[index] = out[0];
    base.data[index + 1] = out[1];
    base.data[index + 2] = out[2];
  }
  context.putImageData(base, 0, 0);
  return { canvas, blob: await canvasBlob(canvas) };
}

async function readQrBlob(blob) {
  const body = new FormData();
  body.set("file", blob, "karamah-qr.png");
  body.set("outputformat", "json");
  const response = await fetch(QR_READ_API, { method: "POST", body });
  if (!response.ok) throw new Error("The QR scanner service could not read this image.");
  const result = await response.json();
  const symbol = result?.[0]?.symbol?.[0];
  if (symbol?.error) throw new Error(symbol.error);
  return symbol?.data || "";
}

function normalizeUrl(value) {
  try {
    return new URL(value).toString();
  } catch {
    return "";
  }
}

export default function QrGeneratorPage() {
  const [params, setParams] = useSearchParams();
  const canvasRef = useRef(null);
  const runRef = useRef(0);
  const [url, setUrl] = useState(() => params.get("url") || "");
  const [ecc, setEcc] = useState("H");
  const [preset, setPreset] = useState("high");
  const [status, setStatus] = useState({ state: "idle", message: "Enter a public URL to render a scan-tested QR." });
  const [downloadUrl, setDownloadUrl] = useState("");
  const title = params.get("title") || "";
  const source = params.get("source") || "";
  const safeUrl = useMemo(() => normalizeUrl(url), [url]);

  useEffect(() => {
    const runId = runRef.current + 1;
    runRef.current = runId;
    const preview = canvasRef.current;
    if (preview) preview.getContext("2d").clearRect(0, 0, preview.width, preview.height);
    setDownloadUrl("");

    if (!url.trim()) {
      setStatus({ state: "idle", message: "Enter a public URL to render a scan-tested QR." });
      return undefined;
    }

    if (!safeUrl) {
      setStatus({ state: "error", message: "Enter a complete public URL first." });
      return undefined;
    }

    setStatus({ state: "checking", message: "Rendering and asking the scanner to read it back..." });
    const timer = window.setTimeout(async () => {
      try {
        const result = await composeQr({ value: safeUrl, ecc, presetId: preset });
        const decoded = await readQrBlob(result.blob);
        if (runRef.current !== runId) return;
        if (decoded !== safeUrl) throw new Error("The scanner read a different value, so this QR is not safe to use.");
        const currentPreview = canvasRef.current;
        currentPreview.width = result.canvas.width;
        currentPreview.height = result.canvas.height;
        currentPreview.getContext("2d").drawImage(result.canvas, 0, 0);
        setDownloadUrl(URL.createObjectURL(result.blob));
        setStatus({ state: "ok", message: "Scanner read the QR correctly. This version is ready to download." });
        const next = new URLSearchParams(window.location.search);
        next.set("url", safeUrl);
        if (title) next.set("title", title);
        if (source) next.set("source", source);
        setParams(next, { replace: true });
      } catch (error) {
        if (runRef.current !== runId) return;
        const currentPreview = canvasRef.current;
        if (currentPreview) currentPreview.getContext("2d").clearRect(0, 0, currentPreview.width, currentPreview.height);
        setStatus({ state: "error", message: error.message || "This QR did not pass the scanner check." });
      }
    }, 450);

    return () => {
      window.clearTimeout(timer);
      if (runRef.current === runId) runRef.current += 1;
    };
  }, [url, safeUrl, ecc, preset, setParams, source, title]);

  useEffect(() => () => { if (downloadUrl) URL.revokeObjectURL(downloadUrl); }, [downloadUrl]);

  function download() {
    if (!downloadUrl) return;
    const link = document.createElement("a");
    link.href = downloadUrl;
    link.download = "karamah-qr.png";
    link.click();
  }

  return <div className="pp-page qr-generator-page">
    <header className="qr-page-head">
      <div><span className="eyebrow">SHARED QR TOOL</span><h1 className="pp-page-title">QR generator</h1><p className="pp-page-lead">Create Karamah-styled QR artwork for forms, link hub items, campaigns, or any trusted public URL.</p></div>
      {source === "form" && <a className="pp-btn" href="/forms">Back to forms</a>}
    </header>
    <section className="qr-generator-layout">
      <div className="qr-controls">
        {title && <div className="qr-source-note"><Icons.forms size={18} /><span><strong>{title}</strong><small>Loaded from Forms sharing</small></span></div>}
        <label>Destination URL<input type="url" required value={url} onChange={event => setUrl(event.target.value)} placeholder="https://..." /></label>
        <div className="qr-control-grid">
          <label>Error correction<select value={ecc} onChange={event => setEcc(event.target.value)}><option value="H">H, safest</option><option value="Q">Q</option><option value="M">M</option></select></label>
          <label>Visibility preset<select value={preset} onChange={event => setPreset(event.target.value)}>{Object.entries(STYLE_PRESETS).map(([id, item]) => <option key={id} value={id}>{item.label}</option>)}</select></label>
        </div>
        <div className={`qr-status is-${status.state}`} role="status"><Icons.qr size={18} /><span>{status.message}</span></div>
        <div className="qr-actions"><button className="pp-btn pp-btn-primary" type="button" onClick={download} disabled={!downloadUrl}>Download PNG</button></div>
      </div>
      <aside className="qr-preview-panel">
        <div className="qr-preview-frame"><canvas ref={canvasRef} width="1000" height="1000" aria-label="Generated QR preview" /></div>
        <p>Downloads are disabled until the rendered PNG is decoded by the scanner check.</p>
      </aside>
    </section>
  </div>;
}
