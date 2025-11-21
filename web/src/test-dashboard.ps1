# Script de test complet pour le dashboard
param(
    [string]$DeviceId = "esp32-home-01",
    [int]$NumberOfTests = 10
)

$secret = "7e3dd7cd46ec08905d5d6908066baf49a093765648ca5b96e7438ad5d39fce03"
# 1) Clé HMAC (identique)
$secret = "7e3dd7cd46ec08905d5d6908066baf49a093765648ca5b96e7438ad5d39fce03"

# 2) Corps JSON PLUS COMPLET avec toutes les valeurs
$body = @{
    timestamp = [int64]([datetime]::UtcNow.Subtract([datetime]'1970-01-01')).TotalMilliseconds
    data = @{
        gas_value = 45
        fire_value = 28
        humidity_value = 65
        keypad_status = "access_granted"
        system_armed = $true
        buzzer = $false
        led_red = $false
        led_green = $true
    }
} | ConvertTo-Json -Compress

Write-Host "Body: $body"

# 3) Calcul HMAC
$secretBytes = [System.Text.Encoding]::UTF8.GetBytes($secret)
$hmac = [System.Security.Cryptography.HMACSHA256]::new($secretBytes)
$bytes = [System.Text.Encoding]::UTF8.GetBytes($body)
$hash = $hmac.ComputeHash($bytes)
$signature = ([System.BitConverter]::ToString($hash)).Replace("-", "").ToLower()

Write-Host "Signature: $signature"

# 4) Envoi avec gestion d'erreur détaillée
try {
    $response = Invoke-RestMethod `
        -Uri "https://dry-wildflower-2539.saaidabenaissa.workers.dev/ingest" `
        -Method POST `
        -Headers @{
            "x-device-id" = "esp32-home-01"
            "x-signature" = $signature
            "Content-Type" = "application/json"
        } `
        -Body $body

    Write-Host "✅ SUCCÈS!" -ForegroundColor Green
    Write-Host "Réponse:" ($response | ConvertTo-Json -Depth 3)
} catch {
    Write-Host "❌ ERREUR!" -ForegroundColor Red
    Write-Host "Status:" $_.Exception.Response.StatusCode.value__
    Write-Host "Message:" $_.Exception.Message
    if ($_.Exception.Response) {
        $stream = $_.Exception.Response.GetResponseStream()
        $reader = New-Object System.IO.StreamReader($stream)
        Write-Host "Détails:" $reader.ReadToEnd()
    }
}