export const predictRequiredEquipment = async (symptoms: string[]): Promise<string[]> => {
  const apiKey = import.meta.env.VITE_GROQ_API_KEY;
  if (!apiKey) {
    console.warn("Groq API key not found. Skipping AI equipment prediction.");
    return [];
  }

  if (!symptoms || symptoms.length === 0) return [];

  const allowedEquipment = [
    'Ventilator', 'ICU', 'CT Scan', 'MRI', 'Oxygen', 
    'Defibrillator', 'Cardiac Monitor', 'Dialysis', 'Cath Lab'
  ];

  const prompt = `You are an emergency medical AI. Based on the following chief complaints/symptoms, select the required medical equipment or facilities that the receiving hospital MUST have.
Symptoms: ${symptoms.join(', ')}

You MUST strictly select from this exact list of allowed equipment:
${allowedEquipment.join(', ')}

Output ONLY a raw JSON array of strings containing the exact matching names from the allowed list. Do not include markdown formatting or any other text.
Example output: ["ICU", "Oxygen"]`;

  try {
    const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'llama3-8b-8192',
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.1, // Low temperature for consistent JSON output
      }),
    });

    if (!response.ok) {
      console.error(`Groq API error: ${response.status}`);
      return [];
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content || '[]';
    
    // Parse the JSON array
    let suggestedEquipment: string[] = [];
    try {
      // Sometimes models wrap JSON in markdown block even if told not to
      const cleanContent = content.replace(/```json/gi, '').replace(/```/g, '').trim();
      suggestedEquipment = JSON.parse(cleanContent);
    } catch (e) {
      console.error("Failed to parse Groq response as JSON:", content);
      return [];
    }

    // Filter to ensure only allowed strings are returned
    return suggestedEquipment.filter((eq: string) => allowedEquipment.includes(eq));
  } catch (error) {
    console.error("Error calling Groq API:", error);
    return [];
  }
};
