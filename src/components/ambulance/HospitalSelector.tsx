import { useState, useMemo, useEffect } from 'react';
import { Hospital, Vitals } from '@/types/patient';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Building2, Navigation, Clock, Search, Plus, MapPin, Loader2, RefreshCw, Sparkles } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { calculateDistance, calculateETA, sortHospitalsByDistance, fetchMapboxETAs, fetchNearbyMapboxHospitals } from '@/utils/distanceCalculator';
import { AddHospitalDialog } from './AddHospitalDialog';
import { HospitalRow } from './HospitalRow';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import { useApp } from '@/contexts/AppContext';

interface HospitalSelectorProps {
  hospitals: Hospital[];
  selectedHospitalId?: string;
  onSelect: (hospital: Hospital) => void;
  alertId?: string;
  readOnly?: boolean;
  onAddHospital?: (hospital: Hospital) => void;
  patientDataForAI?: {
    vitals: Vitals;
    triageLevel: string;
    complaint: string;
    requiredEquipment?: string[];
  };
}

type GeolocationStatus = 'idle' | 'requesting' | 'granted' | 'denied' | 'error';

const FALLBACK_LOCATION = {
  latitude: 12.9279,
  longitude: 77.6271,
  name: 'Bannerghatta Road, Bangalore (Fallback)'
};

