from __future__ import annotations

import datetime
import uuid
from typing import (
    Annotated,
    Any,
    List,
    Literal,
    NotRequired,
    Optional,
    TypeAlias,
    TypedDict,
)

from pydantic import BaseModel, Field, Json

NetRequestStatus: TypeAlias = Literal["PENDING", "SUCCESS", "ERROR"]

RealtimeEqualityOp: TypeAlias = Literal["eq", "neq", "lt", "lte", "gt", "gte", "in"]

RealtimeAction: TypeAlias = Literal["INSERT", "UPDATE", "DELETE", "TRUNCATE", "ERROR"]

StorageBuckettype: TypeAlias = Literal["STANDARD", "ANALYTICS", "VECTOR"]

AuthFactorType: TypeAlias = Literal["totp", "webauthn", "phone"]

AuthFactorStatus: TypeAlias = Literal["unverified", "verified"]

AuthAalLevel: TypeAlias = Literal["aal1", "aal2", "aal3"]

AuthCodeChallengeMethod: TypeAlias = Literal["s256", "plain"]

AuthOneTimeTokenType: TypeAlias = Literal["confirmation_token", "reauthentication_token", "recovery_token", "email_change_token_new", "email_change_token_current", "phone_change_token"]

AuthOauthRegistrationType: TypeAlias = Literal["dynamic", "manual"]

AuthOauthAuthorizationStatus: TypeAlias = Literal["pending", "approved", "denied", "expired"]

AuthOauthResponseType: TypeAlias = Literal["code"]

AuthOauthClientType: TypeAlias = Literal["public", "confidential"]

PublicMoveKind: TypeAlias = Literal["Best", "Excellent", "Good", "Inaccuracy", "Miss", "Mistake", "Blunder", "SuperRisky", "Risky", "Book"]

PublicMessageSide: TypeAlias = Literal["Match", "You"]

PublicGameMode: TypeAlias = Literal["solo", "screenshot", "puzzle"]

PublicGameStatus: TypeAlias = Literal["active", "completed", "abandoned"]

PublicRatingKind: TypeAlias = Literal["rizz", "ranked", "casual"]

PublicDatingGoal: TypeAlias = Literal["serious", "casual", "confidence", "practice"]

PublicTextingStyle: TypeAlias = Literal["drywit", "playful", "dark", "earnest"]

PublicMatchStatus: TypeAlias = Literal["queued", "active", "scoring", "completed", "abandoned"]

PublicMatchMode: TypeAlias = Literal["pvp", "ai", "ghost"]

PublicMatchSide: TypeAlias = Literal["a", "b"]

PublicTimeControl: TypeAlias = Literal["bullet", "rapid", "classical"]

PublicMatchEndReason: TypeAlias = Literal["scored", "timeout", "resignation", "abandoned", "blocked"]

PublicJobStatus: TypeAlias = Literal["queued", "processing", "completed", "failed", "cancelled"]

PublicJobKind: TypeAlias = Literal["screenshot", "pvp_round"]

PublicUnlockSource: TypeAlias = Literal["subscription", "credit", "referral", "admin"]

class PublicProfiles(BaseModel):
    age_verified_at: Optional[datetime.datetime] = Field(alias="age_verified_at")
    created_at: datetime.datetime = Field(alias="created_at")
    date_of_birth: Optional[datetime.date] = Field(alias="date_of_birth")
    dating_goal: Optional[PublicDatingGoal] = Field(alias="dating_goal")
    display_name: Optional[str] = Field(alias="display_name")
    id: uuid.UUID = Field(alias="id")
    referral_code: Optional[str] = Field(alias="referral_code")
    referred_by: Optional[uuid.UUID] = Field(alias="referred_by")
    texting_style: List[PublicTextingStyle] = Field(alias="texting_style")
    updated_at: datetime.datetime = Field(alias="updated_at")
    username: Optional[str] = Field(alias="username")

class PublicProfilesInsert(TypedDict):
    age_verified_at: NotRequired[Annotated[Optional[datetime.datetime], Field(alias="age_verified_at")]]
    created_at: NotRequired[Annotated[datetime.datetime, Field(alias="created_at")]]
    date_of_birth: NotRequired[Annotated[Optional[datetime.date], Field(alias="date_of_birth")]]
    dating_goal: NotRequired[Annotated[Optional[PublicDatingGoal], Field(alias="dating_goal")]]
    display_name: NotRequired[Annotated[Optional[str], Field(alias="display_name")]]
    id: Annotated[uuid.UUID, Field(alias="id")]
    referral_code: NotRequired[Annotated[Optional[str], Field(alias="referral_code")]]
    referred_by: NotRequired[Annotated[Optional[uuid.UUID], Field(alias="referred_by")]]
    texting_style: NotRequired[Annotated[List[PublicTextingStyle], Field(alias="texting_style")]]
    updated_at: NotRequired[Annotated[datetime.datetime, Field(alias="updated_at")]]
    username: NotRequired[Annotated[Optional[str], Field(alias="username")]]

class PublicProfilesUpdate(TypedDict):
    age_verified_at: NotRequired[Annotated[Optional[datetime.datetime], Field(alias="age_verified_at")]]
    created_at: NotRequired[Annotated[datetime.datetime, Field(alias="created_at")]]
    date_of_birth: NotRequired[Annotated[Optional[datetime.date], Field(alias="date_of_birth")]]
    dating_goal: NotRequired[Annotated[Optional[PublicDatingGoal], Field(alias="dating_goal")]]
    display_name: NotRequired[Annotated[Optional[str], Field(alias="display_name")]]
    id: NotRequired[Annotated[uuid.UUID, Field(alias="id")]]
    referral_code: NotRequired[Annotated[Optional[str], Field(alias="referral_code")]]
    referred_by: NotRequired[Annotated[Optional[uuid.UUID], Field(alias="referred_by")]]
    texting_style: NotRequired[Annotated[List[PublicTextingStyle], Field(alias="texting_style")]]
    updated_at: NotRequired[Annotated[datetime.datetime, Field(alias="updated_at")]]
    username: NotRequired[Annotated[Optional[str], Field(alias="username")]]

class PublicPlayerRatings(BaseModel):
    casual_rating: int = Field(alias="casual_rating")
    ranked_elo: int = Field(alias="ranked_elo")
    ranked_losses: int = Field(alias="ranked_losses")
    ranked_tier: Optional[str] = Field(alias="ranked_tier")
    ranked_wins: int = Field(alias="ranked_wins")
    rizz_rating: int = Field(alias="rizz_rating")
    updated_at: datetime.datetime = Field(alias="updated_at")
    user_id: uuid.UUID = Field(alias="user_id")

