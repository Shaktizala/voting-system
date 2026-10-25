import { parse } from "papaparse";
import { Prisma } from "@prisma/client";
import { env } from "../config";
import { teamRepo } from "../repositories/team.repo";
import { userRepo } from "../repositories/user.repo";
import { roomRepo } from "../repositories/room.repo";
import { audit } from "../repositories/audit.repo";
import { authService } from "./auth.service";
import { deriveVotingState, roomService } from "./room.service";
import { rtEvents } from "../realtime/emit";
import { badRequest, conflict } from "../utils/errors";
import { sanitizeText } from "../utils/sanitize";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const USERNAME_RE = /^[a-z0-9._-]{3,60}$/;
const TEMPLATE_HEADER = [
  "team_name",
  "team_description",
  "project_title",
  "participant_name",
  "participant_email",
  "participant_username",
  "participant_role",
] as const;

type ImportRole = "PARTICIPANT" | "MODERATOR";

interface ParsedRow {
  teamName: string;
  teamDescription: string;
  projectTitle: string;
  participantName: string;
  participantEmail: string;
  participantUsername: string;
  participantRole: string;
  hasParticipant: boolean;
}

export interface ImportParticipant {
  name: string;
  email: string;
  username: string;
  role: ImportRole;
  /** Set when the person already exists and can be assigned to the new team. */
  existingUserId?: string;
}

export interface ImportRowReport {
  row: number;
  teamName?: string;
  teamDescription?: string;
  projectTitle?: string;
  participant?: ImportParticipant;
  valid: boolean;
  errors: string[];
}

interface TeamGroup {
  key: string;
  name: string;
  description: string;
  projectTitle: string;
  errors: string[];
  rows: ImportRowReport[];
}

export interface ImportTeamSummary {
  name: string;
  description: string | null;
  projectTitle: string | null;
  valid: boolean;
  errors: string[];
  rowCount: number;
  participantCount: number;
  validParticipantCount: number;
  newParticipantCount: number;
  existingParticipantCount: number;
}

export interface ImportFailure {
  row: number;
  teamName: string | null;
  errors: string[];
}

/* ----------------------------- CSV definitions ---------------------------- */

const HEADER_MAP: Record<string, string> = {
  team_name: "teamName",
  teamname: "teamName",
  team: "teamName",
  team_description: "teamDescription",
  teamdescription: "teamDescription",
  description: "teamDescription",
  project_title: "projectTitle",
  projecttitle: "projectTitle",
  project: "projectTitle",
  title: "projectTitle",
  participant_name: "participantName",
  participantname: "participantName",
  participant: "participantName",
  member_name: "participantName",
  name: "participantName",
  participant_email: "participantEmail",
  participantemail: "participantEmail",
  member_email: "participantEmail",
  email: "participantEmail",
  participant_username: "participantUsername",
  participantusername: "participantUsername",
  member_username: "participantUsername",
  username: "participantUsername",
  participant_role: "participantRole",
  participantrole: "participantRole",
  member_role: "participantRole",
  role: "participantRole",
};

function normalizeHeader(value: string) {
  return value.replace(/^\uFEFF/, "").trim().toLowerCase().replace(/[\s-]+/g, "_");
}

function cell(row: Record<string, unknown>, key: string): string {
  const value = row[key];
  if (Array.isArray(value)) return sanitizeText(value.join(" "));
  return sanitizeText(value);
}

function addErrors(target: string[], errors: string[]) {
  for (const error of errors) if (!target.includes(error)) target.push(error);
}

function csvCell(value: string) {
  return `"${value.replace(/"/g, '""')}"`;
}

function isUniqueViolation(error: unknown) {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";
}

/* -------------------------------- service -------------------------------- */

