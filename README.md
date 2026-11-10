# BalliaGo — MERN + Expo starter

Green + white ride-booking platform starter for Ballia.

## Architecture
- `server/`: Node.js, Express, MongoDB, JWT authentication, ride APIs
- `web/`: React + Vite customer/admin starter website
- `mobile/`: Expo React Native app for Android and iOS (customer/captain role selector)

This is a development MVP scaffold, not a licensed ride aggregator or production-ready dispatch/payment system.
Do not accept paid passenger rides until the applicable Uttar Pradesh aggregator licence, vehicle/driver eligibility, permits, insurance, safety and other requirements have been confirmed with the State Transport Authority.

## Requirements
- Node.js 20+
- MongoDB local or Atlas
- Expo Go for quick mobile testing
- Android Studio / Xcode for native builds

## 1. Backend
```bash
cd server
cp .env.example .env
npm install
npm run dev
```
Set `MONGO_URI` and a long random `JWT_SECRET` in `.env`.
API runs at `http://localhost:5000`.

Health check: `GET /api/health`

## 2. Website
```bash
cd web
cp .env.example .env
npm install
npm run dev
```
Open the Vite URL. Set `VITE_API_URL=http://localhost:5000`.

## 3. Android + iOS app
```bash
cd mobile
cp .env.example .env
npm install
npx expo start
```
Scan QR with Expo Go. For a physical phone, set `EXPO_PUBLIC_API_URL` to your computer's LAN IP, e.g. `http://192.168.1.5:5000` (not localhost).
For production builds, configure EAS and platform credentials.

## Deploy the web demo to Render
1. Connect your GitHub account to Render and create a Blueprint from the `main` branch of this repository.
2. When prompted, enter your MongoDB Atlas connection string for `MONGO_URI` in Render. Do not commit it to GitHub. Render generates `JWT_SECRET` automatically.
3. The web preview is already deployed at `https://balliago.onrender.com`. Deploy the API from the Blueprint to enable account and ride features; its health check will be at `https://balliago-api-abhi221718.onrender.com/api/health`.
4. Ensure your Atlas network access list allows connections from Render without exposing the database broadly.

The free API service can sleep when idle, so the first request after inactivity may take a little while. The mobile app is not published by this web deployment; set `EXPO_PUBLIC_API_URL` to the deployed API URL before testing it with Expo.

## Demo flow
1. Register a user in the website or mobile app.
2. Login and request a ride using pickup/drop labels and vehicle type.
3. Captain can be registered with role `captain` and see open ride requests.
4. Captain accepts a ride. This scaffold uses basic polling/manual refresh, not real-time dispatch.

## Important next engineering steps
- Add OTP provider integration (Firebase Phone Auth or a compliant provider); current auth is email/password demo auth.
- Add Google Maps/Mapbox maps, geocoding, route distance and fare estimation.
- Add Socket.IO location streaming and robust nearby-driver matching.
- Add captain KYC workflow, document storage with private access, vehicle checks and admin approval.
- Add payment gateway only after business/legal setup.
- Add audit logs, rate limiting, input validation, monitoring, backups, security review and tests.
- Add SOS, trip sharing, emergency escalation, grievance redressal and insurance workflows.


## Live Ride module
See `LIVE-RIDE-SETUP.md` for MongoDB Atlas, Google Maps, Socket.IO, mobile permissions, captain approval and end-to-end test steps.
