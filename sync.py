import os
import re
import unicodedata
from datetime import datetime, timezone

from dotenv import load_dotenv
from rapidfuzz import fuzz
from supabase import create_client
from psnawp_api import PSNAWP


# =========================================================
# CONFIG
# =========================================================

FUZZY_THRESHOLD = 85

load_dotenv()

NPSSO_CODE = os.getenv("NPSSO_CODE")
SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_KEY = os.getenv("SUPABASE_KEY")


if not NPSSO_CODE:
    raise RuntimeError("Missing NPSSO_CODE in .env")

if not SUPABASE_URL:
    raise RuntimeError("Missing SUPABASE_URL in .env")

if not SUPABASE_KEY:
    raise RuntimeError("Missing SUPABASE_KEY in .env")


# =========================================================
# CLIENTS
# =========================================================

print("Connecting to PSN...")

psnawp = PSNAWP(NPSSO_CODE)
psn = psnawp.me()

print(f"PSN account: {psn.online_id}")

print("Connecting to Supabase...")

supabase = create_client(
    SUPABASE_URL,
    SUPABASE_KEY,
)


# =========================================================
# HELPERS
# =========================================================

def normalize_name(name):
    """
    Normalize game names so that small differences don't matter.

    Examples:

    Ghost of Yōtei
    Ghost of Yotei
    GHOST OF YOTEI™

    -> ghost of yotei
    """

    if not name:
        return ""

    name = str(name)

    # Unicode normalization
    name = unicodedata.normalize("NFKD", name)

    # Remove accents
    name = "".join(
        char
        for char in name
        if not unicodedata.combining(char)
    )

    name = name.lower()

    # Remove trademark / copyright symbols
    name = re.sub(r"[™®©]", "", name)

    # Replace punctuation with spaces
    name = re.sub(r"[^a-z0-9]+", " ", name)

    # Remove extra spaces
    name = re.sub(r"\s+", " ", name)

    return name.strip()


def get_title_id(game):
    """
    PSNAWP trophy title objects can expose the title ID.
    Try several common attribute names to remain compatible.
    """

    for attr in [
        "title_id",
        "titleId",
        "np_communication_id",
    ]:
        value = getattr(game, attr, None)

        if value:
            return str(value)

    return None


def trophy_value(trophy_set, name):
    """
    Safely read platinum/gold/silver/bronze
    from PSNAWP TrophySet objects.
    """

    if trophy_set is None:
        return 0

    value = getattr(trophy_set, name, None)

    if value is None:
        return 0

    return int(value)


def calculate_progress(earned, total):
    """
    Calculate total trophy completion percentage.
    """

    earned_total = (
        earned["platinum"]
        + earned["gold"]
        + earned["silver"]
        + earned["bronze"]
    )

    total_total = (
        total["platinum"]
        + total["gold"]
        + total["silver"]
        + total["bronze"]
    )

    if total_total == 0:
        return 0

    return round(
        (earned_total / total_total) * 100
    )


# =========================================================
# LOAD DATABASE GAMES
# =========================================================

print("\nLoading games from Supabase...")

response = (
    supabase
    .table("games")
    .select(
        """
        id,
        name,
        psn_title_id
        """
    )
    .execute()
)

db_games = response.data or []

print(f"Found {len(db_games)} games in Supabase.")


# =========================================================
# BUILD LOOKUP TABLES
# =========================================================

db_by_id = {}

db_by_name = {}

for game in db_games:

    game_id = game.get("id")

    if game_id is not None:
        db_by_id[str(game_id)] = game

    name = game.get("name")

    if name:
        normalized = normalize_name(name)

        if normalized:
            db_by_name[normalized] = game


# =========================================================
# MATCHING
# =========================================================

def find_matching_game(psn_game):
    """
    Match PSN game to Supabase game.

    Priority:

    1. Existing psn_title_id
    2. Exact normalized name
    3. Fuzzy name match
    """

    psn_title_id = get_title_id(psn_game)

    psn_name = getattr(
        psn_game,
        "title_name",
        None,
    )

    if not psn_name:
        return None, 0, "none"

    normalized_psn_name = normalize_name(
        psn_name
    )

    # -----------------------------------------------------
    # 1. MATCH BY SAVED PSN TITLE ID
    # -----------------------------------------------------

    if psn_title_id:

        for game in db_games:

            saved_id = game.get("psn_title_id")

            if saved_id and str(saved_id) == str(psn_title_id):
                return game, 100, "psn_title_id"

    # -----------------------------------------------------
    # 2. EXACT NAME MATCH
    # -----------------------------------------------------

    exact = db_by_name.get(
        normalized_psn_name
    )

    if exact:
        return exact, 100, "exact"

    # -----------------------------------------------------
    # 3. FUZZY MATCH
    # -----------------------------------------------------

    best_game = None
    best_score = 0

    for game in db_games:

        db_name = game.get("name")

        if not db_name:
            continue

        normalized_db_name = normalize_name(
            db_name
        )

        if not normalized_db_name:
            continue

        # token_set_ratio handles subtitles / word order
        score = fuzz.token_set_ratio(
            normalized_psn_name,
            normalized_db_name,
        )

        if score > best_score:
            best_score = score
            best_game = game

    if (
        best_game is not None
        and best_score >= FUZZY_THRESHOLD
    ):
        return (
            best_game,
            best_score,
            "fuzzy",
        )

    return None, best_score, "none"


