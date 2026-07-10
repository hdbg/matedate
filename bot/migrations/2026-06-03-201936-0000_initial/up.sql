CREATE TABLE users (
    id INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    telegram_id BIGINT NOT NULL UNIQUE,
    elo_rating INTEGER NOT NULL DEFAULT 1000,
    created_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now'))
);

CREATE TABLE games (
    id INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    hash TEXT NOT NULL UNIQUE,
    title TEXT NOT NULL,
    description TEXT NOT NULL,
    elo_delta INTEGER NOT NULL,
    created_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now')),
    FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
);

CREATE TABLE moves (
    id INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    game_id INTEGER NOT NULL,
    content TEXT NOT NULL,
    side TEXT NOT NULL CHECK (side IN ('They', 'Us')),
    kind TEXT NOT NULL CHECK (
        kind IN (
            'Best',
            'Excellent',
            'Good',
            'Inaccuracy',
            'Miss',
            'Mistake',
            'Blunder',
            'SuperRisky',
            'Risky',
            'Book'
        )
    ),
    created_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now')),
    FOREIGN KEY (game_id) REFERENCES games (id) ON DELETE CASCADE
);

CREATE INDEX idx_games_user_id ON games (user_id);
CREATE INDEX idx_moves_game_id ON moves (game_id);
