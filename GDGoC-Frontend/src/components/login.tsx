import { sha256 } from "js-sha256";
import { Bot } from "lucide-react";
import React, { useState } from "react";
import { User } from "stream-chat";
import { Button } from "./ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "./ui/card";
import { Input } from "./ui/input";
import { Label } from "./ui/label";

interface LoginProps {
  onLogin: (user: User, options: { persist: boolean }) => void;
}

const createUserIdFromIdentity = (identity: string): string => {
  const hash = sha256(identity.toLowerCase().trim());
  return `user_${hash.substring(0, 12)}`;
};

const createGuestId = (): string => {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return `guest_${crypto.randomUUID()}`;
  }
  const fallback = sha256(`${Date.now()}-${Math.random()}`);
  return `guest_${fallback.substring(0, 12)}`;
};

export const Login: React.FC<LoginProps> = ({ onLogin }) => {
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (username.trim() && email.trim() && password.trim()) {
      const user = {
        id: createUserIdFromIdentity(email.trim()),
        name: username.trim(),
        email: email.trim(),
        password_hash: sha256(password.trim()),
        is_guest: false,
      };
      onLogin(user, { persist: true });
    }
  };

  const handleGuest = () => {
    const trimmedName = username.trim();
    const user = {
      id: createGuestId(),
      name: trimmedName ? `${trimmedName} (Guest)` : "Guest",
      is_guest: true,
    };
    onLogin(user, { persist: false });
  };

  return (
    <div className="flex h-screen items-center justify-center bg-background p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center space-y-2">
          <div className="w-12 h-12 bg-primary rounded-xl flex items-center justify-center mx-auto">
            <Bot className="h-6 w-6 text-primary-foreground" />
          </div>
          <CardTitle className="text-xl font-semibold">
            Welcome to GDGoC IET-DAVV ChatBot
          </CardTitle>
          <CardDescription className="text-sm text-muted-foreground">
            Enter your username to start chatting with your GDGoC IET-DAVV ChatBot
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="username" className="text-sm font-medium">
                Username
              </Label>
              <Input
                id="username"
                placeholder="Enter your name..."
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                className="h-10"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="email" className="text-sm font-medium">
                Email
              </Label>
              <Input
                id="email"
                type="email"
                placeholder="Enter your email..."
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="h-10"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password" className="text-sm font-medium">
                Password
              </Label>
              <Input
                id="password"
                type="password"
                placeholder="Create a password..."
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="h-10"
              />
            </div>
          </form>
        </CardContent>
        <CardFooter>
          <div className="w-full space-y-3">
            <Button
              onClick={handleSubmit}
              className="w-full h-10"
              disabled={!username.trim() || !email.trim() || !password.trim()}
            >
              Start Chatting
            </Button>
            <div className="text-center text-xs text-muted-foreground">
              or continue without saving chats
            </div>
            <Button
              type="button"
              variant="outline"
              onClick={handleGuest}
              className="w-full h-10"
            >
              Continue as Guest
            </Button>
          </div>
        </CardFooter>
      </Card>
    </div>
  );
};
