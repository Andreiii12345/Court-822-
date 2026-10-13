# Court 822 Booking Website

GitHub-ready public booking website and private owner dashboard for Court 822.

## Included features

- Four-court public reservations
- Morning, afternoon, and evening pricing
- Owner-controlled Regular Booking, Open Play Only, and Closed dates
- Maximum 40 Open Play players
- Owner-only fair player randomizer for four courts
- Paid, Unpaid, and Partial payment tracking
- Automatic remaining-balance calculation
- Secure Supabase owner authentication
- Database protection with Row Level Security
- Double-booking protection

## Project files

```text
court-822/
├── index.html
├── booking.html
├── owner.html
├── vercel.json
├── README.md
├── .gitignore
├── assets/
│   └── logo.svg
├── css/
│   └── style.css
├── js/
│   ├── config.js
│   ├── supabase-client.js
│   ├── site.js
│   ├── booking.js
│   └── owner.js
└── supabase/
    └── schema.sql
```

## 1. Upload to GitHub

1. Create a new private GitHub repository named `court-822-booking`.
2. Open the repository and select **Add file → Upload files**.
3. Upload the **contents** of this folder so `index.html` is in the repository root.
4. Commit the files to the `main` branch.

## 2. Create Supabase

1. Create a project at <https://supabase.com>.
2. Open **SQL Editor**.
3. Create a new query.
4. Copy everything from `supabase/schema.sql`.
5. Run the query once.

This creates the tables, public booking functions, payment fields, Open Play rotation functions, and security policies.

## 3. Create the owner account

1. In Supabase, open **Authentication → Users**.
2. Select **Add user**.
3. Enter the owner's email and a strong password.
4. Copy the new user's UUID.
5. Open **SQL Editor** and run:

```sql
update public.profiles
set role = 'owner'
where id = 'PASTE_OWNER_USER_UUID_HERE';
```

Replace the placeholder with the real UUID. Only this owner account can read customer details, update payments, change schedules, or run the randomizer.

## 4. Connect the website to Supabase

In Supabase, open **Project Settings → API** and copy:

- Project URL
- Publishable key or anon key

Open `js/config.js` and replace:

```js
window.COURT822_CONFIG = {
  SUPABASE_URL: "YOUR_SUPABASE_PROJECT_URL",
  SUPABASE_ANON_KEY: "YOUR_SUPABASE_PUBLISHABLE_OR_ANON_KEY"
};
```

Do not use or upload the Supabase `service_role` key. The website only needs the browser-safe publishable/anon key, protected by the included Row Level Security policies.

## 5. Test locally

Do not double-click the HTML files when testing database features. Start a local web server in VS Code:

1. Install the **Live Server** extension.
2. Right-click `index.html`.
3. Select **Open with Live Server**.
4. Test `booking.html` and `owner.html`.

Without Supabase values, the pages show demo data. Once `js/config.js` is configured, they use the live database.

## 6. Publish using Vercel

1. Create or sign in to <https://vercel.com> using GitHub.
2. Select **Add New → Project**.
3. Import `court-822-booking`.
4. Keep the framework setting as **Other**.
5. Leave the build command empty.
6. Click **Deploy**.

The public link will look similar to:

```text
https://court-822-booking.vercel.app
```

Future GitHub commits automatically trigger updated deployments.

## 7. Replace the logo

Replace `assets/logo.svg` with the official Court 822 logo. If the real logo is a PNG, name it `logo.png` and change every `assets/logo.svg` reference in the three HTML files to `assets/logo.png`.

## Important production notes

- Test booking conflicts using two different devices.
- Confirm that a public visitor cannot open customer records.
- Use the owner dashboard to confirm or cancel bookings.
- New bookings start as **Unpaid**.
- Update the paid amount or payment status after verifying payment.
- For automatic GCash or card payments, add a payment provider and verified webhook later. Never collect card details directly in this website.
