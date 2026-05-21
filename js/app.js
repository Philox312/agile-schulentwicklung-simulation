
if (!window.GAME_DATA) {
  throw new Error("GAME_DATA fehlt. Bitte js/data.js korrekt laden und den gesamten Ordner entpacken/hochladen.");
}
const { stories: BASE_STORIES, problems: PROBLEMS, solutions: SOLUTIONS, events: EVENTS, scenarios: SCENARIOS } = window.GAME_DATA;

const FIB = [1, 2, 3, 5, 8, 13, 20, 40, 100];
let S = null;
let D = null;

const $ = (id) => document.getElementById(id);
const esc = (value) => String(value ?? "").replace(/[&<>"']/g, (m) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" }[m]));
const shuffle = (arr) => {
  const x = [...arr];
  for (let i = x.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [x[i], x[j]] = [x[j], x[i]];
  }
  return x;
};

function bind() {
  $("startBtn").addEventListener("click", startGame);
  $("resetBtn").addEventListener("click", resetGame);
  $("toggleFacilitationBtn").addEventListener("click", toggleFacilitation);
  $("zoomOverlay").addEventListener("click", closeZoom);
}

function toggleFacilitation() {
  $("facilitationBox").classList.toggle("hidden");
}

function startGame() {
  const players = Number($("players").value);
  const allStories = BASE_STORIES.map((x, idx) => ({
    ...x,
    originalSP: x.sp,
    estimate: null,
    penalty: 0,
    pokerSelected: false,
    id: `S${idx}_${Date.now()}`,
    progress: 0,
    blockedBy: null,
    owner: null
  }));

  const pokerStories = shuffle(allStories).slice(0, Math.min(10, allStories.length));
  const pokerIds = new Set(pokerStories.map((s) => s.id));
  allStories.forEach((s) => { if (pokerIds.has(s.id)) s.pokerSelected = true; });

  S = {
    sprint: 1,
    maxSprints: Number($("sprints").value),
    players,
    storiesPerPlayer: Number($("storiesPerPlayer").value),
    allStories,
    pokerStories,
    pokerIndex: 0,
    pokerDone: false,
    backlog: [],
    blocked: [],
    done: [],
    playerStories: {},
    storedSolutions: {},
    stackIndices: {},
    decisionTrail: [],
    log: [],
    currentPlayer: null,
    planningPlayer: 1,
    week: 0,
    currentRoll: null,
    awaitingAssign: false,
    erledigteSP: 0,
    phase: "poker",
    scenarioDeck: shuffle(SCENARIOS),
    activeScenario: null
  };
  for (let p = 1; p <= players; p++) {
    S.playerStories[p] = [];
    S.storedSolutions[p] = [];
  }
  D = { problems: shuffle(PROBLEMS), solutions: shuffle(SOLUTIONS), events: shuffle(EVENTS) };

  $("intro").classList.add("hidden");
  $("game").classList.remove("hidden");
  $("boardArea").classList.add("hidden");
  addLog("Simulation gestartet: 10 Vorhaben werden zufällig für die Aufwandsklärung ausgewählt.");
  showPoker();
}

function resetGame() {
  S = null;
  D = null;
  $("intro").classList.remove("hidden");
  $("game").classList.add("hidden");
  ["dashboard", "currentCard", "storedSolutionsBox", "logBox", "pokerArea", "scenarioArea", "decisionPathArea", "cardArea", "solutionArea"].forEach((id) => $(id).innerHTML = "");
}

function setPhase(title, step, body) {
  $("phaseTitle").innerText = title;
  const steps = ["Aufwandsklärung", "Dilemma", "Vorhaben wählen", "Woche: Karte", "Woche: Würfeln", "Review", "Retrospektive"];
  $("timeline").innerHTML = steps.map((x) => `<span class="${x === step ? "active" : ""}">${x}</span>`).join("");
  $("explainContent").innerHTML = `<strong>${esc(title)}</strong><div>${body}</div>`;
  $("sprintTag").innerText = S?.pokerDone ? `Entwicklungszyklus ${S.sprint}/${S.maxSprints}` : "Vorbereitung";
  $("weekTag").innerText = S?.pokerDone ? (S.week ? `Woche ${S.week}/2` : "Planung") : "Aufwandsklärung";
  $("playerTag").innerText = S?.currentPlayer ? `Person ${S.currentPlayer}` : "";
}

function addLog(text) {
  S.log.unshift(text);
  renderLog();
}

function addDecisionTrail(type, title, detail) {
  S.decisionTrail.unshift({ type, title, detail, sprint: S.sprint, week: S.week, player: S.currentPlayer });
}

function openSP() {
  return [...S.backlog, ...S.blocked, ...Object.values(S.playerStories).flat()].reduce((a, s) => a + (s.sp - s.progress), 0);
}

