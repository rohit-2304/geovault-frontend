import React from 'react';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import SenderDashboard from './features/sender/SenderDashboard';
import RecipientDashboard from './features/recipient/RecipientDashboard';

function App() {
  return (
    <Router>
      <Routes>
        <Route path="/" element={<SenderDashboard />} />
        <Route path="/v/:vaultId" element={<RecipientDashboard />} />
      </Routes>
    </Router>
  );
}

export default App;