import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../contexts/Auth";
import { Button, Card, ErrorBox, LabelledInput } from "../components/ui";

export default function Login() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
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
    <div className="flex min-h-screen items-center justify-center bg-gray-50 p-4">
      <Card className="w-full max-w-sm">
        <h1 className="text-xl font-bold">TeamVote</h1>
        <p className="mb-4 text-sm text-gray-500">Sign in to your evaluation account</p>
        <form onSubmit={submit} className="space-y-3">
          <LabelledInput
            label="Username or email"
            value={identifier}
            onChange={(e) => setIdentifier(e.target.value)}
            required
            autoComplete="username"
          />
          <LabelledInput
            label="Password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            autoComplete="current-password"
          />
          {error && <ErrorBox>{error}</ErrorBox>}
          <Button type="submit" disabled={busy} className="w-full">
            {busy ? "Signing in…" : "Sign in"}
          </Button>
        </form>
      </Card>
    </div>
  );
}
