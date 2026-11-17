COURT822 Club Name Restore

Changes: tournament.html adds optional per-player Club Name and saves/restores club_name in draft_data.players. owner-roster.js and owner.html display two club columns in approved roster and CSV via existing court822_owner_roster_clubs RPC.

The existing COURT822_CLUB_NAMES.sql must be installed (already installed according to prior verification).

Deploy all files from Court-822--4 to GitHub root. Hard refresh. Save a NEW draft with club names; older drafts show Independent. Test the owner roster only after a legitimate confirmed checkout.

No payment, QR, or database schema changes. The separate legacy owner-roster-.html page is not modified.
