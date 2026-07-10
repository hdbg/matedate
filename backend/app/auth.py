"""Bearer-token auth: verify a client's Supabase access token and resolve its user id."""

from supabase import AsyncClient


class AuthError(Exception):
    """Raised when a token is missing, invalid, or expired."""


async def verify_token(supabase: AsyncClient, jwt: str) -> str:
    """Return the authenticated user's id, or raise AuthError.

    Validates the JWT against Supabase Auth (GET /auth/v1/user). Works for any signed-in
    user, including anonymous sessions created via signInAnonymously().
    """
    if not jwt:
        raise AuthError("missing token")
    try:
        response = await supabase.auth.get_user(jwt)
    except Exception as exc:  # supabase raises on invalid/expired tokens
        raise AuthError("invalid token") from exc
    if response is None or response.user is None:
        raise AuthError("invalid token")
    return response.user.id
