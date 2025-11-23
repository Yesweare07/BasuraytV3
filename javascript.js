// Robust BASURAYT script.js
// Paste this whole file (it keeps your original logic and adds defensive checks + Premium handling)

(function () {
  // --- Helper: safe query that logs missing elements ---
  function $id(id) {
    const el = document.getElementById(id);
    if (!el) console.warn(`[BASURAYT] element not found: #${id}`);
    return el;
  }

  // --- Elements (may be missing if script runs early) ---
  let camera = $id("camera");
  let captureBtn = $id("capture");
  let result = $id("result");
  let tipDisplay = $id("tip");
  let resetBtn = $id("reset");
  let startBtn = $id("start-btn");
  let usernameInput = $id("username");
  let cameraSection = $id("camera-section");

  let scoreboard = $id("scoreboard");
  let howto = $id("howto");
  let wastetrack = $id("wastetrack");
  let scoreList = $id("score-list");
  let wasteList = $id("waste-list");

  let toggleScoreboard = $id("toggle-scoreboard");
  let toggleHowto = $id("toggle-howto");
  let toggleWastetrack = $id("toggle-wastetrack");
  let closeBtns = document.querySelectorAll(".close-btn");

  // --- App state ---
  let username = "";
  let totalPoints = 0;
  let scores = JSON.parse(localStorage.getItem("scores")) || {};
  let wasteHistory = [];

  // Premium state persisted
  window.isPremiumActive = localStorage.getItem("premium_active") === "true";

  // --- Wait-until-ready utility for elements that might load later ---
  function whenReady(selectorOrEl, cb, maxTries = 50, interval = 50) {
    let tries = 0;
    const resolveEl = () =>
      typeof selectorOrEl === "string"
        ? document.getElementById(selectorOrEl)
        : selectorOrEl;
    return new Promise((resolve) => {
      const timer = setInterval(() => {
        tries++;
        const el = resolveEl();
        if (el) {
          clearInterval(timer);
          try { cb(el); } catch (e) { console.error(e); }
          resolve(el);
        } else if (tries >= maxTries) {
          clearInterval(timer);
          resolve(null);
        }
      }, interval);
    });
  }

  // --- Camera start (FORCE BACK CAMERA + device label fallback + general fallback) ---
  async function startCamera() {
    try {
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        console.warn("[BASURAYT] MediaDevices API not supported.");
        return;
      }

      // Stop previous stream if any
      if (camera && camera.srcObject) {
        try {
          camera.srcObject.getTracks().forEach(track => track.stop());
        } catch (e) {
          console.warn("[BASURAYT] failed to stop old tracks:", e);
        }
      }

      let stream = null;

      // 1) Try strict facingMode exact environment (most direct on mobile)
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { exact: "environment" } },
          audio: false
        });
        console.log("[BASURAYT] Back camera activated via facingMode exact.");
      } catch (err) {
        console.warn("[BASURAYT] facingMode exact failed:", err);

        // 2) Try to enumerate devices and pick a device whose label contains 'back'/'rear' etc.
        try {
          const devices = await navigator.mediaDevices.enumerateDevices();
          const videoDevices = devices.filter(d => d.kind === "videoinput");
          // Try to find a device with label indicating back camera
          const backDevice = videoDevices.find(d =>
            d.label && (d.label.toLowerCase().includes("back") ||
                        d.label.toLowerCase().includes("rear") ||
                        d.label.toLowerCase().includes("environment") ||
                        d.label.toLowerCase().includes("camera 1"))
          );

          if (backDevice) {
            try {
              stream = await navigator.mediaDevices.getUserMedia({
                video: { deviceId: { exact: backDevice.deviceId } },
                audio: false
              });
              console.log("[BASURAYT] Back camera activated via deviceId:", backDevice.label);
            } catch (err2) {
              console.warn("[BASURAYT] deviceId getUserMedia failed:", err2);
            }
          }
        } catch (enumErr) {
          console.warn("[BASURAYT] enumerateDevices failed or not allowed yet:", enumErr);
        }

        // 3) Final fallback: any available camera
        if (!stream) {
          try {
            stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
            console.log("[BASURAYT] Default camera activated as fallback.");
          } catch (fallbackErr) {
            console.error("[BASURAYT] fallback getUserMedia failed:", fallbackErr);
            throw fallbackErr;
          }
        }
      }

      camera = camera || $id("camera");
      if (camera) {
        camera.srcObject = stream;
        // try to play (some browsers require explicit play)
        try { await camera.play(); } catch (e) { /* ignore */ }
      }
    } catch (err) {
      console.error("[BASURAYT] Camera fatal error:", err);
      // Friendly user message
      alert("Camera not accessible. Please allow camera permissions or try another device.");
    }
  }

  // --- Speech ---
  function speak(text) {
    try {
      const msg = new SpeechSynthesisUtterance(text);
      msg.lang = "en-US";
      speechSynthesis.speak(msg);
    } catch (e) {
      console.warn("[BASURAYT] speak() failed:", e);
    }
  }

  // --- Emoji spawn ---
  function spawnEmojis(symbol, color) {
    try {
      const appRect = document.querySelector(".app")?.getBoundingClientRect();
      if (!appRect) return;
      const count = Math.floor(Math.random() * 4) + 3;
      for (let i = 0; i < count; i++) {
        const emoji = document.createElement("div");
        emoji.className = "emoji";
        emoji.textContent = symbol;
        emoji.style.color = color;
        // position relative to viewport (not perfect but works)
        emoji.style.position = "fixed";
        emoji.style.left = (appRect.left + Math.random() * Math.max(0, appRect.width - 40)) + "px";
        emoji.style.top = (appRect.top + appRect.height - 60 + Math.random() * 20) + "px";
        emoji.style.fontSize = "22px";
        emoji.style.zIndex = 3000;
        document.body.appendChild(emoji);
        setTimeout(() => emoji.remove(), 2000);
      }
    } catch (e) {
      console.warn("[BASURAYT] spawnEmojis error:", e);
    }
  }

  // --- Tips ---
  const tips = {
    nonbiodegradable: [
      "Pollutes land and water: These wastes accumulate in dumpsites, rivers, and oceans.",
      "Increases carbon emissions: From burning nonbiodegradable waste.",
      "Harms wildlife: Animals may mistake plastic for food.",
      "Contributes to flooding: When trash blocks waterways."
    ],
    biodegradable: [
      "Enriches the soil: Decomposition adds nutrients that help plants grow.",
      "Promotes balance in nature: Helps maintain healthy ecosystems.",
      "Supports composting: Can be turned into natural fertilizer.",
      "Reduces pollution: Less waste goes to landfills."
    ],
    recyclable: [
      "Reduces landfill waste: Less garbage ends up in dumpsites.",
      "Saves energy and resources: Recycling uses less energy than producing new materials.",
      "Decreases pollution: Less burning and waste disposal mean cleaner air and water.",
      "Encourages creativity: Recycled materials can be used in art and innovation projects."
    ]
  };

  function getRandomTip(category) {
    const arr = tips[category] || [];
    return arr[Math.floor(Math.random() * arr.length)] || "";
  }

  // --- Scoreboard (FIXED) ---
  function updateScoreboard() {
    scoreList = scoreList || $id("score-list");
    if (!scoreList) return;

    scoreList.innerHTML = "";

    // Ensure username saved to scores before sorting
    if (username && typeof totalPoints === "number") {
      scores[username] = totalPoints;
      try {
        localStorage.setItem("scores", JSON.stringify(scores));
      } catch (e) {
        console.warn("[BASURAYT] could not save scores to localStorage:", e);
      }
    }

    const sortedScores = Object.entries(scores)
      .sort((a, b) => b[1] - a[1]);

    sortedScores.forEach(([user, points], index) => {
      const li = document.createElement("li");
      li.textContent = `#${index + 1} ${user}: ${points} pts`;
      if (user === username) {
        li.style.color = "#f1c40f";
        li.style.fontWeight = "bold";
      }
      scoreList.appendChild(li);
    });
  }

  // --- Waste track ---
  function updateWasteTrack() {
    wasteList = wasteList || $id("waste-list");
    if (!wasteList) return;
    wasteList.innerHTML = "";
    wasteHistory.forEach((item, i) => {
      const li = document.createElement("li");
      li.textContent = `${i + 1}. ${item}`;
      wasteList.appendChild(li);
    });
  }

  // --- Scanning behavior (use window.isPremiumActive) ---
  async function handleScanClick() {
    try {
      const types = ["nonbiodegradable", "biodegradable", "recyclable"];
      const type = types[Math.floor(Math.random() * types.length)];
      let emoji = "", color = "";
      if (type === "nonbiodegradable") { emoji = "😡"; color = "red"; speak("Non biodegradable"); }
      else if (type === "biodegradable") { emoji = "🙂"; color = "green"; speak("Biodegradable"); }
      else { emoji = "🔄"; color = "blue"; speak("Recyclable"); }

      result = result || $id("result");
      tipDisplay = tipDisplay || $id("tip");

      if (result) result.textContent = `Scanned: ${type.charAt(0).toUpperCase() + type.slice(1)}`;
      if (tipDisplay) tipDisplay.textContent = getRandomTip(type);
      spawnEmojis(emoji, color);

      // Points: check premium flag
      const earned = window.isPremiumActive ? 2 : 1;
      totalPoints += earned;

      // persist user's points
      if (username) {
        scores[username] = totalPoints;
        try {
          localStorage.setItem("scores", JSON.stringify(scores));
        } catch (e) {
          console.warn("[BASURAYT] could not save scores:", e);
        }
      }

      wasteHistory.push(type);
      updateScoreboard();
      updateWasteTrack();
    } catch (e) {
      console.error("[BASURAYT] scan error:", e);
    }
  }

  // --- Reset points ---
  function handleReset() {
    totalPoints = 0;
    if (username) {
      scores[username] = 0;
      try {
        localStorage.setItem("scores", JSON.stringify(scores));
      } catch (e) {
        console.warn("[BASURAYT] could not save scores:", e);
      }
    }
    wasteHistory = [];
    result = result || $id("result");
    tipDisplay = tipDisplay || $id("tip");
    if (result) result.textContent = "Points reset!";
    if (tipDisplay) tipDisplay.textContent = "";
    speak("Points reset to zero");
    updateScoreboard();
    updateWasteTrack();
  }

  // --- Sidebar toggle helpers ---
  function attachSidebarToggles() {
    toggleScoreboard = toggleScoreboard || $id("toggle-scoreboard");
    toggleHowto = toggleHowto || $id("toggle-howto");
    toggleWastetrack = toggleWastetrack || $id("toggle-wastetrack");
    scoreboard = scoreboard || $id("scoreboard");
    howto = howto || $id("howto");
    wastetrack = wastetrack || $id("wastetrack");

    if (toggleScoreboard && scoreboard) toggleScoreboard.onclick = () => scoreboard.classList.add("visible");
    if (toggleHowto && howto) toggleHowto.onclick = () => howto.classList.add("visible");
    if (toggleWastetrack && wastetrack) toggleWastetrack.onclick = () => wastetrack.classList.add("visible");

    closeBtns = closeBtns || document.querySelectorAll(".close-btn");
    closeBtns.forEach(btn => {
      btn.addEventListener("click", e => {
        const target = e.target.dataset.target;
        if (target) {
          const el = document.getElementById(target);
          if (el) el.classList.remove("visible");
        }
      });
    });
  }

  // --- Premium UI + persistence (adds controls if missing) ---
  function ensurePremiumControls() {
    const premiumSidebar = $id("premium");
    if (!premiumSidebar) {
      console.warn("[BASURAYT] premium sidebar not found; creating a small floating control instead.");
      // create small floating control
      let floating = $id("basurayt-premium-float");
      if (!floating) {
        floating = document.createElement("div");
        floating.id = "basurayt-premium-float";
        floating.style.position = "fixed";
        floating.style.bottom = "12px";
        floating.style.right = "12px";
        floating.style.zIndex = "2000";
        document.body.appendChild(floating);
      }
      const btn = document.createElement("button");
      btn.id = "activate-premium";
      btn.style.padding = "10px 16px";
      btn.style.borderRadius = "22px";
      btn.style.border = "none";
      btn.style.cursor = "pointer";
      floating.appendChild(btn);

      const status = document.createElement("div");
      status.id = "premium-status";
      status.style.fontSize = "12px";
      status.style.marginTop = "6px";
      floating.appendChild(status);
    } else {
      // add control inside premium sidebar if missing
      let controlWrap = premiumSidebar.querySelector(".premium-control-wrap");
      if (!controlWrap) {
        controlWrap = document.createElement("div");
        controlWrap.className = "premium-control-wrap";
        controlWrap.style.textAlign = "center";
        controlWrap.style.marginTop = "12px";
        premiumSidebar.appendChild(controlWrap);
      }
      if (!premiumSidebar.querySelector("#activate-premium")) {
        const btn = document.createElement("button");
        btn.id = "activate-premium";
        btn.style.padding = "10px 18px";
        btn.style.borderRadius = "22px";
        btn.style.border = "none";
        btn.style.cursor = "pointer";
        controlWrap.appendChild(btn);
      }
      if (!premiumSidebar.querySelector("#premium-status")) {
        const status = document.createElement("p");
        status.id = "premium-status";
        status.style.marginTop = "8px";
        controlWrap.appendChild(status);
      }
    }

    // Update UI based on saved state
    const activateBtn = $id("activate-premium");
    const statusText = $id("premium-status");
    function updateUI() {
      if (!activateBtn || !statusText) return;
      if (window.isPremiumActive) {
        statusText.textContent = "Premium: ON";
        statusText.style.color = "#f1c40f";
        activateBtn.textContent = "🔒 Deactivate Premium";
        activateBtn.style.background = "linear-gradient(135deg, #27ae60, #2ecc71)";
        activateBtn.style.color = "#fff";
        activateBtn.style.boxShadow = "0 6px 18px rgba(39,174,96,0.25)";
      } else {
        statusText.textContent = "Premium: OFF";
        statusText.style.color = "#2ecc71";
        activateBtn.textContent = "🔓 Activate Premium";
        activateBtn.style.background = "linear-gradient(135deg, #f1c40f, #e67e22)";
        activateBtn.style.color = "#fff";
        activateBtn.style.boxShadow = "none";
      }
    }
    updateUI();

    // Attach toggle
    whenReady("activate-premium", (btn) => {
      btn.addEventListener("click", () => {
        window.isPremiumActive = !window.isPremiumActive;
        localStorage.setItem("premium_active", window.isPremiumActive ? "true" : "false");
        updateUI();
        speak(window.isPremiumActive ? "Premium activated! Double points enabled." : "Premium deactivated.");
      });
    });
  }

  // --- Wire up initial handlers after DOM ready ---
  document.addEventListener("DOMContentLoaded", async () => {
    // refresh refs (in case script ran before DOM)
    camera = camera || $id("camera");
    captureBtn = captureBtn || $id("capture");
    result = result || $id("result");
    tipDisplay = tipDisplay || $id("tip");
    resetBtn = resetBtn || $id("reset");
    startBtn = startBtn || $id("start-btn");
    usernameInput = usernameInput || $id("username");
    cameraSection = cameraSection || $id("camera-section");

    scoreboard = scoreboard || $id("scoreboard");
    howto = howto || $id("howto");
    wastetrack = wastetrack || $id("wastetrack");
    scoreList = scoreList || $id("score-list");
    wasteList = wasteList || $id("waste-list");

    toggleScoreboard = toggleScoreboard || $id("toggle-scoreboard");
    toggleHowto = toggleHowto || $id("toggle-howto");
    toggleWastetrack = toggleWastetrack || $id("toggle-wastetrack");

    // Attach start/login button
    if (startBtn) {
      startBtn.addEventListener("click", () => {
        username = (usernameInput && usernameInput.value) ? usernameInput.value.trim() : username;
        if (!username) {
          alert("Please enter your name first!");
          return;
        }
        const loginSection = $id("login-section");
        if (loginSection) loginSection.style.display = "none";
        if (cameraSection) cameraSection.style.display = "block";

        // Ensure user exists in scores
        if (!scores[username]) {
          scores[username] = 0;
          try { localStorage.setItem("scores", JSON.stringify(scores)); } catch (e) { /* ignore */ }
        }

        totalPoints = scores[username] || 0;
        // Start camera AFTER preparing user/score
        startCamera();

        updateScoreboard();
      });
    } else {
      // Some of your HTML uses login-btn instead of start-btn — attach that too if present
      const loginBtn = $id("login-btn");
      if (loginBtn) {
        loginBtn.addEventListener("click", () => {
          username = (usernameInput && usernameInput.value) ? usernameInput.value.trim() : username;
          const pass = ($id("password") && $id("password").value) ? $id("password").value.trim() : "";
          if (!username || !pass) {
            alert("Please enter both username and password!");
            return;
          }
          const loginSection = $id("login-section");
          if (loginSection) loginSection.style.display = "none";
          if (cameraSection) cameraSection.style.display = "block";

          if (!scores[username]) {
            scores[username] = 0;
            try { localStorage.setItem("scores", JSON.stringify(scores)); } catch (e) { /* ignore */ }
          }

          totalPoints = scores[username] || 0;
          startCamera();
          updateScoreboard();
        });
      }
    }

    // Attach capture button
    if (captureBtn) {
      captureBtn.addEventListener("click", handleScanClick);
    } else {
      console.warn("[BASURAYT] capture button (#capture) missing.");
    }

    // Attach reset
    if (resetBtn) resetBtn.addEventListener("click", handleReset);

    // Sidebar toggles
    attachSidebarToggles();

    // Close buttons might be added dynamically; re-query
    closeBtns = document.querySelectorAll(".close-btn");
    closeBtns.forEach(btn => {
      if (!btn.__basurayt_bound) {
        btn.addEventListener("click", e => {
          const target = e.target.dataset.target;
          if (target) {
            const el = document.getElementById(target);
            if (el) el.classList.remove("visible");
          }
        });
        btn.__basurayt_bound = true;
      }
    });

    // Ensure premium controls exist and work
    ensurePremiumControls();

    // Final initial scoreboard/waste update
    updateScoreboard();
    updateWasteTrack();

    console.log("[BASURAYT] script initialized. Premium active:", window.isPremiumActive);
  });
})();
