import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import Admin from "./pages/Admin.jsx";
import AdminGate from "./pages/AdminGate.jsx";
import Guest from "./pages/Guest.jsx";
import "./styles.css";

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<AdminGate><Admin /></AdminGate>} />
        <Route path="/pay" element={<Guest />} />
      </Routes>
    </BrowserRouter>
  </React.StrictMode>
);
