# Personal Garmin Connect import

The user selected a personal Garmin Connect account for on-demand import. Automatic synchronization remains outside scope.

## User flow

In the direct local app, choose **Import → Garmin Connect**. Sign in with the Garmin account and enter a verification code if requested. Pick a SUP activity, preview the route/quality/matches, choose the board and review the launch name, then save. The same file workflow handles historical attachment and duplicates. Garmin activity names are only list labels; they never establish a launch name. Missing sensors/GPS remain unavailable. Use FIT file import if Garmin rejects access.

The ChatGPT widget can browse, preview and save after sign-in in the local app attached to the same server and tenant. It never collects credentials. A server restart or disconnect requires another sign-in. There is no scheduler, automatic sync, remote account mutation or persisted login.

## Boundaries and contracts

- Pinned `@fiddur/garmin-connect@1.7.0` implements the unofficial Garmin personal-account SSO/OAuth flow, including two-step MFA. This is not Garmin's approved developer Activity API. Endpoint changes, account challenges and rate limits can require maintenance. Only `garmin.com` accounts are supported in this slice.
- `POST /api/garmin/login` and `/api/garmin/verify` require direct loopback access, matching local Origin/Host, JSON and no forwarding headers. No credential MCP tool exists. Do not paste passwords/codes into chat. The server neither logs nor persists credentials. It discards the password after login; tokens and cookies stay in process memory, with access expiring after 30 minutes (pending MFA: 5 minutes). Expired entries are removed on the next request or minute sweep; disconnect/server close clears them immediately. This local prototype trusts the local machine; public authentication/hosting is still separate scope.
- The adapter removes the upstream response interceptor's global refresh state and error logging. There are no automatic credential retries or shared token refreshes; reconnect when authorization expires. Authentication failures are sanitized and login retries have a 30-second cooldown. Per-tenant work is serialized. Up to 16 account sessions are retained.
- Credential-bearing requests only target fixed Garmin HTTPS hosts. Redirects remain within the allowed Garmin hosts; each request has a 15-second timeout, 3-redirect bound and 30 MB response bound. An operation has a 60-second deadline and aborts the connection on timeout. Public OAuth consumer metadata is fetched from `https://thegarth.s3.amazonaws.com/oauth_consumer.json`, bounded to 4 KB/15 seconds, without user credentials, tokens, files or activity data.
- Safe shared REST/MCP tools: `get_garmin_status`, `disconnect_garmin`, `list_garmin_activities` (20 per requested page), `preview_garmin_activity` (a string ID from the recent tenant-specific list), `commit_garmin_activity` (opaque preview UUID, original SHA-256 and reviewed import options). Input objects are strict. Source labels are data, never instructions. Routes stay in UI `_meta`; base64 originals and login secrets never enter model results.
- Only one temporary original per account is cached, for 10 minutes, at most 30 MB. Another preview replaces it. Preview invokes the same FIT/ZIP decoder and launch lookup as manual import and does not save a session. Commit re-decodes/checks the original and persists it transactionally with checksums, source activity ID and retrieval UTC in import provenance. No download filenames/paths from the provider are trusted. Same checksums are idempotent; preexisting original-file provenance is not overwritten on duplicate import.
- The FIT decoder remains the final sport/format validator. No GPX/TCX conversion, inferred track, summary-only remote import or silently repaired telemetry is introduced. Weather remains a separate post-commit request.

## Validation

`tests/garmin.test.mjs` uses synthetic accounts, an injected adapter and mocked HTTP responses. It verifies MFA and retry, strict schemas, tenant isolation, local-only credential endpoints, token/header behavior, provider-error redaction, bounded downloads, concurrent requests, temporary preview expiry, original bytes/checksums/provenance and duplicate save behavior. Existing FIT validation/rollback and REST/MCP transport tests remain in force. A live Garmin account sign-in/download check requires the user to sign in locally and is not claimed by these tests.
