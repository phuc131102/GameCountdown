// ...existing code...
// DOM references
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

// Supabase client
const sb = window.supabase.createClient(
  "https://jwncunroufyxkibdutzv.supabase.co",
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imp3bmN1bnJvdWZ5eGtpYmR1dHp2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODUzMzI2ODEsImV4cCI6MjEwMDkwODY4MX0.vMHa7c3E9ePwo3g93teQ343pl4O3JBpOTONDNv0Nyuc"
);

// App state
let games = [];
let isAdmin = false;

// --- UI helpers ---
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
  const { error: uploadError } = await sb.storage.from("game-images").upload(fileName, file);
  if (uploadError) throw uploadError;
  return sb.storage.from("game-images").getPublicUrl(fileName).data.publicUrl;
}

// Preview selected image in an <img> element
function previewLocalImage(inputEl, imgEl) {
  const file = inputEl.files[0];
  if (!file) return;
  imgEl.src = URL.createObjectURL(file);
  imgEl.style.display = "block";
}

// --- Card creation / event wiring ---
function createCard(game) {
  const card = document.createElement("div");
  card.className = "card";

  card.innerHTML = `
    <div class="card-actions">
      <button class="edit-btn" title="Edit">✏️</button>
      <button class="delete-btn" title="Delete">&times;</button>
    </div>
    <img src="${game.image}" alt="${game.name}">
    <div class="info">
      <h2>${game.name}</h2>
      <div class="release">
        ${new Date(game.release).toLocaleString("en-GB", {
          timeZone: "Asia/Ho_Chi_Minh",
          dateStyle: "full",
          timeStyle: "short",
        })}
      </div>
      <div class="countdown"></div>
      <div class="countdown2"></div>
    </div>
  `;

  // Hide admin controls if not admin
  if (!isAdmin) card.querySelector(".card-actions").style.display = "none";

  // Attach references and handlers
  game.element = card.querySelector(".countdown");
  game.element2 = card.querySelector(".countdown2");

  // Delete handler
  card.querySelector(".delete-btn").addEventListener("click", async (e) => {
    e.stopPropagation();
    if (!confirm(`Delete "${game.name}"?`)) return;
    const { error } = await sb.from("games").delete().eq("id", game.id);
    if (error) {
      alert(error.message);
      return;
    }
    card.remove();
  });

  // Edit handler - populate and open modal
  card.querySelector(".edit-btn").addEventListener("click", () => {
    editName.value = game.name;
    editPreview.src = game.image;
    editPreview.style.display = "block";
    editImage.value = "";

    const release = new Date(game.release);
    const local = new Date(release.getTime() - release.getTimezoneOffset() * 60000);
    editRelease.value = local.toISOString().slice(0, 16);

    editStatus.value = game.status ?? "out";
    statusGroup.style.display = release <= new Date() ? "block" : "none";

    editModal.style.display = "flex";

    // Save edit handler (replaces previous assignment)
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

      const { error } = await sb.from("games").update({
        name: editName.value,
        image,
        release: editRelease.value + ":00+07:00",
        status: editStatus.value,
      }).eq("id", game.id);

      if (error) {
        alert(error.message);
        return;
      }

      location.reload();
    };
  });

  container.appendChild(card);
}

// Render all games as cards
function renderGames(list) {
  container.innerHTML = "";
  list.forEach((g) => createCard(g));
}

// --- Countdown and progress update ---
function updateCountdown() {
  const now = new Date();
  games.forEach((game) => {
    const release = new Date(game.release);
    const diff = release - now;
    const urgent = diff <= 7 * 24 * 60 * 60 * 1000 && diff > 0;

    if (diff <= 0) {
      switch (game.status) {
        case "backlog":
          game.element.innerHTML = '<span class="backlog">📚 BACKLOG</span>';
          break;
        case "playing":
          game.element.innerHTML = '<span class="playing">⚔️ PLAYING</span>';
          break;
        case "story_completed":
          game.element.innerHTML = '<span class="story">🌟 STORY COMPLETED</span>';
          break;
        case "completed_100":
          game.element.innerHTML = '<span class="full">🏆 PLATINUM 🏆</span>';
          break;
        default:
          game.element.innerHTML = '<span class="out">🔥 OUT NOW!</span>';
      }
      game.element2.innerHTML = "";
      return;
    }

    const days = Math.floor(diff / (1000 * 60 * 60 * 24));
    const hours = Math.floor((diff / (1000 * 60 * 60)) % 24);
    const minutes = Math.floor((diff / (1000 * 60)) % 60);
    const seconds = Math.floor((diff / 1000) % 60);

    const total = new Date(game.release) - new Date(game.created_at);
    const elapsed = now - new Date(game.created_at);
    const percent = Math.max(0, Math.min(100, (elapsed / total) * 100));

    game.element.innerHTML = `
      <div class="flip-box"><div class="flip-number">${days}</div><div class="flip-label">DAYS</div></div>
      <div class="flip-box"><div class="flip-number">${hours}</div><div class="flip-label">HOURS</div></div>
      <div class="flip-box"><div class="flip-number">${minutes}</div><div class="flip-label">MIN</div></div>
      <div class="flip-box"><div class="flip-number">${seconds}</div><div class="flip-label">SEC</div></div>
    `;

    game.element2.innerHTML = `
      <div class="progress">
        <div class="progress-track ${urgent ? "urgent" : ""}">
          <div class="progress-fill" style="width:${percent.toFixed(2)}%"></div>
        </div>
        <div class="progress-text">
          <span>Release Progress</span>
          <span>${percent.toFixed(2)}%</span>
        </div>
      </div>
    `;
  });
}

// Scroll to next upcoming game and highlight it
function highlightNextGame() {
  const now = new Date();
  const nextGame = games.find((g) => new Date(g.release) > now);
  if (!nextGame) return;
  const card = nextGame.element.closest(".card");
  card.scrollIntoView({ behavior: "auto", block: "center" });
  card.style.border = "3px solid #00d4ff";
}

// --- Modal & input event wiring (grouped) ---
addImage.addEventListener("change", (e) => previewLocalImage(e.target, addPreview));
editImage.addEventListener("change", (e) => previewLocalImage(e.target, editPreview));

openAddBtn.onclick = () => { addModal.style.display = "flex"; };
cancelAddBtn.onclick = () => { addModal.style.display = "none"; };
cancelEditBtn.onclick = () => { editModal.style.display = "none"; };

// Save new game
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

// --- Initialization ---
(async function init() {
  renderSkeletons();

  const { data: { session } } = await sb.auth.getSession();
  isAdmin = session != null;
  if (isAdmin) openAddBtn.style.display = "flex";

  const { data, error } = await sb.from("games").select("*").order("release");
  if (error) {
    container.innerHTML = `<div class="error">Error loading games: ${error.message}</div>`;
    return;
  }

  games = data || [];
  renderGames(games);

  updateCountdown();
  setInterval(updateCountdown, 1000);
  highlightNextGame();
})();

// Prevent pinch/gesture zoom handlers
document.addEventListener("gesturestart", (e) => e.preventDefault());
document.addEventListener("gesturechange", (e) => e.preventDefault());
document.addEventListener("gestureend", (e) => e.preventDefault());
// ...existing code...