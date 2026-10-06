# 어디가지 베타 mobile prototype

The user named the app 어디가지 베타 during implementation. The historical filename is retained; product branding uses only the requested name.

Approved direction: clean, sophisticated couples' date/travel planner; map and chat share the same itinerary. Browser-based responsive prototype, not a packaged iOS/Android release.

White #ffffff, canvas #f6f7f9, charcoal #18212f, blue #3159df, muted #737d8c, pale blue #edf2ff. Korean system sans body and Georgia italic for restrained English wordmark. Signature: a blue dotted itinerary winding through an illustrated neighborhood map, coordinated with numbered itinerary cards.

Screens: discover map, conversational planning, course detail, place detail, saved courses, profile. Onboarding: demo login/signup, optional gender/age/interests/personality/MBTI survey, location permission with manual fallback. Region, purpose, atmosphere, transport, per-person budget, date/time and indoor/outdoor controls update one shared model.

Local Node server serves static assets and a deterministic sample recommendation API. No cloud accounts, real login, live maps, external AI or actual business information. UI and API must identify demo data. Profile and saved itineraries are stored in this browser only; do not persist passwords or exact location. Three sample neighborhoods. Unsupported regions produce an actionable error. Enforce per-person budget, duration and indoor/outdoor constraints; report empty results rather than claiming a match.

Mobile bottom navigation; desktop narrow rail and split explore/map workspace. Modal dialogs have focus management, Escape dismissal, labelled fields. Safe rendering of all user text. Reduced-motion support. Real server startup and API tests; desktop and mobile browser verification when available.
