#include <Wire.h>
#include <LiquidCrystal_I2C.h>
#include <Keypad.h>
#include <ESP32Servo.h>
#include <WiFi.h>
#include <HTTPClient.h>
#include <ArduinoJson.h>
#include <mbedtls/md.h>

LiquidCrystal_I2C lcd(0x27, 16, 2);

// ------------------ Pins capteurs ------------------
#define FLAME_PIN 34
#define WATER_PIN 35
#define GAS_PIN   32

// ------------------ Pins actuateurs ----------------
#define BUZZER_PIN 26
#define SERVO_PIN  13

Servo fenetre;

// ------------------ Code d’accès -------------------
String codeCorrect = "2025";
String codeEntre = "";

// ------------------ Keypad -------------------------
const byte ROWS = 4;
const byte COLS = 3;
char touches[ROWS][COLS] = {
  {'1','2','3'},
  {'4','5','6'},
  {'7','8','9'},
  {'*','0','#'}
};
byte rowPins[ROWS] = {14, 27, 26, 25};
byte colPins[COLS] = {33, 32, 23};
Keypad keypad = Keypad( makeKeymap(touches), rowPins, colPins, ROWS, COLS );

// ------------------ Wi-Fi --------------------------
const char* ssid = "MARHABA";
const char* password = "marhaba23";

// ------------------ Cloudflare Worker --------------
const char* worker_url = "https://dry-wildflower-2539.saaidabenaissa.workers.dev/ingest";
const char* secret     = "7e3dd7cd46ec08905d5d6908066baf49a093765648ca5b96e7438ad5d39fce03";
const char* device_id  = "esp32-test";

// ------------------ Limitation envoi ----------------
unsigned long lastSend = 0;
const unsigned long intervalSend = 45000; // 45s

void setup() {
  Serial.begin(115200);

  lcd.init();
  lcd.backlight();
  lcd.clear();
  lcd.setCursor(0,0);
  lcd.print("Entrer code :");

  pinMode(FLAME_PIN, INPUT);
  pinMode(WATER_PIN, INPUT);
  pinMode(GAS_PIN, INPUT);
  pinMode(BUZZER_PIN, OUTPUT);

  fenetre.attach(SERVO_PIN);
  fenetre.write(0);   // fenêtre fermée

  // Connexion Wi-Fi
  WiFi.begin(ssid, password);
  Serial.print("Connexion Wi-Fi");
  while (WiFi.status() != WL_CONNECTED) {
    delay(500);
    Serial.print(".");
  }
  Serial.println(" connecté !");
}

// ------------------ Fonctions sons -----------------
void sonFlamme() { tone(BUZZER_PIN, 1000, 300); }
void sonEau()    { tone(BUZZER_PIN, 600, 300); }
void sonGaz()    { tone(BUZZER_PIN, 300, 300); }
void sonErreur() { tone(BUZZER_PIN, 2000, 500); }

// ------------------ HMAC SHA256 --------------------
String getHMAC(String message, const char* key) {
  byte hash[32];
  mbedtls_md_context_t ctx;
  const mbedtls_md_info_t* info = mbedtls_md_info_from_type(MBEDTLS_MD_SHA256);
  mbedtls_md_init(&ctx);
  mbedtls_md_setup(&ctx, info, 1);
  mbedtls_md_hmac_starts(&ctx, (const unsigned char*)key, strlen(key));
  mbedtls_md_hmac_update(&ctx, (const unsigned char*)message.c_str(), message.length());
  mbedtls_md_hmac_finish(&ctx, hash);
  mbedtls_md_free(&ctx);

  String signature = "";
  char buf[3];
  for (int i=0; i<32; i++) {
    sprintf(buf, "%02x", hash[i]);
    signature += buf;
  }
  return signature;
}

// ------------------ Envoi Cloudflare ----------------
void sendToCloudflare(int flame, int water, int gas) {
  if (WiFi.status() != WL_CONNECTED) return;

  StaticJsonDocument<200> doc;
  doc["timestamp"] = millis();
  JsonObject data = doc.createNestedObject("data");
  data["fire_value"]     = flame;
  data["humidity_value"] = water;
  data["gas_value"]      = gas;

  String body;
  serializeJson(doc, body);

  String signature = getHMAC(body, secret);

  HTTPClient http;
  http.begin(worker_url);
  http.addHeader("Content-Type", "application/json");
  http.addHeader("x-device-id", device_id);
  http.addHeader("x-signature", signature);

  int code = http.POST(body);
  if (code > 0) Serial.println("✅ Envoi OK : " + String(code));
  else Serial.println("❌ Erreur : " + http.errorToString(code));
  http.end();
}

void loop() {
  unsigned long currentMillis = millis();

  // ------------- Keypad -----------------
  char key = keypad.getKey();
  if (key) {
    if (key == '#') {
      if (codeEntre == codeCorrect) {
        lcd.clear();
        lcd.print("Code correct");
        lcd.setCursor(0,1);
        lcd.print("Bienvenue !");
        delay(1500);
      } else {
        lcd.clear();
        lcd.print("Erreur code");
        sonErreur();
        delay(1500);
      }
      codeEntre = "";
      lcd.clear();
      lcd.print("Entrer code :");
    } else if (key == '*') {
      codeEntre = "";
      lcd.clear();
      lcd.print("Entrer code :");
    } else {
      codeEntre += key;
      lcd.setCursor(0,1);
      lcd.print(codeEntre);
    }
  }

  // ------------- Capteurs -----------------
  int flameState = (digitalRead(FLAME_PIN) == LOW) ? 1 : 0;
  int waterState = (digitalRead(WATER_PIN) == HIGH) ? 1 : 0;
  int gasState   = (digitalRead(GAS_PIN) == HIGH) ? 1 : 0;

  // Actions locales
  if (flameState) { lcd.clear(); lcd.print("🔥 Feu detecte !"); sonFlamme(); delay(500); }
  if (waterState){ lcd.clear(); lcd.print(" Eau detectee"); sonEau();    delay(500); }
  if (gasState)  { lcd.clear(); lcd.print(" Gaz detecte!"); sonGaz(); fenetre.write(90); delay(500); }
  else           { fenetre.write(0); }

  // ------------- Envoi Cloudflare ----------------
  if (flameState || waterState || gasState || (currentMillis - lastSend >= intervalSend)) {
    sendToCloudflare(flameState, waterState, gasState);
    lastSend = currentMillis;
  }

  delay(200); // boucle rapide
}
