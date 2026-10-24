import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../contexts/Auth";
import { Button, Card, ErrorBox, LabelledInput } from "../components/ui";
import { AuthLayout } from "../components/AuthLayout";
import { IconEye, IconEyeOff, IconShield, IconSparkles } from "../components/icons";

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
      <div className="mb-7">
        <span className="inline-flex items-center gap-1.5 rounded-full bg-brand-50 px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.15em] text-brand-600 ring-1 ring-inset ring-brand-100">
          <IconSparkles size={12} />
          Welcome back
        </span>
        <h1 className="mt-4 font-display text-[2rem] font-semibold leading-tight tracking-tight text-ink-950">
          Sign in to your workspace
        </h1>
        <p className="mt-2 text-sm leading-relaxed text-ink-500">
          Pick up where your team left off — score live rounds, follow results, and keep the
          evaluation moving.
        </p>
      </div>

      <Card className="p-5 shadow-lift sm:p-6">
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
                className="grid h-8 w-8 place-items-center rounded-lg text-ink-400 transition hover:bg-ink-100 hover:text-ink-700"
              >
                {showPassword ? <IconEyeOff size={16} /> : <IconEye size={16} />}
              </button>
            }
          />

          {error && <ErrorBox>{error}</ErrorBox>}

          <Button type="submit" disabled={busy} aria-busy={busy} className="mt-1 w-full py-3">
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

      <div className="mt-6 flex items-start gap-2.5 rounded-xl border border-line bg-white/60 px-3.5 py-3">
        <IconShield size={16} className="mt-0.5 shrink-0 text-jade-500" />
        <p className="text-[11px] leading-relaxed text-ink-500">
          Your session is protected with secure, HTTP-only cookies. Temporary passwords must be
          replaced on first sign-in.
        </p>
      </div>
    </AuthLayout>
  );
}