/* Aufwandsklärung */
function showPoker() {
  S.phase = "poker";
  const total = S.pokerStories.length;
  const idx = S.pokerIndex;
  if (idx >= total) return finishPoker();

  const st = S.pokerStories[idx];
  setPhase("Aufwandsklärung", "Aufwandsklärung", "Ein zufällig ausgewähltes Vorhaben wird gemeinsam gelesen und geschätzt. Abweichungen erzeugen zusätzlichen Klärungsaufwand.");
  const pct = Math.round((idx / total) * 100);
  $("phaseText").innerHTML = `<div class="calc-box"><strong>Vorhaben ${idx + 1} von ${total}</strong><div class="progress-line"><span style="width:${pct}%"></span></div>Was ist unklar? Wer ist beteiligt? Was macht das Vorhaben komplex?</div>`;
  $("pokerArea").innerHTML = `<div class="poker-stage">
    <div class="card poker">
      ${st.image ? `<img src="${esc(st.image)}" alt="${esc(st.title)}">` : ""}
      <strong>${esc(st.title)}</strong>
      <p>${esc(st.text)}</p>
      <div class="meta">${esc(st.category)} · Referenzwert noch verdeckt</div>
      <button class="zoom-btn" onclick="openPokerZoom()">🔍 Karte groß anzeigen</button>
    </div>
    <div class="poker-buttons">${FIB.map((v) => `<button onclick="estimateStory(${v})">${v}</button>`).join("")}</div>
  </div>`;
  $("actionButtons").innerHTML = `<button onclick="skipPoker()">Aufwandsklärung überspringen</button>`;
  renderDashboard();
}

function estimateStory(v) {
  const st = S.pokerStories[S.pokerIndex];
  st.estimate = v;
  st.penalty = Math.abs(v - st.originalSP);
  st.sp = st.originalSP + st.penalty;
  const all = S.allStories.find((x) => x.id === st.id);
  if (all) Object.assign(all, { estimate: st.estimate, penalty: st.penalty, sp: st.sp, pokerSelected: true });
  addLog(`Aufwandsklärung: „${st.title}“ geschätzt ${v} KP, Referenzwert ${st.originalSP} KP, zusätzlicher Klärungsaufwand +${st.penalty} KP.`);
  $("pokerArea").innerHTML = `<div class="poker-stage">
    <div class="card poker">
      ${st.image ? `<img src="${esc(st.image)}" alt="${esc(st.title)}">` : ""}
      <strong>${esc(st.title)}</strong>
      <p>${esc(st.text)}</p>
      <div class="meta">Schätzung: ${v} KP · Referenzwert: ${st.originalSP} KP · Klärungsaufwand: +${st.penalty} KP · neuer Aufwand: ${st.sp} KP</div>
      <button class="zoom-btn" onclick="openPokerZoom()">🔍 Karte groß anzeigen</button>
    </div>
  </div>`;
  $("actionButtons").innerHTML = `<button class="primary" onclick="nextPoker()">Nächstes Vorhaben</button>`;
  renderDashboard();
}

function nextPoker() { S.pokerIndex++; showPoker(); }

function skipPoker() {
  S.pokerStories.forEach((st) => {
    Object.assign(st, { estimate: st.originalSP, penalty: 0, sp: st.originalSP });
    const all = S.allStories.find((x) => x.id === st.id);
    if (all) Object.assign(all, { estimate: st.originalSP, penalty: 0, sp: st.originalSP, pokerSelected: true });
  });
  addLog("Aufwandsklärung übersprungen: kein zusätzlicher Klärungsaufwand.");
  finishPoker();
}

function finishPoker() {
  S.pokerDone = true;
  S.backlog = shuffle(S.allStories.map((x) => ({ ...x, id: `S${Date.now()}_${Math.random()}`, progress: 0, blockedBy: null, owner: null })));
  $("pokerArea").innerHTML = "";
  $("boardArea").classList.remove("hidden");
  addLog("Aufwandsklärung abgeschlossen. Alle Entwicklungsvorhaben liegen in der Sammlung.");
  showScenario();
}

/* Dilemma / Entscheidungswege */
function showScenario() {
  S.phase = "scenario";
  S.week = 0;
  S.currentPlayer = null;
  if (!S.scenarioDeck.length) S.scenarioDeck = shuffle(SCENARIOS);
  const sc = S.scenarioDeck.pop();
  S.activeScenario = sc;
  setPhase(`Dilemma vor Entwicklungszyklus ${S.sprint}`, "Dilemma", "Die Gruppe trifft eine Führungsentscheidung. Es gibt keine objektiv richtige Wahl; sichtbar wird eine Abwägung.");
  $("scenarioArea").innerHTML = renderScenarioChoiceMap(sc) + `<div class="dilemma">
    <h3>${esc(sc.title)}</h3>
    <p>${esc(sc.situation)}</p>
    <div class="meta">Fokus: ${esc(sc.focus)}</div>
    <div class="choice-grid">${sc.choices.map((c, i) => `<button class="choice" onclick="applyScenarioChoice(${i})"><strong>${esc(c.label)}</strong>${esc(c.text)}<br><small><strong>Auswirkung:</strong> ${esc(c.effectText)}</small></button>`).join("")}</div>
  </div>`;
  $("phaseText").innerHTML = "";
  $("actionButtons").innerHTML = "";
  addLog(`Dilemma gezogen: ${sc.title}`);
  render();
}

function renderScenarioChoiceMap(sc, selectedIndex) {
  return `<div class="path-panel">
    <h3>Twine-ähnlicher Entscheidungsweg</h3>
    <div class="path-map">
      <div class="path-node active"><strong>Ausgangslage</strong><span>${esc(sc.title)}</span><small>${esc(sc.focus || "Schulleitungshandeln")}</small></div>
      <div class="path-arrow">→</div>
      ${sc.choices.map((c, i) => `<div class="path-node ${selectedIndex === i ? "chosen" : ""}"><strong>Weg ${String.fromCharCode(65 + i)}</strong><span>${esc(c.label)}</span></div>`).join("")}
      ${selectedIndex !== undefined ? `<div class="path-arrow">→</div><div class="path-node consequence"><strong>Folge</strong><span>${esc(sc.choices[selectedIndex].effectText)}</span></div>` : ""}
    </div>
  </div>`;
}

