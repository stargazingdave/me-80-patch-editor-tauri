import { createRoot } from "react-dom/client";
import App from "./app/App";
import "./styles/global.css";

const root = document.getElementById("root");
if (!root) throw new Error("React root element was not found.");

createRoot(root).render(<App />);
