# Services and Spaces Tag Plan

## Goal

Expand the old **Shops** concept into a broader **Services** category for halal or Muslim-owned halal-compatible places, and make **Spaces** a broad category whose exact kind is chosen with mandatory type tags.

This keeps the browsing model simple:

- **Food** = restaurants, cafes, bakeries, dessert places, and similar food-first venues whose food status is the main question.
- **Services** = halal-compatible or Muslim-owned public businesses such as groceries, butcheries, cafes, bookshops, salons, clothing shops, and similar non-haram places.
- **Spaces** = Muslim-relevant physical places such as mosques, prayer places, cemeteries, community halls, classrooms, event spaces, and wudu facilities.

## Naming

Use **Services** for the old Shops tab. It is broader than "shops" without sounding too corporate or vague. It also avoids implying every item sells groceries.

Use **Spaces** as the visible high-level label for mosques, prayer places, cemeteries, and future Muslim community locations.

## Type Model

Introduce two broad user-facing top-level types:

- `service`
- `space`

Keep backward compatibility with older/live rows:

- `shop` behaves as `service`
- `mosque`, `prayer_room`, and `cemetery` behave as `space`

Static cache rows should migrate to the new top-level names so first-load data matches the product language.

## Mandatory Type Tags

Food must have exactly one tag from the `restaurant_type` group. Services must have exactly one tag from the `service_type` group. Spaces must have exactly one tag from the `space_type` group.

The type tag is mandatory and single-select. It answers "what is this place?" and should not be mixed with optional descriptive tags.

Examples:

- A grocery with a butcher counter should choose **Grocery** as its type and use optional tags like **Butchery** / **Halal Meat**.
- A bookstore with a cafe should choose whichever identity is primary, then use optional tags to describe the secondary use.
- A cafe should choose **Food** as its category and **Cafe** as its type; cuisine remains optional metadata.
- A mosque should be a **Space** with type **Mosque**.
- A cemetery should be a **Space** with type **Cemetery**.

This keeps filtering and display deterministic: one place has one main subtype, while optional tags can still express facilities, products, services, or secondary qualities.

## Default Food Type Tags

Seed these:

- Restaurant
- Cafe
- Bakery
- Dessert
- Food Truck
- Catering
- Takeaway
- Buffet

Keep Cuisine as an optional multi-select group under Food. Cuisine is not the same thing as type: a place can be a **Cafe** with Turkish cuisine, or a **Restaurant** with Pakistani and Indian cuisines. Do not keep venue-format labels as Cuisine options when the same concept belongs in Food Type instead; **Buffet**, **Cafe**, and pastry/bakery-style labels should live as Food Type values, not Cuisine values.

Food Type selections should reveal Food-relevant optional groups such as No Alcohol, Halal Status, and Cuisine. Halal Status remains an exclusive choice group between Fully Halal and Partially Halal, and should feel like an immediate choice rather than disappearing as a plain tag.

## Default Service Type Tags

Seed these so users do not start from an empty list:

- Grocery
- Butchery
- Bookshop
- Salon
- Clothing
- Islamic Goods
- Education
- Community Service
- Charity

Keep existing shop attribute tags as non-mandatory service tags:

- Halal Meat
- Butchery
- Groceries
- Asian
- African
- Arab
- Certified
- Muslim-owned

## Default Space Type Tags

Seed these:

- Mosque
- Prayer Place
- Cemetery
- Eid Prayer Place
- Community Hall
- Event Space
- Classroom
- Wudu Facility
- Sisters Space

Keep existing prayer-room facility tags as non-mandatory space tags:

- Wudu
- Sisters Section
- Sisters Wudu
- Quran Available

Space Type selections should reveal only suitable optional tags. Mosque can show prayer and facility tags such as Daily Prayers, Jummah, Taraweeh, Eid Prayer, Janaza, Quran Classes, Wudu, Sisters Section, Sisters Wudu, and Quran Available. Prayer Place can show prayer-room style amenities. Cemetery should not inherit mosque/prayer-room tags by default; it should show cemetery-relevant tags such as Janaza. Eid Prayer Place is a special case whose dedicated organizer/date/jamaat fields replace normal optional tags.

## Existing Data Backfill

Static `shop` rows become `service` and receive `service_type_grocery`. Existing butchery/grocery tags stay intact.

