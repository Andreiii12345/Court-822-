COURT822 owner camera QR scanner

Changed: owner-checkin.html and owner.html (scanner navigation link). All other site files preserved.

Deploy frontend to GitHub Pages. Use https://court822.club/owner-checkin.html signed in as owner. Allow camera access. QR codes from qr.html encode the raw 64-hex credential.

The existing owner-only court822_owner_checkin_team RPC performs check-in. Verify its server-side payment and QR validation before live event use. The frontend cannot guarantee those checks.

Individual shirt claiming is NOT implemented: existing repository contains no verified claim RPC/schema. This package intentionally does not write shirt claims or fabricate database tables.

Camera decoding uses jsQR CDN and requires network. Manual token/official link entry works as fallback. Test on mobile HTTPS and test duplicate check-ins.
