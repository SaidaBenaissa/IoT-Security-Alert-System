// src/db.ts
import { supabase } from './supabase';

// Vérifier si l'utilisateur est administrateur
export async function isAdmin(uid: string): Promise<boolean> {
  try {
    const { data, error } = await supabase
      .from('admins')
      .select('uid')
      .eq('uid', uid)
      .single();
    
    if (error) {
      console.error('❌ isAdmin error:', error);
      return false;
    }
    
    const isAdminUser = data !== null;
    console.log('🔐 Admin check:', { uid, isAdmin: isAdminUser });
    return isAdminUser;
    
  } catch (e) {
    console.error('❌ isAdmin exception:', e);
    return false;
  }
}

// Vérifier si le MFA est valide pour cette session
export async function isMfaOk(uid: string, session: number): Promise<boolean> {
  console.log('🔐 Checking MFA status:', { uid, session });
  
  // 🔥 TOUJOURS retourner false pour forcer le MFA à chaque connexion
  console.log('🚫 MFA forced for every login');
  return false;
  

}

// Logger la connexion
export async function touchLastLogin(uid: string, email?: string) {
  console.log(' User logged in:', { uid, email });
  //  logger les connexions dans une table séparée
  // You can implement logging to Firebase if needed
}
