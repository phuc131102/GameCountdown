const express = require("express");
const fs = require("fs");
const path = require("path");

const app = express();

app.use(express.json());

app.use(express.static("public"));

const FILE = path.join(__dirname, "public", "games.json");

app.post("/add-game", (req, res) => {
  const game = req.body;

  const games = JSON.parse(fs.readFileSync(FILE));

  games.push(game);

  fs.writeFileSync(FILE, JSON.stringify(games, null, 4));

  res.json({
    success: true,
  });
});

app.listen(3000, () => {
  console.log("Server running");
});
