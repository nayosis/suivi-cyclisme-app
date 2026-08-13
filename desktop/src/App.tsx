import { useEffect, useState } from "react";
import { RouterProvider } from "@tanstack/react-router";
import { QueryClientProvider } from "@tanstack/react-query";
import { router } from "./router";
import { queryClient } from "./query-client";
import { WelcomeSetup } from "./pages/WelcomeSetup";
import { getCurrentDatabaseFilename, migrateLegacyDatabaseIfNeeded } from "./database-registry";

type DbState = "checking" | "needs-setup" | "ready";

export default function App() {
  const [dbState, setDbState] = useState<DbState>("checking");

  useEffect(() => {
    (async () => {
      await migrateLegacyDatabaseIfNeeded();
      setDbState(getCurrentDatabaseFilename() ? "ready" : "needs-setup");
    })();
  }, []);

  if (dbState === "checking") return null;

  if (dbState === "needs-setup") {
    return <WelcomeSetup onDone={() => setDbState("ready")} />;
  }

  return (
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  );
}
