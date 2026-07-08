import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface Hospital {
  id: string;
  name: string;
  distance: number;
  address: string;
  equipment?: string[];
  specialties?: string[];
  latitude: number;
  longitude: number;
}

interface AmbulanceLocation {
  latitude: number;
  longitude: number;
}

interface PatientData {
  vitals: {
    spo2: number;
    heartRate: number;
    bloodPressureSys: number;
    bloodPressureDia: number;
    temperature: number;
    gcs: number;
  };
  triageLevel: string;
  complaint: string;
  requiredEquipment?: string[];
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { patientData, hospitalList, ambulanceLocation } = await req.json() as {
      patientData: PatientData;
      hospitalList: Hospital[];
      ambulanceLocation: AmbulanceLocation;
    };

    if (!ambulanceLocation || typeof ambulanceLocation.latitude !== 'number' || typeof ambulanceLocation.longitude !== 'number') {
      console.error('Missing or invalid ambulanceLocation');
      return new Response(JSON.stringify({ error: 'ambulanceLocation (latitude, longitude) is required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    console.log('Received recommendation request for patient with triage:', patientData.triageLevel);
    console.log('Ambulance location (audit):', ambulanceLocation);

    // Get API key from Supabase Secrets
    const apiKey = Deno.env.get('GROQ_API_KEY');

    if (!apiKey || apiKey === "your_groq_api_key_here") {
      console.log('No valid Groq API key found, returning fallback signal');
      return new Response(JSON.stringify({ useFallback: true }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Build prompt for Groq
    const prompt = `You are a medical AI assistant helping to recommend the best hospital for an emergency patient.

Ambulance Location: ${ambulanceLocation.latitude}, ${ambulanceLocation.longitude}

Patient Information:
- Triage Level: ${patientData.triageLevel}
- Chief Complaint: ${patientData.complaint}
- Vitals:
  * SpO2: ${patientData.vitals.spo2}%
  * Heart Rate: ${patientData.vitals.heartRate} bpm
  * Blood Pressure: ${patientData.vitals.bloodPressureSys}/${patientData.vitals.bloodPressureDia} mmHg
  * Temperature: ${patientData.vitals.temperature}°C
  * GCS: ${patientData.vitals.gcs}
- Required Equipment: ${patientData.requiredEquipment?.join(', ') || 'None specified'}

Available Hospitals (within range):
${hospitalList.map((h, idx) => `
${idx + 1}. ${h.name}
   - Distance: ${h.distance} km
   - Coordinates: ${h.latitude}, ${h.longitude}
   - Address: ${h.address}
   - Equipment: ${h.equipment?.join(', ') || 'Not specified'}
   - Specialties: ${h.specialties?.join(', ') || 'Not specified'}
`).join('\n')}

Task: Analyze the patient's condition and recommend the TOP 3 hospitals in ranked order.

CRITICAL PRIORITIZATION RULES:
1. EQUIPMENT MATCH (70% weight): Hospitals MUST have all required equipment. If required equipment is specified, any hospital missing critical items should be heavily penalized or excluded.
2. DISTANCE/TRAVEL TIME (30% weight): Prefer closer hospitals. Deprioritize any hospital beyond 5 km unless it's the only equipment match.
3. For each hospital provide:
   - Hospital name (exactly as listed above)
   - Confidence score (0-100)
   - Brief reasoning (max 50 words) explaining equipment match and distance tradeoff

Respond ONLY with valid JSON in this exact format:
{
  "recommendations": [
    {
      "hospitalName": "Hospital Name",
      "confidence": 95,
      "reasoning": "Brief explanation"
    }
  ],
  "aiMode": true
}`;

    console.log('Calling Groq API...');
    const groqResponse = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'llama-3.3-70b-versatile',
        messages: [
          { role: 'system', content: 'You are a medical AI assistant. Always respond with valid JSON only.' },
          { role: 'user', content: prompt }
        ],
        temperature: 0.3,
        max_tokens: 1000,
      }),
    });

    if (!groqResponse.ok) {
      const errorText = await groqResponse.text();
      console.error('Groq API error:', groqResponse.status, errorText);
      return new Response(JSON.stringify({ useFallback: true }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const groqData = await groqResponse.json();
    const aiResponse = groqData.choices[0].message.content;
    
    console.log('Groq AI response received:', aiResponse);

    // Parse AI response
    const parsedResponse = JSON.parse(aiResponse);
    
    return new Response(JSON.stringify(parsedResponse), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('Error in recommend-hospital function:', error);
    return new Response(JSON.stringify({ useFallback: true }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
