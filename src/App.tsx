import { BrowserRouter, Routes, Route } from 'react-router-dom';
import Layout from './components/Layout';
import ProtectedRoute from './components/ProtectedRoute';
import Dashboard from './pages/Dashboard';
import PreTrips from './pages/PreTrips';
import FLHA from './pages/FLHA';
import Documents from './pages/Documents';
import Equipment from './pages/Equipment';
import Assets from './pages/Assets';
import Fuel from './pages/Fuel';
import Issues from './pages/Issues';
import Inventory from './pages/Inventory';
import Tasks from './pages/Tasks';
import CRM from './pages/CRM';
import CrmAccountDetail from './pages/CrmAccountDetail';
import Time from './pages/Time';
import Team from './pages/Team';
import Account from './pages/Account';

function App() {
  return (
    <BrowserRouter>
      <Layout>
        <Routes>
          <Route
            path="/"
            element={
              <ProtectedRoute>
                <Dashboard />
              </ProtectedRoute>
            }
          />
          <Route
            path="/pre-trips"
            element={
              <ProtectedRoute>
                <PreTrips />
              </ProtectedRoute>
            }
          />
          <Route
            path="/flha"
            element={
              <ProtectedRoute>
                <FLHA />
              </ProtectedRoute>
            }
          />
          <Route
            path="/documents"
            element={
              <ProtectedRoute>
                <Documents />
              </ProtectedRoute>
            }
          />
          <Route
            path="/assets"
            element={
              <ProtectedRoute>
                <Assets />
              </ProtectedRoute>
            }
          />
          <Route
            path="/equipment"
            element={
              <ProtectedRoute>
                <Equipment />
              </ProtectedRoute>
            }
          />
          <Route
            path="/fuel"
            element={
              <ProtectedRoute>
                <Fuel />
              </ProtectedRoute>
            }
          />
          <Route
            path="/issues"
            element={
              <ProtectedRoute>
                <Issues />
              </ProtectedRoute>
            }
          />
          <Route
            path="/inventory"
            element={
              <ProtectedRoute>
                <Inventory />
              </ProtectedRoute>
            }
          />
          <Route
            path="/tasks"
            element={
              <ProtectedRoute>
                <Tasks />
              </ProtectedRoute>
            }
          />
          <Route
            path="/crm"
            element={
              <ProtectedRoute>
                <CRM />
              </ProtectedRoute>
            }
          />
          <Route
            path="/crm/accounts/:accountId"
            element={
              <ProtectedRoute>
                <CrmAccountDetail />
              </ProtectedRoute>
            }
          />
          <Route
            path="/time"
            element={
              <ProtectedRoute>
                <Time />
              </ProtectedRoute>
            }
          />
          <Route
            path="/team"
            element={
              <ProtectedRoute>
                <Team />
              </ProtectedRoute>
            }
          />
          <Route
            path="/account"
            element={
              <ProtectedRoute>
                <Account />
              </ProtectedRoute>
            }
          />
        </Routes>
      </Layout>
    </BrowserRouter>
  );
}

export default App;