function applyScenarioChoice(index) {
  const sc = S.activeScenario;
  const choice = sc.choices[index];
  const result = applyScenarioEffect(choice.effect);
  addDecisionTrail("decision", "Dilemma entschieden", `${choice.label} – ${result}`);
  addLog(`Dilemmaentscheidung: ${choice.label} – ${result}`);
  $("scenarioArea").innerHTML = renderScenarioChoiceMap(sc, index) + `<div class="dilemma"><h3>Entscheidung getroffen: ${esc(choice.label)}</h3><p>${esc(choice.text)}</p><div class="calc-box"><strong>Auswirkung:</strong> ${esc(result)}</div></div>`;
  $("actionButtons").innerHTML = `<button class="primary" onclick="assignStoriesPhase()">Weiter zur Auswahl der Entwicklungsvorhaben</button>`;
  render();
}

function applyScenarioEffect(effect) {
  if (!effect) return "Keine direkte Spielwirkung.";
  if (effect.type === "addStory") {
    addScenarioStory(effect.newTitle, effect.newSP, effect.newCat);
    return `Neues Vorhaben „${effect.newTitle}“ (${effect.newSP} KP) wurde ergänzt.`;
  }
  if (effect.type === "increaseCategory") {
    const s = findBacklogStoryByCategory(effect.category);
    if (s) { s.sp += effect.increase; return `„${s.title}“ wurde um +${effect.increase} KP anspruchsvoller.`; }
    addScenarioStory(`Zusatzklärung: ${effect.category}`, effect.increase || 3, effect.category);
    return `Zusatzklärung zu „${effect.category}“ wurde ergänzt.`;
  }
  if (effect.type === "reduceCategoryAddStory") {
    const s = findBacklogStoryByCategory(effect.category);
    let msg = "";
    if (s) { const before = s.sp; s.sp = Math.max(1, s.sp - effect.reduce); msg += `„${s.title}“ wurde von ${before} auf ${s.sp} KP reduziert. `; }
    addScenarioStory(effect.newTitle, effect.newSP, effect.newCat);
    return msg + `Zusätzlich wurde „${effect.newTitle}“ (${effect.newSP} KP) ergänzt.`;
  }
  if (effect.type === "increaseCategoryGrantSolution") {
    const s = findBacklogStoryByCategory(effect.category);
    let msg = "";
    if (s) { s.sp += effect.increase; msg += `„${s.title}“ wurde um +${effect.increase} KP anspruchsvoller. `; }
    S.storedSolutions[1].push({ title: effect.solution, text: "Diese Intervention wurde durch die Dilemmaentscheidung vorbereitet." });
    return msg + `Intervention „${effect.solution}“ wurde bei Person 1 vorbereitet.`;
  }
  return "Szenarioeffekt nicht erkannt.";
}

function addScenarioStory(title, sp, category) {
  S.backlog.push({ title, sp, originalSP: sp, estimate: sp, penalty: 0, pokerSelected: false, text: "Dieses Zusatzvorhaben entsteht aus dem gewählten Dilemma.", category: category || "Schulentwicklung", image: "", id: `SC${Date.now()}_${Math.random()}`, progress: 0, blockedBy: null, owner: null });
}
function findBacklogStoryByCategory(category) {
  return S.backlog.find((s) => s.category === category) || S.backlog.find((s) => String(s.category).toLowerCase().includes(String(category).toLowerCase()));
}

/* Auswahl der Vorhaben */
function assignStoriesPhase() {
  S.phase = "assign";
  S.planningPlayer = 1;
  S.currentPlayer = 1;
  setAssignPlayer();
}
function setAssignPlayer() {
  const p = S.planningPlayer;
  if (p > S.players) return startWeeks();
  S.currentPlayer = p;
  setPhase(`Person ${p}: Vorhaben auswählen`, "Vorhaben wählen", `Person ${p} wählt ${S.storiesPerPlayer} Vorhaben für diesen Entwicklungszyklus. Die Sammlung ist nach Komplexität gruppiert.`);
  $("phaseText").innerHTML = `<div class="calc-box"><strong>Auswahl:</strong> Gehen Sie die KP-Stapel durch, öffnen Sie Karten bei Bedarf mit der Lupe und wählen Sie passende Vorhaben.</div>`;
  $("actionButtons").innerHTML = `<button class="primary" onclick="nextAssignPlayer()">Nächste Person</button>`;
  render();
}
function nextAssignPlayer() { S.planningPlayer++; setAssignPlayer(); }

function chooseStory(id) {
  const p = S.currentPlayer;
  if (S.phase !== "assign") return;
  if (S.playerStories[p].length >= S.storiesPerPlayer) return alert("Diese Person hat bereits genug Vorhaben für den Entwicklungszyklus.");
  const i = S.backlog.findIndex((s) => s.id === id);
  if (i < 0) return;
  const s = S.backlog.splice(i, 1)[0];
  s.owner = p;
  S.playerStories[p].push(s);
  addLog(`Person ${p} wählt: ${s.title}`);
  if (S.playerStories[p].length >= S.storiesPerPlayer) nextAssignPlayer();
  render();
}
function unchooseStory(id) {
  const p = S.currentPlayer;
  const i = S.playerStories[p].findIndex((s) => s.id === id);
  if (i >= 0) {
    const s = S.playerStories[p].splice(i, 1)[0];
    s.owner = null;
    S.backlog.push(s);
    addLog(`Vorhaben zurückgelegt: ${s.title}`);
    render();
  }
}

