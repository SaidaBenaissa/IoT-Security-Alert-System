#include <WiFi.h>
#include <HTTPClient.h>
#include <ArduinoJson.h>
#include <Keypad.h>
#include <Wire.h>
#include <LiquidCrystal_I2C.h>
#include "mbedtls/md.h"
#include <ESP32Servo.h>

// ---------------- PINS ----------------
const int flamePin  = 34;
const int mq2Pin    = 35;
const int soilPin   = 32;

const int buzzerPin = 14;   // BUZZER
const int servoPin  = 23;   // SERVOMOTEUR

Servo verrou;  // servo pour ouvrir la porte

// ---------------- TIMING ----------------
unsigned long lastPeriodicSend = 0;
const unsigned long PERIODIC_INTERVAL = 45000; // 45s

// ---------------- MQ2 ----------------
int mq2Filtered = 0, baseline = 0;
const int GAS_THRESHOLD = 120;

// ---------------- WIFI ----------------
const char* ssid     = "";
const char* password = "";

// ---------------- CLOUD ----------------
String cloudURL = "https://dry-wildflower-2539.saaidabenaissa.workers.dev/ingest";
String deviceID = "";
String secret   = "";

// ---------------- LCD ----------------
LiquidCrystal_I2C lcd(0x27,16,2);

// ---------------- KEYPAD ----------------
const byte ROWS = 4;
const byte COLS = 4;
char keys[ROWS][COLS] = {
  {'3','1','2','A'},
  {'6','4','5','B'},
  {'9','7','8','C'},
  {'#','*','0','D'}
};
byte rowPins[ROWS] = {19,18,5,17};
byte colPins[COLS] = {2,16,4,15};
Keypad keypad = Keypad(makeKeymap(keys), rowPins, colPins, ROWS, COLS);

String passwordKey = "2020";
String inputKey = "";

bool keypadEvent = false;
String keypadStatus = "none";

// ---------------- ALERT DURATION ----------------
const int ALERT_DURATION_GAS   = 2000; // ms
const int ALERT_DURATION_FLAME = 2000; 
const int ALERT_DURATION_WATER = 2000; 

// ---------------- GET UNIX TIMESTAMP ----------------
unsigned long getUnixTimestamp() {
  return (unsigned long)(millis() / 1000 + 1730000000UL);  
}

// ---------------- HMAC SHA256 ----------------
String hmacSHA256(String key, String msg) {
  unsigned char hmac[32];
  mbedtls_md_context_t ctx;
  const mbedtls_md_info_t* info = mbedtls_md_info_from_type(MBEDTLS_MD_SHA256);

  mbedtls_md_init(&ctx);
  mbedtls_md_setup(&ctx, info, 1);
  mbedtls_md_hmac_starts(&ctx, (const unsigned char*)key.c_str(), key.length());
  mbedtls_md_hmac_update(&ctx, (const unsigned char*)msg.c_str(), msg.length());
  mbedtls_md_hmac_finish(&ctx, hmac);
  mbedtls_md_free(&ctx);

  String hex = "";
  for (int i = 0; i < 32; i++) {
    if (hmac[i] < 16) hex += "0";
    hex += String(hmac[i], HEX);
  }
  return hex;
}

// ---------------- CLOUD SEND ----------------
void sendToCloud(String type, int gas, int flame, int water, String keypadStatus) {
  if (WiFi.status() != WL_CONNECTED) return;

  StaticJsonDocument<300> doc;
  doc["type"] = type;
  doc["timestamp"] = getUnixTimestamp();

  JsonObject data = doc.createNestedObject("data");
  data["gas_value"]      = gas;
  data["fire_value"]     = flame;
  data["humidity_value"] = water;

  if (type == "keypad")
      data["keypad_status"] = keypadStatus;
  else
      data["keypad_status"] = nullptr;

  String jsonStr;
  serializeJson(doc, jsonStr);

  String sig = hmacSHA256(secret, jsonStr);

  HTTPClient http;
  http.begin(cloudURL);
  http.addHeader("Content-Type", "application/json");
  http.addHeader("x-device-id", deviceID);
  http.addHeader("x-signature", sig);

  int code = http.POST(jsonStr);
  Serial.println("HTTP code:" + String(code));
  Serial.println(jsonStr);

  http.end();
}