Static `mosque` rows become `space` and receive `space_type_mosque`. Existing mosque feature tags such as Daily Prayers, Jummah, Sisters Section, Wudu, Quran Classes, and so on stay as optional tags.

Static `prayer_room` rows become `space` and receive `space_type_prayer_place`.

Static `cemetery` rows become `space` and receive `space_type_cemetery`.

The app should continue to read live `shop`, `prayer_room`, and `cemetery` rows until the live database is migrated.

## Add/Edit Forms

The high-level category select should show:

- Spaces
- Food
- Services

The type-specific selector should be visually separated from optional tags:

- **Type** section: required, single-select, one and only one active chip.
- **Tags** section: optional, multi-select where appropriate, same current chip/group behavior, hidden until a Type is selected.

When Services is selected, the Service Type selector is visibly required. Submission is blocked unless exactly one `service_type_*` tag is active.

When Spaces is selected, the Space Type selector is visibly required. Submission is blocked unless exactly one `space_type_*` tag is active.

**Eid Prayer Place** is a Space type, not a standalone top-level category. In the add-place form, choosing `Spaces` and then `Eid Prayer Place` reveals the special Eid fields (organizers, date, jamaat times) and routes the submission through the existing Eid-prayer queue. This preserves the dedicated Eid approval/data flow while keeping the public taxonomy under Spaces.

The type selector should not sit inside the same visual block as optional tags. It needs its own label, required marker, validation state, and placement above the optional Tags section so users understand it is classification, not metadata.

The optional Tags section must be keyed by the selected Type chip, not only by the broad category. Changing Type should rebuild the optional tags immediately.

Users can add custom type options for food/service/space type groups, same as restaurant cuisine. New custom type options are persisted to the `tags` lookup so future users can choose them.

Custom type labels are category-exclusive. If a user tries to add a type label that already exists in another high-level category, the app should block it and explain where it already belongs. For example, **Restaurant** cannot be added as a Spaces type because it is already a Food type.

## Filtering and Display

Places list tabs:

- All
- Spaces
- Food
- Services
- Saved

Filtering should expose the same separation:

- Category tabs filter broad high-level groups: Spaces, Food, Services, Saved.
- Type filters narrow within a group: Restaurant, Cafe, Mosque, Prayer Place, Cemetery, Grocery, Bookshop, Salon, etc.
- Optional tags remain separate from type filters.
- In the filter drawer, optional tags should appear before type groups so frequently used refinements such as Daily Prayers, Jummah, Wudu, Open Now, and Rated are not pushed down by the broad subtype selector.
- For Food filters, Cuisine and Food Type are both expandable groups. Cuisine stays optional and multi-select; Food Type narrows by primary venue type.

Place cards and popups should display the specific selected type label as the primary type badge. They should say **Mosque**, **Prayer Place**, **Cemetery**, **Grocery**, **Bookshop**, **Cafe**, **Salon**, etc. They should not say the high-level labels **Spaces** or **Services** as the place's specific identity.

Optional tags can still appear as secondary chips.

## Type-Specific Icons Plan

Do not implement type-specific icons in this pass.

Planned direction:

- Services should eventually have subtype-specific icons: grocery, butchery, cafe, bookshop, salon, clothing, charity, education, and so on.
- Spaces should eventually have subtype-specific icons: mosque, prayer place, cemetery, community hall, classroom, event space, wudu facility, sisters space, and so on.
- Until that icon system is designed and implemented, use the existing shop-style icon as the default Services icon and the existing prayer-room-style icon as the default Spaces icon.
- The data model should make this easy later by treating the single required type tag as the icon lookup key.

## Rollout Notes

No build step or runtime dependency is needed. This is a vanilla JS/data/schema-compatible change.

Server-side submission should accept and persist custom tag groups for:

- `restaurant_cuisine`
- `restaurant_restaurant_type`
- `service_service_type`
- `space_space_type`

Client-side validation improves UX, but server-side validation should also reject new/edit submissions where `service` or `space` lacks exactly one mandatory subtype tag.

Apply the D1 taxonomy migration after deploy/preview as needed:

```bash
npx wrangler d1 execute halal-finder-db-preview --remote --file=migrations/0005_services_spaces_taxonomy.sql
npx wrangler d1 execute halal-finder-db --remote --file=migrations/0005_services_spaces_taxonomy.sql
```
