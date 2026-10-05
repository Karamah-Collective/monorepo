import { LoadingState } from "../components/QueryState.jsx";
import { useMemo, useState } from "react";
import { TYPE_STYLE_CATEGORY_LABELS } from "../constants.js";
import { useAdminTypeStyles, useUpdateTypeStyle } from "../api/queries.js";
import { useToast } from "../components/Toast.jsx";
import { BUILT_IN_TYPE_ICONS, TypeIconPreview } from "../type-icons.jsx";

const DEFAULT_COLORS = {
  restaurant_restaurant_type: "#FF6319",
  service_service_type: "#8C4799",
  space_space_type: "#00B9E4",
};

function isCustomIcon(icon) {
  return String(icon || "").startsWith("data:image/");
}

function TypeStyleRow({ item, saving, onSave }) {
  const [open, setOpen] = useState(false);
  const color = item.color || DEFAULT_COLORS[item.category] || "#0d8a70";
  const icon = item.icon || "pin";

  const handleBuiltInIcon = (key) => {
    onSave({ ...item, icon: key, color });
  };

  const handleColor = (nextColor) => {
    onSave({ ...item, icon, color: nextColor });
  };

  const handleUpload = (file) => {
    if (!file) return;
    if (
      !/^image\/(svg\+xml|png|webp|jpeg|gif|avif|bmp|x-icon|vnd\.microsoft\.icon)$/.test(
        file.type,
      )
    ) {
      window.alert("Use SVG, PNG, WebP, JPEG, GIF, AVIF, BMP, or ICO.");
      return;
    }
    if (file.size > 48000) {
      window.alert("Please use an icon under 48 KB.");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      onSave({ ...item, icon: String(reader.result || ""), color });
    };
    reader.readAsDataURL(file);
  };

  return (
    <article className={`pp-type-style-card${open ? " open" : ""}`}>
      <button
        className="pp-type-style-summary"
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
      >
        <TypeIconPreview iconKeyOrDataUrl={icon} color={color} size={19} />
        <div className="pp-type-style-title">
          <h2>{item.label}</h2>
          <p>
            {isCustomIcon(icon)
              ? "Custom icon"
              : BUILT_IN_TYPE_ICONS.find((option) => option.key === icon)
                  ?.label || "Built-in icon"}
          </p>
        </div>
        <span
          className="pp-type-style-color-dot"
          style={{ backgroundColor: color }}
        />
        <span className="pp-type-style-edit">{open ? "Done" : "Edit"}</span>
      </button>

      <div className="pp-type-style-editor-shell" data-open={open ? "true" : "false"} aria-hidden={!open} inert={!open ? "" : undefined}>
        <div className="pp-type-style-editor">
          <div className="pp-type-style-preview-pane">
            <TypeIconPreview iconKeyOrDataUrl={icon} color={color} size={24} />
            <div>
              <strong>{item.label}</strong>
              <span>{TYPE_STYLE_CATEGORY_LABELS[item.category]}</span>
            </div>
            <label className="pp-type-style-color">
              <span>Background</span>
              <input
                id={`color-${item.category}-${item.tagId}`}
                type="color"
                value={color}
                disabled={saving}
                onChange={(event) => handleColor(event.target.value)}
              />
            </label>
          </div>

          <div
            className="pp-type-icon-grid"
            aria-label={`Built-in icons for ${item.label}`}
          >
            {BUILT_IN_TYPE_ICONS.map((iconOption) => (
              <button
                key={iconOption.key}
                type="button"
                className={`pp-type-icon-option${icon === iconOption.key ? " active" : ""}`}
                disabled={saving}
                title={iconOption.label}
                aria-label={iconOption.label}
                onClick={() => handleBuiltInIcon(iconOption.key)}
              >
                <TypeIconPreview
                  iconKeyOrDataUrl={iconOption.key}
                  color={color}
                  size={15}
                />
                <span>{iconOption.label}</span>
              </button>
            ))}
          </div>

          <label className="pp-type-upload">
            <span>
              {isCustomIcon(icon)
                ? "Replace custom icon"
                : "Upload custom icon"}
            </span>
            <small>SVG, PNG, WebP, JPEG, GIF, AVIF, BMP, ICO under 48 KB</small>
            <input
              type="file"
              accept="image/svg+xml,image/png,image/webp,image/jpeg,image/gif,image/avif,image/bmp,image/x-icon,image/vnd.microsoft.icon,.ico"
              disabled={saving}
              onChange={(event) => handleUpload(event.target.files?.[0])}
            />
          </label>
        </div>
      </div>
    </article>
  );
}

export default function TypeStylesPage() {
  const { data, isLoading, error } = useAdminTypeStyles();
  const updateTypeStyle = useUpdateTypeStyle();
  const showToast = useToast();
  const [activeCategory, setActiveCategory] = useState("space_space_type");
  const grouped = useMemo(() => {
    const groups = {};
    for (const item of data?.types || []) {
      if (!groups[item.category]) groups[item.category] = [];
      groups[item.category].push(item);
    }
    return groups;
  }, [data]);
  const categoryOrder = [
    "space_space_type",
    "restaurant_restaurant_type",
    "service_service_type",
  ].filter((category) => grouped[category]?.length);
  const activeItems =
    grouped[activeCategory] || grouped[categoryOrder[0]] || [];

  const saveTypeStyle = (item) => {
    updateTypeStyle.mutate(
      {
        category: item.category,
        tagId: item.tagId,
        icon: item.icon,
        color: item.color,
      },
      {
        onSuccess: () => showToast("Type style saved"),
        onError: (e) => showToast(e.message, "error"),
      },
    );
  };

  return (
    <div className="pp-page">
      <h1 className="pp-page-title">Type Styles</h1>
      <p className="pp-page-lead">
        Set the marker language for each type. Built-ins cover the common cases;
        uploads are for special icons the library does not cover.
      </p>
      {isLoading && <LoadingState />}
      {error && <p className="pp-error-text">{error.message}</p>}
      {!!categoryOrder.length && (
        <>
          <div
            className="pp-type-style-tabs pp-section-tabs"
            role="tablist"
            aria-label="Type categories"
          >
            {categoryOrder.map((category) => (
              <button
                key={category}
                type="button"
                className={category === activeCategory ? "active" : ""}
                role="tab"
                aria-selected={category === activeCategory}
                onClick={() => setActiveCategory(category)}
              >
                {TYPE_STYLE_CATEGORY_LABELS[category] || category}
                <span>{grouped[category].length}</span>
              </button>
            ))}
          </div>
          <section className="pp-type-style-section pp-tab-panel" key={activeCategory} role="tabpanel">
            <div className="pp-type-style-list">
              {activeItems.map((item) => (
                <TypeStyleRow
                  key={`${item.category}:${item.tagId}`}
                  item={item}
                  saving={updateTypeStyle.isPending}
                  onSave={saveTypeStyle}
                />
              ))}
            </div>
          </section>
        </>
      )}
    </div>
  );
}
