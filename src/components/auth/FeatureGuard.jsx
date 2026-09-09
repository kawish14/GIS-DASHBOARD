import React from 'react';
import { useAuth } from '../../context/AuthContext'; // Adjust path as needed

export default function FeatureGuard({ featureKey, children, fallback = null }) {
  const { hasPermission } = useAuth();

  // If no specific feature is required, allow access automatically
  if (!featureKey) return <>{children}</>;

  // Check if the user has the specific feature flag enabled in their JSON profile
  if (hasPermission(featureKey)) {
    return <>{children}</>;
  }

  // Render nothing (or a fallback message) if access is denied
  return fallback; 
}