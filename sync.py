import os
import re
import unicodedata
from datetime import datetime, timezone

from dotenv import load_dotenv
from rapidfuzz import fuzz
from supabase import create_client
from psnawp_api import PSNAWP
from psnawp_api.models.trophies import PlatformType


# =========================================================
# CONFIG
# =========================================================

FUZZY_THRESHOLD = 85

# True:
#   Fetch detailed earned achievements when necessary.
#
# False:
#   Only sync trophy summary / play stats.
SYNC_ACHIEVEMENT_DETAILS = True

# True:
#   Force refresh detailed trophy data for all games.
#
# Use this once after adding new achievement fields
# such as rarity / earn_rate.
#
# False:
#   Only fetch detailed achievements when the
#   earned trophy count changes.
FORCE_SYNC_ACHIEVEMENT_DETAILS = False

# =========================================================
# ENV
# =========================================================

load_dotenv()

NPSSO_CODE = os.getenv("NPSSO_CODE")
SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_KEY = os.getenv("SUPABASE_KEY")


if not NPSSO_CODE:
    raise RuntimeError("Missing NPSSO_CODE")

if not SUPABASE_URL:
    raise RuntimeError("Missing SUPABASE_URL")

if not SUPABASE_KEY:
    raise RuntimeError("Missing SUPABASE_KEY")


# =========================================================
# CLIENTS
# =========================================================

print("Connecting to Supabase...")

try:

    supabase = create_client(
        SUPABASE_URL,
        SUPABASE_KEY,
    )

    print("✓ Supabase connected")

except Exception as error:

    print("ERROR connecting to Supabase:")
    print(error)
    raise


print("Connecting to PSN...")

try:

    psnawp = PSNAWP(NPSSO_CODE)
    psn = psnawp.me()

    trophy_summary = psn.trophy_summary()

    psn_trophy_level = getattr(
        trophy_summary,
        "trophy_level",
        None,
    )

    psn_trophy_progress = getattr(
        trophy_summary,
        "progress",
        None,
    )

    psn_trophy_tier = getattr(
        trophy_summary,
        "tier",
        None,
    )

    print(
        f"🏆 PSN Trophy Level: "
        f"{psn_trophy_level}"
        f" "
        f"({psn_trophy_progress}% to next level)"
    )

    print(
        f"PSN account: {psn.online_id}"
    )

    profile_data = {
        "id": 1,
        "online_id": psn.online_id,
        "trophy_level": psn_trophy_level,
        "trophy_progress": psn_trophy_progress,
        "trophy_tier": psn_trophy_tier,
        "synced_at": datetime.now(
            timezone.utc
        ).isoformat(),
    }

    supabase.table(
        "psn_profile"
    ).upsert(
        profile_data
    ).execute()

    print("✓ PSN profile synced")

except Exception as error:

    print("ERROR connecting to PSN:")
    print(error)
    raise

# =========================================================
# HELPERS
# =========================================================