/* Wochenfluss */
function startWeeks() {
  S.phase = "week";
  S.week = 1;
  S.currentPlayer = 1;
  startPlayerTurn();
}
function startPlayerTurn() {
  if (S.week > 2) return review();
  if (S.currentPlayer > S.players) {
    if (S.week === 1) { S.week = 2; S.currentPlayer = 1; return startPlayerTurn(); }
    return review();
  }
  $("cardArea").innerHTML = "";
  $("solutionArea").innerHTML = "";
  setPhase(`Woche ${S.week} – Person ${S.currentPlayer}: Karte ziehen`, "Woche: Karte", "Zuerst wird eine Karte gezogen: Ereignis, Problem oder Intervention. Danach wird Umsetzungsenergie gewürfelt.");
  $("phaseText").innerHTML = `<div class="calc-box"><strong>Ablauf:</strong> Karte ziehen → Effekt ausführen → 5 W4 würfeln → Ergebnis genau einem eigenen offenen Vorhaben zuordnen.</div>`;
  $("actionButtons").innerHTML = `<button class="primary" onclick="drawOneCardForPlayer()">Eine Karte ziehen</button>`;
  render();
}
function drawOneCardForPlayer() {
  const r = Math.random();
  if (r < 0.34) { const e = drawEventCard(); showEvent(e); executeEvent(e); afterCardDrawn("Ereignis"); }
  else if (r < 0.67) { const p = drawProblemCard(); showProblem(p); executeProblemForPlayer(p); afterCardDrawn("Problem"); }
  else { const l = drawSolutionCard(); showSolution(l); handleDrawnSolution(l); }
}
function afterCardDrawn(type) {
  addLog(`Person ${S.currentPlayer} zieht ${type}.`);
  addDecisionTrail(type === "Problem" ? "problem" : type === "Ereignis" ? "event" : "solution", `${type} gezogen`, `Person ${S.currentPlayer}`);
  $("actionButtons").innerHTML = `<button class="primary" onclick="rollProductivity()">Umsetzungsenergie würfeln</button>`;
  setPhase("Karte ausgeführt – jetzt würfeln", "Woche: Würfeln", "Die Karte wurde ausgeführt. Jetzt wird die verfügbare Umsetzungsenergie dieser Person ermittelt.");
  render();
}
function drawEventCard() { if (!D.events.length) D.events = shuffle(EVENTS); return D.events.pop(); }
function drawProblemCard() { if (!D.problems.length) D.problems = shuffle(PROBLEMS); return D.problems.pop(); }
function drawSolutionCard() { if (!D.solutions.length) D.solutions = shuffle(SOLUTIONS); return D.solutions.pop(); }

