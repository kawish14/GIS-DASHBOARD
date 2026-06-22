import React, { useState, useEffect } from "react";
import {
  UserPlus,
  Trash2,
  Layers,
  Edit2,
  X,
  Save,
  MapPin,
  Search,
  CheckCircle,
  XCircle,
  LogOut,
  User,
  Lock,
  ChevronLeft,
  ChevronRight,
  ShieldAlert,
  Settings2,
  ToggleRight,
  PanelRight,       // <-- NEW
  PanelLeft,        // <-- NEW
  PanelTop,         // <-- NEW
  LayoutDashboard   // <-- NEW
} from "lucide-react";
import logo from "../assets/images/TesLogo.png";
import { useAuth } from "../context/AuthContext";
import { authenticate, api } from "../../url";

// Fetches GeoServer Layers
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

    layerNames.push("Vehicles"); // Manually add the real-time layer to the list
    
    return layerNames;
  } catch (error) {
    console.error("Failed to fetch layers", error);
    return [];
  }
};

// --- CENTRAL FEATURE REGISTRY ---
const AVAILABLE_FEATURES = [

  // Right Sidebar Tabs
  { key: "tab_Details", label: "Details Tab", group: "Right Sidebar Tab" },
  { key: "tab_Layer", label: "Layer List Tab", group: "Right Sidebar Tab" },
  { key: "tab_Map_Tools", label: "Map Tools Tab", group: "Right Sidebar Tab" },
  { key: "tab_Filter", label: "Filters Tab", group: "Right Sidebar Tab" },

  //Left Sidebar Tools
  { key: "tab_Alarm_State", label: "Alarm State Tab", group: "Left Sidebar Tab" },
  { key: "tab_Active_Users", label: "Active Users Tab", group: "Left Sidebar Tab" },

  // Top Bar Tools
  { key: "tab_CustomerDropDwon", label: "Customer Dropdown", group: "TopBar Tool" },
  { key: "SearchWidget", label: "Search Widget", group: "TopBar Tool" },

  //Map Widgets
  { key: "tool_base_map", label: "Base Map Switcher", group: "Right Sidebar Tab", tab: "tab_Map_Tools" },
  { key: "tool_selection", label: "Selection Tools", group: "Right Sidebar Tab", tab: "tab_Map_Tools" },
  { key: "tool_densityMap", label: "Density Map", group: "Right Sidebar Tab", tab: "tab_Map_Tools" },
  {key:"tool_heatMap", label:"Heatmap", group:"Right Sidebar Tab", tab:"tab_Map_Tools"},
  {key:"tool_CustomerFilter", label:"Customer Fault Filter", group:"Right Sidebar Tab", tab:"tab_Filter"},
  {key:"tool_CustomerInactiveFilter", label:"Inactive Customer Filter", group:"Right Sidebar Tab", tab:"tab_Filter"},
  {key:"tool_OLT_Customer", label:"OLT Filter", group:"Right Sidebar Tab", tab:"tab_Filter"},

  {key:"tab_AIChat", label:"AI Chat Tab", group:"Right Sidebar Tab" } // <-- NEW AI CHAT TAB
];

