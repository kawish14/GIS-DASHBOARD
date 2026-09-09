import React, { useState, useEffect } from "react";
import {
  UserPlus, Trash2, Layers, Edit2, X, Save, MapPin, Search, 
  CheckCircle, XCircle, LogOut, User, Lock, ChevronLeft, ChevronRight, 
  ShieldAlert, Settings2, PanelRight, PanelLeft, PanelTop, LayoutDashboard,
  Users, ArrowRightLeft
} from "lucide-react";
import logo from "../assets/images/TesLogo.png";
import { useAuth } from "../context/AuthContext";
import { authenticate, api } from "../../url";
import { FEATURE_REGISTRY, findOrphanedFeatureKeys } from "../permissions/featureRegistry";

const listLayer = async () => {
  const layerNames = [];
  const url = `${api}/geoserver/wms?service=WMS&version=1.1.1&request=GetCapabilities`;
  try {
    const response = await fetch(url, { method: "GET" });
    const data = await response.text();
    const parser = new DOMParser();
    const xmlDoc = parser.parseFromString(data, "text/xml");
    const layers = xmlDoc.getElementsByTagName("Layer");
    for (let i = 1; i < layers.length; i++) {
      const nameElement = layers[i].getElementsByTagName("Name")[0];
      if (nameElement) {
        const name = nameElement.textContent;
        if (name.startsWith('web') || name.startsWith('twa') || name.toLowerCase().includes("parcel_evw")) {
          layerNames.push(name); 
        }
      }
    }
    layerNames.push("Vehicles"); 
    return layerNames;
  } catch (error) {
    console.error("Failed to fetch layers", error);
    return [];
  }
};