def normalize_name(name):
    """
    Normalize game names so small differences don't matter.

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
    name = unicodedata.normalize(
        "NFKD",
        name,
    )

    # Remove accents
    name = "".join(
        char
        for char in name
        if not unicodedata.combining(char)
    )

    # Lowercase
    name = name.lower()

    # Remove trademark / copyright symbols
    name = re.sub(
        r"[™®©]",
        "",
        name,
    )

    # Replace punctuation with spaces
    name = re.sub(
        r"[^a-z0-9]+",
        " ",
        name,
    )

    # Remove extra spaces
    name = re.sub(
        r"\s+",
        " ",
        name,
    )

    return name.strip()


def get_title_id(game):
    """
    Try to get the PSN communication/title ID.

    np_communication_id is the important ID
    for trophy API calls.
    """

    for attr in [
        "np_communication_id",
        "title_id",
        "titleId",
        "np_title_id",
    ]:
        value = getattr(
            game,
            attr,
            None,
        )

        if value:
            return str(value)

    return None


def get_platform(game):
    """
    Resolve PSNAWP PlatformType from a PSN object.

    If PSNAWP does not expose the platform,
    default to PS5 because this project only
    tracks PS5 games.
    """

    for attr in [
        "platform",
        "title_platform",
        "platform_type",
    ]:
        value = getattr(
            game,
            attr,
            None,
        )

        if not value:
            continue

        if isinstance(
            value,
            PlatformType,
        ):
            return value

        normalized = str(value).upper()

        mapping = {
            "PS4": PlatformType.PS4,
            "PS5": PlatformType.PS5,
            "PS3": PlatformType.PS3,
            "PS_VITA": PlatformType.PS_VITA,
            "PSVITA": PlatformType.PS_VITA,
            "PSPC": PlatformType.PSPC,
            "PSP": PlatformType.PSPC,
        }

        if normalized in mapping:
            return mapping[normalized]

    # This project only tracks PS5 games.
    return PlatformType.PS5


def trophy_value(
    trophy_set,
    name,
):
    """
    Safely read platinum/gold/silver/bronze
    from PSNAWP TrophySet objects.
    """

    if trophy_set is None:
        return 0

    value = getattr(
        trophy_set,
        name,
        None,
    )

    if value is None:
        return 0

    try:
        return int(value)

    except (
        TypeError,
        ValueError,
    ):
        return 0


def calculate_progress(
    earned,
    total,
):
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


def iso_datetime(value):
    """
    Convert datetime-like values into ISO strings.
    """

    if not value:
        return None

    if isinstance(
        value,
        datetime,
    ):
        return value.isoformat()

    return str(value)


def format_play_time(duration):
    """
    Convert timedelta into:

        42h 18m

    Returns None when unavailable.
    """

    if not duration:
        return None

    try:
        total_seconds = int(
            duration.total_seconds()
        )

    except (
        AttributeError,
        TypeError,
        ValueError,
    ):
        return None

    hours = total_seconds // 3600

    minutes = (
        total_seconds % 3600
    ) // 60

    return f"{hours}h {minutes}m"


def get_stat_name(stat):
    """
    TitleStats name compatibility helper.
    """

    for attr in [
        "name",
        "title_name",
        "titleName",
    ]:
        value = getattr(
            stat,
            attr,
            None,
        )

        if value:
            return str(value)

    return None

def get_trophy_rarity(trophy):
    value = getattr(
        trophy,
        "trophy_rarity",
        None,
    )

    if value is None:
        return None

    # Enum → string name
    name = getattr(
        value,
        "name",
        None,
    )

    if name:
        return str(name).lower()

    return str(value).lower()

def get_trophy_type(trophy):
    value = getattr(
        trophy,
        "trophy_type",
        None,
    )

    if value is None:
        return None

    value = str(value).lower()

    if "platinum" in value:
        return "platinum"

    if "gold" in value:
        return "gold"

    if "silver" in value:
        return "silver"

    if "bronze" in value:
        return "bronze"

    return None


def get_earned_achievements(
    psn_game,
    platform,
):
    """
    Fetch detailed trophy progress.

    Default platform is PS5.
    If PS5 fails with Resource not found,
    retry using PS4.
    """

    if not SYNC_ACHIEVEMENT_DETAILS:
        return None

    psn_title_id = get_title_id(
        psn_game
    )

    if not psn_title_id:
        print(
            "  Achievement details skipped: "
            "no PSN communication ID."
        )

        return None

    if platform is None:
        platform = PlatformType.PS5

    # -----------------------------------------------------
    # TRY SELECTED PLATFORM
    # -----------------------------------------------------

    platforms_to_try = [
        platform
    ]

    # If PS5 fails, try PS4
    if platform == PlatformType.PS5:
        platforms_to_try.append(
            PlatformType.PS4
        )

    trophies = None
    successful_platform = None

    for current_platform in platforms_to_try:

        print(
            f"  Trying trophy platform: "
            f"{current_platform}"
        )

        try:

            trophies = list(
                psn.trophies(
                    psn_title_id,
                    current_platform,
                    include_progress=True,
                    trophy_group_id="default",
                    limit=None,
                    page_size=200,
                )
            )

            successful_platform = (
                current_platform
            )

            break

        except Exception as error:

            print(
                f"  Trophy request failed "
                f"for {current_platform}:"
            )

            print(
                f"    {error}"
            )

            # Try PS4 if PS5 failed
            if (
                current_platform
                == PlatformType.PS5
            ):

                print(
                    "  → Retrying with PS4..."
                )

            else:

                print(
                    "  → Trophy details unavailable."
                )

    # -----------------------------------------------------
    # BOTH PLATFORMS FAILED
    # -----------------------------------------------------

    if trophies is None:

        return None

    print(
        f"  ✓ Trophy platform used: "
        f"{successful_platform}"
    )

    # -----------------------------------------------------
    # EXTRACT EARNED TROPHIES
    # -----------------------------------------------------

    earned_achievements = []

    for trophy in trophies:

        earned = getattr(
            trophy,
            "earned",
            False,
        )

        if not earned:
            continue

        earned_at = getattr(
            trophy,
            "earned_date_time",
            None,
        )

        earned_achievements.append(
            {
                "name": (
                    getattr(
                        trophy,
                        "trophy_name",
                        None,
                    )
                    or ""
                ),
                "detail": (
                    getattr(
                        trophy,
                        "trophy_detail",
                        None,
                    )
                    or ""
                ),
                "earned_at": iso_datetime(
                    earned_at
                ),
                "type": get_trophy_type(trophy),
                "rarity": get_trophy_rarity(trophy),
                "earn_rate": getattr(
                    trophy,
                    "trophy_earn_rate",
                    None,
                ),
            }
        )

    # Newest earned achievement first
    earned_achievements.sort(
        key=lambda item: (
            item.get("earned_at")
            or ""
        ),
        reverse=True,
    )

    return earned_achievements

def find_play_stat(psn_game, psn_stats):
    """
    Find play statistics for a PSN trophy title.

    Matching:
    1. Exact normalized name
    2. Fuzzy name >= FUZZY_THRESHOLD
    """

    psn_name = getattr(
        psn_game,
        "title_name",
        None,
    )

    if not psn_name:
        return None

    normalized_psn_name = normalize_name(
        psn_name
    )

    # -----------------------------------------------------
    # EXACT
    # -----------------------------------------------------

    for stat in psn_stats:

        stat_name = get_stat_name(
            stat
        )

        if not stat_name:
            continue

        normalized_stat_name = normalize_name(
            stat_name
        )

        if (
            normalized_stat_name
            == normalized_psn_name
        ):
            return stat

    # -----------------------------------------------------
    # FUZZY
    # -----------------------------------------------------

    best_stat = None
    best_score = 0

    for stat in psn_stats:

        stat_name = get_stat_name(
            stat
        )

        if not stat_name:
            continue

        normalized_stat_name = normalize_name(
            stat_name
        )

        if not normalized_stat_name:
            continue

        score = fuzz.token_set_ratio(
            normalized_psn_name,
            normalized_stat_name,
        )

        if score > best_score:
            best_score = score
            best_stat = stat

    if (
        best_stat is not None
        and best_score >= FUZZY_THRESHOLD
    ):
        return best_stat

    return None


# =========================================================
# LOAD DATABASE GAMES
# =========================================================

print("\nLoading games from Supabase...")

try:

    response = (
        supabase
        .table("games")
        .select(
            """
            id,
            name,
            psn_title_id,
            earned_achievements
            """
        )
        .execute()
    )

except Exception as error:

    print(
        "ERROR loading games from Supabase:"
    )

    print(error)

    raise


db_games = response.data or []

print(
    f"Found {len(db_games)} games in Supabase."
)


# =========================================================
# BUILD LOOKUP TABLE
# =========================================================

db_by_name = {}

for game in db_games:

    name = game.get(
        "name"
    )

    if not name:
        continue

    normalized = normalize_name(
        name
    )

    if normalized:
        db_by_name[
            normalized
        ] = game


# =========================================================
# MATCHING
# =========================================================

def find_matching_game(
    psn_game,
):
    """
    Match PSN game to Supabase game.

    Priority:

    1. Existing psn_title_id
    2. Exact normalized name
    3. Fuzzy name match >= FUZZY_THRESHOLD
    """

    psn_title_id = get_title_id(
        psn_game
    )

    psn_name = getattr(
        psn_game,
        "title_name",
        None,
    )

    if not psn_name:
        return (
            None,
            0,
            "none",
        )

    normalized_psn_name = normalize_name(
        psn_name
    )

    # -----------------------------------------------------
    # 1. SAVED PSN TITLE ID
    # -----------------------------------------------------

    if psn_title_id:

        for game in db_games:

            saved_id = game.get(
                "psn_title_id"
            )

            if (
                saved_id
                and str(saved_id)
                == str(psn_title_id)
            ):
                return (
                    game,
                    100,
                    "psn_title_id",
                )

    # -----------------------------------------------------
    # 2. EXACT NAME
    # -----------------------------------------------------

    exact = db_by_name.get(
        normalized_psn_name
    )

    if exact:

        return (
            exact,
            100,
            "exact",
        )

    # -----------------------------------------------------
    # 3. FUZZY MATCH
    # -----------------------------------------------------

    best_game = None
    best_score = 0

    for game in db_games:

        db_name = game.get(
            "name"
        )

        if not db_name:
            continue

        normalized_db_name = normalize_name(
            db_name
        )

        if not normalized_db_name:
            continue

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

    return (
        None,
        best_score,
        "none",
    )


# =========================================================
# GET PSN TROPHY TITLES
# =========================================================

print(
    "\nFetching PSN trophy titles..."
)

try:

    psn_games = list(
        psn.trophy_titles(
            limit=None,
            page_size=50,
        )
    )

except Exception as error:

    print(
        "\nERROR while getting PSN trophy titles:"
    )

    print(error)

    raise


print(
    f"Found {len(psn_games)} PSN trophy titles."
)


# =========================================================
# GET PLAY STATS
# =========================================================

print(
    "\nFetching PSN play statistics..."
)

try:

    psn_stats = list(
        psn.title_stats(
            limit=None,
            page_size=200,
        )
    )

except Exception as error:

    print(
        "\nWARNING: Could not get PSN play statistics:"
    )

    print(error)

    psn_stats = []


# stats_by_name = {}

# for stat in psn_stats:

#     stat_name = get_stat_name(
#         stat
#     )

#     if not stat_name:
#         continue

#     normalized = normalize_name(
#         stat_name
#     )

#     if normalized:

#         stats_by_name[
#             normalized
#         ] = stat


print(
    f"Found {len(psn_stats)} PSN play-stat titles."
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

achievement_success = 0
achievement_skipped = 0
achievement_unchanged = 0

new_achievement_games = 0


# =========================================================
# PROCESS EACH PSN GAME
# =========================================================

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

    # =====================================================
    # MATCH GAME
    # =====================================================

    (
        db_game,
        score,
        method,
    ) = find_matching_game(
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
        f"  Match: "
        f"{method} "
        f"({score:.1f}%)"
    )

    # =====================================================
    # TROPHY SUMMARY
    # =====================================================

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

    # =====================================================
    # PLAY STATS
    # =====================================================

    play_stat = find_play_stat(
        psn_game,
        psn_stats,
    )

    play_time = None
    play_sessions = None
    first_played_at = None
    last_played_at = None

    if play_stat:

        duration = getattr(
            play_stat,
            "play_duration",
            None,
        )

        play_time = format_play_time(
            duration
        )
        
        play_sessions = getattr(
            play_stat,
            "play_count",
            None,
        )

        first_played = getattr(
            play_stat,
            "first_played_date_time",
            None,
        )

        last_played = getattr(
            play_stat,
            "last_played_date_time",
            None,
        )

        first_played_at = (
            iso_datetime(
                first_played
            )
            if first_played
            else None
        )

        last_played_at = (
            iso_datetime(
                last_played
            )
            if last_played
            else None
        )

        print(
            f"  ⏱ Play time: "
            f"{play_time or 'N/A'}"
        )
        
        print(
            f"  🎮 Play sessions: "
            f"{play_sessions if play_sessions is not None else 'N/A'}"
        )

        print(
            f"  ▶ First play: "
            f"{first_played_at or 'N/A'}"
        )

        print(
            f"  ▶ Last play: "
            f"{last_played_at or 'N/A'}"
        )

    else:

        print(
            "  Play stats: unavailable"
        )

    # =====================================================
    # PLATFORM
    # =====================================================

    platform = get_platform(
        psn_game
    )

    if platform:

        print(
            f"  Platform: {platform}"
        )

    else:

        print(
            "  Platform: unavailable"
        )

    # =====================================================
    # TROPHY DISPLAY
    # =====================================================

    print(
        f"  🏆 Platinum: "
        f"{earned['platinum']}/"
        f"{total['platinum']}"
    )

    print(
        f"  🥇 Gold: "
        f"{earned['gold']}/"
        f"{total['gold']}"
    )

    print(
        f"  🥈 Silver: "
        f"{earned['silver']}/"
        f"{total['silver']}"
    )

    print(
        f"  🥉 Bronze: "
        f"{earned['bronze']}/"
        f"{total['bronze']}"
    )

    print(
        f"  📊 Progress: "
        f"{progress}%"
    )

    if psn_title_id:

        print(
            f"  PSN Title ID: "
            f"{psn_title_id}"
        )

    # =====================================================
    # CHECK ACHIEVEMENT CHANGES
    # =====================================================

    old_earned_achievements = (
        db_game.get(
            "earned_achievements"
        )
    )

    new_count = (
        earned["platinum"]
        + earned["gold"]
        + earned["silver"]
        + earned["bronze"]
    )

    earned_achievements = None
    last_achievement = None

    should_fetch_achievement_details = False

    # -----------------------------------------------------
    # EXISTING ACHIEVEMENT DATA
    # -----------------------------------------------------

    if isinstance(
        old_earned_achievements,
        list,
    ):

        old_count = len(
            old_earned_achievements
        )

        if new_count > old_count:

            print(
                f"  🏆 New achievements: "
                f"{old_count} → {new_count}"
            )

            should_fetch_achievement_details = True

            new_achievement_games += 1

        elif new_count < old_count:

            # This should normally not happen,
            # but if PSN reports fewer trophies,
            # refresh the detailed data.

            print(
                f"  ⚠ Achievement count decreased: "
                f"{old_count} → {new_count}"
            )

            should_fetch_achievement_details = True

        else:

            print(
                f"  ✓ No new achievements "
                f"({old_count} → {new_count})"
            )

            achievement_unchanged += 1

    # -----------------------------------------------------
    # NO EXISTING ACHIEVEMENT DATA
    # -----------------------------------------------------

    else:

        print(
            f"  🏆 Achievement data not initialized "
            f"({new_count} earned)"
        )

        should_fetch_achievement_details = True

        # -----------------------------------------------------
    # FORCE FULL ACHIEVEMENT REFRESH
    # -----------------------------------------------------

    if FORCE_SYNC_ACHIEVEMENT_DETAILS:

        print(
            "  🔄 Force syncing achievement details"
        )

        should_fetch_achievement_details = True

    # =====================================================
    # ACHIEVEMENT DETAILS
    # =====================================================

    has_trophy_data = (
        (
            total["platinum"]
            + total["gold"]
            + total["silver"]
            + total["bronze"]
        )
        > 0
    )

    if (
        SYNC_ACHIEVEMENT_DETAILS
        and has_trophy_data
        and psn_title_id
        and platform
        and should_fetch_achievement_details
    ):

        print(
            "  Fetching achievement details..."
        )

        earned_achievements = (
            get_earned_achievements(
                psn_game,
                platform,
            )
        )

        if earned_achievements is not None:

            achievement_success += 1

            print(
                f"  ✓ Earned achievements: "
                f"{len(earned_achievements)}"
            )

            if earned_achievements:

                last_achievement = (
                    earned_achievements[0]
                )

                print(
                    "  🏆 Last achievement: "
                    f"{last_achievement['name']}"
                )

        else:

            achievement_skipped += 1

    elif should_fetch_achievement_details:

        achievement_skipped += 1

    # =====================================================
    # BUILD UPDATE DATA
    # =====================================================

    # Play data is always allowed to update.
    update_data = {}

    # Update trophy sync time every time
    # trophy data is checked successfully.
    if has_trophy_data:
        update_data["trophy_synced_at"] = sync_time

    # =====================================================
    # PLAY DATA
    # =====================================================

    if play_time is not None:

        update_data["play_time"] = play_time
        
    if play_sessions is not None:
        update_data["play_sessions"] = play_sessions

    if first_played_at is not None:

        update_data["first_played_at"] = first_played_at

    if last_played_at is not None:

        update_data["last_played_at"] = last_played_at


    # =====================================================
    # TROPHY SUMMARY
    # =====================================================
    #
    # Only update trophy summary when:
    #
    # 1. There is no previous achievement data
    # OR
    # 2. The earned trophy count changed
    #
    # This avoids unnecessary Supabase writes.
    #

    should_update_trophy_summary = (
        not isinstance(
            old_earned_achievements,
            list,
        )
        or new_count
        != len(old_earned_achievements)
    )


    if should_update_trophy_summary:

        update_data.update({

            "earned_platinum":
                earned["platinum"],

            "total_platinum":
                total["platinum"],

            "earned_gold":
                earned["gold"],

            "total_gold":
                total["gold"],

            "earned_silver":
                earned["silver"],

            "total_silver":
                total["silver"],

            "earned_bronze":
                earned["bronze"],

            "total_bronze":
                total["bronze"],

            "trophy_progress":
                progress,
        })


    # =====================================================
    # ACHIEVEMENT DETAILS
    # =====================================================

    if earned_achievements is not None:

        update_data[
            "earned_achievements"
        ] = earned_achievements

        if last_achievement:

            update_data[
                "last_achievement_name"
            ] = last_achievement["name"]

            update_data[
                "last_achievement_detail"
            ] = last_achievement["detail"]

            update_data[
                "last_achievement_at"
            ] = last_achievement["earned_at"]

        else:

            update_data[
                "last_achievement_name"
            ] = None

            update_data[
                "last_achievement_detail"
            ] = None

            update_data[
                "last_achievement_at"
            ] = None

        # IMPORTANT:
        # Only mark trophy data as synced after
        # successfully fetching detailed trophies.
        # update_data[
        #     "trophy_synced_at"
        # ] = sync_time


    # =====================================================
    # SAVE PSN TITLE ID
    # =====================================================

    if psn_title_id:

        update_data[
            "psn_title_id"
        ] = psn_title_id

    # =====================================================
    # PLAY DATA
    # =====================================================

    if play_time is not None:

        update_data[
            "play_time"
        ] = play_time
        
    if play_sessions is not None:

        update_data[
            "play_sessions"
        ] = play_sessions

    if first_played_at is not None:

        update_data[
            "first_played_at"
        ] = first_played_at

    if last_played_at is not None:

        update_data[
            "last_played_at"
        ] = last_played_at

    # =====================================================
    # ACHIEVEMENT DATA
    # =====================================================
    #
    # Important:
    #
    # If achievement detail fetch succeeded:
    #     overwrite with fresh data.
    #
    # If detail fetch was not needed:
    #     keep existing data.
    #
    # If detail fetch failed:
    #     keep existing data.
    #

    if earned_achievements is not None:

        update_data[
            "earned_achievements"
        ] = earned_achievements

        if last_achievement:

            update_data[
                "last_achievement_name"
            ] = last_achievement[
                "name"
            ]

            update_data[
                "last_achievement_detail"
            ] = last_achievement[
                "detail"
            ]

            update_data[
                "last_achievement_at"
            ] = last_achievement[
                "earned_at"
            ]

        else:

            update_data[
                "last_achievement_name"
            ] = None

            update_data[
                "last_achievement_detail"
            ] = None

            update_data[
                "last_achievement_at"
            ] = None

    # =====================================================
    # SAVE PSN TITLE ID
    # =====================================================

    if psn_title_id:

        update_data[
            "psn_title_id"
        ] = psn_title_id

    # =====================================================
    # UPDATE SUPABASE
    # =====================================================

    if not update_data:

        print(
            "  ✓ Nothing to update"
        )

        continue


    print(
        f"  Updating Supabase "
        f"({len(update_data)} fields)..."
    )

    try:

        (
            supabase
            .table("games")
            .update(update_data)
            .eq(
                "id",
                db_game["id"],
            )
            .execute()
        )

        print(
            "  ✓ Supabase updated"
        )

        updated += 1

    except Exception as error:

        print(
            "  ✗ Supabase update failed:"
        )

        print(
            f"    {error}"
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
    f"PSN games:              "
    f"{len(psn_games)}"
)

print(
    f"Updated:                "
    f"{updated}"
)

print(
    f"Skipped:                "
    f"{skipped}"
)

print(
    f"Errors:                 "
    f"{errors}"
)

print(
    f"Achievement details:    "
    f"{achievement_success}"
)

print(
    f"Achievement skipped:    "
    f"{achievement_skipped}"
)

print(
    f"Achievement unchanged:  "
    f"{achievement_unchanged}"
)

print(
    f"Games with new trophies: "
    f"{new_achievement_games}"
)

print(
    f"Sync time:              "
    f"{sync_time}"
)

print("=" * 60)