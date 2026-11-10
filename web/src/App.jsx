import React, { useEffect, useRef, useState } from "react";
import { io } from "socket.io-client";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

const API = import.meta.env.VITE_API_URL || (import.meta.env.DEV
  ? "http://localhost:5000"
  : "https://balliago-api-abhi221718.onrender.com");
const BALLIA = { lat: 25.758, lng: 84.148 };

async function resolveLocationName(lat, lng) {
  try {
    const response = await fetch(`https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${lat}&lon=${lng}`);
    if (!response.ok) throw new Error("Unable to resolve address");
    const data = await response.json();
    return data.display_name || `Selected location (${lat.toFixed(4)}, ${lng.toFixed(4)})`;
  } catch {
    return `Selected location (${lat.toFixed(4)}, ${lng.toFixed(4)})`;
  }
}

function Mark({ children }) {
  return <span className="mark" aria-hidden="true">{children}</span>;
}

function MapPicker({ pickup, drop, onPickupChange, onDropChange, liveCustomer, liveCaptain, readOnly = false }) {
  const [mapMode, setMapMode] = useState("pickup");
  const mapModeRef = useRef(mapMode);
  const mapContainerRef = useRef(null);
  const mapRef = useRef(null);
  const pickupMarkerRef = useRef(null);
  const dropMarkerRef = useRef(null);
  const pathRef = useRef(null);
  const leafletRef = useRef(null);
  const liveCustomerMarkerRef = useRef(null);
  const liveCaptainMarkerRef = useRef(null);

  useEffect(() => {
    mapModeRef.current = mapMode;
  }, [mapMode]);

  useEffect(() => {
    if (!mapContainerRef.current || mapRef.current) return;
    leafletRef.current = L;
    const map = L.map(mapContainerRef.current, { zoomControl: true, scrollWheelZoom: true });
    mapRef.current = map;
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution: "&copy; OpenStreetMap contributors"
    }).addTo(map);
    map.setView([BALLIA.lat, BALLIA.lng], 12);

    pickupMarkerRef.current = L.marker([pickup.coordinates.lat, pickup.coordinates.lng], { title: "Pickup" }).addTo(map);
    dropMarkerRef.current = L.marker([drop.coordinates.lat, drop.coordinates.lng], { title: "Drop" }).addTo(map);
    pathRef.current = L.polyline(
      [[pickup.coordinates.lat, pickup.coordinates.lng], [drop.coordinates.lat, drop.coordinates.lng]],
      { color: "#1a804b", weight: 4, opacity: 0.85 }
    ).addTo(map);

    map.on("click", async (event) => {
      if (readOnly) return;
      const lat = event.latlng.lat;
      const lng = event.latlng.lng;
      const address = await resolveLocationName(lat, lng);

      if (mapModeRef.current === "pickup") {
        onPickupChange({ address, coordinates: { lat, lng } });
      } else {
        onDropChange({ address, coordinates: { lat, lng } });
      }
    });

    return () => {
      map.remove();
      mapRef.current = null;
      pickupMarkerRef.current = null;
      dropMarkerRef.current = null;
      pathRef.current = null;
      liveCustomerMarkerRef.current = null;
      liveCaptainMarkerRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (!mapRef.current || !pickupMarkerRef.current || !dropMarkerRef.current || !pathRef.current) return;

    pickupMarkerRef.current.setLatLng([pickup.coordinates.lat, pickup.coordinates.lng]);
    dropMarkerRef.current.setLatLng([drop.coordinates.lat, drop.coordinates.lng]);
    pathRef.current.setLatLngs([
      [pickup.coordinates.lat, pickup.coordinates.lng],
      [drop.coordinates.lat, drop.coordinates.lng]
    ]);
    mapRef.current.fitBounds([
      [pickup.coordinates.lat, pickup.coordinates.lng],
      [drop.coordinates.lat, drop.coordinates.lng]
    ], { padding: [30, 30] });
  }, [pickup, drop]);

  useEffect(() => {
    const map = mapRef.current;
    const L = leafletRef.current;
    if (!map || !L) return;

    const updateMarker = (markerRef, point, color, label) => {
      if (!point) {
        if (markerRef.current) map.removeLayer(markerRef.current);
        markerRef.current = null;
        return;
      }
      const position = [point.lat, point.lng];
      if (markerRef.current) markerRef.current.setLatLng(position);
      else {
        markerRef.current = L.circleMarker(position, {
          radius: 9, color: "#fff", weight: 3, fillColor: color, fillOpacity: 1
        }).addTo(map).bindTooltip(label, { direction: "top" });
      }
    };

    updateMarker(liveCustomerMarkerRef, liveCustomer, "#8b5cf6", "Customer live location");
    updateMarker(liveCaptainMarkerRef, liveCaptain, "#2563eb", "Captain live location");
  }, [liveCustomer, liveCaptain]);

  return <div className="map-picker-panel">
    {!readOnly && <div className="map-picker-toggle">
      <button type="button" className={mapMode === "pickup" ? "active" : ""} onClick={() => setMapMode("pickup")}>Pickup</button>
      <button type="button" className={mapMode === "drop" ? "active" : ""} onClick={() => setMapMode("drop")}>Drop</button>
    </div>}
    <div ref={mapContainerRef} className="map-picker" aria-label="Map for selecting pickup and drop locations" />
  </div>;
}