class PublicPlayerRatingsInsert(TypedDict):
    casual_rating: NotRequired[Annotated[int, Field(alias="casual_rating")]]
    ranked_elo: NotRequired[Annotated[int, Field(alias="ranked_elo")]]
    ranked_losses: NotRequired[Annotated[int, Field(alias="ranked_losses")]]
    ranked_tier: NotRequired[Annotated[Optional[str], Field(alias="ranked_tier")]]
    ranked_wins: NotRequired[Annotated[int, Field(alias="ranked_wins")]]
    rizz_rating: NotRequired[Annotated[int, Field(alias="rizz_rating")]]
    updated_at: NotRequired[Annotated[datetime.datetime, Field(alias="updated_at")]]
    user_id: Annotated[uuid.UUID, Field(alias="user_id")]

class PublicPlayerRatingsUpdate(TypedDict):
    casual_rating: NotRequired[Annotated[int, Field(alias="casual_rating")]]
    ranked_elo: NotRequired[Annotated[int, Field(alias="ranked_elo")]]
    ranked_losses: NotRequired[Annotated[int, Field(alias="ranked_losses")]]
    ranked_tier: NotRequired[Annotated[Optional[str], Field(alias="ranked_tier")]]
    ranked_wins: NotRequired[Annotated[int, Field(alias="ranked_wins")]]
    rizz_rating: NotRequired[Annotated[int, Field(alias="rizz_rating")]]
    updated_at: NotRequired[Annotated[datetime.datetime, Field(alias="updated_at")]]
    user_id: NotRequired[Annotated[uuid.UUID, Field(alias="user_id")]]

class PublicRatingHistory(BaseModel):
    created_at: datetime.datetime = Field(alias="created_at")
    delta: int = Field(alias="delta")
    id: int = Field(alias="id")
    kind: PublicRatingKind = Field(alias="kind")
    rating_after: int = Field(alias="rating_after")
    rating_before: int = Field(alias="rating_before")
    source_id: Optional[uuid.UUID] = Field(alias="source_id")
    source_kind: Optional[str] = Field(alias="source_kind")
    user_id: uuid.UUID = Field(alias="user_id")

class PublicRatingHistoryInsert(TypedDict):
    created_at: NotRequired[Annotated[datetime.datetime, Field(alias="created_at")]]
    delta: Annotated[int, Field(alias="delta")]
    id: NotRequired[Annotated[int, Field(alias="id")]]
    kind: Annotated[PublicRatingKind, Field(alias="kind")]
    rating_after: Annotated[int, Field(alias="rating_after")]
    rating_before: Annotated[int, Field(alias="rating_before")]
    source_id: NotRequired[Annotated[Optional[uuid.UUID], Field(alias="source_id")]]
    source_kind: NotRequired[Annotated[Optional[str], Field(alias="source_kind")]]
    user_id: Annotated[uuid.UUID, Field(alias="user_id")]

class PublicRatingHistoryUpdate(TypedDict):
    created_at: NotRequired[Annotated[datetime.datetime, Field(alias="created_at")]]
    delta: NotRequired[Annotated[int, Field(alias="delta")]]
    id: NotRequired[Annotated[int, Field(alias="id")]]
    kind: NotRequired[Annotated[PublicRatingKind, Field(alias="kind")]]
    rating_after: NotRequired[Annotated[int, Field(alias="rating_after")]]
    rating_before: NotRequired[Annotated[int, Field(alias="rating_before")]]
    source_id: NotRequired[Annotated[Optional[uuid.UUID], Field(alias="source_id")]]
    source_kind: NotRequired[Annotated[Optional[str], Field(alias="source_kind")]]
    user_id: NotRequired[Annotated[uuid.UUID, Field(alias="user_id")]]

class PublicPersonas(BaseModel):
    created_at: datetime.datetime = Field(alias="created_at")
    description: Optional[str] = Field(alias="description")
    difficulty: int = Field(alias="difficulty")
    id: uuid.UUID = Field(alias="id")
    is_active: bool = Field(alias="is_active")
    is_boss: bool = Field(alias="is_boss")
    name: str = Field(alias="name")
    opening_line: str = Field(alias="opening_line")
    slug: str = Field(alias="slug")

class PublicPersonasInsert(TypedDict):
    created_at: NotRequired[Annotated[datetime.datetime, Field(alias="created_at")]]
    description: NotRequired[Annotated[Optional[str], Field(alias="description")]]
    difficulty: NotRequired[Annotated[int, Field(alias="difficulty")]]
    id: NotRequired[Annotated[uuid.UUID, Field(alias="id")]]
    is_active: NotRequired[Annotated[bool, Field(alias="is_active")]]
    is_boss: NotRequired[Annotated[bool, Field(alias="is_boss")]]
    name: Annotated[str, Field(alias="name")]
    opening_line: Annotated[str, Field(alias="opening_line")]
    slug: Annotated[str, Field(alias="slug")]

class PublicPersonasUpdate(TypedDict):
    created_at: NotRequired[Annotated[datetime.datetime, Field(alias="created_at")]]
    description: NotRequired[Annotated[Optional[str], Field(alias="description")]]
    difficulty: NotRequired[Annotated[int, Field(alias="difficulty")]]
    id: NotRequired[Annotated[uuid.UUID, Field(alias="id")]]
    is_active: NotRequired[Annotated[bool, Field(alias="is_active")]]
    is_boss: NotRequired[Annotated[bool, Field(alias="is_boss")]]
    name: NotRequired[Annotated[str, Field(alias="name")]]
    opening_line: NotRequired[Annotated[str, Field(alias="opening_line")]]
    slug: NotRequired[Annotated[str, Field(alias="slug")]]

class PublicPersonaSecrets(BaseModel):
    hidden_type: Optional[str] = Field(alias="hidden_type")
    persona_id: uuid.UUID = Field(alias="persona_id")
    system_prompt: str = Field(alias="system_prompt")

class PublicPersonaSecretsInsert(TypedDict):
    hidden_type: NotRequired[Annotated[Optional[str], Field(alias="hidden_type")]]
    persona_id: Annotated[uuid.UUID, Field(alias="persona_id")]
    system_prompt: Annotated[str, Field(alias="system_prompt")]

