export const PHOTO_TAG_LABELS = Object.freeze({
  location: "Location",
  food: "Food",
  menu: "Menu",
  products: "Products",
  prayer_area: "Prayer area",
  wudu: "Wudu",
  grounds: "Grounds",
  interior: "Interior",
  exterior: "Exterior",
  entrance: "Entrance",
});

const PHOTO_TAGS_BY_TYPE = Object.freeze({
  restaurant: ["location", "food", "menu", "interior", "exterior", "entrance"],
  service: ["location", "products", "interior", "exterior", "entrance"],
  space: ["location", "prayer_area", "wudu", "interior", "exterior", "entrance"],
  cemetery: ["location", "grounds", "exterior", "entrance"],
  generic: ["location", "interior", "exterior", "entrance"],
});

function _photoTagType(place = {}) {
  if (place.type === "restaurant") return "restaurant";
  if (["service", "shop"].includes(place.type)) return "service";
  if (place.type === "cemetery" || place.tags?.space_type_cemetery) return "cemetery";
  if (["space", "mosque", "prayer_room"].includes(place.type)) return "space";
  return "generic";
}

/**
 * Return the single-select photo taxonomy appropriate to a place category.
 * @param {{type?: string, tags?: object}|null} place - Minimal place context.
 * @returns {Array<{value: string, label: string}>} Allowed photo tags.
 */
export function getPhotoTagOptions(place) {
  return PHOTO_TAGS_BY_TYPE[_photoTagType(place)].map((value) => ({
    value,
    label: PHOTO_TAG_LABELS[value],
  }));
}

/**
 * Resolve stored photo tag metadata to safe display copy.
 * @param {string} value - Stored normalized tag.
 * @returns {string} Human-readable label.
 */
export function photoTagLabel(value) {
  if (!value) return "";
  return PHOTO_TAG_LABELS[value] || PHOTO_TAG_LABELS.location;
}
