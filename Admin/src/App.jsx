import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import AuthGuard from "./auth/AuthGuard.jsx";
import AppLayout from "./layout/AppLayout.jsx";
import LoginPage from "./pages/LoginPage.jsx";
import SignupPage from "./pages/SignupPage.jsx";
import VerifyEmailPage from "./pages/VerifyEmailPage.jsx";
import DashboardPage from "./pages/DashboardPage.jsx";
import PlacesPage from "./pages/PlacesPage.jsx";
import PendingNewPage from "./pages/PendingNewPage.jsx";
import PendingEditsPage from "./pages/PendingEditsPage.jsx";
import EventsPage from "./pages/EventsPage.jsx";
import EventEditsPage from "./pages/EventEditsPage.jsx";
import EidPage from "./pages/EidPage.jsx";
import ReviewsPage from "./pages/ReviewsPage.jsx";
import WishesPage from "./pages/WishesPage.jsx";
import ContactsPage from "./pages/ContactsPage.jsx";
import SocialVideosPage from "./pages/SocialVideosPage.jsx";
import LogPage from "./pages/LogPage.jsx";
import TypeStylesPage from "./pages/TypeStylesPage.jsx";
import AppSettingsPage from "./pages/AppSettingsPage.jsx";
import WebsiteTeamPage from "./pages/WebsiteTeamPage.jsx";
import WebsiteSubscribersPage from "./pages/WebsiteSubscribersPage.jsx";
import WebsiteContentPage from "./pages/WebsiteContentPage.jsx";

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/signup" element={<SignupPage />} />
        <Route path="/verify-email" element={<VerifyEmailPage />} />

        <Route element={<AuthGuard />}>
          <Route element={<AppLayout />}>
            <Route index element={<DashboardPage />} />
            <Route path="/places" element={<PlacesPage />} />
            <Route path="/submissions/new" element={<PendingNewPage />} />
            <Route path="/submissions/edits" element={<PendingEditsPage />} />
            <Route path="/events" element={<EventsPage />} />
            <Route path="/events/edits" element={<EventEditsPage />} />
            <Route path="/eid" element={<EidPage />} />
            <Route path="/reviews" element={<ReviewsPage />} />
            <Route path="/wishes" element={<WishesPage />} />
            <Route path="/contacts" element={<ContactsPage />} />
            <Route path="/social-videos" element={<SocialVideosPage />} />
            <Route path="/type-styles" element={<TypeStylesPage />} />
            <Route path="/app-settings" element={<AppSettingsPage />} />
            <Route path="/log" element={<LogPage />} />
            <Route path="/website/team" element={<WebsiteTeamPage />} />
            <Route path="/website/subscribers" element={<WebsiteSubscribersPage />} />
            <Route path="/website/content" element={<WebsiteContentPage />} />
          </Route>
        </Route>

        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