function showEvent(e) {
  $("cardArea").innerHTML = `<div class="card event"><strong>Ereignis: ${esc(e.title)}</strong><p>${esc(e.text)}</p></div>`;
  $("currentCard").innerHTML = `<div class="card event"><strong>Ereignis</strong><p>${esc(e.title)}</p></div>`;
}
function executeEvent(e) {
  if (e.type === "progress") return applyProgressToPlayerStory(S.currentPlayer, e.progress);
  if (e.type === "addStory") { addScenarioStory("Zusatzauftrag Ministerium bearbeiten", e.sp, "Verwaltung"); return addLog("Ereignis: Zusatzvorhaben wurde ergänzt."); }
  if (e.type === "block") return blockOwnStoryByEvent(e);
  addLog(`Ereignis als Reflexionsimpuls: ${e.title}`);
}
function showProblem(p) {
  $("cardArea").innerHTML = `<div class="card problem"><strong>Problem: ${esc(p.title)}</strong><p>${esc(p.text)}</p><div class="meta">Passende Intervention: ${esc(p.match)}</div></div>`;
  $("currentCard").innerHTML = `<div class="card problem"><strong>Problem</strong><p>${esc(p.title)}</p></div>`;
}
function executeProblemForPlayer(problem) {
  const arr = S.playerStories[S.currentPlayer].filter((s) => !s.blockedBy);
  if (!arr.length) return addLog(`Problem „${problem.title}“ konnte kein eigenes offenes Vorhaben blockieren.`);
  const s = arr.find((x) => problem.tags && problem.tags.includes(x.category)) || arr[0];
  blockPlayerStory(S.currentPlayer, s.id, problem);
  addLog(`Problem „${problem.title}“ blockiert „${s.title}“.`);
}
function blockPlayerStory(player, id, problem) {
  const i = S.playerStories[player].findIndex((s) => s.id === id);
  if (i >= 0) {
    const s = S.playerStories[player].splice(i, 1)[0];
    s.blockedBy = { ...problem };
    S.blocked.push(s);
  }
}
function showSolution(l) {
  $("cardArea").innerHTML = `<div class="card solution"><strong>Intervention: ${esc(l.title)}</strong><p>${esc(l.text)}</p></div>`;
  $("currentCard").innerHTML = `<div class="card solution"><strong>Intervention</strong><p>${esc(l.title)}</p></div>`;
}
function handleDrawnSolution(solution) {
  const matches = S.blocked.filter((s) => s.blockedBy && s.blockedBy.match === solution.title);
  $("solutionArea").innerHTML = `<div class="solution-choice"><strong>Gezogene Intervention: ${esc(solution.title)}</strong><p>Sie kann sofort auf eine passende Blockade angewendet oder bei Person ${S.currentPlayer} gespeichert werden.</p>
    ${matches.length ? matches.map((s) => `<button class="good" data-solve="${esc(s.id)}">„${esc(s.title)}“ lösen (${esc(s.blockedBy.title)}, Person ${s.owner})</button>`).join(" ") : "<p>Aktuell gibt es keine passende Blockade.</p>"}
    <button id="storeSolutionBtn">Intervention speichern</button></div>`;
  $("solutionArea").querySelectorAll("[data-solve]").forEach((btn) => btn.addEventListener("click", () => { solveBlockedStory(btn.dataset.solve, solution); afterCardDrawn("Intervention"); }));
  $("storeSolutionBtn").addEventListener("click", () => {
    S.storedSolutions[S.currentPlayer].push(solution);
    addLog(`Person ${S.currentPlayer} speichert Intervention: ${solution.title}`);
    $("solutionArea").innerHTML = `<div class="card solution"><strong>Intervention gespeichert</strong><p>${esc(solution.title)}</p></div>`;
    afterCardDrawn("Intervention");
  });
}
function solveBlockedStory(id, solution) {
  const idx = S.blocked.findIndex((s) => s.id === id);
  if (idx < 0) return;
  const s = S.blocked[idx];
  if (!s.blockedBy || s.blockedBy.match !== solution.title) return alert("Diese Intervention passt logisch nicht zu diesem Problem.");
  const problemTitle = s.blockedBy.title;
  s.blockedBy = null;
  const owner = s.owner || S.currentPlayer;
  S.playerStories[owner].push(S.blocked.splice(idx, 1)[0]);
  addLog(`Intervention „${solution.title}“ löst „${problemTitle}“ bei „${s.title}“.`);
  addDecisionTrail("solution", "Intervention eingesetzt", `${solution.title} → ${s.title}`);
  render();
}
function useStoredSolution(player, index) {
  const solution = S.storedSolutions[player][index];
  if (!solution) return;
  const matches = S.blocked.filter((s) => s.blockedBy && s.blockedBy.match === solution.title);
  if (!matches.length) return alert("Für diese Intervention gibt es aktuell keine passende Blockade.");
  $("solutionArea").innerHTML = `<div class="solution-choice"><strong>Vorbereitete Intervention einsetzen: ${esc(solution.title)}</strong>${matches.map((s) => `<button class="good" data-solve-stored="${esc(s.id)}">„${esc(s.title)}“ lösen (${esc(s.blockedBy.title)}, Person ${s.owner})</button>`).join(" ")}</div>`;
  $("solutionArea").querySelectorAll("[data-solve-stored]").forEach((btn) => btn.addEventListener("click", () => {
    S.storedSolutions[player].splice(index, 1);
    solveBlockedStory(btn.dataset.solveStored, solution);
  }));
}

