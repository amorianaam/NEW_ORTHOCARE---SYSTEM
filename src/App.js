import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { ToastContainer } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';

// ── Auth & Layout ──────────────────────────────────────────────────
import Login           from './screens/Login';
import ProtectedRoute  from './components/ProtectedRoute';
import StandaloneViewerScreen from './screens/StandaloneViewerScreen';

// ── Secretary ─────────────────────────────────────────────────────
import RegisterPatient from './screens/RegisterPatient';
import PatientsList    from './screens/PatientsList';
import SecretaryDashboard from './screens/SecretaryDashboard';

// ── Doctor ────────────────────────────────────────────────────────
import DoctorQueue      from './screens/DoctorQueue';
import UserManagement   from './screens/UserManagement';
import AuditLog         from './screens/doctor/AuditLog';
import SystemSettings   from './screens/doctor/SystemSettings';
import PersonalSettings from './screens/PersonalSettings';
import DoctorDashboard  from './screens/doctor/Dashboard';
import VIPCases         from './screens/doctor/VIPCases';
import PatientsArchive  from './screens/doctor/PatientsArchive';
import DoctorReports    from './screens/doctor/Reports';
import DoctorFavorites  from './screens/doctor/Favorites';
import Layout           from './components/Layout';


// ── Cashier ───────────────────────────────────────────────────────
import GeneralTransactions from './screens/cashier/GeneralTransactions';
import CashierStats     from './screens/cashier/CashierStats';
import DailyFinancialBoard from './screens/cashier/DailyFinancialBoard';
import CashierArchive   from './screens/cashier/CashierArchive';
import CashierReports   from './screens/cashier/CashierReports';

// ── Lab ───────────────────────────────────────────────────────────
import LabRequests      from './screens/lab/LabRequests';
import LaboratoryDashboard from './screens/lab/LaboratoryDashboard';
import LabInventory     from './screens/lab/LabInventory';

// ── Radiology ─────────────────────────────────────────────────────
import RadiologyRequests from './screens/radiology/RadiologyRequests';
import RadiologyDashboard from './screens/radiology/RadiologyDashboard';
import RadiologyInventory from './screens/radiology/RadiologyInventory';

// ── Surgery Coordinator ─────────────────────────────────────────────
import SurgeryCoordinator from './screens/surgery/SurgeryCoordinator';

// ── General Store ─────────────────────────────────────────────────
import GeneralStoreItems from './screens/generalStore/Items';
import GeneralStoreDashboard from './screens/generalStore/Dashboard';
import GeneralStoreReceive from './screens/generalStore/Receive';
import GeneralStoreIssue from './screens/generalStore/Issue';
import GeneralStoreStocktaking from './screens/generalStore/Stocktaking';

// ── OR Store ──────────────────────────────────────────────────────
import OrStoreDashboard from './screens/orStore/Dashboard';
import OrStoreItems from './screens/orStore/Items';
import OrStoreReceive from './screens/orStore/Receive';
import OrStoreIssue from './screens/orStore/Issue';
import OrStoreManufacturing from './screens/orStore/Manufacturing';
import OrStoreStocktaking from './screens/orStore/Stocktaking';

// ── Auditor ────────────────────────────────────────────────────────
import AuditorDashboard from './screens/auditor/Dashboard';
import AuditorFinancial from './screens/auditor/Financial';
import AuditorSurgery from './screens/auditor/Surgery';
import AuditorPatients from './screens/auditor/Patients';
import AuditorDiagnostics from './screens/auditor/Diagnostics';
import AuditorInventory from './screens/auditor/Inventory';
import AuditorAuditLog from './screens/auditor/AuditLog';
import MedicationsCatalog from './screens/auditor/MedicationsCatalog';
import ClinicalServicesCatalog from './screens/auditor/ClinicalServicesCatalog';
import SurgeryPrepCatalog from './screens/auditor/SurgeryPrepCatalog';
import AuditorLabCatalog from './screens/auditor/LabCatalog';
import AuditorRadiologyCatalog from './screens/auditor/RadiologyCatalog';
import RadiologyInventoryAdmin from './screens/auditor/RadiologyInventoryAdmin';
import LabInventoryAdmin from './screens/auditor/LabInventoryAdmin';

