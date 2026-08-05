export const TYPE_OPTIONS = [
  { value: "mosque", label: "Mosque" },
  { value: "restaurant", label: "Restaurant" },
  { value: "shop", label: "Shop" },
  { value: "prayer_room", label: "Prayer Room" },
];

export const SPONSOR_TIER_OPTIONS = [
  { value: "", label: "None" },
  { value: "basic", label: "Basic" },
  { value: "featured", label: "Featured" },
  { value: "spotlight", label: "Spotlight" },
];

export const WISH_IMPLEMENTED_OPTIONS = [
  { value: "", label: "—" },
  { value: "Yes", label: "Done" },
  { value: "Inprogress", label: "In progress" },
  { value: "Out of Scope", label: "Out of scope" },
];

export const WISH_APPROVED_OPTIONS = [
  { value: "", label: "Pending" },
  { value: "Yes", label: "Approved" },
  { value: "No", label: "Rejected" },
];

export const CONTACT_REPLIED_OPTIONS = [
  { value: "no", label: "Not replied" },
  { value: "yes", label: "Replied" },
];

export function labelFor(options, value) {
  return options.find((o) => o.value === value)?.label ?? value;
}
