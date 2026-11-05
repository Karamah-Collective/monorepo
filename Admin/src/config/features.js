// Features that are implemented but intentionally held back from the visible
// Admin workspace until their production rollout is approved.
export const OPERATIONS_UI_ENABLED = false;
// Internal beta. Google Tasks remains optional and is not required for the
// project workspace to operate.
export const PROJECTS_UI_ENABLED = true;
export const PROJECTS_APP_URL = import.meta.env.VITE_PROJECTS_APP_URL || (import.meta.env.DEV ? "http://127.0.0.1:5184" : "https://projects.karamahcollective.com");
