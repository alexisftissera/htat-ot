# ============================================================
#   htat · Servidor local (PowerShell, sin dependencias)
#   Sirve la carpeta por HTTP para probar e instalar la app
#   como PWA en PC y celular (misma red Wi-Fi).
#   Uso:  powershell -ExecutionPolicy Bypass -File servir.ps1
#         powershell -ExecutionPolicy Bypass -File servir.ps1 8090
# ============================================================
$ErrorActionPreference = "Stop"

$root = $PSScriptRoot
$port = if ($args.Count -gt 0) { [int]$args[0] } else { 8080 }

$mime = @{
  ".html" = "text/html; charset=utf-8"
  ".js"   = "application/javascript; charset=utf-8"
  ".css"  = "text/css; charset=utf-8"
  ".json" = "application/json; charset=utf-8"
  ".png"  = "image/png"
  ".ico"  = "image/x-icon"
}

function Send-Response($stream, $bytes, $type, $status) {
  $header = "HTTP/1.1 $status`r`nContent-Type: $type`r`nContent-Length: $($bytes.Length)`r`nCache-Control: no-cache`r`nConnection: close`r`n`r`n"
  $hb = [System.Text.Encoding]::ASCII.GetBytes($header)
  $stream.Write($hb, 0, $hb.Length)
  $stream.Write($bytes, 0, $bytes.Length)
}

$listener = [System.Net.Sockets.TcpListener]::new([System.Net.IPAddress]::Any, $port)
$listener.Start()

$local = $null
try {
  $local = (Get-NetIPAddress -AddressFamily IPv4 -ErrorAction SilentlyContinue |
    Where-Object { $_.IPAddress -notlike "169.254.*" -and $_.IPAddress -ne "127.0.0.1" } |
    Select-Object -First 1).IPAddress
} catch { }

Write-Host "==========================================="
Write-Host "  HTAT servidor en funcionamiento"
Write-Host "  PC:      http://localhost:$port/"
if ($local) { Write-Host "  Celular: http://${local}:$port/  (misma red Wi-Fi)" }
Write-Host "  Cerrar:  Ctrl+C"
Write-Host "==========================================="

try {
  while ($true) {
    $cc = $null
    try {
      $cc = $listener.AcceptTcpClient()
      $stream = $cc.GetStream()
      $stream.ReadTimeout = 4000
      $stream.WriteTimeout = 10000

      $buf = New-Object byte[] 12288
      $n = $stream.Read($buf, 0, $buf.Length)
      $req = [System.Text.Encoding]::ASCII.GetString($buf, 0, [Math]::Max($n, 0))
      $line = ($req -split "`r`n")[0]
      $method = ($line -split " ")[0]
      $path = ($line -split " ")[1]
      if (-not $path) { $path = "/" }
      if ($path -eq "/") { $path = "/index.html" }
      $path = $path.Split("?")[0]
      $decoded = [System.Uri]::UnescapeDataString($path.Replace("+", "%2B"))
      $full = [System.IO.Path]::GetFullPath((Join-Path $root $decoded.TrimStart("/")))
      if (-not $full.StartsWith($root)) {
        Send-Response $stream ([System.Text.Encoding]::UTF8.GetBytes("403")) "text/plain" "403 Forbidden"
      } elseif (Test-Path -LiteralPath $full -PathType Leaf) {
        $bytes = [System.IO.File]::ReadAllBytes($full)
        $ext = [System.IO.Path]::GetExtension($full).ToLower()
        $type = if ($mime.ContainsKey($ext)) { $mime[$ext] } else { "application/octet-stream" }
        Send-Response $stream $bytes $type "200 OK"
      } else {
        Send-Response $stream ([System.Text.Encoding]::UTF8.GetBytes("404")) "text/plain" "404 Not Found"
      }
    } catch {
      # conexión cerrada por el cliente o timeout: continuar atendiendo
    } finally {
      if ($cc) { $cc.Close() }
    }
  }
} finally {
  $listener.Stop()
}