function rollProductivity() {
  const dice = [];
  let sum = 0;
  for (let i = 0; i < 5; i++) { const r = 1 + Math.floor(Math.random() * 4); dice.push(r); sum += r; }
  S.currentRoll = sum;
  $("currentCard").innerHTML += `<div class="calc-box"><strong>Woche ${S.week}, Person ${S.currentPlayer}: Umsetzungsenergie</strong><div class="dice-row">${dice.map((d) => `<span class="die">${d}</span>`).join("")}</div><strong>Summe:</strong> ${sum} KP</div>`;
  setPhase("Umsetzungsenergie zuordnen", "Woche: Würfeln", `Person ${S.currentPlayer} hat ${sum} KP gewürfelt. Diese KP müssen einem eigenen offenen Vorhaben zugeordnet werden.`);
  const openOwn = S.playerStories[S.currentPlayer].filter((s) => !s.blockedBy);
  if (!openOwn.length) {
    addLog(`Person ${S.currentPlayer} hat kein offenes eigenes Vorhaben. Umsetzungsenergie verfällt.`);
    $("phaseText").innerHTML = `<div class="calc-box"><strong>Keine Zuordnung möglich:</strong> Die Umsetzungsenergie verfällt.</div>`;
    $("actionButtons").innerHTML = `<button class="primary" onclick="nextPlayerTurn()">Nächste Person</button>`;
  } else {
    S.awaitingAssign = true;
    $("phaseText").innerHTML = `<div class="calc-box"><strong>Zuordnung:</strong> ${sum} KP genau einem eigenen offenen Vorhaben zuordnen.</div>`;
    $("actionButtons").innerHTML = `<button onclick="nextPlayerTurn()">Umsetzungsenergie verfallen lassen</button>`;
  }
  render();
}
function assignRollToOwnedStory(id) {
  if (!S.awaitingAssign) return;
  const arr = S.playerStories[S.currentPlayer];
  const i = arr.findIndex((s) => s.id === id);
  if (i < 0) return;
  const s = arr[i];
  const before = s.progress;
  s.progress += S.currentRoll;
  const over = Math.max(0, s.progress - s.sp);
  if (s.progress >= s.sp) {
    s.progress = s.sp;
    const done = arr.splice(i, 1)[0];
    S.done.push(done);
    S.erledigteSP += done.sp;
    addLog(`Person ${S.currentPlayer}: ${S.currentRoll} KP auf „${done.title}“ angewendet. Vorhaben abgeschlossen.`);
  } else {
    addLog(`Person ${S.currentPlayer}: ${S.currentRoll} KP auf „${s.title}“ angewendet. Fortschritt ${before} → ${s.progress}/${s.sp}.`);
  }
  $("phaseText").innerHTML = `<div class="calc-box"><strong>Zuordnung abgeschlossen</strong><br>Vorhaben: ${esc(s.title)}<br>Fortschritt vorher: ${before}/${s.sp}<br>Zugeordnet: ${S.currentRoll} KP<br>Überhang verfällt: ${over} KP</div>`;
  S.awaitingAssign = false;
  $("actionButtons").innerHTML = `<button class="primary" onclick="nextPlayerTurn()">Nächste Person</button>`;
  render();
}
function nextPlayerTurn() { S.currentPlayer++; startPlayerTurn(); }
function applyProgressToPlayerStory(player, points) {
  const arr = S.playerStories[player].filter((s) => !s.blockedBy);
  if (!arr.length) return addLog("Ereignis-Fortschritt konnte nicht angewendet werden.");
  let s = arr[0];
  for (const cand of arr) if ((cand.sp - cand.progress) < (s.sp - s.progress)) s = cand;
  s.progress += points;
  if (s.progress >= s.sp) {
    s.progress = s.sp;
    S.playerStories[player] = S.playerStories[player].filter((x) => x.id !== s.id);
    S.done.push(s);
    S.erledigteSP += s.sp;
  }
  addLog(`Ereignis-Fortschritt: ${points} KP auf ${s.title}.`);
}
function blockOwnStoryByEvent(e) {
  const arr = S.playerStories[S.currentPlayer].filter((s) => !s.blockedBy);
  if (!arr.length) return addLog("Ereignis-Blockade konnte kein eigenes Vorhaben blockieren.");
  const s = arr.find((x) => x.category === "Digitalisierung") || arr[0];
  blockPlayerStory(S.currentPlayer, s.id, { title: e.title, match: e.match || "Verantwortlichkeiten klären", text: e.text });
}

/* Review / Retrospektive */
function review() {
  S.phase = "review";
  addDecisionTrail("review", "Review gestartet", "Ergebnisse und Wirkung prüfen");
  setPhase("Review: Ergebnisse und Wirkung prüfen", "Review", "Angefangene Arbeit ist noch keine wirksame Schulentwicklung.");
  $("phaseText").innerHTML = `<div class="calc-box"><strong>Review-Fragen:</strong><ul><li>Welche Vorhaben sind wirklich abgeschlossen?</li><li>Welche Vorhaben blieben blockiert und warum?</li><li>Welche Aufwandsklärungen waren unrealistisch?</li><li>Welche Führungsentscheidung hatte die stärkste Wirkung?</li></ul></div>`;
  $("actionButtons").innerHTML = `<button class="primary" onclick="retro()">Retrospektive starten</button>`;
  render();
}
function retro() {
  setPhase("Retrospektive: Arbeitsweise verbessern", "Retrospektive", "Retrospektive bedeutet Systemlernen statt Schuldklärung.");
  $("phaseText").innerHTML = `<div class="calc-box"><strong>Retrospektivenfragen:</strong><ul><li>Haben wir zu viel parallel begonnen?</li><li>Haben wir Blockaden aktiv bearbeitet?</li><li>Wurden Interventionen teamübergreifend genutzt?</li><li>Was ändern wir im nächsten Entwicklungszyklus konkret?</li></ul></div>`;
  $("actionButtons").innerHTML = `<button onclick="retroChoice(1)">WIP stärker begrenzen</button><button onclick="retroChoice(2)">Kommunikation früher klären</button><button onclick="retroChoice(3)">Vorhaben kleiner schneiden</button><button onclick="retroChoice(4)">Sammlung härter priorisieren</button>`;
  render();
}
function retroChoice(n) {
  const labels = { 1: "WIP wird stärker begrenzt.", 2: "Kommunikation wird früher geklärt.", 3: "Vorhaben werden kleiner geschnitten.", 4: "Sammlung wird härter priorisiert." };
  addLog(`Retrospektive: ${labels[n]}`);
  if (S.sprint >= S.maxSprints) return finish();
  for (let p = 1; p <= S.players; p++) {
    S.playerStories[p].forEach((s) => { s.owner = null; S.backlog.push(s); });
    S.playerStories[p] = [];
  }
  S.sprint++;
  S.week = 0;
  S.currentPlayer = null;
  S.planningPlayer = 1;
  showScenario();
}
function finish() {
  setPhase("Abschlussauswertung", "Retrospektive", "Die Simulation ist abgeschlossen.");
  const totalPenalty = S.allStories.reduce((a, s) => a + (s.penalty || 0), 0);
  $("phaseText").innerHTML = `<div class="transfer-box"><h3>Auswertung</h3><p>Abgeschlossene KP: ${S.erledigteSP} · Offene KP: ${openSP()} · Blockierte Vorhaben: ${S.blocked.length} · zusätzlicher Klärungsaufwand: ${totalPenalty} KP</p><ul><li>Welche Vorhaben wurden zu groß gewählt?</li><li>Wann war eine vorbereitete Intervention wertvoll?</li><li>Welche Blockaden hätten teamübergreifend gelöst werden können?</li><li>Welche Führungsroutine testen Sie in Ihrer Schule?</li></ul></div>`;
  $("actionButtons").innerHTML = `<button class="primary" onclick="resetGame()">Neu starten</button>`;
  render();
}

