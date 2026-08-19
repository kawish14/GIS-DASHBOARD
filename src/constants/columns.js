// constants/columns.js

// Helper function for fault duration (if needed)
const calculateDuration = (faultTimeStr) => {
  if (!faultTimeStr) return "-";
  const faultTime = new Date(faultTimeStr);
  if (isNaN(faultTime.getTime())) return "-";
  const diffMs = Date.now() - faultTime;
  if (diffMs <= 0) return "0s";
  const days = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  const hours = Math.floor((diffMs / (1000 * 60 * 60)) % 24);
  const minutes = Math.floor((diffMs / 1000 / 60) % 60);
  const seconds = Math.floor((diffMs / 1000) % 60);
  const parts = [];
  if (days > 0) parts.push(`${days}d`);
  if (hours > 0 || days > 0) parts.push(`${hours}h`);
  if (minutes > 0 || hours > 0 || days > 0) parts.push(`${minutes}m`);
  parts.push(`${seconds}s`);
  return parts.join(" ");
};

export const customerColumns = [
  { key: "id", label: "ID", className: "font-mono text-blue-400" },
  { key: "name", label: "Name", className: "text-gray-200" },
  { key: "type", label: "Type" },
  { key: "area_town", label: "Area" },
  { key: "sub_area", label: "Sub Area" },
  {
    key: "status",
    label: "Status",
    render: (attr) => {
      const isUp = attr.alarmstate === 1 || attr.alarmstate === 3 || attr.alarmstate === 4;
      return isUp ? "🟢 UP" : "🔴 DOWN";
    },
  },
  { key: "olt", label: "OLT" },
  {
    key: "fsp",
    label: "FSP",
    render: (attr) => `${attr.frame ?? ""}/${attr.slot ?? ""}/${attr.port ?? ""}`,
  },
  { key: "ontid", label: "ONT#" },
  { key: "dc_id", label: "DC/ODB" },
  { key: "alarminfo", label: "Alarm Info" },
  { key: "fault_time", label: "Fault Time" },
  {
    key: "fault_duration",
    label: "Fault Duration",
    className:"text-rose-400 font-semibold",
    render: (attr) => calculateDuration(attr.fault_time),
  },
  { key: "service_tier", label: "Service Tier" },
  { key: "bandwidth", label: "Bandwidth" },
  { key: "activation_date", label: "Activation Date" },
];

export const analyticsColumns = {
 summaryByAlias: [
    { key: "alias", label: "Alias", className: "font-mono", description: "The unique customer identifier." },
    {key:"alarminfo", label:"Alarm Info", description:"Current Alarm Information"},
    { key: "total_occurrences", label: "Total Occurrences", description: "Total number of times this customer's connection dropped." },
    { key: "first_alarm", label: "First Alarm", description: "Date and time of the first recorded drop in the selected window." },
    { key: "last_alarm", label: "Last Alarm", description: "Date and time of the most recent drop." },
    {key:"total_whole_days", label:"Total Days", description:"Total number of whole days the customer was offline."},
    { key: "total_down_minutes", label: "Total Downtime (min)", description: "Total cumulative minutes the customer was offline." },
    { 
      key: "avg_down_minutes", 
      label: "Avg Downtime (min)",
      description: "Average duration of each individual outage event.",
      render: (attr) => attr.avg_down_minutes ? Number(attr.avg_down_minutes).toFixed(1) : "0"
    },
    { key: "max_single_outage", label: "Max Single Outage (min)", description: "The longest continuous period the customer remained disconnected." },
    { 
      key: "current_status", 
      label: "Active Status",
      className: "font-bold",
      description: "Indicates if the customer is currently offline right now.",
      render: (attr) => attr.currently_active_alarms > 0 ? `🔴 ${attr.currently_active_alarms} Active` : "🟢 Online"
    },
  ],
  alarmsByZone: [
    { key: "zone", label: "Zone", className: "font-mono font-semibold", description: "The physical operational zone." },
    { key: "region", label: "Region", description: "The parent region." },
    { key: "area", label: "Area", description: "The specific area town." },
    { 
      key: "affected_aliases", 
      label: "Customer List", 
      description: "Click to view detailed customer records for this zone.",
      render: (attr) => {
        const count = attr.affected_aliases?.length || 0;
        return `🔍 View ${count} Customers`;
      }
    },
  ]
};