function LiveRideMap({ ride, customerLocation, captainLocation }) {
  const emptyHandler = () => {};
  return <MapPicker
    pickup={ride.pickup}
    drop={ride.drop}
    onPickupChange={emptyHandler}
    onDropChange={emptyHandler}
    liveCustomer={customerLocation?.rideId === ride._id ? customerLocation : null}
    liveCaptain={captainLocation?.rideId === ride._id ? captainLocation : null}
    readOnly
  />;
}

export default function App() {
  const [role, setRole] = useState("customer");
  const [isLogin, setIsLogin] = useState(false);
  const [form, setForm] = useState({ name: "", email: "", password: "", phone: "" });
  const [token, setToken] = useState(localStorage.getItem("bg_token") || "");
  const [user, setUser] = useState(null);
  const [pickup, setPickup] = useState({ address: "Ballia Railway Station", coordinates: { lat: 25.758, lng: 84.148 } });
  const [drop, setDrop] = useState({ address: "Ballia Bus Stand", coordinates: { lat: 25.764, lng: 84.149 } });
  const [activeRide, setActiveRide] = useState(null);
  const [captainLocation, setCaptainLocation] = useState(null);
  const [customerLocation, setCustomerLocation] = useState(null);
  const [myLocation, setMyLocation] = useState(null);
  const [captainOnline, setCaptainOnline] = useState(false);
  const [vehicleType, setVehicleType] = useState("bike");
  const [rides, setRides] = useState([]);
  const [message, setMessage] = useState("");
  const [messageType, setMessageType] = useState("");
  const [loading, setLoading] = useState(false);
  const socketRef = useRef(null);
  const geolocationWatchRef = useRef(null);

  const update = (key, value) => setForm(old => ({ ...old, [key]: value }));

  async function request(path, options = {}) {
    let response;
    try {
      response = await fetch(`${API}${path}`, {
        ...options,
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
          ...options.headers
        }
      });
    } catch {
      throw new Error("BalliaGo server se connection nahi ho pa raha. Kripya thodi der baad phir koshish karein.");
    }

    let data;
    try {
      data = await response.json();
    } catch {
      throw new Error("Server se sahi response nahi mila. Kripya thodi der baad phir koshish karein.");
    }
    if (!response.ok) throw new Error(data.message || "Request poori nahi ho saki. Dobara koshish karein.");
    return data;
  }

  async function auth(event) {
    event.preventDefault();
    setLoading(true);
    setMessage("");
    try {
      const { name, email, password, phone } = form;
      const data = await request(`/api/auth/${isLogin ? "login" : "register"}`, {
        method: "POST",
        body: JSON.stringify({
          name: name.trim(),
          email: email.trim().toLowerCase(),
          password,
          phone: phone.trim(),
          role
        })
      });
      setToken(data.token);
      setUser(data.user);
      localStorage.setItem("bg_token", data.token);
      setMessage(isLogin ? "Aap login ho gaye. Safar shuru karein!" : "Account ban gaya! BalliaGo mein aapka swagat hai.");
      setMessageType("success");
    } catch (error) {
      setMessage(error.message);
      setMessageType("error");
    } finally {
      setLoading(false);
    }
  }

  async function loadRides() {
    try {
      const data = await request("/api/rides/mine");
      setRides(data.rides);
      setActiveRide(data.rides.find(ride => ["accepted", "started"].includes(ride.status)) || null);
      setMessage("");
    } catch (error) {
      setMessage(error.message);
      setMessageType("error");
    }
  }

  useEffect(() => {
    if (!token) return undefined;
    const socket = io(API, { transports: ["websocket"], auth: { token } });
    socketRef.current = socket;
    socket.on("connect_error", error => {
      setMessage(`Live connection error: ${error.message}`);
      setMessageType("error");
    });
    socket.on("ride:captain-location", point => setCaptainLocation(point));
    socket.on("ride:customer-location", point => setCustomerLocation(point));
    socket.on("ride:accepted", () => {
      setMessage("Captain ne ride accept kar li. Live tracking shuru ho raha hai.");
      setMessageType("success");
      loadRides();
    });
    socket.on("ride:started", loadRides);
    socket.on("ride:completed", () => {
      setActiveRide(null);
      setCaptainLocation(null);
      setCustomerLocation(null);
      loadRides();
    });
    socket.on("ride:cancelled", () => {
      setActiveRide(null);
      setCaptainLocation(null);
      setCustomerLocation(null);
      loadRides();
    });
    loadRides();
    return () => {
      socket.emit("captain:offline");
      socket.disconnect();
      socketRef.current = null;
    };
  }, [token]);

  useEffect(() => {
    if (user?.role !== "customer" || !activeRide || !["accepted", "started"].includes(activeRide.status)) {
      return undefined;
    }
    if (!navigator.geolocation) {
      setMessage("Is browser mein live location share karna available nahi hai.");
      setMessageType("error");
      return undefined;
    }

    geolocationWatchRef.current = navigator.geolocation.watchPosition(
      ({ coords }) => {
        const point = { lat: coords.latitude, lng: coords.longitude };
        setMyLocation(point);
        socketRef.current?.emit("customer:location", {
          rideId: activeRide._id, lat: point.lat, lng: point.lng
        });
      },
      () => {
        setMessage("Live tracking ke liye browser location permission allow karein.");
        setMessageType("error");
      },
      { enableHighAccuracy: true, maximumAge: 5000, timeout: 15000 }
    );
    return () => {
      if (geolocationWatchRef.current !== null) {
        navigator.geolocation.clearWatch(geolocationWatchRef.current);
        geolocationWatchRef.current = null;
      }
    };
  }, [user?.role, activeRide?._id, activeRide?.status]);

  async function book() {
    try {
      await request("/api/rides", { method: "POST", body: JSON.stringify({ pickup, drop, vehicleType }) });
      setMessage("Ride request ban gayi. Yeh demo hai; driver dispatch ki guarantee nahi hai.");
      setMessageType("success");
      loadRides();
    } catch (error) {
      setMessage(error.message);
      setMessageType("error");
    }
  }

  async function accept(id) {
    try {
      await request(`/api/rides/${id}/accept`, { method: "PATCH" });
      setMessage("Ride accept ho gayi.");
      setMessageType("success");
      loadRides();
    } catch (error) {
      setMessage(error.message);
      setMessageType("error");
    }
  }

  function captainGoOnline() {
    if (!navigator.geolocation) {
      setMessage("Is browser mein live location share karna available nahi hai.");
      setMessageType("error");
      return;
    }

    navigator.geolocation.getCurrentPosition(({ coords }) => {
      const point = { lat: coords.latitude, lng: coords.longitude };
      socketRef.current?.emit("captain:online", {
        lat: point.lat, lng: point.lng, heading: coords.heading || 0
      }, result => {
        if (!result?.ok) {
          setMessage(result?.message || "Captain online nahi ho paya.");
          setMessageType("error");
          return;
        }
        setCaptainOnline(true);
        setMyLocation(point);
        setMessage("Aap online hain. Assigned customer aapki live location dekh sakta hai.");
        setMessageType("success");
        if (geolocationWatchRef.current !== null) navigator.geolocation.clearWatch(geolocationWatchRef.current);
        geolocationWatchRef.current = navigator.geolocation.watchPosition(
          ({ coords: current }) => {
            const location = { lat: current.latitude, lng: current.longitude };
            setMyLocation(location);
            socketRef.current?.emit("captain:location", {
              lat: location.lat, lng: location.lng, heading: current.heading || 0
            });
          },
          () => {
            setMessage("Captain location update nahi ho rahi. Browser location access check karein.");
            setMessageType("error");
          },
          { enableHighAccuracy: true, maximumAge: 5000, timeout: 15000 }
        );
      });
    }, () => {
      setMessage("Online hone ke liye browser location permission allow karein.");
      setMessageType("error");
    }, { enableHighAccuracy: true, timeout: 15000 });
  }

  function captainGoOffline() {
    socketRef.current?.emit("captain:offline", result => {
      if (!result?.ok) {
        setMessage(result?.message || "Offline nahi ho paya.");
        setMessageType("error");
      }
    });
    if (geolocationWatchRef.current !== null && navigator.geolocation) {
      navigator.geolocation.clearWatch(geolocationWatchRef.current);
      geolocationWatchRef.current = null;
    }
    setCaptainOnline(false);
    setMyLocation(null);
  }

  function logout() {
    if (user?.role === "captain") captainGoOffline();
    localStorage.removeItem("bg_token");
    setToken("");
    setUser(null);
    setRides([]);
    setActiveRide(null);
    setCaptainLocation(null);
    setCustomerLocation(null);
    setMessage("");
  }

  async function useCurrentLocation() {
    if (!navigator.geolocation) {
      setMessage("Aapke browser mein location access available nahi hai.");
      setMessageType("error");
      return;
    }

    navigator.geolocation.getCurrentPosition(async ({ coords }) => {
      const address = await resolveLocationName(coords.latitude, coords.longitude);
      setPickup({
        address,
        coordinates: { lat: coords.latitude, lng: coords.longitude }
      });
      setMessage("Aapki current location pickup ke roop mein set ho gayi.");
      setMessageType("success");
    }, () => {
      setMessage("Location permission deny hua. Manual address aur map se location select karein.");
      setMessageType("error");
    }, { enableHighAccuracy: true, timeout: 12000 });
  }

  return <main className="app-shell">
    <nav className="topbar">
      <a className="brand" href="#" aria-label="BalliaGo home"><Mark>B</Mark><span>Ballia<span className="brand-light">Go</span></span></a>
      <span className="topbar-tag"><span className="live-dot" /> Apne shehar ki apni ride</span>
      {token && <button className="nav-logout" onClick={logout}>Logout</button>}
    </nav>

    {!token ? <section className="auth-layout">
      <div className="welcome-panel">
        <div className="welcome-copy">
          <span className="eyebrow"><span className="eyebrow-dot" /> BALLIA, AB SAFAR AASAN</span>
          <h1>Apni ride.<br />Apna <span>Ballia.</span></h1>
          <p>Shehar ke har kone tak, apno ke saath. Bike, auto ya cab — aapki manzil ka safar yahin se shuru hota hai.</p>
        </div>
        <div className="route-art" aria-hidden="true">
          <div className="route-line" />
          <div className="route-pin pin-start"><span /></div>
          <div className="route-pin pin-end"><span /></div>
          <div className="route-label label-start"><b>Ballia</b><small>Safar yahan se</small></div>
          <div className="route-label label-end"><b>Aapki manzil</b><small>Chaliye saath</small></div>
          <div className="route-car">✦</div>
          <div className="city-card"><span className="city-icon">↗</span><span><b>Ballia ke liye</b><small>Banaya apno ne</small></span><span className="city-arrow">↗</span></div>
        </div>
        <div className="welcome-foot"><span>01</span> LOCAL RIDES, DIL SE <i /> BALLIA, UTTAR PRADESH</div>
      </div>

      <div className="form-side">
        <div className="form-card">
          <div className="form-heading">
            <span className="form-icon">{isLogin ? "↗" : "✳"}</span>
            <span className="form-step">{isLogin ? "WELCOME BACK" : "YOUR JOURNEY STARTS HERE"}</span>
            <h2>{isLogin ? "Phir se swagat hai!" : "Apna account banayein"}</h2>
            <p>{isLogin ? "Apni details daal kar BalliaGo par aage badhein." : "Bas kuch details aur — phir Ballia aapka."}</p>
          </div>

          {!isLogin && <div className="role-picker" aria-label="Account type">
            <button type="button" className={`role-option ${role === "customer" ? "selected" : ""}`} onClick={() => setRole("customer")}>
              <span className="role-emoji">🙋</span><span><b>Customer</b><small>Ride book karein</small></span>
              <span className="radio-dot" />
            </button>
            <button type="button" className={`role-option ${role === "captain" ? "selected" : ""}`} onClick={() => setRole("captain")}>
              <span className="role-emoji">🛺</span><span><b>Captain</b><small>Rides accept karein</small></span>
              <span className="radio-dot" />
            </button>
          </div>}

          <form className="auth-form" onSubmit={auth}>
            {!isLogin && <label className="field-label">Aapka poora naam
              <span className="input-wrap"><span className="input-icon">♙</span><input autoComplete="name" placeholder="Jaise: Abhishek Sharma" value={form.name} onChange={e => update("name", e.target.value)} required minLength={2} /></span>
            </label>}
            <label className="field-label">Email address
              <span className="input-wrap"><span className="input-icon">@</span><input type="email" autoComplete="email" placeholder="aap@example.com" value={form.email} onChange={e => update("email", e.target.value)} required /></span>
            </label>
            {!isLogin && <label className="field-label">Mobile number <span className="optional">(optional)</span>
              <span className="input-wrap"><span className="input-icon">⌕</span><input type="tel" autoComplete="tel" placeholder="+91 98765 43210" value={form.phone} onChange={e => update("phone", e.target.value)} /></span>
            </label>}
            <label className="field-label">Password
              <span className="input-wrap"><span className="input-icon">⌑</span><input type="password" autoComplete={isLogin ? "current-password" : "new-password"} placeholder="Kam se kam 8 characters" value={form.password} onChange={e => update("password", e.target.value)} required minLength={8} /></span>
            </label>
            <button className="submit-button" type="submit" disabled={loading}>
              {loading ? "Please wait..." : isLogin ? "Login karein" : "Create account"} <span>→</span>
            </button>
          </form>

          <p className="switch-auth">{isLogin ? "BalliaGo par naye hain?" : "Pehle se account hai?"}{" "}
            <button type="button" onClick={() => { setIsLogin(!isLogin); setMessage(""); }}>{isLogin ? "Account banayein" : "Login karein"}</button>
          </p>
          <p className="terms">Yeh BalliaGo ka development demo hai; abhi real rides aur driver dispatch available nahi hain.</p>
          {message && <p className={`notice ${messageType}`} role="alert">{message}</p>}
        </div>
        <div className="form-caption"><span>✦</span> Ballia se, Ballia ke liye <span>✦</span></div>
      </div>
    </section> : <section className="dashboard">
      <div className="dashboard-heading">
        <div><span className="eyebrow"><span className="eyebrow-dot" /> BALLIAGO MEMBER</span><h1>Namaste{user?.name ? `, ${user.name.split(" ")[0]}` : ""}! <span>👋</span></h1><p>Aaj kahan jaana hai?</p></div>
        <div className="member-badge"><Mark>B</Mark><span><b>{user?.role === "captain" ? "Captain account" : "Customer account"}</b><small>BalliaGo par aapka swagat hai</small></span></div>
      </div>
      <div className="dashboard-grid">
        <div className="booking-card">
          <div className="booking-title"><span className="form-icon">↗</span><span><h2>Apni ride book karein</h2><p>Map se location select karein ya address likhein</p></span></div>
          {user?.role === "customer" && <>
            <MapPicker pickup={pickup} drop={drop} onPickupChange={setPickup} onDropChange={setDrop} />
            <div className="location-field"><span className="location-dot pickup-dot" /><label>Pickup location<input value={pickup.address} onChange={e => setPickup(old => ({ ...old, address: e.target.value }))} /></label></div>
            <button type="button" className="mini-action-button" onClick={useCurrentLocation}>📍 Current location set karein</button>
            <div className="location-field"><span className="location-dot drop-dot" /><label>Drop location<input value={drop.address} onChange={e => setDrop(old => ({ ...old, address: e.target.value }))} /></label></div>
            <label className="field-label">Ride type<select value={vehicleType} onChange={e => setVehicleType(e.target.value)}><option value="bike">🏍️ Bike</option><option value="auto">🛺 Auto</option><option value="cab">🚕 Cab</option></select></label>
            <button className="submit-button" onClick={book}>Ride dhoondein <span>→</span></button>
          </>}
          {user?.role === "captain" && <>
            <div className="captain-note"><span>🛺</span><p>Available rides dekhne ke liye neeche <b>Refresh rides</b> dabayein.</p></div>
            <button className="submit-button" onClick={captainOnline ? captainGoOffline : captainGoOnline}>
              {captainOnline ? "Go offline" : "Go online & share location"} <span>→</span>
            </button>
          </>}
          <div className="ride-actions"><button className="refresh-button" onClick={loadRides}>↻ &nbsp; Refresh rides</button></div>
          {message && <p className={`notice ${messageType}`} role="alert">{message}</p>}
        </div>
        <aside className="trip-aside">
          {activeRide && <section className="live-tracking">
            <div className="live-tracking-heading"><span className="live-dot" /><div><b>Live ride tracking</b><small>{activeRide.status === "started" ? "Ride chal rahi hai" : "Captain assigned"}</small></div></div>
            <LiveRideMap
              ride={activeRide}
              customerLocation={user?.role === "customer" && myLocation
                ? { ...myLocation, rideId: activeRide._id }
                : customerLocation}
              captainLocation={user?.role === "captain" && myLocation
                ? { ...myLocation, rideId: activeRide._id }
                : captainLocation}
            />
            <p className="live-map-legend">🟣 Customer location <span>🔵 Captain location</span></p>
          </section>}
          <div className="trip-illustration"><span className="sun-shape" /><span className="hill hill-back" /><span className="hill hill-front" /><span className="trip-road" /><span className="trip-spark spark-one">✦</span><span className="trip-spark spark-two">✦</span><span className="trip-vehicle">🛺</span></div>
          <h3>Ballia ki galiyan,<br /><span>aapki ride ke saath.</span></h3><p>Apne shehar mein safar ab aur bhi aasaan.</p>
          <div className="ride-list">{rides.length === 0 ? <span>Abhi koi ride nahi hai. Apni pehli ride shuru karein!</span> : rides.map(ride => <article className="ride-item" key={ride._id}><b>{ride.vehicleType?.toUpperCase?.() || ride.vehicleType}</b><span>{ride.pickup?.address || ride.pickup || "Pickup location"} → {ride.drop?.address || ride.drop || "Drop location"}</span><small>{ride.status} · ₹{ride.estimatedFare}</small>{user?.role === "captain" && ride.status === "requested" && <button onClick={() => accept(ride._id)}>Accept ride</button>}</article>)}</div>
        </aside>
      </div>
      <footer>© {new Date().getFullYear()} BalliaGo · Development prototype · Commercial rides ke liye uplabdh nahi</footer>
    </section>}

    {!token && <footer className="landing-footer">© {new Date().getFullYear()} BalliaGo <span>•</span> Apne shehar ki apni ride</footer>}
  </main>;
}
