import React from "react";
import { Navigate, Route, Routes } from "react-router-dom";
import ContentPage from "./ContentPage";
import DashboardPage from "./DashboardPage";
import GovernancePage from "./GovernancePage";
import ResearchPage from "./ResearchPage";
import SchedulerPage from "./SchedulerPage";

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Navigate to="/app/dashboard" replace />} />
      <Route path="/app/dashboard" element={<DashboardPage />} />
      <Route path="/app/scheduler" element={<SchedulerPage />} />
      <Route path="/app/content" element={<ContentPage />} />
      <Route path="/app/research" element={<ResearchPage />} />
      <Route path="/app/governance" element={<GovernancePage />} />
      <Route path="*" element={<div style={{ padding: 24 }}>Not found</div>} />
    </Routes>
  );
}
