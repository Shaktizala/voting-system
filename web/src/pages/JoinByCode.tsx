import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { api, ApiError } from "../lib/api";
import { Button, Card, ErrorBox } from "../components/ui";
import { Spinner } from "../components/Spinner";
import { IconArrowLeft, IconKey, IconLock } from "../components/icons";

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
    <div className="flex min-h-[60vh] items-center justify-center py-6">
      <Card className="w-full max-w-md overflow-hidden p-6 text-center shadow-lift sm:p-8">
        <div className="flex items-center justify-center gap-2">
          <span className="grid h-10 w-10 place-items-center rounded-xl bg-brand-50 text-brand-600 ring-1 ring-inset ring-brand-100">
            <IconKey size={18} />
          </span>
          <span className="rounded-full bg-ink-100 px-2.5 py-1 font-mono text-[11px] font-semibold tracking-[0.16em] text-ink-600">
            {code?.toUpperCase()}
          </span>
        </div>

        {error ? (
          <>
            <h1 className="mt-4 font-display text-xl font-semibold text-ink-950">Couldn't join this room</h1>
            <p className="mt-1.5 text-sm leading-relaxed text-ink-500">
              The invite may have expired, been disabled, or your account may not have access.
            </p>
            <div className="mt-4 text-left">
              <ErrorBox>{error}</ErrorBox>
            </div>
            <Button className="mt-4 w-full" onClick={() => navigate("/rooms")}>
              <IconArrowLeft size={15} />
              Back to my rooms
            </Button>
          </>
        ) : (
          <>
            <div className="mx-auto mt-5 w-fit">
              <Spinner compact text="Joining room…" />
            </div>
            <h1 className="mt-2 font-display text-xl font-semibold text-ink-950">Opening the room</h1>
            <p className="mt-1.5 text-sm leading-relaxed text-ink-500">
              Verifying your invite and taking you to the live evaluation.
            </p>
            <p className="mt-5 flex items-center justify-center gap-1.5 text-[11px] text-ink-400">
              <IconLock size={12} />
              Secured by your session
            </p>
          </>
        )}
      </Card>
    </div>
  );
}
