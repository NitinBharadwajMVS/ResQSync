import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.VITE_SUPABASE_SERVICE_ROLE_KEY; // Use service role to bypass RLS
const mapboxToken = process.env.VITE_MAPBOX_TOKEN;

const supabase = createClient(supabaseUrl, supabaseKey);

// Realistic dummy data pool
const allEquipment = ['Ventilator', 'ICU', 'CT Scan', 'MRI', 'Oxygen', 'Defibrillator', 'Cardiac Monitor', 'Dialysis', 'Cath Lab'];

function getRandomEquipment() {
  const count = Math.floor(Math.random() * 6) + 3; // 3 to 8 equipments
  const shuffled = [...allEquipment].sort(() => 0.5 - Math.random());
  return shuffled.slice(0, count);
}

function generateDummyPhone() {
  return '+91-80-' + (Math.floor(Math.random() * 9000) + 1000) + '-' + (Math.floor(Math.random() * 9000) + 1000);
}

async function seedHospitals() {
  console.log("Fetching new hospitals from Mapbox POI API...");
  
  // North and South Bangalore bounding boxes
  const bboxes = [
    "77.50,12.85,77.75,12.95", // South
    "77.50,12.95,77.75,13.10"  // North
  ];
  
  const newHospitals = [];

  for (const bbox of bboxes) {
    const url = `https://api.mapbox.com/search/searchbox/v1/category/hospital?bbox=${bbox}&limit=25&access_token=${mapboxToken}`;
    
    try {
      const response = await fetch(url);
      const data = await response.json();
      
      if (!data.features) {
        console.error("Failed to fetch features from Mapbox:", data);
        continue;
      }
      
      for (const feature of data.features) {
        const name = feature.properties.name;
        // Skip if very generic
        if (!name || name.length < 5 || name.toLowerCase() === 'hospital') continue;
        
        const lng = feature.geometry.coordinates[0];
        const lat = feature.geometry.coordinates[1];
        const address = feature.properties.address || feature.properties.place_formatted || 'Bangalore';
        
        newHospitals.push({
          id: crypto.randomUUID(),
          name: name,
          address: address,
          contact: feature.properties.telephone || generateDummyPhone(),
          distance: 1.0,
          equipment: getRandomEquipment(),
          latitude: lat,
          longitude: lng,
          specialties: ["General Medicine", "Emergency"]
        });
      }
    } catch (err) {
      console.error("Error fetching mapbox data:", err);
    }
  }
  
  try {
    console.log(`Prepared ${newHospitals.length} new hospitals. Inserting into Supabase...`);
    
    // Check for duplicates by name
    const { data: existing } = await supabase.from('hospitals').select('name');
    const existingNames = new Set(existing.map(e => e.name.toLowerCase()));
    
    const toInsert = newHospitals.filter(h => !existingNames.has(h.name.toLowerCase()));
    
    if (toInsert.length > 0) {
      const { error } = await supabase.from('hospitals').insert(toInsert);
      if (error) {
        console.error("Insertion failed:", error);
      } else {
        console.log(`Successfully inserted ${toInsert.length} brand new hospitals into the database!`);
      }
    } else {
      console.log("No new unique hospitals to insert.");
    }
    
  } catch (err) {
    console.error("Error seeding hospitals:", err);
  }
}

seedHospitals();
