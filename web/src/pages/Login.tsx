import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../contexts/Auth";
import { Button, Card, ErrorBox, LabelledInput } from "../components/ui";
import { AuthLayout } from "../components/AuthLayout";
import { IconEye, IconEyeOff, } from "../components/icons";

export default function Login() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      await login(identifier, password);
      const me = await (await fetch("/api/auth/me", { credentials: "include" })).json();
      if (me.user?.mustChangePassword) navigate("/change-password");
      else if (me.user?.role === "ADMIN") navigate("/admin");
      else navigate("/rooms");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Login failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <AuthLayout>
      <div className="mb-5">
        <h1 className="text-[22px] font-semibold leading-tight text-ink-950">
          Sign in to TeamVote
        </h1>
        <p className="mt-1.5 text-sm leading-relaxed text-ink-500">
          Use the username or email your organiser gave you.
        </p>
      </div>

      <Card className="p-5 sm:p-6">
        <form onSubmit={submit} className="space-y-4">
          <LabelledInput
            label="Username or email"
            value={identifier}
            onChange={(e) => setIdentifier(e.target.value)}
            required
            autoComplete="username"
            placeholder="you@company.com"
          />
          <LabelledInput
            label="Password"
            type={showPassword ? "text" : "password"}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            autoComplete="current-password"
            placeholder="Enter your password"
            trailing={
              <button
                type="button"
                onClick={() => setShowPassword((visible) => !visible)}
                aria-label={showPassword ? "Hide characters" : "Show characters"}
                title={showPassword ? "Hide password" : "Show password"}
                className="grid h-8 w-8 place-items-center rounded-md text-ink-500 transition-colors hover:bg-ink-100 hover:text-ink-900"
              >
                {showPassword ? <IconEyeOff size={16} /> : <IconEye size={16} />}
              </button>
            }
          />

          {error && <ErrorBox>{error}</ErrorBox>}

          <Button type="submit" disabled={busy} aria-busy={busy} className="mt-1 h-10 w-full">
            {busy ? (
              <>
                <span
                  aria-hidden="true"
                  className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-white/30 border-t-white"
                />
                Signing in…
              </>
            ) : (
              "Sign in"
            )}
          </Button>
        </form>
      </Card>

    </AuthLayout>
  );
}
