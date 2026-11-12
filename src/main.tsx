import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";
import { installerMessagesErreur } from "./lib/erreurs";
import { installerSignalementErreurs } from "./lib/signalement-erreurs";
import { rpcPlateforme } from "./lib/rpc-plateforme";

installerMessagesErreur();
installerSignalementErreurs(args => rpcPlateforme<null>('erreur_signaler', args));

createRoot(document.getElementById("root")!).render(<App />);