class PublicPersonaSecretsUpdate(TypedDict):
    hidden_type: NotRequired[Annotated[Optional[str], Field(alias="hidden_type")]]
    persona_id: NotRequired[Annotated[uuid.UUID, Field(alias="persona_id")]]
    system_prompt: NotRequired[Annotated[str, Field(alias="system_prompt")]]

class PublicMatchmakingQueue(BaseModel):
    enqueued_at: datetime.datetime = Field(alias="enqueued_at")
    id: uuid.UUID = Field(alias="id")
    match_id: Optional[uuid.UUID] = Field(alias="match_id")
    matched_at: Optional[datetime.datetime] = Field(alias="matched_at")
    ranked_elo: int = Field(alias="ranked_elo")
    status: PublicJobStatus = Field(alias="status")
    time_control: PublicTimeControl = Field(alias="time_control")
    user_id: uuid.UUID = Field(alias="user_id")

class PublicMatchmakingQueueInsert(TypedDict):
    enqueued_at: NotRequired[Annotated[datetime.datetime, Field(alias="enqueued_at")]]
    id: NotRequired[Annotated[uuid.UUID, Field(alias="id")]]
    match_id: NotRequired[Annotated[Optional[uuid.UUID], Field(alias="match_id")]]
    matched_at: NotRequired[Annotated[Optional[datetime.datetime], Field(alias="matched_at")]]
    ranked_elo: Annotated[int, Field(alias="ranked_elo")]
    status: NotRequired[Annotated[PublicJobStatus, Field(alias="status")]]
    time_control: NotRequired[Annotated[PublicTimeControl, Field(alias="time_control")]]
    user_id: Annotated[uuid.UUID, Field(alias="user_id")]

class PublicMatchmakingQueueUpdate(TypedDict):
    enqueued_at: NotRequired[Annotated[datetime.datetime, Field(alias="enqueued_at")]]
    id: NotRequired[Annotated[uuid.UUID, Field(alias="id")]]
    match_id: NotRequired[Annotated[Optional[uuid.UUID], Field(alias="match_id")]]
    matched_at: NotRequired[Annotated[Optional[datetime.datetime], Field(alias="matched_at")]]
    ranked_elo: NotRequired[Annotated[int, Field(alias="ranked_elo")]]
    status: NotRequired[Annotated[PublicJobStatus, Field(alias="status")]]
    time_control: NotRequired[Annotated[PublicTimeControl, Field(alias="time_control")]]
    user_id: NotRequired[Annotated[uuid.UUID, Field(alias="user_id")]]

class PublicMatches(BaseModel):
    best_of: int = Field(alias="best_of")
    completed_at: Optional[datetime.datetime] = Field(alias="completed_at")
    created_at: datetime.datetime = Field(alias="created_at")
    end_reason: Optional[PublicMatchEndReason] = Field(alias="end_reason")
    id: uuid.UUID = Field(alias="id")
    mode: PublicMatchMode = Field(alias="mode")
    move_seconds: int = Field(alias="move_seconds")
    opening_line: str = Field(alias="opening_line")
    persona_id: uuid.UUID = Field(alias="persona_id")
    status: PublicMatchStatus = Field(alias="status")
    time_control: PublicTimeControl = Field(alias="time_control")
    winner_side: Optional[PublicMatchSide] = Field(alias="winner_side")

class PublicMatchesInsert(TypedDict):
    best_of: NotRequired[Annotated[int, Field(alias="best_of")]]
    completed_at: NotRequired[Annotated[Optional[datetime.datetime], Field(alias="completed_at")]]
    created_at: NotRequired[Annotated[datetime.datetime, Field(alias="created_at")]]
    end_reason: NotRequired[Annotated[Optional[PublicMatchEndReason], Field(alias="end_reason")]]
    id: NotRequired[Annotated[uuid.UUID, Field(alias="id")]]
    mode: Annotated[PublicMatchMode, Field(alias="mode")]
    move_seconds: NotRequired[Annotated[int, Field(alias="move_seconds")]]
    opening_line: Annotated[str, Field(alias="opening_line")]
    persona_id: Annotated[uuid.UUID, Field(alias="persona_id")]
    status: NotRequired[Annotated[PublicMatchStatus, Field(alias="status")]]
    time_control: NotRequired[Annotated[PublicTimeControl, Field(alias="time_control")]]
    winner_side: NotRequired[Annotated[Optional[PublicMatchSide], Field(alias="winner_side")]]

class PublicMatchesUpdate(TypedDict):
    best_of: NotRequired[Annotated[int, Field(alias="best_of")]]
    completed_at: NotRequired[Annotated[Optional[datetime.datetime], Field(alias="completed_at")]]
    created_at: NotRequired[Annotated[datetime.datetime, Field(alias="created_at")]]
    end_reason: NotRequired[Annotated[Optional[PublicMatchEndReason], Field(alias="end_reason")]]
    id: NotRequired[Annotated[uuid.UUID, Field(alias="id")]]
    mode: NotRequired[Annotated[PublicMatchMode, Field(alias="mode")]]
    move_seconds: NotRequired[Annotated[int, Field(alias="move_seconds")]]
    opening_line: NotRequired[Annotated[str, Field(alias="opening_line")]]
    persona_id: NotRequired[Annotated[uuid.UUID, Field(alias="persona_id")]]
    status: NotRequired[Annotated[PublicMatchStatus, Field(alias="status")]]
    time_control: NotRequired[Annotated[PublicTimeControl, Field(alias="time_control")]]
    winner_side: NotRequired[Annotated[Optional[PublicMatchSide], Field(alias="winner_side")]]

class PublicPvpMatches(BaseModel):
    match_id: uuid.UUID = Field(alias="match_id")
    player_a: uuid.UUID = Field(alias="player_a")
    player_a_elo_after: Optional[int] = Field(alias="player_a_elo_after")
    player_a_elo_before: Optional[int] = Field(alias="player_a_elo_before")
    player_b: uuid.UUID = Field(alias="player_b")
    player_b_elo_after: Optional[int] = Field(alias="player_b_elo_after")
    player_b_elo_before: Optional[int] = Field(alias="player_b_elo_before")

