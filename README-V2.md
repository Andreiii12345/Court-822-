# Court 822 V2 — Replacement Guide

This folder is ready for your existing GitHub Pages repository.

## New features

- Automatic rolling 60-day booking calendar
- One to six-hour court rentals with one court kept for the full duration
- Automatic Court 1–4 assignment
- Whole-facility club booking for up to 40 players
- Club roster (one player per line)
- Payment-first booking with GCash/Maya reference and receipt upload
- Owner payment-proof review and approve/reject controls
- Owner walk-in player entry
- Skill levels 1–5
- Fair Open Play queue based on fewest games, sitting out, and waiting time
- Skill-balanced four-court rounds
- Cancelled/rejected bookings release their reserved court slots

## Step 1 — Run the database upgrade first

1. Sign in to Supabase.
2. Open your Court 822 project.
3. Click **SQL Editor** on the left.
4. Click **New query**.
5. Open `upgrade_v2.sql` from this package.
6. Copy all of its code and paste it into Supabase.
7. Click **Run** once.
8. Wait for **Success. No rows returned**.

Do not run the old `schema.sql` again. The V2 file upgrades the existing database without deleting your owner account or bookings.

## Step 2 — Add your payment QR images

Add these two image files to the same GitHub folder as `booking.html`:

- `gcash-qr.png`
- `maya-qr.png`

The names must be exact, including lowercase letters. PNG is recommended. The site still loads before you add them, but the QR image area stays hidden.

## Step 3 — Replace the GitHub files

In your repository `Court-822-`, replace or upload these files in the repository root:

1. `index.html`
2. `booking.html`
3. `owner.html`
4. `style.css`
5. `config.js`
6. `supabase-client.js`
7. `site.js`
8. `booking.js`
9. `owner.js`
10. `logo.svg`
11. `gcash-qr.png` when ready
12. `maya-qr.png` when ready

Do not upload `upgrade_v2.sql` to make the website work. That file is only copied into Supabase SQL Editor. It is safe to keep it in GitHub as a backup if you want.

For each old GitHub file:

1. Open the file.
2. Click the pencil icon.
3. Press `Ctrl+A`.
4. Paste the matching new code.
5. Click **Commit changes**.

Uploading all replacement files together using **Add file → Upload files** is faster.

## Step 4 — Wait for GitHub Pages

1. Open the repository **Actions** tab.
2. Wait for the Pages deployment to show a green check.
3. Open:
   `https://andreiii12345.github.io/Court-822-/booking.html`
4. Hard refresh with `Ctrl+F5` on Windows.

## Step 5 — Set rates and dates

1. Open `owner.html` from your live website.
2. Sign in with the existing owner account.
3. Open **Schedule & rates**.
4. Enter the hourly morning, afternoon, evening, Open Play, and club rates.
5. Enter the GCash/Maya account names and numbers.
6. Set each date to one of these modes:
   - **Court + club booking**
   - **Open Play only**
   - **Club only**
   - **Closed**
7. Click **Save settings**.

The next 60 days are generated automatically whenever the public page or owner dashboard opens. You no longer need to add dates every week.

## Step 6 — Test the full process

Use a test payment screenshot first:

1. Public: select a court, date, start time, duration, and player count.
2. Upload payment proof and submit.
3. Owner: open **Bookings & payments**.
4. Click **View proof**.
5. Click **Approve paid**.
6. Confirm that the status becomes `confirmed` and `paid`.
7. Try the same time again and check that the assigned court availability decreased.

For Open Play:

1. Owner: set a future date to **Open Play only** and save.
2. Public: join it, choose a skill level, and submit payment proof.
3. Owner: approve the payment.
4. Owner: open **Open Play** and select the event.
5. Add any walk-in players.
6. Click **Create fair round**.

Only confirmed players and paid cash walk-ins are included in the playing round. Unapproved and unpaid players stay visible but are not assigned to a court.

## Important payment note

The website verifies that a receipt and reference number were submitted, but it cannot independently confirm that money reached GCash or Maya. The owner must compare the receipt/reference with the actual wallet transaction before clicking **Approve paid**.
