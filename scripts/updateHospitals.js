import { createClient } from '@supabase/supabase-js';

// Setup Supabase
const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.VITE_SUPABASE_PUBLISHABLE_KEY;
const mapboxToken = process.env.VITE_MAPBOX_TOKEN;

if (!supabaseUrl || !supabaseKey || !mapboxToken) {
  console.error("Missing environment variables. Please run with --env-file=.env");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function updateHospitals() {
  console.log("Fetching existing hospitals...");
  const { data: hospitals, error: fetchError } = await supabase.from('hospitals').select('*');
  
  if (fetchError) {
    console.error("Error fetching hospitals:", fetchError);
    return;
  }
  
  console.log(`Found ${hospitals.length} hospitals. Beginning geocoding audit...`);
  
  let updatedCount = 0;

  for (const hospital of hospitals) {
    // Only search in Bangalore bounding box: [77.3, 12.7, 77.9, 13.2]
    const searchQuery = encodeURIComponent(`${hospital.name} Bangalore`);
    const url = `https://api.mapbox.com/search/geocode/v6/forward?q=${searchQuery}&bbox=77.3,12.7,77.9,13.2&access_token=${mapboxToken}&limit=1`;
    
    try {
      const response = await fetch(url);
      const data = await response.json();
      
      if (data.features && data.features.length > 0) {
        const coords = data.features[0].geometry.coordinates;
        const newLon = coords[0];
        const newLat = coords[1];
        
        // Calculate difference to see if we need to update
        const latDiff = Math.abs(hospital.latitude - newLat);
        const lonDiff = Math.abs(hospital.longitude - newLon);
        
        // If coordinate difference is more than 0.005 degrees (approx 500m), update it
        if (latDiff > 0.005 || lonDiff > 0.005) {
          console.log(`[UPDATE] ${hospital.name} was wildly inaccurate. Fixing coordinates...`);
          console.log(`         Old: ${hospital.latitude}, ${hospital.longitude} | New: ${newLat}, ${newLon}`);
          
          await supabase.from('hospitals').update({
            latitude: newLat,
            longitude: newLon
          }).eq('id', hospital.id);
          
          updatedCount++;
        } else {
          console.log(`[OK] ${hospital.name} coordinates look accurate.`);
        }
      } else {
        console.log(`[NOT FOUND] Mapbox couldn't find precise coordinates for: ${hospital.name}`);
      }
    } catch (e) {
      console.error(`Error querying mapbox for ${hospital.name}:`, e);
    }
    
    // Avoid rate limits
    await sleep(200);
  }
  
  console.log(`\nAudit Complete! Fixed the coordinates for ${updatedCount} hospitals.`);
}

updateHospitals();
