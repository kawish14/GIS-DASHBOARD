import { createContext, useContext, useEffect, useState, useCallback, useMemo, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { authenticate } from "../../url";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const navigate = useNavigate();
  const [user, setUser] = useState(null);
  const [isAuthReady, setIsAuthReady] = useState(false);
  const [layerNames, setLayerNames] = useState([]);
  
  // ✨ FIX 1: Keep Refs up to date with the latest state
  const userRef = useRef(user);
  const layerNamesRef = useRef(layerNames);

  // Update refs whenever state changes
  useEffect(() => {
    userRef.current = user;
    layerNamesRef.current = layerNames;
  }, [user, layerNames]);

  const logoutTimeoutRef = useRef(null);

  // --- 1. SESSION CHECK ---
  // We wrap this in useCallback so it doesn't get recreated unnecessary
  const checkSession = useCallback(async () => {
    try {
      const res = await fetch(`${authenticate}/user/me`, { credentials: "include" });

      // 1. If server says "Not Logged In"
      if (!res.ok) {
        // ✨ FIX 2: Check against userRef.current (the LATEST value)
        if (userRef.current !== null) { 
          setUser(null);
          setLayerNames([]);
        }
        return;
      }

      const data = await res.json();
      console.log("Check Session Data", data)

      const newLayers = data.permissions?.layers || [];
      console.log("newLayers:", newLayers)

      // ✨ FIX 3: Compare server data against REF data (the LATEST value)
      // This prevents the "Stale Closure" issue where it compares against empty arrays
      const currentLayers = layerNamesRef.current || [];
      const currentUser = userRef.current;
      console.log("Current User", currentUser)

      const layersChanged = JSON.stringify(currentLayers) !== JSON.stringify(newLayers);
      console.log("layersChanged", layersChanged)
      
      const hasUserChanged = 
        !currentUser ||
        JSON.stringify(currentUser.permissions) !== JSON.stringify(data.permissions);

      console.log("hasUserChanged", hasUserChanged)

      // Only update state if things ACTUALLY changed
      if (hasUserChanged) {
        console.log("Syncing user data with server...");
        setUser(data);
      }

      if (layersChanged) {
        console.log("Layer permissions updated from server.");
        setLayerNames(newLayers);
      }
      
    } catch (err) {
      console.error("Session check failed", err);
    } finally {
      setIsAuthReady(true);
    }
  }, []); // No dependencies needed because we use refs inside

  // --- 2. LOGOUT LOGIC ---
  const logout = useCallback(async () => {
    try {
      await fetch(`${authenticate}/user/logout`, {
        method: "POST",
        credentials: "include",
      });
    } catch (error) {
      console.error("Logout failed", error);
    } finally {
      if (logoutTimeoutRef.current) clearTimeout(logoutTimeoutRef.current);
      
      setUser(null);
      setLayerNames([]);
      localStorage.removeItem("auth_user");
      navigate("/login");
    }
  }, [navigate]);

  // --- 3. INACTIVITY LOGIC ---
  const resetTimer = useCallback(() => {
    if (logoutTimeoutRef.current) clearTimeout(logoutTimeoutRef.current);
    
    logoutTimeoutRef.current = setTimeout(() => {
      console.log("Inactivity detected. Logging out...");
      logout();
    }, 30 * 60 * 1000); 
  }, [logout]);

  // Defined inside useMemo or useCallback to prevent recreation on every render
  const activityEvents = useMemo(() => ["load", "mousemove", "mousedown", "click", "scroll", "keypress"], []);

  // --- 4. EFFECTS ---
  
  // Initial Auth Check & Global Interval
  useEffect(() => {
    checkSession(); // Run immediately on mount
    
    // Because checkSession now uses Refs internally, this interval is safe
    const sessionInterval = setInterval(() => {
        checkSession();
    }, 10 * 60 * 1000);

    return () => clearInterval(sessionInterval);
  }, [checkSession]);

  // Monitor Auth state to start/stop the Inactivity Observer
  useEffect(() => {
    const handleActivity = () => resetTimer();

    if (user) {
      activityEvents.forEach((event) => window.addEventListener(event, handleActivity));
      resetTimer(); 
    }

    return () => {
      activityEvents.forEach((event) => window.removeEventListener(event, handleActivity));
      if (logoutTimeoutRef.current) clearTimeout(logoutTimeoutRef.current);
    };
  }, [user, resetTimer, activityEvents]);

  // --- 5. PROVIDER SETUP ---
 const login = async (username, password) => {
    try {
      const response = await fetch(`${authenticate}/user/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password }),
        credentials: 'include' 
      });
      const data = await response.json();
      
      if (response.ok) {
        setUser(data);
        setLayerNames(data.permissions.layers);
        return { success: true, data };
      }
      
      // FIX: Return an object matching what Login.jsx expects
      return { success: false, message: data.error || 'Invalid credentials' };
      
    } catch (err) {
      // FIX: Also return an object here
      return { success: false, message: 'Server connection failed.' };
    }
  };

  const hasPermission = useCallback((key) => {
      return user && user.permissions?.features ? Boolean(user.permissions.features[key]) : false;
  }, [user]);

  const authValue = useMemo(() => ({
    user,
    login,
    logout,
    isAuthenticated: !!user,
    isAuthReady,
    hasPermission,
    layerNames,
  }), [user, isAuthReady, layerNames, logout, hasPermission, login]);

  return (
    <AuthContext.Provider value={authValue}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}