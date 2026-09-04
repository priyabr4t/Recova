import { Routes, Route, Navigate } from 'react-router-dom'
import Home from './pages/Home'
import CaseDetail from './pages/CaseDetail'
import DemoControls from './pages/DemoControls'

export default function App() {
  return (
    <div className="min-h-screen">
      <nav className="border-b border-zinc-800 px-6 py-4 flex items-center justify-between">
        <h1 className="text-xl font-bold text-white">Recova</h1>
        <div className="flex gap-6 text-sm">
          <a href="/" className="text-zinc-400 hover:text-white transition">Dashboard</a>
          <a href="/controls" className="text-zinc-400 hover:text-white transition">Demo Controls</a>
        </div>
      </nav>
      <main>
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/cases/:id" element={<CaseDetail />} />
          <Route path="/controls" element={<DemoControls />} />
          <Route path="*" element={<Navigate to="/" />} />
        </Routes>
      </main>
    </div>
  )
}
