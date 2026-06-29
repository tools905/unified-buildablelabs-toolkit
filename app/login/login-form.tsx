"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createClient } from "@/lib/supabase/client";

export function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [mode, setMode] = useState<"login" | "signup" | "forgot_password">("login");
  const [message, setMessage] = useState("");
  const [isSuccess, setIsSuccess] = useState(false);
  const [loading, setLoading] = useState(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setLoading(true);
    setMessage("");
    setIsSuccess(false);
    const supabase = createClient();
    const next = searchParams.get("next") ?? "/dashboard";

    let errorMsg = "";
    if (mode === "login") {
      const result = await supabase.auth.signInWithPassword({ email, password });
      if (result.error) errorMsg = result.error.message;
    } else if (mode === "signup") {
      const result = await supabase.auth.signUp({
        email,
        password,
        options: { data: { full_name: fullName } },
      });
      if (result.error) errorMsg = result.error.message;
    } else if (mode === "forgot_password") {
      const result = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/auth/callback?next=/reset-password`,
      });
      if (result.error) {
        errorMsg = result.error.message;
      } else {
        setIsSuccess(true);
        setMessage("Check your email for the password reset link!");
        setLoading(false);
        return;
      }
    }

    setLoading(false);
    if (errorMsg) {
      setMessage(errorMsg);
      return;
    }

    router.push(next);
    router.refresh();
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      {mode === "signup" ? (
        <div className="space-y-2">
          <Label htmlFor="fullName">Full name</Label>
          <Input
            id="fullName"
            value={fullName}
            onChange={(event) => setFullName(event.target.value)}
            placeholder="Aarav Sharma"
          />
        </div>
      ) : null}
      <div className="space-y-2">
        <Label htmlFor="email">Email</Label>
        <Input
          id="email"
          type="email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          required
        />
      </div>
      {mode !== "forgot_password" ? (
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label htmlFor="password">Password</Label>
            {mode === "login" ? (
              <Button
                type="button"
                variant="ghost"
                className="px-0 py-0 h-auto font-normal text-xs text-muted-foreground hover:text-primary hover:bg-transparent underline hover:underline"
                onClick={() => {
                  setMode("forgot_password");
                  setMessage("");
                  setIsSuccess(false);
                }}
              >
                Forgot password?
              </Button>
            ) : null}
          </div>
          <Input
            id="password"
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            minLength={6}
            required
          />
        </div>
      ) : null}
      {message ? (
        <p className={`text-sm ${isSuccess ? "text-green-600 dark:text-green-400 font-medium" : "text-destructive"}`}>
          {message}
        </p>
      ) : null}
      <Button className="w-full" disabled={loading}>
        {loading
          ? "Working..."
          : mode === "login"
          ? "Log in"
          : mode === "signup"
          ? "Sign up"
          : "Send reset link"}
      </Button>
      {mode === "forgot_password" ? (
        <Button
          type="button"
          variant="ghost"
          className="w-full"
          onClick={() => {
            setMode("login");
            setMessage("");
            setIsSuccess(false);
          }}
        >
          Back to log in
        </Button>
      ) : (
        <Button
          type="button"
          variant="ghost"
          className="w-full"
          onClick={() => {
            setMode(mode === "login" ? "signup" : "login");
            setMessage("");
            setIsSuccess(false);
          }}
        >
          {mode === "login" ? "Create an account" : "Use existing account"}
        </Button>
      )}
    </form>
  );
}
