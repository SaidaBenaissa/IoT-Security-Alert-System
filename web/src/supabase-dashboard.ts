// src/supabase-dashboard.ts
import { supabase } from './supabase';

export interface Reading {
  id: number;
  device_id: string;
  ts: number;
  gas_value: number;
  fire_value: number;
  humidity_value: number;
  keypad_status: string | null;
}

export interface DeviceStatus {
  device_id: string;
  last_seen: number;
  system_armed: boolean;
  led_red: boolean;
  led_green: boolean;
  buzzer: boolean;
}

export interface Event {
  id: number;
  device_id: string;
  ts: number;
  type: string;
  value: string;
}

export const dashboardService = {
  // Récupérer les dernières lectures (pour les jauges)
  async getLatestReadings(deviceId: string): Promise<Reading | null> {
    try {
      const { data, error } = await supabase
        .from('readings')
        .select('*')
        .eq('device_id', deviceId)
        .order('ts', { ascending: false })
        .limit(1)
        .single();

      if (error) {
        console.error('Error fetching latest readings:', error);
        return null;
      }
      return data;
    } catch (error) {
      console.error('Exception in getLatestReadings:', error);
      return null;
    }
  },

  // Récupérer le statut actuel du device
  async getDeviceStatus(deviceId: string): Promise<DeviceStatus | null> {
    try {
      const { data, error } = await supabase
        .from('device_status')
        .select('*')
        .eq('device_id', deviceId)
        .single();

      if (error) {
        console.error('Error fetching device status:', error);
        return null;
      }
      return data;
    } catch (error) {
      console.error('Exception in getDeviceStatus:', error);
      return null;
    }
  },

  // Récupérer l'historique des lectures pour les graphiques
  async getHistoricalReadings(deviceId: string, hours: number = 24): Promise<Reading[]> {
    try {
      const since = Date.now() - (hours * 60 * 60 * 1000);
      
      const { data, error } = await supabase
        .from('readings')
        .select('*')
        .eq('device_id', deviceId)
        .gte('ts', since)
        .order('ts', { ascending: true });

      if (error) {
        console.error('Error fetching historical readings:', error);
        return [];
      }
      return data || [];
    } catch (error) {
      console.error('Exception in getHistoricalReadings:', error);
      return [];
    }
  },

  // Récupérer les événements récents
  async getRecentEvents(deviceId: string, limit: number = 10): Promise<Event[]> {
    try {
      const { data, error } = await supabase
        .from('events')
        .select('*')
        .eq('device_id', deviceId)
        .order('ts', { ascending: false })
        .limit(limit);

      if (error) {
        console.error('Error fetching events:', error);
        return [];
      }
      return data || [];
    } catch (error) {
      console.error('Exception in getRecentEvents:', error);
      return [];
    }
  },

  // Récupérer tous les événements pour l'historique
  async getAllEvents(deviceId: string): Promise<Event[]> {
    try {
      const { data, error } = await supabase
        .from('events')
        .select('*')
        .eq('device_id', deviceId)
        .order('ts', { ascending: false });

      if (error) {
        console.error('Error fetching all events:', error);
        return [];
      }
      return data || [];
    } catch (error) {
      console.error('Exception in getAllEvents:', error);
      return [];
    }
  },

  // NOUVELLE FONCTION : Récupérer tous les readings pour l'historique
  async getAllReadings(deviceId: string): Promise<Reading[]> {
    try {
      const { data, error } = await supabase
        .from('readings')
        .select('*')
        .eq('device_id', deviceId)
        .order('ts', { ascending: false });

      if (error) {
        console.error('Error fetching all readings:', error);
        return [];
      }
      return data || [];
    } catch (error) {
      console.error('Exception in getAllReadings:', error);
      return [];
    }
  },

  // Helper pour formater le type d'événement
  formatEventType(type: string): string {
    const types: Record<string, string> = {
      'keypad': 'Accès RFID',
      'gas': 'Gaz',
      'fire': 'Feu',
      'system': 'Système',
      'humidity': 'Humidité'
    };
    return types[type] || type;
  },

  // Helper pour déterminer le statut d'un événement
  getEventStatus(type: string, value: string): string {
    if (type === 'keypad') {
      return value.includes('granted') ? 'Accepté' : 'Refusé';
    }
    if (type === 'gas' && parseInt(value) > 70) return 'Alerte';
    if (type === 'fire' && parseInt(value) > 40) return 'Urgent';
    if (type === 'system') return 'Normal';
    return 'Normal';
  },

  // Helper pour déterminer l'action
  getEventAction(type: string): string {
    const actions: Record<string, string> = {
      'keypad': 'Accès vérifié',
      'gas': 'Alerte envoyée',
      'fire': 'Alerte envoyée',
      'system': 'État modifié',
      'humidity': 'Mesure enregistrée'
    };
    return actions[type] || 'Événement enregistré';
  },

  // NOUVEAU : Vérifier si le device existe
  async checkDeviceExists(deviceId: string): Promise<boolean> {
    try {
      const { data, error } = await supabase
        .from('devices')
        .select('id')
        .eq('id', deviceId)
        .single();

      if (error) {
        console.error('Error checking device existence:', error);
        return false;
      }
      return !!data;
    } catch (error) {
      console.error('Exception in checkDeviceExists:', error);
      return false;
    }
  },

  // NOUVEAU : Envoyer une commande de contrôle
  async sendControlCommand(deviceId: string, command: string, value: boolean): Promise<boolean> {
    try {
      const updateData: Partial<DeviceStatus> = {};

      switch (command) {
        case 'led_green':
          updateData.led_green = value;
          break;
        case 'led_red':
          updateData.led_red = value;
          break;
        case 'buzzer':
          updateData.buzzer = value;
          break;
        case 'system_armed':
          updateData.system_armed = value;
          break;
        default:
          console.error('Unknown command:', command);
          return false;
      }

      const { error } = await supabase
        .from('device_status')
        .update(updateData)
        .eq('device_id', deviceId);

      if (error) {
        console.error('Error sending control command:', error);
        return false;
      }

      // Enregistrer l'événement
      await supabase
        .from('events')
        .insert({
          device_id: deviceId,
          ts: Date.now(),
          type: 'system',
          value: `${command}:${value ? 'on' : 'off'}`
        });

      return true;
    } catch (error) {
      console.error('Exception in sendControlCommand:', error);
      return false;
    }
  }
};