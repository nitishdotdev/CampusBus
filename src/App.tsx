import React from "react";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AppProvider } from "./store/AppContext";
import { AppShell } from "./components/layout/AppShell";
import { LandingPage } from "./pages/LandingPage";
import { LoginPage } from "./pages/auth/LoginPage";
import { RoleSelectPage } from "./pages/auth/RoleSelectPage";
import { StudentDashboard } from "./pages/student/StudentDashboard";
import { StudentLiveBuses } from "./pages/student/StudentLiveBuses";
import { StudentRoutes } from "./pages/student/StudentRoutes";
import { StudentNotifications } from "./pages/student/StudentNotifications";
import { StudentProfile } from "./pages/student/StudentProfile";
import { DriverDashboard } from "./pages/driver/DriverDashboard";
import { DriverHistory } from "./pages/driver/DriverHistory";
import { DriverProfile } from "./pages/driver/DriverProfile";
import { AdminDashboard } from "./pages/admin/AdminDashboard";
import { AdminLiveFleet } from "./pages/admin/AdminLiveFleet";
import { AdminBuses } from "./pages/admin/AdminBuses";
import { AdminRoutes } from "./pages/admin/AdminRoutes";
import { AdminDirectory } from "./pages/admin/AdminDirectory";
import { AdminAlerts } from "./pages/admin/AdminAlerts";
import { AdminAnalytics } from "./pages/admin/AdminAnalytics";
import { AdminSettings } from "./pages/admin/AdminSettings";
import { DriverRoute } from "./pages/driver/DriverRoute";
import { DriverNotifications } from "./pages/driver/DriverNotifications";
import { AdminAssignments } from "./pages/admin/AdminAssignments";
import  StudentSchedules  from "./pages/student/StudentSchedules";
import StudentComplaints from "./pages/student/StudentComplaints";
import AdminSchedules from "./pages/admin/AdminSchedules";
import AdminComplaints from "./pages/admin/AdminComplaints";

export default function App() {
  return (
    <AppProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<LandingPage />} />
          <Route path="/roles" element={<RoleSelectPage />} />
          <Route path="/login" element={<LoginPage />} />
          <Route element={<AppShell />}>
            <Route path="/student" element={<StudentDashboard />} />
            <Route path="/student/live" element={<StudentLiveBuses />} />
            <Route path="/student/routes" element={<StudentRoutes />} />
            <Route path="/student/schedules" element={<StudentSchedules />} />
            <Route path="/student/complaints" element={<StudentComplaints />} />
            <Route
              path="/student/notifications"
              element={<StudentNotifications />}
            />
            <Route path="/student/profile" element={<StudentProfile />} />
            <Route path="/driver" element={<DriverDashboard />} />
            <Route path="/driver/route" element={<DriverRoute />} />
            <Route path="/driver/history" element={<DriverHistory />} />
            <Route path="/driver/notifications" element={<DriverNotifications />} />
            <Route path="/driver/profile" element={<DriverProfile />} />
            <Route path="/admin" element={<AdminDashboard />} />
            <Route path="/admin/fleet" element={<AdminLiveFleet />} />
            <Route path="/admin/buses" element={<AdminBuses />} />
            <Route path="/admin/routes" element={<AdminRoutes />} />
            <Route path="/admin/assignments" element={<AdminAssignments />} />
            <Route path="/admin/directory" element={<AdminDirectory />} />
            <Route path="/admin/alerts" element={<AdminAlerts />} />
            <Route path="/admin/analytics" element={<AdminAnalytics />} />
            <Route path="/admin/settings" element={<AdminSettings />} />
            <Route path="/admin/schedules" element={<AdminSchedules />} />
            <Route path="/admin/complaints" element={<AdminComplaints />} />
          </Route>
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </AppProvider>
  );
}
