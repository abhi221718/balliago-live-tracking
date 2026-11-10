import React, { useEffect, useRef, useState } from "react";
import { SafeAreaView, View, Text, TextInput, Pressable, ScrollView, StyleSheet, Alert, ActivityIndicator } from "react-native";
import { StatusBar } from "expo-status-bar";
import * as Location from "expo-location";
import MapView, { Marker, Polyline } from "react-native-maps";
import { io } from "socket.io-client";

const API = process.env.EXPO_PUBLIC_API_URL || "http://localhost:5000";
const BALLIA = { latitude: 25.758, longitude: 84.148 };

export default function App() {
  const [role, setRole] = useState("customer");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [token, setToken] = useState("");
  const [me, setMe] = useState(null);
  const [pickup, setPickup] = useState({ address: "Ballia Railway Station", coordinates: BALLIA });
  const [drop, setDrop] = useState({ address: "Ballia Bus Stand", coordinates: { latitude: 25.764, longitude: 84.149 } });
  const [vehicle, setVehicle] = useState("bike");
  const [rides, setRides] = useState([]);
  const [activeRide, setActiveRide] = useState(null);
  const [captainPoint, setCaptainPoint] = useState(null);
  const [customerPoint, setCustomerPoint] = useState(null);
  const [myPoint, setMyPoint] = useState(null);
  const ridePickup = activeRide?.pickup?.coordinates
    ? { latitude: activeRide.pickup.coordinates.lat, longitude: activeRide.pickup.coordinates.lng }
    : pickup.coordinates;
  const rideDrop = activeRide?.drop?.coordinates
    ? { latitude: activeRide.drop.coordinates.lat, longitude: activeRide.drop.coordinates.lng }
    : drop.coordinates;
  const [statusText, setStatusText] = useState("Set pickup and destination on the map.");
  const [otp, setOtp] = useState("");
  const [busy, setBusy] = useState(false);
  const socketRef = useRef(null);
  const watchRef = useRef(null);
  const customerWatchRef = useRef(null);
  const mapRef = useRef(null);

  async function api(path, method = "GET", body) {
    const res = await fetch(`${API}${path}`, {
      method,
      headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      ...(body ? { body: JSON.stringify(body) } : {})
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.message || "Request failed");
    return data;
  }

  async function register() {
    try {
      setBusy(true);
      const d = await api("/api/auth/register", "POST", { name, email, password, role });
      setToken(d.token); setMe(d.user); setStatusText("Account created. Captain accounts need admin approval before going online.");
    } catch (e) { Alert.alert("BalliaGo", e.message); }
    finally { setBusy(false); }
  }
  async function login() {
    try {
      setBusy(true);
      const d = await api("/api/auth/login", "POST", { email, password });
      setToken(d.token); setMe(d.user); setStatusText("Logged in.");
    } catch (e) { Alert.alert("BalliaGo", e.message); }
    finally { setBusy(false); }
  }

  useEffect(() => {
    if (!token) return;
    const s = io(API, { transports: ["websocket"], auth: { token } });
    socketRef.current = s;
    s.on("connect_error", e => setStatusText(`Realtime connection: ${e.message}`));
    s.on("ride:request", data => {
      Alert.alert("New ride request", `${data.pickup.address} → ${data.drop.address}\nEstimated fare ₹${data.estimatedFare}`, [
        { text: "Later", style: "cancel" },
        { text: "Refresh rides", onPress: refreshRides }
      ]);
      setStatusText("New ride request received.");
    });
    s.on("ride:accepted", () => {
      setStatusText("Captain accepted your ride.");
      refreshRides();
    });
    s.on("ride:start-otp", data => {
      Alert.alert("Your ride start OTP", `Share this code with your assigned captain: ${data.otp}`);
      setStatusText("Captain assigned. Share the start OTP only with your captain.");
    });
    s.on("ride:captain-location", data => setCaptainPoint({
      rideId: data.rideId, latitude: data.lat, longitude: data.lng
    }));
    s.on("ride:customer-location", data => setCustomerPoint({
      rideId: data.rideId, latitude: data.lat, longitude: data.lng
    }));
    s.on("ride:started", () => { setStatusText("Your ride has started."); refreshRides(); });
    s.on("ride:completed", () => { setStatusText("Ride completed."); setActiveRide(null); setCaptainPoint(null); setCustomerPoint(null); });
    s.on("ride:cancelled", () => { setStatusText("Ride cancelled."); setActiveRide(null); setCaptainPoint(null); setCustomerPoint(null); });
    return () => {
      s.disconnect();
      socketRef.current = null;
      customerWatchRef.current?.remove();
      customerWatchRef.current = null;
    };
  }, [token]);

  useEffect(() => {
    if (me?.role !== "customer" || !token || !activeRide || !["accepted", "started"].includes(activeRide.status)) {
      customerWatchRef.current?.remove();
      customerWatchRef.current = null;
      return;
    }

    let cancelled = false;
    (async () => {
      try {
        await requestPermission();
        if (cancelled) return;
        const subscription = await Location.watchPositionAsync(
          { accuracy: Location.Accuracy.High, timeInterval: 5000, distanceInterval: 10 },
          loc => {
            const point = { latitude: loc.coords.latitude, longitude: loc.coords.longitude };
            setMyPoint(point);
            socketRef.current?.emit("customer:location", {
              rideId: activeRide._id, lat: point.latitude, lng: point.longitude
            });
          }
        );
        if (cancelled) subscription.remove();
        else customerWatchRef.current = subscription;
      } catch (e) {
        if (!cancelled) Alert.alert("Live location", e.message);
      }
    })();

    return () => {
      cancelled = true;
      customerWatchRef.current?.remove();
      customerWatchRef.current = null;
    };
  }, [me?.role, token, activeRide?._id, activeRide?.status]);

  async function requestPermission() {
    const p = await Location.requestForegroundPermissionsAsync();
    if (p.status !== "granted") throw new Error("Location permission was not granted");
  }

  async function useMyLocation() {
    try {
      await requestPermission();
      const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      setPickup({ address: "My current location", coordinates: { latitude: loc.coords.latitude, longitude: loc.coords.longitude } });
      mapRef.current?.animateToRegion({ latitude: loc.coords.latitude, longitude: loc.coords.longitude, latitudeDelta: 0.025, longitudeDelta: 0.025 }, 700);
    } catch (e) { Alert.alert("Location", e.message); }
  }

  async function bookRide() {
    try {
      const d = await api("/api/rides", "POST", {
        pickup: { address: pickup.address, coordinates: { lat: pickup.coordinates.latitude, lng: pickup.coordinates.longitude } },
        drop: { address: drop.address, coordinates: { lat: drop.coordinates.latitude, lng: drop.coordinates.longitude } },
        vehicleType: vehicle
      });
      setActiveRide(d.ride);
      setStatusText(`Ride requested. ${d.notifiedCaptains} nearby online captain(s) notified.`);
      refreshRides();
    } catch (e) { Alert.alert("Booking", e.message); }
  }

  async function refreshRides() {
    try {
      const d = await api("/api/rides/mine");
      setRides(d.rides);
      const current = d.rides.find(r => ["accepted", "started"].includes(r.status))
        || d.rides.find(r => r.status === "requested");
      if (current) setActiveRide(current);
    } catch (e) { Alert.alert("Rides", e.message); }
  }

  async function captainGoOnline() {
    try {
      await requestPermission();
      const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
      setMyPoint({ latitude: loc.coords.latitude, longitude: loc.coords.longitude });
      socketRef.current?.emit("captain:online", { lat: loc.coords.latitude, lng: loc.coords.longitude, heading: loc.coords.heading || 0 }, result => {
        if (!result?.ok) return Alert.alert("Captain", result?.message || "Could not go online");
        setStatusText("You are online and sharing your location.");
        startCaptainTracking();
      });
    } catch (e) { Alert.alert("Captain", e.message); }
  }

  async function startCaptainTracking() {
    watchRef.current?.remove();
    watchRef.current = await Location.watchPositionAsync(
      { accuracy: Location.Accuracy.High, timeInterval: 5000, distanceInterval: 10 },
      loc => {
        setMyPoint({ latitude: loc.coords.latitude, longitude: loc.coords.longitude });
        socketRef.current?.emit("captain:location", {
          lat: loc.coords.latitude, lng: loc.coords.longitude, heading: loc.coords.heading || 0
        });
      }
    );
  }

  async function captainOffline() {
    socketRef.current?.emit("captain:offline", result => setStatusText(result?.ok ? "You are offline." : result?.message || "Could not go offline"));
    watchRef.current?.remove(); watchRef.current = null;
  }

  async function acceptRide(id) {
    try {
      const d = await api(`/api/rides/${id}/accept`, "PATCH");
      setActiveRide(d.ride); setStatusText("Ride accepted. Ask customer for the start OTP.");
      refreshRides();
    } catch (e) { Alert.alert("Accept ride", e.message); }
  }

  async function finishRide(id, status) {
    try {
      await api(`/api/rides/${id}/status`, "PATCH", { status });
      setStatusText(status === "completed" ? "Ride completed." : "Ride cancelled.");
      refreshRides();
    } catch (e) { Alert.alert("Ride", e.message); }
  }

  async function startRide(id) {
    try {
      await api(`/api/rides/${id}/start`, "POST", { otp });
      setOtp(""); setStatusText("Ride started."); refreshRides();
    } catch (e) { Alert.alert("Start ride", e.message); }
  }

  function chooseMapPoint(e) {
    const coordinate = e.nativeEvent.coordinate;
    if (role === "customer") {
      if (!pickupChosen.current) {
        setPickup({ address: "Map selected pickup", coordinates: coordinate });
        pickupChosen.current = true;
        setStatusText("Pickup selected. Tap map again to select drop.");
      } else {
        setDrop({ address: "Map selected destination", coordinates: coordinate });
        pickupChosen.current = false;
        setStatusText("Destination selected.");
      }
    }
  }
  const pickupChosen = useRef(false);

  if (!token) return <SafeAreaView style={s.safe}><StatusBar style="dark"/><ScrollView contentContainerStyle={s.page}>
    <Text style={s.logo}>● BalliaGo</Text><Text style={s.tag}>Apne Shehar Ki Apni Ride</Text>
    <View style={s.card}><Text style={s.heading}>Create your account</Text>
      <View style={s.row}>{["customer","captain"].map(x=><Pressable key={x} onPress={()=>setRole(x)} style={[s.pill,role===x&&s.selected]}><Text style={role===x?s.white:s.green}>{x.toUpperCase()}</Text></Pressable>)}</View>
      <Field label="Full name" value={name} onChangeText={setName}/><Field label="Email" value={email} onChangeText={setEmail}/><Field label="Password (8+ characters)" value={password} onChangeText={setPassword} secureTextEntry/>
      <Btn title={busy?"Please wait…":"Create account"} onPress={register}/><Btn title="Login" secondary onPress={login}/>
      <Text style={s.note}>Demo email/password authentication. Replace with verified phone OTP before production.</Text>
    </View></ScrollView></SafeAreaView>;

  return <SafeAreaView style={s.safe}><StatusBar style="dark"/><ScrollView contentContainerStyle={s.page}>
    <Text style={s.logo}>● BalliaGo</Text><Text style={s.tag}>{me?.role === "captain" ? "Captain partner" : "Book a local ride"}</Text>
    <View style={s.mapWrap}>
      <MapView ref={mapRef} style={s.map} initialRegion={{ latitude: BALLIA.latitude, longitude: BALLIA.longitude, latitudeDelta: 0.055, longitudeDelta: 0.055 }} onPress={chooseMapPoint}>
        <Marker coordinate={ridePickup} title="Pickup" pinColor="#16834f"/>
        <Marker coordinate={rideDrop} title="Destination" pinColor="#e28a2b"/>
        {captainPoint?.rideId === activeRide?._id && <Marker coordinate={{ latitude: captainPoint.latitude, longitude: captainPoint.longitude }} title="Your captain" pinColor="#2563eb"/>}
        {customerPoint?.rideId === activeRide?._id && <Marker coordinate={{ latitude: customerPoint.latitude, longitude: customerPoint.longitude }} title="Customer" pinColor="#8b5cf6"/>}
        {me?.role === "captain" && myPoint && <Marker coordinate={myPoint} title="Your location" pinColor="#2563eb"/>}
        <Polyline coordinates={[ridePickup, rideDrop]} strokeColor="#16834f" strokeWidth={3}/>
      </MapView>
      <Text style={s.mapHint}>{activeRide && ["accepted", "started"].includes(activeRide.status)
        ? "Live ride map: customer aur captain ki location share ho rahi hai."
        : "Customer: tap map to set pickup, then tap again to set destination."}</Text>
    </View>
    <View style={s.card}>
      <Text style={s.status}>{statusText}</Text>
      {me?.role === "customer" ? <>
        <Text style={s.label}>Pickup: {pickup.address}</Text><Text style={s.label}>Drop: {drop.address}</Text>
        <Btn title="Use my current location as pickup" secondary onPress={useMyLocation}/>
        <View style={s.row}>{["bike","auto","cab"].map(x=><Pressable key={x} onPress={()=>setVehicle(x)} style={[s.pill,vehicle===x&&s.selected]}><Text style={vehicle===x?s.white:s.green}>{x.toUpperCase()}</Text></Pressable>)}</View>
        <Btn title="Request ride (demo)" onPress={bookRide}/>
      </> : <>
        <Text style={s.note}>Captain online mode requires admin approval. For this development build, approved captain accounts can share location.</Text>
        <Btn title="Go online & share location" onPress={captainGoOnline}/>
        <Btn title="Go offline" secondary onPress={captainOffline}/>
      </>}
      <Btn title="Refresh rides" secondary onPress={refreshRides}/>
      {rides.map(r=><View key={r._id} style={s.ride}>
        <Text style={s.green}>{r.vehicleType.toUpperCase()} · ₹{r.estimatedFare} · {r.status}</Text>
        <Text>{r.pickup.address} → {r.drop.address}</Text>
        {me?.role==="captain" && r.status==="requested" && <Btn title="Accept ride" onPress={()=>acceptRide(r._id)}/>}
        {me?.role==="captain" && r.status==="accepted" && r.captain?._id===me.id && <>
          <Field label="Customer start OTP" value={otp} onChangeText={setOtp} keyboardType="number-pad"/>
          <Btn title="Verify OTP & start" onPress={()=>startRide(r._id)}/>
        </>}
        {me?.role==="captain" && r.status==="started" && <Btn title="Complete ride" onPress={()=>finishRide(r._id,"completed")}/>}
      </View>)}
    </View>
    <Text style={s.footer}>BalliaGo · Development prototype · Paid rides disabled until approvals</Text>
  </ScrollView></SafeAreaView>;
}

function Field({label,...props}) { return <View><Text style={s.label}>{label}</Text><TextInput placeholder={label} placeholderTextColor="#8ba596" style={s.input} {...props}/></View>; }
function Btn({title,onPress,secondary}) { return <Pressable onPress={onPress} style={[s.button,secondary&&s.secondary]}><Text style={secondary?s.green:s.white}>{title}</Text></Pressable>; }
const s=StyleSheet.create({
 safe:{flex:1,backgroundColor:"#eff8f1"},page:{padding:18,paddingTop:30,flexGrow:1},
 logo:{fontSize:28,fontWeight:"900",color:"#167b4a"},tag:{color:"#6d8978",marginBottom:15},
 card:{backgroundColor:"white",padding:16,borderRadius:18,borderWidth:1,borderColor:"#dcebe0",marginTop:12},
 heading:{fontSize:21,fontWeight:"800",color:"#153b2a",marginBottom:12},
 row:{flexDirection:"row",gap:8,marginVertical:8,flexWrap:"wrap"},
 pill:{padding:11,borderRadius:10,backgroundColor:"#edf6ef"},selected:{backgroundColor:"#16834f"},
 green:{color:"#167b4a",fontWeight:"700"},white:{color:"white",fontWeight:"700"},
 label:{fontSize:12,color:"#688071",marginTop:8},input:{borderWidth:1,borderColor:"#dce9df",borderRadius:10,padding:11,marginTop:5,color:"#153b2a"},
 button:{backgroundColor:"#16834f",padding:13,borderRadius:11,alignItems:"center",marginTop:9},
 secondary:{backgroundColor:"#eaf4ed"},mapWrap:{height:330,borderRadius:16,overflow:"hidden",marginTop:5},
 map:{flex:1},mapHint:{backgroundColor:"#ffffffee",padding:7,fontSize:11,color:"#456653"},
 status:{color:"#17613d",fontWeight:"700",marginBottom:8},ride:{borderWidth:1,borderColor:"#e2eee5",borderRadius:10,padding:11,marginTop:10},
 note:{fontSize:11,color:"#84988c",marginTop:12,lineHeight:17},footer:{textAlign:"center",color:"#82958a",marginTop:20,fontSize:11}
});