export default function AdminPanel() {
  const { logout } = useAuth();
  const [layerNames, setLayerNames] = useState([]);
  const [users, setUsers] = useState([]);
  const [filteredUsers, setFilteredUsers] = useState([]);
  const [err, setErr] = useState(null);
  const [successMsg, setSuccessMsg] = useState(null);
  const [searchTerm, setSearchTerm] = useState("");

  // Pagination State - FIXED TO 5 ROWS
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 5; 

  // Modal States
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [modalMode, setModalMode] = useState("create");
  
  // Feature Modal State
  const [isFeatureModalOpen, setIsFeatureModalOpen] = useState(false);
  const [featureUser, setFeatureUser] = useState(null);

  // Form State
  const initialFormState = {
    id: null,
    username: "",
    password: "",
    confirmPassword: "",
    full_name: "",
    email: "",
    role: "south.tech",
    permissions: { 
      layers: [], 
      regions: ["South"],
      features: {
        tab_details: true,
        tab_layer: true,
        tab_map_tools: true,
        tab_filter: true,
        tool_base_map: true,
        tool_selection: true
      }
    },
  };

  const [formData, setFormData] = useState(initialFormState);

  const regions = ["South", "Central", "North"];
  const roles = [
    "south.tech", "central.tech", "north.tech", "twa", "commercial", "management", "admin", "gis"
  ];

  // Initialization
  useEffect(() => {
    fetchUsers();
    listLayer().then(r => setLayerNames(r));
  }, []);

  // Filtering & Pagination Reset
  useEffect(() => {
    let filtered = users;
    if (searchTerm) {
      filtered = filtered.filter(
        (u) =>
          u.username?.toLowerCase().includes(searchTerm.toLowerCase()) ||
          u.full_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
          u.email?.toLowerCase().includes(searchTerm.toLowerCase()) ||
          u.role?.toLowerCase().includes(searchTerm.toLowerCase())
      );
    }
    setFilteredUsers(filtered);
    setCurrentPage(1); 
  }, [users, searchTerm]);

  // Pagination Calculations
  const totalPages = Math.ceil(filteredUsers.length / itemsPerPage);
  const indexOfLastItem = currentPage * itemsPerPage;
  const indexOfFirstItem = indexOfLastItem - itemsPerPage;
  const currentUsers = filteredUsers.slice(indexOfFirstItem, indexOfLastItem);

  const fetchUsers = async () => {
    try {
      const res = await fetch(`${authenticate}/admin/users`, { credentials: "include" });
      const data = await res.json();
      const userList = Array.isArray(data) ? data : data.users || [];
      
      const Users = userList
        // --> ADD THIS FILTER TO HIDE THE ADMIN USER <--
        .filter((u) => u.username?.toLowerCase() !== "admin") 
        .map((u) => ({
          ...u,
          permissions: u.permissions || { layers: [], regions: [], features: {} },
        }));
        
      setUsers(Users);
    } catch (error) {
      console.error("Error fetching users", error);
    }
  };

  const showSuccess = (msg) => {
    setSuccessMsg(msg);
    setTimeout(() => setSuccessMsg(null), 3000);
  };

  const showError = (msg) => {
    setErr(msg);
    setTimeout(() => setErr(null), 4000);
  };

  // --- Main User Modal Handlers ---
  const openCreateModal = () => {
    setModalMode("create");
    setFormData(initialFormState);
    setIsModalOpen(true);
  };

  const openEditModal = (user) => {
    setModalMode("edit");
    setFormData({
      id: user.id,
      username: user.username || "",
      password: "",
      confirmPassword: "",
      full_name: user.full_name || "",
      email: user.email || "",
      role: user.role || "",
      permissions: {
        layers: user.permissions?.layers || [],
        regions: user.permissions?.regions || [],
        features: user.permissions?.features || {},
      },
    });
    setIsModalOpen(true);
  };

  const closeModal = () => {
    setIsModalOpen(false);
    setErr(null);
  };

  const toggleLayer = (layerName) => {
    const current = formData.permissions.layers;
    const next = current.includes(layerName)
      ? current.filter((l) => l !== layerName)
      : [...current, layerName];
    setFormData({ ...formData, permissions: { ...formData.permissions, layers: next } });
  };

  const toggleRegion = (regionName) => {
    const current = formData.permissions.regions;
    const next = current.includes(regionName)
      ? current.filter((r) => r !== regionName)
      : [...current, regionName];
    setFormData({ ...formData, permissions: { ...formData.permissions, regions: next } });
  };

  // Toggles feature inside the Create/Edit form
  const toggleFormFeature = (featureKey) => {
    setFormData((prev) => ({
      ...prev,
      permissions: {
        ...prev.permissions,
        features: {
          ...prev.permissions.features,
          [featureKey]: !prev.permissions.features?.[featureKey]
        }
      }
    }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (modalMode === "create" && !formData.password) {
      return showError("Password is required for new users.");
    }
    if (formData.password !== formData.confirmPassword) {
      return showError("Passwords do not match.");
    }

    const payload = { ...formData };
    delete payload.confirmPassword;
    if (modalMode === "edit" && !payload.password) delete payload.password;

    try {
      const url = modalMode === "edit" ? `${authenticate}/admin/users/${formData.id}` : `${authenticate}/admin/users`;
      const method = modalMode === "edit" ? "PUT" : "POST";

      const response = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
        credentials: "include",
      });

      if (response.ok) {
        fetchUsers();
        showSuccess(modalMode === "create" ? "User created successfully" : "User updated successfully");
        closeModal();
      } else {
        const errorData = await response.json();
        showError(errorData.error || "Operation failed");
      }
    } catch (error) {
      showError("Server connection failed");
    }
  };

  const handleDeleteUser = async (userId) => {
    if (!window.confirm("Are you sure you want to permanently delete this user?")) return;
    try {
      const response = await fetch(`${authenticate}/admin/users/${userId}`, {
        method: "DELETE",
        credentials: "include",
      });
      if (response.ok) {
        fetchUsers();
        showSuccess("User deleted successfully");
        if (currentUsers.length === 1 && currentPage > 1) {
          setCurrentPage(currentPage - 1);
        }
      }
    } catch (error) {
      showError("Delete failed");
    }
  };

  // --- Dedicated Feature Modal Handlers ---
  const openFeatureModal = (user) => {
    setFeatureUser(JSON.parse(JSON.stringify(user)));
    setIsFeatureModalOpen(true);
  };

  const closeFeatureModal = () => {
    setIsFeatureModalOpen(false);
    setFeatureUser(null);
  };

  const toggleUserFeature = (featureKey) => {
    setFeatureUser((prev) => {
      const currentFeatures = prev.permissions?.features || {};
      return {
        ...prev,
        permissions: {
          ...prev.permissions,
          features: {
            ...currentFeatures,
            [featureKey]: !currentFeatures[featureKey], 
          },
        },
      };
    });
  };

  const handleSaveFeatures = async () => {
    try {
      const payload = {
        username: featureUser.username,
        full_name: featureUser.full_name,
        email: featureUser.email,
        role: featureUser.role,
        permissions: featureUser.permissions,
      };

      const response = await fetch(`${authenticate}/admin/users/${featureUser.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
        credentials: "include",
      });

      if (response.ok) {
        fetchUsers(); 
        showSuccess("Portal features updated successfully!");
        closeFeatureModal();
      } else {
        const errorData = await response.json();
        showError(errorData.error || "Failed to update features.");
      }
    } catch (error) {
      showError("Server connection failed while saving features.");
    }
  };

  const featureGroups = AVAILABLE_FEATURES.reduce((groups, feature) => {
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
            <button onClick={openCreateModal} className="flex items-center gap-2 px-4 py-2 bg-amber-500 hover:bg-amber-400 text-slate-900 text-sm font-bold rounded-lg transition-all shadow-lg shadow-amber-500/20 active:scale-95">
              <UserPlus size={16} /> Add User
            </button>
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

        {/* --- CONTROLS SECTION --- */}
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-4">
           <div className="lg:col-span-3 relative group">
             <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500 group-focus-within:text-amber-500 transition-colors" size={18} />
             <input 
               type="text" 
               placeholder="Search users by name, email, or role..." 
               value={searchTerm} 
               onChange={e => setSearchTerm(e.target.value)} 
               className="w-full pl-11 pr-4 py-3 bg-slate-800/50 border border-slate-700 rounded-xl text-slate-200 placeholder-slate-500 focus:ring-2 ring-amber-500/30 focus:border-amber-500/50 outline-none text-sm transition-all shadow-sm" 
             />
           </div>
           <div className="bg-slate-800/50 border border-slate-700 rounded-xl flex items-center justify-between px-6 py-3 shadow-sm">
              <span className="text-slate-400 text-sm font-medium">Total Users</span>
              <span className="text-xl font-bold text-white">{filteredUsers.length}</span>
           </div>
        </div>

        {/* --- DATA TABLE --- */}
        <div className="bg-slate-800/40 border border-slate-700/50 rounded-xl shadow-xl overflow-hidden flex flex-col">
          <div className="overflow-x-auto min-h-[420px]"> {/* Kept a minimum height so it doesn't jump too much on last page */}
            <table className="w-full text-left border-collapse whitespace-nowrap">
              <thead className="bg-slate-900/80 text-slate-300 text-[11px] uppercase tracking-wider font-semibold border-b border-slate-700">
                <tr>
                  <th className="px-6 py-4">User</th>
                  <th className="px-6 py-4">Role</th>
                  <th className="px-6 py-4">Regions</th>
                  <th className="px-6 py-4">Layer Access</th>
                  <th className="px-6 py-4">Portal Features</th> 
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
                        <span className="inline-flex items-center px-2.5 py-1 rounded-md bg-amber-500/10 text-amber-400 border border-amber-500/20 text-[10px] font-bold uppercase tracking-widest">
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
                          ) : (
                            <span className="text-slate-600 text-xs italic">None</span>
                          )}
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
                          ) : (
                            <span className="text-slate-600 text-xs italic">No layers</span>
                          )}
                          {u.permissions?.layers?.length > 3 && (
                            <span className="text-[10px] bg-slate-900 text-slate-400 border border-slate-700 px-1.5 py-0.5 rounded">
                              +{u.permissions.layers.length - 3} more
                            </span>
                          )}
                        </div>
                      </td>
                      
                      <td className="px-6 py-4">
                         <button 
                           onClick={() => openFeatureModal(u)} 
                           className="flex items-center gap-2 px-3 py-1.5 bg-slate-900 hover:bg-slate-800 text-amber-400 border border-slate-700 hover:border-amber-500/50 rounded-lg transition-all text-[11px] font-bold tracking-wide shadow-sm"
                         >
                           <Settings2 size={14} /> Features
                         </button>
                      </td>

                      <td className="px-6 py-4 text-right">
                        <div className="flex justify-end gap-2">
                          <button 
                            onClick={() => openEditModal(u)} 
                            className="p-1.5 text-slate-400 hover:text-amber-400 hover:bg-amber-500/10 rounded-md transition-colors border border-transparent hover:border-amber-500/30" 
                            title="Edit User"
                          >
                            <Edit2 size={18} />
                          </button>
                          <button 
                            onClick={() => handleDeleteUser(u.id)} 
                            className="p-1.5 text-slate-400 hover:text-rose-400 hover:bg-rose-500/10 rounded-md transition-colors border border-transparent hover:border-rose-500/30" 
                            title="Delete User"
                          >
                            <Trash2 size={18} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan="6" className="px-6 py-16 text-center">
                      <div className="flex flex-col items-center justify-center text-slate-500">
                        <Search size={32} className="mb-3 opacity-20" />
                        <p className="text-sm font-medium text-slate-400">No matching users found</p>
                        <p className="text-xs mt-1">Try adjusting your search filters.</p>
                      </div>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {/* --- BOTTOM RIGHT PAGINATION FOOTER --- */}
          {filteredUsers.length > 0 && (
            <div className="px-6 py-4 border-t border-slate-700 bg-slate-900/50 flex flex-col sm:flex-row items-center justify-between gap-4">
              <span className="text-xs text-slate-400">
                Showing <span className="font-semibold text-white">{indexOfFirstItem + 1}</span> to <span className="font-semibold text-white">{Math.min(indexOfLastItem, filteredUsers.length)}</span> of <span className="font-semibold text-white">{filteredUsers.length}</span> results
              </span>
              
              {/* Controls aligned to the right */}
              <div className="flex items-center gap-2 justify-end">
                <button 
                  onClick={() => setCurrentPage(prev => Math.max(prev - 1, 1))}
                  disabled={currentPage === 1}
                  className="flex items-center gap-1 px-3 py-1.5 rounded-lg border border-slate-600 text-slate-300 hover:bg-slate-800 disabled:opacity-50 disabled:cursor-not-allowed transition-colors text-xs font-semibold"
                >
                  <ChevronLeft size={16} /> Prev
                </button>
                
                <div className="flex items-center gap-1 px-2">
                  {Array.from({ length: totalPages }, (_, i) => i + 1).map(page => (
                    <button
                      key={page}
                      onClick={() => setCurrentPage(page)}
                      className={`w-8 h-8 rounded-lg text-xs font-bold transition-colors ${
                        currentPage === page 
                          ? 'bg-amber-500 text-slate-900 border border-amber-500 shadow-sm' 
                          : 'text-slate-400 hover:bg-slate-800 border border-transparent'
                      }`}
                    >
                      {page}
                    </button>
                  ))}
                </div>

                <button 
                  onClick={() => setCurrentPage(prev => Math.min(prev + 1, totalPages))}
                  disabled={currentPage === totalPages}
                  className="flex items-center gap-1 px-3 py-1.5 rounded-lg border border-slate-600 text-slate-300 hover:bg-slate-800 disabled:opacity-50 disabled:cursor-not-allowed transition-colors text-xs font-semibold"
                >
                  Next <ChevronRight size={16} />
                </button>
              </div>
            </div>
          )}
        </div>
      </main>

      {/* ==========================================
          MODAL 1: CREATE & EDIT USER (Standard)
      ========================================== */}
      {isModalOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm">
          <div className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-4xl max-h-[90vh] overflow-hidden shadow-2xl flex flex-col animate-in fade-in zoom-in-95 duration-200">
            
            <div className="px-6 py-4 border-b border-slate-700 flex justify-between items-center bg-slate-900">
              <h2 className="text-lg font-bold text-white flex items-center gap-2.5">
                {modalMode === 'create' ? <UserPlus className="text-amber-500" size={20} /> : <Edit2 className="text-amber-500" size={20} />}
                {modalMode === 'create' ? 'Create New User' : 'Edit User Settings'}
              </h2>
              <button onClick={closeModal} className="text-slate-400 hover:text-white transition-colors">
                <X size={20} />
              </button>
            </div>

            <div className="overflow-y-auto p-6 scrollbar-thin scrollbar-thumb-slate-700 scrollbar-track-transparent">
              <form id="user-form" onSubmit={handleSubmit} className="space-y-8">
                
                {/* Profile */}
                <div>
                  <h3 className="text-xs uppercase tracking-widest font-bold text-slate-500 mb-4 flex items-center gap-2 border-b border-slate-800 pb-2">
                    <User size={14} /> Profile Information
                  </h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                    <div className="space-y-1.5">
                      <label className="text-xs font-medium text-slate-300">Username <span className="text-rose-500">*</span></label>
                      <input required className="w-full bg-slate-950 border border-slate-700 px-4 py-2.5 rounded-lg focus:ring-2 ring-amber-500/30 focus:border-amber-500 outline-none text-slate-200 text-sm transition-all" 
                        value={formData.username} onChange={e => setFormData({...formData, username: e.target.value})} 
                      />
                    </div>
                    <div className="space-y-1.5">
                       <label className="text-xs font-medium text-slate-300">Email Address <span className="text-rose-500">*</span></label>
                      <input required type="email" className="w-full bg-slate-950 border border-slate-700 px-4 py-2.5 rounded-lg focus:ring-2 ring-amber-500/30 focus:border-amber-500 outline-none text-slate-200 text-sm transition-all" 
                        value={formData.email} onChange={e => setFormData({...formData, email: e.target.value})} 
                      />
                    </div>
                    <div className="space-y-1.5 md:col-span-2">
                       <label className="text-xs font-medium text-slate-300">Full Name <span className="text-rose-500">*</span></label>
                      <input required className="w-full bg-slate-950 border border-slate-700 px-4 py-2.5 rounded-lg focus:ring-2 ring-amber-500/30 focus:border-amber-500 outline-none text-slate-200 text-sm transition-all" 
                        value={formData.full_name} onChange={e => setFormData({...formData, full_name: e.target.value})} 
                      />
                    </div>
                  </div>
                </div>

                {/* Security */}
                <div className="bg-slate-800/50 p-5 rounded-xl border border-slate-700/50">
                  <h3 className="text-xs uppercase tracking-widest font-bold text-amber-500 mb-4 flex items-center gap-2">
                    <Lock size={14} /> Authentication
                  </h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                    <div className="space-y-1.5">
                      <label className="text-xs font-medium text-slate-300">
                        {modalMode === 'edit' ? 'New Password' : 'Password'} {modalMode === 'create' && <span className="text-rose-500">*</span>}
                      </label>
                      <input type="password" placeholder={modalMode === 'edit' ? "Leave blank to keep current" : "••••••••"}
                        className="w-full bg-slate-950 border border-slate-700 px-4 py-2.5 rounded-lg focus:ring-2 ring-amber-500/30 focus:border-amber-500 outline-none text-slate-200 text-sm placeholder-slate-600 transition-all"
                        value={formData.password} onChange={e => setFormData({...formData, password: e.target.value})}
                      />
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-xs font-medium text-slate-300">Confirm Password</label>
                      <input type="password" placeholder="••••••••"
                        className={`w-full bg-slate-950 border px-4 py-2.5 rounded-lg focus:ring-2 ring-amber-500/30 outline-none text-slate-200 text-sm placeholder-slate-600 transition-all ${formData.confirmPassword && formData.password !== formData.confirmPassword ? 'border-rose-500 focus:border-rose-500' : 'border-slate-700 focus:border-amber-500'}`}
                        value={formData.confirmPassword} onChange={e => setFormData({...formData, confirmPassword: e.target.value})}
                      />
                    </div>
                  </div>
                </div>

                {/* Permissions & Layers */}
                <div>
                  <h3 className="text-xs uppercase tracking-widest font-bold text-slate-500 mb-4 flex items-center gap-2 border-b border-slate-800 pb-2">
                    <ShieldAlert size={14} /> Roles & Data Permissions
                  </h3>
                  
                  <div className="space-y-6">
                    <div className="space-y-1.5 md:w-1/2">
                      <label className="text-xs font-medium text-slate-300">System Role</label>
                      <select className="w-full bg-slate-950 border border-slate-700 px-4 py-2.5 rounded-lg text-sm text-slate-200 outline-none focus:ring-2 ring-amber-500/30 focus:border-amber-500 transition-all" 
                        value={formData.role} onChange={e => setFormData({...formData, role: e.target.value})}>
                        {roles.map(r => <option key={r} value={r}>{r}</option>)}
                      </select>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      <div className="space-y-2">
                        <label className="text-xs font-medium text-slate-400 block mb-2">Assigned Regions</label>
                        <div className="flex flex-col gap-2">
                          {regions.map(r => (
                            <label key={r} className={`flex items-center gap-3 p-3 rounded-xl border cursor-pointer transition-all ${formData.permissions.regions.includes(r) ? 'bg-emerald-500/10 border-emerald-500/50 shadow-sm' : 'bg-slate-950 border-slate-700 hover:border-slate-600'}`}>
                              <input type="checkbox" className="hidden" checked={formData.permissions.regions.includes(r)} onChange={() => toggleRegion(r)} />
                              <div className={`w-4 h-4 rounded-full border flex items-center justify-center transition-colors ${formData.permissions.regions.includes(r) ? 'bg-emerald-500 border-emerald-500' : 'border-slate-500'}`}>
                                {formData.permissions.regions.includes(r) && <div className="w-2 h-2 bg-slate-900 rounded-full" />}
                              </div>
                              <span className={`text-sm font-medium capitalize ${formData.permissions.regions.includes(r) ? 'text-emerald-300' : 'text-slate-400'}`}>{r}</span>
                            </label>
                          ))}
                        </div>
                      </div>

                      <div className="space-y-2 flex flex-col h-full">
                        <label className="text-xs font-medium text-slate-400 block mb-2">Data Layer Access ({formData.permissions.layers.length})</label>
                        <div className="flex flex-wrap content-start gap-2 bg-slate-950 p-4 rounded-xl border border-slate-700 h-[200px] overflow-y-auto custom-scrollbar">
                          {layerNames.map(name => (
                            <button 
                              key={name} type="button" onClick={() => toggleLayer(name)} 
                              className={`px-3 py-1.5 rounded-md text-xs font-bold transition-all border ${formData.permissions.layers.includes(name) ? "bg-amber-500 border-amber-500 text-slate-900" : "bg-slate-800 border-slate-700 text-slate-400 hover:bg-slate-700"}`}
                            >
                              {name}
                            </button>
                          ))}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                {/* NEW FEATURE SECTION IN THE CREATION FORM */}
               <div className="pt-2">
                  <h3 className="text-xs uppercase tracking-widest font-bold text-slate-500 mb-4 flex items-center gap-2 border-b border-slate-800 pb-2">
                    <ToggleRight size={14} /> Initial Portal Features
                  </h3>
                  
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {Object.entries(featureGroups).map(([groupName, groupFeatures]) => {
                      // Separate parents (tabs) from children (widgets inside tabs)
                      const parentFeatures = groupFeatures.filter(f => !f.tab);
                      
                      return (
                        <div key={groupName} className="p-4 bg-slate-950 rounded-xl border border-slate-700 space-y-4">
                          <h4 className="text-[10px] uppercase tracking-wider text-slate-500 font-bold border-b border-slate-800 pb-1.5 mb-1">
                            {groupName}
                          </h4>
                          
                          {parentFeatures.map((parent) => {
                            const isParentEnabled = formData.permissions.features?.[parent.key] === true;
                            const children = groupFeatures.filter(f => f.tab === parent.key);

                            return (
                              <div key={parent.key} className="space-y-2">
                                {/* Parent Toggle */}
                                <div 
                                  onClick={() => toggleFormFeature(parent.key)}
                                  className="flex items-center justify-between cursor-pointer group"
                                >
                                  <span className={`text-xs font-bold transition-colors ${isParentEnabled ? 'text-amber-400' : 'text-slate-400 group-hover:text-slate-300'}`}>
                                    {parent.label}
                                  </span>
                                  <div className={`relative inline-flex h-4 w-8 items-center rounded-full transition-colors ${isParentEnabled ? 'bg-amber-500' : 'bg-slate-700'}`}>
                                    <span className={`inline-block h-2.5 w-2.5 transform rounded-full bg-white transition-transform ${isParentEnabled ? 'translate-x-4' : 'translate-x-1'}`} />
                                  </div>
                                </div>

                                {/* Nested Children Toggles */}
                                {children.length > 0 && (
                                  <div className="pl-4 ml-2 border-l border-slate-700 space-y-2">
                                    {children.map(child => {
                                      const isChildEnabled = formData.permissions.features?.[child.key] === true;
                                      return (
                                        <div 
                                          key={child.key}
                                          onClick={() => toggleFormFeature(child.key)}
                                          className="flex items-center justify-between cursor-pointer group pt-1"
                                        >
                                          <span className={`text-[11px] font-medium transition-colors ${isChildEnabled ? 'text-emerald-400' : 'text-slate-500 group-hover:text-slate-400'}`}>
                                            └ {child.label}
                                          </span>
                                          <div className={`relative inline-flex h-3.5 w-7 items-center rounded-full transition-colors ${isChildEnabled ? 'bg-emerald-500' : 'bg-slate-800'}`}>
                                            <span className={`inline-block h-2 w-2 transform rounded-full bg-white transition-transform ${isChildEnabled ? 'translate-x-4' : 'translate-x-1'}`} />
                                          </div>
                                        </div>
                                      )
                                    })}
                                  </div>
                                )}
                              </div>
                            )
                          })}
                        </div>
                      )
                    })}
                  </div>
                </div>

              </form>
            </div>

            {/* Modal Footer */}
            <div className="px-6 py-4 border-t border-slate-700 bg-slate-900 flex justify-end gap-3">
               <button type="button" onClick={closeModal} className="px-5 py-2.5 text-sm font-medium text-slate-400 hover:text-white transition-colors">
                Cancel
              </button>
              <button form="user-form" type="submit" className="px-6 py-2.5 bg-amber-500 hover:bg-amber-400 text-slate-900 text-sm font-bold rounded-lg shadow-lg shadow-amber-500/20 transition-all flex items-center gap-2 active:scale-95">
                <Save size={16} /> {modalMode === 'create' ? 'Create User' : 'Save Changes'}
              </button>
            </div>

          </div>
        </div>
      )}


      {/* ==========================================
          MODAL 2: DEDICATED FEATURE MANAGER (PRO UI)
      ========================================== */}
      {isFeatureModalOpen && featureUser && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm">
          <div className="bg-slate-900 border border-slate-700/60 rounded-2xl w-full max-w-4xl overflow-hidden shadow-2xl flex flex-col animate-in fade-in zoom-in-95 duration-200">
            
            {/* Pro Header */}
            <div className="px-6 py-5 border-b border-slate-800 bg-slate-900/80 backdrop-blur-md flex justify-between items-start">
              <div className="flex items-center gap-4">
                <div className="p-3 bg-amber-500/10 rounded-xl border border-amber-500/20 shadow-inner">
                  <Settings2 className="text-amber-500" size={24} />
                </div>
                <div>
                  <h2 className="text-xl font-bold text-white tracking-tight">Portal Features</h2>
                  
                  {/* PRO TAGS ROW */}
                  <div className="mt-2 flex items-center gap-2 flex-wrap">
                    <span className="text-xs text-slate-400 font-medium mr-1">
                      Configuring access for:
                    </span>
                    
                    {/* Username Tag */}
                    <span className="text-amber-400 bg-amber-400/10 px-2.5 py-1 rounded-md text-xs font-semibold tracking-wide border border-amber-500/20 flex items-center gap-1.5 shadow-sm">
                      <User size={12} /> @{featureUser.username}
                    </span>

                    {/* Role Tag */}
                    <span className="text-cyan-400 bg-cyan-500/10 px-2.5 py-1 rounded-md font-bold uppercase text-[10px] tracking-widest border border-cyan-500/20 flex items-center gap-1.5 shadow-sm">
                      <ShieldAlert size={12} /> {featureUser.role}
                    </span>

                    {/* Region Tags */}
                    {featureUser.permissions?.regions?.length > 0 ? (
                      featureUser.permissions.regions.map(r => (
                        <span key={r} className="text-emerald-400 bg-emerald-500/10 px-2.5 py-1 rounded-md text-[11px] font-semibold tracking-wide border border-emerald-500/20 flex items-center gap-1 shadow-sm capitalize">
                          <MapPin size={12} /> {r}
                        </span>
                      ))
                    ) : (
                      <span className="text-slate-500 bg-slate-800 px-2.5 py-1 rounded-md text-[11px] font-medium border border-slate-700 italic">
                        No Regions
                      </span>
                    )}
                  </div>

                </div>
              </div>
              <button onClick={closeFeatureModal} className="p-2 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition-colors border border-transparent hover:border-slate-700">
                <X size={20} />
              </button>
            </div>

            {/* Pro Body */}
            <div className="p-6 bg-[#0b1120] overflow-y-auto max-h-[65vh] custom-scrollbar">
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                {Object.entries(featureGroups).map(([groupName, groupFeatures]) => {
                  const parentFeatures = groupFeatures.filter(f => !f.tab);

                  // Pick an icon based on the group name
                  let GroupIcon = LayoutDashboard;
                  if (groupName.includes("Right")) GroupIcon = PanelRight;
                  if (groupName.includes("Left")) GroupIcon = PanelLeft;
                  if (groupName.includes("Top")) GroupIcon = PanelTop;

                  return (
                    <div key={groupName} className="flex flex-col">
                      
                      {/* Section Title with gradient lines */}
                      <div className="flex items-center gap-3 mb-4">
                        <GroupIcon size={16} className="text-slate-500" />
                        <h4 className="text-xs uppercase tracking-widest text-slate-400 font-bold whitespace-nowrap">
                          {groupName}
                        </h4>
                        <div className="h-px flex-1 bg-gradient-to-r from-slate-800 to-transparent"></div>
                      </div>
                      
                      {/* Card Container */}
                      <div className="bg-slate-900/40 border border-slate-800 rounded-2xl p-2 space-y-1 shadow-sm">
                        
                        {parentFeatures.map((parent) => {
                          const isParentEnabled = featureUser.permissions?.features?.[parent.key] === true;
                          const children = groupFeatures.filter(f => f.tab === parent.key);
                          
                          return (
                            <div key={parent.key} className={`rounded-xl transition-all duration-300 ${isParentEnabled ? 'bg-slate-800/40 border border-slate-700/50 shadow-sm' : 'hover:bg-slate-800/30 border border-transparent'}`}>
                              
                              {/* Parent Row */}
                              <div 
                                onClick={() => toggleUserFeature(parent.key)}
                                className="flex items-center justify-between p-3.5 cursor-pointer group"
                              >
                                <div className="flex items-center gap-3">
                                  <div className={`flex items-center justify-center w-8 h-8 rounded-lg transition-colors duration-300 ${isParentEnabled ? 'bg-amber-500/10 text-amber-500 shadow-inner' : 'bg-slate-800 text-slate-500 group-hover:bg-slate-700 group-hover:text-slate-300'}`}>
                                    <Layers size={16} />
                                  </div>
                                  <span className={`text-sm font-semibold transition-colors duration-300 ${isParentEnabled ? 'text-slate-100' : 'text-slate-400 group-hover:text-slate-200'}`}>
                                    {parent.label}
                                  </span>
                                </div>
                                
                                {/* Pro iOS Toggle Switch */}
                                <div className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer items-center rounded-full border-2 border-transparent transition-colors duration-300 ease-in-out ${isParentEnabled ? 'bg-amber-500 shadow-[0_0_10px_rgba(245,158,11,0.3)]' : 'bg-slate-700'}`}>
                                  <span className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-md ring-0 transition duration-300 ease-in-out ${isParentEnabled ? 'translate-x-5' : 'translate-x-0'}`} />
                                </div>
                              </div>

                              {/* Nested Children (Collapses if Parent is OFF) */}
                              {children.length > 0 && (
                                <div className={`overflow-hidden transition-all duration-300 ease-in-out ${isParentEnabled ? 'max-h-96 opacity-100 pb-2' : 'max-h-0 opacity-0'}`}>
                                  <div className="ml-11 pl-4 border-l-2 border-slate-700/50 space-y-1 mr-3">
                                    {children.map((child) => {
                                      const isChildEnabled = featureUser.permissions?.features?.[child.key] === true;
                                      return (
                                        <div 
                                          key={child.key} 
                                          onClick={(e) => {
                                            e.stopPropagation(); // Prevent clicking child from toggling parent
                                            toggleUserFeature(child.key);
                                          }}
                                          className={`flex items-center justify-between p-2.5 rounded-lg cursor-pointer transition-all duration-200 ${isChildEnabled ? 'bg-emerald-500/10 hover:bg-emerald-500/20 border border-emerald-500/10' : 'hover:bg-slate-800/50 border border-transparent'}`}
                                        >
                                          <span className={`text-[13px] font-medium transition-colors ${isChildEnabled ? 'text-emerald-400' : 'text-slate-500'}`}>
                                            {child.label}
                                          </span>
                                          
                                          {/* Smaller Pro Toggle for Children */}
                                          <div className={`relative inline-flex h-4 w-8 shrink-0 cursor-pointer items-center rounded-full border-2 border-transparent transition-colors duration-300 ease-in-out ${isChildEnabled ? 'bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.3)]' : 'bg-slate-700'}`}>
                                            <span className={`pointer-events-none inline-block h-3 w-3 transform rounded-full bg-white shadow-sm ring-0 transition duration-300 ease-in-out ${isChildEnabled ? 'translate-x-4' : 'translate-x-0'}`} />
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

            {/* Pro Footer */}
            <div className="px-6 py-4 border-t border-slate-800 bg-slate-900/80 backdrop-blur-md flex items-center justify-between">
              <div className="flex items-center gap-2 text-xs text-slate-500">
                <ShieldAlert size={14} className="text-amber-500/50" />
                Changes apply instantly upon saving.
              </div>
              <div className="flex justify-end gap-3">
                <button type="button" onClick={closeFeatureModal} className="px-5 py-2.5 text-sm font-semibold text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition-all border border-transparent hover:border-slate-700">
                  Discard
                </button>
                <button onClick={handleSaveFeatures} className="px-6 py-2.5 bg-amber-500 hover:bg-amber-400 text-slate-900 text-sm font-bold rounded-lg shadow-[0_0_15px_rgba(245,158,11,0.3)] hover:shadow-[0_0_20px_rgba(245,158,11,0.5)] transition-all flex items-center gap-2 active:scale-95">
                  <Save size={16} /> Save Capabilities
                </button>
              </div>
            </div>

          </div>
        </div>
      )}

      {/* --- SCROLLBAR CSS --- */}
      <style dangerouslySetInnerHTML={{__html: `
        .custom-scrollbar::-webkit-scrollbar { width: 6px; }
        .custom-scrollbar::-webkit-scrollbar-track { background: rgba(15, 23, 42, 0.5); border-radius: 4px; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background: rgba(51, 65, 85, 0.8); border-radius: 4px; }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover { background: rgba(71, 85, 105, 1); }
      `}} />
    </div>
  );
}