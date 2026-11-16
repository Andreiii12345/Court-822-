COURT822 Club Name update

1. Back up the existing GitHub site.
2. Run COURT822_CLUB_NAMES.sql in Supabase SQL Editor FIRST.
3. Upload the changed website files to GitHub: tournament.html, owner.html, owner-roster.js. Keep all other files unchanged.
4. Refresh the website and test with a NEW draft and registration. Both players can specify an optional club name; leaving it empty displays Independent.
5. Open Owner Dashboard > Teams & Players to see clubs in the approved roster and CSV export.

Important: Club names are saved inside the existing tournament_checkout_requests.draft_data.players JSON, not in permanent player profiles. Existing registrations without club data show Independent. No changes are made to checkout amounts, payment verification, QR issuance, or email delivery.

This feature requires the existing registration backend to preserve draft_data JSON without stripping club_name. Verify with a new controlled registration before live use. If the new owner RPC fails, inspect the database function and do not bypass owner authorization.
