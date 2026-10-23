import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../contexts/Auth";
import { Button, Card, ErrorBox, LabelledInput } from "../components/ui";
import { api, ApiError } from "../lib/api";

export default function ChangePassword() {
  const { user, refresh } = useAuth();
  const navigate = useNavigate();
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (next.length < 10) return setError("New password must be at least 10 characters");
    setBusy(true);
    try {
      await api("/auth/change-password", { body: { currentPassword: current, newPassword: next } });
      await refresh();
      navigate(user?.role === "ADMIN" ? "/admin" : "/rooms");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not change password");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50 p-4">
      <Card className="w-full max-w-sm">
        <h1 className="text-xl font-bold">Set a new password</h1>
        <p className="mb-4 text-sm text-gray-500">
          Your account uses a temporary password. Choose a permanent one to continue.
        </p>
        <form onSubmit={submit} className="space-y-3">
          <LabelledInput label="Temporary password" type="password" value={current} onChange={(e) => setCurrent(e.target.value)} required autoComplete="current-password" />
          <LabelledInput label="New password (min 10 chars)" type="password" value={next} onChange={(e) => setNext(e.target.value)} required autoComplete="new-password" />
          {error && <ErrorBox>{error}</ErrorBox>}
          <Button type="submit" disabled={busy} className="w-full">{busy ? "Saving…" : "Save password"}</Button>
        </form>
      </Card>
    </div>
  );
}
