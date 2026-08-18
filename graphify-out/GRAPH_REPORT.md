# Graph Report - Maps  (2026-08-17)

## Corpus Check
- Large corpus: 171 files · ~531,035 words. Semantic extraction will be expensive (many Claude tokens). Consider running on a subfolder.

## Summary
- 2056 nodes · 4609 edges · 104 communities (102 shown, 2 thin omitted)
- Extraction: 96% EXTRACTED · 4% INFERRED · 0% AMBIGUOUS · INFERRED: 173 edges (avg confidence: 0.67)
- Token cost: 415,627 input · 0 output

## Community Hubs (Navigation)
- Places & Map Clustering
- Directions & Routing
- Code Review Tooling
- Map Controls & Styles
- Menu & Account UI
- Weekly Report Email
- Playwright E2E Tests
- Prayer Times & Qibla
- Navigation Core
- Traffic Overlay
- Admin API Endpoints
- Share URL Encoding Utils
- Authentication (Client)
- Root Package Manifest
- User Profile UI
- Transit Stops
- UI & Sponsorship Design Docs
- Agent & Build Config
- Reviews & Events UI
- Wishlist & Contact
- Account & Shared API
- Admin Auth & Shell
- Search & Geocoding
- D1 Migration Script
- GPS Simulation
- Map Style Editor
- Admin Package Manifest
- Admin Events/Reviews Pages
- Account Sync
- Drum Picker (Date/Time)
- Google Maps Enrichment
- Submission API
- Route Itineraries & Snackbar
- Admin Data Queries
- List Rendering Helpers
- Event Recurrence
- Eid Prayers
- Place Sheet & Markers
- Auth Prompts & Toasts
- Admin Wishes/Contacts
- Admin Places & Sponsors
- Transit Route Finding
- Onboarding Tutorial
- Admin Dashboard Layout
- Transit Cache Build
- Release/Update Script
- Map Init & Viewport
- Nav Camera & 3D
- Sign-in Views
- Places List Rendering
- Events List & Data
- Places API (GAS-compat)
- Apps Script Config
- App Bootstrap
- Runtime Config
- Sponsor Carousel
- Saved Pins
- Admin Tables & Logs
- Place App Links API
- Edge Middleware
- Navigation HUD
- Navigation Start & Camera
- Location Marker & Heading
- Reviews System Docs
- Profile Badges & Submissions
- Home Location
- PWA Manifest
- Badge Computation
- Config Template
- Turn-by-Turn Maneuvers
- Route Progress Geometry
- Places Filter & Search UI
- Admin & Deploy Docs
- Design System Docs
- Directions Panel Teardown
- Menu Preferences
- Accounts Redesign Docs
- Event Form (Recurring)
- Admin API Client
- Brand Logo Iconography
- Basemap Style Previews
- D1 Migration Docs
- Preference Log
- Directions Search
- Place Edit Form
- Bottom Sheet Drag
- Secrets Build Script
- Places Fetch/Cache Script
- Service Worker
- Secrets & Architecture Docs
- Firebase Token Verify
- Profile Stats
- OSRM Route Steps
- Confirm Dialog & Sign-out
- Geolocation Request
- App Icons & Branding
- Config API Endpoint
- Geo API Endpoint
- Device Orientation & Heading
- Transit Step Building
- Events & Link Concepts
- Playwright Config

## God Nodes (most connected - your core abstractions)
1. `esc()` - 73 edges
2. `showToast()` - 52 edges
3. `openPlaceSheet()` - 40 edges
4. `_openPinPopup()` - 25 edges
5. `json()` - 23 edges
6. `escA()` - 23 edges
7. `allowedOrigin()` - 21 edges
8. `renderPlacesList()` - 21 edges
9. `_openStopFeaturePopup()` - 21 edges
10. `updateGoButton()` - 20 edges

## Surprising Connections (you probably didn't know these)
- `Halal Finder App Shell (index.html)` --semantically_similar_to--> `Karamah Maps Admin Shell`  [INFERRED] [semantically similar]
  index.html → admin/index.html
- `Refactorer Agent (Claude Code)` --semantically_similar_to--> `Refactorer Agent (Copilot)`  [INFERRED] [semantically similar]
  .claude/agents/refactorer.md → .github/agents/refactorer.agent.md
- `The Architect Agent (Claude Code)` --semantically_similar_to--> `The Architect Agent (Copilot)`  [INFERRED] [semantically similar]
  .claude/agents/the-architect.md → .github/agents/the-architect.agent.md
- `Code Reviewer Skill` --semantically_similar_to--> `Pre-Commit Review Prompt`  [INFERRED] [semantically similar]
  .claude/skills/code-reviewer/SKILL.md → .github/prompts/pre-commit-review.prompt.md
- `Google Sheets as Database (Apps Script)` --semantically_similar_to--> `Cloudflare D1 Database`  [INFERRED] [semantically similar]
  .claude/agents/the-architect.md → README.md

## Import Cycles
- None detected.

