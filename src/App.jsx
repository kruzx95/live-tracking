/**
 * App.jsx
 * Komponen utama CycloTrack
 * Arsitektur: App (role gate) → MainApp (semua hooks, dirender setelah role dipilih)
 * Ini menghindari React Rules of Hooks violation (tidak boleh early return sebelum hooks)
 */

import { useState } from 'react';
import RoleGate from './components/RoleGate';
import MainApp from './components/MainApp';
import OfflineStatusBanner from './components/OfflineStatusBanner';

export default function App() {
  const [userRole, setUserRole] = useState(null);

  return (
    <>
      {/* Indikator status koneksi — tampil di semua layar */}
      <OfflineStatusBanner />

      {/* Halaman pemilihan peran atau aplikasi utama */}
      {!userRole
        ? <RoleGate onSelectRole={setUserRole} />
        : <MainApp userRole={userRole} onChangeRole={() => setUserRole(null)} />
      }
    </>
  );
}
