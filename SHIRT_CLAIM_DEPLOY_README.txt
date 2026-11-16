COURT822 OWNER QR CHECK-IN + INDIVIDUAL FREEBIE CLAIMS

1. Back up your Supabase schema and current GitHub site.
2. In Supabase SQL Editor, run COURT822_OWNER_SHIRT_CLAIMS.sql.
3. Upload the site files to GitHub and deploy. New files: owner-checkin-app.js and COURT822_OWNER_SHIRT_CLAIMS.sql. Replaced: owner-checkin.html.
4. Sign in as owner and open https://court822.club/owner-checkin.html.
5. Scan an already-issued QR and PREVIEW the team (does not check it in).
6. Check IDs in person; if a partner has no account, use Verify & create internal player profile. This creates a verified internal profile with user_id NULL only after explicit owner confirmation.
7. Check in team; then claim each player's freebie individually.

CAUTIONS:
- This migration is prepared against the schema and SQL definitions provided in chat, not tested on your live database. First test with an authorized registration and verify results.
- The freebie read function only returns players with verified identities. Partners with an existing matching email need manual review; the new RPC deliberately refuses silent duplicate identities.
- Existing QR, payments, and email records are not changed by installing this migration.
- Existing owner check-in RPC is reused unchanged. The SQL creates 3 additional owner-only RPCs.
- If SQL reports an unexpected constraint or missing function, STOP and share the exact error. Do not bypass checks.
- No QR credential is stored in localStorage or sent to external services by this page.