## Hyperedges (group relationships)
- **Firebase Identity Layer** — docs_accounts_and_redesign_plan_firebase_auth, docs_accounts_and_redesign_plan_firebase_token_verify, docs_admin_dashboard_rollout_authenticate_admin, docs_accounts_and_redesign_plan_email_hash_privacy [INFERRED 0.85]
- **Review Anti-Abuse System** — docs_reviews_implementation_triple_identity, docs_reviews_implementation_recaptcha_v3, docs_reviews_implementation_rate_limit, docs_reviews_implementation_hybrid_moderation [INFERRED 0.85]
- **Bottom Sheet Interaction System** — docs_design_system_merged_sheet, docs_accounts_and_redesign_plan_place_sheet, docs_design_system_sheet_utils [INFERRED 0.75]
- **Design System Enforcement** — _claude_agents_the_architect_design_system, _github_instructions_css_design_system_instructions_rules, _github_instructions_js_markup_instructions_rules, _github_copilot_instructions_doc, _github_prompts_new_component_prompt_scaffold, _github_prompts_design_audit_prompt_audit, _claude_agents_the_architect_agent [INFERRED 0.85]
- **Code Quality Standards Enforcement** — _claude_agents_the_architect_code_quality_standards, _claude_agents_refactorer_agent, _github_agents_refactorer_agent_refactorer, _claude_agents_the_architect_agent, _github_agents_the_architect_agent_the_architect [INFERRED 0.85]
- **Security Review Coverage** — _claude_agents_the_architect_security_posture, _github_instructions_cloudflare_functions_instructions_rules, _github_prompts_pre_commit_review_prompt_review, _github_prompts_design_audit_prompt_audit, _github_copilot_instructions_doc [INFERRED 0.75]
- **Islamic Visual Iconography System** — data_halal_finder_preview_mosque_dome, data_halal_finder_preview_crescent_moon, data_halal_finder_preview_geometric_star_pattern [INFERRED 0.85]
- **Basemap style options for the map style switcher (3D, streets/default, satellite)** — data_thumbs_3d_3d_basemap, data_thumbs_default_streets_basemap, data_thumbs_satellite_satellite_basemap, data_thumbs_default_map_style_switcher [INFERRED 0.75]
- **Compact thumbnail tiles for the three basemap styles** — data_thumbs_thumb_3d_3d_style_thumbnail, data_thumbs_thumb_default_streets_style_thumbnail, data_thumbs_thumb_satellite_satellite_style_thumbnail, data_thumbs_default_map_style_switcher [INFERRED 0.75]
- **Route Snackbar Design Exploration (A–H)** — docs_route_snackbar_designs_route_snackbar, docs_route_snackbar_designs_accent_pill, docs_route_snackbar_designs_surface_card_accent_edge, docs_route_snackbar_designs_two_tone_split, docs_route_snackbar_designs_compact_chip_bar, docs_route_snackbar_designs_elevated_tag_card, docs_route_snackbar_designs_segmented_rule_bar, docs_route_snackbar_designs_accent_header_mini_card, docs_route_snackbar_designs_dark_ticker_bar [EXTRACTED 1.00]
- **Tiered Sponsorship Feature Model** — docs_sponsorship_plan_print_sponsorship_tiers, docs_sponsorship_plan_print_sponsor_badge, docs_sponsorship_plan_print_promo_code_button, docs_sponsorship_plan_print_search_ranking_boost, docs_sponsorship_plan_print_sponsored_carousel, docs_sponsorship_plan_print_enhanced_map_pin [EXTRACTED 1.00]
- **In-Route Navigation UI System** — docs_nav_hud_designs_navigation_hud, docs_nav_hud_designs_v2_navigation_hud_visual_variants, docs_route_snackbar_designs_route_snackbar, docs_ui_guide_directions_sheet, docs_ui_guide_transport_mode_selector [INFERRED 0.75]

## Communities (104 total, 2 thin omitted)

### Community 0 - "Places & Map Clustering"
Cohesion: 0.02
Nodes (76): activeTypeFilter, CITY_PRIORITY, CLUSTER_LAYER_IDS, collapsedCityGroups, _DAY_INITIALS, _DAY_KEYS, _DAY_LABELS, _DAY_LABELS_FULL (+68 more)

### Community 1 - "Directions & Routing"
Cohesion: 0.03
Nodes (63): addWaypoint(), _cachedReverseGeocode(), _createWaypointEl(), dirAddStopBtn, dirClearBtn, _dirCloseBtn, dirCustomRow, dirCustomRow_el (+55 more)

### Community 2 - "Code Review Tooling"
Cohesion: 0.05
Nodes (32): CodeQualityChecker, main(), Main class for code quality checker functionality, Execute the main functionality, Validate the target path exists and is accessible, Perform the main analysis or operation, Generate and display the report, main() (+24 more)

### Community 3 - "Map Controls & Styles"
Cohesion: 0.06
Nodes (50): _3D_LAYER_IDS, _applyDetailPaintPreset(), _applyMapDetail(), _applyMarkerVisualClass(), _applyResolvedTheme(), _bldgBase, _bldgFilter, _bldgHeight (+42 more)

### Community 4 - "Menu & Account UI"
Cohesion: 0.06
Nodes (47): APPLE_LOGO_SVG, APPLE_SIGNIN_BTN_HTML, APPLE_SIGNIN_LABEL, BACK_CHEVRON_ICON_SVG, EMAIL_PASSWORD_SIGNIN_BTN_HTML, EMAIL_PASSWORD_SIGNIN_LABEL, EMAIL_SIGNIN_BTN_HTML, EMAIL_SIGNIN_ICON_SVG (+39 more)

