import { Routes, Route } from "react-router-dom";
import { CharacterSelectPage } from "./pages/CharacterSelectPage";
import { BuildScreenPage } from "./pages/BuildScreenPage";

function App() {
  return (
    <div className="min-h-screen bg-bg">
      <Routes>
        <Route path="/" element={<CharacterSelectPage />} />
        <Route path="/build/:characterId" element={<BuildScreenPage />} />
      </Routes>
    </div>
  );
}

export default App;
