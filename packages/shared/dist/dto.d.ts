import { z } from "zod";
export declare const roleSchema: z.ZodEnum<["ADMIN", "MODERATOR", "PARTICIPANT"]>;
export declare const userStatusSchema: z.ZodEnum<["ACTIVE", "INACTIVE"]>;
export declare const roomStatusSchema: z.ZodEnum<["DRAFT", "ACTIVE", "CLOSED", "ARCHIVED"]>;
export declare const roundStatusSchema: z.ZodEnum<["PENDING", "OPEN", "PAUSED", "CLOSED"]>;
export declare const accessModeSchema: z.ZodEnum<["RESTRICTED", "OPEN_WITH_CODE"]>;
export declare const aggregationSchema: z.ZodEnum<["weighted_mean", "trimmed_mean"]>;
export declare const loginSchema: z.ZodObject<{
    identifier: z.ZodString;
    password: z.ZodString;
}, "strip", z.ZodTypeAny, {
    identifier: string;
    password: string;
}, {
    identifier: string;
    password: string;
}>;
export declare const changePasswordSchema: z.ZodObject<{
    currentPassword: z.ZodString;
    newPassword: z.ZodString;
}, "strip", z.ZodTypeAny, {
    currentPassword: string;
    newPassword: string;
}, {
    currentPassword: string;
    newPassword: string;
}>;
export declare const participantCreateSchema: z.ZodObject<{
    name: z.ZodString;
    username: z.ZodString;
    email: z.ZodString;
    role: z.ZodDefault<z.ZodEnum<["ADMIN", "MODERATOR", "PARTICIPANT"]>>;
    teamId: z.ZodOptional<z.ZodNullable<z.ZodString>>;
}, "strip", z.ZodTypeAny, {
    name: string;
    username: string;
    email: string;
    role: "ADMIN" | "MODERATOR" | "PARTICIPANT";
    teamId?: string | null | undefined;
}, {
    name: string;
    username: string;
    email: string;
    role?: "ADMIN" | "MODERATOR" | "PARTICIPANT" | undefined;
    teamId?: string | null | undefined;
}>;
export declare const participantPatchSchema: z.ZodObject<{
    name: z.ZodOptional<z.ZodString>;
    username: z.ZodOptional<z.ZodString>;
    email: z.ZodOptional<z.ZodString>;
    role: z.ZodOptional<z.ZodEnum<["ADMIN", "MODERATOR", "PARTICIPANT"]>>;
    status: z.ZodOptional<z.ZodEnum<["ACTIVE", "INACTIVE"]>>;
    teamId: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    softDelete: z.ZodOptional<z.ZodLiteral<true>>;
}, "strip", z.ZodTypeAny, {
    status?: "ACTIVE" | "INACTIVE" | undefined;
    name?: string | undefined;
    username?: string | undefined;
    email?: string | undefined;
    role?: "ADMIN" | "MODERATOR" | "PARTICIPANT" | undefined;
    teamId?: string | null | undefined;
    softDelete?: true | undefined;
}, {
    status?: "ACTIVE" | "INACTIVE" | undefined;
    name?: string | undefined;
    username?: string | undefined;
    email?: string | undefined;
    role?: "ADMIN" | "MODERATOR" | "PARTICIPANT" | undefined;
    teamId?: string | null | undefined;
    softDelete?: true | undefined;
}>;
export declare const bulkImportCommitSchema: z.ZodObject<{
    /** token returned by the preview call */
    jobId: z.ZodString;
    allOrNothing: z.ZodDefault<z.ZodBoolean>;
}, "strip", z.ZodTypeAny, {
    jobId: string;
    allOrNothing: boolean;
}, {
    jobId: string;
    allOrNothing?: boolean | undefined;
}>;
export declare const teamCreateSchema: z.ZodObject<{
    name: z.ZodString;
    description: z.ZodOptional<z.ZodString>;
    projectTitle: z.ZodNullable<z.ZodOptional<z.ZodString>>;
    links: z.ZodDefault<z.ZodOptional<z.ZodArray<z.ZodString, "many">>>;
    logoUrl: z.ZodNullable<z.ZodOptional<z.ZodString>>;
}, "strip", z.ZodTypeAny, {
    name: string;
    links: string[];
    description?: string | undefined;
    projectTitle?: string | null | undefined;
    logoUrl?: string | null | undefined;
}, {
    name: string;
    description?: string | undefined;
    projectTitle?: string | null | undefined;
    links?: string[] | undefined;
    logoUrl?: string | null | undefined;
}>;
export declare const teamPatchSchema: z.ZodObject<{
    name: z.ZodOptional<z.ZodString>;
    description: z.ZodOptional<z.ZodOptional<z.ZodString>>;
    projectTitle: z.ZodOptional<z.ZodNullable<z.ZodOptional<z.ZodString>>>;
    links: z.ZodOptional<z.ZodDefault<z.ZodOptional<z.ZodArray<z.ZodString, "many">>>>;
    logoUrl: z.ZodOptional<z.ZodNullable<z.ZodOptional<z.ZodString>>>;
}, "strip", z.ZodTypeAny, {
    name?: string | undefined;
    description?: string | undefined;
    projectTitle?: string | null | undefined;
    links?: string[] | undefined;
    logoUrl?: string | null | undefined;
}, {
    name?: string | undefined;
    description?: string | undefined;
    projectTitle?: string | null | undefined;
    links?: string[] | undefined;
    logoUrl?: string | null | undefined;
}>;
export declare const roomSettingsSchema: z.ZodObject<{
    allowVoteEdit: z.ZodDefault<z.ZodBoolean>;
    adminCanSeeVoterIdentity: z.ZodDefault<z.ZodBoolean>;
    liveResults: z.ZodDefault<z.ZodBoolean>;
    minVotesThreshold: z.ZodDefault<z.ZodNumber>;
    aggregationMethod: z.ZodDefault<z.ZodEnum<["weighted_mean", "trimmed_mean"]>>;
}, "strip", z.ZodTypeAny, {
    allowVoteEdit: boolean;
    adminCanSeeVoterIdentity: boolean;
    liveResults: boolean;
    minVotesThreshold: number;
    aggregationMethod: "weighted_mean" | "trimmed_mean";
}, {
    allowVoteEdit?: boolean | undefined;
    adminCanSeeVoterIdentity?: boolean | undefined;
    liveResults?: boolean | undefined;
    minVotesThreshold?: number | undefined;
    aggregationMethod?: "weighted_mean" | "trimmed_mean" | undefined;
}>;
export type RoomSettings = z.infer<typeof roomSettingsSchema>;
export declare const roomCreateSchema: z.ZodObject<{
    name: z.ZodString;
    description: z.ZodOptional<z.ZodString>;
    accessMode: z.ZodDefault<z.ZodEnum<["RESTRICTED", "OPEN_WITH_CODE"]>>;
    settings: z.ZodOptional<z.ZodObject<{
        allowVoteEdit: z.ZodOptional<z.ZodDefault<z.ZodBoolean>>;
        adminCanSeeVoterIdentity: z.ZodOptional<z.ZodDefault<z.ZodBoolean>>;
        liveResults: z.ZodOptional<z.ZodDefault<z.ZodBoolean>>;
        minVotesThreshold: z.ZodOptional<z.ZodDefault<z.ZodNumber>>;
        aggregationMethod: z.ZodOptional<z.ZodDefault<z.ZodEnum<["weighted_mean", "trimmed_mean"]>>>;
    }, "strip", z.ZodTypeAny, {
        allowVoteEdit?: boolean | undefined;
        adminCanSeeVoterIdentity?: boolean | undefined;
        liveResults?: boolean | undefined;
        minVotesThreshold?: number | undefined;
        aggregationMethod?: "weighted_mean" | "trimmed_mean" | undefined;
    }, {
        allowVoteEdit?: boolean | undefined;
        adminCanSeeVoterIdentity?: boolean | undefined;
        liveResults?: boolean | undefined;
        minVotesThreshold?: number | undefined;
        aggregationMethod?: "weighted_mean" | "trimmed_mean" | undefined;
    }>>;
}, "strip", z.ZodTypeAny, {
    name: string;
    accessMode: "RESTRICTED" | "OPEN_WITH_CODE";
    description?: string | undefined;
    settings?: {
        allowVoteEdit?: boolean | undefined;
        adminCanSeeVoterIdentity?: boolean | undefined;
        liveResults?: boolean | undefined;
        minVotesThreshold?: number | undefined;
        aggregationMethod?: "weighted_mean" | "trimmed_mean" | undefined;
    } | undefined;
}, {
    name: string;
    description?: string | undefined;
    accessMode?: "RESTRICTED" | "OPEN_WITH_CODE" | undefined;
    settings?: {
        allowVoteEdit?: boolean | undefined;
        adminCanSeeVoterIdentity?: boolean | undefined;
        liveResults?: boolean | undefined;
        minVotesThreshold?: number | undefined;
        aggregationMethod?: "weighted_mean" | "trimmed_mean" | undefined;
    } | undefined;
}>;
export declare const roomPatchSchema: z.ZodObject<{
    name: z.ZodOptional<z.ZodString>;
    description: z.ZodOptional<z.ZodOptional<z.ZodString>>;
    accessMode: z.ZodOptional<z.ZodDefault<z.ZodEnum<["RESTRICTED", "OPEN_WITH_CODE"]>>>;
    settings: z.ZodOptional<z.ZodOptional<z.ZodObject<{
        allowVoteEdit: z.ZodOptional<z.ZodDefault<z.ZodBoolean>>;
        adminCanSeeVoterIdentity: z.ZodOptional<z.ZodDefault<z.ZodBoolean>>;
        liveResults: z.ZodOptional<z.ZodDefault<z.ZodBoolean>>;
        minVotesThreshold: z.ZodOptional<z.ZodDefault<z.ZodNumber>>;
        aggregationMethod: z.ZodOptional<z.ZodDefault<z.ZodEnum<["weighted_mean", "trimmed_mean"]>>>;
    }, "strip", z.ZodTypeAny, {
        allowVoteEdit?: boolean | undefined;
        adminCanSeeVoterIdentity?: boolean | undefined;
        liveResults?: boolean | undefined;
        minVotesThreshold?: number | undefined;
        aggregationMethod?: "weighted_mean" | "trimmed_mean" | undefined;
    }, {
        allowVoteEdit?: boolean | undefined;
        adminCanSeeVoterIdentity?: boolean | undefined;
        liveResults?: boolean | undefined;
        minVotesThreshold?: number | undefined;
        aggregationMethod?: "weighted_mean" | "trimmed_mean" | undefined;
    }>>>;
}, "strip", z.ZodTypeAny, {
    name?: string | undefined;
    description?: string | undefined;
    accessMode?: "RESTRICTED" | "OPEN_WITH_CODE" | undefined;
    settings?: {
        allowVoteEdit?: boolean | undefined;
        adminCanSeeVoterIdentity?: boolean | undefined;
        liveResults?: boolean | undefined;
        minVotesThreshold?: number | undefined;
        aggregationMethod?: "weighted_mean" | "trimmed_mean" | undefined;
    } | undefined;
}, {
    name?: string | undefined;
    description?: string | undefined;
    accessMode?: "RESTRICTED" | "OPEN_WITH_CODE" | undefined;
    settings?: {
        allowVoteEdit?: boolean | undefined;
        adminCanSeeVoterIdentity?: boolean | undefined;
        liveResults?: boolean | undefined;
        minVotesThreshold?: number | undefined;
        aggregationMethod?: "weighted_mean" | "trimmed_mean" | undefined;
    } | undefined;
}>;
export declare const roomMemberSchema: z.ZodObject<{
    userId: z.ZodString;
    role: z.ZodDefault<z.ZodEnum<["PARTICIPANT", "MODERATOR"]>>;
    /** null → inherit user's org team; undefined → keep existing */
    teamId: z.ZodOptional<z.ZodNullable<z.ZodString>>;
}, "strip", z.ZodTypeAny, {
    role: "MODERATOR" | "PARTICIPANT";
    userId: string;
    teamId?: string | null | undefined;
}, {
    userId: string;
    role?: "MODERATOR" | "PARTICIPANT" | undefined;
    teamId?: string | null | undefined;
}>;
export declare const roomMembersPutSchema: z.ZodObject<{
    members: z.ZodArray<z.ZodObject<{
        userId: z.ZodString;
        role: z.ZodDefault<z.ZodEnum<["PARTICIPANT", "MODERATOR"]>>;
        /** null → inherit user's org team; undefined → keep existing */
        teamId: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    }, "strip", z.ZodTypeAny, {
        role: "MODERATOR" | "PARTICIPANT";
        userId: string;
        teamId?: string | null | undefined;
    }, {
        userId: string;
        role?: "MODERATOR" | "PARTICIPANT" | undefined;
        teamId?: string | null | undefined;
    }>, "many">;
}, "strip", z.ZodTypeAny, {
    members: {
        role: "MODERATOR" | "PARTICIPANT";
        userId: string;
        teamId?: string | null | undefined;
    }[];
}, {
    members: {
        userId: string;
        role?: "MODERATOR" | "PARTICIPANT" | undefined;
        teamId?: string | null | undefined;
    }[];
}>;
export declare const roomTeamSchema: z.ZodObject<{
    teamId: z.ZodString;
    presentationOrder: z.ZodOptional<z.ZodNumber>;
    details: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    teamId: string;
    presentationOrder?: number | undefined;
    details?: string | undefined;
}, {
    teamId: string;
    presentationOrder?: number | undefined;
    details?: string | undefined;
}>;
export declare const roomTeamsPutSchema: z.ZodObject<{
    teams: z.ZodArray<z.ZodObject<{
        teamId: z.ZodString;
        presentationOrder: z.ZodOptional<z.ZodNumber>;
        details: z.ZodOptional<z.ZodString>;
    }, "strip", z.ZodTypeAny, {
        teamId: string;
        presentationOrder?: number | undefined;
        details?: string | undefined;
    }, {
        teamId: string;
        presentationOrder?: number | undefined;
        details?: string | undefined;
    }>, "many">;
}, "strip", z.ZodTypeAny, {
    teams: {
        teamId: string;
        presentationOrder?: number | undefined;
        details?: string | undefined;
    }[];
}, {
    teams: {
        teamId: string;
        presentationOrder?: number | undefined;
        details?: string | undefined;
    }[];
}>;
export declare const categoryCreateSchema: z.ZodObject<{
    name: z.ZodString;
    description: z.ZodOptional<z.ZodString>;
    minScore: z.ZodDefault<z.ZodNumber>;
    maxScore: z.ZodDefault<z.ZodNumber>;
    step: z.ZodDefault<z.ZodNumber>;
    weight: z.ZodDefault<z.ZodNumber>;
    isRequired: z.ZodDefault<z.ZodBoolean>;
}, "strip", z.ZodTypeAny, {
    name: string;
    minScore: number;
    maxScore: number;
    step: number;
    weight: number;
    isRequired: boolean;
    description?: string | undefined;
}, {
    name: string;
    description?: string | undefined;
    minScore?: number | undefined;
    maxScore?: number | undefined;
    step?: number | undefined;
    weight?: number | undefined;
    isRequired?: boolean | undefined;
}>;
export declare const categoryPatchSchema: z.ZodObject<{
    name: z.ZodOptional<z.ZodString>;
    description: z.ZodOptional<z.ZodOptional<z.ZodString>>;
    minScore: z.ZodOptional<z.ZodDefault<z.ZodNumber>>;
    maxScore: z.ZodOptional<z.ZodDefault<z.ZodNumber>>;
    step: z.ZodOptional<z.ZodDefault<z.ZodNumber>>;
    weight: z.ZodOptional<z.ZodDefault<z.ZodNumber>>;
    isRequired: z.ZodOptional<z.ZodDefault<z.ZodBoolean>>;
} & {
    active: z.ZodOptional<z.ZodBoolean>;
}, "strip", z.ZodTypeAny, {
    name?: string | undefined;
    description?: string | undefined;
    minScore?: number | undefined;
    maxScore?: number | undefined;
    step?: number | undefined;
    weight?: number | undefined;
    isRequired?: boolean | undefined;
    active?: boolean | undefined;
}, {
    name?: string | undefined;
    description?: string | undefined;
    minScore?: number | undefined;
    maxScore?: number | undefined;
    step?: number | undefined;
    weight?: number | undefined;
    isRequired?: boolean | undefined;
    active?: boolean | undefined;
}>;
export declare const categoryReorderSchema: z.ZodObject<{
    order: z.ZodArray<z.ZodString, "many">;
}, "strip", z.ZodTypeAny, {
    order: string[];
}, {
    order: string[];
}>;
export declare const newConfigVersionSchema: z.ZodObject<{
    reason: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    reason?: string | undefined;
}, {
    reason?: string | undefined;
}>;
export declare const selectTeamSchema: z.ZodObject<{
    teamId: z.ZodString;
    force: z.ZodDefault<z.ZodBoolean>;
}, "strip", z.ZodTypeAny, {
    teamId: string;
    force: boolean;
}, {
    teamId: string;
    force?: boolean | undefined;
}>;
export declare const voteSubmitSchema: z.ZodObject<{
    scores: z.ZodArray<z.ZodObject<{
        categoryId: z.ZodString;
        score: z.ZodNumber;
    }, "strip", z.ZodTypeAny, {
        categoryId: string;
        score: number;
    }, {
        categoryId: string;
        score: number;
    }>, "many">;
}, "strip", z.ZodTypeAny, {
    scores: {
        categoryId: string;
        score: number;
    }[];
}, {
    scores: {
        categoryId: string;
        score: number;
    }[];
}>;
export declare const joinRoomSchema: z.ZodObject<{
    code: z.ZodString;
}, "strip", z.ZodTypeAny, {
    code: string;
}, {
    code: string;
}>;
export declare const resultsQuerySchema: z.ZodObject<{
    roundId: z.ZodOptional<z.ZodString>;
    format: z.ZodDefault<z.ZodEnum<["csv", "xlsx"]>>;
    kind: z.ZodDefault<z.ZodEnum<["summary", "categories", "raw"]>>;
}, "strip", z.ZodTypeAny, {
    format: "csv" | "xlsx";
    kind: "summary" | "categories" | "raw";
    roundId?: string | undefined;
}, {
    roundId?: string | undefined;
    format?: "csv" | "xlsx" | undefined;
    kind?: "summary" | "categories" | "raw" | undefined;
}>;
export interface ApiError {
    error: string;
    details?: unknown;
    code?: string;
}