### Community 5 - "Weekly Report Email"
Cohesion: 0.11
Nodes (44): approvedActions(), averageCommunityMetrics(), BREVO_SMTP_PASSWORD_PREFIX, buildEmail(), clean(), communityActions(), contributionBreakdown(), countAuditActions() (+36 more)

### Community 6 - "Playwright E2E Tests"
Cohesion: 0.06
Nodes (23): { test, expect, setupApp }, { test, expect, setupApp }, { test, expect, setupApp }, { test, expect, setupApp }, { test, expect, setupApp }, { test, expect, setupApp }, { test, expect, setupApp }, { test, expect, setupApp } (+15 more)

### Community 7 - "Prayer Times & Qibla"
Cohesion: 0.08
Nodes (38): setFindingNearestMosque(), activeTagFilters, _applyPrayerTimesToUI(), collapsePrayerForMapInteraction(), dismissPrayerSnack(), fetchPrayerTimes(), formatPrayerCountdown(), _formatPrayerTime() (+30 more)

### Community 8 - "Navigation Core"
Cohesion: 0.05
Nodes (34): dirTravelMode, OSRM_LABELS, OSRM_URLS, setNavHooks(), _ATTENTION_MANEUVERS, _COMPLETED_MANEUVERS, hud, hudBody (+26 more)

### Community 9 - "Traffic Overlay"
Cohesion: 0.09
Nodes (42): _syncTrafficDetailForMode(), _buildQuery(), _cacheStorageKey(), _drawBase(), _drawOctagon(), _drawRoundedRect(), _drawTriangle(), EMPTY_GEOJSON (+34 more)

### Community 10 - "Admin API Endpoints"
Cohesion: 0.06
Nodes (17): ADMIN_ALLOWED_ORIGINS, adminAllowedOrigin(), AUDIT_DETAIL_NOISE_FIELDS, AUTH_EVENT_TYPES, authenticateAdmin(), buildAuditDetail(), extractTargetId(), GET_ACTIONS (+9 more)

### Community 11 - "Share URL Encoding Utils"
Cohesion: 0.09
Nodes (41): _buildHomeShareUrl(), checkShareUrl(), _buildPinShareUrl(), _buildStopShareUrl(), _b64d(), _b64decode(), _b64e(), _b64url() (+33 more)

### Community 12 - "Authentication (Client)"
Cohesion: 0.10
Nodes (33): _appleProvider, _authErrorPayload(), _cacheAccount(), completeMagicLinkSignIn(), _emitAuthChanged(), _facebookErrorPayload(), _facebookPhotoURLFromCredential(), _facebookPhotoURLFromProfile() (+25 more)

### Community 13 - "Root Package Manifest"
Cohesion: 0.05
Nodes (39): author, bugs, url, description, devDependencies, @playwright/test, serve, xlsx (+31 more)

### Community 14 - "User Profile UI"
Cohesion: 0.08
Nodes (39): formatMemberSince(), diffSubmissionStatuses(), getSubmissionStatusCache(), placesData, updateSubmissionStatusCache(), _accountAvatarHTML(), _accountMetaCache, _approvedCount() (+31 more)

### Community 15 - "Transit Stops"
Cohesion: 0.12
Nodes (35): autoSetNearestMosque(), findNearestMosqueFromOrigin(), openDirPanel(), placeDestMarker(), placeOriginMarker(), setupDirAutocomplete(), startPick(), updateGoButton() (+27 more)

### Community 16 - "UI & Sponsorship Design Docs"
Cohesion: 0.07
Nodes (36): Verification Email (OTP), HSL Trunk Bus Styling, Maneuver Icons, Navigation HUD — Design E (Chip Tags), Transit Navigation Modes, Navigation HUD Design E — Visual Variants, Design G — Accent Header Mini Card, Design A — Accent Pill (+28 more)

### Community 17 - "Agent & Build Config"
Cohesion: 0.09
Nodes (35): Refactorer Agent (Claude Code), The Architect Agent (Claude Code), Cloudflare Pages Functions, Code Quality Standards, Design System (Tokens + Templates), Google Sheets as Database (Apps Script), Static-Site Hard Constraints, Preference Log (cross-session memory) (+27 more)

### Community 18 - "Reviews & Events UI"
Cohesion: 0.11
Nodes (33): EVT, _renderPlaceSheetReviews(), _renderPopupRating(), _buildOverlayContent(), _buildPasswordSignInStep(), _buildPasswordStepDOM(), _buildReviewCard(), buildStarDisplay() (+25 more)

### Community 19 - "Wishlist & Contact"
Cohesion: 0.12
Nodes (32): RECAPTCHA_SITE_KEY, form, getContactRecaptchaToken(), isLocalDevHost(), LOCAL_DEV_HOSTS, overlay, submitBtn, animateSheetHeight() (+24 more)

### Community 20 - "Account & Shared API"
Cohesion: 0.14
Nodes (27): ERASE_TARGETS, getAccountMeta(), getSavedPlaces(), handleAccountErase(), onRequestOptions(), onRequestPost(), PLACE_ID_KINDS, resolveEmailHash() (+19 more)

