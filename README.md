# 🚴 CycloTrack — Live GPS Tracking Event Sepeda Komunitas

Aplikasi web real-time untuk pemantauan posisi peserta (live tracking), manajemen rute GPX, leaderboard, dan replay event sepeda komunitas. Dilengkapi dengan dukungan **PWA (Progressive Web App)**, penyimpanan offline (*Offline First*), tema **Emerald Forest**, dan ikon **Material Rounded**.

---

## 📱 Fitur Utama

- **Live GPS Tracking Real-Time**: Pemancaran koordinat GPS peserta secara periodik via MQTT broker.
- **3 Mode Peran (Role-Based)**:
  - 🚴 **Peserta (Rider)**: Speedometer live, jarak tempuh, elevasi, sisa rute ke finish, tombol darurat SOS, dan pemilihan *Battery Mode* (High Precision, Standard, Battery Saver).
  - 👁️ **Penonton (Spectator / Dotwatcher)**: Peta interaktif Leaflet, Live Leaderboard, filter status rider, dan pemantauan notifikasi SOS.
  - ⚙️ **Panitia / Admin**: Upload rute GPX event, manajemen peserta, simulator pergerakan rider, dan player replay rekaman event.
- **Offline First & PWA**: Tetap dapat merekam titik koordinat GPS saat sinyal seluler hilang di jalur terpencil dan otomatis tersinkronisasi saat koneksi pulih.
- **Ekspor & Perekaman Replay**: Simpan rekaman pergerakan event ke file `.json` atau rekam video layar peta `.webm`.

---

## 📋 Prasyarat (Prerequisites)

Pastikan salah satu dari kebutuhan berikut telah terpasang di komputer Anda:

- **Node.js**: Versi `18.x` atau `20.x` ke atas ([Download Node.js](https://nodejs.org/))
- **npm**: Bawaan dari instalasi Node.js
- *(Opsional untuk Docker)*: **Docker Desktop** atau **Docker Engine** & **Docker Compose** ([Download Docker](https://www.docker.com/))

---

## 🚀 Cara Menjalankan Project

Pilih metode yang sesuai dengan sistem operasi atau lingkungan yang Anda gunakan:

### 1. 🪟 Menjalankan di Windows

Buka terminal (**PowerShell**, **Command Prompt (CMD)**, atau **Git Bash**) di folder project:

```powershell
# 1. Clone repository (jika belum) dan masuk ke direktori
cd live-tracking

# 2. Install dependensi project
npm install

# 3. Jalankan server development
npm run dev
```

Buka browser dan akses: **`http://localhost:5173`**

---

### 2. 🐧 Menjalankan di Linux (Ubuntu / Debian / Fedora / Arch)

Buka **Terminal** di folder project:

```bash
# 1. Masuk ke direktori project
cd live-tracking

# 2. Install dependensi
npm install

# 3. Jalankan development server
npm run dev
```

Buka browser dan akses: **`http://localhost:5173`**

---

### 3. 🍎 Menjalankan di macOS

Buka aplikasi **Terminal** atau **iTerm2**:

```bash
# 1. Masuk ke direktori project
cd live-tracking

# 2. Install dependensi
npm install

# 3. Jalankan development server
npm run dev
```

Buka browser dan akses: **`http://localhost:5173`**

---

## 🐳 Cara Menjalankan dengan Docker

Project ini telah dilengkapi dengan `Dockerfile`, `docker-compose.yml`, dan konfigurasi Nginx berkinerja tinggi.

### Opsi A: Menggunakan Docker Compose (Direkomendasikan)

Cukup jalankan satu perintah berikut di terminal:

```bash
docker compose up -d --build
```

- Aplikasi akan otomatis dibuild dan dijalankan di latar belakang (*detached mode*).
- Buka browser di: **`http://localhost:5173`**

**Perintah Manajemen Docker Compose:**
```bash
# Melihat log container
docker compose logs -f

# Menghentikan container
docker compose down
```

---

### Opsi B: Menggunakan Docker CLI Manual

Jika tidak menggunakan Docker Compose:

```bash
# 1. Build Docker Image
docker build -t cyclotrack-app .

# 2. Jalankan Docker Container
docker run -d --name cyclotrack-container -p 5173:80 cyclotrack-app
```

Buka browser di: **`http://localhost:5173`**

**Menghentikan & Menghapus Container:**
```bash
docker stop cyclotrack-container && docker rm cyclotrack-container
```

---

## 📲 Cara Akses dari Smartphone (Android & iOS)

Aplikasi ini dapat diakses langsung oleh HP peserta dan penonton yang terhubung dalam satu jaringan Wi-Fi/Hotspot yang sama:

1. **Cek IP Lokal Komputer Anda**:
   - **Windows**: Jalankan `ipconfig` (lihat *IPv4 Address*, misal: `192.168.1.10`)
   - **Linux / macOS**: Jalankan `hostname -I` atau `ipconfig getifaddr en0` (misal: `192.168.1.10`)
2. **Buka di Browser HP**:
   - Buka Chrome (Android) atau Safari (iOS) lalu ketik: `http://192.168.1.10:5173`
3. **Instal sebagai Aplikasi (PWA)**:
   - **Android**: Tekan tombol banner **"Install Aplikasi CycloTrack"** di layar utama atau pilih menu browser > *Install app / Tambahkan ke Layar Utama*.
   - **iOS (iPhone/iPad)**: Di Safari, tekan tombol **Share (⎕↑)** di bagian bawah lalu pilih **"Add to Home Screen (➕)"**.

---

## 🛠️ Perintah Skrip Tersedia

| Perintah | Fungsi |
| :--- | :--- |
| `npm run dev` | Menjalankan Vite development server lokal dengan Hot Module Replacement (HMR) |
| `npm run build` | Melakukan kompilasi bundle produksi ke folder `dist/` |
| `npm run preview` | Menjalankan preview lokal dari hasil build produksi |
| `npm run lint` | Menjalankan pemeriksaan kode menggunakan Oxlint |

---

## 🔐 Kredensial Akses & PIN Default

- **PIN Admin Default**: `1234` *(Dapat diubah dan disinkronkan langsung via panel admin)*
- **Mode Peserta**: Masukkan Nomor Dada (BIB) & PIN peserta yang telah didaftarkan panitia.

---

## 📁 Struktur Direktori

```text
live-tracking/
├── docs/                     # Dokumentasi dan aset mockup aplikasi
│   ├── mockups/              # Tangkapan layar smartphone mockup (390x844 px)
│   └── panduan_rider.md      # Panduan penggunaan untuk peserta gowes
├── public/                   # Aset publik statis & ikon PWA
├── src/
│   ├── assets/               # File GPX rute contoh & ikon
│   ├── components/           # Komponen UI React (Map, Dashboard, Tracker, Logo, dll.)
│   ├── utils/                # Mesin real-time MQTT, GPX parser, offline queue, replay engine
│   ├── App.jsx               # Komponen root aplikasi
│   ├── index.css             # Desain sistem tema Emerald Forest & token styling
│   └── main.jsx              # Entry point aplikasi React
├── Dockerfile                # Multi-stage Dockerfile untuk build produksi & Nginx
├── docker-compose.yml        # Konfigurasi container Docker Compose
├── nginx.conf                # Konfigurasi web server Nginx untuk SPA & PWA caching
├── package.json              # Daftar pustaka dependensi & skrip npm
└── vite.config.js            # Konfigurasi Vite & plugin PWA
```

---

## 📄 Lisensi

Proyek ini dibuat untuk keperluan tracking event sepeda komunitas secara terbuka dan mandiri.