/* Darstellung */
function getComplexities() { return Array.from(new Set(S.backlog.map((s) => s.sp))).sort((a, b) => a - b); }
function ensureStackIndices() {
  if (!S.stackIndices) S.stackIndices = {};
  getComplexities().forEach((sp) => {
    const count = S.backlog.filter((s) => s.sp === sp).length;
    S.stackIndices[sp] = Math.max(0, Math.min(S.stackIndices[sp] || 0, Math.max(0, count - 1)));
  });
}
function moveStack(sp, dir) {
  const cards = S.backlog.filter((s) => s.sp === sp);
  if (!cards.length) return;
  S.stackIndices[sp] = ((S.stackIndices[sp] || 0) + dir + cards.length) % cards.length;
  render();
}
function renderBacklogAll() {
  ensureStackIndices();
  const complexities = getComplexities();
  if (!complexities.length) return `<p class="side-box">Keine Vorhaben in der Sammlung.</p>`;
  return `<div class="complexity-backlog">${complexities.map(renderComplexityStack).join("")}</div>`;
}
function renderComplexityStack(sp) {
  const cards = S.backlog.filter((s) => s.sp === sp);
  const idx = S.stackIndices[sp] || 0;
  const s = cards[idx];
  const canChoose = S.phase === "assign" && S.playerStories[S.currentPlayer]?.length < S.storiesPerPlayer;
  return `<div class="complexity-stack">
    <div class="complexity-stack-header"><strong>${sp} KP-Stapel</strong><span>${idx + 1} von ${cards.length}</span></div>
    <div class="complexity-stack-body">
      <button class="stack-arrow" onclick="moveStack(${sp}, -1)">←</button>
      <div class="mini-card-frame">${renderMiniFullCard(s, canChoose)}</div>
      <button class="stack-arrow" onclick="moveStack(${sp}, 1)">→</button>
    </div>
  </div>`;
}
function renderMiniFullCard(s, canChoose) {
  const penalty = s.pokerSelected ? (s.penalty ? ` · Aufwandsklärung: ${s.estimate}/${s.originalSP}, +${s.penalty}` : ` · Aufwandsklärung: ohne Zusatzaufwand`) : "";
  return `<div class="mini-full-card">
    ${s.image ? `<img src="${esc(s.image)}" alt="${esc(s.title)}">` : ""}
    <strong>${esc(s.title)}</strong>
    <p>${esc(s.text)}</p>
    <div class="meta">${s.sp} KP · ${esc(s.category)} · Fortschritt ${s.progress}/${s.sp}${penalty}</div>
    <div class="mini-actions"><button class="zoom-btn" onclick="openZoom('${s.id}')">🔍</button>${canChoose ? `<button class="primary small" onclick="chooseStory('${s.id}')">Person ${S.currentPlayer} zuordnen</button>` : ""}</div>
  </div>`;
}
function renderPlayerStories() {
  let html = "";
  for (let p = 1; p <= S.players; p++) {
    html += `<div class="player-section ${p === S.currentPlayer ? "current" : ""}"><h4>Person ${p}</h4>`;
    html += S.playerStories[p].length ? S.playerStories[p].map((s) => renderStoryCard(s, "player")).join("") : `<p>Keine Vorhaben.</p>`;
    html += `</div>`;
  }
  return html;
}
function renderStoryCard(s, loc) {
  const assign = loc === "player" && S.awaitingAssign && s.owner === S.currentPlayer && !s.blockedBy ? `<button class="primary small" onclick="assignRollToOwnedStory('${s.id}')">${S.currentRoll} KP hier zuordnen</button>` : "";
  return `<div class="card ${s.blockedBy ? "problem" : ""}">
    ${s.image ? `<img src="${esc(s.image)}" alt="${esc(s.title)}">` : ""}
    <strong>${esc(s.title)}</strong>
    <p>${esc(s.text)}</p>
    <div class="meta">${s.sp} KP · ${esc(s.category)} · Person ${s.owner || "-"} · Fortschritt ${s.progress}/${s.sp}${s.blockedBy ? ` · Blockiert: ${esc(s.blockedBy.title)} · passende Intervention: ${esc(s.blockedBy.match)}` : ""}</div>
    <button class="zoom-btn" onclick="openZoom('${s.id}')">🔍</button> ${assign}
  </div>`;
}
function renderDecisionPathPanel() {
  if (!S?.pokerDone) return "";
  const trail = (S.decisionTrail || []).slice(0, 8);
  return `<div class="path-panel"><h3>Entscheidungswege sichtbar machen</h3>
    <div class="path-map">
      <div class="path-node ${S.phase === "scenario" ? "active" : ""}"><strong>1. Dilemma</strong><span>Führungsabwägung</span></div><div class="path-arrow">→</div>
      <div class="path-node ${S.phase === "assign" ? "active" : ""}"><strong>2. Vorhaben wählen</strong><span>Priorisierung</span></div><div class="path-arrow">→</div>
      <div class="path-node ${S.phase === "week" ? "active" : ""}"><strong>3. Umsetzung</strong><span>Karte · Intervention · KP</span></div><div class="path-arrow">→</div>
      <div class="path-node ${S.phase === "review" ? "active" : ""}"><strong>4. Review</strong><span>Wirkung prüfen</span></div>
    </div>
    <div class="decision-trail">${trail.length ? trail.map((x) => `<div class="trail-item ${esc(x.type)}"><strong>${esc(x.title)}</strong><br><span>${esc(x.detail)}</span><br><small>Entwicklungszyklus ${x.sprint}${x.week ? ` · Woche ${x.week}` : ""}${x.player ? ` · Person ${x.player}` : ""}</small></div>`).join("") : `<p>Noch keine Entscheidungen protokolliert.</p>`}</div>
  </div>`;
}
function renderDashboard() {
  const totalPenalty = S?.allStories ? S.allStories.reduce((a, s) => a + (s.penalty || 0), 0) : 0;
  const items = S?.pokerDone ? [
    ["Entwicklungszyklus", `${S.sprint}/${S.maxSprints}`],
    ["Woche", S.week ? `${S.week}/2` : "Planung"],
    ["Aktive Person", S.currentPlayer || "-"],
    ["Vorhaben/Person", S.storiesPerPlayer],
    ["Offene KP", openSP()],
    ["Abgeschlossene KP", S.erledigteSP],
    ["Blockierte Vorhaben", S.blocked.length],
    ["Klärungsaufwand", totalPenalty]
  ] : [
    ["Aufwandsklärung", `${Math.min(S.pokerIndex + 1, S.pokerStories.length)}/${S.pokerStories.length}`],
    ["Klärungsaufwand", totalPenalty]
  ];
  $("dashboard").innerHTML = items.map(([k, v]) => `<div class="metric"><span>${k}</span><strong>${v}</strong></div>`).join("");
}
function renderStoredSolutions() {
  if (!S?.pokerDone) return $("storedSolutionsBox").innerHTML = "";
  let html = "";
  for (let p = 1; p <= S.players; p++) {
    html += `<div class="side-box"><strong>Person ${p}</strong><br>`;
    html += S.storedSolutions[p].length ? S.storedSolutions[p].map((sol, i) => `<button class="good small" onclick="useStoredSolution(${p}, ${i})">${esc(sol.title)}</button>`).join(" ") : `<span>Keine vorbereitete Handlungsoption.</span>`;
    html += `</div>`;
  }
  $("storedSolutionsBox").innerHTML = html;
}
function renderLog() { $("logBox").innerHTML = S?.log.length ? S.log.map((x, i) => `${S.log.length - i}. ${esc(x)}`).join("<br>") : "Noch keine Einträge."; }
function render() {
  if (!S) return;
  if (S.pokerDone) {
    $("backlog").innerHTML = renderBacklogAll();
    $("playerStories").innerHTML = renderPlayerStories();
    $("blocked").innerHTML = S.blocked.length ? S.blocked.map((s) => renderStoryCard(s, "blocked")).join("") : `<p>Keine blockierten Vorhaben.</p>`;
    $("done").innerHTML = S.done.length ? S.done.map((s) => renderStoryCard(s, "done")).join("") : `<p>Noch nichts abgeschlossen.</p>`;
    $("decisionPathArea").innerHTML = renderDecisionPathPanel();
  }
  renderDashboard();
  renderStoredSolutions();
  renderLog();
}

