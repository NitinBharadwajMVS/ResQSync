import { useEffect, useState } from 'react';
import { Activity, Heart } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useApp } from '@/contexts/AppContext';
import { useLiveVitals } from '@/hooks/useLiveVitals';

interface LiveVitalsProps {
  onVitalsUpdate?: (spo2: number, heartRate: number) => void;
}

export const LiveVitalsDisplay = ({ onVitalsUpdate }: LiveVitalsProps) => {
  const { currentAmbulanceId } = useApp();
  const { spo2, heartRate, lastUpdate } = useLiveVitals(currentAmbulanceId);
  const [, setTick] = useState(0);

  // Update the "X seconds ago" display every second
  useEffect(() => {
    const interval = setInterval(() => {
      setTick(t => t + 1);
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  // Fire onVitalsUpdate callback when values change
  useEffect(() => {
    if (onVitalsUpdate) {
      onVitalsUpdate(spo2, heartRate);
    }
  }, [spo2, heartRate, onVitalsUpdate]);

  return (
    <div className="glass-effect p-6 rounded-xl border border-ambulance-border interactive-card group">
      <div className="flex items-center gap-2 mb-4 text-ambulance-text">
        <Activity className="w-5 h-5 text-primary animate-pulse" />
        <span className="font-semibold">Live Sensor Data</span>
        {lastUpdate && (
          <span className="text-xs text-muted-foreground ml-2">
            Updated {Math.floor((Date.now() - lastUpdate.getTime()) / 1000)}s ago
          </span>
        )}
        <div className="ml-auto flex gap-1">
          <div className="w-2 h-2 rounded-full animate-pulse bg-stable" />
          <div className="w-2 h-2 rounded-full animate-pulse [animation-delay:0.2s] bg-stable" />
          <div className="w-2 h-2 rounded-full animate-pulse [animation-delay:0.4s] bg-stable" />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-6">
        <div className="text-center p-4 rounded-lg bg-ambulance-bg/30 transition-all duration-300 hover:bg-ambulance-bg/50">
          <div className="text-sm text-muted-foreground mb-2">SpO₂</div>
          <div className={cn(
            "text-5xl font-bold transition-all duration-500 animate-pulse-glow",
            "group-hover:scale-110",
            spo2 < 94 ? "text-critical" : "text-stable"
          )}>
            {spo2}%
          </div>
          <div className="mt-2 h-1 bg-ambulance-border rounded-full overflow-hidden">
            <div 
              className={cn(
                "h-full transition-all duration-500",
                spo2 < 94 ? "bg-critical" : "bg-stable"
              )}
              style={{ width: `${spo2}%` }}
            />
          </div>
        </div>
        <div className="text-center p-4 rounded-lg bg-ambulance-bg/30 transition-all duration-300 hover:bg-ambulance-bg/50">
          <div className="text-sm text-muted-foreground mb-2 flex items-center justify-center gap-1">
            <Heart className="w-4 h-4 animate-pulse" />
            Heart Rate
          </div>
          <div className={cn(
            "text-5xl font-bold transition-all duration-500 animate-pulse-glow",
            "group-hover:scale-110",
            heartRate > 100 ? "text-urgent" : "text-stable"
          )}>
            {heartRate}
          </div>
          <div className="mt-2 h-1 bg-ambulance-border rounded-full overflow-hidden">
            <div 
              className={cn(
                "h-full transition-all duration-500",
                heartRate > 100 ? "bg-urgent" : "bg-stable"
              )}
              style={{ width: `${Math.min(heartRate / 2, 100)}%` }}
            />
          </div>
        </div>
      </div>
    </div>
  );
};