class PublicPvpMatchesInsert(TypedDict):
    match_id: Annotated[uuid.UUID, Field(alias="match_id")]
    player_a: Annotated[uuid.UUID, Field(alias="player_a")]
    player_a_elo_after: NotRequired[Annotated[Optional[int], Field(alias="player_a_elo_after")]]
    player_a_elo_before: NotRequired[Annotated[Optional[int], Field(alias="player_a_elo_before")]]
    player_b: Annotated[uuid.UUID, Field(alias="player_b")]
    player_b_elo_after: NotRequired[Annotated[Optional[int], Field(alias="player_b_elo_after")]]
    player_b_elo_before: NotRequired[Annotated[Optional[int], Field(alias="player_b_elo_before")]]

class PublicPvpMatchesUpdate(TypedDict):
    match_id: NotRequired[Annotated[uuid.UUID, Field(alias="match_id")]]
    player_a: NotRequired[Annotated[uuid.UUID, Field(alias="player_a")]]
    player_a_elo_after: NotRequired[Annotated[Optional[int], Field(alias="player_a_elo_after")]]
    player_a_elo_before: NotRequired[Annotated[Optional[int], Field(alias="player_a_elo_before")]]
    player_b: NotRequired[Annotated[uuid.UUID, Field(alias="player_b")]]
    player_b_elo_after: NotRequired[Annotated[Optional[int], Field(alias="player_b_elo_after")]]
    player_b_elo_before: NotRequired[Annotated[Optional[int], Field(alias="player_b_elo_before")]]

class PublicAiMatches(BaseModel):
    ai_label: str = Field(alias="ai_label")
    ai_rating: Optional[int] = Field(alias="ai_rating")
    match_id: uuid.UUID = Field(alias="match_id")
    player: uuid.UUID = Field(alias="player")
    player_casual_after: Optional[int] = Field(alias="player_casual_after")
    player_casual_before: Optional[int] = Field(alias="player_casual_before")

class PublicAiMatchesInsert(TypedDict):
    ai_label: Annotated[str, Field(alias="ai_label")]
    ai_rating: NotRequired[Annotated[Optional[int], Field(alias="ai_rating")]]
    match_id: Annotated[uuid.UUID, Field(alias="match_id")]
    player: Annotated[uuid.UUID, Field(alias="player")]
    player_casual_after: NotRequired[Annotated[Optional[int], Field(alias="player_casual_after")]]
    player_casual_before: NotRequired[Annotated[Optional[int], Field(alias="player_casual_before")]]

class PublicAiMatchesUpdate(TypedDict):
    ai_label: NotRequired[Annotated[str, Field(alias="ai_label")]]
    ai_rating: NotRequired[Annotated[Optional[int], Field(alias="ai_rating")]]
    match_id: NotRequired[Annotated[uuid.UUID, Field(alias="match_id")]]
    player: NotRequired[Annotated[uuid.UUID, Field(alias="player")]]
    player_casual_after: NotRequired[Annotated[Optional[int], Field(alias="player_casual_after")]]
    player_casual_before: NotRequired[Annotated[Optional[int], Field(alias="player_casual_before")]]

class PublicGhostMatches(BaseModel):
    ghost_player: Optional[uuid.UUID] = Field(alias="ghost_player")
    match_id: uuid.UUID = Field(alias="match_id")
    player: uuid.UUID = Field(alias="player")
    player_elo_after: Optional[int] = Field(alias="player_elo_after")
    player_elo_before: Optional[int] = Field(alias="player_elo_before")
    source_match_id: uuid.UUID = Field(alias="source_match_id")

class PublicGhostMatchesInsert(TypedDict):
    ghost_player: NotRequired[Annotated[Optional[uuid.UUID], Field(alias="ghost_player")]]
    match_id: Annotated[uuid.UUID, Field(alias="match_id")]
    player: Annotated[uuid.UUID, Field(alias="player")]
    player_elo_after: NotRequired[Annotated[Optional[int], Field(alias="player_elo_after")]]
    player_elo_before: NotRequired[Annotated[Optional[int], Field(alias="player_elo_before")]]
    source_match_id: Annotated[uuid.UUID, Field(alias="source_match_id")]

class PublicGhostMatchesUpdate(TypedDict):
    ghost_player: NotRequired[Annotated[Optional[uuid.UUID], Field(alias="ghost_player")]]
    match_id: NotRequired[Annotated[uuid.UUID, Field(alias="match_id")]]
    player: NotRequired[Annotated[uuid.UUID, Field(alias="player")]]
    player_elo_after: NotRequired[Annotated[Optional[int], Field(alias="player_elo_after")]]
    player_elo_before: NotRequired[Annotated[Optional[int], Field(alias="player_elo_before")]]
    source_match_id: NotRequired[Annotated[uuid.UUID, Field(alias="source_match_id")]]

class PublicMatchRounds(BaseModel):
    created_at: datetime.datetime = Field(alias="created_at")
    id: uuid.UUID = Field(alias="id")
    match_id: uuid.UUID = Field(alias="match_id")
    prompt: Optional[str] = Field(alias="prompt")
    round_number: int = Field(alias="round_number")
    scored_at: Optional[datetime.datetime] = Field(alias="scored_at")
    status: PublicMatchStatus = Field(alias="status")
    winner_side: Optional[PublicMatchSide] = Field(alias="winner_side")

class PublicMatchRoundsInsert(TypedDict):
    created_at: NotRequired[Annotated[datetime.datetime, Field(alias="created_at")]]
    id: NotRequired[Annotated[uuid.UUID, Field(alias="id")]]
    match_id: Annotated[uuid.UUID, Field(alias="match_id")]
    prompt: NotRequired[Annotated[Optional[str], Field(alias="prompt")]]
    round_number: Annotated[int, Field(alias="round_number")]
    scored_at: NotRequired[Annotated[Optional[datetime.datetime], Field(alias="scored_at")]]
    status: NotRequired[Annotated[PublicMatchStatus, Field(alias="status")]]
    winner_side: NotRequired[Annotated[Optional[PublicMatchSide], Field(alias="winner_side")]]

class PublicMatchRoundsUpdate(TypedDict):
    created_at: NotRequired[Annotated[datetime.datetime, Field(alias="created_at")]]
    id: NotRequired[Annotated[uuid.UUID, Field(alias="id")]]
    match_id: NotRequired[Annotated[uuid.UUID, Field(alias="match_id")]]
    prompt: NotRequired[Annotated[Optional[str], Field(alias="prompt")]]
    round_number: NotRequired[Annotated[int, Field(alias="round_number")]]
    scored_at: NotRequired[Annotated[Optional[datetime.datetime], Field(alias="scored_at")]]
    status: NotRequired[Annotated[PublicMatchStatus, Field(alias="status")]]
    winner_side: NotRequired[Annotated[Optional[PublicMatchSide], Field(alias="winner_side")]]