export const teamImportService = {
  buildTemplate() {
    const rows: string[][] = [
      ["Team Aurora", "Mobile-first rover control", "Atlas — smarter dispatch", "Ada Lovelace", "ada@example.org", "ada", "PARTICIPANT"],
      ["Team Aurora", "Mobile-first rover control", "Atlas — smarter dispatch", "Grace Hopper", "grace@example.org", "grace_h", "PARTICIPANT"],
      ["Team Nova", "Accessible design toolkit", "Prism", "Alan Turing", "alan@example.org", "alan_t", "PARTICIPANT"],
      ["Team Nova", "Accessible design toolkit", "Prism", "", "", "", ""],
    ];
    const lines = [TEMPLATE_HEADER.join(",")].concat(rows.map((row) => row.map(csvCell).join(",")));
    return {
      filename: "teams_template.csv",
      contentType: "text/csv",
      body: lines.join("\n"),
    };
  },

  /** Dry-run: parse, validate and group every row into teams without writing. */
  async previewImport(buffer: Buffer<ArrayBufferLike>, filename: string, roomId?: string | null) {
    const rawRows = parseFile(buffer, filename);
    if (rawRows.length > env.IMPORT_MAX_ROWS) {
      throw badRequest(`File exceeds the row limit (${env.IMPORT_MAX_ROWS} rows)`);
    }

    const room = roomId ? await resolveRoom(roomId) : null;
    const existingTeams = await teamRepo.listNames();
    const existingTeamByName = new Map(existingTeams.map((team) => [team.name.toLowerCase(), team]));

    // One bulk lookup keeps large previews fast; deleted users are kept so we
    // can report the reservation of their username/email instead of a late 500.
    const usernames = rawRows.map((row) => row.participantUsername).filter(Boolean);
    const emails = rawRows.map((row) => row.participantEmail).filter(Boolean);
    const existingUsers = await userRepo.findManyByIdentities(usernames, emails);
    const userByUsername = new Map<string, (typeof existingUsers)[number]>();
    const userByEmail = new Map<string, (typeof existingUsers)[number]>();
    for (const user of existingUsers) {
      userByUsername.set(user.username.toLowerCase(), user);
      userByEmail.set(user.email.toLowerCase(), user);
    }

    const seenUsernames = new Map<string, number>();
    const seenEmails = new Map<string, number>();
    const rows: ImportRowReport[] = [];

    for (let index = 0; index < rawRows.length; index++) {
      const raw = rawRows[index];
      const rowNumber = index + 2; // CSV line number: header is line 1
      const errors: string[] = [];

      if (!raw.teamName) errors.push("Missing team name");
      else if (raw.teamName.length > 120) errors.push("Team name must be 120 characters or fewer");
      if (raw.teamDescription.length > 2000) errors.push("Team description must be 2000 characters or fewer");
      if (raw.projectTitle.length > 200) errors.push("Project title must be 200 characters or fewer");

      if (!raw.hasParticipant) {
        rows.push({
          row: rowNumber,
          teamName: raw.teamName || undefined,
          teamDescription: raw.teamDescription || undefined,
          projectTitle: raw.projectTitle || undefined,
          valid: errors.length === 0,
          errors,
        });
        continue;
      }

      if (!raw.participantName) errors.push("Missing participant name");
      else if (raw.participantName.length > 120) errors.push("Participant name must be 120 characters or fewer");

      if (!raw.participantEmail) errors.push("Missing participant email");
      else if (!EMAIL_RE.test(raw.participantEmail)) errors.push("Invalid participant email");

      if (!raw.participantUsername) errors.push("Missing participant username");
      else if (!USERNAME_RE.test(raw.participantUsername)) {
        errors.push("Invalid participant username (a-z 0-9 . _ -, 3-60 chars)");
      }

      const roleRaw = raw.participantRole || "PARTICIPANT";
      const role = roleRaw as ImportRole;
      if (!["PARTICIPANT", "MODERATOR"].includes(roleRaw)) {
        errors.push(`Invalid participant role: ${roleRaw} (use PARTICIPANT or MODERATOR)`);
      }

      if (raw.participantUsername) {
        const previous = seenUsernames.get(raw.participantUsername);
        if (previous !== undefined) errors.push(`Duplicate username in file (also on row ${previous})`);
        else seenUsernames.set(raw.participantUsername, rowNumber);
      }
      if (raw.participantEmail) {
        const previous = seenEmails.get(raw.participantEmail);
        if (previous !== undefined) errors.push(`Duplicate email in file (also on row ${previous})`);
        else seenEmails.set(raw.participantEmail, rowNumber);
      }

      let existingUserId: string | undefined;
      if (raw.participantUsername && raw.participantEmail) {
        const byUsername = userByUsername.get(raw.participantUsername);
        const byEmail = userByEmail.get(raw.participantEmail);
        if (byUsername && byEmail && byUsername.id !== byEmail.id) {
          errors.push("Username and email belong to different accounts");
        } else {
          const existing = byUsername ?? byEmail;
          if (existing) {
            if (existing.deletedAt) {
              errors.push("Username or email belongs to a deleted account");
            } else if (existing.status !== "ACTIVE") {
              errors.push("Participant account is inactive");
            } else if (existing.role === "ADMIN") {
              errors.push("Admin accounts cannot be assigned to a team");
            } else if (!byUsername) {
              errors.push("Email is already in use by another account");
            } else if (!byEmail) {
              errors.push("Username is already in use by another account");
            } else if (existing.teamId) {
              errors.push(
                `Participant already belongs to team "${existing.team?.name ?? "another team"}"; remove them from it first`
              );
            } else {
              existingUserId = existing.id;
            }
          }
        }
      }

      rows.push({
        row: rowNumber,
        teamName: raw.teamName || undefined,
        teamDescription: raw.teamDescription || undefined,
        projectTitle: raw.projectTitle || undefined,
        participant: {
          name: raw.participantName,
          email: raw.participantEmail,
          username: raw.participantUsername,
          role,
          ...(existingUserId ? { existingUserId } : {}),
        },
        valid: errors.length === 0,
        errors,
      });
    }

    // Group participant rows into teams. Repeating a team_name is how one file
    // lists several members; case-only differences are treated as one team.
    const groups = new Map<string, TeamGroup>();
    for (const row of rows) {
      if (!row.teamName) continue;
      const key = row.teamName.toLowerCase();
      let group = groups.get(key);
      if (!group) {
        group = {
          key,
          name: row.teamName,
          description: "",
          projectTitle: "",
          errors: [],
          rows: [],
        };
        groups.set(key, group);
      }
      group.rows.push(row);
      if (row.teamDescription) {
        if (!group.description) group.description = row.teamDescription;
        else if (group.description !== row.teamDescription) {
          addErrors(row.errors, ["Conflicting team description for this team"]);
        }
      }
      if (row.projectTitle) {
        if (!group.projectTitle) group.projectTitle = row.projectTitle;
        else if (group.projectTitle !== row.projectTitle) {
          addErrors(row.errors, ["Conflicting project title for this team"]);
        }
      }
    }

    for (const group of groups.values()) {
      if (group.name.length > 120) addErrors(group.errors, ["Team name must be 120 characters or fewer"]);
      const existing = existingTeamByName.get(group.key);
      if (existing) {
        addErrors(group.errors, [
          existing.deletedAt
            ? `A deleted team still reserves the name "${existing.name}"`
            : `A team named "${existing.name}" already exists`,
        ]);
      }
      // A team-level problem invalidates every row that belongs to it.
      for (const row of group.rows) addErrors(row.errors, group.errors);
    }

    for (const row of rows) row.valid = row.errors.length === 0;

    const teams: ImportTeamSummary[] = [...groups.values()].map((group) => {
      const validRows = group.rows.filter((row) => row.valid);
      const importable = group.errors.length === 0 && validRows.length > 0;
      return {
        name: group.name,
        description: group.description || null,
        projectTitle: group.projectTitle || null,
        valid: importable,
        errors: group.errors,
        rowCount: group.rows.length,
        participantCount: group.rows.filter((row) => row.participant).length,
        validParticipantCount: validRows.filter((row) => row.participant).length,
        newParticipantCount: validRows.filter((row) => row.participant && !row.participant.existingUserId).length,
        existingParticipantCount: validRows.filter((row) => row.participant?.existingUserId).length,
      };
    });

    const validRows = rows.filter((row) => row.valid);
    return {
      filename,
      room: room ? { id: room.id, name: room.name, status: room.status } : null,
      rowCount: rows.length,
      teamCount: teams.length,
      participantCount: rows.filter((row) => row.participant).length,
      validRowCount: validRows.length,
      validTeamCount: teams.filter((team) => team.valid).length,
      validParticipantCount: validRows.filter((row) => row.participant).length,
      errorCount: rows.filter((row) => !row.valid).length,
      teams,
      rows,
      note: "Commit re-validates the file. Keep the same file to commit these exact rows.",
    };
  },

  /**
   * Writes valid rows. In valid-only mode a bad participant row does not block
   * its team, but it is reported per row. In all-or-nothing mode any validation
   * error aborts before the first write.
   */
  async commitImport(
    buffer: Buffer<ArrayBufferLike>,
    filename: string,
    options: { roomId?: string | null; allOrNothing?: boolean },
    actorId: string,
    ip?: string
  ) {
    const preview = await this.previewImport(buffer, filename, options.roomId);
    if (preview.errorCount > 0 && options.allOrNothing) {
      throw badRequest(`All-or-nothing: file has ${preview.errorCount} invalid rows`, preview.rows);
    }

    const room = options.roomId ? await resolveRoom(options.roomId) : null;
    const roomTeams = room ? await roomRepo.listRoomTeams(room.id) : [];
    let nextOrder = roomTeams.reduce((max, roomTeam) => Math.max(max, roomTeam.presentationOrder), 0) + 1;

    const rowsByTeam = new Map<string, ImportRowReport[]>();
    const failed: ImportFailure[] = [];
    for (const row of preview.rows) {
      if (!row.teamName) {
        failed.push({ row: row.row, teamName: null, errors: row.errors });
        continue;
      }
      const key = row.teamName.toLowerCase();
      const list = rowsByTeam.get(key);
      if (list) list.push(row);
      else rowsByTeam.set(key, [row]);
    }

    const credentials: {
      name: string;
      username: string;
      email: string;
      temporaryPassword: string;
      teamName: string;
    }[] = [];
    const createdTeams: { id: string; name: string; participantCount: number }[] = [];
    let teamsCreated = 0;
    let teamsFailed = 0;
    let participantsCreated = 0;
    let participantsAssigned = 0;
    let rowsCommitted = 0;

    for (const teamSummary of preview.teams) {
      const teamRows = rowsByTeam.get(teamSummary.name.toLowerCase()) ?? [];

      if (!teamSummary.valid) {
        teamsFailed++;
        for (const row of teamRows) {
          failed.push({ row: row.row, teamName: teamSummary.name, errors: unique([...row.errors, ...teamSummary.errors]) });
        }
        continue;
      }

      let team: { id: string; name: string };
      try {
        team = await teamRepo.create({
          name: teamSummary.name,
          description: teamSummary.description,
          projectTitle: teamSummary.projectTitle,
          links: [],
        });
      } catch (error) {
        if (!isUniqueViolation(error)) throw error;
        teamsFailed++;
        for (const row of teamRows) {
          failed.push({
            row: row.row,
            teamName: teamSummary.name,
            errors: ["A team with this name was created by another request while importing"],
          });
        }
        continue;
      }

      teamsCreated++;
      if (room) {
        await roomRepo.upsertRoomTeam(room.id, team.id, {
          roomId: room.id,
          teamId: team.id,
          presentationOrder: nextOrder++,
          details: null,
        });
      }

      for (const row of teamRows) {
        if (!row.valid) {
          failed.push({ row: row.row, teamName: teamSummary.name, errors: row.errors });
          continue;
        }
        if (!row.participant) {
          // A row that only declares the team (no member columns) still counts.
          rowsCommitted++;
          continue;
        }

        try {
          let userId: string;
          if (row.participant.existingUserId) {
            const existing = await userRepo.findById(row.participant.existingUserId);
            if (!existing) throw new Error("Participant no longer exists");
            if (existing.status !== "ACTIVE") throw new Error("Participant account is inactive");
            if (existing.role === "ADMIN") throw new Error("Admin accounts cannot be assigned to a team");
            if (existing.teamId) throw new Error("Participant was assigned to another team while importing");
            await userRepo.update(existing.id, { teamId: team.id });
            userId = existing.id;
            participantsAssigned++;
          } else {
            const clash = await userRepo.findManyByIdentities(
              [row.participant.username],
              [row.participant.email]
            );
            if (clash.length > 0) {
              throw new Error("Username or email was taken by another request while importing");
            }
            const temporaryPassword = authService.generateTemporaryPassword();
            const passwordHash = await authService.hashPassword(temporaryPassword);
            const user = await userRepo.create({
              name: row.participant.name,
              username: row.participant.username,
              email: row.participant.email,
              role: row.participant.role,
              teamId: team.id,
              passwordHash,
              mustChangePassword: true,
            });
            userId = user.id;
            participantsCreated++;
            credentials.push({
              name: row.participant.name,
              username: row.participant.username,
              email: row.participant.email,
              temporaryPassword,
              teamName: team.name,
            });
          }

          if (room) await attachRoomMember(room.id, userId, team.id);
          rowsCommitted++;
        } catch (error) {
          failed.push({
            row: row.row,
            teamName: teamSummary.name,
            errors: [error instanceof Error ? error.message : "Participant could not be imported"],
          });
        }
      }

      createdTeams.push({
        id: team.id,
        name: team.name,
        participantCount: teamRows.filter((row) => row.valid && row.participant).length,
      });
    }

    if (room) {
      rtEvents.stateChanged(room.id, {
        roomId: room.id,
        roomStatus: room.status,
        votingState: deriveVotingState(room),
      });
    }

    audit({
      actorId,
      action: "team.bulk_import",
      entityType: "import",
      entityId: filename,
      after: {
        teamsCreated,
        teamsFailed,
        participantsCreated,
        participantsAssigned,
        rowsCommitted,
        rowsSkipped: preview.rowCount - rowsCommitted,
        roomId: room?.id ?? null,
        mode: options.allOrNothing ? "all_or_nothing" : "valid_only",
      },
      ip,
    });

    return {
      filename,
      room: room ? { id: room.id, name: room.name } : null,
      teamsCreated,
      teamsFailed,
      participantsCreated,
      participantsAssigned,
      rowsCommitted,
      rowsSkipped: preview.rowCount - rowsCommitted,
      teams: createdTeams,
      credentials,
      failed,
    };
  },
};