// ---------------- CALIBRATION MQ2 ----------------
void calibrateMQ2() {
  long sum = 0;
  for (int i = 0; i < 120; i++) { 
    sum += analogRead(mq2Pin); 
    delay(20); 
  }
  baseline = sum / 120;
  Serial.println("Baseline MQ2=" + String(baseline));
}

// ---------------- SETUP ----------------
void setup() {
  Serial.begin(115200);

  pinMode(flamePin, INPUT_PULLUP);
  pinMode(soilPin, INPUT_PULLUP);
  pinMode(buzzerPin, OUTPUT);

  verrou.attach(servoPin);
  verrou.write(0); // porte fermée

  WiFi.begin(ssid, password);
  Serial.print("Connexion WiFi...");
  while (WiFi.status() != WL_CONNECTED) { 
    Serial.print("."); 
    delay(500); 
  }
  Serial.println("\nWiFi connecté !");

  lcd.init();
  lcd.backlight();
  lcd.clear();
  lcd.print("Systeme Maison");

  calibrateMQ2();

  lcd.clear();
  lcd.print("Entrez code:");
}

// ---------------- LOOP ----------------
void loop() {
  // ===== KEYPAD =====
  char key = keypad.getKey();

  if (key) {
    if (key == '#') {
      lcd.clear();
      if (inputKey == passwordKey) {
        lcd.print("ACCES OK");
        keypadStatus = "correct";
        verrou.write(90); 
        delay(2000);
        verrou.write(0);
      } else {
        lcd.print("ACCES REFUSE");
        keypadStatus = "incorrect";
        tone(buzzerPin, 2000); 
        delay(1000);
        noTone(buzzerPin);
        sendToCloud("alerte", 0,0,0,"incorrect");
      }

      sendToCloud("keypad", 0, 0, 0, keypadStatus);

      delay(1500);
      lcd.clear();
      lcd.print("Entrez code:");
      inputKey = "";
      keypadStatus = "none";
    }
    else if (key == '*') {
      inputKey = "";
      lcd.clear();
      lcd.print("Entrez code:");
    }
    else {
      inputKey += key;
      lcd.setCursor(0, 1);
      lcd.print(inputKey);
    }
  }

  // ===== CAPTEURS =====
  int mq2Raw   = analogRead(mq2Pin);
  mq2Filtered  = 0.7 * mq2Filtered + 0.3 * mq2Raw;
  
  int gas     = ((mq2Filtered - baseline) > GAS_THRESHOLD) ? 1 : 0;
  int flame   = (digitalRead(flamePin) == LOW) ? 1 : 0;
  int water   = (digitalRead(soilPin)  == LOW) ? 1 : 0;

  // ===== ALERTES =====
  if (gas || flame || water) {
    unsigned long alertStart = millis();
    unsigned long alertDuration = 0;

    if (gas) alertDuration = ALERT_DURATION_GAS;
    if (flame) alertDuration = max(alertDuration, (unsigned long)ALERT_DURATION_FLAME);
    if (water) alertDuration = max(alertDuration, (unsigned long)ALERT_DURATION_WATER);

    while (millis() - alertStart < alertDuration) {
      if (gas)   tone(buzzerPin, 1800);
      if (flame) tone(buzzerPin, 1000);
      if (water) tone(buzzerPin, 400);

 
      delay(100);
    }
    noTone(buzzerPin);

    sendToCloud("alerte", gas, flame, water, "none");
    delay(500);
    return;
  }

  // ===== ENVOI PERIODIQUE =====
  unsigned long now = millis();
  if (now - lastPeriodicSend >= PERIODIC_INTERVAL) {
    sendToCloud("periodic", gas, flame, water, "none");
    lastPeriodicSend = now;
  }

  delay(200);
}