### Community 21 - "Admin Auth & Shell"
Cohesion: 0.12
Nodes (19): AuthContext, AuthProvider(), isAllowedEmail(), reloadUser(), signIn(), signUp(), useAuth(), AuthGuard() (+11 more)

### Community 22 - "Search & Geocoding"
Cohesion: 0.12
Nodes (31): isInsideFinland(), dir, reverseGeocode(), activeSponsor(), clearBtn, clearDroppedPins(), clearSearchMarker(), collapseSearch() (+23 more)

### Community 23 - "D1 Migration Script"
Cohesion: 0.09
Nodes (27): args, crypto, d1Exec(), d1Query(), DEFAULT_XLSX, { execFileSync }, fs, GENERATED_DIR (+19 more)

### Community 24 - "GPS Simulation"
Cohesion: 0.16
Nodes (27): decodePolyline(), _buildPlaybackRoute(), _ensureMarker(), _feedPosition(), _hideControls(), _hideIndicator(), initGpsSim(), _interpolateAtM() (+19 more)

### Community 25 - "Map Style Editor"
Cohesion: 0.13
Nodes (26): DARK_COLORS, DEFAULT_COLORS, DEFAULT_FILTERS, EDITOR_ENABLED, LIGHT_COLORS, _applyColors(), _applyFilter(), _applyOne() (+18 more)

### Community 26 - "Admin Package Manifest"
Cohesion: 0.07
Nodes (26): dependencies, firebase, react, react-dom, react-router-dom, @tanstack/react-query, @tanstack/react-table, devDependencies (+18 more)

### Community 27 - "Admin Events/Reviews Pages"
Cohesion: 0.13
Nodes (17): useAdminEvents(), useAdminReviews(), useApproveEvent(), useApproveReview(), useRejectEvent(), useRejectReview(), ActionCell(), ReasonPrompt() (+9 more)

### Community 28 - "Account Sync"
Cohesion: 0.18
Nodes (24): _backgroundSync(), _callAccountApi(), _checkBadgeLevelUps(), _enterCloudState(), _exitCloudState(), _getAuthModule(), _handleSignIn(), initAccountSync() (+16 more)

### Community 29 - "Drum Picker (Date/Time)"
Cohesion: 0.15
Nodes (25): _applyTiers(), _attachDrumDrag(), begin(), currentOff(), end(), move(), buildDrumData(), _clamp() (+17 more)

### Community 30 - "Google Maps Enrichment"
Cohesion: 0.16
Nodes (23): approveEdit(), approveEid(), approveNew(), handleEidSubmission(), generateId(), isInsideFinlandBounds(), normaliseAddress(), parseTagString() (+15 more)

### Community 31 - "Submission API"
Cohesion: 0.17
Nodes (23): addNewCuisineTags(), BREVO_SMTP_PASSWORD_PREFIX, buildContactEmail(), findPlacesIdByFuzzyMatch(), getMySubmittedEdits(), getMySubmittedPlaces(), handleEditSubmission(), handleNewSubmission() (+15 more)

### Community 32 - "Route Itineraries & Snackbar"
Cohesion: 0.15
Nodes (24): _bindDirectCardClicks(), dirModeIconSvg(), _drawDirectPrimary(), drawRoute(), _ensureAltLayerForRoute0(), enterResultsMode(), findRoutesDirect(), fmtTime() (+16 more)

### Community 33 - "Admin Data Queries"
Cohesion: 0.19
Nodes (18): useAdminEidPrayers(), useAdminMutation(), useApproveEdit(), useApproveEid(), useApproveEventEdit(), usePendingEdits(), usePendingEid(), usePendingEventEdits() (+10 more)

### Community 34 - "List Rendering Helpers"
Cohesion: 0.14
Nodes (23): dirGeoSearch(), _svg(), typeIcon(), _accountAvatarHTML(), _buildSignedInHTML(), _buildChipSet(), _buildEventCard(), _buildPinCardHTML() (+15 more)

### Community 35 - "Event Recurrence"
Cohesion: 0.14
Nodes (22): buildPattern(), DAY_NAMES, DAY_NAMES_SHORT, formatRecurrence(), FREQUENCY_OPTIONS, _joinList(), _midnight(), MONTHLY_SUB_OPTIONS (+14 more)

### Community 36 - "Eid Prayers"
Cohesion: 0.22
Nodes (21): addEidMarkers(), _checkEidShareUrl(), closeEidPanel(), dismissEidBanner(), eidLocations, eidMarkers, _fetchEidApi(), _fetchEidStatic() (+13 more)

### Community 37 - "Place Sheet & Markers"
Cohesion: 0.12
Nodes (22): getThemeRailShopPurple(), makePlaceMarkerHTML(), addPlaceMarkers(), _buildPlaceInfoChipsHTML(), _buildPlacesGeoJSON(), closePlaceSheet(), getHoursStatus(), isPlaceOpenNow() (+14 more)

### Community 38 - "Auth Prompts & Toasts"
Cohesion: 0.20
Nodes (18): _performDelete(), _afterSignInSuccess(), _animateReviewCardHeight(), _buildFormHideButton(), deleteReview(), _getAuthModule(), _insertReviewPanel(), openReviewsOverlayForEdit() (+10 more)