/* Zoom */
function openPokerZoom() {
  const s = S.pokerStories[S.pokerIndex];
  if (!s) return;
  openZoomForStory(s, s.estimate !== null ? `Schätzung: ${s.estimate} KP · Referenzwert: ${s.originalSP} KP · Klärungsaufwand: +${s.penalty} KP` : "Referenzwert noch verdeckt");
}
function openZoom(id) {
  const all = [...S.backlog, ...S.blocked, ...S.done, ...Object.values(S.playerStories).flat()];
  const s = all.find((x) => x.id === id);
  if (!s) return;
  openZoomForStory(s);
}
function openZoomForStory(s, extra = "") {
  $("zoomCard").innerHTML = `${s.image ? `<img src="${esc(s.image)}" alt="${esc(s.title)}">` : ""}
    <h2>${esc(s.title)}</h2><p>${esc(s.text)}</p>
    <div class="meta">${s.sp} KP · ${esc(s.category)} · Fortschritt ${s.progress || 0}/${s.sp}<br>${esc(extra || (s.pokerSelected ? "In der Aufwandsklärung berücksichtigt" : "Nicht in der Aufwandsklärung"))}${s.blockedBy ? `<br>Blockiert durch: ${esc(s.blockedBy.title)} · passende Intervention: ${esc(s.blockedBy.match)}` : ""}</div>
    <button class="zoom-close" onclick="closeZoom()">Schließen</button>`;
  $("zoomOverlay").classList.add("show");
  $("zoomOverlay").setAttribute("aria-hidden", "false");
}
function closeZoom(event) {
  if (event && event.target.id !== "zoomOverlay") return;
  $("zoomOverlay").classList.remove("show");
  $("zoomOverlay").setAttribute("aria-hidden", "true");
}

document.addEventListener("DOMContentLoaded", () => { bind(); window.__APP_READY__ = true; });
