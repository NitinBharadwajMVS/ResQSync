import React, { createContext, useContext, useState, useEffect, ReactNode, useCallback, useMemo } from 'react';
import { Patient, Alert, Hospital, AuditLog } from '@/types/patient';
import { supabase } from '@/integrations/supabase/client';
import { RealtimeChannel } from '@supabase/supabase-js';
import { playAlertSound } from '@/utils/alertSounds';

interface AppContextType {
  patients: Patient[];
  alerts: Alert[];
  hospitals: Hospital[];
  currentUser: { id: string; username: string; role: string; linkedEntity: string | null } | null;
  currentHospitalId: string | null;
  currentAmbulanceId: string | null;
  addPatient: (patient: Patient) => Promise<string>;
  updatePatient: (patientId: string, updates: Partial<Patient>) => Promise<void>;
  sendAlert: (patientId: string, ambulanceId: string, hospitalId: string, distance?: number, eta?: number, requiredEquipment?: string[]) => Promise<Hospital>;
  updateAlertStatus: (alertId: string, status: 'acknowledged' | 'accepted' | 'declined', declineReason?: string) => Promise<void>;
  completeCase: (alertId: string) => Promise<void>;
  changeHospital: (patientId: string, newHospitalId: string, reason: string) => Promise<void>;
  markHospitalUnavailable: (alertId: string, hospitalId: string, reason: string) => Promise<void>;
  addHospital: (hospital: Hospital) => Promise<void>;
  login: (usernameOrEmail: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  isLoading: boolean;
}

const AppContext = createContext<AppContextType | undefined>(undefined);

export const AppProvider = ({ children }: { children: ReactNode }) => {
  const [patients, setPatients] = useState<Patient[]>([]);
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [hospitals, setHospitals] = useState<Hospital[]>([]);
  const [currentUser, setCurrentUser] = useState<{ id: string; username: string; role: string; linkedEntity: string | null } | null>(null);
  const [currentHospitalId, setCurrentHospitalId] = useState<string | null>(null);
  const [currentAmbulanceId, setCurrentAmbulanceId] = useState<string | null>(null);
  const [alertsChannel, setAlertsChannel] = useState<RealtimeChannel | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Handle session persistence
  useEffect(() => {
    let mounted = true;

    const restoreUser = async (userId: string) => {
      try {
        const { data: appUser, error: appUserError } = await supabase
          .from('app_users')
          .select('*')
          .eq('auth_uid', userId)
          .single();

        if (appUserError || !appUser) {
          console.error('Error loading user info during restore:', appUserError);
          return;
        }

        if (mounted) {
          setCurrentUser({
            id: userId,
            username: appUser.username,
            role: appUser.role,
            linkedEntity: appUser.linked_entity
          });

          if (appUser.role === 'hospital') {
            setCurrentHospitalId(appUser.linked_entity);
          } else if (appUser.role === 'ambulance') {
            setCurrentAmbulanceId(appUser.linked_entity);
          }
        }
      } catch (err) {
        console.error('Failed to restore user:', err);
      } finally {
        if (mounted) setIsLoading(false);
      }
    };

    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session?.user && mounted) {
        restoreUser(session.user.id);
      } else if (mounted) {
        setIsLoading(false);
      }
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (_event, session) => {
        if (session?.user && mounted) {
          restoreUser(session.user.id);
        } else if (!session && mounted) {
          setCurrentUser(null);
          setCurrentHospitalId(null);
          setCurrentAmbulanceId(null);
        }
      }
    );

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, []);

