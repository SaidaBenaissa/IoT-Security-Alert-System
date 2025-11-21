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
  
  try {
    // Vérifier dans la base de données si le MFA est valide pour cette session
    const { data, error } = await supabase
      .from('mfa_state')
      .select('state, updated_at')
      .eq('uid', uid)
      .single();
    
    if (error || !data) {
      console.log('❌ No valid MFA state found');
      return false;
    }
    
    // Vérifier si le MFA a été validé pour cette session
    // On considère le MFA valide seulement si :
    // 1. Le state est "ok"
    // 2. Et il a été mis à jour après le début de la session
    const mfaUpdated = new Date(data.updated_at).getTime();
    const sessionStart = session * 1000; // Convertir en millisecondes
    
    const isValid = data.state === 'ok' && mfaUpdated > sessionStart;
    console.log('📊 MFA validation result:', { isValid, mfaUpdated, sessionStart });
    
    return isValid;
    
  } catch (e) {
    console.error('❌ MFA check exception:', e);
    return false;
  }
}

// Logger la connexion 
export async function touchLastLogin(uid: string, email?: string) {
  console.log(' User logged in:', { uid, email });
  //  logger les connexions dans une table séparée
  // await supabase.from('login_logs').insert({ uid, email, timestamp: Date.now() });
}