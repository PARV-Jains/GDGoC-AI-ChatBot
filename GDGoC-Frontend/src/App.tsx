import { AuthenticatedApp } from "@/components/authenticated-app";
import { Login } from "@/components/login";
import { Toaster } from "@/components/ui/toaster";
import { ThemeProvider } from "@/providers/theme-provider";
import { useEffect, useState } from "react";
import { User } from "stream-chat";

const USER_STORAGE_KEY = "chat-ai-app-user";

function App() {
  const [user, setUser] = useState<User | null>(() => {
    const savedUser = localStorage.getItem(USER_STORAGE_KEY);
    return savedUser ? JSON.parse(savedUser) : null;
  });

  const backendUrl = import.meta.env.VITE_BACKEND_URL as string;

  const handleUserLogin = (
    authenticatedUser: User,
    options: { persist: boolean }
  ) => {
    const avatarUrl = `https://api.dicebear.com/9.x/avataaars/svg?seed=${authenticatedUser.name}`;
    const userWithImage = {
      ...authenticatedUser,
      image: avatarUrl,
    };
    if (options.persist) {
      localStorage.setItem(USER_STORAGE_KEY, JSON.stringify(userWithImage));
    }
    setUser(userWithImage);
  };

  const handleLogout = async () => {
    if (user && (user as { is_guest?: boolean }).is_guest) {
      try {
        await fetch(`${backendUrl}/guest-cleanup`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ userId: user.id }),
        });
      } catch (error) {
        console.error("Failed to cleanup guest session", error);
      }
    }
    localStorage.removeItem(USER_STORAGE_KEY);
    setUser(null);
  };

  useEffect(() => {
    if (!user || !(user as { is_guest?: boolean }).is_guest) {
      return;
    }

    const handleUnload = () => {
      if (!backendUrl) return;
      const payload = JSON.stringify({ userId: user.id });
      const blob = new Blob([payload], { type: "application/json" });
      navigator.sendBeacon(`${backendUrl}/guest-cleanup`, blob);
    };

    window.addEventListener("beforeunload", handleUnload);
    return () => window.removeEventListener("beforeunload", handleUnload);
  }, [backendUrl, user]);

  return (
    <ThemeProvider defaultTheme="dark" storageKey="vite-ui-theme">
      <div className="h-screen bg-background">
        {user ? (
          <AuthenticatedApp user={user} onLogout={handleLogout} />
        ) : (
          <Login onLogin={handleUserLogin} />
        )}

        <Toaster />
      </div>
    </ThemeProvider>
  );
}

export default App;