  // Load hospitals from Supabase
  useEffect(() => {
    const loadHospitals = async () => {
      const { data, error } = await supabase.from('hospitals').select('*').order('name');
      if (error) {
        console.error('Error loading hospitals:', error);
      } else if (data) {
        setHospitals(data as Hospital[]);
      }
    };
    loadHospitals();

    // Set up realtime subscription for hospitals
    const channel = supabase
      .channel('hospitals-channel')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'hospitals'
        },
        (payload) => {
          console.log('Realtime hospital update:', payload);
          if (payload.eventType === 'INSERT' || payload.eventType === 'UPDATE') {
            const hospital = payload.new as Hospital;
            setHospitals(prev => {
              const index = prev.findIndex(h => h.id === hospital.id);
              if (index >= 0) {
                const updated = [...prev];
                updated[index] = hospital;
                return updated;
              }
              return [...prev, hospital];
            });
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  // Load patients from Supabase
  useEffect(() => {
    const loadPatients = async () => {
      if (!currentUser || !currentAmbulanceId) return;

      const { data, error } = await supabase
        .from('patients')
        .select('*')
        .eq('ambulance_id', currentAmbulanceId)
        .order('created_at', { ascending: false })
        .returns<Array<{
          id: string;
          name: string;
          age: number;
          gender: string;
          contact: string;
          complaint: string | null;
          triage_level: string;
          vitals: any;
          medical_history: string[] | null;
          created_at: string | null;
          ambulance_id: string | null;
          current_hospital_id: string | null;
          updated_at: string | null;
        }>>();

      if (error) {
        console.error('Error loading patients:', error);
      } else if (data) {
        setPatients(data.map(p => ({
          id: p.id,
          name: p.name,
          age: p.age,
          gender: p.gender as 'male' | 'female' | 'other',
          contact: p.contact,
          complaint: p.complaint || '',
          triageLevel: p.triage_level as unknown as TriageLevel,
          vitals: p.vitals as unknown as Vitals,
          medicalHistory: p.medical_history || [],
          timestamp: p.created_at || new Date().toISOString()
        })));
      }
    };

    loadPatients();
  }, [currentUser, currentAmbulanceId]);

  // Load alerts from Supabase
  useEffect(() => {
    const loadAlerts = async () => {
      if (!currentUser) return;

      const { data, error } = await supabase
        .from('alerts')
        .select('*')
        .order('timestamp', { ascending: false })
        .returns<Array<{
          id: string;
          patient_id: string | null;
          patient_name: string;
          patient_age: number | null;
          patient_gender: string | null;
          patient_contact: string | null;
          patient_complaint: string | null;
          vitals: any;
          triage_level: string;
          ambulance_id: string;
          hospital_id: string;
          eta: number | null;
          status: string;
          timestamp: string | null;
          completed_at: string | null;
          required_equipment: string[] | null;
          decline_reason: string | null;
          previous_hospital_ids: string[] | null;
          audit_log: any;
        }>>();

      if (error) {
        console.error('Error loading alerts:', error);
      } else if (data) {
        setAlerts(data.map(alert => ({
          id: alert.id,
          patient: {
            id: alert.patient_id || alert.id,
            name: alert.patient_name,
            age: alert.patient_age || 0,
            gender: alert.patient_gender as 'male' | 'female' | 'other',
            contact: alert.patient_contact || '',
            complaint: alert.patient_complaint || '',
            vitals: alert.vitals as unknown as Vitals,
            triageLevel: alert.triage_level as unknown as TriageLevel,
            timestamp: alert.timestamp
          },
          ambulanceId: alert.ambulance_id,
          hospitalId: alert.hospital_id,
          eta: alert.eta || 0,
          status: alert.status as unknown as Alert['status'],
          timestamp: alert.timestamp,
          completedAt: alert.completed_at || undefined,
          requiredEquipment: alert.required_equipment || [],
          declineReason: alert.decline_reason || undefined,
          previousHospitalIds: alert.previous_hospital_ids || [],
          auditLog: (alert.audit_log as unknown as AuditLog[]) || []
        })));
      }
    };

    loadAlerts();
  }, [currentUser]);

  // Set up realtime subscription for alerts (Hospital view)
  useEffect(() => {
    if (!currentUser || !currentHospitalId) return;

    console.log('Setting up realtime for hospital:', currentHospitalId);

    const channel = supabase
      .channel('alerts-channel-hospital')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'alerts',
          filter: `hospital_id=eq.${currentHospitalId}`
        },
        (payload) => {
          console.log('Realtime alert update:', payload);
          
          if (payload.eventType === 'INSERT' || payload.eventType === 'UPDATE') {
            const alert = payload.new;
            const mappedAlert: Alert = {
              id: alert.id,
              patient: {
                id: alert.id,
                name: alert.patient_name,
                age: alert.patient_age || 0,
                gender: alert.patient_gender as 'male' | 'female' | 'other',
                contact: alert.patient_contact || '',
                complaint: alert.patient_complaint || '',
                vitals: alert.vitals as unknown as Vitals,
                triageLevel: alert.triage_level as unknown as TriageLevel,
                timestamp: alert.timestamp
              },
              ambulanceId: alert.ambulance_id,
              hospitalId: alert.hospital_id,
              eta: alert.eta || 0,
              status: alert.status as unknown as Alert['status'],
              timestamp: alert.timestamp,
              completedAt: alert.completed_at || undefined,
              requiredEquipment: alert.required_equipment || [],
              declineReason: alert.decline_reason || undefined,
              previousHospitalIds: alert.previous_hospital_ids || [],
              auditLog: (alert.audit_log as unknown as AuditLog[]) || []
            };

            setAlerts(prev => {
              const index = prev.findIndex(a => a.id === mappedAlert.id);
              if (index >= 0) {
                const updated = [...prev];
                updated[index] = mappedAlert;
                return updated;
              }
              if (payload.eventType === 'INSERT') {
                playAlertSound(mappedAlert.patient.triageLevel);
              }
              return [mappedAlert, ...prev];
            });
          }
        }
      )
      .subscribe();

    setAlertsChannel(channel);

    return () => {
      channel.unsubscribe();
    };
  }, [currentUser, currentHospitalId]);

  // Set up realtime subscription for alerts (Ambulance view)
  useEffect(() => {
    if (!currentUser || !currentAmbulanceId) return;

    console.log('Setting up realtime for ambulance:', currentAmbulanceId);

    const channel = supabase
      .channel('alerts-channel-ambulance')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'alerts',
          filter: `ambulance_id=eq.${currentAmbulanceId}`
        },
        (payload) => {
          const alert = payload.new as unknown as any;
          console.log('🔔 Realtime ambulance alert event:', {
            type: payload.eventType,
            alertId: alert?.id,
            status: alert?.status,
            hospital: alert?.hospital_id,
            fullPayload: payload
          });
          
          if (payload.eventType === 'INSERT' || payload.eventType === 'UPDATE') {
            const alert = payload.new;
            const mappedAlert: Alert = {
              id: alert.id,
              patient: {
                id: alert.id,
                name: alert.patient_name,
                age: alert.patient_age || 0,
                gender: alert.patient_gender as 'male' | 'female' | 'other',
                contact: alert.patient_contact || '',
                complaint: alert.patient_complaint || '',
                vitals: alert.vitals as unknown as Vitals,
                triageLevel: alert.triage_level as unknown as TriageLevel,
                timestamp: alert.timestamp
              },
              ambulanceId: alert.ambulance_id,
              hospitalId: alert.hospital_id,
              eta: alert.eta || 0,
              status: alert.status as unknown as Alert['status'],
              timestamp: alert.timestamp,
              completedAt: alert.completed_at || undefined,
              requiredEquipment: alert.required_equipment || [],
              declineReason: alert.decline_reason || undefined,
              previousHospitalIds: alert.previous_hospital_ids || [],
              auditLog: (alert.audit_log as unknown as AuditLog[]) || []
            };

            setAlerts(prev => {
              const index = prev.findIndex(a => a.id === mappedAlert.id);
              if (index >= 0) {
                const updated = [...prev];
                updated[index] = mappedAlert;
                return updated;
              }
              return [mappedAlert, ...prev];
            });
          }
        }
      )
      .subscribe((status) => {
        console.log('🔌 Ambulance alerts subscription status:', status);
        if (status === 'SUBSCRIBED') {
          console.log('✅ Successfully subscribed to ambulance alerts');
        } else if (status === 'CHANNEL_ERROR') {
          console.error('❌ Error subscribing to ambulance alerts');
        }
      });

    setAlertsChannel(channel);

    return () => {
      console.log('🔌 Unsubscribing from ambulance alerts');
      channel.unsubscribe();
    };
  }, [currentUser, currentAmbulanceId]);

  const addPatient = async (patient: Patient): Promise<string> => {
    type PatientInsert = {
      id?: string;
      name: string;
      age: number;
      gender: string;
      contact: string;
      complaint: string | null;
      triage_level: string;
      vitals: any;
      medical_history: string[] | null;
      current_hospital_id: string | null;
      ambulance_id: string | null;
    };
    
    const { data, error } = await supabase.from('patients').insert({
      name: patient.name,
      age: patient.age,
      gender: patient.gender,
      contact: patient.contact,
      complaint: patient.complaint,
      triage_level: patient.triageLevel,
      vitals: patient.vitals as unknown as Json,
      medical_history: patient.medicalHistory || [],
      current_hospital_id: null,
      ambulance_id: currentAmbulanceId
    } as PatientInsert).select('id').single<{ id: string }>();

    if (error) {
      console.error('Error adding patient:', error);
      throw error;
    }

    return data.id;
  };

  const updatePatient = async (patientId: string, updates: Partial<Patient>) => {
    const updateData: any = {};
    if (updates.complaint) updateData.complaint = updates.complaint;
    if (updates.triageLevel) updateData.triage_level = updates.triageLevel;
    if (updates.vitals) updateData.vitals = updates.vitals;
    if (updates.medicalHistory) updateData.medical_history = updates.medicalHistory;

    type PatientUpdate = {
      complaint?: string;
      triage_level?: string;
      vitals?: any;
      medical_history?: string[];
    };

    const { error } = await supabase
      .from('patients')
      .update(updateData as PatientUpdate)
      .eq('id', patientId);

    if (error) {
      console.error('Error updating patient:', error);
      throw error;
    }
  };

  const sendAlert = async (
    patientId: string,
    ambulanceId: string,
    hospitalId: string,
    distance?: number,
    eta?: number,
    requiredEquipment?: string[],
    previousHospitalIds?: string[]
  ): Promise<Hospital> => {
    const selectedHospital = hospitals.find((h) => h.id === hospitalId);
    if (!selectedHospital) {
      throw new Error('Hospital not found');
    }

    type PatientUpdate = {
      current_hospital_id?: string | null;
    };

    // Update patient's current hospital
    await supabase
      .from('patients')
      .update({ current_hospital_id: hospitalId } as PatientUpdate)
      .eq('id', patientId);

    type PatientRow = {
      id: string;
      name: string;
      age: number;
      gender: string;
      contact: string;
      complaint: string | null;
      triage_level: string;
      vitals: any;
      medical_history: string[] | null;
      current_hospital_id: string | null;
      ambulance_id: string | null;
      created_at: string | null;
      updated_at: string | null;
    };

    // Get patient data for alert
    const { data: patientData } = await supabase
      .from('patients')
      .select('*')
      .eq('id', patientId)
      .single<PatientRow>();

    const alertId = `A${Date.now()}`;
    const auditLog = [
      {
        timestamp: new Date().toISOString(),
        action: 'Pre-alert sent',
        actor: ambulanceId,
        details: `Sent to ${selectedHospital.name}`,
      },
    ];

    const { error } = await supabase.from('alerts').insert({
      id: alertId,
      patient_id: patientId,
      hospital_id: hospitalId,
      ambulance_id: ambulanceId,
      patient_name: patientData?.name || '',
      patient_age: patientData?.age || 0,
      patient_gender: patientData?.gender || 'other',
      patient_contact: patientData?.contact || '',
      patient_complaint: patientData?.complaint || '',
      triage_level: patientData?.triage_level || 'stable',
      vitals: patientData?.vitals || {},
      distance: distance || null,
      eta: eta || null,
      status: 'pending',
      required_equipment: requiredEquipment || [],
      previous_hospital_ids: previousHospitalIds || [],
      audit_log: auditLog as unknown as Json,
      timestamp: new Date().toISOString()
    });

    if (error) {
      console.error('Error sending alert:', error);
      throw error;
    }

    return selectedHospital;
  };

  const updateAlertStatus = async (
    alertId: string,
    status: 'acknowledged' | 'accepted' | 'declined',
    declineReason?: string
  ) => {
    const alert = alerts.find(a => a.id === alertId);
    if (!alert) return;

    const hospital = hospitals.find((h) => h.id === alert.hospitalId);
    const newLog: AuditLog = {
      timestamp: new Date().toISOString(),
      action: status === 'declined' ? 'Alert declined' : `Alert ${status}`,
      actor: hospital?.name || alert.hospitalId,
      details: declineReason || `Status updated to ${status}`,
    };

    const updatedAuditLog = [...alert.auditLog, newLog];

    type AlertUpdate = {
      status?: string;
      decline_reason?: string | null;
      audit_log?: any;
    };

    const { error } = await supabase
      .from('alerts')
      .update({
        status,
        decline_reason: status === 'declined' ? declineReason : null,
        audit_log: updatedAuditLog as unknown as Json
      } as AlertUpdate)
      .eq('id', alertId);

    if (error) {
      console.error('Error updating alert status:', error);
      throw error;
    }
  };

  const completeCase = async (alertId: string) => {
    const alert = alerts.find(a => a.id === alertId);
    if (!alert) return;

    const newLog: AuditLog = {
      timestamp: new Date().toISOString(),
      action: 'Patient dropped',
      actor: alert.ambulanceId,
      details: 'Patient successfully dropped at hospital',
    };

    const updatedAuditLog = [...alert.auditLog, newLog];

    type AlertUpdate = {
      status?: string;
      completed_at?: string | null;
      audit_log?: any;
    };

    const { error } = await supabase
      .from('alerts')
      .update({
        status: 'completed',
        completed_at: new Date().toISOString(),
        audit_log: updatedAuditLog as unknown as Json
      } as AlertUpdate)
      .eq('id', alertId);

    if (error) {
      console.error('Error completing case:', error);
      throw error;
    }
  };

  const changeHospital = async (patientId: string, newHospitalId: string, reason: string) => {
    console.log('🔄 changeHospital called:', { patientId, newHospitalId, reason });
    console.log('📋 All alerts:', alerts.map(a => ({ id: a.id, patientId: a.patient.id, status: a.status, ambulance: a.ambulanceId })));
    
    // Find the existing alert for this patient (including declined ones)
    const existingAlert = alerts.find(a => 
      a.patient.id === patientId && 
      a.status !== 'completed' && 
      a.status !== 'cancelled'
    );

    console.log('🔍 Found existing alert:', existingAlert?.id, 'Status:', existingAlert?.status);

    if (existingAlert) {
      // Mark the old alert as cancelled with reason
      const newLog: AuditLog = {
        timestamp: new Date().toISOString(),
        action: 'Hospital changed',
        actor: existingAlert.ambulanceId,
        details: `Hospital changed: ${reason}`,
      };

      const updatedAuditLog = [...existingAlert.auditLog, newLog];

      type AlertUpdate = {
        status?: string;
        decline_reason?: string | null;
        audit_log?: any;
        completed_at?: string | null;
      };

      console.log('❌ Cancelling old alert:', existingAlert.id);
      const { error: cancelError } = await supabase
        .from('alerts')
        .update({
          status: 'cancelled',
          decline_reason: `Hospital changed: ${reason}`,
          audit_log: updatedAuditLog as unknown as Json,
          completed_at: new Date().toISOString()
        } as AlertUpdate)
        .eq('id', existingAlert.id);

      if (cancelError) {
        console.error('Error cancelling alert:', cancelError);
        throw cancelError;
      }
      console.log('✅ Old alert cancelled');

      type PatientUpdate = {
        current_hospital_id?: string | null;
      };

      // Update patient's current hospital
      console.log('👤 Updating patient hospital to:', newHospitalId);
      const { error: patientError } = await supabase
        .from('patients')
        .update({ current_hospital_id: newHospitalId } as PatientUpdate)
        .eq('id', patientId);

      if (patientError) {
        console.error('Error updating patient:', patientError);
        throw patientError;
      }
      console.log('✅ Patient hospital updated');

      // Create new alert at the new hospital
      const newHospital = hospitals.find(h => h.id === newHospitalId);
      console.log('🏥 New hospital found:', newHospital?.name);
      
      if (newHospital) {
        console.log('📤 Sending new alert to hospital:', newHospitalId);
        try {
          // Calculate new ETA based on distance
          const newDistance = newHospital.distance || 0;
          const newEta = Math.max(3, Math.ceil((newDistance / 40) * 60));
          
          const prevHospitals = [...(existingAlert.previousHospitalIds || []), existingAlert.hospitalId];

          const result = await sendAlert(
            patientId,
            existingAlert.ambulanceId,
            newHospitalId,
            newDistance,
            newEta,
            existingAlert.requiredEquipment,
            prevHospitals
          );
          console.log('✅ New alert sent successfully:', result);
        } catch (error) {
          console.error('❌ Error sending new alert:', error);
          throw error;
        }
      } else {
        console.error('❌ New hospital not found:', newHospitalId);
      }
    } else {
      console.error('❌ No existing alert found for patient:', patientId);
      console.error('Available alerts with statuses:', alerts.map(a => `${a.id} (${a.status}) - Patient: ${a.patient.id}`));
    }
  };

  const markHospitalUnavailable = async (alertId: string, hospitalId: string, reason: string) => {
    const alert = alerts.find((a) => a.id === alertId);
    if (!alert) return;

    const hospital = hospitals.find((h) => h.id === hospitalId);
    const newLog: AuditLog = {
      timestamp: new Date().toISOString(),
      action: 'Hospital marked unavailable',
      actor: hospital?.name || hospitalId,
      details: reason,
    };

    const updatedAuditLog = [...alert.auditLog, newLog];

    type AlertUpdate = {
      audit_log?: any;
    };

    const { error } = await supabase
      .from('alerts')
      .update({
        audit_log: updatedAuditLog as unknown as Json
      } as AlertUpdate)
      .eq('id', alertId);

    if (error) {
      console.error('Error marking hospital unavailable:', error);
      throw error;
    }
  };

  const login = async (usernameOrEmail: string, password: string) => {
    // Map username to email if needed
    const email = usernameOrEmail.includes('@') 
      ? usernameOrEmail 
      : `${usernameOrEmail.toLowerCase()}@internal.example`;

    const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
      email,
      password
    });

    if (authError) {
      throw authError;
    }

    if (!authData.user) {
      throw new Error('Login failed');
    }

    // Get user info from app_users table
    const { data: appUser, error: appUserError } = await supabase
      .from('app_users')
      .select('*')
      .eq('auth_uid', authData.user.id)
      .single();

    if (appUserError || !appUser) {
      console.error('Error loading user info:', appUserError);
      throw new Error('User not found');
    }

    setCurrentUser({
      id: authData.user.id,
      username: appUser.username,
      role: appUser.role,
      linkedEntity: appUser.linked_entity
    });

    if (appUser.role === 'hospital') {
      setCurrentHospitalId(appUser.linked_entity);
    } else if (appUser.role === 'ambulance') {
      setCurrentAmbulanceId(appUser.linked_entity);
    }
  };

  const addHospital = async (hospital: Hospital) => {
    const { error } = await supabase.from('hospitals').insert({
      id: hospital.id,
      name: hospital.name,
      distance: hospital.distance,
      latitude: hospital.latitude,
      longitude: hospital.longitude,
      address: hospital.address,
      contact: hospital.contact,
      equipment: hospital.equipment || [],
      specialties: hospital.specialties || []
    });

    if (error) {
      console.error('Error adding hospital:', error);
      throw error;
    }

    setHospitals((prev) => [...prev, hospital]);
  };

  const logout = async () => {
    await supabase.auth.signOut();
    setCurrentUser(null);
    setCurrentHospitalId(null);
    setCurrentAmbulanceId(null);
    if (alertsChannel) {
      alertsChannel.unsubscribe();
    }
  };

  const value = useMemo(() => ({
    patients,
    alerts,
    hospitals,
    currentUser,
    currentHospitalId,
    currentAmbulanceId,
    addPatient,
    updatePatient,
    sendAlert,
    updateAlertStatus,
    completeCase,
    changeHospital,
    markHospitalUnavailable,
    addHospital,
    login,
    logout,
    isLoading
  }), [
    patients, alerts, hospitals, currentUser, 
    currentHospitalId, currentAmbulanceId, isLoading,
    /* Since we're not wrapping functions in useCallback yet, this will still update when functions are recreated,
       but it's a step toward memoization. To fully memoize, we would wrap all functions above in useCallback. */
  ]);

  return (
    <AppContext.Provider value={value}>
      {children}
    </AppContext.Provider>
  );
};

export const useApp = () => {
  const context = useContext(AppContext);
  if (context === undefined) {
    throw new Error('useApp must be used within an AppProvider');
  }
  return context;
};
