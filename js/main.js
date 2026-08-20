// =========================================================
// DOM REFERENCES
// =========================================================

const container = document.getElementById("games");

const openAddBtn = document.getElementById("openAdd");
const addModal = document.getElementById("addModal");
const editModal = document.getElementById("editModal");

const addName = document.getElementById("addName");
const addImage = document.getElementById("addImage");
const addPreview = document.getElementById("addPreview");
const addRelease = document.getElementById("addRelease");

const saveAddBtn = document.getElementById("saveAdd");
const cancelAddBtn = document.getElementById("cancelAdd");

const editName = document.getElementById("editName");
const editImage = document.getElementById("editImage");
const editPreview = document.getElementById("editPreview");
const editRelease = document.getElementById("editRelease");
const editStatus = document.getElementById("editStatus");
const statusGroup = document.getElementById("statusGroup");

const saveEditBtn = document.getElementById("saveEdit");
const cancelEditBtn = document.getElementById("cancelEdit");

const openGameSelectorBtn = document.getElementById("openGameSelector");

const gameSelectorModal = document.getElementById("gameSelectorModal");

const gameDetailsModal = document.getElementById("gameDetailsModal");

const statsPsnLevel = document.getElementById("statsPsnLevel");

const statsModal = document.getElementById("statsModal");

const openStatsBtn = document.getElementById("openStats");

const closeStatsBtn = document.getElementById("closeStats");

const statsTotalPlayTime = document.getElementById("statsTotalPlayTime");

const statsTotalTrophies = document.getElementById("statsTotalTrophies");

const statsTotalSessions = document.getElementById("statsTotalSessions");

const statsLongestGame = document.getElementById("statsLongestGame");

const statsLongestTime = document.getElementById("statsLongestTime");

const statsMostPlayedGame = document.getElementById("statsMostPlayedGame");

const statsMostPlayedSessions = document.getElementById(
  "statsMostPlayedSessions",
);

const closeGameDetailsBtn = document.getElementById("closeGameDetails");

const gameDetailsTitle = document.getElementById("gameDetailsTitle");

const detailsPlayTime = document.getElementById("detailsPlayTime");

const detailsPlaySessions = document.getElementById("detailsPlaySessions");

const detailsFirstPlayed = document.getElementById("detailsFirstPlayed");

const detailsLastPlayed = document.getElementById("detailsLastPlayed");

const detailsTrophySync = document.getElementById("detailsTrophySync");

const detailsAchievementsList = document.getElementById(
  "detailsAchievementsList",
);

const detailsAchievementCount = document.getElementById(
  "detailsAchievementCount",
);

const closeGameSelectorBtn = document.getElementById("closeGameSelector");

const gameSelectHeaders = document.querySelectorAll(".game-select-header");

const gamesAll = document.getElementById("gamesAll");

const gamesPlaying = document.getElementById("gamesPlaying");

const gamesUpcoming = document.getElementById("gamesUpcoming");

const gamesStory = document.getElementById("gamesStory");

const gamesCompleted = document.getElementById("gamesCompleted");

const gamesBacklog = document.getElementById("gamesBacklog");

const countAll = document.getElementById("countAll");

const countPlaying = document.getElementById("countPlaying");

const countUpcoming = document.getElementById("countUpcoming");

const countStory = document.getElementById("countStory");

const countCompleted = document.getElementById("countCompleted");

const countBacklog = document.getElementById("countBacklog");

// =========================================================
// SUPABASE CLIENT
// =========================================================

const sb = window.supabase.createClient(
  "https://jwncunroufyxkibdutzv.supabase.co",
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imp3bmN1bnJvdWZ5eGtpYmR1dHp2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODUzMzI2ODEsImV4cCI6MjEwMDkwODY4MX0.vMHa7c3E9ePwo3g93teQ343pl4O3JBpOTONDNv0Nyuc",
);

// =========================================================
// APP STATE
// =========================================================

let games = [];
let isAdmin = false;

// =========================================================
// UI HELPERS
// =========================================================

// Render skeleton cards while loading
function renderSkeletons(count = 20) {
  container.innerHTML = "";

  for (let i = 0; i < count; i++) {
    container.innerHTML += `
      <div class="skeleton-card">
        <div class="skeleton-img"></div>

        <div class="skeleton-info">
          <div class="skeleton-line title"></div>
          <div class="skeleton-line"></div>
          <div class="skeleton-line short"></div>
        </div>
      </div>
    `;
  }
}