/* -------------------------------- helpers -------------------------------- */

async function resolveRoom(roomId: string) {
  const room = await roomService.getById(roomId);
  if (room.status === "ARCHIVED") throw conflict("Archived rooms cannot receive imported teams");
  return room;
}

async function attachRoomMember(roomId: string, userId: string, teamId: string) {
  const existing = await roomRepo.findMember(roomId, userId);
  if (!existing) {
    await roomRepo.upsertMember(roomId, userId, { roomId, userId, role: "PARTICIPANT", teamId });
  } else if (existing.teamId !== teamId) {
    // Preserve an existing moderator role; only the team assignment changes.
    await roomRepo.upsertMember(roomId, userId, { roomId, userId, role: existing.role, teamId });
  }
}

function unique(values: string[]) {
  return [...new Set(values)];
}

function parseFile(buffer: Buffer<ArrayBufferLike>, filename: string): ParsedRow[] {
  if (!/\.csv$/i.test(filename)) throw badRequest("Only CSV files are accepted for team import");

  const parsed = parse<Record<string, unknown>>(buffer.toString("utf8"), {
    header: true,
    skipEmptyLines: "greedy",
    transformHeader: (header) => HEADER_MAP[normalizeHeader(header)] ?? normalizeHeader(header),
  });

  const fatal = parsed.errors.find((error) => error.type === "Quotes" || error.type === "Delimiter");
  if (fatal) throw badRequest(`CSV parse error on line ${fatal.row ?? "?"}: ${fatal.message}`);
  if (!(parsed.meta.fields ?? []).includes("teamName")) {
    throw badRequest("Missing team_name column. Download the template to see the expected columns");
  }
  if (parsed.data.length === 0) throw badRequest("CSV has no data rows");

  return parsed.data.map((row) => {
    const participantName = cell(row, "participantName");
    const participantEmail = cell(row, "participantEmail").toLowerCase();
    const participantUsername = cell(row, "participantUsername").toLowerCase();
    const participantRole = cell(row, "participantRole").toUpperCase();
    return {
      teamName: cell(row, "teamName"),
      teamDescription: cell(row, "teamDescription"),
      projectTitle: cell(row, "projectTitle"),
      participantName,
      participantEmail,
      participantUsername,
      participantRole,
      hasParticipant: Boolean(participantName || participantEmail || participantUsername || participantRole),
    };
  });
}
