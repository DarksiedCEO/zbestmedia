import React from "react";
import { Navigate, Route, Routes } from "react-router-dom";
import AaliyahPage from "./AaliyahPage";
import ContentPage from "./ContentPage";
import DashboardPage from "./DashboardPage";
import GmailOAuthCallbackPage from "./GmailOAuthCallbackPage";
import GovernancePage from "./GovernancePage";
import ResearchPage from "./ResearchPage";
import SchedulerPage from "./SchedulerPage";

export default function App() {
  return (
    <Routes>
      <Route path="/oauth/google/callback" element={<GmailOAuthCallbackPage />} />
      <Route path="/" element={<Navigate to="/app/aaliyah" replace />} />
      <Route path="/app/aaliyah" element={<AaliyahPage />} />
      <Route path="/app/dashboard" element={<DashboardPage />} />
      <Route path="/app/scheduler" element={<SchedulerPage />} />
      <Route path="/app/content" element={<ContentPage />} />
      <Route path="/app/research" element={<ResearchPage />} />
      <Route path="/app/governance" element={<GovernancePage />} />
      <Route path="*" element={<div style={{ padding: 24 }}>Not found</div>} />
    </Routes>
  );
}
