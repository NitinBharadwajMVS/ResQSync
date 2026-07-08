import { useState } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { MultipleSymptomDropdown } from './MultipleSymptomDropdown';
import { Hospital } from '@/types/patient';
import { toast } from 'sonner';
import { Loader2, MapPin } from 'lucide-react';
import { useEffect, useRef } from 'react';

interface AddHospitalDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onAdd: (hospital: Hospital) => void;
}

const availableEquipment = [
  'Ventilator', 'ICU', 'CT Scan', 'MRI', 'X-Ray', 'Oxygen', 
  'Defibrillator', 'Cardiac Monitor', 'Cath Lab', 'Dialysis'
];

export const AddHospitalDialog = ({ open, onOpenChange, onAdd }: AddHospitalDialogProps) => {
  const [formData, setFormData] = useState({
    name: '',
    address: '',
    contact: '',
    distance: '',
    latitude: '',
    longitude: '',
    equipment: [] as string[],
  });

  const [suggestions, setSuggestions] = useState<any[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (wrapperRef.current && !wrapperRef.current.contains(event.target as Node)) {
        setShowSuggestions(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const fetchSuggestions = async (query: string) => {
    if (!query || query.length < 3) {
      setSuggestions([]);
      return;
    }
    
    const token = import.meta.env.VITE_MAPBOX_TOKEN;
    if (!token) return;

    setIsSearching(true);
    try {
      const res = await fetch(
        `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(query)}.json?access_token=${token}&types=poi,address&limit=5`
      );
      const data = await res.json();
      setSuggestions(data.features || []);
      setShowSuggestions(true);
    } catch (error) {
      console.error("Geocoding error:", error);
    } finally {
      setIsSearching(false);
    }
  };

  const handleSelectSuggestion = (feature: any) => {
    setFormData({
      ...formData,
      address: feature.place_name,
      name: feature.text || formData.name, // Auto-fill name if it's a POI
      latitude: feature.center[1].toString(),
      longitude: feature.center[0].toString()
    });
    setShowSuggestions(false);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!formData.name || !formData.address || !formData.contact) {
      toast.error('Please fill in all required fields');
      return;
    }

    const newHospital: Hospital = {
      id: `custom-${Date.now()}`,
      name: formData.name,
      address: formData.address,
      contact: formData.contact,
      distance: parseFloat(formData.distance) || 0,
      latitude: parseFloat(formData.latitude) || 12.9716,
      longitude: parseFloat(formData.longitude) || 77.5946,
      equipment: formData.equipment,
      specialties: [],
    };

    onAdd(newHospital);
    toast.success(`${formData.name} added successfully`);
    
    // Reset form
    setFormData({
      name: '',
      address: '',
      contact: '',
      distance: '',
      latitude: '',
      longitude: '',
      equipment: [],
    });
    
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Add New Hospital</DialogTitle>
          <DialogDescription>
            Add a new hospital to the database for this demo session.
          </DialogDescription>
        </DialogHeader>
        
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <Label htmlFor="name">Hospital Name *</Label>
            <Input
              id="name"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              placeholder="e.g., City Medical Center"
              required
            />
          </div>

          <div ref={wrapperRef} className="relative z-50">
            <Label htmlFor="address">Address / Locality *</Label>
            <div className="relative">
              <Input
                id="address"
                value={formData.address}
                onChange={(e) => {
                  setFormData({ ...formData, address: e.target.value });
                  fetchSuggestions(e.target.value);
                }}
                onFocus={() => {
                  if (suggestions.length > 0) setShowSuggestions(true);
                }}
                placeholder="e.g., Koramangala, Bangalore"
                required
                autoComplete="off"
              />
              {isSearching && (
                <Loader2 className="absolute right-3 top-1/2 transform -translate-y-1/2 w-4 h-4 animate-spin text-muted-foreground" />
              )}
            </div>

            {showSuggestions && suggestions.length > 0 && (
              <div className="absolute top-full left-0 right-0 mt-1 bg-background border rounded-md shadow-lg overflow-hidden z-50 max-h-60 overflow-y-auto">
                {suggestions.map((feature, index) => (
                  <button
                    key={index}
                    type="button"
                    className="w-full text-left px-4 py-3 hover:bg-muted focus:bg-muted border-b last:border-b-0 flex items-start gap-2"
                    onClick={() => handleSelectSuggestion(feature)}
                  >
                    <MapPin className="w-4 h-4 mt-0.5 text-muted-foreground flex-shrink-0" />
                    <div>
                      <div className="text-sm font-medium">{feature.text}</div>
                      <div className="text-xs text-muted-foreground">{feature.place_name}</div>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>

          <div>
            <Label htmlFor="contact">Contact Number *</Label>
            <Input
              id="contact"
              value={formData.contact}
              onChange={(e) => setFormData({ ...formData, contact: e.target.value })}
              placeholder="e.g., +91-80-1234-5678"
              required
            />
          </div>

          <div>
            <Label htmlFor="distance">Distance (km) - Optional</Label>
            <Input
              id="distance"
              type="number"
              step="0.1"
              value={formData.distance}
              onChange={(e) => setFormData({ ...formData, distance: e.target.value })}
              placeholder="e.g., 5.2"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label htmlFor="latitude">Latitude</Label>
              <Input
                id="latitude"
                type="number"
                step="0.0001"
                value={formData.latitude}
                onChange={(e) => setFormData({ ...formData, latitude: e.target.value })}
                placeholder="e.g., 12.9716"
              />
            </div>
            <div>
              <Label htmlFor="longitude">Longitude</Label>
              <Input
                id="longitude"
                type="number"
                step="0.0001"
                value={formData.longitude}
                onChange={(e) => setFormData({ ...formData, longitude: e.target.value })}
                placeholder="e.g., 77.5946"
              />
            </div>
          </div>

          <div>
            <Label>Available Equipment</Label>
            <MultipleSymptomDropdown
              options={availableEquipment}
              values={formData.equipment}
              onChange={(equipment) => setFormData({ ...formData, equipment })}
              placeholder="Select available equipment..."
            />
          </div>

          <div className="flex gap-3 pt-4">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} className="flex-1">
              Cancel
            </Button>
            <Button type="submit" className="flex-1">
              Add Hospital
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
};
