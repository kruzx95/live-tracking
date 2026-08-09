/**
 * App.jsx
 * Komponen utama CycloTrack
 * Arsitektur: App (role gate) → MainApp (semua hooks, dirender setelah role dipilih)
 * Ini menghindari React Rules of Hooks violation (tidak boleh early return sebelum hooks)
 */

import { useState } from 'react';
import RoleGate from './components/RoleGate';
import MainApp from './components/MainApp';

export default function App() {
  const [userRole, setUserRole] = useState(null);

  // Tampilkan halaman pemilihan peran
  if (!userRole) {
    return <RoleGate onSelectRole={setUserRole} />;
  }

  // Tampilkan aplikasi utama setelah role dipilih
  return <MainApp userRole={userRole} onChangeRole={() => setUserRole(null)} />;
}