### Community 39 - "Admin Wishes/Contacts"
Cohesion: 0.17
Nodes (15): useAdminContacts(), useAdminWishes(), useUpdateContactReplied(), useUpdateWishApproved(), useUpdateWishImplemented(), App(), DropdownCell(), ToastContext (+7 more)

### Community 40 - "Admin Places & Sponsors"
Cohesion: 0.15
Nodes (14): useAdminPlaces(), useUpdateBoycott(), useUpdateSponsor(), SponsorEditor(), ToggleCell(), CONTACT_REPLIED_OPTIONS, labelFor(), SPONSOR_TIER_OPTIONS (+6 more)

### Community 41 - "Transit Route Finding"
Cohesion: 0.18
Nodes (18): _buildRouteShareUrl(), _encPolyline2Pts(), findRoutes(), findRoutesTransitous(), _findTransitWithWaypoints(), getDateValue(), getTimeValue(), _itinSkeletonHTML() (+10 more)

### Community 42 - "Onboarding Tutorial"
Cohesion: 0.24
Nodes (16): closeMenuSheet(), advance(), ALL_STEPS, build(), buildSteps(), dismiss(), el(), getLayout() (+8 more)

### Community 43 - "Admin Dashboard Layout"
Cohesion: 0.16
Nodes (11): useAdminStats(), StatTile(), BASE, CloseIcon(), HamburgerIcon(), AppLayout(), LINKS, Nav() (+3 more)

### Community 44 - "Transit Cache Build"
Cohesion: 0.24
Nodes (16): classifyStop(), dedupeRouteList(), deduplicateStops(), dtQuery(), fetchOSMRoutesForNoCoverageRegions(), fetchOverpassStops(), fetchRoutesByMode(), fetchWalttiRoutes() (+8 more)

### Community 45 - "Release/Update Script"
Cohesion: 0.22
Nodes (16): banner(), buildTransitCache(), bumpVersionStrings(), checkmark(), computeNextVersion(), { execFileSync }, fetchPlaces(), fs (+8 more)

### Community 46 - "Map Init & Viewport"
Cohesion: 0.17
Nodes (14): HELSINKI, appRoot, FINLAND_CENTER, FOCUS_PANEL_IDS, focusMapPoint(), _getMobileBottomSheetPadding(), getViewportSize(), _getVisibleFocusPadding() (+6 more)

### Community 47 - "Nav Camera & 3D"
Cohesion: 0.13
Nodes (17): enable3D(), _clearTurnRoadMarkers(), _enterOverview(), _isRecenterVisible(), _medianOfArray(), _onLocationUpdate(), _onTouchMove(), _onUserInteraction() (+9 more)

### Community 48 - "Sign-in Views"
Cohesion: 0.19
Nodes (14): _animateMenuPanelHeight(), _wirePasswordSignIn(), hideError(), showError(), _wireSignedOutView(), showLinkedProviderResult(), showProviderFailure(), buildWelcomeGreeting() (+6 more)

### Community 49 - "Places List Rendering"
Cohesion: 0.18
Nodes (17): applySort(), _buildCard(), _buildRatingChip(), _cityPriority(), compareMostRelevantPlaces(), _crossFadePlacesList(), extractCityFromAddress(), formatDist() (+9 more)

### Community 50 - "Events List & Data"
Cohesion: 0.16
Nodes (16): addEventOnlyMarkers(), fetchFresh(), _filterEvents(), loadPlacesData(), _nextEventDate(), normalizePlacesData(), _openEventsOverlayToEvent(), _populateEvMosqueFilter() (+8 more)

### Community 51 - "Places API (GAS-compat)"
Cohesion: 0.26
Nodes (13): getAdminPlaces(), getEvents(), getPlaces(), getReviewsSummary(), getTags(), onRequestGet(), SPONSOR_TIERS, buildLabelToIdMap() (+5 more)

### Community 52 - "Apps Script Config"
Cohesion: 0.13
Nodes (14): https://www.googleapis.com/auth/gmail.send, https://www.googleapis.com/auth/gmail.settings.basic, https://www.googleapis.com/auth/script.external_request, https://www.googleapis.com/auth/script.scriptapp, https://www.googleapis.com/auth/script.send_mail, https://www.googleapis.com/auth/spreadsheets, dependencies, exceptionLogging (+6 more)

### Community 53 - "App Bootstrap"
Cohesion: 0.18
Nodes (12): initPhoneMapChromeCompact(), _isLocalDevHost, NOTE: Disabled — keep code for future re-enable, map, placesLoaded, checkGeoNotice(), _getToastStack(), hideOfflineBanner() (+4 more)

### Community 54 - "Runtime Config"
Cohesion: 0.14
Nodes (12): _cfg, _CRYPTO_KEY, DIGITRANSIT_GEO_URL, DIGITRANSIT_REV_URL, DIGITRANSIT_URL, DIGITRANSIT_WALTTI_URL, DT_API_KEY, FI_BBOX (+4 more)

