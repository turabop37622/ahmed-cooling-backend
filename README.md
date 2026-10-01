# Ahmed Cooling Workshop

This repository contains the Express API at the root and the Next.js customer/admin website in `web/`.

## Local setup

1. Use Node.js 20 or newer and a MongoDB database.
2. Copy `.env.example` to `.env` and set `MONGODB_URI`, a long random `JWT_SECRET`, `BREVO_API_KEY`, and email settings. Keep `.env` out of version control.
3. Run `npm install` and `npm run dev` at the repository root for the API.
4. In `web/`, run `npm install` and `npm run dev`. Set `NEXT_PUBLIC_API_URL` in `web/.env.local` to `http://localhost:5000/api`.
5. For Google login, configure `GOOGLE_CLIENT_ID` on the API and the same value as `NEXT_PUBLIC_GOOGLE_CLIENT_ID` on the website. Register the site's `/login` callback URL with Google.

The API listens on port 5000 by default. Its health endpoint is `/health`.

## Accounts and bookings

Customers must sign in before creating or managing a booking. The API always derives the booking owner from the verified token and the service price from MongoDB. Admin accounts are created from `ADMIN_SEED_EMAIL` and `ADMIN_SEED_PASSWORD` only when absent; startup never resets an existing admin password. Change the initial password after first login, and rotate any credentials previously stored in code.

## Checks

- API syntax: `node --check server.js` and `node --check routes/bookings.js`
- Website production build: run `npm run build` in `web/`

## Security notes

- Password reset and sign-up use a 6-digit code that is emailed, stored only as a hash, valid for 10 minutes, locked after 5 wrong guesses and limited to one email per minute. Reset always needs the email **and** the code.
- All request bodies, query strings and URL parameters containing MongoDB operators (`$ne`, `$gt`, dotted keys) are rejected in `server.js`.
- Set `TRUST_PROXY=1` when the API is behind Render/Vercel so per-visitor rate limits work.
- After changing a password every older login token stops working.
- One-time cleanup for null phone/email values: `node scripts/fix-user-nulls.js` (dry run) then `node scripts/fix-user-nulls.js --apply`.
- The service area is Saudi Arabia only: only `+966 5XXXXXXXX` phone numbers are accepted and all prices are in SAR.
- Run the tests with `npm test`.
