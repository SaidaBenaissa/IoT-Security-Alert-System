// src/supabase.ts
import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

// Fonction pour logger les événements
export const logEvent = async (type: string, details: any, userId?: string) => {
  try {
    const timestamp = new Date().toISOString();
    const logEntry = {
      timestamp,
      type,
      userId: userId || 'system',
      details: JSON.stringify(details),
      userAgent: navigator.userAgent,
      url: window.location.href
    };

    // Créer le nom du fichier avec date
    const date = new Date();
    const dateStr = date.toISOString().split('T')[0]; // YYYY-MM-DD
    const fileName = `${dateStr}/log_${Date.now()}.json`;
    
    // Stocker dans Supabase Storage
    const { data, error } = await supabase.storage
      .from('logs')
      .upload(fileName, JSON.stringify(logEntry, null, 2), {
        contentType: 'application/json',
        upsert: false
      });

    if (error) {
      console.error('Erreur stockage log:', error);
      // Fallback: stocker dans la console
      console.log('LOG EVENT:', logEntry);
    } else {
      console.log('Log sauvegardé:', fileName);
    }
  } catch (error) {
    console.error('Erreur logging:', error);
  }
};