export default function AdminPanel() {
  const { logout } = useAuth();
  
  // --- Core State ---
  const [activeTab, setActiveTab] = useState("users"); // "users" or "roles"
  const [layerNames, setLayerNames] = useState([]);
  const [users, setUsers] = useState([]);
  const [rolesList, setRolesList] = useState([]);
  const [filteredUsers, setFilteredUsers] = useState([]);
  
  // --- UI State ---
  const [err, setErr] = useState(null);
  const [successMsg, setSuccessMsg] = useState(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 5; 

  // --- Modals State ---
  const [isUserModalOpen, setIsUserModalOpen] = useState(false);
  const [userModalMode, setUserModalMode] = useState("create");
  const [isRoleModalOpen, setIsRoleModalOpen] = useState(false);
  const [isCreateRoleModalOpen, setIsCreateRoleModalOpen] = useState(false);
  
  // --- Reassignment Modal State ---
  const [isReassignModalOpen, setIsReassignModalOpen] = useState(false);
  const [roleToDelete, setRoleToDelete] = useState(null);
  const [targetRoleId, setTargetRoleId] = useState("");

  // --- Form States ---
  const initialUserFormState = { id: null, username: "", password: "", confirmPassword: "", full_name: "", email: "", role: "viewer" };
  const [userFormData, setUserFormData] = useState(initialUserFormState);
  const [editingRole, setEditingRole] = useState(null);
  const [newRoleName, setNewRoleName] = useState("");

  const availableRegions = ["South", "Central", "North"];

  // --- Initialization ---
  useEffect(() => {
    fetchUsers();
    fetchRoles();
    listLayer().then(r => setLayerNames(r));
  }, []);

  useEffect(() => {
    let filtered = users;
    if (searchTerm) {
      filtered = filtered.filter(
        (u) =>
          u.username?.toLowerCase().includes(searchTerm.toLowerCase()) ||
          u.full_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
          u.role?.toLowerCase().includes(searchTerm.toLowerCase())
      );
    }
    setFilteredUsers(filtered);
    setCurrentPage(1); 
  }, [users, searchTerm]);

  // --- Data Fetching ---
  const fetchUsers = async () => {
    try {
      const res = await fetch(`${authenticate}/admin/users`, { credentials: "include" });
      const data = await res.json();
      const userList = Array.isArray(data) ? data : data.users || [];
      const validUsers = userList.filter((u) => u.username?.toLowerCase() !== "admin");
      setUsers(validUsers);
    } catch (error) { console.error("Error fetching users", error); }
  };

  const fetchRoles = async () => {
    try {
      const res = await fetch(`${authenticate}/admin/roles`, { credentials: "include" });
      const data = await res.json();
      setRolesList(data);
    } catch (error) { console.error("Error fetching roles", error); }
  };

  const handleCreateRole = async (e) => {
    e.preventDefault();
    if (!newRoleName.trim()) return showError("Role name is required.");

    try {
      const response = await fetch(`${authenticate}/admin/roles`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ role_name: newRoleName }),
        credentials: "include",
      });

      if (response.ok) {
        fetchRoles();
        showSuccess("New role created successfully!");
        setIsCreateRoleModalOpen(false);
        setNewRoleName("");
      } else {
        const errorData = await response.json();
        showError(errorData.error || "Failed to create role.");
      }
    } catch (error) {
      showError("Server connection failed");
    }
  };

  // --- Delete or Reassign Role Logic ---
  const handleDeleteRoleClick = (roleObj) => {
    if (roleObj.role_name === 'admin') return showError("The admin role is protected.");

    // Check how many users have this role locally
    const affectedUsers = users.filter(u => u.role === roleObj.role_name);

    if (affectedUsers.length > 0) {
      // Open reassign modal if users are attached
      setRoleToDelete(roleObj);
      // Default target role to the first available role that isn't this one
      const fallbackRole = rolesList.find(r => r.id !== roleObj.id && r.role_name !== 'admin');
      setTargetRoleId(fallbackRole ? fallbackRole.id : "");
      setIsReassignModalOpen(true);
    } else {
      // Safe to delete immediately if 0 users assigned
      executeDirectDelete(roleObj.id, roleObj.role_name);
    }
  };

  const executeDirectDelete = async (roleId, roleName) => {
    if (!window.confirm(`Are you sure you want to permanently delete the '${roleName}' role?`)) return;
    try {
      const response = await fetch(`${authenticate}/admin/roles/${roleId}`, {
        method: "DELETE",
        credentials: "include",
      });
      if (response.ok) {
        fetchRoles();
        showSuccess(`Role '${roleName}' deleted successfully.`);
      } else {
        const errorData = await response.json();
        showError(errorData.error || "Failed to delete role.");
      }
    } catch (error) {
      showError("Server connection failed");
    }
  };

  const handleConfirmReassignAndDelete = async (e) => {
    e.preventDefault();
    if (!targetRoleId) return showError("Please select a target role.");

    try {
      const response = await fetch(`${authenticate}/admin/roles/${roleToDelete.id}/reassign-and-delete`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ new_role_id: targetRoleId }),
        credentials: "include",
      });

      if (response.ok) {
        fetchRoles();
        fetchUsers();
        showSuccess(`Users reassigned and role '${roleToDelete.role_name}' deleted successfully.`);
        setIsReassignModalOpen(false);
        setRoleToDelete(null);
      } else {
        const errorData = await response.json();
        showError(errorData.error || "Reassignment failed.");
      }
    } catch (error) {
      showError("Server connection failed.");
    }
  };

  // Jump to Users tab and filter by role name
  const handleViewUsersWithRole = (roleName) => {
    setActiveTab("users");
    setSearchTerm(roleName);
  };

  // --- Helpers ---
  const showSuccess = (msg) => { setSuccessMsg(msg); setTimeout(() => setSuccessMsg(null), 3000); };
  const showError = (msg) => { setErr(msg); setTimeout(() => setErr(null), 4000); };

  const openCreateUserModal = () => {
    setUserModalMode("create");
    setUserFormData(initialUserFormState);
    if(rolesList.length > 0) setUserFormData(prev => ({...prev, role: rolesList[0].role_name}));
    setIsUserModalOpen(true);
  };

  const openEditUserModal = (user) => {
    setUserModalMode("edit");
    setUserFormData({
      id: user.id, username: user.username || "", password: "", confirmPassword: "", 
      full_name: user.full_name || "", email: user.email || "", role: user.role || ""
    });
    setIsUserModalOpen(true);
  };

  const handleUserSubmit = async (e) => {
    e.preventDefault();
    if (userModalMode === "create" && !userFormData.password) return showError("Password is required for new users.");
    if (userFormData.password !== userFormData.confirmPassword) return showError("Passwords do not match.");

    const payload = { ...userFormData };
    delete payload.confirmPassword;
    if (userModalMode === "edit" && !payload.password) delete payload.password;

    try {
      const url = userModalMode === "edit" ? `${authenticate}/admin/users/${userFormData.id}` : `${authenticate}/admin/users`;
      const method = userModalMode === "edit" ? "PUT" : "POST";
      const response = await fetch(url, {
        method, headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload), credentials: "include",
      });

      if (response.ok) {
        fetchUsers();
        showSuccess(userModalMode === "create" ? "User created successfully" : "User updated successfully");
        setIsUserModalOpen(false);
      } else {
        const errorData = await response.json();
        showError(errorData.error || "Operation failed");
      }
    } catch (error) { showError("Server connection failed"); }
  };

  const handleDeleteUser = async (userId) => {
    if (!window.confirm("Are you sure you want to permanently delete this user?")) return;
    try {
      const response = await fetch(`${authenticate}/admin/users/${userId}`, { method: "DELETE", credentials: "include" });
      if (response.ok) {
        fetchUsers();
        showSuccess("User deleted successfully");
      }
    } catch (error) { showError("Delete failed"); }
  };

  const openRoleModal = (roleObj) => {
    setEditingRole(JSON.parse(JSON.stringify(roleObj)));
    setIsRoleModalOpen(true);
  };

  const toggleRoleFeature = (featureKey) => {
    setEditingRole((prev) => {
      const currentFeatures = prev.permissions?.features || {};
      return { ...prev, permissions: { ...prev.permissions, features: { ...currentFeatures, [featureKey]: !currentFeatures[featureKey] } } };
    });
  };

  const toggleRoleLayer = (layerName) => {
    setEditingRole((prev) => {
      const current = prev.permissions?.layers || [];
      const next = current.includes(layerName) ? current.filter((l) => l !== layerName) : [...current, layerName];
      return { ...prev, permissions: { ...prev.permissions, layers: next } };
    });
  };

  const toggleRoleRegion = (regionName) => {
    setEditingRole((prev) => {
      const current = prev.permissions?.regions || [];
      const next = current.includes(regionName) ? current.filter((r) => r !== regionName) : [...current, regionName];
      return { ...prev, permissions: { ...prev.permissions, regions: next } };
    });
  };

  const cleanupOrphanedFeatures = () => {
    setEditingRole((prev) => {
      const cleaned = { ...(prev.permissions?.features || {}) };
      findOrphanedFeatureKeys(cleaned).forEach((key) => delete cleaned[key]);
      return { ...prev, permissions: { ...prev.permissions, features: cleaned } };
    });
  };

 const handleSaveRole = async () => {
  try {
    const response = await fetch(`${authenticate}/admin/roles/${editingRole.id}`, {
      method: "PUT", 
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ 
        role_name: editingRole.role_name, 
        permissions: editingRole.permissions 
      }), 
      credentials: "include",
    });

    if (response.ok) {
      fetchRoles(); 
      fetchUsers(); 
      showSuccess(`Role updated successfully!`);
      setIsRoleModalOpen(false);
    } else {
      const errorData = await response.json();
      showError(errorData.error || "Failed to update role.");
    }
  } catch (error) { 
    showError("Server connection failed while saving role."); 
  }
};

  const totalPages = Math.ceil(filteredUsers.length / itemsPerPage);
  const indexOfLastItem = currentPage * itemsPerPage;
  const indexOfFirstItem = indexOfLastItem - itemsPerPage;
  const currentUsers = filteredUsers.slice(indexOfFirstItem, indexOfLastItem);
  const featureGroups = FEATURE_REGISTRY.reduce((groups, feature) => {
    if (!groups[feature.group]) groups[feature.group] = [];
    groups[feature.group].push(feature);
    return groups;
  }, {});

  return (
    <div className="bg-[#0f172a] min-h-screen text-slate-300 font-sans pb-12 selection:bg-amber-500/30">
      
      {/* --- NAVBAR --- */}
      <nav className="bg-slate-900 border-b border-slate-700 sticky top-0 z-30 shadow-lg">
        <div className="max-w-[1600px] mx-auto px-6 py-4 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-center gap-5">
            <img src={logo} alt="Logo" className="h-10 w-auto object-contain" />
            <div className="h-8 w-px bg-slate-700 hidden md:block"></div>
            <div>
              <h1 className="text-lg font-bold text-white tracking-tight">GIS Admin Portal</h1>
              <p className="text-slate-400 text-xs font-medium">Access Management</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <button onClick={logout} className="p-2 text-slate-400 hover:bg-slate-800 hover:text-rose-400 rounded-lg transition-colors border border-transparent hover:border-slate-700">
              <LogOut size={18} />
            </button>
          </div>
        </div>
      </nav>

      <main className="max-w-[1600px] mx-auto p-6 space-y-6 mt-4">
        
        {/* --- TOAST ALERTS --- */}
        <div className="fixed top-24 right-6 z-50 flex flex-col gap-3 pointer-events-none">
          {successMsg && (
            <div className="pointer-events-auto animate-in slide-in-from-right-4 fade-in duration-300 bg-emerald-600 text-white px-5 py-3 rounded-xl shadow-2xl flex items-center gap-3 font-medium text-sm">
              <CheckCircle size={18} /> {successMsg}
            </div>
          )}
          {err && (
            <div className="pointer-events-auto animate-in slide-in-from-right-4 fade-in duration-300 bg-rose-600 text-white px-5 py-3 rounded-xl shadow-2xl flex items-center gap-3 font-medium text-sm">
              <XCircle size={18} /> {err}
            </div>
          )}
        </div>

        {/* --- TABS & CONTROLS --- */}
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 mb-6">
          <div className="flex bg-slate-800/50 p-1 rounded-xl border border-slate-700 inline-flex shadow-sm">
            <button 
                onClick={() => setActiveTab('users')} 
                className={`flex items-center gap-2 px-6 py-2.5 rounded-lg text-sm font-bold transition-all ${activeTab === 'users' ? 'bg-amber-500 text-slate-900 shadow-lg shadow-amber-500/20' : 'text-slate-400 hover:text-white hover:bg-slate-700/50'}`}
            >
                <Users size={16} /> Manage Users
            </button>
            <button 
                onClick={() => setActiveTab('roles')} 
                className={`flex items-center gap-2 px-6 py-2.5 rounded-lg text-sm font-bold transition-all ${activeTab === 'roles' ? 'bg-amber-500 text-slate-900 shadow-lg shadow-amber-500/20' : 'text-slate-400 hover:text-white hover:bg-slate-700/50'}`}
            >
                <ShieldAlert size={16} /> Role Permissions
            </button>
          </div>
          
          {activeTab === 'users' && (
            <div className="flex items-center gap-4">
              <div className="relative group w-[300px]">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 group-focus-within:text-amber-500 transition-colors" size={16} />
                <input type="text" placeholder="Search users/roles..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)} 
                  className="w-full pl-9 pr-4 py-2.5 bg-slate-800/50 border border-slate-700 rounded-xl text-slate-200 placeholder-slate-500 focus:ring-2 ring-amber-500/30 focus:border-amber-500/50 outline-none text-sm transition-all" />
              </div>
              <button onClick={openCreateUserModal} className="flex items-center gap-2 px-4 py-2.5 bg-amber-500 hover:bg-amber-400 text-slate-900 text-sm font-bold rounded-xl transition-all shadow-lg shadow-amber-500/20 active:scale-95 shrink-0">
                <UserPlus size={16} /> Add User
              </button>
            </div>
          )}

          {activeTab === 'roles' && (
            <div className="flex items-center gap-4">
              <button onClick={() => setIsCreateRoleModalOpen(true)} className="flex items-center gap-2 px-4 py-2.5 bg-amber-500 hover:bg-amber-400 text-slate-900 text-sm font-bold rounded-xl transition-all shadow-lg shadow-amber-500/20 active:scale-95 shrink-0">
                <ShieldAlert size={16} /> Create New Role
              </button>
            </div>
          )}
        </div>

        {/* --- USERS TAB CONTENT --- */}
        {activeTab === 'users' && (
            <div className="bg-slate-800/40 border border-slate-700/50 rounded-xl shadow-xl overflow-hidden flex flex-col animate-in fade-in duration-300">
                <div className="overflow-x-auto min-h-[420px]">
                    <table className="w-full text-left border-collapse whitespace-nowrap">
                    <thead className="bg-slate-900/80 text-slate-300 text-[11px] uppercase tracking-wider font-semibold border-b border-slate-700">
                        <tr>
                        <th className="px-6 py-4">User</th>
                        <th className="px-6 py-4">Role</th>
                        <th className="px-6 py-4">Inherited Regions</th>
                        <th className="px-6 py-4">Inherited Layers</th>
                        <th className="px-6 py-4 text-right">Actions</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-700/50">
                        {currentUsers.length > 0 ? (
                        currentUsers.map((u) => (
                            <tr key={u.id} className="hover:bg-slate-800/50 transition-colors group">
                            <td className="px-6 py-4">
                                <div className="flex items-center gap-3">
                                <div className="w-9 h-9 rounded-full bg-slate-700 border border-slate-600 flex items-center justify-center text-slate-300 font-bold text-sm">
                                    {u.username.charAt(0).toUpperCase()}
                                </div>
                                <div>
                                    <div className="font-semibold text-slate-200 text-sm">{u.full_name}</div>
                                    <div className="text-xs text-slate-500 mt-0.5">{u.email}</div>
                                </div>
                                </div>
                            </td>
                            <td className="px-6 py-4">
                                <span className="inline-flex items-center px-2.5 py-1 rounded-md bg-cyan-500/10 text-cyan-400 border border-cyan-500/20 text-[10px] font-bold uppercase tracking-widest">
                                {u.role}
                                </span>
                            </td>
                            <td className="px-6 py-4">
                                <div className="flex flex-wrap gap-1.5">
                                {u.permissions?.regions?.length > 0 ? (
                                    u.permissions.regions.map((r) => (
                                    <span key={r} className="flex items-center gap-1 text-[11px] text-emerald-300 bg-emerald-500/10 px-2 py-0.5 rounded-md border border-emerald-500/20 capitalize font-medium">
                                        <MapPin size={10} /> {r}
                                    </span>
                                    ))
                                ) : ( <span className="text-slate-600 text-xs italic">None</span> )}
                                </div>
                            </td>
                            <td className="px-6 py-4">
                                <div className="flex flex-wrap gap-1 max-w-[280px]">
                                {u.permissions?.layers?.length > 0 ? (
                                    u.permissions.layers.slice(0, 3).map((l) => (
                                    <span key={l} className="text-[10px] font-mono bg-slate-900 text-slate-400 border border-slate-700 px-1.5 py-0.5 rounded flex items-center gap-1 truncate max-w-[120px]">
                                        <Layers size={10} className="shrink-0 text-slate-500" /> {l}
                                    </span>
                                    ))
                                ) : ( <span className="text-slate-600 text-xs italic">No layers</span> )}
                                {u.permissions?.layers?.length > 3 && (
                                    <span className="text-[10px] bg-slate-900 text-slate-400 border border-slate-700 px-1.5 py-0.5 rounded">
                                    +{u.permissions.layers.length - 3} more
                                    </span>
                                )}
                                </div>
                            </td>
                            <td className="px-6 py-4 text-right">
                                <div className="flex justify-end gap-2">
                                <button onClick={() => openEditUserModal(u)} className="p-1.5 text-slate-400 hover:text-amber-400 hover:bg-amber-500/10 rounded-md transition-colors border border-transparent hover:border-amber-500/30">
                                    <Edit2 size={18} />
                                </button>
                                <button onClick={() => handleDeleteUser(u.id)} className="p-1.5 text-slate-400 hover:text-rose-400 hover:bg-rose-500/10 rounded-md transition-colors border border-transparent hover:border-rose-500/30">
                                    <Trash2 size={18} />
                                </button>
                                </div>
                            </td>
                            </tr>
                        ))
                        ) : (
                        <tr>
                            <td colSpan="5" className="px-6 py-16 text-center">
                                <p className="text-sm font-medium text-slate-400">No matching users found</p>
                            </td>
                        </tr>
                        )}
                    </tbody>
                    </table>
                </div>

                {filteredUsers.length > 0 && (
                    <div className="px-6 py-4 border-t border-slate-700 bg-slate-900/50 flex flex-col sm:flex-row items-center justify-between gap-4">
                    <span className="text-xs text-slate-400">
                        Showing <span className="font-semibold text-white">{indexOfFirstItem + 1}</span> to <span className="font-semibold text-white">{Math.min(indexOfLastItem, filteredUsers.length)}</span> of <span className="font-semibold text-white">{filteredUsers.length}</span> results
                    </span>
                    <div className="flex items-center gap-2 justify-end">
                        <button onClick={() => setCurrentPage(prev => Math.max(prev - 1, 1))} disabled={currentPage === 1} className="flex items-center gap-1 px-3 py-1.5 rounded-lg border border-slate-600 text-slate-300 hover:bg-slate-800 disabled:opacity-50 text-xs font-semibold">
                        <ChevronLeft size={16} /> Prev
                        </button>
                        <div className="flex items-center gap-1 px-2">
                        {Array.from({ length: totalPages }, (_, i) => i + 1).map(page => (
                            <button key={page} onClick={() => setCurrentPage(page)} className={`w-8 h-8 rounded-lg text-xs font-bold transition-colors ${ currentPage === page ? 'bg-amber-500 text-slate-900 shadow-sm' : 'text-slate-400 hover:bg-slate-800' }`}>
                            {page}
                            </button>
                        ))}
                        </div>
                        <button onClick={() => setCurrentPage(prev => Math.min(prev + 1, totalPages))} disabled={currentPage === totalPages} className="flex items-center gap-1 px-3 py-1.5 rounded-lg border border-slate-600 text-slate-300 hover:bg-slate-800 disabled:opacity-50 text-xs font-semibold">
                        Next <ChevronRight size={16} />
                        </button>
                    </div>
                    </div>
                )}
            </div>
        )}

        {/* --- ROLES TAB CONTENT --- */}
        {activeTab === 'roles' && (
            <div className="bg-slate-800/40 border border-slate-700/50 rounded-xl shadow-xl overflow-hidden flex flex-col animate-in fade-in duration-300">
                <table className="w-full text-left border-collapse whitespace-nowrap">
                    <thead className="bg-slate-900/80 text-slate-300 text-[11px] uppercase tracking-wider font-semibold border-b border-slate-700">
                        <tr>
                            <th className="px-6 py-4">Role Name</th>
                            <th className="px-6 py-4">Assigned Users</th>
                            <th className="px-6 py-4">Default Regions</th>
                            <th className="px-6 py-4">Total Feature Toggles</th>
                            <th className="px-6 py-4 text-right">Actions</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-700/50">
                        {rolesList.map((r) => {
                            // Count how many users have this role
                            const assignedCount = users.filter(u => u.role === r.role_name).length;

                            return (
                                <tr key={r.id} className="hover:bg-slate-800/50 transition-colors group">
                                    <td className="px-6 py-4">
                                        <span className="inline-flex items-center px-3 py-1.5 rounded-md bg-amber-500/10 text-amber-400 border border-amber-500/20 text-xs font-bold uppercase tracking-widest">
                                            <ShieldAlert size={14} className="mr-2" /> {r.role_name}
                                        </span>
                                    </td>
                                    
                                    {/* Clickable Assigned Users Count Badge */}
                                    <td className="px-6 py-4">
                                        <button 
                                            onClick={() => handleViewUsersWithRole(r.role_name)}
                                            className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-cyan-500/10 text-cyan-400 border border-cyan-500/20 text-xs font-semibold hover:bg-cyan-500/20 transition-colors"
                                            title="Click to view users with this role"
                                        >
                                            <Users size={12} /> {assignedCount} user{assignedCount !== 1 ? 's' : ''}
                                        </button>
                                    </td>

                                    <td className="px-6 py-4">
                                        <div className="flex flex-wrap gap-1.5">
                                            {r.permissions?.regions?.length > 0 ? r.permissions.regions.map((reg) => (
                                                <span key={reg} className="text-[11px] text-emerald-300 bg-emerald-500/10 px-2 py-0.5 rounded-md border border-emerald-500/20 capitalize font-medium">
                                                    {reg}
                                                </span>
                                            )) : <span className="text-slate-600 text-xs italic">Global / None</span>}
                                        </div>
                                    </td>
                                    <td className="px-6 py-4">
                                        <span className="text-slate-400 text-sm font-medium">
                                            {Object.keys(r.permissions?.features || {}).length} Active Features
                                        </span>
                                    </td>
                                    <td className="px-6 py-4 text-right">
                                        <div className="flex justify-end items-center gap-2">
                                            <button onClick={() => openRoleModal(r)} className="inline-flex items-center gap-2 px-4 py-2 bg-slate-900 hover:bg-slate-800 text-amber-400 border border-slate-700 hover:border-amber-500/50 rounded-lg transition-all text-xs font-bold tracking-wide shadow-sm">
                                                <Settings2 size={14} /> Configure
                                            </button>
                                            {r.role_name === 'admin' ? (
                                                <span className="text-[10px] uppercase tracking-wider text-slate-500 bg-slate-900 px-2.5 py-1 rounded-md border border-slate-800 font-bold italic">
                                                    Protected
                                                </span>
                                            ) : (
                                                <button onClick={() => handleDeleteRoleClick(r)} className="p-2 text-slate-400 hover:text-rose-400 hover:bg-rose-500/10 rounded-lg transition-colors border border-transparent hover:border-rose-500/30" title="Delete Role">
                                                    <Trash2 size={16} />
                                                </button>
                                            )}
                                        </div>
                                    </td>
                                </tr>
                            );
                        })}
                    </tbody>
                </table>
            </div>
        )}

      </main>

      {/* ==========================================
          MODAL 1: CREATE / EDIT USER (SIMPLIFIED)
      ========================================== */}
      {isUserModalOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm">
          <div className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-2xl overflow-hidden shadow-2xl flex flex-col animate-in fade-in zoom-in-95 duration-200">
            <div className="px-6 py-4 border-b border-slate-700 flex justify-between items-center bg-slate-900">
              <h2 className="text-lg font-bold text-white flex items-center gap-2.5">
                {userModalMode === 'create' ? <UserPlus className="text-amber-500" size={20} /> : <Edit2 className="text-amber-500" size={20} />}
                {userModalMode === 'create' ? 'Create New User' : 'Edit User Info'}
              </h2>
              <button onClick={() => setIsUserModalOpen(false)} className="text-slate-400 hover:text-white transition-colors"><X size={20} /></button>
            </div>

            <div className="p-6">
              <form id="user-form" onSubmit={handleUserSubmit} className="space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                  <div className="space-y-1.5 md:col-span-2">
                    <label className="text-xs font-medium text-slate-300">Assign Role <span className="text-rose-500">*</span></label>
                    <select required className="w-full bg-slate-950 border border-slate-700 px-4 py-2.5 rounded-lg text-sm text-slate-200 outline-none focus:ring-2 ring-amber-500/30 focus:border-amber-500 transition-all font-bold uppercase" 
                      value={userFormData.role} onChange={e => setUserFormData({...userFormData, role: e.target.value})}>
                      {rolesList.map(r => <option key={r.id} value={r.role_name}>{r.role_name}</option>)}
                    </select>
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-xs font-medium text-slate-300">Username <span className="text-rose-500">*</span></label>
                    <input required className="w-full bg-slate-950 border border-slate-700 px-4 py-2.5 rounded-lg focus:ring-2 ring-amber-500/30 outline-none text-slate-200 text-sm" 
                      value={userFormData.username} onChange={e => setUserFormData({...userFormData, username: e.target.value})} />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-xs font-medium text-slate-300">Email <span className="text-rose-500">*</span></label>
                    <input required type="email" className="w-full bg-slate-950 border border-slate-700 px-4 py-2.5 rounded-lg focus:ring-2 ring-amber-500/30 outline-none text-slate-200 text-sm" 
                      value={userFormData.email} onChange={e => setUserFormData({...userFormData, email: e.target.value})} />
                  </div>
                  <div className="space-y-1.5 md:col-span-2">
                    <label className="text-xs font-medium text-slate-300">Full Name <span className="text-rose-500">*</span></label>
                    <input required className="w-full bg-slate-950 border border-slate-700 px-4 py-2.5 rounded-lg focus:ring-2 ring-amber-500/30 outline-none text-slate-200 text-sm" 
                      value={userFormData.full_name} onChange={e => setUserFormData({...userFormData, full_name: e.target.value})} />
                  </div>
                </div>

                <div className="bg-slate-800/50 p-5 rounded-xl border border-slate-700/50">
                  <h3 className="text-xs uppercase tracking-widest font-bold text-amber-500 mb-4 flex items-center gap-2"><Lock size={14} /> Authentication</h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                    <div className="space-y-1.5">
                      <label className="text-xs font-medium text-slate-300">
                        {userModalMode === 'edit' ? 'New Password' : 'Password'} {userModalMode === 'create' && <span className="text-rose-500">*</span>}
                      </label>
                      <input type="password" placeholder={userModalMode === 'edit' ? "Leave blank to keep current" : "••••••••"}
                        className="w-full bg-slate-950 border border-slate-700 px-4 py-2.5 rounded-lg focus:ring-2 ring-amber-500/30 outline-none text-slate-200 text-sm"
                        value={userFormData.password} onChange={e => setUserFormData({...userFormData, password: e.target.value})} />
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-xs font-medium text-slate-300">Confirm Password</label>
                      <input type="password" placeholder="••••••••"
                        className={`w-full bg-slate-950 border px-4 py-2.5 rounded-lg outline-none text-slate-200 text-sm ${userFormData.confirmPassword && userFormData.password !== userFormData.confirmPassword ? 'border-rose-500' : 'border-slate-700'}`}
                        value={userFormData.confirmPassword} onChange={e => setUserFormData({...userFormData, confirmPassword: e.target.value})} />
                    </div>
                  </div>
                </div>
              </form>
            </div>

            <div className="px-6 py-4 border-t border-slate-700 bg-slate-900 flex justify-end gap-3">
               <button type="button" onClick={() => setIsUserModalOpen(false)} className="px-5 py-2.5 text-sm font-medium text-slate-400 hover:text-white transition-colors">Cancel</button>
              <button form="user-form" type="submit" className="px-6 py-2.5 bg-amber-500 hover:bg-amber-400 text-slate-900 text-sm font-bold rounded-lg shadow-lg shadow-amber-500/20 transition-all flex items-center gap-2 active:scale-95">
                <Save size={16} /> {userModalMode === 'create' ? 'Create User' : 'Save User'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ==========================================
          MODAL 2: ROLE CONFIGURATION MANAGER
      ========================================== */}
      {isRoleModalOpen && editingRole && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm">
          <div className="bg-slate-900 border border-slate-700/60 rounded-2xl w-full max-w-5xl overflow-hidden shadow-2xl flex flex-col animate-in fade-in zoom-in-95 duration-200">
            <div className="px-6 py-5 border-b border-slate-800 bg-slate-900/80 backdrop-blur-md flex justify-between items-start">
              <div className="flex items-center gap-4">
                <div className="p-3 bg-amber-500/10 rounded-xl border border-amber-500/20 shadow-inner"><Settings2 className="text-amber-500" size={24} /></div>
                <div>
                  <h2 className="text-xl font-bold text-white tracking-tight">Configure Role Access</h2>
                  <div className="mt-2 flex items-center gap-2 flex-wrap">
                    <span className="text-xs text-slate-400 font-medium mr-1">Role Name:</span>
                    <input 
                      type="text"
                      disabled={editingRole.role_name === 'admin'}
                      className="bg-slate-950 border border-slate-700 px-3 py-1 rounded-md text-amber-400 font-bold uppercase text-xs outline-none focus:border-amber-500 disabled:opacity-50"
                      value={editingRole.role_name}
                      onChange={(e) => setEditingRole(prev => ({ ...prev, role_name: e.target.value }))}
                    />
                  </div>
                </div>
              </div>
              <button onClick={() => setIsRoleModalOpen(false)} className="p-2 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition-colors"><X size={20} /></button>
            </div>

            <div className="p-6 bg-[#0b1120] overflow-y-auto max-h-[70vh] custom-scrollbar">
              {(() => {
                const orphanedKeys = findOrphanedFeatureKeys(editingRole.permissions?.features);
                if (orphanedKeys.length === 0) return null;
                return (
                  <div className="mb-6 flex items-center justify-between gap-4 px-4 py-3 rounded-xl bg-amber-500/5 border border-amber-500/20">
                    <div className="flex items-center gap-2 text-xs text-amber-400">
                      <ShieldAlert size={14} className="shrink-0" />
                      <span>{orphanedKeys.length} stale permissions found for dead features: {orphanedKeys.join(", ")}</span>
                    </div>
                    <button onClick={cleanupOrphanedFeatures} className="px-3 py-1.5 text-xs font-semibold text-amber-400 border border-amber-500/30 rounded-lg hover:bg-amber-500/10">Clean up</button>
                  </div>
                );
              })()}

              <div className="mb-10 bg-slate-900/60 p-5 rounded-2xl border border-slate-800">
                <div className="flex items-center gap-3 mb-5 border-b border-slate-800 pb-3">
                  <Layers size={18} className="text-amber-500" />
                  <h3 className="text-sm uppercase tracking-widest text-slate-300 font-bold whitespace-nowrap">Data Access</h3>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                  <div className="space-y-3">
                    <label className="text-xs font-medium text-slate-400 block mb-3">Allowed Regions</label>
                    <div className="flex flex-col gap-2">
                      {availableRegions.map(r => (
                        <label key={r} className={`flex items-center gap-3 p-3 rounded-xl border cursor-pointer transition-all ${editingRole.permissions?.regions?.includes(r) ? 'bg-emerald-500/10 border-emerald-500/50 shadow-sm' : 'bg-slate-950 border-slate-800 hover:border-slate-700'}`}>
                          <input type="checkbox" className="hidden" checked={editingRole.permissions?.regions?.includes(r) || false} onChange={() => toggleRoleRegion(r)} />
                          <div className={`w-4 h-4 rounded-full border flex items-center justify-center transition-colors ${editingRole.permissions?.regions?.includes(r) ? 'bg-emerald-500 border-emerald-500' : 'border-slate-600'}`}>
                            {editingRole.permissions?.regions?.includes(r) && <div className="w-2 h-2 bg-slate-900 rounded-full" />}
                          </div>
                          <span className={`text-sm font-medium capitalize ${editingRole.permissions?.regions?.includes(r) ? 'text-emerald-300' : 'text-slate-400'}`}>{r}</span>
                        </label>
                      ))}
                    </div>
                  </div>

                  <div className="space-y-3 flex flex-col h-full">
                    <label className="text-xs font-medium text-slate-400 block mb-3">Geospatial Layers ({editingRole.permissions?.layers?.length || 0} active)</label>
                    <div className="flex flex-wrap content-start gap-2 bg-slate-950 p-4 rounded-xl border border-slate-800 h-[220px] overflow-y-auto custom-scrollbar">
                      {layerNames.map(name => (
                        <button key={name} type="button" onClick={() => toggleRoleLayer(name)} 
                          className={`px-3 py-1.5 rounded-md text-xs font-bold transition-all border ${editingRole.permissions?.layers?.includes(name) ? "bg-amber-500 border-amber-500 text-slate-900" : "bg-slate-800 border-slate-700 text-slate-400 hover:bg-slate-700"}`}>
                          {name}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-3 mb-6">
                <LayoutDashboard size={18} className="text-amber-500" />
                <h3 className="text-sm uppercase tracking-widest text-slate-300 font-bold whitespace-nowrap">Portal Features & Widgets</h3>
                <div className="h-px flex-1 bg-gradient-to-r from-slate-800 to-transparent"></div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 items-start">
                {Object.entries(featureGroups).map(([groupName, groupFeatures]) => {
                  const parentFeatures = groupFeatures.filter(f => !f.tab);
                  let GroupIcon = LayoutDashboard;
                  if (groupName.includes("Right")) GroupIcon = PanelRight;
                  if (groupName.includes("Left")) GroupIcon = PanelLeft;
                  if (groupName.includes("Top")) GroupIcon = PanelTop;

                  return (
                    <div key={groupName} className="flex flex-col">
                      <div className="flex items-center gap-3 mb-3">
                        <GroupIcon size={14} className="text-slate-500" />
                        <h4 className="text-[11px] uppercase tracking-widest text-slate-500 font-bold whitespace-nowrap">{groupName}</h4>
                      </div>
                      
                      <div className="bg-slate-900/40 border border-slate-800 rounded-2xl p-2 space-y-1 shadow-sm">
                        {parentFeatures.map((parent) => {
                          const isParentEnabled = editingRole.permissions?.features?.[parent.key] === true;
                          const children = groupFeatures.filter(f => f.tab === parent.key);
                          
                          return (
                            <div key={parent.key} className={`rounded-xl transition-all duration-300 ${isParentEnabled ? 'bg-slate-800/40 border border-slate-700/50 shadow-sm' : 'hover:bg-slate-800/30 border border-transparent'}`}>
                              <div onClick={() => toggleRoleFeature(parent.key)} className="flex items-center justify-between p-3.5 cursor-pointer group">
                                <div className="flex items-center gap-3">
                                  <span className={`text-sm font-semibold transition-colors duration-300 ${isParentEnabled ? 'text-slate-100' : 'text-slate-400 group-hover:text-slate-200'}`}>
                                    {parent.label}
                                  </span>
                                </div>
                                <div className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer items-center rounded-full border-2 border-transparent transition-colors duration-300 ease-in-out ${isParentEnabled ? 'bg-amber-500 shadow-[0_0_10px_rgba(245,158,11,0.3)]' : 'bg-slate-700'}`}>
                                  <span className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-md transition duration-300 ease-in-out ${isParentEnabled ? 'translate-x-5' : 'translate-x-0'}`} />
                                </div>
                              </div>

                              {children.length > 0 && (
                                <div className={`overflow-hidden transition-all duration-300 ease-in-out ${isParentEnabled ? 'max-h-96 opacity-100 pb-2' : 'max-h-0 opacity-0'}`}>
                                  <div className="ml-4 pl-4 border-l-2 border-slate-700/50 space-y-1 mr-3">
                                    {children.map((child) => {
                                      const isChildEnabled = editingRole.permissions?.features?.[child.key] === true;
                                      return (
                                        <div key={child.key} onClick={(e) => { e.stopPropagation(); toggleRoleFeature(child.key); }}
                                          className={`flex items-center justify-between p-2.5 rounded-lg cursor-pointer transition-all duration-200 ${isChildEnabled ? 'bg-emerald-500/10 border border-emerald-500/10' : 'hover:bg-slate-800/50 border border-transparent'}`}>
                                          <span className={`text-[13px] font-medium transition-colors ${isChildEnabled ? 'text-emerald-400' : 'text-slate-500'}`}>{child.label}</span>
                                          <div className={`relative inline-flex h-4 w-8 shrink-0 cursor-pointer items-center rounded-full border-2 border-transparent transition-colors duration-300 ease-in-out ${isChildEnabled ? 'bg-emerald-500' : 'bg-slate-700'}`}>
                                            <span className={`pointer-events-none inline-block h-3 w-3 transform rounded-full bg-white shadow-sm transition duration-300 ease-in-out ${isChildEnabled ? 'translate-x-4' : 'translate-x-0'}`} />
                                          </div>
                                        </div>
                                      )
                                    })}
                                  </div>
                                </div>
                              )}
                            </div>
                          )
                        })}
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>

            <div className="px-6 py-4 border-t border-slate-800 bg-slate-900/80 backdrop-blur-md flex items-center justify-between">
              <div className="flex items-center gap-2 text-xs text-slate-500">
                <ShieldAlert size={14} className="text-amber-500/50" /> Updates apply to all users with this role instantly.
              </div>
              <div className="flex justify-end gap-3">
                <button type="button" onClick={() => setIsRoleModalOpen(false)} className="px-5 py-2.5 text-sm font-semibold text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition-all border border-transparent">Discard</button>
                <button onClick={handleSaveRole} className="px-6 py-2.5 bg-amber-500 hover:bg-amber-400 text-slate-900 text-sm font-bold rounded-lg shadow-[0_0_15px_rgba(245,158,11,0.3)] transition-all flex items-center gap-2 active:scale-95">
                  <Save size={16} /> Save Role Config
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ==========================================
          MODAL 3: CREATE NEW ROLE
      ========================================== */}
      {isCreateRoleModalOpen && (
        <div className="fixed inset-0 z-[120] flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm">
          <div className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-md overflow-hidden shadow-2xl flex flex-col animate-in fade-in zoom-in-95 duration-200">
            <div className="px-6 py-4 border-b border-slate-700 flex justify-between items-center bg-slate-900">
              <h2 className="text-lg font-bold text-white flex items-center gap-2.5">
                <ShieldAlert className="text-amber-500" size={20} /> Create New Role
              </h2>
              <button onClick={() => setIsCreateRoleModalOpen(false)} className="text-slate-400 hover:text-white transition-colors"><X size={20} /></button>
            </div>

            <div className="p-6">
              <form id="create-role-form" onSubmit={handleCreateRole} className="space-y-4">
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-slate-300">Role Name <span className="text-rose-500">*</span></label>
                  <input required className="w-full bg-slate-950 border border-slate-700 px-4 py-2.5 rounded-lg focus:ring-2 ring-amber-500/30 outline-none text-slate-200 text-sm lowercase" 
                    value={newRoleName} onChange={e => setNewRoleName(e.target.value)} placeholder="Enter role name..." />
                </div>
              </form>
            </div>

            <div className="px-6 py-4 border-t border-slate-700 bg-slate-900 flex justify-end gap-3">
              <button type="button" onClick={() => setIsCreateRoleModalOpen(false)} className="px-5 py-2.5 text-sm font-medium text-slate-400 hover:text-white transition-colors">Cancel</button>
              <button form="create-role-form" type="submit" className="px-6 py-2.5 bg-amber-500 hover:bg-amber-400 text-slate-900 text-sm font-bold rounded-lg shadow-lg shadow-amber-500/20 transition-all flex items-center gap-2 active:scale-95">
                <Save size={16} /> Create Role
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ==========================================
          MODAL 4: REASSIGN & DELETE ROLE MODAL
      ========================================== */}
      {isReassignModalOpen && roleToDelete && (
        <div className="fixed inset-0 z-[130] flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm">
          <div className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-md overflow-hidden shadow-2xl flex flex-col animate-in fade-in zoom-in-95 duration-200">
            <div className="px-6 py-4 border-b border-slate-700 flex justify-between items-center bg-slate-900">
              <h2 className="text-lg font-bold text-white flex items-center gap-2.5">
                <ArrowRightLeft className="text-amber-500" size={20} /> Reassign Users & Delete Role
              </h2>
              <button onClick={() => setIsReassignModalOpen(false)} className="text-slate-400 hover:text-white transition-colors"><X size={20} /></button>
            </div>

            <div className="p-6 space-y-4">
              <div className="p-4 bg-amber-500/10 border border-amber-500/20 rounded-xl text-xs text-amber-300 leading-relaxed">
                The role <strong className="uppercase font-bold text-white">"{roleToDelete.role_name}"</strong> currently has <strong className="text-white">{users.filter(u => u.role === roleToDelete.role_name).length} user(s)</strong> assigned to it. Please select a replacement role before deleting.
              </div>

              <form id="reassign-form" onSubmit={handleConfirmReassignAndDelete} className="space-y-3">
                <label className="text-xs font-medium text-slate-300 block">Move Assigned Users To:</label>
                <select required className="w-full bg-slate-950 border border-slate-700 px-4 py-2.5 rounded-lg text-sm text-slate-200 outline-none focus:ring-2 ring-amber-500/30 font-bold uppercase" 
                  value={targetRoleId} onChange={e => setTargetRoleId(e.target.value)}>
                  <option value="">-- Select New Role --</option>
                  {rolesList.filter(r => r.id !== roleToDelete.id).map(r => (
                    <option key={r.id} value={r.id}>{r.role_name}</option>
                  ))}
                </select>
              </form>
            </div>

            <div className="px-6 py-4 border-t border-slate-700 bg-slate-900 flex justify-end gap-3">
              <button type="button" onClick={() => setIsReassignModalOpen(false)} className="px-5 py-2.5 text-sm font-medium text-slate-400 hover:text-white transition-colors">Cancel</button>
              <button form="reassign-form" type="submit" className="px-6 py-2.5 bg-rose-600 hover:bg-rose-500 text-white text-sm font-bold rounded-lg shadow-lg shadow-rose-600/25 transition-all flex items-center gap-2 active:scale-95">
                <Trash2 size={16} /> Reassign & Delete Role
              </button>
            </div>
          </div>
        </div>
      )}

      <style dangerouslySetInnerHTML={{__html: `
        .custom-scrollbar::-webkit-scrollbar { width: 6px; }
        .custom-scrollbar::-webkit-scrollbar-track { background: rgba(15, 23, 42, 0.5); border-radius: 4px; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background: rgba(51, 65, 85, 0.8); border-radius: 4px; }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover { background: rgba(71, 85, 105, 1); }
      `}} />
    </div>
  );
}