// Upload a file to Supabase storage and return public URL
async function uploadToStorage(file) {
  const fileName = Date.now() + "-" + file.name;

  const { error: uploadError } = await sb.storage
    .from("game-images")
    .upload(fileName, file);

  if (uploadError) {
    throw uploadError;
  }

  return sb.storage.from("game-images").getPublicUrl(fileName).data.publicUrl;
}

// Preview selected image
function previewLocalImage(inputEl, imgEl) {
  const file = inputEl.files[0];

  if (!file) return;

  imgEl.src = URL.createObjectURL(file);
  imgEl.style.display = "block";
}

// =========================================================
// TROPHY HELPERS
// =========================================================

function getTrophyValue(game, field) {
  const value = Number(game?.[field]);

  return Number.isFinite(value) && value >= 0 ? value : 0;
}

function getTrophyProgress(game) {
  const value = Number(game?.trophy_progress);

  if (!Number.isFinite(value)) {
    return 0;
  }

  return Math.max(0, Math.min(100, value));
}

function getTotalTrophies(game) {
  return (
    getTrophyValue(game, "total_platinum") +
    getTrophyValue(game, "total_gold") +
    getTrophyValue(game, "total_silver") +
    getTrophyValue(game, "total_bronze")
  );
}

function renderTrophySection(game, released) {
  // IMPORTANT:
  // Trophy information is ONLY shown after release.
  if (!released) {
    return "";
  }

  const earnedPlatinum = getTrophyValue(game, "earned_platinum");
  const totalPlatinum = getTrophyValue(game, "total_platinum");

  const earnedGold = getTrophyValue(game, "earned_gold");
  const totalGold = getTrophyValue(game, "total_gold");

  const earnedSilver = getTrophyValue(game, "earned_silver");
  const totalSilver = getTrophyValue(game, "total_silver");

  const earnedBronze = getTrophyValue(game, "earned_bronze");
  const totalBronze = getTrophyValue(game, "total_bronze");

  const progress = getTrophyProgress(game);

  const totalTrophies = getTotalTrophies(game);

  // If the game has no trophy information at all,
  // don't show an empty trophy panel.
  const platformMessageStatuses = [
    "playing",
    "story_completed",
    "completed_100",
    "backlog",
  ];

  if (totalTrophies === 0) {
    const message = platformMessageStatuses.includes(game.status)
      ? "Game played on another platform and has no trophy data."
      : "Trophy data has not been synced yet.";

    return `
    <div class="trophy-section trophy-unavailable">
      <div class="trophy-header">
        <span class="trophy-title">🏆 TROPHIES</span>
        <span class="trophy-sync-status">No data</span>
      </div>

      <div class="trophy-empty">
        ${message}
      </div>
    </div>
  `;
  }

  return `
    <div class="trophy-section">

      <div class="trophy-header">
        <span class="trophy-title">🏆 TROPHIES</span>
        <span class="trophy-percent">${progress}%</span>
      </div>

      <div class="trophy-grid">

        <div class="trophy-item platinum">
          <div class="trophy-icon">
            <img src="./image/platinum.png" alt="Platinum" />
          </div>
          <div class="trophy-name">PLATINUM</div>
          <div class="trophy-count">
            ${earnedPlatinum}/${totalPlatinum}
          </div>
        </div>

        <div class="trophy-item gold">
          <div class="trophy-icon">
            <img src="./image/gold.png" alt="Gold" />
          </div>
          <div class="trophy-name">GOLD</div>
          <div class="trophy-count">
            ${earnedGold}/${totalGold}
          </div>
        </div>

        <div class="trophy-item silver">
          <div class="trophy-icon">
            <img src="./image/silver.png" alt="Silver" />
          </div>
          <div class="trophy-name">SILVER</div>
          <div class="trophy-count">
            ${earnedSilver}/${totalSilver}
          </div>
        </div>

        <div class="trophy-item bronze">
          <div class="trophy-icon">
            <img src="./image/bronze.png" alt="Bronze" />
          </div>
          <div class="trophy-name">BRONZE</div>
          <div class="trophy-count">
            ${earnedBronze}/${totalBronze}
          </div>
        </div>

      </div>

      <div class="trophy-progress">

        <div class="trophy-progress-track">
          <div
            class="trophy-progress-fill"
            style="width:${progress}%"
          ></div>
        </div>

        <div class="trophy-progress-text">
          <span>Trophy Progress</span>
          <span>${progress}%</span>
        </div>

      </div>

    </div>
  `;
}

