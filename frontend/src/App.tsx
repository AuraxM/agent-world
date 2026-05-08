import { BrowserRouter, Routes, Route } from "react-router-dom";
import HomePage from "@/routes/home";
import AdminPage from "@/routes/admin";

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/admin" element={<AdminPage />} />
      </Routes>
    </BrowserRouter>
  );
}
