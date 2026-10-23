import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { api, ApiError } from "../lib/api";
import { Spinner } from "../components/Spinner";
import { Button, Card, ErrorBox } from "../components/ui";

/** Auto-joins via invite link /join/:code, then enters the room. */
export default function JoinByCode() {
  const { code } = useParams<{ code: string }>();
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api<{ room: { id: string } }>("/rooms/join", { body: { code } })
      .then(({ room }) => navigate(`/room/${room.id}`, { replace: true }))
      .catch((e) => setError(e instanceof ApiError ? e.message : "Could not join"));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [code]);

  return (
    <div className="flex min-h-screen items-center justify-center p-4">
      <Card className="max-w-sm">
        {error ? (
          <>
            <ErrorBox>{error}</ErrorBox>
            <Button className="mt-3" onClick={() => navigate("/rooms")}>Back</Button>
          </>
        ) : (
          <Spinner text="Joining room…" />
        )}
      </Card>
    </div>
  );
}
