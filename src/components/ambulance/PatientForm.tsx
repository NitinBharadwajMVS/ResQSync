import { useState, useEffect } from 'react';
import { Patient, TriageLevel, Vitals } from '@/types/patient';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { LiveVitalsDisplay } from './LiveVitalsDisplay';
import { MultipleSymptomDropdown } from './MultipleSymptomDropdown';
import { HospitalSelector } from './HospitalSelector';
import { useApp } from '@/contexts/AppContext';
import { Send, Sparkles } from 'lucide-react';
import { toast } from 'sonner';
import { calculateETA } from '@/utils/distanceCalculator';
import { predictRequiredEquipment } from '@/utils/aiEquipmentPredictor';

interface PatientFormProps {
  triageLevel: TriageLevel;
  onClose: () => void;
}

export const PatientForm = ({ triageLevel, onClose }: PatientFormProps) => {
  const { patients, addPatient, updatePatient, sendAlert, currentUser, hospitals } = useApp();
  const [isNewPatient, setIsNewPatient] = useState(true);
  const [selectedPatientId, setSelectedPatientId] = useState('');
  const [selectedHospitalId, setSelectedHospitalId] = useState<string>('');
  const [selectedHospitalObj, setSelectedHospitalObj] = useState<Hospital | null>(null);
  const [requiredEquipment, setRequiredEquipment] = useState<string[]>([]);
  const [isAiLoading, setIsAiLoading] = useState(false);
  const [formData, setFormData] = useState({
    name: '',
    age: '',
    gender: 'male',
    contact: '',
    complaints: [] as string[],
  });
  const [vitals, setVitals] = useState<Vitals>({
    spo2: 98,
    heartRate: 72,
    bloodPressureSys: 0,
    bloodPressureDia: 0,
    temperature: 0,
    gcs: 0,
  });

  const selectedPatient = patients.find(p => p.id === selectedPatientId);

  // AI Equipment Prediction based on complaints
  useEffect(() => {
    const activeComplaints = isNewPatient ? formData.complaints : (selectedPatient?.complaint ? selectedPatient.complaint.split(',').map(s => s.trim()) : []);
    
    if (activeComplaints.length === 0) {
      return;
    }

    const timer = setTimeout(async () => {
      setIsAiLoading(true);
      try {
        const suggested = await predictRequiredEquipment(activeComplaints);
        if (suggested && suggested.length > 0) {
          // Replace equipment with new AI suggestion (don't merge with stale old predictions)
          setRequiredEquipment(suggested);
        }
      } catch (err) {
        console.error("AI prediction failed", err);
      } finally {
        setIsAiLoading(false);
      }
    }, 1500); // 1.5s debounce

    return () => clearTimeout(timer);
  }, [formData.complaints, selectedPatient, isNewPatient]);

  const handleSendAlert = async () => {
    // Validate hospital selection first
    if (!selectedHospitalId) {
      toast.error('Please select a hospital');
      return;
    }

    let patientId: string;

    if (isNewPatient) {
      // Validate new patient fields
      if (!formData.age || parseInt(formData.age) <= 0) {
        toast.error('Please enter valid age');
        return;
      }
      if (!formData.gender) {
        toast.error('Please select gender');
        return;
      }
      if (formData.complaints.length === 0) {
        toast.error('Please select at least one symptom or complaint');
        return;
      }

      const patientData: Patient = {
        id: `P${Date.now()}`,
        name: formData.name,
        age: parseInt(formData.age),
        gender: formData.gender as 'male' | 'female' | 'other',
        contact: formData.contact,
        vitals,
        complaint: formData.complaints.join(', '),
        triageLevel,
        timestamp: new Date().toISOString(),
      };
      
      try {
        patientId = await addPatient(patientData);
      } catch (error) {
        console.error('Error adding patient:', error);
        toast.error('Failed to add patient');
        return;
      }
    } else {
      if (!selectedPatient) {
        toast.error('Please select a patient');
        return;
      }
      patientId = selectedPatient.id;
      
      // Update existing patient with new vitals and triage
      try {
        await updatePatient(patientId, { vitals, triageLevel });
      } catch (error) {
        console.error('Error updating patient:', error);
        toast.error('Failed to update patient');
        return;
      }
    }

    // Use the stored hospital object (which has live Mapbox distance) or fall back to hospitals array
    const selectedHospital = selectedHospitalObj || hospitals.find(h => h.id === selectedHospitalId);
    if (!selectedHospital) {
      toast.error('Hospital not found');
      return;
    }

    const ambulanceId = currentUser?.linkedEntity || 'amb-001';
    const distance = selectedHospital.distance || 0;
    const eta = selectedHospital.eta || calculateETA(distance);

    try {
      const hospital = await sendAlert(
        patientId,
        ambulanceId,
        selectedHospitalId,
        distance,
        eta,
        requiredEquipment.length > 0 ? requiredEquipment : undefined
      );
      
      toast.success(
        `Pre-alert sent to ${hospital.name}`,
        {
          description: `Distance: ${distance.toFixed(2)} km | ETA: ${eta} minutes`,
          duration: 5000,
        }
      );

      setTimeout(onClose, 1500);
    } catch (error) {
      console.error('Error sending alert:', error);
      toast.error('Failed to send pre-alert');
    }
  };

  return (
    <div className="space-y-6 animate-slide-in">
      <div className="flex gap-4">
        <Button
          variant={isNewPatient ? 'default' : 'outline'}
          onClick={() => setIsNewPatient(true)}
          className="flex-1 transition-all duration-300 hover:scale-105"
        >
          Add New Patient
        </Button>
        <Button
          variant={!isNewPatient ? 'default' : 'outline'}
          onClick={() => setIsNewPatient(false)}
          className="flex-1 transition-all duration-300 hover:scale-105"
        >
          Existing Patient
        </Button>
      </div>

      {!isNewPatient && (
        <div>
          <Label>Select Patient</Label>
          <Select value={selectedPatientId} onValueChange={setSelectedPatientId}>
            <SelectTrigger className="bg-ambulance-card border-ambulance-border">
              <SelectValue placeholder="Choose patient..." />
            </SelectTrigger>
            <SelectContent>
              {patients.map(patient => (
                <SelectItem key={patient.id} value={patient.id}>
                  {patient.name} - {patient.age}y - {patient.contact}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {selectedPatient && (
            <div className="mt-4 p-4 glass-effect rounded-lg space-y-2 text-sm animate-slide-in interactive-card">
              <div><strong>Medical History:</strong> {selectedPatient.medicalHistory?.join(', ') || 'None'}</div>
              {selectedPatient.previousVisits && (
                <div>
                  <strong>Previous Visit:</strong> {selectedPatient.previousVisits[0].date} - {selectedPatient.previousVisits[0].hospital} - {selectedPatient.previousVisits[0].diagnosis}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {isNewPatient && (
        <div className="grid grid-cols-2 gap-4 animate-slide-in">
          <div>
            <Label>Name</Label>
            <Input
              className="bg-ambulance-card border-ambulance-border interactive-input"
              value={formData.name}
              onChange={(e) => {
                const value = e.target.value.replace(/[^a-zA-Z\s]/g, '');
                setFormData({ ...formData, name: value });
              }}
            />
          </div>
          <div>
            <Label>Age</Label>
            <Input
              type="number"
              className="bg-ambulance-card border-ambulance-border interactive-input"
              value={formData.age}
              onChange={(e) => {
                const value = e.target.value.replace(/[^0-9]/g, '');
                setFormData({ ...formData, age: value });
              }}
            />
          </div>
          <div>
            <Label>Gender</Label>
            <Select value={formData.gender} onValueChange={(v) => setFormData({ ...formData, gender: v })}>
              <SelectTrigger className="bg-ambulance-card border-ambulance-border interactive-input">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="male">Male</SelectItem>
                <SelectItem value="female">Female</SelectItem>
                <SelectItem value="other">Other</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Contact</Label>
            <Input
              className="bg-ambulance-card border-ambulance-border interactive-input"
              value={formData.contact}
              onChange={(e) => {
                const value = e.target.value.replace(/[^0-9]/g, '');
                setFormData({ ...formData, contact: value });
              }}
            />
          </div>
          <div className="col-span-2">
            <Label>Chief Complaints / Conditions (Multiple Selection)</Label>
            <MultipleSymptomDropdown
              values={formData.complaints}
              onChange={(values) => 
                setFormData({ ...formData, complaints: values })
              }
            />
          </div>
        </div>
      )}

      <div>
        <div className="flex items-center gap-2 mb-2">
          <Label className="mb-0">Required Equipment (Optional)</Label>
          {isAiLoading && (
            <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-blue-500/10 text-blue-500 text-xs font-medium animate-pulse">
              <Sparkles className="w-3 h-3" />
              AI Analyzing...
            </div>
          )}
        </div>
        <MultipleSymptomDropdown
          values={requiredEquipment}
          onChange={setRequiredEquipment}
          options={['Ventilator', 'ICU', 'CT Scan', 'MRI', 'Oxygen', 'Defibrillator', 'Cardiac Monitor', 'Dialysis', 'Cath Lab']}
          placeholder="Select required equipment..."
        />
      </div>

      <HospitalSelector
        hospitals={hospitals}
        selectedHospitalId={selectedHospitalId}
        onSelect={(hospital) => { setSelectedHospitalId(hospital.id); setSelectedHospitalObj(hospital); }}
        patientDataForAI={{
          vitals,
          triageLevel,
          complaint: formData.complaints.join(', ') || selectedPatient?.complaint || '',
          requiredEquipment
        }}
      />

      <LiveVitalsDisplay
        onVitalsUpdate={(spo2, heartRate) => {
          setVitals(v => ({ ...v, spo2, heartRate }));
        }}
      />

      <div className="grid grid-cols-2 gap-4">
        <div>
          <Label>Blood Pressure (Sys/Dia)</Label>
          <div className="flex gap-2">
            <Input
              type="number"
              className="bg-ambulance-card border-ambulance-border interactive-input"
              value={vitals.bloodPressureSys || ''}
              onChange={(e) => setVitals({ ...vitals, bloodPressureSys: parseInt(e.target.value) || 0 })}
              placeholder="Sys"
            />
            <Input
              type="number"
              className="bg-ambulance-card border-ambulance-border interactive-input"
              value={vitals.bloodPressureDia || ''}
              onChange={(e) => setVitals({ ...vitals, bloodPressureDia: parseInt(e.target.value) || 0 })}
              placeholder="Dia"
            />
          </div>
        </div>
        <div>
          <Label>Temperature (°F)</Label>
          <Input
            type="number"
            step="0.1"
            className="bg-ambulance-card border-ambulance-border interactive-input"
            value={vitals.temperature || ''}
            onChange={(e) => setVitals({ ...vitals, temperature: parseFloat(e.target.value) || 0 })}
            placeholder="98.6"
          />
        </div>
        <div>
          <Label>GCS Score</Label>
          <Input
            type="number"
            min="3"
            max="15"
            className="bg-ambulance-card border-ambulance-border interactive-input"
            value={vitals.gcs || ''}
            onChange={(e) => setVitals({ ...vitals, gcs: parseInt(e.target.value) || 0 })}
            placeholder="3-15"
          />
        </div>
      </div>

      <Button
        onClick={handleSendAlert}
        className="w-full h-14 text-lg font-semibold bg-primary hover:bg-primary/90 glow-critical group relative overflow-hidden transition-all duration-300 hover:scale-105 active:scale-95"
      >
        <span className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent translate-x-[-100%] group-hover:translate-x-[100%] transition-transform duration-700" />
        <Send className="w-5 h-5 mr-2 group-hover:rotate-12 transition-transform duration-300" />
        <span className="relative">Send Pre-Alert</span>
      </Button>
    </div>
  );
};
