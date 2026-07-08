import { Hospital } from '@/types/patient';

// Haversine formula to calculate distance between two coordinates
export const calculateDistance = (
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number => {
  const R = 6371; // Earth's radius in km
  const dLat = (lat2 - lat1) * (Math.PI / 180);
  const dLon = (lon2 - lon1) * (Math.PI / 180);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * (Math.PI / 180)) *
      Math.cos(lat2 * (Math.PI / 180)) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  const distance = R * c;
  return Math.round(distance * 10) / 10; // Round to 1 decimal
};

// Mock ETA calculation based on distance
export const calculateETA = (distance: number): number => {
  if (!distance || isNaN(distance)) return 0;
  // Assume average speed of 40 km/h in Bangalore traffic
  const hours = distance / 40;
  const minutes = Math.ceil(hours * 60);
  return Math.max(3, minutes); // Minimum 3 minutes
};

// Sort hospitals by distance only
export const sortHospitalsByDistance = (
  hospitals: Hospital[],
  alertId?: string
): Hospital[] => {
  return [...hospitals]
    .filter((h) => !h.unavailableForAlert || h.unavailableForAlert !== alertId)
    .filter((h) => h.distance != null && !isNaN(h.distance))
    .sort((a, b) => a.distance - b.distance);
};

// Extract locality from full address (first part before comma)
export const getLocality = (address: string): string => {
  const parts = address.split(',');
  return parts[0]?.trim() || address;
};

// Fetch real-world ETAs and distances from Mapbox Matrix API
export const fetchMapboxETAs = async (
  ambulanceLocation: { latitude: number; longitude: number },
  hospitals: Hospital[]
): Promise<Hospital[]> => {
  const token = import.meta.env.VITE_MAPBOX_TOKEN;
  if (!token) {
    console.warn("Mapbox token missing, falling back to Haversine calculations.");
    return hospitals;
  }

  // Mapbox Matrix API allows up to 25 coordinates per request. 
  // 1 ambulance + 24 nearest hospitals = 25 coordinates max.
  const topHospitals = hospitals.slice(0, 24);
  if (topHospitals.length === 0) return hospitals;

  // Format: longitude,latitude
  const ambulanceCoord = `${ambulanceLocation.longitude},${ambulanceLocation.latitude}`;
  const hospitalCoords = topHospitals.map(h => `${h.longitude},${h.latitude}`).join(';');
  const coordinates = `${ambulanceCoord};${hospitalCoords}`;

  // sources=0 means we only calculate from the ambulance to all other coordinates
  // destinations=1;2;3... means we only calculate to hospitals
  const destinations = topHospitals.map((_, index) => index + 1).join(';');
  
  const url = `https://api.mapbox.com/directions-matrix/v1/mapbox/driving/${coordinates}?sources=0&destinations=${destinations}&annotations=distance,duration&access_token=${token}`;

  try {
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Mapbox API error: ${response.status}`);
    }
    const data = await response.json();

    if (data.code !== 'Ok' || !data.distances || !data.durations) {
      throw new Error(`Mapbox API returned invalid data: ${data.code}`);
    }

    // Mapbox returns arrays of arrays since it's a matrix
    const distances = data.distances[0]; // distance from ambulance (source 0)
    const durations = data.durations[0]; // duration from ambulance (source 0)

    // Update the top 24 hospitals with Mapbox data
    const updatedHospitals = hospitals.map(hospital => {
      const index = topHospitals.findIndex(h => h.id === hospital.id);
      if (index !== -1 && distances[index] !== null && durations[index] !== null) {
        return {
          ...hospital,
          distance: Math.round((distances[index] / 1000) * 10) / 10, // Convert meters to km, round to 1 decimal
          eta: Math.max(3, Math.ceil(durations[index] / 60)) // Convert seconds to minutes, minimum 3 min
        };
      }
      return hospital;
    });

    return updatedHospitals;
  } catch (error) {
    console.error("Error fetching Mapbox ETAs:", error);
    // On error, just return the hospitals as-is (with their Haversine estimates)
    return hospitals;
  }
};
