import { useState } from "react";
import {
  Download,
  FileSpreadsheet,
  FileText,
  Settings,
  Calendar,
  Filter,
  ChevronDown
} from "lucide-react";

export default function ExportSection({ onExport, className = "" }) {
  const [showOptions, setShowOptions] = useState(false);
  const [exportOptions, setExportOptions] = useState({
    dateRange: "Last 24 Hours",
    includeCharts: true,
    includeMap: true,
    includeMetrics: true
  });

  const dateRanges = [
    "Last 24 Hours",
    "Last 7 Days",
    "Last 30 Days",
    "Custom Range"
  ];

  const handleExport = (format) => {
    onExport(format, exportOptions);
  };

  return (
    <div className={`glass-card p-4 ${className}`}>
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-semibold text-[var(--text-primary)] flex items-center gap-2">
          <Download className="w-4 h-4 text-[var(--accent-amber)]" />
          Export Data
        </h3>

        <button
          onClick={() => setShowOptions(!showOptions)}
          className="p-1.5 hover:bg-white/10 rounded-lg transition-colors"
          title="Export Options"
        >
          <Settings
            className={`w-4 h-4 text-[var(--text-secondary)] transition-transform ${
              showOptions ? "rotate-90" : ""
            }`}
          />
        </button>
      </div>

      {/* Export Options */}
      {showOptions && (
        <div className="mb-4 p-3 bg-white/5 rounded-lg space-y-3">
          {/* Date Range */}
          <div>
            <label className="text-xs text-[var(--text-muted)] mb-1.5 flex items-center gap-1">
              <Calendar className="w-3 h-3" />
              Date Range
            </label>

            <div className="relative">
              <select
                value={exportOptions.dateRange}
                onChange={(e) =>
                  setExportOptions((prev) => ({
                    ...prev,
                    dateRange: e.target.value
                  }))
                }
                className="w-full bg-[var(--bg-tertiary)] border border-[var(--glass-border)] rounded-lg px-3 py-2 text-sm text-[var(--text-primary)] appearance-none cursor-pointer focus:outline-none focus:ring-1 focus:ring-[var(--accent-amber)]"
              >
                {dateRanges.map((range) => (
                  <option key={range} value={range}>
                    {range}
                  </option>
                ))}
              </select>

              <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--text-muted)] pointer-events-none" />
            </div>
          </div>

          {/* Include Options */}
          <div>
            <label className="text-xs text-[var(--text-muted)] mb-1.5 flex items-center gap-1">
              <Filter className="w-3 h-3" />
              Include in Export
            </label>

            <div className="space-y-2">
              {[
                { key: "includeMetrics", label: "Metrics & Statistics" },
                { key: "includeCharts", label: "Charts & Graphs" },
                { key: "includeMap", label: "Map Data" }
              ].map((option) => (
                <label
                  key={option.key}
                  className="flex items-center gap-2 cursor-pointer"
                >
                  <input
                    type="checkbox"
                    checked={exportOptions[option.key]}
                    onChange={(e) =>
                      setExportOptions((prev) => ({
                        ...prev,
                        [option.key]: e.target.checked
                      }))
                    }
                    className="w-4 h-4 rounded border-[var(--glass-border)] bg-[var(--bg-tertiary)] text-[var(--accent-amber)] focus:ring-[var(--accent-amber)] focus:ring-offset-0"
                  />
                  <span className="text-xs text-[var(--text-secondary)]">
                    {option.label}
                  </span>
                </label>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Export Buttons */}
      <div className="flex flex-col sm:flex-row gap-2">
        <button
          onClick={() => handleExport("csv")}
          className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 bg-emerald-500/20 hover:bg-emerald-500/30 border border-emerald-500/30 rounded-lg text-emerald-400 text-sm font-medium transition-colors"
        >
          <FileSpreadsheet className="w-4 h-4" />
          Export CSV
        </button>

        <button
          onClick={() => handleExport("pdf")}
          className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 bg-red-500/20 hover:bg-red-500/30 border border-red-500/30 rounded-lg text-red-400 text-sm font-medium transition-colors"
        >
          <FileText className="w-4 h-4" />
          Export PDF
        </button>
      </div>

      {/* Full Report */}
      <button
        onClick={() => {
          setExportOptions({
            dateRange: "Last 24 Hours",
            includeCharts: true,
            includeMap: true,
            includeMetrics: true
          });
          handleExport("pdf");
        }}
        className="w-full mt-3 flex items-center justify-center gap-2 px-4 py-2.5 bg-gradient-to-r from-amber-500 to-orange-600 rounded-lg text-white text-sm font-medium hover:from-amber-600 hover:to-orange-700 transition-colors shadow-lg shadow-amber-500/20"
      >
        <Download className="w-4 h-4" />
        Generate Full Report
      </button>
    </div>
  );
}
