import React, { useState, useEffect } from "react";
import { 
  CalciteList, 
  CalciteListItem, 
  CalciteLoader, 
  CalciteNotice,
  CalciteInput
} from "@esri/calcite-components-react";
import { authenticate } from "../../../url"; 

export default function ActiveUsers({ permittedRegions }) {
  const [activeUsers, setActiveUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");

  useEffect(() => {
    const fetchActiveUsers = async () => {
      try {
        const response = await fetch(`${authenticate}/user/active-users`, { 
          credentials: "include" 
        });
        if (response.ok) {
          const data = await response.json();
          setActiveUsers(data);
        }
      } catch (err) {
        console.error("Failed to fetch active users:", err);
      } finally {
        setLoading(false);
      }
    };

    fetchActiveUsers();
    
    // Auto-refresh the active users list every 30 seconds
    const interval = setInterval(fetchActiveUsers, 30000);
    return () => clearInterval(interval);
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full min-h-[200px]">
        <CalciteLoader label="Loading active users" active scale="s" />
      </div>
    );
  }

  // ==========================================
  // FILTERING & SEARCH LOGIC
  // ==========================================
  const filteredUsers = activeUsers.filter(user => {
    const userRegions = user.permissions?.regions || [];
    
    // 1. SECURITY CHECK: Only show users who share at least one region with the viewer
    const hasSharedRegion = userRegions.some(r => permittedRegions.includes(r));
    if (!hasSharedRegion) return false;

    // 2. SEARCH CHECK: Filter by search term if one exists
    if (!searchTerm) return true;
    
    const term = searchTerm.toLowerCase();
    const matchesName = user.full_name?.toLowerCase().includes(term);
    const matchesUsername = user.username?.toLowerCase().includes(term);
    const matchesRegion = userRegions.some(r => r.toLowerCase().includes(term));
    
    return matchesName || matchesUsername || matchesRegion;
  });

  return (
    <div className="flex flex-col h-full bg-[var(--calcite-ui-foreground-1)]">
      
      {/* --- SEARCH BAR & DYNAMIC COUNT (Sticky at Top) --- */}
      <div className="p-3 border-b border-[var(--calcite-ui-border-3)] sticky top-0 z-10 bg-[var(--calcite-ui-foreground-1)]">
        <CalciteInput 
          icon="search" 
          placeholder="Search by name, username, or region..." 
          value={searchTerm} 
          onCalciteInputInput={(e) => setSearchTerm(e.target.value)} 
          clearable
        />
        {/* Dynamic User Count Tracker */}
        <div className="text-xs font-medium text-[var(--calcite-ui-text-2)] mt-2 ml-1 flex items-center gap-1.5">
          <div className="w-1.5 h-1.5 rounded-full bg-[var(--calcite-ui-brand)]"></div>
          {searchTerm 
            ? `Found ${filteredUsers.length} matching ${filteredUsers.length === 1 ? 'user' : 'users'}` 
            : `Total Active Users: ${filteredUsers.length}`
          }
        </div>
      </div>

      {/* --- USER LIST --- */}
      <div className="flex-1 overflow-y-auto pb-4">
        {filteredUsers.length > 0 ? (
          <CalciteList>
            {filteredUsers.map(user => {
              const userRegions = user.permissions?.regions?.join(", ") || "No Region";
              const userRole = user.role ? user.role.toUpperCase() : "USER";

              return (
                <CalciteListItem 
                  key={user.id} 
                  label={user.full_name} 
                  description={`@${user.username} • [${userRegions}]`}
                >
                  {/* Green pulsating dot to indicate "Online" */}
                  <div slot="content-end" className="flex items-center h-full pr-3">
                    <div className="w-2.5 h-2.5 rounded-full bg-green-500 shadow-[0_0_8px_rgba(34,197,94,0.8)] animate-pulse" title="Online"></div>
                  </div>
                </CalciteListItem>
              );
            })}
          </CalciteList>
        ) : (
          <div className="p-4">
            <CalciteNotice open kind="info" icon="search">
              <div slot="message" className="text-sm font-medium">No users found</div>
              <div slot="title" className="text-xs text-[var(--calcite-ui-text-3)]">
                {searchTerm ? "Try adjusting your search term." : "No active users in your regions."}
              </div>
            </CalciteNotice>
          </div>
        )}
      </div>
      
    </div>
  );
}