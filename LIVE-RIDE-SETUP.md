# BalliaGo Live Ride — Setup & test guide

## A. MongoDB Atlas setup (free tier availability/limits may change)
1. Create an account at https://www.mongodb.com/atlas
2. Create a project named `BalliaGo`.
3. Create a free/shared cluster if offered in your region.
4. Under Database Access, create a database user and strong password.
5. Under Network Access, add your current public IP. Avoid `0.0.0.0/0` except temporary isolated testing; remove it immediately if used.
6. Click Connect → Drivers → Node.js and copy the connection string.
7. Replace `<db_user>`, `<db_password>`, and `<cluster-host>` in `server/.env`.
8. Use database name `balliago`.

Example:
`mongodb+srv://balliago_user:URL_ENCODED_PASSWORD@cluster0.xxxxx.mongodb.net/balliago?retryWrites=true&w=majority`

If password contains `@`, `#`, `%`, `/` or other reserved characters, URL-encode it.
Add `&authSource=admin` to the query string when the URI names the `balliago` database; Atlas database users authenticate against `admin`.

## B. Google Maps Platform setup
1. Open https://console.cloud.google.com/
2. Create a Google Cloud project `BalliaGo`.
3. Add billing as required by Google; Maps Platform is usage-billed and quotas/pricing can change.
4. Enable Maps SDK for Android and Maps SDK for iOS.
5. Create separate API keys:
   - Android key: restrict by Android package `com.balliago.app` and your signing SHA-1 fingerprints.
   - iOS key: restrict to the iOS app/bundle identifier where supported.
6. Put the keys in `mobile/app.json` under the Android and iOS maps config.
7. Keep server-side web service keys separate from mobile keys; restrict them by API and server IP where possible.
8. Never commit unrestricted keys to GitHub. Rotate any exposed key.

Google Maps SDK keys are native build-time config. After changing app.json, rebuild the native app; Expo Go may not reflect custom native configuration reliably.

## C. Backend
```bash
cd server
copy .env.example .env
npm install
npm run dev
```
PowerShell copy command:
`Copy-Item .env.example .env`

Set:
- `MONGO_URI`
- `JWT_SECRET` (long random secret)
- `CLIENT_ORIGINS`
- `CAPTAIN_SEARCH_RADIUS_METERS=5000`

API health:
`http://localhost:5000/api/health`

## D. Mobile app
```bash
cd mobile
Copy-Item .env.example .env
npm install
npx expo start
```
Set `EXPO_PUBLIC_API_URL` to your computer LAN IP, not `localhost`, when testing on a physical phone.
Example `http://192.168.1.10:5000`.
Ensure phone and PC are on the same Wi-Fi and Windows Firewall allows Node.js on private networks.

For native maps configuration, use a development build:
```bash
npx expo install expo-dev-client
npx expo prebuild
npx expo run:android
```
For iOS local native build, use macOS with Xcode:
```bash
npx expo run:ios
```
Cloud builds can be configured with EAS:
```bash
npx eas-cli login
npx eas-cli build:configure
npx eas-cli build --platform all
```

## E. Captain approval for local development
Captain accounts are deliberately unapproved by default. Do not open captain location sharing until documents and eligibility have been reviewed.
For a local-only test, use MongoDB Atlas Data Explorer:
1. Open `balliago` → `users`.
2. Find the test captain document by email.
3. Set `isApproved` to `true`.
4. This is only a local development test switch. Production needs a secure admin approval workflow and audit log.

## F. End-to-end test
1. Start backend.
2. Start the mobile app or web app on two phones/devices (or one app instance and a simulator). Browser geolocation requires HTTPS outside localhost.
3. Register a customer.
4. Register a captain with another email.
5. Approve the test captain in Atlas (local test only).
6. Log in as captain, press Go online.
7. Log in as customer on another device; select pickup and drop by tapping map; request ride.
8. Captain should receive `ride:request`; refresh rides and accept.
9. Both customer and captain allow location access. On web, captain presses Go online; on mobile, captain presses Go online & share location.
10. Once accepted, each side sees the other side move on the live ride map. The customer shares location only during an accepted/started ride; sharing stops when the ride ends or is cancelled.
11. When the captain accepts, a demo start OTP is emitted to the authenticated customer's app socket and shown in an alert. The customer shares it with the assigned captain, who enters it to start the ride. This demo socket delivery is not a substitute for production SMS/verified notification delivery. Never expose OTP in logs or to unauthorised users.

## G. Current limitations — do not treat as production-ready
- Fare is a fixed demo amount, not Google Routes distance/time fare.
- Location tracking is foreground-only; background tracking requires additional Expo permissions, native configuration, store policy compliance and battery testing.
- Live customer/captain location sharing runs only during an active assigned ride and requires location permission and an active socket connection.
- Customer map tap selection is a basic two-tap pickup/drop interaction.
- Captain receives socket event but ride list refresh is manual.
- OTP delivery/customer visibility flow needs a verified SMS/notification provider and secure design.
- No payment, refunds, payout, SOS escalation, trip sharing, admin panel, KYC document workflow, fraud controls or audit logs.
- Nearby matching is a basic MongoDB geospatial query, not a production dispatch algorithm.
- Socket disconnect/offline cleanup, stale GPS detection, location privacy and retention policies must be implemented.
- Obtain all applicable UP aggregator, vehicle, driver, permit and insurance approvals before commercial passenger rides.
