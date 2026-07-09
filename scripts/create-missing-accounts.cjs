const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.VITE_SUPABASE_SERVICE_ROLE_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

function generateShortname(hospitalName) {
  const cleanName = hospitalName.replace(/[^a-zA-Z\s]/g, '');
  const words = cleanName.split(/\s+/).filter(w => 
    !['hospital', 'hospitals', 'clinic', 'medical', 'centre', 'center', 'institute', 'speciality', 'specialty', 'multispeciality', 'care', 'health', 'healthcare'].includes(w.toLowerCase())
  );
  if (words.length === 0) return 'hospital' + Math.floor(Math.random() * 1000);
  return words[0];
}

async function run() {
  // Get all hospitals
  const { data: allHospitals } = await supabase.from('hospitals').select('id, name');
  
  // Get all registered hospital IDs
  const { data: users } = await supabase.from('app_users').select('linked_entity, username').eq('role', 'hospital');
  const registeredIds = new Set(users.map(u => u.linked_entity));
  const existingUsernames = new Set(users.map(u => u.username));

  const missingHospitals = allHospitals.filter(h => !registeredIds.has(h.id));
  console.log(`Found ${missingHospitals.length} hospitals without accounts.`);

  let createdCount = 0;

  for (const hospital of missingHospitals) {
    let baseShortname = generateShortname(hospital.name);
    let shortname = baseShortname;
    let username = shortname.toLowerCase();
    
    // Handle username collisions
    let counter = 1;
    while (existingUsernames.has(username)) {
      counter++;
      shortname = `${baseShortname}${counter}`;
      username = shortname.toLowerCase();
    }
    existingUsernames.add(username);

    const email = `${username}@internal.example`;
    // Capitalize first letter of shortname for password as per existing convention
    const passwordShortname = shortname.charAt(0).toUpperCase() + shortname.slice(1);
    const password = `${passwordShortname}@123`;

    console.log(`Creating account for ${hospital.name}...`);

    const { data: authData, error: authError } = await supabase.auth.admin.createUser({
      email: email,
      password: password,
      email_confirm: true,
      user_metadata: {
        username: username,
        hospital_id: hospital.id,
        hospital_name: hospital.name,
        role: 'hospital'
      }
    });

    if (authError) {
      console.error(`  ❌ Auth error for ${username}:`, authError.message);
      continue;
    }

    const { error: dbError } = await supabase.from('app_users').upsert({
      auth_uid: authData.user.id,
      username: username,
      role: 'hospital',
      linked_entity: hospital.id
    });

    if (dbError) {
      console.error(`  ❌ DB error for ${username}:`, dbError.message);
    } else {
      console.log(`  ✅ Success: User '${username}' | Pass '${password}'`);
      createdCount++;
    }
  }

  console.log(`Finished creating ${createdCount} accounts.`);
}
run();