function getTrophyIcon(type) {
  switch (String(type || "").toLowerCase()) {
    case "platinum":
      return '<img src="./image/platinum.png" alt="Platinum" />';

    case "gold":
      return '<img src="./image/gold.png" alt="Gold" />';

    case "silver":
      return '<img src="./image/silver.png" alt="Silver" />';

    case "bronze":
      return '<img src="./image/bronze.png" alt="Bronze" />';

    default:
      return "";
  }
}

// =========================================================
// GAMING STATISTICS
// =========================================================

function parsePlayTime(value) {
  if (!value) {
    return 0;
  }

  const text = String(value).toLowerCase();

  let totalMinutes = 0;

  const days = text.match(/(\d+(?:\.\d+)?)\s*d/);
  const hours = text.match(/(\d+(?:\.\d+)?)\s*h/);
  const minutes = text.match(/(\d+(?:\.\d+)?)\s*m/);

  if (days) {
    totalMinutes += Number(days[1]) * 24 * 60;
  }

  if (hours) {
    totalMinutes += Number(hours[1]) * 60;
  }

  if (minutes) {
    totalMinutes += Number(minutes[1]);
  }

  return totalMinutes;
}

function formatTotalPlayTime(totalMinutes) {
  if (!totalMinutes || totalMinutes <= 0) {
    return "0h";
  }

  const totalHours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;

  if (totalHours === 0) {
    return `${minutes}m`;
  }

  if (minutes === 0) {
    return `${totalHours}h`;
  }

  return `${totalHours}h ${minutes}m`;
}

function updateGamingStats() {
  let totalPlayMinutes = 0;

  let totalTrophies = 0;

  let totalSessions = 0;

  let longestGame = null;
  let longestGameMinutes = 0;

  let mostPlayedGame = null;
  let mostPlayedSessions = 0;

  const psnLevelGame = games.find(
    (game) => game.psn_trophy_level != null
  );

  if (psnLevelGame) {
    statsPsnLevel.textContent =
      psnLevelGame.psn_trophy_level;
  } else {
    statsPsnLevel.textContent = "—";
  }

  games.forEach((game) => {
    // -----------------------------------------
    // PLAY TIME
    // -----------------------------------------

    const playMinutes = parsePlayTime(game.play_time);

    totalPlayMinutes += playMinutes;

    if (playMinutes > longestGameMinutes) {
      longestGameMinutes = playMinutes;
      longestGame = game;
    }

    // -----------------------------------------
    // TROPHIES
    // -----------------------------------------

    totalTrophies +=
      getTrophyValue(game, "earned_platinum") +
      getTrophyValue(game, "earned_gold") +
      getTrophyValue(game, "earned_silver") +
      getTrophyValue(game, "earned_bronze");

    // -----------------------------------------
    // PLAY SESSIONS
    // -----------------------------------------

    const sessions = Number(game.play_sessions);

    if (Number.isFinite(sessions) && sessions >= 0) {
      totalSessions += sessions;

      if (sessions > mostPlayedSessions) {
        mostPlayedSessions = sessions;
        mostPlayedGame = game;
      }
    }
  });

  // -----------------------------------------
  // DISPLAY TOTALS
  // -----------------------------------------

  statsTotalPlayTime.textContent = formatTotalPlayTime(totalPlayMinutes);

  statsTotalTrophies.textContent = totalTrophies.toLocaleString();

  statsTotalSessions.textContent = totalSessions.toLocaleString();

  // -----------------------------------------
  // LONGEST PLAYED GAME
  // -----------------------------------------

  if (longestGame) {
    statsLongestGame.textContent = longestGame.name || "Unknown Game";

    statsLongestTime.textContent = formatTotalPlayTime(longestGameMinutes);
  } else {
    statsLongestGame.textContent = "No data";

    statsLongestTime.textContent = "—";
  }

  // -----------------------------------------
  // MOST PLAYED GAME
  // -----------------------------------------

  if (mostPlayedGame) {
    statsMostPlayedGame.textContent = mostPlayedGame.name || "Unknown Game";

    statsMostPlayedSessions.textContent = `${mostPlayedSessions.toLocaleString()} sessions`;
  } else {
    statsMostPlayedGame.textContent = "No data";

    statsMostPlayedSessions.textContent = "—";
  }
}

