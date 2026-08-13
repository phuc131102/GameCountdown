const container = document.getElementById("games");

      container.innerHTML = "";

      for (let i = 0; i < 20; i++) {
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

const sb = window.supabase.createClient(
        "https://jwncunroufyxkibdutzv.supabase.co",

        "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imp3bmN1bnJvdWZ5eGtpYmR1dHp2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODUzMzI2ODEsImV4cCI6MjEwMDkwODY4MX0.vMHa7c3E9ePwo3g93teQ343pl4O3JBpOTONDNv0Nyuc",
      );

      (async () => {
        const {
          data: { session },
        } = await sb.auth.getSession();

        const isAdmin = session != null;
        // Hiện nút Add nếu là admin
        if (isAdmin) {
          document.getElementById("openAdd").style.display = "flex";
        }

        const { data: games, error } = await sb
          .from("games")
          .select("*")
          .order("release");

        // Xóa skeleton
        container.innerHTML = "";

        games.forEach((game) => {
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
                                ${new Date(game.release).toLocaleString(
                                  "en-GB",
                                  {
                                    timeZone: "Asia/Ho_Chi_Minh",
                                    dateStyle: "full",
                                    timeStyle: "short",
                                  },
                                )}
                            </div>

                            <div class="countdown"></div>
                            <div class="countdown2"></div>
                        </div>
                    `;

          container.appendChild(card);

          if (!isAdmin) {
            card.querySelector(".card-actions").style.display = "none";
          }

          game.element = card.querySelector(".countdown");
          game.element2 = card.querySelector(".countdown2");

          card
            .querySelector(".delete-btn")
            .addEventListener("click", async (e) => {
              e.stopPropagation();

              if (!confirm(`Delete "${game.name}"?`)) return;

              const { error } = await sb
                .from("games")
                .delete()
                .eq("id", game.id);

              if (error) {
                alert(error.message);
                return;
              }

              card.remove();
            });

          card.querySelector(".edit-btn").addEventListener("click", () => {
            document.getElementById("editName").value = game.name;
            const preview = document.getElementById("editPreview");

            preview.src = game.image;
            preview.style.display = "block";

            document.getElementById("editImage").value = "";

            const release = new Date(game.release);
            const now = new Date();

            // Chuyển sang giờ địa phương trước khi đưa vào datetime-local
            const local = new Date(
              release.getTime() - release.getTimezoneOffset() * 60000,
            );

            document.getElementById("editRelease").value = local
              .toISOString()
              .slice(0, 16);

            document.getElementById("editStatus").value = game.status ?? "out";

            document.getElementById("statusGroup").style.display =
              release <= now ? "block" : "none";

            document.getElementById("editModal").style.display = "flex";

            document.getElementById("saveEdit").onclick = async () => {
              let image = game.image;

              const file = document.getElementById("editImage").files[0];

              if (file) {
                const fileName = Date.now() + "-" + file.name;

                const { error: uploadError } = await sb.storage
                  .from("game-images")
                  .upload(fileName, file);

                if (uploadError) {
                  alert(uploadError.message);
                  return;
                }

                image = sb.storage.from("game-images").getPublicUrl(fileName)
                  .data.publicUrl;
              }

              const { error } = await sb
                .from("games")
                .update({
                  name: document.getElementById("editName").value,

                  image,

                  release:
                    document.getElementById("editRelease").value + ":00+07:00",

                  status: document.getElementById("editStatus").value,
                })
                .eq("id", game.id);

              if (error) {
                alert(error.message);
                return;
              }

              location.reload();
            };
          });
        });

        function updateCountdown() {
          const now = new Date();

          games.forEach((game) => {
            const release = new Date(game.release);

            const diff = release - now;
            const urgent = diff <= 7 * 24 * 60 * 60 * 1000 && diff > 0;

            if (diff <= 0) {
              switch (game.status) {
                case "backlog":
                  game.element.innerHTML =
                    '<span class="backlog">📚 BACKLOG</span>';
                  break;

                case "playing":
                  game.element.innerHTML =
                    '<span class="playing">⚔️ PLAYING</span>';
                  break;

                case "story_completed":
                  game.element.innerHTML =
                    '<span class="story">🌟 STORY COMPLETED</span>';
                  break;

                case "completed_100":
                  game.element.innerHTML =
                    '<span class="full">🏆 PLATINUM 🏆</span>';
                  break;

                default:
                  game.element.innerHTML =
                    '<span class="out">🔥 OUT NOW!</span>';
              }

              return;
            }

            const days = Math.floor(diff / (1000 * 60 * 60 * 24));

            const hours = Math.floor((diff / (1000 * 60 * 60)) % 24);

            const minutes = Math.floor((diff / (1000 * 60)) % 60);

            const seconds = Math.floor((diff / 1000) % 60);

            const total = release - new Date(game.created_at);
            const elapsed = now - new Date(game.created_at);
            const percent = Math.max(0, Math.min(100, (elapsed / total) * 100));

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

            game.element2.innerHTML = `
                  <div class="progress">

                    <div class="progress-track ${urgent ? "urgent" : ""}">
                        <div
                            class="progress-fill"
                            style="width:${percent.toFixed(2)}%">
                        </div>
                    </div>

                    <div class="progress-text">
                        <span>Release Progress</span>
                        <span>${percent.toFixed(2)}%</span>
                    </div>

                </div>
            `;
          });
        }

        document.getElementById("cancelEdit").onclick = () => {
          document.getElementById("editModal").style.display = "none";
        };

        document.getElementById("addImage").addEventListener("change", (e) => {
          const file = e.target.files[0];

          if (!file) return;

          const img = document.getElementById("addPreview");

          img.src = URL.createObjectURL(file);

          img.style.display = "block";
        });

        document.getElementById("editImage").addEventListener("change", (e) => {
          const file = e.target.files[0];

          if (!file) return;

          const img = document.getElementById("editPreview");

          img.src = URL.createObjectURL(file);

          img.style.display = "block";
        });

        document.getElementById("openAdd").onclick = () => {
          document.getElementById("addModal").style.display = "flex";
        };

        document.getElementById("cancelAdd").onclick = () => {
          document.getElementById("addModal").style.display = "none";
        };

        document.getElementById("saveAdd").onclick = async () => {
          const file = document.getElementById("addImage").files[0];

          if (!file) {
            alert("Please choose an image.");
            return;
          }

          // Tạo tên file duy nhất
          const fileName = Date.now() + "-" + file.name;

          // Upload lên Storage
          const { error: uploadError } = await sb.storage
            .from("game-images")
            .upload(fileName, file);

          if (uploadError) {
            alert(uploadError.message);
            return;
          }

          // Lấy URL public
          const image = sb.storage.from("game-images").getPublicUrl(fileName)
            .data.publicUrl;

          // Lưu database
          const game = {
            name: document.getElementById("addName").value,
            image,
            release: document.getElementById("addRelease").value + ":00+07:00",
            status: "countdown",
          };

          const { error } = await sb.from("games").insert(game);

          if (error) {
            alert(error.message);
            return;
          }

          location.reload();
        };

        updateCountdown();

        setInterval(updateCountdown, 1000);

        const now = new Date();

        const nextGame = games.find((game) => new Date(game.release) > now);

        if (nextGame) {
          const card = nextGame.element.closest(".card");

          card.scrollIntoView({
            behavior: "auto",
            block: "center",
          });

          card.style.border = "3px solid #00d4ff";
        }
      })();

      document.addEventListener("gesturestart", function (e) {
        e.preventDefault();
      });

      document.addEventListener("gesturechange", function (e) {
        e.preventDefault();
      });

      document.addEventListener("gestureend", function (e) {
        e.preventDefault();
      });
