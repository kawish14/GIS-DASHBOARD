import { createContext, useContext, useEffect, useState, useCallback, useMemo, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { authenticate } from "../../url";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const navigate = useNavigate();
  const [user, setUser] = useState(null);
  const [isAuthReady, setIsAuthReady] = useState(false);
  const [layerNames, setLayerNames] = useState([]);

  const userRef = useRef(user);
  const layerNamesRef = useRef(layerNames);
  const logoutTimeoutRef = useRef(null);
  const lastActivityRef = useRef(Date.now());

  useEffect(() => {
    userRef.current = user;
    layerNamesRef.current = layerNames;
  }, [user, layerNames]);

  const checkSession = useCallback(async () => {
    try {
      const res = await fetch(`${authenticate}/user/me`, { credentials: "include" });

      if (!res.ok) {
        if (userRef.current !== null) {
          setUser(null);
          setLayerNames([]);
        }
        return;
      }

      const data = await res.json();
      const newLayers = data.permissions?.layers || [];
      const currentLayers = layerNamesRef.current || [];
      const currentUser = userRef.current;

      const layersChanged = JSON.stringify(currentLayers) !== JSON.stringify(newLayers);
      const hasUserChanged = !currentUser || JSON.stringify(currentUser.permissions) !== JSON.stringify(data.permissions);

      if (hasUserChanged) setUser(data);
      if (layersChanged) setLayerNames(newLayers);

    } catch (err) {
      console.error("Session check failed", err);
    } finally {
      setIsAuthReady(true);
    }
  }, []);

  const logout = useCallback(async () => {
    try {
      await fetch(`${authenticate}/user/logout`, { method: "POST", credentials: "include" });
    } catch (error) {
      console.error("Logout failed", error);
    } finally {
      if (logoutTimeoutRef.current) clearTimeout(logoutTimeoutRef.current);
      setUser(null);
      setLayerNames([]);
      navigate("/login");
    }
  }, [navigate]);

  const resetTimer = useCallback(() => {
    if (logoutTimeoutRef.current) clearTimeout(logoutTimeoutRef.current);
    logoutTimeoutRef.current = setTimeout(() => {
      console.log("Inactivity detected. Logging out...");
      logout();
    }, 20 * 60 * 1000);
  }, [logout]);

  // Removed "load" from this list -- it fires once when the page loads,
  // long before this effect's listener is attached, so it was a no-op.
  const activityEvents = useMemo(() => ["mousemove", "mousedown", "click", "scroll", "keypress"], []);

  useEffect(() => {
    checkSession();
    const sessionInterval = setInterval(() => checkSession(), 10 * 60 * 1000);
    return () => clearInterval(sessionInterval);
  }, [checkSession]);

  useEffect(() => {
    // Throttle activity to prevent CPU spikes on mousemove
    const handleActivity = () => {
      const now = Date.now();
      if (now - lastActivityRef.current > 5000) { // Only reset once every 5 seconds maximum
        lastActivityRef.current = now;
        resetTimer();
      }
    };

    if (user) {
      activityEvents.forEach((event) => window.addEventListener(event, handleActivity));
      resetTimer();
    }

    return () => {
      activityEvents.forEach((event) => window.removeEventListener(event, handleActivity));
      if (logoutTimeoutRef.current) clearTimeout(logoutTimeoutRef.current);
    };
  }, [user, resetTimer, activityEvents]);

  const login = useCallback(async (username, password) => {
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
      return { success: false, message: data.error || 'Invalid credentials' };
    } catch (err) {
      return { success: false, message: 'Server connection failed.' };
    }
  }, []);

  const hasPermission = useCallback((key) => {
      return user && user.permissions?.features ? Boolean(user.permissions.features[key]) : false;
  }, [user]);

  const authValue = useMemo(() => ({
    user, login, logout, isAuthenticated: !!user, isAuthReady, hasPermission, layerNames,
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