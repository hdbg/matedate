diesel::table! {
    users (id) {
        id -> Integer,
        telegram_id -> BigInt,
        elo_rating -> Integer,
        created_at -> Integer,
    }
}

diesel::table! {
    games (id) {
        id -> Integer,
        user_id -> Integer,
        hash -> Text,
        title -> Text,
        description -> Text,
        elo_delta -> Integer,
        created_at -> Integer,
    }
}

diesel::table! {
    moves (id) {
        id -> Integer,
        game_id -> Integer,
        content -> Text,
        side -> Text,
        kind -> Text,
        created_at -> Integer,
    }
}

diesel::joinable!(games -> users (user_id));
diesel::joinable!(moves -> games (game_id));

diesel::allow_tables_to_appear_in_same_query!(users, games, moves);
