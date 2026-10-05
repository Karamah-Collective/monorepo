import { useState } from "react";

const ASPECT = 16 / 9;
const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

function defaultCrop(size) {
  const ratio = ASPECT / ((size.width && size.height) ? size.width / size.height : ASPECT);
  let w = 88, h = w / ratio;
  if (h > 88) { h = 88; w = h * ratio; }
  return { x: (100 - w) / 2, y: (100 - h) / 2, w, h };
}
function normalize(rect, size) {
  const ratio = ASPECT / ((size.width && size.height) ? size.width / size.height : ASPECT);
  let w = clamp(Number(rect.w) || 80, 16, 100), h = w / ratio;
  if (h > 100) { h = 100; w = h * ratio; }
  if (h < 16) { h = 16; w = h * ratio; }
  return { x: clamp(Number(rect.x) || 0, 0, 100 - w), y: clamp(Number(rect.y) || 0, 0, 100 - h), w, h };
}
function parse(value, size) {
  const values = String(value || "").split(",").map(Number);
  return values.length >= 4 && values.every(Number.isFinite)
    ? normalize({ x: values[0], y: values[1], w: values[2], h: values[3] }, size)
    : defaultCrop(size);
}
const stringify = crop => [crop.x, crop.y, crop.w, crop.h].map(value => Math.round(value * 10) / 10).join(",");

/** The same crop rectangle format used by Website ticket images. */
export default function CoverCropEditor({ src, cropValue, onChange }) {
  const [size, setSize] = useState({ width: 16, height: 9 });
  const crop = parse(cropValue, size);
  const update = next => onChange(stringify(normalize(next, size)));
  const pointer = (event, stage) => {
    const rect = stage.getBoundingClientRect();
    return { x: clamp((event.clientX - rect.left) / rect.width * 100, 0, 100), y: clamp((event.clientY - rect.top) / rect.height * 100, 0, 100) };
  };
  const move = event => {
    event.preventDefault();
    const stage = event.currentTarget.closest(".website-image-cropper"), start = crop, from = pointer(event, stage);
    const onMove = next => { const at = pointer(next, stage); update({ ...start, x: start.x + at.x - from.x, y: start.y + at.y - from.y }); };
    const stop = () => { window.removeEventListener("pointermove", onMove); window.removeEventListener("pointerup", stop); };
    window.addEventListener("pointermove", onMove); window.addEventListener("pointerup", stop, { once: true });
  };
  const resize = (corner, event) => {
    event.preventDefault(); event.stopPropagation();
    const stage = event.currentTarget.closest(".website-image-cropper");
    const anchor = { x: corner.includes("w") ? crop.x + crop.w : crop.x, y: corner.includes("n") ? crop.y + crop.h : crop.y };
    const ratio = ASPECT / (size.width / size.height);
    const onMove = next => {
      const at = pointer(next, stage); let w = Math.max(16, Math.max(Math.abs(at.x - anchor.x), Math.abs(at.y - anchor.y) * ratio)), h = w / ratio;
      const maxW = corner.includes("w") ? anchor.x : 100 - anchor.x, maxH = corner.includes("n") ? anchor.y : 100 - anchor.y;
      if (w > maxW || h > maxH) { w = Math.min(w, maxW); h = w / ratio; if (h > maxH) { h = maxH; w = h * ratio; } }
      update({ x: corner.includes("w") ? anchor.x - w : anchor.x, y: corner.includes("n") ? anchor.y - h : anchor.y, w, h });
    };
    const stop = () => { window.removeEventListener("pointermove", onMove); window.removeEventListener("pointerup", stop); };
    window.addEventListener("pointermove", onMove); window.addEventListener("pointerup", stop, { once: true });
  };
  return <div className="website-image-cropper forms-cover-cropper" style={{ aspectRatio: `${size.width || 16} / ${size.height || 9}` }}>
    <img src={src} alt="" draggable="false" onLoad={event => { const next = { width: event.currentTarget.naturalWidth || 16, height: event.currentTarget.naturalHeight || 9 }; setSize(next); if (!String(cropValue || "").split(",")[2]) onChange(stringify(defaultCrop(next))); }} />
    <div className="website-crop-mask" aria-hidden="true"><span style={{ left: 0, top: 0, width: `${crop.x}%`, height: "100%" }} /><span style={{ left: `${crop.x + crop.w}%`, top: 0, width: `${100 - crop.x - crop.w}%`, height: "100%" }} /><span style={{ left: `${crop.x}%`, top: 0, width: `${crop.w}%`, height: `${crop.y}%` }} /><span style={{ left: `${crop.x}%`, top: `${crop.y + crop.h}%`, width: `${crop.w}%`, height: `${100 - crop.y - crop.h}%` }} /></div>
    <button type="button" className="website-crop-box" style={{ left: `${crop.x}%`, top: `${crop.y}%`, width: `${crop.w}%`, height: `${crop.h}%` }} onPointerDown={move} aria-label="Move crop area"><span className="website-crop-grid" aria-hidden="true" />{["nw", "ne", "sw", "se"].map(corner => <span key={corner} className={`website-crop-handle is-${corner}`} onPointerDown={event => resize(corner, event)} aria-hidden="true" />)}</button>
  </div>;
}