// Open stats
openStatsBtn.addEventListener("click", () => {
  updateGamingStats();

  statsModal.style.display = "flex";
});

// Close stats
closeStatsBtn.addEventListener("click", () => {
  statsModal.style.display = "none";
});

// Click outside modal
statsModal.addEventListener("click", (event) => {
  if (event.target === statsModal) {
    statsModal.style.display = "none";
  }
});

// =========================================================
// GAME DETAILS MODAL
// =========================================================

function formatGameDate(value) {
  if (!value) {
    return "—";
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "—";
  }

  return date.toLocaleString("en-GB", {
    timeZone: "Asia/Ho_Chi_Minh",
    dateStyle: "medium",
    timeStyle: "short",
  });
}

function escapeHTML(value) {
  if (value == null) {
    return "";
  }

  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function openGameDetails(game) {
  gameDetailsTitle.textContent = game.name || "Game Details";

  // =======================================================
  // PLAY TIME
  // =======================================================

  detailsPlayTime.textContent = game.play_time || "—";

  // =======================================================
  // PLAY SESSIONS
  // =======================================================

  detailsPlaySessions.textContent =
    game.play_sessions != null ? game.play_sessions : "—";

  // =======================================================
  // FIRST PLAY
  // =======================================================

  detailsFirstPlayed.textContent = formatGameDate(game.first_played_at);

  // =======================================================
  // LAST PLAY
  // =======================================================

  detailsLastPlayed.textContent = formatGameDate(game.last_played_at);

  // =======================================================
  // TROPHY SYNC
  // =======================================================

  if (game.trophy_synced_at) {
    detailsTrophySync.textContent = `${formatGameDate(game.trophy_synced_at)}`;
  } else {
    detailsTrophySync.textContent = "Trophy data has not been synced yet.";
  }

  // =======================================================
  // EARNED TROPHIES
  // =======================================================

  const achievements = Array.isArray(game.earned_achievements)
    ? game.earned_achievements
    : [];

  detailsAchievementCount.textContent = achievements.length;

  function sortAchievements(sortType) {
    const sorted = [...achievements];

    if (sortType === "type") {
      const trophyOrder = {
        platinum: 0,
        gold: 1,
        silver: 2,
        bronze: 3,
      };

      return sorted.sort((a, b) => {
        const typeA = trophyOrder[String(a.type || "").toLowerCase()] ?? 99;

        const typeB = trophyOrder[String(b.type || "").toLowerCase()] ?? 99;

        if (typeA !== typeB) {
          return typeA - typeB;
        }

        return new Date(b.earned_at) - new Date(a.earned_at);
      });
    }

    // Default: newest → oldest
    return sorted.sort((a, b) => new Date(b.earned_at) - new Date(a.earned_at));
  }

  function renderAchievements(sortType = "recent") {
    const sortedAchievements = sortAchievements(sortType);

    if (sortedAchievements.length === 0) {
      detailsAchievementsList.innerHTML = `
        <div class="achievements-empty">
          No earned achievements yet.
        </div>
      `;

      return;
    }

    detailsAchievementsList.innerHTML = sortedAchievements
      .map((achievement) => {
        const trophyIcon = getTrophyIcon(achievement.type);

        return `
          <div class="earned-achievement">

            <div class="earned-achievement-name">
              <span class="trophy-icon">
                ${trophyIcon}
              </span>

              <span>
                ${escapeHTML(achievement.name || "Unknown achievement")}
              </span>
            </div>

            <div class="earned-achievement-detail">
              ${escapeHTML(achievement.detail || "No description available.")}
            </div>

            <div class="earned-achievement-date">
              ${formatGameDate(achievement.earned_at)}
            </div>

          </div>
        `;
      })
      .join("");
  }

  // Default tab = Recent
  renderAchievements("recent");

  // Sort tabs
  const sortTabs = document.querySelectorAll(".achievement-sort-tab");

  sortTabs.forEach((tab) => {
    tab.addEventListener("click", () => {
      sortTabs.forEach((item) => {
        item.classList.remove("active");
      });

      tab.classList.add("active");

      renderAchievements(tab.dataset.sort);
    });
  });

  // =======================================================
  // OPEN
  // =======================================================

  gameDetailsModal.style.display = "flex";
}

function closeGameDetails() {
  gameDetailsModal.style.display = "none";
}

closeGameDetailsBtn.addEventListener("click", closeGameDetails);

gameDetailsModal.addEventListener("click", (event) => {
  if (event.target === gameDetailsModal) {
    closeGameDetails();
  }
});

// =========================================================
// GAME CARD
// =========================================================

function createCard(game) {
  const card = document.createElement("div");

  card.className = "card";

  card.addEventListener("click", () => {
    openGameDetails(game);
  });

  const release = new Date(game.release);
  const now = new Date();

  const released = release <= now;

  card.innerHTML = `
    <div class="card-actions">
      <button class="edit-btn" title="Edit">✏️</button>
      <button class="delete-btn" title="Delete">&times;</button>
    </div>

    <img src="${game.image}" alt="${game.name}">

    <div class="info">

      <h2>${game.name}</h2>

      <div class="release">
        ${release.toLocaleString("en-GB", {
          timeZone: "Asia/Ho_Chi_Minh",
          dateStyle: "full",
          timeStyle: "short",
        })}
      </div>

      <div class="countdown"></div>

      <div class="countdown2"></div>

      <div class="trophy-container">
        ${renderTrophySection(game, released)}
      </div>

    </div>
  `;

  // Hide admin controls if not admin
  if (!isAdmin) {
    card.querySelector(".card-actions").style.display = "none";
  }

  // Store references
  game.element = card.querySelector(".countdown");
  game.element2 = card.querySelector(".countdown2");
  game.trophyElement = card.querySelector(".trophy-container");

  // =======================================================
  // DELETE
  // =======================================================

  card.querySelector(".delete-btn").addEventListener("click", async (e) => {
    e.stopPropagation();

    if (!confirm(`Delete "${game.name}"?`)) {
      return;
    }

    const { error } = await sb.from("games").delete().eq("id", game.id);

    if (error) {
      alert(error.message);
      return;
    }

    card.remove();
  });

  // =======================================================
  // EDIT
  // =======================================================

  card.querySelector(".edit-btn").addEventListener("click", (e) => {
    e.stopPropagation();
    editName.value = game.name;

    editPreview.src = game.image;
    editPreview.style.display = "block";

    editImage.value = "";

    const release = new Date(game.release);

    const local = new Date(
      release.getTime() - release.getTimezoneOffset() * 60000,
    );

    editRelease.value = local.toISOString().slice(0, 16);

    editStatus.value = game.status ?? "out";

    statusGroup.style.display = release <= new Date() ? "block" : "none";

    editModal.style.display = "flex";

    // =====================================================
    // SAVE EDIT
    // =====================================================

    saveEditBtn.onclick = async () => {
      let image = game.image;

      const file = editImage.files[0];

      if (file) {
        try {
          image = await uploadToStorage(file);
        } catch (err) {
          alert(err.message);
          return;
        }
      }

      const { error } = await sb
        .from("games")
        .update({
          name: editName.value,
          image,
          release: editRelease.value + ":00+07:00",
          status: editStatus.value,
        })
        .eq("id", game.id);

      if (error) {
        alert(error.message);
        return;
      }

      location.reload();
    };
  });

  container.appendChild(card);
}

// =========================================================
// RENDER ALL GAMES
// =========================================================

function renderGames(list) {
  container.innerHTML = "";

  list.forEach((game) => {
    createCard(game);
  });
}

// =========================================================
// UPDATE COUNTDOWN
// =========================================================

function updateCountdown() {
  const now = new Date();

  games.forEach((game) => {
    const release = new Date(game.release);

    const diff = release - now;

    const released = diff <= 0;

    const urgent = diff <= 7 * 24 * 60 * 60 * 1000 && diff > 0;

    // =====================================================
    // GAME RELEASED
    // =====================================================

    if (released) {
      switch (game.status) {
        case "backlog":
          game.element.innerHTML = '<span class="backlog">📚 BACKLOG</span>';
          break;

        case "playing":
          game.element.innerHTML = '<span class="playing">⚔️ PLAYING</span>';
          break;

        case "story_completed":
          game.element.innerHTML =
            '<span class="story">🌟 STORY COMPLETED</span>';
          break;

        case "completed_100":
          game.element.innerHTML = '<span class="full">🏆 PLATINUM 🏆</span>';
          break;

        default:
          game.element.innerHTML = '<span class="out">🔥 OUT NOW!</span>';
      }

      // No release progress after launch
      game.element2.innerHTML = "";

      // ---------------------------------------------------
      // IMPORTANT:
      // Trophy is shown only after release.
      // ---------------------------------------------------

      if (game.trophyElement) {
        game.trophyElement.innerHTML = renderTrophySection(game, true);
      }

      return;
    }

    // =====================================================
    // GAME NOT RELEASED
    // =====================================================

    // Make absolutely sure trophy is hidden
    if (game.trophyElement) {
      game.trophyElement.innerHTML = "";
    }

    // Countdown values

    const days = Math.floor(diff / (1000 * 60 * 60 * 24));

    const hours = Math.floor((diff / (1000 * 60 * 60)) % 24);

    const minutes = Math.floor((diff / (1000 * 60)) % 60);

    const seconds = Math.floor((diff / 1000) % 60);

    // Release progress

    const createdAt = game.created_at ? new Date(game.created_at) : new Date();

    const total = release - createdAt;

    const elapsed = now - createdAt;

    let percent = 0;

    if (total > 0) {
      percent = Math.max(0, Math.min(100, (elapsed / total) * 100));
    }

    // Countdown

    game.element.innerHTML = `
      <div class="flip-box">
        <div class="flip-number">${days}</div>
        <div class="flip-label">DAYS</div>
      </div>

      <div class="flip-box">
        <div class="flip-number">${hours}</div>
        <div class="flip-label">HOURS</div>
      </div>

      <div class="flip-box">
        <div class="flip-number">${minutes}</div>
        <div class="flip-label">MIN</div>
      </div>

      <div class="flip-box">
        <div class="flip-number">${seconds}</div>
        <div class="flip-label">SEC</div>
      </div>
    `;

    // Release progress

    game.element2.innerHTML = `
      <div class="progress">

        <div class="progress-track ${urgent ? "urgent" : ""}">
          <div
            class="progress-fill"
            style="width:${percent.toFixed(2)}%"
          ></div>
        </div>

        <div class="progress-text">
          <span>Release Progress</span>
          <span>${percent.toFixed(2)}%</span>
        </div>

      </div>
    `;
  });
}

// =========================================================
// SCROLL TO NEXT UPCOMING GAME
// =========================================================

function highlightNextGame() {
  const now = new Date();

  const nextGame = games.find((game) => new Date(game.release) > now);

  if (!nextGame) {
    return;
  }

  const card = nextGame.element.closest(".card");

  if (!card) {
    return;
  }

  card.scrollIntoView({
    behavior: "auto",
    block: "center",
  });

  card.style.border = "3px solid #00d4ff";
}

// =========================================================
// MODAL INPUT EVENTS
// =========================================================

addImage.addEventListener("change", (e) => {
  previewLocalImage(e.target, addPreview);
});

editImage.addEventListener("change", (e) => {
  previewLocalImage(e.target, editPreview);
});

openAddBtn.onclick = () => {
  addModal.style.display = "flex";
};

cancelAddBtn.onclick = () => {
  addModal.style.display = "none";
};

cancelEditBtn.onclick = () => {
  editModal.style.display = "none";
};

// =========================================================
// SAVE NEW GAME
// =========================================================

saveAddBtn.onclick = async () => {
  const file = addImage.files[0];

  if (!file) {
    alert("Please choose an image.");
    return;
  }

  let image;

  try {
    image = await uploadToStorage(file);
  } catch (err) {
    alert(err.message);
    return;
  }

  const game = {
    name: addName.value,
    image,
    release: addRelease.value + ":00+07:00",
    status: "countdown",
  };

  const { error } = await sb.from("games").insert(game);

  if (error) {
    alert(error.message);
    return;
  }

  location.reload();
};

// =========================================================
// GAME SELECTOR
// =========================================================

function getGamesByStatus(status) {
  if (status === "all") {
    return games;
  }

  // Upcoming = games that have not been released yet
  if (status === "upcoming") {
    const now = new Date();

    return games.filter((game) => {
      const release = new Date(game.release);

      return release > now;
    });
  }

  return games.filter((game) => game.status === status);
}

function scrollToSelectedGame(game) {
  if (!game || !game.element) {
    return;
  }

  const card = game.element.closest(".card");

  if (!card) {
    return;
  }

  // Close popup
  gameSelectorModal.style.display = "none";

  // Scroll to card
  card.scrollIntoView({
    behavior: "smooth",
    block: "center",
    inline: "center",
  });

  // Highlight selected game
  card.classList.add("game-selector-highlight");

  setTimeout(() => {
    card.classList.remove("game-selector-highlight");
  }, 1800);
}

function renderGameSelectorList(containerElement, gameList) {
  containerElement.innerHTML = "";

  if (gameList.length === 0) {
    containerElement.innerHTML = `
      <div class="game-selector-empty">
        No games
      </div>
    `;

    return;
  }

  gameList.forEach((game) => {
    const button = document.createElement("button");

    button.className = "game-selector-game";

    button.textContent = game.name;

    button.addEventListener("click", () => {
      scrollToSelectedGame(game);
    });

    containerElement.appendChild(button);
  });
}

function updateGameSelector() {
  const upcoming = getGamesByStatus("upcoming");

  const all = getGamesByStatus("all");

  const playing = getGamesByStatus("playing");

  const story = getGamesByStatus("story_completed");

  const completed = getGamesByStatus("completed_100");

  const backlog = getGamesByStatus("backlog");


  // =======================================================
  // COUNTS
  // =======================================================

  countUpcoming.textContent = upcoming.length;

  countAll.textContent = all.length;

  countPlaying.textContent = playing.length;

  countStory.textContent = story.length;

  countCompleted.textContent = completed.length;

  countBacklog.textContent = backlog.length;


  // =======================================================
  // GAME LISTS
  // =======================================================

  renderGameSelectorList(gamesUpcoming, upcoming);

  renderGameSelectorList(gamesAll, all);

  renderGameSelectorList(gamesPlaying, playing);

  renderGameSelectorList(gamesStory, story);

  renderGameSelectorList(gamesCompleted, completed);

  renderGameSelectorList(gamesBacklog, backlog);
}

// Open popup
openGameSelectorBtn.addEventListener("click", () => {
  updateGameSelector();

  gameSelectorModal.style.display = "flex";
});

// Close popup
closeGameSelectorBtn.addEventListener("click", () => {
  gameSelectorModal.style.display = "none";
});

// Click outside popup
gameSelectorModal.addEventListener("click", (event) => {
  if (event.target === gameSelectorModal) {
    gameSelectorModal.style.display = "none";
  }
});

// =========================================================
// OPEN / CLOSE CATEGORY
// =========================================================

gameSelectHeaders.forEach((header) => {
  header.addEventListener("click", () => {
    const group = header.parentElement;

    const gameList = group.querySelector(".game-select-games");

    const isOpen = group.classList.contains("open");

    // Close all groups first
    document.querySelectorAll(".game-select-group").forEach((item) => {
      item.classList.remove("open");
    });

    // Open selected group
    if (!isOpen) {
      group.classList.add("open");
    }
  });
});

// =========================================================
// INITIALIZATION
// =========================================================

(async function init() {
  renderSkeletons();

  // Check auth
  const {
    data: { session },
  } = await sb.auth.getSession();

  isAdmin = session != null;

  if (isAdmin) {
    openAddBtn.style.display = "flex";
  }

  // Load games
  const { data, error } = await sb.from("games").select("*").order("release");

  if (error) {
    container.innerHTML = `
      <div class="error">
        Error loading games: ${error.message}
      </div>
    `;

    return;
  }

  games = data || [];

  // Render
  renderGames(games);

  updateGameSelector();

  // Initial update
  updateCountdown();

  // Update every second
  setInterval(updateCountdown, 1000);

  // Highlight next release
  highlightNextGame();
})();

// =========================================================
// PREVENT PINCH / GESTURE ZOOM
// =========================================================

document.addEventListener("gesturestart", (e) => e.preventDefault());

document.addEventListener("gesturechange", (e) => e.preventDefault());

document.addEventListener("gestureend", (e) => e.preventDefault());