class PublicMatchMoves(BaseModel):
    classification: Optional[PublicMoveKind] = Field(alias="classification")
    content: Optional[str] = Field(alias="content")
    created_at: datetime.datetime = Field(alias="created_at")
    deadline: Optional[datetime.datetime] = Field(alias="deadline")
    eval_after: Optional[float] = Field(alias="eval_after")
    eval_before: Optional[float] = Field(alias="eval_before")
    eval_delta: Optional[float] = Field(alias="eval_delta")
    id: uuid.UUID = Field(alias="id")
    responded_at: Optional[datetime.datetime] = Field(alias="responded_at")
    round_id: uuid.UUID = Field(alias="round_id")
    scored_at: Optional[datetime.datetime] = Field(alias="scored_at")
    side: PublicMatchSide = Field(alias="side")
    timed_out: bool = Field(alias="timed_out")

class PublicMatchMovesInsert(TypedDict):
    classification: NotRequired[Annotated[Optional[PublicMoveKind], Field(alias="classification")]]
    content: NotRequired[Annotated[Optional[str], Field(alias="content")]]
    created_at: NotRequired[Annotated[datetime.datetime, Field(alias="created_at")]]
    deadline: NotRequired[Annotated[Optional[datetime.datetime], Field(alias="deadline")]]
    eval_after: NotRequired[Annotated[Optional[float], Field(alias="eval_after")]]
    eval_before: NotRequired[Annotated[Optional[float], Field(alias="eval_before")]]
    eval_delta: NotRequired[Annotated[Optional[float], Field(alias="eval_delta")]]
    id: NotRequired[Annotated[uuid.UUID, Field(alias="id")]]
    responded_at: NotRequired[Annotated[Optional[datetime.datetime], Field(alias="responded_at")]]
    round_id: Annotated[uuid.UUID, Field(alias="round_id")]
    scored_at: NotRequired[Annotated[Optional[datetime.datetime], Field(alias="scored_at")]]
    side: Annotated[PublicMatchSide, Field(alias="side")]
    timed_out: NotRequired[Annotated[bool, Field(alias="timed_out")]]

class PublicMatchMovesUpdate(TypedDict):
    classification: NotRequired[Annotated[Optional[PublicMoveKind], Field(alias="classification")]]
    content: NotRequired[Annotated[Optional[str], Field(alias="content")]]
    created_at: NotRequired[Annotated[datetime.datetime, Field(alias="created_at")]]
    deadline: NotRequired[Annotated[Optional[datetime.datetime], Field(alias="deadline")]]
    eval_after: NotRequired[Annotated[Optional[float], Field(alias="eval_after")]]
    eval_before: NotRequired[Annotated[Optional[float], Field(alias="eval_before")]]
    eval_delta: NotRequired[Annotated[Optional[float], Field(alias="eval_delta")]]
    id: NotRequired[Annotated[uuid.UUID, Field(alias="id")]]
    responded_at: NotRequired[Annotated[Optional[datetime.datetime], Field(alias="responded_at")]]
    round_id: NotRequired[Annotated[uuid.UUID, Field(alias="round_id")]]
    scored_at: NotRequired[Annotated[Optional[datetime.datetime], Field(alias="scored_at")]]
    side: NotRequired[Annotated[PublicMatchSide, Field(alias="side")]]
    timed_out: NotRequired[Annotated[bool, Field(alias="timed_out")]]

class PublicAnalysisJobs(BaseModel):
    attempts: int = Field(alias="attempts")
    created_at: datetime.datetime = Field(alias="created_at")
    finished_at: Optional[datetime.datetime] = Field(alias="finished_at")
    game_id: Optional[uuid.UUID] = Field(alias="game_id")
    id: uuid.UUID = Field(alias="id")
    idempotency_key: Optional[str] = Field(alias="idempotency_key")
    kind: PublicJobKind = Field(alias="kind")
    last_error: Optional[str] = Field(alias="last_error")
    queue_msg_id: Optional[int] = Field(alias="queue_msg_id")
    round_id: Optional[uuid.UUID] = Field(alias="round_id")
    started_at: Optional[datetime.datetime] = Field(alias="started_at")
    status: PublicJobStatus = Field(alias="status")
    updated_at: datetime.datetime = Field(alias="updated_at")
    user_id: Optional[uuid.UUID] = Field(alias="user_id")

class PublicAnalysisJobsInsert(TypedDict):
    attempts: NotRequired[Annotated[int, Field(alias="attempts")]]
    created_at: NotRequired[Annotated[datetime.datetime, Field(alias="created_at")]]
    finished_at: NotRequired[Annotated[Optional[datetime.datetime], Field(alias="finished_at")]]
    game_id: NotRequired[Annotated[Optional[uuid.UUID], Field(alias="game_id")]]
    id: NotRequired[Annotated[uuid.UUID, Field(alias="id")]]
    idempotency_key: NotRequired[Annotated[Optional[str], Field(alias="idempotency_key")]]
    kind: Annotated[PublicJobKind, Field(alias="kind")]
    last_error: NotRequired[Annotated[Optional[str], Field(alias="last_error")]]
    queue_msg_id: NotRequired[Annotated[Optional[int], Field(alias="queue_msg_id")]]
    round_id: NotRequired[Annotated[Optional[uuid.UUID], Field(alias="round_id")]]
    started_at: NotRequired[Annotated[Optional[datetime.datetime], Field(alias="started_at")]]
    status: NotRequired[Annotated[PublicJobStatus, Field(alias="status")]]
    updated_at: NotRequired[Annotated[datetime.datetime, Field(alias="updated_at")]]
    user_id: NotRequired[Annotated[Optional[uuid.UUID], Field(alias="user_id")]]

