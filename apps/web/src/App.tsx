import { Navigate, Route, Routes } from "react-router-dom";
import { BrandsList } from "./routes/BrandsList";
import { BrandGraphView } from "./routes/BrandGraphView";

export function App() {
  return (
    <div className="app-shell">
      <header className="app-header">
        <div>
          <div className="app-title">ZBestMedia</div>
          <div className="app-subtitle">Brandgraph control surface</div>
        </div>
      </header>

      <main className="app-main">
        <Routes>
          <Route path="/" element={<Navigate to="/brands" replace />} />
          <Route path="/brands" element={<BrandsList />} />
          <Route path="/brands/:id" element={<BrandGraphView />} />
          <Route path="*" element={<Navigate to="/brands" replace />} />
        </Routes>
      </main>
    </div>
  );
}