// ── Placeholder ────────────────────────────────────────────────────
const Coming = ({ title }) => (
  <div className="flex flex-col items-center justify-center h-64 text-gray-400">
    <div className="w-16 h-16 rounded-2xl bg-gray-100 flex items-center justify-center mb-4 text-3xl">🚧</div>
    <p className="font-bold text-gray-600 text-lg">{title}</p>
    <p className="text-sm mt-1">هذه الشاشة قيد التطوير</p>
  </div>
);

function App() {
  return (
    <Router>
      <Routes>
        {/* ── Public ── */}
        <Route path="/login" element={<Login />} />
        <Route path="/standalone-viewer" element={<StandaloneViewerScreen />} />
        <Route path="/"      element={<Navigate to="/login" replace />} />

        {/* 🤖 Secretary 🤖 */}
        <Route element={<ProtectedRoute allowedRoles={['secretary']} />}>
          <Route element={<Layout />}>
            <Route path="/secretary/dashboard"     element={<SecretaryDashboard />} />
            <Route path="/secretary/register"      element={<RegisterPatient />} />
            <Route path="/secretary/patients"      element={<PatientsList />} />
          </Route>
        </Route>

        {/* 🤖 Cashier 🤖 */}
        <Route element={<ProtectedRoute allowedRoles={['cashier']} />}>
          <Route element={<Layout />}>
            <Route path="/cashier/board"     element={<DailyFinancialBoard />} />
            <Route path="/cashier/general"   element={<GeneralTransactions />} />
            <Route path="/cashier/archive"   element={<CashierArchive />} />
            <Route path="/cashier/reports"   element={<CashierReports />} />
            <Route path="/cashier/stats"     element={<CashierStats />} />
            <Route path="/cashier" element={<Navigate to="/cashier/board" replace />} />
          </Route>
        </Route>

        {/* ── Doctor ── */}
        <Route element={<ProtectedRoute allowedRoles={['doctor']} />}>
          <Route element={<Layout />}>
            {/* Clinical */}
            <Route path="/doctor/dashboard"        element={<DoctorDashboard />} />
            <Route path="/doctor/queue"            element={<DoctorQueue />} />
            <Route path="/doctor/vip"              element={<VIPCases />} />
            <Route path="/doctor/archive"          element={<PatientsArchive />} />
            <Route path="/doctor/reports"          element={<DoctorReports />} />
            <Route path="/doctor/favorites"        element={<DoctorFavorites />} />
            {/* Default redirect */}
            <Route path="/doctor" element={<Navigate to="/doctor/dashboard" replace />} />
          </Route>
        </Route>


        <Route element={<ProtectedRoute allowedRoles={['lab']} />}>
          <Route element={<Layout />}>
            {/* Unified Dashboard */}
            <Route path="/lab/dashboard" element={<LaboratoryDashboard />} />

            {/* Sub-Store Inventory & Handshake */}
            <Route path="/lab/inventory" element={<LabInventory />} />
            
            {/* Reports (Kept separate per user request) */}
            <Route path="/lab/reports" element={<LabRequests tab="reports" />} />
            
            <Route path="/lab" element={<Navigate to="/lab/dashboard?tab=pending" replace />} />
          </Route>
        </Route>

        {/* ── Radiology ── */}
        <Route element={<ProtectedRoute allowedRoles={['radiology']} />}>
          <Route element={<Layout />}>
            {/* Unified Dashboard */}
            <Route path="/radiology/dashboard" element={<RadiologyDashboard />} />
            
            {/* Sub-Store Inventory & Handshake */}
            <Route path="/radiology/inventory" element={<RadiologyInventory />} />
            
            {/* Legacy Fallback Redirects (Phase 1) */}
            <Route path="/radiology/pending" element={<Navigate to="/radiology/dashboard?tab=pending" replace />} />
            <Route path="/radiology/in-progress" element={<Navigate to="/radiology/dashboard?tab=in_progress" replace />} />
            <Route path="/radiology/completed" element={<Navigate to="/radiology/dashboard?tab=completed" replace />} />
            
            {/* Kept separate per user request */}
            <Route path="/radiology/reports" element={<RadiologyRequests tab="reports" />} />
            
            <Route path="/radiology" element={<Navigate to="/radiology/dashboard?tab=pending" replace />} />
          </Route>
        </Route>

        {/* ── Surgery Coordinator ── */}
        <Route element={<ProtectedRoute allowedRoles={['surgery_coordinator']} />}>
          <Route element={<Layout />}>
            <Route path="/surgery/operations" element={<SurgeryCoordinator />} />
            <Route path="/surgery" element={<Navigate to="/surgery/operations" replace />} />
          </Route>
        </Route>

        {/* ── Stores ── */}
        <Route element={<ProtectedRoute allowedRoles={['or_store']} />}>
          <Route element={<Layout />}>
            <Route path="/or-store/dashboard"     element={<OrStoreDashboard />} />
            <Route path="/or-store/items"         element={<OrStoreItems />} />
            <Route path="/or-store/receive"       element={<OrStoreReceive />} />
            <Route path="/or-store/issue"         element={<OrStoreIssue />} />
            <Route path="/or-store/manufacturing" element={<OrStoreManufacturing />} />
            <Route path="/or-store/stocktaking"   element={<OrStoreStocktaking />} />
            <Route path="/or-store" element={<Navigate to="/or-store/dashboard" replace />} />
          </Route>
        </Route>
        <Route element={<ProtectedRoute allowedRoles={['general_store']} />}>
          <Route element={<Layout />}>
            <Route path="/general-store/dashboard"     element={<GeneralStoreDashboard />} />
            <Route path="/general-store/items"         element={<GeneralStoreItems />} />
            <Route path="/general-store/receive"       element={<GeneralStoreReceive />} />
            <Route path="/general-store/issue"         element={<GeneralStoreIssue />} />
            <Route path="/general-store/stocktaking"   element={<GeneralStoreStocktaking />} />
            <Route path="/general-store" element={<Navigate to="/general-store/dashboard" replace />} />
          </Route>
        </Route>

        {/* ── Auditor ── */}
        <Route element={<ProtectedRoute allowedRoles={['auditor']} />}>
          <Route element={<Layout />}>
            {/* Reports & Analytics */}
            <Route path="/auditor/dashboard"     element={<AuditorDashboard />} />
            <Route path="/auditor/financial"     element={<AuditorFinancial />} />
            <Route path="/auditor/surgery"       element={<AuditorSurgery />} />
            <Route path="/auditor/patients"       element={<AuditorPatients />} />
            <Route path="/auditor/diagnostics"   element={<AuditorDiagnostics />} />
            <Route path="/auditor/inventory"     element={<AuditorInventory />} />
            <Route path="/auditor/audit"         element={<AuditorAuditLog />} />

            {/* System Management */}
            <Route path="/auditor/users"            element={<UserManagement />} />
            <Route path="/auditor/catalog/medications" element={<MedicationsCatalog />} />
            <Route path="/auditor/catalog/clinical"    element={<ClinicalServicesCatalog />} />
            <Route path="/auditor/catalog/surgery-prep" element={<SurgeryPrepCatalog />} />
            <Route path="/auditor/catalog/lab"      element={<AuditorLabCatalog />} />
            <Route path="/auditor/lab-inventory"    element={<LabInventoryAdmin />} />
            <Route path="/auditor/catalog/radiology"element={<AuditorRadiologyCatalog />} />
            <Route path="/auditor/radiology-inventory" element={<RadiologyInventoryAdmin />} />
            <Route path="/auditor/system-settings"  element={<SystemSettings />} />
            <Route path="/auditor/audit-log"        element={<AuditLog />} />

            <Route path="/auditor" element={<Navigate to="/auditor/dashboard" replace />} />
          </Route>
        </Route>

        {/* ── Global Settings ── */}
        <Route element={<ProtectedRoute allowedRoles={['doctor','secretary','cashier','lab','radiology','surgery_coordinator','or_store','general_store','auditor']} />}>
          <Route element={<Layout />}>
            <Route path="/settings" element={<PersonalSettings />} />
          </Route>
        </Route>


        <Route path="*" element={<Navigate to="/login" replace />} />
      </Routes>

      <ToastContainer
        style={{ zIndex: 9999999999 }}
        className="!z-[99999999]"
        toastClassName="!z-[99999999]"
        position="bottom-right"
        rtl={true}
        autoClose={4000}
        hideProgressBar={false}
        newestOnTop
        closeOnClick
        pauseOnHover
        theme="colored"
        limit={3}
      />
    </Router>
  );
}

export default App;
