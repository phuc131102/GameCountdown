import os
from datetime import datetime, timezone
from html import escape
from zoneinfo import ZoneInfo

import resend
from dotenv import load_dotenv
from supabase import create_client


# =========================================================
# CONFIG
# =========================================================

TEST_MODE = False
TEST_GAME_NAME = "Resonance: A Plague Tale Legacy"

TIMEZONE = ZoneInfo("Asia/Ho_Chi_Minh")

# Days before release when an email should be sent.
NOTIFICATION_DAYS = {7, 3, 1, 0}


# =========================================================
# ENV
# =========================================================

load_dotenv()

SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_KEY = os.getenv("SUPABASE_KEY")

RESEND_API_KEY = os.getenv("RESEND_API_KEY")
NOTIFY_EMAIL = os.getenv("NOTIFY_EMAIL")
RESEND_FROM = os.getenv("RESEND_FROM")


if not SUPABASE_URL:
    raise RuntimeError("Missing SUPABASE_URL")

if not SUPABASE_KEY:
    raise RuntimeError("Missing SUPABASE_KEY")

if not RESEND_API_KEY:
    raise RuntimeError("Missing RESEND_API_KEY")

if not NOTIFY_EMAIL:
    raise RuntimeError("Missing NOTIFY_EMAIL")

if not RESEND_FROM:
    raise RuntimeError("Missing RESEND_FROM")


# =========================================================
# CLIENTS
# =========================================================

supabase = create_client(
    SUPABASE_URL,
    SUPABASE_KEY,
)

resend.api_key = RESEND_API_KEY


# =========================================================
# HELPERS
# =========================================================

def parse_release(value):
    """
    Convert Supabase release value to timezone-aware datetime.
    """

    if not value:
        return None

    if isinstance(value, datetime):
        dt = value

    else:
        value = str(value)

        if value.endswith("Z"):
            value = value[:-1] + "+00:00"

        try:
            dt = datetime.fromisoformat(value)

        except ValueError:
            return None

    if dt.tzinfo is None:
        dt = dt.replace(
            tzinfo=TIMEZONE
        )

    return dt.astimezone(TIMEZONE)


def format_release(dt):
    return f"{dt.strftime('%B')} {dt.day}, {dt.year}"

def days_until_release(release_dt, now):
    """
    Compare calendar dates in Vietnam time.

    Example:

    Today:       Aug 21
    Release:     Aug 28

    -> 7 days
    """

    return (
        release_dt.date()
        - now.date()
    ).days


# =========================================================
# LOAD GAMES
# =========================================================

print("Loading upcoming games...")

response = (
    supabase
    .table("games")
    .select(
        "id, name, image, release"
    )
    .gte(
        "release",
        datetime.now(
            timezone.utc
        ).isoformat(),
    )
    .order("release")
    .execute()
)

games = response.data or []

print(
    f"Found {len(games)} upcoming games."
)


# =========================================================
# FIND GAMES TO NOTIFY
# =========================================================

now = datetime.now(
    TIMEZONE
)

notifications = []

for game in games:

    release_dt = parse_release(
        game.get("release")
    )

    if not release_dt:
        print(
            f"Skipping {game.get('name')}: "
            f"invalid release date"
        )

        continue

    days = days_until_release(
        release_dt,
        now,
    )

    if TEST_MODE:
        if game.get("name") != TEST_GAME_NAME:
            continue

        # Pretend this game is 7 days away
        days = 7

    elif days not in NOTIFICATION_DAYS:
        continue

    notifications.append(
        {
            "game": game,
            "days": days,
            "release": release_dt,
        }
    )


# =========================================================
# NOTHING TO SEND
# =========================================================

if not notifications:

    print(
        "No release notifications today."
    )

    raise SystemExit(0)


print(
    f"Found {len(notifications)} "
    f"game(s) requiring notification."
)


# =========================================================
# CHECK SENT NOTIFICATIONS
# =========================================================

pending = []

for item in notifications:

    game = item["game"]
    days = item["days"]

    existing = (
        supabase
        .table("release_notifications")
        .select("id")
        .eq(
            "game_id",
            game["id"],
        )
        .eq(
            "days_before",
            days,
        )
        .limit(1)
        .execute()
    )

    if existing.data:
        print(
            f"Already sent: "
            f"{game['name']} "
            f"({days} days)"
        )

        continue

    pending.append(item)


