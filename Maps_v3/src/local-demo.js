const LOCAL_PREVIEW_HOSTS = new Set(["localhost", "127.0.0.1", "::1"]);

export function isLocalPreview() {
  return typeof location !== "undefined" && LOCAL_PREVIEW_HOSTS.has(location.hostname);
}

export function isLocalDemoProfileEnabled() {
  if (!isLocalPreview()) return false;
  try {
    return new URLSearchParams(location.search).get("demo") === "profile"
      || localStorage.getItem("hf_local_demo_profile") === "1";
  } catch {
    return false;
  }
}

export const LOCAL_DEMO_ACCOUNT = {
  uid: "local-demo-profile",
  email: "amina.demo@local.test",
  displayName: "Amina Rahman",
  photoURL: "",
  emailVerified: true,
};

export function getLocalDemoProfileData() {
  return {
    reviews: [
      { placeId: "8k2rzi", placeName: "Bangladesh Islamic Cultural Center (BICC)", rating: 5, text: "A welcoming space with clear prayer facilities and a strong community atmosphere.", timestamp: "2026-10-19T17:20:00Z", images: [] },
      { placeId: "cxjnht", placeName: "Suomen Islamilainen Yhdyskunta", rating: 4, text: "Central and easy to reach. Friday prayer gets busy, so arrive early.", timestamp: "2026-10-11T12:45:00Z", images: [] },
      { placeId: "pa61kp", placeName: "Espoo Muslim Center", rating: 5, text: "Excellent community programming and a calm space for families.", timestamp: "2026-09-27T15:10:00Z", images: [] },
      { placeId: "qo8fs0", placeName: "Al-Fatih Moskeija (Al-Fatih Mosque)", rating: 4, text: "Helpful local community and convenient access from Turku centre.", timestamp: "2026-08-22T10:30:00Z", images: [] },
    ],
    submittedPlaces: [
      { id: "demo-place-1", name: "Sisters Study Room", placeId: "4vxx5n", communityEdits: [{ changesSummary: "Opening hours: updated\nNotes added: quiet study access", submittedAt: "2026-10-08T10:30:00Z" }], status: "live", submittedAt: "2026-08-14T09:00:00Z" },
      { id: "demo-place-2", name: "Northside Halal Bakery", placeId: "8uaffs", status: "live", submittedAt: "2026-09-03T11:15:00Z" },
      { id: "demo-place-3", name: "Kallio Community Pantry", status: "pending", submittedAt: "2026-10-20T08:40:00Z" },
      { id: "demo-place-4", name: "Old Harbour Prayer Room", status: "rejected", rejectReason: "Please add a current opening-hours source.", submittedAt: "2026-07-29T16:25:00Z" },
    ],
    submittedEdits: [
      { id: "demo-edit-1", placeId: "8k2rzi", placeName: "Bangladesh Islamic Cultural Center (BICC)", changesSummary: "Opening hours: updated\nNotes added: prayer access details", status: "live", submittedAt: "2026-08-18T14:00:00Z" },
      { id: "demo-edit-2", placeId: "tsatr6", placeName: "Masjid Al-Huda (Helsinki Islamic Center)", changesSummary: "Address: updated", status: "live", submittedAt: "2026-09-08T13:45:00Z" },
      { id: "demo-edit-3", placeName: "Espoo Muslim Center", changesSummary: "Website: added\nPhone: added", status: "pending", submittedAt: "2026-10-17T09:20:00Z" },
      { id: "demo-edit-4", placeName: "Turku Community Room", changesSummary: "Tags: family-friendly added", status: "rejected", rejectReason: "The proposed change duplicates an existing listing.", submittedAt: "2026-08-05T18:10:00Z" },
    ],
    meta: {
      firstSeenAt: "2025-11-03T10:00:00Z",
      lifetimeReviewCount: 18,
      lifetimeVisitedCount: 31,
      saved: [
        { kind: "home", placeId: "cxjnht", name: "Suomen Islamilainen Yhdyskunta" },
        { kind: "favorite", placeId: "8k2rzi", name: "Bangladesh Islamic Cultural Center (BICC)" },
        { kind: "favorite", placeId: "pa61kp", name: "Espoo Muslim Center" },
        { kind: "favorite", placeId: "qo8fs0", name: "Al-Fatih Moskeija (Al-Fatih Mosque)" },
        { kind: "pin", placeId: "7rbzu8", name: "King Kebab Tikkurila" },
        { kind: "pin", placeId: "tsatr6", name: "Masjid Al-Huda (Helsinki Islamic Center)" },
        { kind: "visited", placeId: "8k2rzi", name: "Bangladesh Islamic Cultural Center (BICC)" },
        { kind: "visited", placeId: "pa61kp", name: "Espoo Muslim Center" },
        { kind: "visited", placeId: "qo8fs0", name: "Al-Fatih Moskeija (Al-Fatih Mosque)" },
      ],
    },
    timeline: [
      { id: "demo-visit-01", placeId: "8k2rzi", placeName: "Bangladesh Islamic Cultural Center (BICC)", visitedAt: "2026-10-20T17:30:00Z", placeLat: 60.2502807, placeLng: 25.0110983 },
      { id: "demo-visit-02", eventId: "local-test-today-10", eventTitle: "Morning coffee circle", occurrenceAt: "2026-10-22", eventLocationName: "Oodi Helsinki Central Library", placeName: "Oodi Helsinki Central Library", visitedAt: "2026-10-22T09:30:00Z", eventLat: 60.1731, eventLng: 24.9382 },
      { id: "demo-visit-03", placeId: "cxjnht", placeName: "Suomen Islamilainen Yhdyskunta", visitedAt: "2026-10-11T12:45:00Z", placeLat: 60.1646603, placeLng: 24.9342426 },
      { id: "demo-visit-04", eventId: "local-test-recurring", eventTitle: "Recurring Thursday circle", occurrenceAt: "2026-10-15", eventLocationName: "Suomen Islamilainen Yhdyskunta", placeName: "Suomen Islamilainen Yhdyskunta", visitedAt: "2026-10-15T18:20:00Z", eventLat: 60.1646603, eventLng: 24.9342426 },
      { id: "demo-visit-05", placeId: "pa61kp", placeName: "Espoo Muslim Center", visitedAt: "2026-09-27T15:10:00Z", placeLat: 60.1709733, placeLng: 24.7268367 },
      { id: "demo-visit-06", eventId: "local-demo-art", eventTitle: "Community art evening", occurrenceAt: "2026-09-18", eventLocationName: "Tampere Art Museum", placeName: "Tampere Art Museum", visitedAt: "2026-09-18T18:45:00Z", eventLat: 61.498, eventLng: 23.751 },
      { id: "demo-visit-07", placeId: "7rbzu8", placeName: "King Kebab Tikkurila", visitedAt: "2026-09-12T18:00:00Z", placeLat: 60.2935895, placeLng: 25.0351338 },
      { id: "demo-visit-08", placeId: "qo8fs0", placeName: "Al-Fatih Moskeija (Al-Fatih Mosque)", visitedAt: "2026-08-22T10:30:00Z", placeLat: 60.4561851, placeLng: 22.3088474 },
      { id: "demo-visit-09", eventId: "local-demo-bookclub", eventTitle: "Muslim authors book club", occurrenceAt: "2026-08-21", eventLocationName: "Turku Main Library", placeName: "Turku Main Library", visitedAt: "2026-08-21T18:10:00Z", eventLat: 60.451, eventLng: 22.266 },
      { id: "demo-visit-10", placeId: "tsatr6", placeName: "Masjid Al-Huda (Helsinki Islamic Center)", visitedAt: "2026-08-15T19:00:00Z", placeLat: 60.1997356, placeLng: 24.9375732 },
      { id: "demo-visit-11", placeId: "4vxx5n", placeName: "Taqwa Cultural Centre", visitedAt: "2026-08-09T14:20:00Z", placeLat: 60.2203206, placeLng: 24.8127404 },
      { id: "demo-visit-12", eventId: "local-test-past-1", eventTitle: "Past community breakfast", occurrenceAt: "2026-07-26", eventLocationName: "Helsinki City Hall", placeName: "Helsinki City Hall", visitedAt: "2026-07-26T10:30:00Z", eventLat: 60.1688, eventLng: 24.9521 },
      { id: "demo-visit-13", placeId: "93v21q", placeName: "Turun Islamilainen Yhdyskunta (montana)", visitedAt: "2026-07-18T13:00:00Z", placeLat: 60.4546855, placeLng: 22.2724624 },
      { id: "demo-visit-14", placeId: "1m0auf", placeName: "Albanian Mosque", visitedAt: "2026-06-28T12:15:00Z", placeLat: 60.2052773, placeLng: 24.6612704 },
      { id: "demo-visit-15", eventId: "local-demo-newcomers", eventTitle: "Newcomers coffee", occurrenceAt: "2026-06-20", eventLocationName: "Tampere Community House", placeName: "Tampere Community House", visitedAt: "2026-06-20T11:30:00Z", eventLat: 61.498, eventLng: 23.76 },
      { id: "demo-visit-16", placeId: "vtdidd", placeName: "Masjid Abu-Bakar", visitedAt: "2026-06-06T16:40:00Z", placeLat: 60.2748916, placeLng: 25.0342492 },
    ],
  };
}