export const HospitalSelector = ({
  hospitals,
  selectedHospitalId,
  onSelect,
  alertId,
  readOnly = false,
  onAddHospital,
  patientDataForAI,
}: HospitalSelectorProps) => {
  const [isOpen, setIsOpen] = useState(false);
  const [selectedForConfirm, setSelectedForConfirm] = useState<Hospital | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [geolocationStatus, setGeolocationStatus] = useState<GeolocationStatus>('idle');
  const { addHospital } = useApp();
  const [ambulanceLocation, setAmbulanceLocation] = useState<{ latitude: number; longitude: number } | null>(null);
  const [usingFallback, setUsingFallback] = useState(false);
  const [etaMethod, setEtaMethod] = useState<'routing' | 'fallback'>('fallback');
  const [hospitalsWithDistances, setHospitalsWithDistances] = useState<Hospital[]>(hospitals);
  const [isFetchingETAs, setIsFetchingETAs] = useState(false);

  // Recalculate hospital distances and ETAs based on ambulance location
  useEffect(() => {
    if (!ambulanceLocation) {
      setHospitalsWithDistances(hospitals);
      return;
    }
    
    // First pass: Instant Haversine calculations
    const haversineHospitals = hospitals.map(hospital => {
      const distance = calculateDistance(
        ambulanceLocation.latitude,
        ambulanceLocation.longitude,
        hospital.latitude,
        hospital.longitude
      );
      const eta = calculateETA(distance);
      return {
        ...hospital,
        distance: isNaN(distance) ? 0 : distance,
        eta: isNaN(eta) ? 0 : eta
      };
    });
    
    setHospitalsWithDistances(haversineHospitals);
    setEtaMethod('fallback');

    // Second pass: Accurate Mapbox Matrix API ETAs
    const getAccurateETAs = async () => {
      if (!import.meta.env.VITE_MAPBOX_TOKEN) return;
      
      setIsFetchingETAs(true);
      try {
        // Fetch Mapbox ETAs for Supabase hospitals AND Mapbox POIs in parallel
        const [accurateHospitals, mapboxHospitals] = await Promise.all([
          fetchMapboxETAs(ambulanceLocation, haversineHospitals),
          fetchNearbyMapboxHospitals(ambulanceLocation.latitude, ambulanceLocation.longitude)
        ]);

        // Merge Mapbox POIs into the list, avoiding duplicates (by name proximity)
        const combinedHospitals = [...accurateHospitals];
        mapboxHospitals.forEach(mapboxHospital => {
          // Basic deduplication: if there's already a hospital with a very similar name or very close coordinates, skip it
          const isDuplicate = combinedHospitals.some(h => 
            h.name.toLowerCase().includes(mapboxHospital.name.toLowerCase()) || 
            mapboxHospital.name.toLowerCase().includes(h.name.toLowerCase()) ||
            (Math.abs(h.latitude - mapboxHospital.latitude) < 0.005 && Math.abs(h.longitude - mapboxHospital.longitude) < 0.005)
          );
          
          if (!isDuplicate) {
            combinedHospitals.push(mapboxHospital);
          }
        });

        setHospitalsWithDistances(combinedHospitals);
        setEtaMethod('routing');
      } catch (err) {
        console.error("Failed to get Mapbox ETAs", err);
      } finally {
        setIsFetchingETAs(false);
      }
    };

    getAccurateETAs();
  }, [ambulanceLocation, hospitals]);

  const sortedHospitals = useMemo(() => {
    const baseSorted = sortHospitalsByDistance(hospitalsWithDistances, alertId);
    
    if (patientDataForAI?.requiredEquipment && patientDataForAI.requiredEquipment.length > 0) {
      return baseSorted.sort((a, b) => {
        // Normalize equipment arrays for comparison
        const aEquip = (a.equipment || []).map(e => e.toLowerCase());
        const bEquip = (b.equipment || []).map(e => e.toLowerCase());
        const reqEquip = patientDataForAI.requiredEquipment!.map(e => e.toLowerCase());

        const aMatchCount = reqEquip.filter(eq => aEquip.includes(eq)).length;
        const bMatchCount = reqEquip.filter(eq => bEquip.includes(eq)).length;
        
        if (aMatchCount !== bMatchCount) {
          return bMatchCount - aMatchCount; // Higher match count first
        }
        // If match count is the same, maintain distance sorting
        return (a.distance || 0) - (b.distance || 0);
      });
    }
    
    return baseSorted;
  }, [hospitalsWithDistances, alertId, patientDataForAI]);
  const selectedHospital = hospitals.find((h) => h.id === selectedHospitalId);

  // Filter hospitals based on search query
  const filteredHospitals = useMemo(() => {
    if (!searchQuery.trim()) return sortedHospitals;
    
    const query = searchQuery.toLowerCase();
    return sortedHospitals.filter((hospital) => {
      return (
        hospital.name.toLowerCase().includes(query) ||
        hospital.address.toLowerCase().includes(query) ||
        hospital.contact?.toLowerCase().includes(query) ||
        hospital.equipment?.some((eq) => eq.toLowerCase().includes(query))
      );
    });
  }, [sortedHospitals, searchQuery]);

  const requestGeolocation = () => {
    if (!navigator.geolocation) {
      toast.error('Geolocation not supported by browser');
      setGeolocationStatus('error');
      setAmbulanceLocation(FALLBACK_LOCATION);
      setUsingFallback(true);
      return;
    }

    setGeolocationStatus('requesting');
    
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const location = {
          latitude: position.coords.latitude,
          longitude: position.coords.longitude
        };
        setAmbulanceLocation(location);
        setGeolocationStatus('granted');
        setUsingFallback(false);
        toast.success(`Location obtained: ${location.latitude.toFixed(4)}, ${location.longitude.toFixed(4)}`);
      },
      (error) => {
        console.error('Geolocation error:', error);
        setGeolocationStatus('denied');
        setAmbulanceLocation(FALLBACK_LOCATION);
        setUsingFallback(true);
        toast.warning(`Location permission denied. Using fallback: ${FALLBACK_LOCATION.name}`);
      },
      {
        enableHighAccuracy: true,
        timeout: 10000,
        maximumAge: 0
      }
    );
  };

  const handleSelect = async (hospital: Hospital) => {
    if (hospital.isExternal) {
      toast.info(`Registering ${hospital.name} into database...`);
      try {
        await addHospital({
          ...hospital,
          isExternal: false // Clear the flag since it's now in the database
        });
      } catch (err) {
        toast.error(`Failed to register ${hospital.name}. Please try again.`);
        return;
      }
    }
    
    onSelect(hospital);
    setIsOpen(false);
    setSelectedForConfirm(null);
    toast.success(`✅ Selected: ${hospital.name}`);
  };

  return (
    <>
      <AddHospitalDialog 
        open={showAddDialog} 
        onOpenChange={setShowAddDialog}
        onAdd={(hospital) => {
          onAddHospital?.(hospital);
          setShowAddDialog(false);
        }}
      />
      
      <div className="space-y-2">
        <Label className="text-base font-semibold">Hospital Selection</Label>
        <div className="flex gap-2">
          <Dialog open={isOpen} onOpenChange={setIsOpen}>
            <DialogTrigger asChild>
              <Button 
                variant="outline" 
                className="w-full justify-start h-auto py-3"
                disabled={readOnly}
              >
                <div className="flex items-center w-full">
                  <Building2 className="w-5 h-5 mr-2 flex-shrink-0" />
                  <div className="flex-1 text-left">
                    {selectedHospital ? (
                      <div>
                        <div className="font-semibold">{selectedHospital.name}</div>
                        <div className="text-xs text-muted-foreground mt-0.5">
                          {selectedHospital.distance?.toFixed(1) || '—'} km • ETA: {selectedHospital.eta || calculateETA(selectedHospital.distance || 0)} min
                        </div>
                      </div>
                    ) : (
                      <span className="text-muted-foreground">Select a hospital</span>
                    )}
                  </div>
                </div>
              </Button>
            </DialogTrigger>
            <DialogContent className="hospital-panel max-w-4xl h-[90vh] flex flex-col p-0 z-[100]">
              <DialogHeader className="px-6 py-4 border-b flex flex-row items-center justify-between space-y-0">
                <div className="flex-1">
                  <DialogTitle className="text-xl">Select Hospital</DialogTitle>
                  <DialogDescription className="text-xs mt-1">
                    Sorted by distance • {filteredHospitals.length} hospitals
                  </DialogDescription>
                </div>
                
                {/* Compact location control */}
                <div className="flex items-center gap-2">
                  {ambulanceLocation ? (
                    <>
                      <MapPin className={cn("w-4 h-4", usingFallback ? "text-amber-500" : "text-primary")} />
                      <Button
                        size="icon"
                        variant="ghost"
                        onClick={requestGeolocation}
                        disabled={geolocationStatus === 'requesting'}
                        className="h-8 w-8"
                        title="Refresh location"
                      >
                        <RefreshCw className={cn("w-4 h-4", geolocationStatus === 'requesting' && "animate-spin")} />
                      </Button>
                    </>
                  ) : (
                    <Button
                      onClick={requestGeolocation}
                      variant="default"
                      size="sm"
                      disabled={geolocationStatus === 'requesting'}
                    >
                      <MapPin className="w-4 h-4 mr-2" />
                      {geolocationStatus === 'requesting' ? 'Getting...' : 'Get Location'}
                    </Button>
                  )}
                </div>
              </DialogHeader>

              {/* Compact controls row */}
              <div className="px-6 py-3 border-b flex gap-2">
                <div className="relative flex-1">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground w-4 h-4" />
                  <Input
                    placeholder="Search hospitals..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="pl-10"
                  />
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setShowAddDialog(true)}
                  className="flex items-center gap-2 whitespace-nowrap"
                >
                  <Plus className="w-4 h-4" />
                  Add
                </Button>
              </div>

              {/* Dev log - compact */}
              {ambulanceLocation && (
                <div className="px-6 py-2 bg-muted/30 text-[10px] font-mono text-muted-foreground border-b flex justify-between items-center">
                  <div>
                    Location: {ambulanceLocation.latitude.toFixed(4)}, {ambulanceLocation.longitude.toFixed(4)}
                    {usingFallback && <span className="ml-2 text-amber-600">(Fallback)</span>}
                    <span className="ml-3">• ETA: {etaMethod === 'routing' ? 'Mapbox Traffic Routing' : 'Haversine (40 km/h)'}</span>
                  </div>
                  {isFetchingETAs && (
                    <span className="flex items-center gap-1 text-primary animate-pulse">
                      <Loader2 className="w-3 h-3 animate-spin" />
                      Fetching live traffic...
                    </span>
                  )}
                </div>
              )}

              <ScrollArea className="flex-1 px-6 hospital-list-scroll-expanded">
                <div className="flex flex-col gap-4 py-4">
                  {!ambulanceLocation && (
                    <div className="text-center py-12 text-muted-foreground">
                      <MapPin className="w-12 h-12 mx-auto mb-3 opacity-50" />
                      <p>Please enable location to view nearby hospitals</p>
                    </div>
                  )}
                  {ambulanceLocation && filteredHospitals.length === 0 && (
                    <div className="text-center py-8 text-muted-foreground">
                      No hospitals found matching your search.
                    </div>
                  )}
                  {ambulanceLocation && filteredHospitals.map((hospital, index) => {
                    const hasRequiredEquip = patientDataForAI?.requiredEquipment && patientDataForAI.requiredEquipment.length > 0;
                    // Tag the first hospital as recommended if there are required equipments, since it's already sorted by best match
                    const isRecommended = index === 0 && !!hasRequiredEquip;

                    return (
                      <HospitalRow
                        key={hospital.id}
                        hospital={hospital}
                        isSelected={hospital.id === selectedHospitalId}
                        onSelect={handleSelect}
                        isRecommended={isRecommended}
                      />
                    );
                  })}
                </div>
              </ScrollArea>

              <div className="p-6 pt-4 border-t flex justify-end">
                <Button variant="outline" onClick={() => setIsOpen(false)} className="min-h-[44px]">
                  Close
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>
        {selectedHospital && (
          <Card className="p-4 border-primary/30">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0">
                  <Building2 className="w-6 h-6 text-primary" />
                </div>
                <div>
                  <h4 className="font-semibold">{selectedHospital.name}</h4>
                  <div className="text-sm text-muted-foreground flex gap-3 mt-1">
                    <span className="flex items-center gap-1">
                      <Navigation className="w-3 h-3" />
                      {selectedHospital.distance?.toFixed(1) || '—'} km
                    </span>
                    <span className="flex items-center gap-1">
                      <Clock className="w-3 h-3" />
                      {selectedHospital.eta || calculateETA(selectedHospital.distance || 0)} min
                    </span>
                  </div>
                </div>
              </div>
              {!readOnly && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setIsOpen(true)}
                >
                  Change
                </Button>
              )}
            </div>
          </Card>
        )}
      </div>
    </>
  );
};
