export const TYPE_OPTIONS = [
  { value: "space", label: "Spaces" },
  { value: "restaurant", label: "Food" },
  { value: "service", label: "Services" },
];

export const TYPE_STYLE_CATEGORY_LABELS = {
  restaurant_restaurant_type: "Food",
  service_service_type: "Services",
  space_space_type: "Spaces",
};


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

export const PLATFORM_OPTIONS = [
  { value: "YouTube", label: "YouTube" },
  { value: "TikTok", label: "TikTok" },
  { value: "Instagram", label: "Instagram" },
];

export function labelFor(options, value) {
  return options.find((o) => o.value === value)?.label ?? value;
}