class PublicAnalysisJobsUpdate(TypedDict):
    attempts: NotRequired[Annotated[int, Field(alias="attempts")]]
    created_at: NotRequired[Annotated[datetime.datetime, Field(alias="created_at")]]
    finished_at: NotRequired[Annotated[Optional[datetime.datetime], Field(alias="finished_at")]]
    game_id: NotRequired[Annotated[Optional[uuid.UUID], Field(alias="game_id")]]
    id: NotRequired[Annotated[uuid.UUID, Field(alias="id")]]
    idempotency_key: NotRequired[Annotated[Optional[str], Field(alias="idempotency_key")]]
    kind: NotRequired[Annotated[PublicJobKind, Field(alias="kind")]]
    last_error: NotRequired[Annotated[Optional[str], Field(alias="last_error")]]
    queue_msg_id: NotRequired[Annotated[Optional[int], Field(alias="queue_msg_id")]]
    round_id: NotRequired[Annotated[Optional[uuid.UUID], Field(alias="round_id")]]
    started_at: NotRequired[Annotated[Optional[datetime.datetime], Field(alias="started_at")]]
    status: NotRequired[Annotated[PublicJobStatus, Field(alias="status")]]
    updated_at: NotRequired[Annotated[datetime.datetime, Field(alias="updated_at")]]
    user_id: NotRequired[Annotated[Optional[uuid.UUID], Field(alias="user_id")]]

class PublicGames(BaseModel):
    accuracy: Optional[float] = Field(alias="accuracy")
    created_at: datetime.datetime = Field(alias="created_at")
    description: Optional[str] = Field(alias="description")
    end_reason: Optional[PublicMatchEndReason] = Field(alias="end_reason")
    ended_at: Optional[datetime.datetime] = Field(alias="ended_at")
    id: uuid.UUID = Field(alias="id")
    mode: PublicGameMode = Field(alias="mode")
    share_slug: Optional[str] = Field(alias="share_slug")
    status: PublicGameStatus = Field(alias="status")
    title: Optional[str] = Field(alias="title")
    user_id: Optional[uuid.UUID] = Field(alias="user_id")

class PublicGamesInsert(TypedDict):
    accuracy: NotRequired[Annotated[Optional[float], Field(alias="accuracy")]]
    created_at: NotRequired[Annotated[datetime.datetime, Field(alias="created_at")]]
    description: NotRequired[Annotated[Optional[str], Field(alias="description")]]
    end_reason: NotRequired[Annotated[Optional[PublicMatchEndReason], Field(alias="end_reason")]]
    ended_at: NotRequired[Annotated[Optional[datetime.datetime], Field(alias="ended_at")]]
    id: NotRequired[Annotated[uuid.UUID, Field(alias="id")]]
    mode: Annotated[PublicGameMode, Field(alias="mode")]
    share_slug: NotRequired[Annotated[Optional[str], Field(alias="share_slug")]]
    status: NotRequired[Annotated[PublicGameStatus, Field(alias="status")]]
    title: NotRequired[Annotated[Optional[str], Field(alias="title")]]
    user_id: NotRequired[Annotated[Optional[uuid.UUID], Field(alias="user_id")]]

class PublicGamesUpdate(TypedDict):
    accuracy: NotRequired[Annotated[Optional[float], Field(alias="accuracy")]]
    created_at: NotRequired[Annotated[datetime.datetime, Field(alias="created_at")]]
    description: NotRequired[Annotated[Optional[str], Field(alias="description")]]
    end_reason: NotRequired[Annotated[Optional[PublicMatchEndReason], Field(alias="end_reason")]]
    ended_at: NotRequired[Annotated[Optional[datetime.datetime], Field(alias="ended_at")]]
    id: NotRequired[Annotated[uuid.UUID, Field(alias="id")]]
    mode: NotRequired[Annotated[PublicGameMode, Field(alias="mode")]]
    share_slug: NotRequired[Annotated[Optional[str], Field(alias="share_slug")]]
    status: NotRequired[Annotated[PublicGameStatus, Field(alias="status")]]
    title: NotRequired[Annotated[Optional[str], Field(alias="title")]]
    user_id: NotRequired[Annotated[Optional[uuid.UUID], Field(alias="user_id")]]

class PublicSoloGames(BaseModel):
    base_seconds: int = Field(alias="base_seconds")
    exchanges: int = Field(alias="exchanges")
    game_id: uuid.UUID = Field(alias="game_id")
    increment_seconds: int = Field(alias="increment_seconds")
    is_practice: bool = Field(alias="is_practice")
    persona_id: Optional[uuid.UUID] = Field(alias="persona_id")
    rating_delta: int = Field(alias="rating_delta")
    turn_deadline: Optional[datetime.datetime] = Field(alias="turn_deadline")

class PublicSoloGamesInsert(TypedDict):
    base_seconds: NotRequired[Annotated[int, Field(alias="base_seconds")]]
    exchanges: NotRequired[Annotated[int, Field(alias="exchanges")]]
    game_id: Annotated[uuid.UUID, Field(alias="game_id")]
    increment_seconds: NotRequired[Annotated[int, Field(alias="increment_seconds")]]
    is_practice: NotRequired[Annotated[bool, Field(alias="is_practice")]]
    persona_id: NotRequired[Annotated[Optional[uuid.UUID], Field(alias="persona_id")]]
    rating_delta: NotRequired[Annotated[int, Field(alias="rating_delta")]]
    turn_deadline: NotRequired[Annotated[Optional[datetime.datetime], Field(alias="turn_deadline")]]

class PublicSoloGamesUpdate(TypedDict):
    base_seconds: NotRequired[Annotated[int, Field(alias="base_seconds")]]
    exchanges: NotRequired[Annotated[int, Field(alias="exchanges")]]
    game_id: NotRequired[Annotated[uuid.UUID, Field(alias="game_id")]]
    increment_seconds: NotRequired[Annotated[int, Field(alias="increment_seconds")]]
    is_practice: NotRequired[Annotated[bool, Field(alias="is_practice")]]
    persona_id: NotRequired[Annotated[Optional[uuid.UUID], Field(alias="persona_id")]]
    rating_delta: NotRequired[Annotated[int, Field(alias="rating_delta")]]
    turn_deadline: NotRequired[Annotated[Optional[datetime.datetime], Field(alias="turn_deadline")]]

class PublicScreenshotGames(BaseModel):
    attested_consent: bool = Field(alias="attested_consent")
    game_id: uuid.UUID = Field(alias="game_id")
    provisional_rating: Optional[int] = Field(alias="provisional_rating")
    transcript_hash: Optional[str] = Field(alias="transcript_hash")

class PublicScreenshotGamesInsert(TypedDict):
    attested_consent: NotRequired[Annotated[bool, Field(alias="attested_consent")]]
    game_id: Annotated[uuid.UUID, Field(alias="game_id")]
    provisional_rating: NotRequired[Annotated[Optional[int], Field(alias="provisional_rating")]]
    transcript_hash: NotRequired[Annotated[Optional[str], Field(alias="transcript_hash")]]

