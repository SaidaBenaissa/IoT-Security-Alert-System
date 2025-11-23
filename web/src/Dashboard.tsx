// src/Dashboard.tsx
import React, { useState, useEffect } from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { 
  Activity, Wifi, WifiOff, AlertTriangle, CheckCircle, Flame, Wind, 
  Droplets, Key, Shield, Bell, Clock, LayoutDashboard, History, 
  Search, Download, Filter, Calendar, LogOut, User, RefreshCw,
  ChevronLeft, ChevronRight, Settings
} from 'lucide-react';
import { dashboardService, Reading } from './supabase-dashboard';
import { signOut, onAuthStateChanged } from 'firebase/auth';
import { auth } from './firebase';
import { supabase } from './supabase';

// Configuration OPTIMISÉE pour IoT Sécurité
const DEVICE_ID = 'esp32-home-01';
const POLLING_INTERVAL = 5000; // 5 secondes
const ITEMS_PER_PAGE = 10;

const Dashboard = () => {
  const [activeTab, setActiveTab] = useState('dashboard');
  const [historicalData, setHistoricalData] = useState<any[]>([]);
  const [events, setEvents] = useState<any[]>([]);
  const [historicalRecords, setHistoricalRecords] = useState<any[]>([]);
  const [filteredRecords, setFilteredRecords] = useState<any[]>([]);
  const [period, setPeriod] = useState('24h');
  const [isConnected, setIsConnected] = useState(true);
  const [loading, setLoading] = useState(true);
  const [userEmail, setUserEmail] = useState<string>('');
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [lastUpdate, setLastUpdate] = useState<string>('');
  const [autoRefreshEnabled, setAutoRefreshEnabled] = useState(true);
  
  // Filtres pour l'historique
  const [searchTerm, setSearchTerm] = useState('');
  const [filterType, setFilterType] = useState('all');
  const [filterDate, setFilterDate] = useState('');
  
  // Pagination
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);

  // État actuel du système
  const [currentState, setCurrentState] = useState({
    gas_value: 0,
    fire_value: 0,
    humidity_value: 0,
    keypad_status: 'Aucun',
    system_armed: false,
    led_red: false,
    led_green: false,
    buzzer: false,
    last_seen: 'Chargement...',
    device_name: 'ESP32 Home 01',
    alert_level: 'Normal'
  });

  // État local pour les contrôles (uniquement pour l'UI)
  const [controlState, setControlState] = useState({
    led_green: false,
    led_red: false,
    buzzer: false,
    system_armed: false
  });

  // Vérifier l'état d'authentification au chargement
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      if (user) {
        console.log('✅ User is authenticated:', user.email);
        setUserEmail(user.email || '');
        loadAllData();
      } else {
        console.log('❌ User is not authenticated');
        window.location.href = '/login';
      }
    });

    return () => unsubscribe();
  }, []);

  // 🔄 ACTUALISATION AUTOMATIQUE TOUTES LES 5 SECONDES - CORRIGÉE
  useEffect(() => {
    let interval: NodeJS.Timeout;
    
    const autoRefreshData = async () => {
      try {
        console.log('⏰ Auto-refresh triggered');
        
        // TOUJOURS recharger les données temps réel
        await loadRealtimeData();
        
        // Recharger les données selon l'onglet actif
        if (activeTab === 'dashboard') {
          await Promise.all([
            loadHistoricalData(), // Pour le graphique
            loadEvents()          // Pour les événements récents
          ]);
        } else {
          await loadHistoricalRecords(); // Pour le tableau d'historique
        }
        
        // 🔥 CORRECTION: Mettre à jour lastUpdate APRÈS le chargement complet
        setLastUpdate(new Date().toLocaleTimeString('fr-FR'));
        console.log('✅ Auto-refresh completed');
        
      } catch (error) {
        console.error('❌ Error in auto-refresh:', error);
      }
    };
    
    if (userEmail && autoRefreshEnabled) {
      console.log(`🔄 Starting automatic security monitoring every ${POLLING_INTERVAL/1000} seconds`);
      
      // Premier chargement immédiat
      autoRefreshData();
      
      // Puis toutes les 5 secondes
      interval = setInterval(autoRefreshData, POLLING_INTERVAL);
    }
    
    return () => {
      if (interval) {
        console.log('🛑 Stopping automatic refresh');
        clearInterval(interval);
      }
    };
  }, [userEmail, autoRefreshEnabled, activeTab]);

  // Fonction de déconnexion
  const handleLogout = async () => {
    try {
      await signOut(auth);
      console.log('✅ Utilisateur déconnecté');
    } catch (error) {
      console.error('❌ Erreur lors de la déconnexion:', error);
    }
  };

  // Charger toutes les données
  const loadAllData = async () => {
    setLoading(true);
    try {
      console.log('🚀 Starting to load ALL data from Supabase...');
      
      await Promise.all([
        loadRealtimeData(),
        loadHistoricalData(),
        loadEvents(),
        loadHistoricalRecords()
      ]);
      
      console.log('✅ All data loaded successfully from Supabase');
      setLastUpdate(new Date().toLocaleTimeString('fr-FR'));
    } catch (error) {
      console.error('❌ Error loading dashboard data:', error);
    } finally {
      setLoading(false);
    }
  };

  // Formater le timestamp
  const formatTimestamp = (timestamp: any) => {
    if (!timestamp) return 'Jamais';
    
    let date;
    if (typeof timestamp === 'number') {
      date = timestamp < 1000000000000 ? new Date(timestamp * 1000) : new Date(timestamp);
    } else {
      date = new Date(timestamp);
    }
    
    return date.toLocaleString('fr-FR');
  };

  // Créer le device s'il n'existe pas
  const createDeviceIfNotExists = async () => {
    try {
      console.log('📝 Creating device in database...');
      
      const { data, error } = await supabase
        .from('devices')
        .insert([
          {
            id: DEVICE_ID,
            label: 'ESP32 Home 01',
            created_at: Math.floor(Date.now() / 1000)
          }
        ])
        .select();

      if (error) {
        console.error('❌ Error creating device:', error);
        return false;
      }

      console.log('✅ Device created successfully:', data);
      return true;
    } catch (error) {
      console.error('❌ Exception creating device:', error);
      return false;
    }
  };

  // Charger les données temps réel - CORRIGÉ pour le statut de connexion
  const loadRealtimeData = async () => {
    try {
      console.log('🔄 Loading realtime data from Supabase...');
      
      const deviceExists = await dashboardService.checkDeviceExists(DEVICE_ID);
      if (!deviceExists) {
        console.error(`❌ Device ${DEVICE_ID} not found in database`);
        setIsConnected(false);
        await createDeviceIfNotExists();
        return;
      }

      // Récupérer les DERNIÈRES readings pour chaque capteur
      const latestReadings = await dashboardService.getLatestReadings(DEVICE_ID);
      const deviceStatus = await dashboardService.getDeviceStatus(DEVICE_ID);

      console.log('📊 Latest readings from Supabase:', latestReadings);
      console.log('📱 Device status from Supabase:', deviceStatus);

      // Mettre à jour l'état avec les DERNIÈRES valeurs de Supabase
      setCurrentState(prev => {
        const newState = { ...prev };
        
        // Utiliser les DERNIÈRES readings de la base
        if (latestReadings) {
          newState.gas_value = latestReadings.gas_value !== null ? latestReadings.gas_value : 0;
          newState.fire_value = latestReadings.fire_value !== null ? latestReadings.fire_value : 0;
          newState.humidity_value = latestReadings.humidity_value !== null ? latestReadings.humidity_value : 0;
          newState.keypad_status = latestReadings.keypad_status || 'Aucun';
          newState.last_seen = formatTimestamp(latestReadings.ts);
          newState.alert_level = calculateAlertLevel(latestReadings);
        } else {
          newState.gas_value = 0;
          newState.fire_value = 0;
          newState.humidity_value = 0;
          newState.keypad_status = 'Aucun';
          newState.alert_level = 'Normal';
        }

        // Mettre à jour avec le statut du device
        if (deviceStatus) {
          newState.system_armed = deviceStatus.system_armed !== null ? deviceStatus.system_armed : false;
          newState.led_red = deviceStatus.led_red !== null ? deviceStatus.led_red : false;
          newState.led_green = deviceStatus.led_green !== null ? deviceStatus.led_green : false;
          newState.buzzer = deviceStatus.buzzer !== null ? deviceStatus.buzzer : false;
          
          const deviceStatusTime = formatTimestamp(deviceStatus.last_seen);
          if (deviceStatusTime !== 'Jamais') {
            newState.last_seen = deviceStatusTime;
          }
        }

        console.log('🎯 Updated current state with LATEST Supabase data:', newState);
        return newState;
      });

      // Synchroniser l'état des contrôles avec l'état actuel
      if (deviceStatus) {
        setControlState({
          led_green: deviceStatus.led_green !== null ? deviceStatus.led_green : false,
          led_red: deviceStatus.led_red !== null ? deviceStatus.led_red : false,
          buzzer: deviceStatus.buzzer !== null ? deviceStatus.buzzer : false,
          system_armed: deviceStatus.system_armed !== null ? deviceStatus.system_armed : false
        });
      }

      // 🔥 CORRECTION: Vérifier la connexion basée sur les données les plus récentes
      let lastSeenMs: number;
      
      // Priorité 1: Utiliser le timestamp de la dernière reading
      if (latestReadings && latestReadings.ts) {
        lastSeenMs = latestReadings.ts < 1000000000000 ? latestReadings.ts * 1000 : latestReadings.ts;
      }
      // Priorité 2: Utiliser le device_status
      else if (deviceStatus && deviceStatus.last_seen) {
        lastSeenMs = deviceStatus.last_seen < 1000000000000 ? deviceStatus.last_seen * 1000 : deviceStatus.last_seen;
      }
      // Priorité 3: Utiliser l'heure actuelle (données fraîches)
      else {
        lastSeenMs = Date.now();
      }

      const now = Date.now();
      const oneMinuteAgo = now - (1 * 60 * 1000); // 🔥 Changé de 5 minutes à 1 minute
      const isDeviceConnected = lastSeenMs > oneMinuteAgo;
      
      setIsConnected(isDeviceConnected);
      console.log(`📡 Connection status: ${isDeviceConnected ? 'Connected' : 'Disconnected'}, Last seen: ${new Date(lastSeenMs).toLocaleString()}, Threshold: 1 minute`);
      
    } catch (error) {
      console.error('❌ Error loading realtime data from Supabase:', error);
      setIsConnected(false);
    }
  };

  // Charger les données historiques pour les graphiques - CORRIGÉ POUR L'ORDRE INVERSE (plus récent → plus ancien)
  const loadHistoricalData = async () => {
    try {
      const hours = period === '24h' ? 24 : period === '7d' ? 168 : 720;
      
      console.log(`🔍 Fetching historical data from Supabase for ${hours} hours`);
      
      const readings = await dashboardService.getHistoricalReadings(DEVICE_ID, hours);
      
      console.log(`✅ Raw historical readings from Supabase: ${readings.length} records`);
      
      // 🔥 CORRECTION: Trier par timestamp DESCENDANT pour le graphique (plus récent → plus ancien)
      const sortedReadings = [...readings].sort((a, b) => b.ts - a.ts);
      
      const formattedData = sortedReadings.map(reading => {
        const timestamp = reading.ts < 1000000000000 ? reading.ts * 1000 : reading.ts;
        const date = new Date(timestamp);
        
        // Format d'affichage selon la période
        let displayTime;
        if (hours <= 24) {
          // Pour 24h: afficher seulement l'heure
          displayTime = date.toLocaleTimeString('fr-FR', { 
            hour: '2-digit', 
            minute: '2-digit'
          });
        } else {
          // Pour plus de 24h: afficher date + heure
          displayTime = date.toLocaleString('fr-FR', { 
            day: '2-digit',
            month: '2-digit',
            hour: '2-digit', 
            minute: '2-digit'
          });
        }
        
        return {
          timestamp: displayTime,
          fullTimestamp: timestamp,
          // 🔥 MODIFICATION: Conserver les valeurs NULL pour le traitement binaire
          gas_value: reading.gas_value,
          fire_value: reading.fire_value,
          humidity_value: reading.humidity_value,
        };
      });
      
      console.log('📈 Formatted chart data from Supabase (sorted DESC - plus récent → plus ancien):', formattedData);
      
      setHistoricalData(formattedData);
    } catch (error) {
      console.error('❌ Error loading historical data from Supabase:', error);
    }
  };

  // Charger les événements récents
  const loadEvents = async () => {
    try {
      console.log('📋 Loading recent events from Supabase...');
      
      const eventsData = await dashboardService.getRecentEvents(DEVICE_ID, 5);
      console.log('📋 Raw events data from Supabase:', eventsData);
      
      if (eventsData.length === 0) {
        console.log('ℹ️ No events found in Supabase');
        setEvents([]);
        return;
      }
      
      const formattedEvents = eventsData.map(event => {
        const timestamp = event.ts < 1000000000000 ? event.ts * 1000 : event.ts;
        return {
          id: event.id,
          time: new Date(timestamp).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }),
          date: new Date(timestamp).toLocaleDateString('fr-FR'),
          type: dashboardService.formatEventType(event.type),
          status: formatEventStatus(event.type, event.value),
          value: formatEventValue(event.type, event.value),
          rawType: event.type
        };
      });
      
      console.log('📋 Formatted events from Supabase:', formattedEvents);
      setEvents(formattedEvents);
    } catch (error) {
      console.error('❌ Error loading events from Supabase:', error);
      setEvents([]);
    }
  };

  // NOUVELLE FONCTION: Formater la valeur des événements
  const formatEventValue = (type: string, value: string): string => {
    switch (type) {
      case 'keypad':
        if (value.includes('granted')) {
          return 'Accès autorisé';
        } else if (value.includes('denied')) {
          return 'Accès refusé';
        }
        return value;
      
      case 'gas':
        return `Niveau de gaz: ${value} ppm`;
      
      case 'fire':
        return `Température: ${value}°C`;
      
      case 'system':
        if (value.includes('armed')) return 'Système armé';
        if (value.includes('disarmed')) return 'Système désarmé';
        return `État: ${value}`;
      
      case 'motion':
        return `Mouvement détecté - ${value}`;
      
      default:
        return value;
    }
  };

  // Charger tous les événements pour l'historique
  const loadHistoricalRecords = async () => {
    try {
      console.log('📚 Loading all historical records from Supabase...');
      
      const [eventsData, readingsData] = await Promise.all([
        dashboardService.getAllEvents(DEVICE_ID),
        dashboardService.getAllReadings(DEVICE_ID)
      ]);

      console.log(`📚 Historical events from Supabase: ${eventsData.length} records`);
      console.log(`📊 Historical readings from Supabase: ${readingsData.length} records`);

      const formattedEvents = eventsData.map(event => {
        const timestamp = event.ts < 1000000000000 ? event.ts * 1000 : event.ts;
        return {
          id: `event_${event.id}`,
          date: new Date(timestamp).toLocaleDateString('fr-FR'),
          time: new Date(timestamp).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }),
          type: dashboardService.formatEventType(event.type),
          value: formatEventValue(event.type, event.value),
          status: formatEventStatus(event.type, event.value),
          action: getEventAction(event.type, event.value),
          timestamp: timestamp
        };
      });

      const formattedReadings = readingsData.map(reading => {
        const timestamp = reading.ts < 1000000000000 ? reading.ts * 1000 : reading.ts;
        return {
          id: `reading_${reading.id}`,
          date: new Date(timestamp).toLocaleDateString('fr-FR'),
          time: new Date(timestamp).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }),
          type: 'Lecture Capteur',
          value: `Gaz: ${reading.gas_value !== null ? reading.gas_value : 0}ppm, Feu: ${reading.fire_value !== null ? reading.fire_value : 0}°C, Humidité: ${reading.humidity_value !== null ? reading.humidity_value : 0}%, RFID: ${reading.keypad_status || 'N/A'}`,
          status: '📊 Mesure',
          action: 'Enregistrement',
          timestamp: timestamp
        };
      });

      const allRecords = [...formattedEvents, ...formattedReadings]
        .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

      console.log(`📋 Total historical records from Supabase: ${allRecords.length}`);
      setHistoricalRecords(allRecords);
      setFilteredRecords(allRecords);
      updatePagination(allRecords);
    } catch (error) {
      console.error('❌ Error loading historical records from Supabase:', error);
    }
  };

  // Fonction de rafraîchissement manuel COMPLÈTE - CORRIGÉE
  const handleManualRefresh = async () => {
    setIsRefreshing(true);
    try {
      console.log('🔄 Manual refresh started...');
      
      // Recharger TOUTES les données selon l'onglet actif
      if (activeTab === 'dashboard') {
        await Promise.all([
          loadRealtimeData(), // 🔥 TOUJOURS recharger les données temps réel
          loadHistoricalData(),
          loadEvents()
        ]);
      } else {
        await Promise.all([
          loadRealtimeData(), // 🔥 TOUJOURS recharger les données temps réel
          loadHistoricalRecords(),
          loadEvents()
        ]);
      }
      
      setLastUpdate(new Date().toLocaleTimeString('fr-FR'));
      console.log('✅ Manual refresh completed - ALL data updated');
    } catch (error) {
      console.error('❌ Error during manual refresh:', error);
    } finally {
      setIsRefreshing(false);
    }
  };

  // Toggle auto-refresh
  const toggleAutoRefresh = () => {
    setAutoRefreshEnabled(!autoRefreshEnabled);
    console.log(`🔄 Auto-refresh ${!autoRefreshEnabled ? 'enabled' : 'disabled'}`);
  };

  // Mettre à jour la pagination
  const updatePagination = (records: any[]) => {
    const total = Math.ceil(records.length / ITEMS_PER_PAGE);
    setTotalPages(total);
    setCurrentPage(1);
  };

  // Obtenir les données de la page actuelle
  const getCurrentPageData = () => {
    const startIndex = (currentPage - 1) * ITEMS_PER_PAGE;
    const endIndex = startIndex + ITEMS_PER_PAGE;
    return filteredRecords.slice(startIndex, endIndex);
  };

  // Helper pour calculer le niveau d'alerte
  const calculateAlertLevel = (reading: Reading): string => {
    const gasValue = reading.gas_value !== null ? reading.gas_value : 0;
    const fireValue = reading.fire_value !== null ? reading.fire_value : 0;
    
    if (gasValue > 80 || fireValue > 60) return 'Urgent';
    if (gasValue > 60 || fireValue > 40) return 'Alerte';
    return 'Normal';
  };

  // Formater le statut de l'événement
  const formatEventStatus = (type: string, value: string): string => {
    if (type === 'keypad') {
      return value.includes('granted') ? '✅ Accepté' : '❌ Refusé';
    }
    if (type === 'gas') {
      const gasLevel = parseInt(value);
      return gasLevel > 60 ? '⚠️ Alerte Gaz' : '📊 Normal';
    }
    if (type === 'fire') {
      const fireLevel = parseInt(value);
      return fireLevel > 40 ? '🔥 Alerte Feu' : '📊 Normal';
    }
    if (type === 'system') return '✅ Système';
    if (type === 'motion') return '🚨 Mouvement';
    return '📝 Enregistré';
  };

  // Obtenir l'action de l'événement
  const getEventAction = (type: string, value: string): string => {
    switch (type) {
      case 'keypad':
        return value.includes('granted') ? 'Accès autorisé' : 'Accès refusé';
      case 'gas':
        return 'Détection de gaz';
      case 'fire':
        return 'Détection de feu';
      case 'system':
        return 'Changement état système';
      case 'motion':
        return 'Détection mouvement';
      default:
        return 'Événement système';
    }
  };

  // Recharger les données historiques quand la période change
  useEffect(() => {
    if (activeTab === 'dashboard') {
      loadHistoricalData();
    }
  }, [period]);

  // Filtrage de l'historique
  useEffect(() => {
    let filtered = historicalRecords;
    
    if (searchTerm) {
      filtered = filtered.filter(record => 
        record.type.toLowerCase().includes(searchTerm.toLowerCase()) ||
        record.value.toLowerCase().includes(searchTerm.toLowerCase()) ||
        record.status.toLowerCase().includes(searchTerm.toLowerCase())
      );
    }
    
    if (filterType !== 'all') {
      filtered = filtered.filter(record => {
        if (filterType === 'Gaz') return record.type.includes('Gaz') || record.value.includes('Gaz:');
        if (filterType === 'Feu') return record.type.includes('Feu') || record.value.includes('Feu:');
        if (filterType === 'Humidité') return record.type.includes('Humidité') || record.value.includes('Humidité:');
        if (filterType === 'Accès RFID') return record.type.includes('RFID') || record.value.includes('RFID:');
        if (filterType === 'Système') return record.type.includes('Système');
        return true;
      });
    }
    
    if (filterDate) {
      filtered = filtered.filter(record => record.date === new Date(filterDate).toLocaleDateString('fr-FR'));
    }
    
    setFilteredRecords(filtered);
    updatePagination(filtered);
  }, [searchTerm, filterType, filterDate, historicalRecords]);

  // Navigation des pages
  const goToNextPage = () => {
    if (currentPage < totalPages) {
      setCurrentPage(currentPage + 1);
    }
  };

  const goToPrevPage = () => {
    if (currentPage > 1) {
      setCurrentPage(currentPage - 1);
    }
  };

  const goToPage = (page: number) => {
    setCurrentPage(page);
  };

  // Téléchargement CSV
  const downloadCSV = () => {
    const headers = ['ID', 'Date', 'Heure', 'Type', 'Valeur', 'Statut', 'Action'];
    const csvContent = [
      headers.join(','),
      ...filteredRecords.map(record => 
        [record.id, record.date, record.time, record.type, `"${record.value}"`, record.status, record.action].join(',')
      )
    ].join('\n');
    
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `historique_${DEVICE_ID}_${new Date().toISOString().split('T')[0]}.csv`;
    link.click();
  };

  // Fonction pour simuler l'envoi de commandes (design uniquement)
  const handleControlToggle = (command: string, value: boolean) => {
    console.log(`🎮 Simulation: Commande ${command} = ${value}`);
    setControlState(prev => ({
      ...prev,
      [command]: value
    }));
    
    // Afficher un message d'information
    alert(`Fonctionnalité de contrôle en mode simulation\nCommande: ${command}\nValeur: ${value ? 'ACTIVÉ' : 'DÉSACTIVÉ'}`);
  };

  const getAlertColor = (level: string) => {
    switch(level) {
      case 'Normal': return 'text-green-500';
      case 'Alerte': return 'text-yellow-500';
      case 'Urgent': return 'text-red-500';
      default: return 'text-gray-500';
    }
  };

  const getStatusBadge = (status: string) => {
    const colors: Record<string, string> = {
      'Normal': 'bg-green-100 text-green-700',
      'Alerte': 'bg-yellow-100 text-yellow-700',
      'Urgent': 'bg-red-100 text-red-700',
      'Accepté': 'bg-blue-100 text-blue-700',
      'Refusé': 'bg-gray-100 text-gray-700',
      '📊 Mesure': 'bg-purple-100 text-purple-700',
      '⚠️ Détecté': 'bg-orange-100 text-orange-700',
      '🔥 Détecté': 'bg-red-100 text-red-700',
      '✅ Activé': 'bg-green-100 text-green-700',
      '📝 Enregistré': 'bg-gray-100 text-gray-700',
      '✅ Système': 'bg-green-100 text-green-700',
      '🚨 Mouvement': 'bg-red-100 text-red-700',
      '⚠️ Alerte Gaz': 'bg-orange-100 text-orange-700',
      '🔥 Alerte Feu': 'bg-red-100 text-red-700'
    };
    return colors[status] || 'bg-gray-100 text-gray-700';
  };

  // 🔥 MODIFICATION: Nouvelle GaugeCard adaptée au mode binaire 0/1/NULL
  const BinaryGaugeCard = ({ 
    title, 
    value, 
    icon: Icon, 
    color 
  }: { 
    title: string; 
    value: number | null; 
    icon: any; 
    color: string; 
  }) => {
    const getDisplayValue = () => {
      if (value === null) return { text: 'Aucune donnée', status: '❓' };
      if (value === 1) return { text: 'Détecté', status: '⚠️' };
      if (value === 0) return { text: 'Normal', status: '✅' };
      return { text: 'Inconnu', status: '❓' };
    };

    const display = getDisplayValue();

    return (
      <div className="bg-white rounded-xl p-6 shadow-lg hover:shadow-xl transition-shadow">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className={`p-3 rounded-lg ${color} bg-opacity-10`}>
              <Icon className={color} size={24} />
            </div>
            <div>
              <h3 className="font-semibold text-gray-700">{title}</h3>
              <p className="text-sm text-gray-500 mt-1">État actuel</p>
            </div>
          </div>
          <div className="text-right">
            <span className="text-3xl font-bold text-gray-800 block">{display.status}</span>
            <span className={`text-sm font-medium ${
              value === 1 ? 'text-red-600' : 
              value === 0 ? 'text-green-600' : 
              'text-gray-500'
            }`}>
              {display.text}
            </span>
          </div>
        </div>
      </div>
    );
  };

  // 🔥 MODIFICATION: Composant pour les graphiques binaires séparés
  const BinarySensorChart = ({ 
    title, 
    dataKey, 
    color,
    icon: Icon
  }: {
    title: string;
    dataKey: string;
    color: string;
    icon: any;
  }) => {
    // Formater les données pour le graphique binaire avec gestion des NULL
    const chartData = historicalData.map(item => {
      const value = item[dataKey];
      
      // Pour l'affichage dans le graphique
      let displayValue: number | null = null;
      let tooltipValue = 'NULL / Aucune donnée';
      
      if (value === 1) {
        displayValue = 1;
        tooltipValue = 'Détecté (1)';
      } else if (value === 0) {
        displayValue = 0;
        tooltipValue = 'Normal (0)';
      }
      
      return {
        ...item,
        displayValue,
        tooltipValue
      };
    });

    const CustomTooltip = ({ active, payload, label }: any) => {
      if (active && payload && payload.length) {
        const data = payload[0].payload;
        return (
          <div className="bg-white p-3 border border-gray-300 rounded-lg shadow-lg">
            <p className="font-semibold text-gray-800">{label}</p>
            <p className={`font-medium ${
              data[dataKey] === 1 ? 'text-red-600' : 
              data[dataKey] === 0 ? 'text-green-600' : 
              'text-gray-500'
            }`}>
              {data.tooltipValue}
            </p>
          </div>
        );
      }
      return null;
    };

    return (
      <div className="bg-white rounded-2xl shadow-xl p-6">
        <div className="flex items-center gap-3 mb-4">
          <Icon className={color} size={24} />
          <h3 className="text-lg font-bold text-gray-800">{title}</h3>
        </div>
        <ResponsiveContainer width="100%" height={200}>
          <LineChart data={chartData}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
            <XAxis 
              dataKey="timestamp" 
              stroke="#666"
              tick={{ fontSize: 12 }}
            />
            <YAxis 
              stroke="#666"
              domain={[-0.2, 1.2]}
              ticks={[0, 1]}
              tickFormatter={(value) => value === 1 ? 'Détecté' : value === 0 ? 'Normal' : ''}
            />
            <Tooltip content={<CustomTooltip />} />
            <Line 
              type="stepAfter" 
              dataKey="displayValue" 
              stroke={color} 
              strokeWidth={3}
              dot={{ 
                r: 4, 
                stroke: color, 
                strokeWidth: 2, 
                fill: '#fff',
                fillOpacity: 1 
              }}
              connectNulls={false}
              name={title}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    );
  };

  const StatusCard = ({ title, status, icon: Icon }: { 
    title: string; 
    status: boolean; 
    icon: any; 
  }) => (
    <div className="bg-white rounded-xl p-4 shadow-lg flex items-center gap-4">
      <Icon className={status ? 'text-green-500' : 'text-gray-400'} size={28} />
      <div>
        <p className="text-sm text-gray-500">{title}</p>
        <p className={`font-semibold ${status ? 'text-green-600' : 'text-gray-600'}`}>
          {status ? 'Activé' : 'Désactivé'}
        </p>
      </div>
    </div>
  );

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500 mx-auto mb-4"></div>
          <p className="text-xl font-semibold text-gray-700">Chargement des données Supabase...</p>
          <p className="text-gray-500 mt-2">Connexion à la base de données en cours</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100">
      {/* Header */}
      <div className="bg-white shadow-lg sticky top-0 z-50">
        <div className="px-6 py-4">
          <div className="flex flex-wrap items-center justify-between gap-4 mb-4">
            <div className="flex items-center gap-4">
              <div className="p-4 bg-gradient-to-br from-blue-500 to-purple-600 rounded-xl">
                <Activity className="text-white" size={32} />
              </div>
              <div>
                <h1 className="text-3xl font-bold text-gray-800">{currentState.device_name}</h1>
                
                {/* Heure de dernière actualisation du dashboard */}
                <p className="text-gray-500 flex items-center gap-2 mt-1">
                  <Clock size={16} />
                  Dernière actualisation: {lastUpdate || new Date().toLocaleTimeString('fr-FR')}
                </p>
                
                <div className="flex items-center gap-2 mt-1">
                  <div className={`w-2 h-2 rounded-full ${autoRefreshEnabled ? 'bg-green-500 animate-pulse' : 'bg-gray-400'}`} />
                  <span className="text-xs text-gray-500">
                    Auto-refresh: {autoRefreshEnabled ? 'ACTIF (5s)' : 'INACTIF'}
                  </span>
                </div>
              </div>
            </div>
            
            <div className="flex items-center gap-4">
              {/* Informations utilisateur */}
              <div className="flex items-center gap-2 bg-gray-100 rounded-full px-4 py-2">
                <User size={16} className="text-gray-600" />
                <span className="text-sm text-gray-700 font-medium">{userEmail}</span>
              </div>
              
              {/* 🔥 CORRIGÉ: Statut de connexion basé sur 1 minute */}
              <div className="flex items-center gap-2">
                {isConnected ? (
                  <>
                    <Wifi className="text-green-500" size={24} />
                    <span className="font-semibold text-green-600">Connecté</span>
                  </>
                ) : (
                  <>
                    <WifiOff className="text-red-500" size={24} />
                    <span className="font-semibold text-red-600">Déconnecté</span>
                  </>
                )}
              </div>
              
              <div className={`px-4 py-2 rounded-full font-bold ${getAlertColor(currentState.alert_level)} bg-opacity-10 flex items-center gap-2`}>
                {currentState.alert_level === 'Normal' ? <CheckCircle size={18} /> : <AlertTriangle size={18} />}
                {currentState.alert_level}
              </div>

              {/* Bouton toggle auto-refresh */}
              <button
                onClick={toggleAutoRefresh}
                className={`flex items-center gap-2 px-3 py-2 rounded-lg transition-colors font-medium ${
                  autoRefreshEnabled 
                    ? 'bg-green-500 hover:bg-green-600 text-white' 
                    : 'bg-gray-300 hover:bg-gray-400 text-gray-700'
                }`}
              >
                <RefreshCw size={16} className={autoRefreshEnabled ? 'animate-spin' : ''} />
                {autoRefreshEnabled ? 'Auto ON' : 'Auto OFF'}
              </button>

              {/* BOUTON D'ACTUALISATION MANUELLE */}
              <button
                onClick={handleManualRefresh}
                disabled={isRefreshing}
                className="flex items-center gap-2 px-4 py-2 bg-blue-500 hover:bg-blue-600 text-white rounded-lg transition-colors font-medium disabled:opacity-50 shadow-md"
              >
                <RefreshCw size={18} className={isRefreshing ? 'animate-spin' : ''} />
                {isRefreshing ? 'Actualisation...' : 'Actualiser'}
              </button>

              {/* Bouton de déconnexion */}
              <button
                onClick={handleLogout}
                className="flex items-center gap-2 px-4 py-2 bg-red-500 hover:bg-red-600 text-white rounded-lg transition-colors font-medium shadow-md"
              >
                <LogOut size={18} />
                Déconnexion
              </button>
            </div>
          </div>

          {/* Navigation Tabs - AJOUT DE L'ONGLET CONTRÔLE */}
          <div className="flex gap-2 border-b border-gray-200">
            <button
              onClick={() => setActiveTab('dashboard')}
              className={`flex items-center gap-2 px-6 py-3 font-semibold transition-all ${
                activeTab === 'dashboard'
                  ? 'text-blue-600 border-b-2 border-blue-600'
                  : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              <LayoutDashboard size={20} />
              Dashboard
            </button>
            <button
              onClick={() => setActiveTab('controle')}
              className={`flex items-center gap-2 px-6 py-3 font-semibold transition-all ${
                activeTab === 'controle'
                  ? 'text-blue-600 border-b-2 border-blue-600'
                  : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              <Settings size={20} />
              Contrôle
            </button>
            <button
              onClick={() => setActiveTab('historique')}
              className={`flex items-center gap-2 px-6 py-3 font-semibold transition-all ${
                activeTab === 'historique'
                  ? 'text-blue-600 border-b-2 border-blue-600'
                  : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              <History size={20} />
              Historique
            </button>
          </div>
        </div>
      </div>

      <div className="p-6">
        {activeTab === 'dashboard' ? (
          <>
            {/* 🔥 MODIFICATION: Cartes de valeurs adaptées au mode binaire */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mb-6">
              <BinaryGaugeCard 
                title="Détection de Gaz" 
                value={currentState.gas_value} 
                icon={Wind}
                color="text-orange-500"
              />
              <BinaryGaugeCard 
                title="Détection de Feu" 
                value={currentState.fire_value} 
                icon={Flame}
                color="text-red-500"
              />
              <BinaryGaugeCard 
                title="Détection d'Humidité" 
                value={currentState.humidity_value} 
                icon={Droplets}
                color="text-blue-500"
              />
            </div>

            {/* État des actionneurs */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
              <StatusCard title="LED Verte" status={currentState.led_green} icon={CheckCircle} />
              <StatusCard title="LED Rouge" status={currentState.led_red} icon={AlertTriangle} />
              <StatusCard title="Buzzer" status={currentState.buzzer} icon={Bell} />
              <StatusCard title="Système Armé" status={currentState.system_armed} icon={Shield} />
            </div>

            {/* 🔥 MODIFICATION: Graphiques séparés pour chaque capteur binaire */}
            <div className="space-y-6 mb-6">
              <div className="flex items-center justify-between">
                <h2 className="text-xl font-bold text-gray-800">Évolution des Capteurs</h2>
                <select 
                  value={period} 
                  onChange={(e) => setPeriod(e.target.value)}
                  className="px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="24h">24 heures</option>
                  <option value="7d">7 jours</option>
                  <option value="30d">30 jours</option>
                </select>
              </div>
              
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                <BinarySensorChart 
                  title="Capteur Gaz" 
                  dataKey="gas_value" 
                  color="#f97316"
                  icon={Wind}
                />
                <BinarySensorChart 
                  title="Capteur Feu" 
                  dataKey="fire_value" 
                  color="#ef4444"
                  icon={Flame}
                />
                <BinarySensorChart 
                  title="Capteur Humidité" 
                  dataKey="humidity_value" 
                  color="#3b82f6"
                  icon={Droplets}
                />
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <div className="bg-white rounded-2xl shadow-xl p-6">
                <h2 className="text-xl font-bold text-gray-800 mb-4">Événements Récents</h2>
                <div className="space-y-3 max-h-[340px] overflow-y-auto">
                  {events.length > 0 ? (
                    events.map(event => (
                      <div key={event.id} className="flex items-center gap-4 p-4 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors">
                        <div className="flex-shrink-0 w-16 text-sm font-semibold text-gray-600">
                          {event.time}
                        </div>
                        <div className="flex-1">
                          <div className="font-semibold text-gray-800">{event.type}</div>
                          <div className="text-sm text-gray-600">{event.value}</div>
                        </div>
                        <div className="text-lg">{event.status}</div>
                      </div>
                    ))
                  ) : (
                    <div className="text-center py-8 text-gray-500">
                      Aucun événement récent dans Supabase
                    </div>
                  )}
                </div>
              </div>

              {/* Accès RFID */}
              <div className="bg-white rounded-2xl shadow-xl p-6">
                <div className="flex items-center gap-3 mb-4">
                  <Key className="text-purple-500" size={28} />
                  <h2 className="text-xl font-bold text-gray-800">Statut Accès RFID</h2>
                </div>
                <div className="flex items-center justify-between p-6 bg-gradient-to-r from-green-50 to-emerald-50 rounded-xl">
                  <div>
                    <p className="text-sm text-gray-600">Dernier accès</p>
                    <p className="text-2xl font-bold text-green-600">{currentState.keypad_status}</p>
                  </div>
                  <div className="text-6xl">
                    {currentState.keypad_status === 'access_granted' ? '✅' : 
                     currentState.keypad_status === 'access_denied' ? '❌' : '➖'}
                  </div>
                </div>
              </div>
            </div>
          </>
        ) : activeTab === 'controle' ? (
          /* VUE CONTRÔLE (inchangée) */
          <div className="space-y-6">
            <div className="bg-white rounded-2xl shadow-xl p-6">
              <div className="flex items-center gap-3 mb-6">
                <Settings className="text-blue-500" size={28} />
                <h2 className="text-xl font-bold text-gray-800">Contrôle à Distance</h2>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                {/* Contrôle LED Verte */}
                <div className="bg-gradient-to-br from-green-50 to-emerald-50 rounded-xl p-6 border border-green-200">
                  <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-3">
                      <div className="p-3 bg-green-100 rounded-lg">
                        <CheckCircle className="text-green-600" size={24} />
                      </div>
                      <div>
                        <h3 className="font-semibold text-gray-800">LED Verte</h3>
                        <p className="text-sm text-gray-600">Indicateur normal</p>
                      </div>
                    </div>
                    <div className={`w-12 h-6 rounded-full transition-colors ${controlState.led_green ? 'bg-green-500' : 'bg-gray-300'}`}>
                      <div className={`w-5 h-5 bg-white rounded-full transition-transform ${controlState.led_green ? 'translate-x-6' : 'translate-x-1'} mt-0.5`}></div>
                    </div>
                  </div>
                  <button
                    onClick={() => handleControlToggle('led_green', !controlState.led_green)}
                    className={`w-full py-3 rounded-lg font-semibold transition-all ${
                      controlState.led_green
                        ? 'bg-green-500 hover:bg-green-600 text-white'
                        : 'bg-gray-200 hover:bg-gray-300 text-gray-700'
                    }`}
                  >
                    {controlState.led_green ? 'Éteindre' : 'Allumer'}
                  </button>
                </div>

                {/* Contrôle LED Rouge */}
                <div className="bg-gradient-to-br from-red-50 to-pink-50 rounded-xl p-6 border border-red-200">
                  <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-3">
                      <div className="p-3 bg-red-100 rounded-lg">
                        <AlertTriangle className="text-red-600" size={24} />
                      </div>
                      <div>
                        <h3 className="font-semibold text-gray-800">LED Rouge</h3>
                        <p className="text-sm text-gray-600">Indicateur alerte</p>
                      </div>
                    </div>
                    <div className={`w-12 h-6 rounded-full transition-colors ${controlState.led_red ? 'bg-red-500' : 'bg-gray-300'}`}>
                      <div className={`w-5 h-5 bg-white rounded-full transition-transform ${controlState.led_red ? 'translate-x-6' : 'translate-x-1'} mt-0.5`}></div>
                    </div>
                  </div>
                  <button
                    onClick={() => handleControlToggle('led_red', !controlState.led_red)}
                    className={`w-full py-3 rounded-lg font-semibold transition-all ${
                      controlState.led_red
                        ? 'bg-red-500 hover:bg-red-600 text-white'
                        : 'bg-gray-200 hover:bg-gray-300 text-gray-700'
                    }`}
                  >
                    {controlState.led_red ? 'Éteindre' : 'Allumer'}
                  </button>
                </div>

                {/* Contrôle Buzzer */}
                <div className="bg-gradient-to-br from-yellow-50 to-orange-50 rounded-xl p-6 border border-yellow-200">
                  <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-3">
                      <div className="p-3 bg-yellow-100 rounded-lg">
                        <Bell className="text-yellow-600" size={24} />
                      </div>
                      <div>
                        <h3 className="font-semibold text-gray-800">Buzzer</h3>
                        <p className="text-sm text-gray-600">Alarme sonore</p>
                      </div>
                    </div>
                    <div className={`w-12 h-6 rounded-full transition-colors ${controlState.buzzer ? 'bg-yellow-500' : 'bg-gray-300'}`}>
                      <div className={`w-5 h-5 bg-white rounded-full transition-transform ${controlState.buzzer ? 'translate-x-6' : 'translate-x-1'} mt-0.5`}></div>
                    </div>
                  </div>
                  <button
                    onClick={() => handleControlToggle('buzzer', !controlState.buzzer)}
                    className={`w-full py-3 rounded-lg font-semibold transition-all ${
                      controlState.buzzer
                        ? 'bg-yellow-500 hover:bg-yellow-600 text-white'
                        : 'bg-gray-200 hover:bg-gray-300 text-gray-700'
                    }`}
                  >
                    {controlState.buzzer ? 'Arrêter' : 'Activer'}
                  </button>
                </div>

                {/* Contrôle Système Armé */}
                <div className="bg-gradient-to-br from-blue-50 to-indigo-50 rounded-xl p-6 border border-blue-200">
                  <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-3">
                      <div className="p-3 bg-blue-100 rounded-lg">
                        <Shield className="text-blue-600" size={24} />
                      </div>
                      <div>
                        <h3 className="font-semibold text-gray-800">Système Armé</h3>
                        <p className="text-sm text-gray-600">Protection active</p>
                      </div>
                    </div>
                    <div className={`w-12 h-6 rounded-full transition-colors ${controlState.system_armed ? 'bg-blue-500' : 'bg-gray-300'}`}>
                      <div className={`w-5 h-5 bg-white rounded-full transition-transform ${controlState.system_armed ? 'translate-x-6' : 'translate-x-1'} mt-0.5`}></div>
                    </div>
                  </div>
                  <button
                    onClick={() => handleControlToggle('system_armed', !controlState.system_armed)}
                    className={`w-full py-3 rounded-lg font-semibold transition-all ${
                      controlState.system_armed
                        ? 'bg-blue-500 hover:bg-blue-600 text-white'
                        : 'bg-gray-200 hover:bg-gray-300 text-gray-700'
                    }`}
                  >
                    {controlState.system_armed ? 'Désarmer' : 'Armer'}
                  </button>
                </div>
              </div>

              {/* Informations de sécurité */}
              <div className="mt-8 bg-gradient-to-r from-gray-50 to-gray-100 rounded-xl p-6">
                <div className="flex items-start gap-4">
                  <div className="p-3 bg-gray-200 rounded-lg">
                    <Shield className="text-gray-600" size={24} />
                  </div>
                  <div>
                    <h3 className="font-semibold text-gray-800 mb-2">Mode Simulation</h3>
                    <ul className="text-sm text-gray-600 space-y-1">
                      <li>• Les commandes sont actuellement en mode simulation</li>
                      <li>• L'interface affiche l'état réel du système</li>
                      <li>• L'état se synchronise automatiquement avec les données Supabase</li>
                    </ul>
                  </div>
                </div>
              </div>
            </div>
          </div>
        ) : (
          /* Vue Historique (inchangée) */
          <div className="space-y-6">
            {/* Filtres et Recherche */}
            <div className="bg-white rounded-2xl shadow-xl p-6">
              <div className="flex flex-wrap gap-4 items-end">
                <div className="flex-1 min-w-[250px]">
                  <label className="block text-sm font-semibold text-gray-700 mb-2">
                    <Search className="inline mr-2" size={16} />
                    Rechercher
                  </label>
                  <input
                    type="text"
                    placeholder="Rechercher par type, valeur ou statut..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                
                <div className="min-w-[200px]">
                  <label className="block text-sm font-semibold text-gray-700 mb-2">
                    <Filter className="inline mr-2" size={16} />
                    Filtrer par type
                  </label>
                  <select
                    value={filterType}
                    onChange={(e) => setFilterType(e.target.value)}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="all">Tous les types</option>
                    <option value="Gaz">Gaz</option>
                    <option value="Feu">Feu</option>
                    <option value="Humidité">Humidité</option>
                    <option value="Accès RFID">Accès RFID</option>
                    <option value="Système">Système</option>
                    <option value="Lecture Capteur">Lecture Capteur</option>
                  </select>
                </div>
                
                <div className="min-w-[200px]">
                  <label className="block text-sm font-semibold text-gray-700 mb-2">
                    <Calendar className="inline mr-2" size={16} />
                    Filtrer par date
                  </label>
                  <input
                    type="date"
                    value={filterDate}
                    onChange={(e) => setFilterDate(e.target.value)}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                
                <button
                  onClick={downloadCSV}
                  className="px-6 py-2 bg-gradient-to-r from-blue-500 to-purple-600 text-white font-semibold rounded-lg hover:shadow-lg transition-all flex items-center gap-2"
                >
                  <Download size={20} />
                  Télécharger CSV
                </button>
              </div>
              
              <div className="mt-4 text-sm text-gray-600">
                {filteredRecords.length} enregistrement(s) trouvé(s) dans Supabase • Page {currentPage} sur {totalPages}
              </div>
            </div>

            {/* Tableau d'historique */}
            <div className="bg-white rounded-2xl shadow-xl overflow-hidden">
              {filteredRecords.length > 0 ? (
                <>
                  <div className="overflow-x-auto">
                    <table className="w-full">
                      <thead className="bg-gradient-to-r from-blue-50 to-purple-50">
                        <tr>
                          <th className="px-6 py-4 text-left text-sm font-bold text-gray-700">ID</th>
                          <th className="px-6 py-4 text-left text-sm font-bold text-gray-700">Date</th>
                          <th className="px-6 py-4 text-left text-sm font-bold text-gray-700">Heure</th>
                          <th className="px-6 py-4 text-left text-sm font-bold text-gray-700">Type</th>
                          <th className="px-6 py-4 text-left text-sm font-bold text-gray-700">Valeur</th>
                          <th className="px-6 py-4 text-left text-sm font-bold text-gray-700">Statut</th>
                          <th className="px-6 py-4 text-left text-sm font-bold text-gray-700">Action</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-200">
                        {getCurrentPageData().map((record, index) => (
                          <tr key={record.id} className={`hover:bg-gray-50 transition-colors ${index % 2 === 0 ? 'bg-white' : 'bg-gray-25'}`}>
                            <td className="px-6 py-4 text-sm text-gray-800 font-semibold">#{record.id}</td>
                            <td className="px-6 py-4 text-sm text-gray-600">{record.date}</td>
                            <td className="px-6 py-4 text-sm text-gray-600">{record.time}</td>
                            <td className="px-6 py-4 text-sm">
                              <span className="px-3 py-1 rounded-full bg-blue-100 text-blue-700 font-medium">
                                {record.type}
                              </span>
                            </td>
                            <td className="px-6 py-4 text-sm text-gray-800 font-medium max-w-xs truncate">{record.value}</td>
                            <td className="px-6 py-4 text-sm">
                              <span className={`px-3 py-1 rounded-full font-medium ${getStatusBadge(record.status)}`}>
                                {record.status}
                              </span>
                            </td>
                            <td className="px-6 py-4 text-sm text-gray-600">{record.action}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  {/* Pagination */}
                  {totalPages > 1 && (
                    <div className="bg-white px-6 py-4 border-t border-gray-200">
                      <div className="flex items-center justify-between">
                        <div className="text-sm text-gray-700">
                          Affichage de {(currentPage - 1) * ITEMS_PER_PAGE + 1} à {Math.min(currentPage * ITEMS_PER_PAGE, filteredRecords.length)} sur {filteredRecords.length} entrées
                        </div>
                        <div className="flex items-center gap-2">
                          <button
                            onClick={goToPrevPage}
                            disabled={currentPage === 1}
                            className={`p-2 rounded-lg border ${
                              currentPage === 1 
                                ? 'text-gray-400 border-gray-300 cursor-not-allowed' 
                                : 'text-gray-700 border-gray-300 hover:bg-gray-50'
                            }`}
                          >
                            <ChevronLeft size={20} />
                          </button>
                          
                          {/* Indicateurs de page */}
                          {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                            let pageNum;
                            if (totalPages <= 5) {
                              pageNum = i + 1;
                            } else if (currentPage <= 3) {
                              pageNum = i + 1;
                            } else if (currentPage >= totalPages - 2) {
                              pageNum = totalPages - 4 + i;
                            } else {
                              pageNum = currentPage - 2 + i;
                            }
                            
                            return (
                              <button
                                key={pageNum}
                                onClick={() => goToPage(pageNum)}
                                className={`px-3 py-1 rounded-lg border ${
                                  currentPage === pageNum
                                    ? 'bg-blue-500 text-white border-blue-500'
                                    : 'text-gray-700 border-gray-300 hover:bg-gray-50'
                                }`}
                              >
                                {pageNum}
                              </button>
                            );
                          })}
                          
                          <button
                            onClick={goToNextPage}
                            disabled={currentPage === totalPages}
                            className={`p-2 rounded-lg border ${
                              currentPage === totalPages
                                ? 'text-gray-400 border-gray-300 cursor-not-allowed'
                                : 'text-gray-700 border-gray-300 hover:bg-gray-50'
                            }`}
                          >
                            <ChevronRight size={20} />
                          </button>
                        </div>
                      </div>
                    </div>
                  )}
                </>
              ) : (
                <div className="text-center py-12">
                  <div className="text-gray-400 text-6xl mb-4">📊</div>
                  <h3 className="text-lg font-semibold text-gray-700 mb-2">Aucune donnée trouvée dans Supabase</h3>
                  <p className="text-gray-500">Aucun enregistrement ne correspond à vos critères de recherche.</p>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default Dashboard;