### Community 55 - "Sponsor Carousel"
Cohesion: 0.27
Nodes (13): _animateCarouselTo(), _clearCarouselAuto(), _getAlignedCarouselLeft(), _getCarouselLoopBounds(), _getCarouselMetrics(), _getForwardCarouselLeft(), _pauseCarouselAuto(), _prepareCarouselForwardAdvance() (+5 more)

### Community 56 - "Saved Pins"
Cohesion: 0.27
Nodes (14): _blockedBySyncPending(), clearHomeLocation(), _emitWindowEvent(), enterCloudScope(), getSavedPins(), isPinSaved(), _loadPins(), _normalizeStoredLocation() (+6 more)

### Community 57 - "Admin Tables & Logs"
Cohesion: 0.23
Nodes (9): useAdminLog(), useApproveNew(), usePendingNew(), useRejectNew(), DataTable(), columnHelper, LogPage(), columnHelper (+1 more)

### Community 58 - "Place App Links API"
Cohesion: 0.27
Nodes (10): APP_CORS, onRequestGet(), hasAppLinkValues(), LINK_FIELDS, parseAppLinksFromQueue(), parseAppLinksInput(), parsePlaceIdsParam(), rowToApiLinks() (+2 more)

### Community 59 - "Edge Middleware"
Cohesion: 0.29
Nodes (12): _b64d(), _DATE_EPOCH, _decodeCompactPin(), _decodeCompactRoute(), isProtectedPath(), _lat(), _lng(), onRequest() (+4 more)

### Community 60 - "Navigation HUD"
Cohesion: 0.19
Nodes (13): fmtDist(), _lookupSpeedLimit(), _nearestPointOnSegment(), processPosition(), renderHUD(), simNextStep(), snapToRoute(), _triggerReroute() (+5 more)

### Community 61 - "Navigation Start & Camera"
Cohesion: 0.28
Nodes (13): disable3D(), _computeNavPitch(), _computeNavZoom(), _distToNextAttentionStep(), _distToNextAttentionStepUncapped(), _initCoveredRouteLayer(), _interpFrame(), _navPadding() (+5 more)

### Community 62 - "Location Marker & Heading"
Cohesion: 0.18
Nodes (11): _bearing(), _cancelLocLerp(), _haversineM(), _lerpLocMarkerTo(), _requestOrientationPermission(), setLocateIcon(), showCurrentLocation(), onPosition() (+3 more)

### Community 63 - "Reviews System Docs"
Cohesion: 0.20
Nodes (11): Legacy Anonymous OTP Review Flow Retirement, Reviews Upsert via UNIQUE(place_id, email_hash), Reviews Implementation, Hybrid Moderation, Review Rate Limit (5/24h), reCAPTCHA v3 (0.7 threshold), In-app Review System, Triple-Identity Anti-Abuse (+3 more)

### Community 64 - "Profile Badges & Submissions"
Cohesion: 0.24
Nodes (11): buildBadgeSnapshot(), diffBadgeLevelUps(), _getBadgeSnapshotCache(), _persistBadgeSnapshot(), _runBadgeLevelUpCheck(), fetchMySubmittedEdits(), fetchMySubmittedPlaces(), _getAuthModule() (+3 more)

### Community 65 - "Home Location"
Cohesion: 0.22
Nodes (11): stopPick(), centerStoredHomeIfAvailable(), syncHomeMarker(), getMostRelevantAnchor(), openPlacesSheet(), _resolveSortLocation(), _resolveUserLocation(), tryGetUserLocation() (+3 more)

### Community 66 - "PWA Manifest"
Cohesion: 0.20
Nodes (9): background_color, description, display, icons, name, orientation, short_name, start_url (+1 more)

### Community 67 - "Badge Computation"
Cohesion: 0.29
Nodes (9): BADGE_DEFS, computeBadges(), computeTopBadge(), generateThresholds(), LEVEL_ROMAN, MONTH_NAMES, resolveTier(), _thresholdsFor() (+1 more)

### Community 68 - "Config Template"
Cohesion: 0.20
Nodes (9): DIGITRANSIT_GEO_URL, DIGITRANSIT_REV_URL, DIGITRANSIT_URL, DIGITRANSIT_WALTTI_URL, DT_API_KEY, HF_TOKEN_KEY, NOMINATIM_REV, NOMINATIM_VB (+1 more)

### Community 69 - "Turn-by-Turn Maneuvers"
Cohesion: 0.20
Nodes (10): maneuverIconSvg(), _otpManeuverIcon(), _advanceStep(), _approachFireM(), _initTurnMarkerLayer(), _interpolateAlongRoute(), _minMoveDist(), _triggerRadius() (+2 more)

### Community 70 - "Route Progress Geometry"
Cohesion: 0.29
Nodes (10): _bearing(), _blendHeading(), _buildRouteProgress(), distAlongRoute(), _distToNextTurnOnRoute(), _hDistM(), _precomputeStopRadii(), _routeBearingAtSnap() (+2 more)

### Community 71 - "Places Filter & Search UI"
Cohesion: 0.22
Nodes (10): _closePlaceSearch(), closeSortDropdown(), dismissPlacesSearch(), getFilterBarTags(), refreshPlacesSort(), renderTagFilterBar(), _setPlacesTypeFilter(), updateClearButton() (+2 more)

