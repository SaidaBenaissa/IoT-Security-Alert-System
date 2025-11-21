/*
 * ESP32 Supabase Control for IoT Security Alert System
 * Reads commands from Supabase database and controls hardware
 */

#include <WiFi.h>
#include <HTTPClient.h>
#include <WiFiClientSecure.h>
#include <ArduinoJson.h>
#include <NTPClient.h>
#include <WiFiUdp.h>

// WiFi Configuration
#define WIFI_SSID "YOUR_WIFI_NAME"
#define WIFI_PASSWORD "YOUR_WIFI_PASS"

// Supabase Configuration
#define SUPABASE_URL "https://owsahicfqgmblmjhzale.supabase.co"
#define SUPABASE_ANON_KEY "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im93c2FoaWNmcWdtYmxtamh6YWxlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjI4NDg3NzEsImV4cCI6MjA3ODQyNDc3MX0.a0RSnKLhWo_pZRCRbY0ZNG9xKjmN1C6pQpF_AFClgnI"

// Device Configuration
#define DEVICE_ID "esp32-home-01"

// NTP Configuration
WiFiUDP ntpUDP;
NTPClient timeClient(ntpUDP, "pool.ntp.org", 0, 60000); // UTC time, update every 60 seconds

// Hardware pins
int ledGreenPin = 5;
int ledRedPin = 18;
int buzzerPin = 19;

// System state
bool systemArmed = false;

void setup() {
  Serial.begin(115200);

  // Initialize hardware pins
  pinMode(ledGreenPin, OUTPUT);
  pinMode(ledRedPin, OUTPUT);
  pinMode(buzzerPin, OUTPUT);

  // Set initial states (all off)
  digitalWrite(ledGreenPin, LOW);
  digitalWrite(ledRedPin, LOW);
  digitalWrite(buzzerPin, LOW);

  // Connect to WiFi
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
  Serial.print("🔗 Connecting to WiFi...");
  while (WiFi.status() != WL_CONNECTED) {
    Serial.print(".");
    delay(300);
  }
  Serial.println("\n✅ WiFi Connected!");
  Serial.print("📡 IP Address: ");
  Serial.println(WiFi.localIP());

  // Initialize NTP
  timeClient.begin();
  timeClient.update();
  Serial.println("🕒 NTP Initialized!");

  Serial.println("🔥 Supabase Connected!");
  Serial.println("🎯 Ready to receive commands from web dashboard");
}

void loop() {
  if (WiFi.status() == WL_CONNECTED) {
    // Update NTP time
    timeClient.update();
    unsigned long currentTime = timeClient.getEpochTime() * 1000; // Convert to milliseconds

    // Get device status from Supabase
    if (getDeviceStatusFromSupabase()) {
      // Update last_seen in Supabase
      updateLastSeenInSupabase(currentTime);
    }
  } else {
    Serial.println("❌ WiFi not connected");
  }

  // Polling interval (200ms for responsive control)
  delay(200);
}

bool getDeviceStatusFromSupabase() {
  WiFiClientSecure client;
  client.setInsecure(); // For testing, use proper certificate validation in production

  HTTPClient http;
  String url = String(SUPABASE_URL) + "/rest/v1/device_status?device_id=eq." + DEVICE_ID + "&select=*";

  http.begin(client, url);
  http.addHeader("apikey", SUPABASE_ANON_KEY);
  http.addHeader("Authorization", "Bearer " + String(SUPABASE_ANON_KEY));
  http.addHeader("Content-Type", "application/json");

  int httpResponseCode = http.GET();

  if (httpResponseCode > 0) {
    String payload = http.getString();
    Serial.println("📥 Received status: " + payload);

    // Parse JSON
    DynamicJsonDocument doc(1024);
    DeserializationError error = deserializeJson(doc, payload);

    if (error) {
      Serial.print("❌ JSON parse error: ");
      Serial.println(error.c_str());
      http.end();
      return false;
    }

    if (doc.size() > 0) {
      JsonObject status = doc[0];

      // Update LED Green
      if (status.containsKey("led_green")) {
        bool ledGreenState = status["led_green"];
        digitalWrite(ledGreenPin, ledGreenState ? HIGH : LOW);
        Serial.print("🟢 LED Green: ");
        Serial.println(ledGreenState ? "ON" : "OFF");
      }

      // Update LED Red
      if (status.containsKey("led_red")) {
        bool ledRedState = status["led_red"];
        digitalWrite(ledRedPin, ledRedState ? HIGH : LOW);
        Serial.print("🔴 LED Red: ");
        Serial.println(ledRedState ? "ON" : "OFF");
      }

      // Update Buzzer
      if (status.containsKey("buzzer")) {
        bool buzzerState = status["buzzer"];
        digitalWrite(buzzerPin, buzzerState ? HIGH : LOW);
        Serial.print("🔊 Buzzer: ");
        Serial.println(buzzerState ? "ON" : "OFF");
      }

      // Update System Armed
      if (status.containsKey("system_armed")) {
        systemArmed = status["system_armed"];
        Serial.print("🛡️ System Armed: ");
        Serial.println(systemArmed ? "YES" : "NO");
      }
    }

    http.end();
    return true;
  } else {
    Serial.print("❌ HTTP GET error: ");
    Serial.println(httpResponseCode);
    http.end();
    return false;
  }
}

void updateLastSeenInSupabase(unsigned long currentTime) {
  WiFiClientSecure client;
  client.setInsecure(); // For testing, use proper certificate validation in production

  HTTPClient http;
  String url = String(SUPABASE_URL) + "/rest/v1/device_status?device_id=eq." + DEVICE_ID;

  http.begin(client, url);
  http.addHeader("apikey", SUPABASE_ANON_KEY);
  http.addHeader("Authorization", "Bearer " + String(SUPABASE_ANON_KEY));
  http.addHeader("Content-Type", "application/json");
  http.addHeader("Prefer", "return=minimal");

  // Create JSON payload
  String jsonPayload = "{\"last_seen\":" + String(currentTime) + "}";

  int httpResponseCode = http.PATCH(jsonPayload);

  if (httpResponseCode > 0) {
    Serial.println("📤 Last seen updated successfully");
  } else {
    Serial.print("❌ HTTP PATCH error: ");
    Serial.println(httpResponseCode);
  }

  http.end();
}