class PublicScreenshotGamesUpdate(TypedDict):
    attested_consent: NotRequired[Annotated[bool, Field(alias="attested_consent")]]
    game_id: NotRequired[Annotated[uuid.UUID, Field(alias="game_id")]]
    provisional_rating: NotRequired[Annotated[Optional[int], Field(alias="provisional_rating")]]
    transcript_hash: NotRequired[Annotated[Optional[str], Field(alias="transcript_hash")]]

class PublicPuzzles(BaseModel):
    created_at: datetime.datetime = Field(alias="created_at")
    difficulty: int = Field(alias="difficulty")
    id: uuid.UUID = Field(alias="id")
    is_active: bool = Field(alias="is_active")
    persona_id: Optional[uuid.UUID] = Field(alias="persona_id")
    prompt: str = Field(alias="prompt")
    slug: str = Field(alias="slug")

class PublicPuzzlesInsert(TypedDict):
    created_at: NotRequired[Annotated[datetime.datetime, Field(alias="created_at")]]
    difficulty: NotRequired[Annotated[int, Field(alias="difficulty")]]
    id: NotRequired[Annotated[uuid.UUID, Field(alias="id")]]
    is_active: NotRequired[Annotated[bool, Field(alias="is_active")]]
    persona_id: NotRequired[Annotated[Optional[uuid.UUID], Field(alias="persona_id")]]
    prompt: Annotated[str, Field(alias="prompt")]
    slug: Annotated[str, Field(alias="slug")]

class PublicPuzzlesUpdate(TypedDict):
    created_at: NotRequired[Annotated[datetime.datetime, Field(alias="created_at")]]
    difficulty: NotRequired[Annotated[int, Field(alias="difficulty")]]
    id: NotRequired[Annotated[uuid.UUID, Field(alias="id")]]
    is_active: NotRequired[Annotated[bool, Field(alias="is_active")]]
    persona_id: NotRequired[Annotated[Optional[uuid.UUID], Field(alias="persona_id")]]
    prompt: NotRequired[Annotated[str, Field(alias="prompt")]]
    slug: NotRequired[Annotated[str, Field(alias="slug")]]

class PublicPuzzleSolutions(BaseModel):
    best_eval_delta: Optional[float] = Field(alias="best_eval_delta")
    best_move: str = Field(alias="best_move")
    puzzle_id: uuid.UUID = Field(alias="puzzle_id")

class PublicPuzzleSolutionsInsert(TypedDict):
    best_eval_delta: NotRequired[Annotated[Optional[float], Field(alias="best_eval_delta")]]
    best_move: Annotated[str, Field(alias="best_move")]
    puzzle_id: Annotated[uuid.UUID, Field(alias="puzzle_id")]

class PublicPuzzleSolutionsUpdate(TypedDict):
    best_eval_delta: NotRequired[Annotated[Optional[float], Field(alias="best_eval_delta")]]
    best_move: NotRequired[Annotated[str, Field(alias="best_move")]]
    puzzle_id: NotRequired[Annotated[uuid.UUID, Field(alias="puzzle_id")]]

class PublicPuzzleAttempts(BaseModel):
    eval_delta: Optional[float] = Field(alias="eval_delta")
    game_id: uuid.UUID = Field(alias="game_id")
    guess: str = Field(alias="guess")
    puzzle_id: uuid.UUID = Field(alias="puzzle_id")
    solved: bool = Field(alias="solved")

class PublicPuzzleAttemptsInsert(TypedDict):
    eval_delta: NotRequired[Annotated[Optional[float], Field(alias="eval_delta")]]
    game_id: Annotated[uuid.UUID, Field(alias="game_id")]
    guess: Annotated[str, Field(alias="guess")]
    puzzle_id: Annotated[uuid.UUID, Field(alias="puzzle_id")]
    solved: NotRequired[Annotated[bool, Field(alias="solved")]]

class PublicPuzzleAttemptsUpdate(TypedDict):
    eval_delta: NotRequired[Annotated[Optional[float], Field(alias="eval_delta")]]
    game_id: NotRequired[Annotated[uuid.UUID, Field(alias="game_id")]]
    guess: NotRequired[Annotated[str, Field(alias="guess")]]
    puzzle_id: NotRequired[Annotated[uuid.UUID, Field(alias="puzzle_id")]]
    solved: NotRequired[Annotated[bool, Field(alias="solved")]]

class PublicMoves(BaseModel):
    classification: PublicMoveKind = Field(alias="classification")
    content: str = Field(alias="content")
    created_at: datetime.datetime = Field(alias="created_at")
    eval_after: Optional[float] = Field(alias="eval_after")
    eval_before: Optional[float] = Field(alias="eval_before")
    eval_delta: Optional[float] = Field(alias="eval_delta")
    game_id: uuid.UUID = Field(alias="game_id")
    id: uuid.UUID = Field(alias="id")
    position: int = Field(alias="position")
    side: PublicMessageSide = Field(alias="side")

class PublicMovesInsert(TypedDict):
    classification: NotRequired[Annotated[PublicMoveKind, Field(alias="classification")]]
    content: Annotated[str, Field(alias="content")]
    created_at: NotRequired[Annotated[datetime.datetime, Field(alias="created_at")]]
    eval_after: NotRequired[Annotated[Optional[float], Field(alias="eval_after")]]
    eval_before: NotRequired[Annotated[Optional[float], Field(alias="eval_before")]]
    eval_delta: NotRequired[Annotated[Optional[float], Field(alias="eval_delta")]]
    game_id: Annotated[uuid.UUID, Field(alias="game_id")]
    id: NotRequired[Annotated[uuid.UUID, Field(alias="id")]]
    position: Annotated[int, Field(alias="position")]
    side: Annotated[PublicMessageSide, Field(alias="side")]

class PublicMovesUpdate(TypedDict):
    classification: NotRequired[Annotated[PublicMoveKind, Field(alias="classification")]]
    content: NotRequired[Annotated[str, Field(alias="content")]]
    created_at: NotRequired[Annotated[datetime.datetime, Field(alias="created_at")]]
    eval_after: NotRequired[Annotated[Optional[float], Field(alias="eval_after")]]
    eval_before: NotRequired[Annotated[Optional[float], Field(alias="eval_before")]]
    eval_delta: NotRequired[Annotated[Optional[float], Field(alias="eval_delta")]]
    game_id: NotRequired[Annotated[uuid.UUID, Field(alias="game_id")]]
    id: NotRequired[Annotated[uuid.UUID, Field(alias="id")]]
    position: NotRequired[Annotated[int, Field(alias="position")]]
    side: NotRequired[Annotated[PublicMessageSide, Field(alias="side")]]

