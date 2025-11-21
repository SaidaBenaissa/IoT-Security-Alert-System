// src/Dashboard.tsx
import React, { useState, useEffect } from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import {
  Activity, Wifi, WifiOff, AlertTriangle, CheckCircle, Flame, Wind,
  Droplets, Key, Shield, Bell, Clock, LayoutDashboard, History,
  Search, Download, Filter, Calendar, LogOut, User,
  ChevronLeft, ChevronRight, Settings
} from 'lucide-react';
import { dashboardService, Reading } from './supabase-dashboard';
import { signOut } from 'firebase/auth';
import { auth } from './firebase';

// Configuration
const DEVICE_ID = 'esp32-home-01';
const POLLING_INTERVAL = 5000;
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
  
  // Filtres pour l'historique
  const [searchTerm, setSearchTerm] = useState('');
  const [filterType, setFilterType] = useState('all');
  const [filterDate, setFilterDate] = useState('');
  
  // Pagination
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);

  // État des contrôles
  const [controlState, setControlState] = useState({
    led_green: false,
    led_red: false,
    buzzer: false,
    system_armed: false
  });

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

  // Récupérer l'email de l'utilisateur connecté
  useEffect(() => {
    const user = auth.currentUser;
    if (user?.email) {
      setUserEmail(user.email);
    }
  }, []);

  // Fonction de déconnexion
  const handleLogout = async () => {
    try {
      await signOut(auth);
      console.log('✅ Utilisateur déconnecté');
    } catch (error) {
      console.error('❌ Erreur lors de la déconnexion:', error);
    }
  };

  // Charger les données initiales
  useEffect(() => {
    loadAllData();
    
    // Configurer le polling pour les mises à jour en temps réel
    const interval = setInterval(loadRealtimeData, POLLING_INTERVAL);
    
    return () => clearInterval(interval);
  }, []);

  // Charger toutes les données (initial)
  const loadAllData = async () => {
    setLoading(true);
    try {
      await Promise.all([
        loadRealtimeData(),
        loadHistoricalData(),
        loadEvents(),
        loadHistoricalRecords()
      ]);
    } catch (error) {
      console.error('Error loading dashboard data:', error);
    } finally {
      setLoading(false);
    }
  };

  // Charger les données temps réel (lectures + statut)
  const loadRealtimeData = async () => {
    try {
      const [latestReading, deviceStatus] = await Promise.all([
        dashboardService.getLatestReadings(DEVICE_ID),
        dashboardService.getDeviceStatus(DEVICE_ID)
      ]);

      console.log('Latest reading:', latestReading);
      console.log('Device status:', deviceStatus);

      if (latestReading) {
        setCurrentState(prev => ({
          ...prev,
          gas_value: latestReading.gas_value || 0,
          fire_value: latestReading.fire_value || 0,
          humidity_value: latestReading.humidity_value || 0,
          keypad_status: latestReading.keypad_status || 'Aucun',
          last_seen: formatTimestamp(latestReading.ts)
        }));

        // Mettre à jour l'alerte
        const alertLevel = calculateAlertLevel(latestReading);
        setCurrentState(prev => ({ ...prev, alert_level: alertLevel }));
      }

      if (deviceStatus) {
        const newState = {
          system_armed: deviceStatus.system_armed || false,
          led_red: deviceStatus.led_red || false,
          led_green: deviceStatus.led_green || false,
          buzzer: deviceStatus.buzzer || false
        };

        setCurrentState(prev => ({
          ...prev,
          ...newState,
          last_seen: formatTimestamp(deviceStatus.last_seen)
        }));

        setControlState(newState);

        // Vérifier la connexion
        const twoMinutesAgo = Date.now() - (2 * 60 * 1000);
        const lastSeenTimestamp = typeof deviceStatus.last_seen === 'number' ? deviceStatus.last_seen : new Date(deviceStatus.last_seen).getTime();
        const isDeviceConnected = lastSeenTimestamp > twoMinutesAgo;
        setIsConnected(isDeviceConnected);

        console.log('Connection status:', isDeviceConnected, 'Last seen:', deviceStatus.last_seen, 'Now:', Date.now());
      }
    } catch (error) {
      console.error('Error loading realtime data:', error);
      setIsConnected(false);
    }
  };

  // Formater le timestamp
  const formatTimestamp = (timestamp: any) => {
    if (!timestamp) return 'Jamais';
    const date = typeof timestamp === 'number' ? new Date(timestamp) : new Date(timestamp);
    return date.toLocaleString('fr-FR');
  };

  // Charger les données historiques pour les graphiques
  const loadHistoricalData = async () => {
    try {
      const hours = period === '24h' ? 24 : period === '7d' ? 168 : 720;
      const since = Date.now() - (hours * 60 * 60 * 1000);
      
      console.log('Fetching historical data for', hours, 'hours, since:', new Date(since));
      
      const readings = await dashboardService.getHistoricalReadings(DEVICE_ID, hours);
      
      console.log('Raw historical readings:', readings);
      
      const formattedData = readings.map(reading => ({
        timestamp: new Date(reading.ts).toLocaleTimeString('fr-FR', { 
          hour: '2-digit', 
          minute: '2-digit',
          ...(hours > 24 && { day: '2-digit', month: '2-digit' })
        }),
        gas_value: reading.gas_value || 0,
        fire_value: reading.fire_value || 0,
        humidity_value: reading.humidity_value || 0,
      }));
      
      console.log('Formatted chart data:', formattedData);
      
      setHistoricalData(formattedData);
    } catch (error) {
      console.error('Error loading historical data:', error);
    }
  };

  // Charger les événements récents
  const loadEvents = async () => {
    try {
      const eventsData = await dashboardService.getRecentEvents(DEVICE_ID, 5);
      console.log('Recent events:', eventsData);
      
      const formattedEvents = eventsData.map(event => ({
        id: event.id,
        time: new Date(event.ts).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }),
        type: dashboardService.formatEventType(event.type),
        status: formatEventStatus(event.type, event.value),
        value: event.value
      }));
      
      setEvents(formattedEvents);
    } catch (error) {
      console.error('Error loading events:', error);
    }
  };

  // Charger tous les événements pour l'historique
  const loadHistoricalRecords = async () => {
    try {
      // Charger à la fois les events et les readings
      const [eventsData, readingsData] = await Promise.all([
        dashboardService.getAllEvents(DEVICE_ID),
        dashboardService.getAllReadings(DEVICE_ID)
      ]);

      console.log('Historical events:', eventsData);
      console.log('Historical readings:', readingsData);

      // Combiner et formater les données
      const formattedEvents = eventsData.map(event => ({
        id: `event_${event.id}`,
        date: new Date(event.ts).toLocaleDateString('fr-FR'),
        time: new Date(event.ts).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }),
        type: dashboardService.formatEventType(event.type),
        value: event.value,
        status: formatEventStatus(event.type, event.value),
        action: getEventAction(event.type, event.value),
        timestamp: event.ts
      }));

      const formattedReadings = readingsData.map(reading => ({
        id: `reading_${reading.id}`,
        date: new Date(reading.ts).toLocaleDateString('fr-FR'),
        time: new Date(reading.ts).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }),
        type: 'Lecture Capteur',
        value: `Gaz: ${reading.gas_value}ppm, Feu: ${reading.fire_value}°C, Humidité: ${reading.humidity_value}%, RFID: ${reading.keypad_status || 'N/A'}`,
        status: '📊 Mesure',
        action: 'Enregistrement',
        timestamp: reading.ts
      }));

      // Combiner et trier par timestamp
      const allRecords = [...formattedEvents, ...formattedReadings]
        .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

      setHistoricalRecords(allRecords);
      setFilteredRecords(allRecords);
      updatePagination(allRecords);
    } catch (error) {
      console.error('Error loading historical records:', error);
    }
  };

  // Mettre à jour la pagination
  const updatePagination = (records: any[]) => {
    const total = Math.ceil(records.length / ITEMS_PER_PAGE);
    setTotalPages(total);
    setCurrentPage(1); // Reset à la première page
  };

  // Obtenir les données de la page actuelle
  const getCurrentPageData = () => {
    const startIndex = (currentPage - 1) * ITEMS_PER_PAGE;
    const endIndex = startIndex + ITEMS_PER_PAGE;
    return filteredRecords.slice(startIndex, endIndex);
  };

  // Helper pour calculer le niveau d'alerte
  const calculateAlertLevel = (reading: Reading): string => {
    if (reading.gas_value > 80 || reading.fire_value > 60) return 'Urgent';
    if (reading.gas_value > 60 || reading.fire_value > 40) return 'Alerte';
    return 'Normal';
  };

  // Formater le statut de l'événement
  const formatEventStatus = (type: string, value: string): string => {
    if (type === 'keypad') {
      return value.includes('granted') ? '✅ Accepté' : '❌ Refusé';
    }
    if (type === 'gas') return '⚠️ Détecté';
    if (type === 'fire') return '🔥 Détecté';
    if (type === 'system') return '✅ Activé';
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

  // Fonction pour envoyer une commande à Firebase
  const sendControlCommand = async (command: string, value: boolean) => {
    try {
      console.log(`📡 Envoi commande: ${command} = ${value ? 1 : 0}`);

      // Envoyer à Firebase Realtime Database
      await set(ref(db, `commands/${command}`), value ? 1 : 0);

      // Mettre à jour l'état local pour une UI réactive
      setControlState(prev => ({
        ...prev,
        [command]: value
      }));

      console.log(`✅ Commande ${command} envoyée avec succès`);

      // Recharger les données temps réel pour confirmer
      await loadRealtimeData();

    } catch (error) {
      console.error(`❌ Erreur lors de l'envoi de la commande ${command}:`, error);
    }
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
      '📝 Enregistré': 'bg-gray-100 text-gray-700'
    };
    return colors[status] || 'bg-gray-100 text-gray-700';
  };

  const GaugeCard = ({ title, value, max, icon: Icon, color, unit = '' }: { 
    title: string; 
    value: number; 
    max: number; 
    icon: any; 
    color: string; 
    unit?: string; 
  }) => {
    const percentage = (value / max) * 100;
    return (
      <div className="bg-white rounded-xl p-6 shadow-lg hover:shadow-xl transition-shadow">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <div className={`p-3 rounded-lg ${color} bg-opacity-10`}>
              <Icon className={color} size={24} />
            </div>
            <h3 className="font-semibold text-gray-700">{title}</h3>
          </div>
          <span className="text-2xl font-bold text-gray-800">{value}{unit}</span>
        </div>
        <div className="w-full bg-gray-200 rounded-full h-3">
          <div 
            className={`h-3 rounded-full ${color.replace('text', 'bg')} transition-all duration-500`}
            style={{ width: `${Math.min(percentage, 100)}%` }}
          />
        </div>
        <div className="mt-2 text-sm text-gray-500">{percentage.toFixed(0)}% du maximum</div>
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
          <Activity className="mx-auto mb-4 text-blue-500" size={48} />
          <p className="text-xl font-semibold text-gray-700">Chargement des données...</p>
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
                <p className="text-gray-500 flex items-center gap-2 mt-1">
                  <Clock size={16} />
                  Dernière mise à jour: {currentState.last_seen}
                </p>
              </div>
            </div>
            
            <div className="flex items-center gap-6">
              {/* Informations utilisateur */}
              <div className="flex items-center gap-2 bg-gray-100 rounded-full px-4 py-2">
                <User size={16} className="text-gray-600" />
                <span className="text-sm text-gray-700 font-medium">{userEmail}</span>
              </div>
              
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
              
              <div className={`px-6 py-3 rounded-full font-bold ${getAlertColor(currentState.alert_level)} bg-opacity-10 flex items-center gap-2`}>
                {currentState.alert_level === 'Normal' ? <CheckCircle size={20} /> : <AlertTriangle size={20} />}
                {currentState.alert_level}
              </div>

              {/* Bouton de déconnexion */}
              <button
                onClick={handleLogout}
                className="flex items-center gap-2 px-4 py-2 bg-red-500 hover:bg-red-600 text-white rounded-lg transition-colors font-medium"
              >
                <LogOut size={18} />
                Déconnexion
              </button>
            </div>
          </div>

          {/* Navigation Tabs */}
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
            {/* Données en temps réel */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mb-6">
              <GaugeCard 
                title="Niveau de Gaz" 
                value={currentState.gas_value} 
                max={100} 
                icon={Wind}
                color="text-orange-500"
                unit=" ppm"
              />
              <GaugeCard 
                title="Intensité Feu" 
                value={currentState.fire_value} 
                max={100} 
                icon={Flame}
                color="text-red-500"
                unit="°C"
              />
              <GaugeCard 
                title="Humidité" 
                value={currentState.humidity_value} 
                max={100} 
                icon={Droplets}
                color="text-blue-500"
                unit="%"
              />
            </div>

            {/* État des actionneurs */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
              <StatusCard title="LED Verte" status={currentState.led_green} icon={CheckCircle} />
              <StatusCard title="LED Rouge" status={currentState.led_red} icon={AlertTriangle} />
              <StatusCard title="Buzzer" status={currentState.buzzer} icon={Bell} />
              <StatusCard title="Système Armé" status={currentState.system_armed} icon={Shield} />
            </div>

            {/* Graphiques Historiques */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
              <div className="bg-white rounded-2xl shadow-xl p-6">
                <div className="flex items-center justify-between mb-4">
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
                <ResponsiveContainer width="100%" height={300}>
                  <LineChart data={historicalData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                    <XAxis dataKey="timestamp" stroke="#666" />
                    <YAxis stroke="#666" />
                    <Tooltip 
                      contentStyle={{ backgroundColor: '#fff', border: '1px solid #ddd', borderRadius: '8px' }}
                    />
                    <Legend />
                    <Line type="monotone" dataKey="gas_value" stroke="#f97316" strokeWidth={2} name="Gaz (ppm)" />
                    <Line type="monotone" dataKey="fire_value" stroke="#ef4444" strokeWidth={2} name="Feu (°C)" />
                    <Line type="monotone" dataKey="humidity_value" stroke="#3b82f6" strokeWidth={2} name="Humidité (%)" />
                  </LineChart>
                </ResponsiveContainer>
              </div>

              <div className="bg-white rounded-2xl shadow-xl p-6">
                <h2 className="text-xl font-bold text-gray-800 mb-4">Événements Récents</h2>
                <div className="space-y-3 max-h-[340px] overflow-y-auto">
                  {events.map(event => (
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
                  ))}
                </div>
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
          </>
        ) : activeTab === 'controle' ? (
          /* Vue Contrôle */
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
                    onClick={() => sendControlCommand('led_green', !controlState.led_green)}
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
                    onClick={() => sendControlCommand('led_red', !controlState.led_red)}
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
                    onClick={() => sendControlCommand('buzzer', !controlState.buzzer)}
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
                    onClick={() => sendControlCommand('system_arm', !controlState.system_armed)}
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
                    <h3 className="font-semibold text-gray-800 mb-2">Sécurité et Fiabilité</h3>
                    <ul className="text-sm text-gray-600 space-y-1">
                      <li>• Les commandes sont envoyées via WiFi au dispositif ESP32</li>
                      <li>• Chaque commande est confirmée par une mise à jour du statut en temps réel</li>
                      <li>• Le système maintient la cohérence entre l'état local et distant</li>
                      <li>• En cas de déconnexion, les contrôles sont automatiquement désactivés</li>
                    </ul>
                  </div>
                </div>
              </div>
            </div>
          </div>
        ) : (
          /* Vue Historique */
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
                {filteredRecords.length} enregistrement(s) trouvé(s) • Page {currentPage} sur {totalPages}
              </div>
            </div>

            {/* Tableau d'historique */}
            <div className="bg-white rounded-2xl shadow-xl overflow-hidden">
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
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default Dashboard;