if not pending:

    print(
        "All notifications have already "
        "been sent."
    )

    raise SystemExit(0)


# =========================================================
# BUILD EMAIL
# =========================================================

if len(pending) == 1:

    item = pending[0]

    if item["days"] == 0:
        subject = (
            f"🎮 {item['game']['name']} "
            f"releases today!"
        )

    elif item["days"] == 1:
        subject = (
            f"🎮 {item['game']['name']} "
            f"releases tomorrow"
        )

    else:
        subject = (
            f"🎮 {item['game']['name']} "
            f"releases in {item['days']} days"
        )

else:

    subject = (
        f"🎮 {len(pending)} games "
        f"coming soon"
    )


cards = []

for item in pending:

    game = item["game"]
    days = item["days"]
    release_dt = item["release"]

    if days == 0:
        countdown = "TODAY"

    elif days == 1:
        countdown = "TOMORROW"

    else:
        countdown = f"{days} DAYS"

    image_html = ""

    if game.get("image"):
        image_html = f"""
        <img
            src="{escape(str(game['image']))}"
            alt="{escape(str(game['name']))}"
            style="
                width:120px;
                height:120px;
                object-fit:cover;
                border-radius:12px;
                display:block;
            "
        >
        """

    cards.append(
        f"""
        <div style="
            margin-bottom:16px;
            padding:16px;
            border:1px solid #e5e7eb;
            border-radius:14px;
            background:#ffffff;
        ">

            <div style="
                display:flex;
                gap:16px;
                align-items:center;
            ">

                {image_html}

                <div>

                    <div style="
                        font-size:11px;
                        font-weight:700;
                        color:#777;
                        letter-spacing:1px;
                        margin-bottom:5px;
                    ">
                        {countdown}
                    </div>

                    <div style="
                        font-size:20px;
                        font-weight:700;
                        color:#111;
                        margin-bottom:6px;
                    ">
                        {escape(str(game["name"]))}
                    </div>

                    <div style="
                        font-size:14px;
                        color:#666;
                    ">
                        Release:
                        {format_release(release_dt)}
                    </div>

                </div>

            </div>

        </div>
        """
    )


html = f"""
<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <title>Game Countdown</title>
</head>

<body style="
    margin:0;
    padding:30px 15px;
    background:#f5f5f5;
    font-family:Arial,Helvetica,sans-serif;
">

<div style="
    max-width:600px;
    margin:0 auto;
">

    <div style="
        padding:25px;
        border-radius:16px;
        background:#111;
        color:white;
        margin-bottom:20px;
    ">

        <div style="
            font-size:12px;
            letter-spacing:2px;
            opacity:.65;
            margin-bottom:8px;
        ">
            GAME COUNTDOWN
        </div>

        <div style="
            font-size:28px;
            font-weight:700;
        ">
            Upcoming releases
        </div>

    </div>

    {''.join(cards)}

    <div style="
        margin-top:25px;
        text-align:center;
        font-size:12px;
        color:#999;
    ">
        GameCountdown
    </div>

</div>

</body>
</html>
"""


# =========================================================
# SEND EMAIL
# =========================================================

print(
    f"Sending email to {NOTIFY_EMAIL}..."
)

params = {
    "from": RESEND_FROM,
    "to": [NOTIFY_EMAIL],
    "subject": subject,
    "html": html,
}

email = resend.Emails.send(
    params
)

print(
    f"✓ Email sent: {email}"
)


# =========================================================
# RECORD SENT NOTIFICATIONS
# =========================================================

for item in pending:

    game = item["game"]
    days = item["days"]

    try:

        (
            supabase
            .table(
                "release_notifications"
            )
            .insert(
                {
                    "game_id": game["id"],
                    "days_before": days,
                    "sent_at": datetime.now(
                        timezone.utc
                    ).isoformat(),
                }
            )
            .execute()
        )

        print(
            f"✓ Recorded: "
            f"{game['name']} "
            f"({days} days)"
        )

    except Exception as error:

        print(
            f"WARNING: Could not record "
            f"notification for "
            f"{game['name']}:"
        )

        print(error)


print(
    "\nRelease notification complete."
)