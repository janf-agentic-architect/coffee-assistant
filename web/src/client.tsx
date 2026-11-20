/** @jsxImportSource react */
import { createRoot } from "react-dom/client";
import { MyAssistant } from "./components/MyAssistant";
import { OrdersDashboard } from "./components/OrdersDashboard";

const ordersContainer = document.getElementById("orders-dashboard-root");
if (ordersContainer) {
  createRoot(ordersContainer).render(<OrdersDashboard />);
}

const assistantContainer = document.getElementById("assistant-ui-root");
if (assistantContainer) {
  createRoot(assistantContainer).render(<MyAssistant />);
}