# =========================================================
# GET PSN GAMES
# =========================================================

print("\nFetching PSN trophy titles...")

try:
    psn_games = list(
        psn.trophy_titles(
            limit=None,
            page_size=50,
        )
    )

except Exception as error:

    print("\nERROR while getting PSN games:")
    print(error)

    raise


print(
    f"Found {len(psn_games)} PSN trophy titles."
)


# =========================================================
# SYNC
# =========================================================

sync_time = datetime.now(
    timezone.utc
).isoformat()

updated = 0
skipped = 0
errors = 0


for index, psn_game in enumerate(
    psn_games,
    start=1,
):

    psn_name = getattr(
        psn_game,
        "title_name",
        None,
    )

    if not psn_name:
        continue

    print(
        f"\n[{index}/{len(psn_games)}] "
        f"{psn_name}"
    )

    # -----------------------------------------------------
    # FIND MATCH
    # -----------------------------------------------------

    db_game, score, method = find_matching_game(
        psn_game
    )

    if not db_game:

        print(
            f"  SKIP - no safe match "
            f"(best score: {score:.1f})"
        )

        skipped += 1
        continue

    print(
        f"  → {db_game['name']}"
    )

    print(
        f"  Match: {method} ({score:.1f}%)"
    )

    # -----------------------------------------------------
    # TROPHY DATA
    # -----------------------------------------------------

    earned_trophies = getattr(
        psn_game,
        "earned_trophies",
        None,
    )

    defined_trophies = getattr(
        psn_game,
        "defined_trophies",
        None,
    )

    earned = {
        "platinum": trophy_value(
            earned_trophies,
            "platinum",
        ),
        "gold": trophy_value(
            earned_trophies,
            "gold",
        ),
        "silver": trophy_value(
            earned_trophies,
            "silver",
        ),
        "bronze": trophy_value(
            earned_trophies,
            "bronze",
        ),
    }

    total = {
        "platinum": trophy_value(
            defined_trophies,
            "platinum",
        ),
        "gold": trophy_value(
            defined_trophies,
            "gold",
        ),
        "silver": trophy_value(
            defined_trophies,
            "silver",
        ),
        "bronze": trophy_value(
            defined_trophies,
            "bronze",
        ),
    }

    progress = calculate_progress(
        earned,
        total,
    )

    psn_title_id = get_title_id(
        psn_game
    )

    # -----------------------------------------------------
    # DISPLAY
    # -----------------------------------------------------

    print(
        f"  🏆 Platinum: "
        f"{earned['platinum']}/{total['platinum']}"
    )

    print(
        f"  🥇 Gold: "
        f"{earned['gold']}/{total['gold']}"
    )

    print(
        f"  🥈 Silver: "
        f"{earned['silver']}/{total['silver']}"
    )

    print(
        f"  🥉 Bronze: "
        f"{earned['bronze']}/{total['bronze']}"
    )

    print(
        f"  📊 Progress: {progress}%"
    )

    if psn_title_id:
        print(
            f"  PSN Title ID: {psn_title_id}"
        )

    # -----------------------------------------------------
    # UPDATE SUPABASE
    # -----------------------------------------------------

    update_data = {
        "earned_platinum": earned["platinum"],
        "total_platinum": total["platinum"],

        "earned_gold": earned["gold"],
        "total_gold": total["gold"],

        "earned_silver": earned["silver"],
        "total_silver": total["silver"],

        "earned_bronze": earned["bronze"],
        "total_bronze": total["bronze"],

        "trophy_progress": progress,

        "trophy_synced_at": sync_time,
    }

    # Only save PSN ID when available
    if psn_title_id:
        update_data["psn_title_id"] = psn_title_id

    try:

        (
            supabase
            .table("games")
            .update(update_data)
            .eq("id", db_game["id"])
            .execute()
        )

        print("  ✓ Supabase updated")

        updated += 1

    except Exception as error:

        print(
            f"  ✗ Supabase update failed: {error}"
        )

        errors += 1


# =========================================================
# SUMMARY
# =========================================================

print("\n")
print("=" * 60)
print("SYNC COMPLETE")
print("=" * 60)

print(
    f"PSN games:     {len(psn_games)}"
)

print(
    f"Updated:       {updated}"
)

print(
    f"Skipped:       {skipped}"
)

print(
    f"Errors:        {errors}"
)

print(
    f"Sync time:     {sync_time}"
)

print("=" * 60)