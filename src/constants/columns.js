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
    { key: "total_occurrences", label: "Total Occurrences", description: "Total number of times this customer's connection dropped." },
    { key: "first_alarm", label: "First Alarm", description: "Date and time of the first recorded drop in the selected window." },
    { key: "last_alarm", label: "Last Alarm", description: "Date and time of the most recent drop." },
    { key: "total_down_minutes", label: "Total Downtime (min)", description: "Total cumulative minutes the customer was offline." },
    { 
      key: "avg_down_minutes", 
      label: "Avg Downtime (min)",
      description: "Average duration of each individual outage event.",
      render: (attr) => attr.avg_down_minutes ? Number(attr.avg_down_minutes).toFixed(1) : "0"
    },
    { key: "max_single_outage", label: "Max Single Outage (min)", description: "The longest continuous period the customer remained disconnected." },
    { key: "unique_olts_affected", label: "Affected OLTs", description: "Number of different OLTs involved. If > 1, suggests wider node/routing issues." },
    { 
      key: "currently_active_alarms", 
      label: "Active Status",
      className: "font-bold",
      description: "Indicates if the customer is currently offline right now.",
      render: (attr) => attr.currently_active_alarms > 0 ? `🔴 ${attr.currently_active_alarms} Active` : "🟢 Online"
    },
  ],
  summaryByPort: [
    { key: "alias", label: "Alias", className: "font-mono", description: "The customer or node alias." },
    { key: "fault_olt", label: "OLT", description: "The Optical Line Terminal device." },
    { key: "fault_frame", label: "Frame", description: "The hardware frame number." },
    { key: "fault_slot", label: "Slot", description: "The hardware slot number." },
    { key: "fault_port", label: "Port", description: "The specific hardware port." },
    { key: "occurrences", label: "Occurrences", description: "Total number of connection drops recorded on this specific hardware combination." },
    { key: "port_down_minutes", label: "Total Downtime (min)", description: "Cumulative downtime on this specific port." },
    { key: "max_port_outage_duration", label: "Max Outage (min)", description: "The longest continuous failure on this specific port." },
    { 
      key: "active_port_alarms", 
      label: "Active Port Alarms",
      className: "font-bold",
      description: "Indicates if this hardware port is actively failing right now.",
      render: (attr) => attr.active_port_alarms > 0 ? `🔴 ${attr.active_port_alarms}` : "🟢 0"
    },
  ],
  alarmsByDate: [
    { key: "alarm_date", label: "Date", className: "font-mono font-semibold", description: "The specific day the faults occurred." },
    { key: "total_alarms", label: "Total Alarms", description: "Total volume of network faults recorded on this date." },
    { key: "unique_customers_affected", label: "Unique Customers Affected", description: "Number of distinct customers who experienced an outage, showing the true spread of the issue." },
    { key: "total_downtime_minutes", label: "Total Downtime (min)", description: "Cumulative downtime for all affected customers combined on this date." },
    { 
      key: "unresolved_alarms", 
      label: "Unresolved Issues",
      className: "font-bold",
      description: "Number of faults from this date that have not yet been cleared/fixed.",
      render: (attr) => attr.unresolved_alarms > 0 ? `⚠️ ${attr.unresolved_alarms}` : "✅ Resolved"
    },
  ],
  detailedHistory: [
    { key: "alias", label: "Alias", className: "font-mono", description: "The customer or node alias." },
    { key: "fault_time", label: "Fault Time", description: "The time when the fault was detected." },
    { key: "fault_time_clear", label: "Clear Time", description: "The time when the fault was cleared." },
    { key: "outage_duration", label: "Duration (sec)", description: "The length of time the fault lasted." },
    { key: "alarminfo", label: "Alarm Info", description: "Detailed information about the alarm." },
  ],
  downtimeMetrics: [
    { key: "alias", label: "Alias", className: "font-mono", description: "The customer or node alias." },
    { key: "interruptions", label: "Interruptions", description: "The number of times the port was down." },
    { key: "total_down_minutes", label: "Total Downtime (min)", description: "The cumulative downtime for the port." },
    { key: "avg_down_minutes", label: "Avg Downtime (min)", description: "The average downtime for the port." },
  ],
};