### Community 72 - "Admin & Deploy Docs"
Cohesion: 0.22
Nodes (9): Edge Firebase ID Token Verification, Admin React + Vite Dashboard, Audit Log Table, authenticateAdmin() Firebase Domain Gate, Admin Dashboard Rollout, Separate Admin Cloudflare Pages Project, Conventional Commits Format, Commit Conventions (+1 more)

### Community 73 - "Design System Docs"
Cohesion: 0.28
Nodes (9): Third-party Brand Button Exception, Button Templates, Design Tokens (design-tokens.css), Design System, Plus Jakarta Sans Typeface, 'Premium Utility' Design Vision, Reduce Motion Single-source Mechanism, showConfirmDialog() Confirmation Pattern (+1 more)

### Community 74 - "Directions Panel Teardown"
Cohesion: 0.22
Nodes (9): clearRoute(), clearWaypointMarkers(), closeDirPanel(), closeOpenPanelOnMapInteract(), exitResultsMode(), fullCloseDirPanel(), _goBackToPlaces(), _resetDirCloseButton() (+1 more)

### Community 75 - "Menu Preferences"
Cohesion: 0.31
Nodes (9): initMenuPreferences(), _populatePrayerMethodOptions(), _restorePreferenceControls(), _setSwitchState(), _wirePreferencesControls(), _applyReduceMotionClass(), getReduceMotionOverride(), isReduceMotionActive() (+1 more)

### Community 76 - "Accounts Redesign Docs"
Cohesion: 0.29
Nodes (8): Accounts & Redesign Plan, Email Hash Privacy Principle, Firebase Authentication, Consolidated Menu Sheet, Place-detail Bottom Sheet, Two-way Cross-device Reconcile, Merged Menu/Profile Sheet, Sheet Animation Utilities

### Community 77 - "Event Form (Recurring)"
Cohesion: 0.36
Nodes (8): _buildDayChips(), _buildMonthDateChips(), _buildOrdinalChips(), _initRecurringFormChips(), openEventOverlay(), _prefillRecurringFromPattern(), _resetLocationCombo(), _resetOrganizerCombo()

### Community 78 - "Admin API Client"
Cohesion: 0.62
Nodes (6): apiBase(), apiGet(), apiPost(), authHeader(), logAuthEvent(), parseResponse()

### Community 79 - "Brand Logo Iconography"
Cohesion: 0.43
Nodes (7): Gold & Deep-Purple Brand Palette, Halal Finder Brand Logo, Crescent Moon Finial, Islamic Geometric Star Pattern, Halal Finder (Brand Name), Helsinki (Location Tagline), Mosque Dome Emblem

### Community 80 - "Basemap Style Previews"
Cohesion: 0.43
Nodes (7): 3D Basemap Style Preview (Helsinki street rendering with location pin), Map Style Switcher / Basemap Options, Default / Streets Basemap Style Preview (central Helsinki street map), Satellite Basemap Style Preview (Helsinki aerial imagery), 3D Style Thumbnail Tile (compact near-solid light-blue tile), Default / Streets Style Thumbnail Tile (light-blue tile with dashed route line and land corner), Satellite Style Thumbnail Tile (compact near-solid dark-teal tile)

### Community 81 - "D1 Migration Docs"
Cohesion: 0.33
Nodes (7): Saved Places / Favourites Sync, Google Sheets + Apps Script Backend (legacy), Cloudflare D1 Database, D1 Schema (14 tables), Google Sheets to Cloudflare D1 Migration Plan, Server-side Nominatim Geocoding, ON CONFLICT Partial-Index Match Requirement

### Community 82 - "Preference Log"
Cohesion: 0.29
Nodes (7): Brand Teal Accent + Neutral Surfaces, Preference Log, Hook Pattern for Circular Module Dependencies, Navigation Camera Model, No Automated Tests Without Explicit Ask, Patterns to Avoid, Patterns to Follow

### Community 83 - "Directions Search"
Cohesion: 0.33
Nodes (7): autoResolveLocation(), _dtGeoSearch(), _mergeDirSearchResults(), _nominatimSearch(), _normalizeDirSearchText(), searchDirLocations(), _searchLocalDirPlaces()

### Community 84 - "Place Edit Form"
Cohesion: 0.33
Nodes (7): openEditOverlay(), openSuggestOverlay(), renderEditTags(), _renderHoursEntry(), _renderHoursForm(), _syncHoursDays(), _wireHoursEntry()

### Community 85 - "Bottom Sheet Drag"
Cohesion: 0.43
Nodes (5): initSheetDrag(), contentHeight(), freshCalc(), onEnd(), snapTarget()

### Community 86 - "Secrets Build Script"
Cohesion: 0.33
Nodes (5): fs, outPath, path, repoRoot, vars

### Community 87 - "Places Fetch/Cache Script"
Cohesion: 0.40
Nodes (5): downloadSpreadsheetBackup(), fs, LOCAL_SHEET_BACKUP_DIR, main(), path

### Community 88 - "Service Worker"
Cohesion: 0.60
Nodes (5): cacheFirst(), isCacheable(), SHELL_ASSETS, staleWhileRevalidate(), trimCache()

