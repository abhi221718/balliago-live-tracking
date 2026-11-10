# BalliaGo — shuru karne ki Hindi guide

Yeh Ballia ke liye Bike, Auto aur Cab booking ka development starter hai.

## ZIP extract karein
1. `BalliaGo-Live-Ride-Complete.zip` ko Windows par Extract All karein.
2. Extract folder VS Code mein Open Folder karein.
3. PC par Node.js 20+ install hona chahiye.

## A. MongoDB Atlas
1. Atlas mein Project aur Cluster create karein (free M0 agar available ho).
2. Security > Database Access > Add Database User se username/password banayein.
3. Security > Network Access mein apna current IP add karein.
4. Cluster > Connect > Drivers > Node.js se connection string copy karein.
5. `server/.env.example` ko copy karke `.env` banayein.
6. `.env` mein `MONGO_URI` ke andar apni Atlas connection string rakhein. `<password>` ko apne DB user password se replace karein aur database name `balliago` rakhein. Query string mein `authSource=admin` zaroor rakhein; password ke special characters ko URL-encode karein.
7. `JWT_SECRET` ko ek lambi random secret value se replace karein. Is file ko GitHub par upload na karein.

## B. Backend chalayein (VS Code Terminal / PowerShell)
```powershell
cd server
Copy-Item .env.example .env
npm install
npm run dev
```
Health check browser mein: `http://localhost:5000/api/health`

## C. Website chalayein (naya terminal)
```powershell
cd web
Copy-Item .env.example .env
npm install
npm run dev
```
Terminal mein jo localhost URL aaye use browser mein kholein.

## D. Mobile app chalayein (naya terminal)
```powershell
cd mobile
Copy-Item .env.example .env
npm install
npx expo start
```
Expo Go se QR scan karke test karein. Physical phone ke liye `mobile/.env` mein `EXPO_PUBLIC_API_URL` ko PC ke LAN IP aur port 5000 par set karein, jaise `http://192.168.1.10:5000` (yeh sirf example hai; apna IP use karein). Phone aur PC same Wi-Fi par hon.

## E. Pehla test
- Pehle backend, phir website/mobile start karein.
- Customer aur Captain ke liye alag test accounts banayein.
- Captain approval abhi Atlas mein test-only manual step hai; production ke liye secure Admin approval panel banana zaroori hai.

## Zaroori baatein
- Apna Atlas password, connection string, JWT secret, Google Maps key kisi ko chat mein na bhejein.
- Agar password mein `@`, `#`, `%`, `/` jaise characters hain to connection string mein URL-encode karna hoga.
- Yeh MVP starter hai, Play Store/App Store release ke liye final app nahi. Payment, verified phone OTP, KYC/admin panel, SOS, background tracking, security hardening, tests aur deployment abhi baaki hain.
- Uttar Pradesh mein paid passenger rides shuru karne se pehle applicable aggregator licence, permits, driver/vehicle eligibility, insurance aur safety compliance confirm karein.
