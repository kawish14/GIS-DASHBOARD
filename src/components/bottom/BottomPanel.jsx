import React, { useEffect, useState } from "react";
import {
  CalciteCard,
  CalciteChip,
  CalciteIcon,
  CalciteFlow,
} from "@esri/calcite-components-react";

// Mock Data Generator
const getRandom = (min, max) => Math.floor(Math.random() * (max - min) + min);

export default function BottomPanel({ isLoading }) {
  const [stats, setStats] = useState({
    activeUsers: 1240,
    throughput: 850,
    alerts: 3,
    chartData: [40, 60, 45, 70, 80, 55, 90], // Mock history for chart
  });

  // Simulate Real-time updates
  useEffect(() => {
    const interval = setInterval(() => {
      setStats((prev) => ({
        activeUsers: prev.activeUsers + getRandom(-5, 10),
        throughput: prev.throughput + getRandom(-10, 20),
        alerts: getRandom(0, 5),
        chartData: [...prev.chartData.slice(1), getRandom(30, 95)], // Shift chart
      }));
    }, 2000);
    return () => clearInterval(interval);
  }, []);

  if (isLoading) return null;

  return (
    <div className="absolute bottom-6 left-6 right-16 z-10 pointer-events-none">
      <div className="flex flex-row gap-4 items-end pointer-events-auto overflow-x-auto pb-2">
        
        {/* KPI Card 1: Users */}
        <CalciteCard className="w-64 shadow-lg">
          <div slot="title">Active ONT Devices</div>
          <div slot="subtitle">Real-time Network Status</div>
          <div className="p-4 flex items-center justify-between">
            <span className="text-4xl font-bold text-blue-500">
              {stats.activeUsers.toLocaleString()}
            </span>
            <CalciteIcon icon="users" scale="l" className="text-gray-400" />
          </div>
          <div slot="footer-start">
             <CalciteChip value="online" icon="check-circle" color="green">98% Online</CalciteChip>
          </div>
        </CalciteCard>

        {/* KPI Card 2: Throughput */}
        <CalciteCard className="w-64 shadow-lg">
          <div slot="title">Traffic Throughput</div>
          <div slot="subtitle">Mbps (Downstream)</div>
          <div className="p-4 flex items-center justify-between">
            <span className="text-4xl font-bold text-emerald-400">
              {stats.throughput}
            </span>
            <CalciteIcon icon="graph-bar-up" scale="l" className="text-gray-400" />
          </div>
           <div slot="footer-start">
             <CalciteChip value="stable" color="blue">Stable</CalciteChip>
          </div>
        </CalciteCard>

        {/* Chart Card */}
        <CalciteCard className="w-80 shadow-lg hidden md:block">
           <div slot="title">Live Traffic Trend</div>
           <div className="p-4 h-24 flex items-end gap-2 justify-between">
              {/* Custom CSS Bar Chart */}
              {stats.chartData.map((val, idx) => (
                <div 
                  key={idx}
                  className="w-full bg-blue-500/50 hover:bg-blue-400 transition-all duration-500 rounded-t"
                  style={{ height: `${val}%` }}
                ></div>
              ))}
           </div>
        </CalciteCard>

      </div>
    </div>
  );
}