### Community 89 - "Secrets & Architecture Docs"
Cohesion: 0.40
Nodes (5): Static-site / Zero-dependency Architecture, config.local.js Secret Injection, Secrets & Configuration Setup Guide, DT_API_KEY (Digitransit key), External Routing/Geocoding APIs

### Community 90 - "Firebase Token Verify"
Cohesion: 0.80
Nodes (4): _base64UrlToBytes(), _decodeJwtSegment(), _getJwks(), verifyFirebaseIdToken()

### Community 91 - "Profile Stats"
Cohesion: 0.40
Nodes (5): computeContributionStats(), openSavedPlacesAtSection(), _scrollPlacesListToElement(), _handleSavedStatJump(), _renderStats()

### Community 92 - "OSRM Route Steps"
Cohesion: 0.40
Nodes (5): bearingName(), _osrmDirectRoute(), _osrmProcessRoute(), stepInstruction(), stepSegType()

### Community 93 - "Confirm Dialog & Sign-out"
Cohesion: 0.50
Nodes (5): _promptVerifyEmailBlock(), _handleSignOut(), showConfirmDialog(), finish(), onKeydown()

### Community 94 - "Geolocation Request"
Cohesion: 0.70
Nodes (5): requestLocation(), onError(), onFinalError(), onSuccess(), retry()

### Community 95 - "App Icons & Branding"
Cohesion: 0.50
Nodes (4): Halal Finder Favicon, Halal Finder App Icon (192px), Halal Finder App Icon (512px), Halal Finder Helsinki Logo / App Branding

### Community 96 - "Config API Endpoint"
Cohesion: 0.67
Nodes (3): ALLOWED_ORIGINS, allowedOrigin(), onRequestGet()

### Community 97 - "Geo API Endpoint"
Cohesion: 0.67
Nodes (3): ALLOWED_ORIGINS, allowedOrigin(), onRequestGet()

### Community 98 - "Device Orientation & Heading"
Cohesion: 0.83
Nodes (4): _startHeadingWatch(), _applyConeRotation(), onMapRotate(), onOrientation()

### Community 99 - "Transit Step Building"
Cohesion: 0.67
Nodes (4): buildDirectStepsFromData(), buildTransitSteps(), _findNearestCoordIdx(), _routeProgressAtCoordIdx()

## Knowledge Gaps
- **502 isolated node(s):** `name`, `private`, `version`, `type`, `dev` (+497 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **2 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `showToast()` connect `Auth Prompts & Toasts` to `Places & Map Clustering`, `Directions & Routing`, `Map Controls & Styles`, `Menu & Account UI`, `Prayer Times & Qibla`, `Navigation Core`, `Traffic Overlay`, `Share URL Encoding Utils`, `User Profile UI`, `Transit Stops`, `Reviews & Events UI`, `Wishlist & Contact`, `Search & Geocoding`, `Account Sync`, `List Rendering Helpers`, `Eid Prayers`, `Place Sheet & Markers`, `Sign-in Views`, `App Bootstrap`, `Saved Pins`, `Navigation Start & Camera`, `Location Marker & Heading`, `Places Filter & Search UI`, `Confirm Dialog & Sign-out`?**
  _High betweenness centrality (0.026) - this node is a cross-community bridge._
- **Why does `esc()` connect `List Rendering Helpers` to `Places & Map Clustering`, `Directions & Routing`, `Map Controls & Styles`, `Menu & Account UI`, `Navigation Core`, `Traffic Overlay`, `Share URL Encoding Utils`, `User Profile UI`, `Transit Stops`, `Reviews & Events UI`, `Wishlist & Contact`, `Search & Geocoding`, `Route Itineraries & Snackbar`, `Eid Prayers`, `Place Sheet & Markers`, `Auth Prompts & Toasts`, `Transit Route Finding`, `Sign-in Views`, `Places List Rendering`, `Events List & Data`, `App Bootstrap`, `Sponsor Carousel`, `Navigation HUD`, `Profile Badges & Submissions`, `Places Filter & Search UI`, `Menu Preferences`, `Event Form (Recurring)`, `Place Edit Form`, `Profile Stats`, `OSRM Route Steps`, `Confirm Dialog & Sign-out`, `Transit Step Building`?**
  _High betweenness centrality (0.024) - this node is a cross-community bridge._
- **Why does `map` connect `App Bootstrap` to `Places & Map Clustering`, `Directions & Routing`, `Map Controls & Styles`, `Eid Prayers`, `Prayer Times & Qibla`, `Navigation Core`, `Traffic Overlay`, `Share URL Encoding Utils`, `Map Init & Viewport`, `Transit Stops`, `Search & Geocoding`, `GPS Simulation`, `Map Style Editor`?**
  _High betweenness centrality (0.015) - this node is a cross-community bridge._
- **What connects `name`, `private`, `version` to the rest of the system?**
  _502 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Places & Map Clustering` be split into smaller, more focused modules?**
  _Cohesion score 0.023809523809523808 - nodes in this community are weakly interconnected._
- **Should `Directions & Routing` be split into smaller, more focused modules?**
  _Cohesion score 0.0344988344988345 - nodes in this community are weakly interconnected._
- **Should `Code Review Tooling` be split into smaller, more focused modules?**
  _Cohesion score 0.05128205128205128 - nodes in this community are weakly interconnected._