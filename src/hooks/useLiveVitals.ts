import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';

export interface VitalsData {
  spo2: number;
  heartRate: number;
  lastUpdate: Date | null;
}

export const useLiveVitals = (ambulanceId: string | null) => {
  const [vitals, setVitals] = useState<VitalsData>({
    spo2: 98,
    heartRate: 72,
    lastUpdate: null,
  });

  useEffect(() => {
    if (!ambulanceId) return;

    // Initial fetch
    const fetchVitals = async () => {
      const { data, error } = await supabase
        .from('live_vitals')
        .select('*')
        .eq('ambulance_id', ambulanceId)
        .maybeSingle();

      if (!error && data) {
        setVitals({
          spo2: data.spo2_pct || 98,
          heartRate: data.hr_bpm || 72,
          lastUpdate: new Date(data.updated_at)
        });
      }
    };

    fetchVitals();

    // Subscribe to real-time updates
    const channel = supabase
      .channel(`live-vitals-${ambulanceId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'live_vitals',
          filter: `ambulance_id=eq.${ambulanceId}`
        },
        (payload) => {
          if (payload.new && typeof payload.new === 'object') {
            const data = payload.new as any;
            setVitals({
              spo2: data.spo2_pct || 98,
              heartRate: data.hr_bpm || 72,
              lastUpdate: new Date(data.updated_at)
            });
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [ambulanceId]);

  return vitals;
};