class PublicEngineResponses(BaseModel):
    created_at: datetime.datetime = Field(alias="created_at")
    game_id: Optional[uuid.UUID] = Field(alias="game_id")
    id: uuid.UUID = Field(alias="id")
    latency_ms: Optional[int] = Field(alias="latency_ms")
    model: str = Field(alias="model")
    prompt_version: Optional[str] = Field(alias="prompt_version")
    raw_response: Json[Any] = Field(alias="raw_response")
    round_id: Optional[uuid.UUID] = Field(alias="round_id")

class PublicEngineResponsesInsert(TypedDict):
    created_at: NotRequired[Annotated[datetime.datetime, Field(alias="created_at")]]
    game_id: NotRequired[Annotated[Optional[uuid.UUID], Field(alias="game_id")]]
    id: NotRequired[Annotated[uuid.UUID, Field(alias="id")]]
    latency_ms: NotRequired[Annotated[Optional[int], Field(alias="latency_ms")]]
    model: Annotated[str, Field(alias="model")]
    prompt_version: NotRequired[Annotated[Optional[str], Field(alias="prompt_version")]]
    raw_response: Annotated[Json[Any], Field(alias="raw_response")]
    round_id: NotRequired[Annotated[Optional[uuid.UUID], Field(alias="round_id")]]

class PublicEngineResponsesUpdate(TypedDict):
    created_at: NotRequired[Annotated[datetime.datetime, Field(alias="created_at")]]
    game_id: NotRequired[Annotated[Optional[uuid.UUID], Field(alias="game_id")]]
    id: NotRequired[Annotated[uuid.UUID, Field(alias="id")]]
    latency_ms: NotRequired[Annotated[Optional[int], Field(alias="latency_ms")]]
    model: NotRequired[Annotated[str, Field(alias="model")]]
    prompt_version: NotRequired[Annotated[Optional[str], Field(alias="prompt_version")]]
    raw_response: NotRequired[Annotated[Json[Any], Field(alias="raw_response")]]
    round_id: NotRequired[Annotated[Optional[uuid.UUID], Field(alias="round_id")]]

class PublicGameRevealUnlocks(BaseModel):
    game_id: uuid.UUID = Field(alias="game_id")
    source: PublicUnlockSource = Field(alias="source")
    unlocked_at: datetime.datetime = Field(alias="unlocked_at")
    user_id: uuid.UUID = Field(alias="user_id")

class PublicGameRevealUnlocksInsert(TypedDict):
    game_id: Annotated[uuid.UUID, Field(alias="game_id")]
    source: NotRequired[Annotated[PublicUnlockSource, Field(alias="source")]]
    unlocked_at: NotRequired[Annotated[datetime.datetime, Field(alias="unlocked_at")]]
    user_id: Annotated[uuid.UUID, Field(alias="user_id")]

class PublicGameRevealUnlocksUpdate(TypedDict):
    game_id: NotRequired[Annotated[uuid.UUID, Field(alias="game_id")]]
    source: NotRequired[Annotated[PublicUnlockSource, Field(alias="source")]]
    unlocked_at: NotRequired[Annotated[datetime.datetime, Field(alias="unlocked_at")]]
    user_id: NotRequired[Annotated[uuid.UUID, Field(alias="user_id")]]

class PublicMatchRevealUnlocks(BaseModel):
    match_id: uuid.UUID = Field(alias="match_id")
    source: PublicUnlockSource = Field(alias="source")
    unlocked_at: datetime.datetime = Field(alias="unlocked_at")
    user_id: uuid.UUID = Field(alias="user_id")

class PublicMatchRevealUnlocksInsert(TypedDict):
    match_id: Annotated[uuid.UUID, Field(alias="match_id")]
    source: NotRequired[Annotated[PublicUnlockSource, Field(alias="source")]]
    unlocked_at: NotRequired[Annotated[datetime.datetime, Field(alias="unlocked_at")]]
    user_id: Annotated[uuid.UUID, Field(alias="user_id")]

class PublicMatchRevealUnlocksUpdate(TypedDict):
    match_id: NotRequired[Annotated[uuid.UUID, Field(alias="match_id")]]
    source: NotRequired[Annotated[PublicUnlockSource, Field(alias="source")]]
    unlocked_at: NotRequired[Annotated[datetime.datetime, Field(alias="unlocked_at")]]
    user_id: NotRequired[Annotated[uuid.UUID, Field(alias="user_id")]]

class PublicMoveReveals(BaseModel):
    best_move: str = Field(alias="best_move")
    game_id: uuid.UUID = Field(alias="game_id")
    move_id: uuid.UUID = Field(alias="move_id")

class PublicMoveRevealsInsert(TypedDict):
    best_move: Annotated[str, Field(alias="best_move")]
    game_id: Annotated[uuid.UUID, Field(alias="game_id")]
    move_id: Annotated[uuid.UUID, Field(alias="move_id")]

class PublicMoveRevealsUpdate(TypedDict):
    best_move: NotRequired[Annotated[str, Field(alias="best_move")]]
    game_id: NotRequired[Annotated[uuid.UUID, Field(alias="game_id")]]
    move_id: NotRequired[Annotated[uuid.UUID, Field(alias="move_id")]]

class PublicMatchMoveReveals(BaseModel):
    best_move: str = Field(alias="best_move")
    match_id: uuid.UUID = Field(alias="match_id")
    match_move_id: uuid.UUID = Field(alias="match_move_id")

class PublicMatchMoveRevealsInsert(TypedDict):
    best_move: Annotated[str, Field(alias="best_move")]
    match_id: Annotated[uuid.UUID, Field(alias="match_id")]
    match_move_id: Annotated[uuid.UUID, Field(alias="match_move_id")]

class PublicMatchMoveRevealsUpdate(TypedDict):
    best_move: NotRequired[Annotated[str, Field(alias="best_move")]]
    match_id: NotRequired[Annotated[uuid.UUID, Field(alias="match_id")]]
    match_move_id: NotRequired[Annotated[uuid.UUID, Field(alias="match_move_id")]]
