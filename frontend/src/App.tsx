import { Routes, Route } from "react-router-dom";
import { CharacterSelectPage } from "./pages/CharacterSelectPage";
import { BuildScreenPage } from "./pages/BuildScreenPage";
import { MyBuildsPage } from "./pages/MyBuildsPage";
import { ChatPage } from "./pages/ChatPage";
import { Header } from "./components/Header";

function App() {
  return (
    <div className="min-h-screen bg-bg">
      <Header />
      <Routes>
        <Route path="/" element={<CharacterSelectPage />} />
        <Route path="/build/:characterId" element={<BuildScreenPage />} />
        <Route path="/builds" element={<MyBuildsPage />} />
        <Route path="/chat" element={<ChatPage />} />
      </Routes>
    </div>
  );
}

export default App;
