# 어디가지 베타 실제 서비스 연결

User authorized connecting the previously disclosed AI, maps, authentication and cloud components.

- [x] Add server-only environment loading and safe public connection status.
- [x] Gemini (free-tier default) and optional OpenAI Responses structured conditions; validate output, disclose unavailable responses, timeouts and sanitized provider errors.
- [x] Kakao REST search and browser map SDK; real coordinates, source links, estimated costs explicitly labelled.
- [x] Supabase email signup/login via server with HttpOnly opaque session cookie; no password persistence. User-scoped profile/course tables with RLS SQL.
- [x] UI connection status, live/demo distinction, genuine login form and live map lifecycle.
- [x] Provider boundary tests, existing regression tests and local connection-status browser check: 18 tests passed.
- [ ] Actual provider calls and cross-user RLS verification: require owner-issued keys, domain registration and executing schema.sql in the owner's Supabase project.

No deployment provider account or billing plan has been created. Missing credentials block actual external verification, not local integration work.
