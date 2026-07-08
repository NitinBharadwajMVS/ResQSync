import { Hospital } from '@/types/patient';
import { Building2, Phone, Navigation, Clock, CheckCircle, MapPin } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import { getLocality } from '@/utils/distanceCalculator';

interface HospitalRowProps {
  hospital: Hospital;
  isSelected: boolean;
  onSelect: (hospital: Hospital) => void;
  isRecommended?: boolean;
}

export const HospitalRow = ({ hospital, isSelected, onSelect, isRecommended }: HospitalRowProps) => {
  const distance = hospital.distance || 0;
  const eta = hospital.eta || 0;
  const locality = getLocality(hospital.address);

  const handleClick = () => {
    try {
      onSelect(hospital);
    } catch (error) {
      console.error('Error selecting hospital:', error);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      handleClick();
    }
  };

  return (
    <Card
      role="button"
      tabIndex={0}
      onClick={handleClick}
      onKeyDown={handleKeyDown}
      className={cn(
        "p-5 transition-all border shadow-sm cursor-pointer min-h-[110px] w-full",
        isSelected && "ring-2 ring-primary bg-primary/5 border-primary shadow-lg",
        !isSelected && "hover:border-primary/50 hover:shadow-md",
        isRecommended && "border-green-500/50 bg-green-50/30"
      )}
    >
      <div className="flex items-center gap-5">
        {/* Larger icon */}
        <div className={cn("w-16 h-16 rounded-lg flex items-center justify-center flex-shrink-0", isRecommended ? "bg-green-100" : "bg-primary/10")}>
          <Building2 className={cn("w-8 h-8", isRecommended ? "text-green-600" : "text-primary")} />
        </div>

        {/* Hospital info */}
        <div className="flex-1 min-w-0 space-y-2">
          <div className="flex items-start justify-between gap-3">
            <h3 className="font-semibold text-lg leading-tight line-clamp-2 break-words">
              {hospital.name}
              {isRecommended && (
                <Badge variant="default" className="ml-2 bg-green-600 hover:bg-green-700 text-xs">
                  Recommended Match
                </Badge>
              )}
              {hospital.isExternal && (
                <Badge variant="secondary" className="ml-2 text-xs bg-blue-100 text-blue-700 hover:bg-blue-200">
                  <MapPin className="w-3 h-3 mr-1" />
                  Mapbox Result
                </Badge>
              )}
            </h3>
            {isSelected && (
              <CheckCircle className="w-6 h-6 text-primary flex-shrink-0" />
            )}
          </div>
          
          <p className="text-sm text-muted-foreground line-clamp-1 break-words">
            {locality}
          </p>

          {hospital.contact && (
            <div className="flex items-center gap-2 text-sm">
              <Phone className="w-4 h-4 text-muted-foreground flex-shrink-0" />
              <a 
                href={`tel:${hospital.contact}`} 
                className="hover:text-primary truncate font-medium"
                onClick={(e) => e.stopPropagation()}
              >
                {hospital.contact}
              </a>
            </div>
          )}

          <div className="flex gap-2 flex-wrap mt-2">
            <Badge variant="outline" className="flex items-center gap-1.5 px-2.5 py-1">
              <Navigation className="w-3.5 h-3.5" />
              <span className="font-medium">{distance > 0 ? distance.toFixed(2) : '—'} km</span>
            </Badge>
            <Badge variant="outline" className="flex items-center gap-1.5 px-2.5 py-1">
              <Clock className="w-3.5 h-3.5" />
              <span className="font-medium">{eta > 0 ? `${eta} min` : '—'}</span>
            </Badge>
          </div>
        </div>

        {/* Select button */}
        <Button
          size="lg"
          variant={isSelected ? "default" : "outline"}
          className="min-h-[48px] min-w-[100px] touch-manipulation flex-shrink-0"
          onClick={(e) => {
            e.stopPropagation();
            handleClick();
          }}
        >
          {isSelected ? 'Selected' : 'Select'}
        </Button>
      </div>
    </Card>
  );
};
