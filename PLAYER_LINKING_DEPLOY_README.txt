COURT822 PLAYER ACCOUNT VERIFICATION - STAGED FRONTEND

New: verify-player.html. Reuses the existing player-login.html?next=verify-player.html flow and 8-digit OTP.

The supplied SQL RPC court822_link_my_partner_account() has not been hardened for production. This package deliberately does NOT call it automatically. The Link my registration button is disabled until the identity update guard, verified-vs-email distinction, and ambiguous profile linking are resolved and tested.

IMPORTANT: The uploaded repository does not contain the deployed court822-qr-dispatch Edge Function source. The QR email template was therefore NOT changed. Once the RPC is secured, add an ordinary link to https://court822.club/verify-player.html in that server-side email template. Do not put the team QR token in this verification link.

No existing payment, QR, check-in or registration JavaScript was changed.

To deploy: upload the extracted Court-822--4 folder contents to GitHub. Test player-login.html?next=verify-player.html with an authorized test account. This tests navigation ONLY; no account linking is performed.
