const USER_TAG_SELECTOR = ".js-user-tag.chat-history--username";
const STORAGE_KEY = "blockedUsers";
const HIDDEN_CLASS = "rumble-chat-blocker-hidden";
const BLOCK_BUTTON_CLASS = "rumble-chat-blocker-button";

let blockedUsers = new Map();
let observer = null;

function normalizeUsername(username) {
  return username.trim().toLowerCase();
}

function buildFilter(username) {
  return `rumble.com##.js-user-tag.chat-history--username:has-text(${username}):upward(1)`;
}

function getRowFromUserTag(userTag) {
  return userTag?.parentElement ?? null;
}

function getUsernameFromTag(userTag) {
  return userTag?.textContent?.trim() ?? "";
}

function ensureStyle() {
  if (document.getElementById("rumble-chat-blocker-style")) {
    return;
  }

  const style = document.createElement("style");
  style.id = "rumble-chat-blocker-style";
  style.textContent = `
    .${HIDDEN_CLASS} {
      display: none !important;
    }

    .${BLOCK_BUTTON_CLASS} {
      margin-left: 8px;
      border: 0;
      border-radius: 999px;
      padding: 2px 8px;
      font: inherit;
      font-size: 11px;
      line-height: 1.6;
      cursor: pointer;
      color: #111827;
      background: #f59e0b;
    }

    .${BLOCK_BUTTON_CLASS}:hover {
      background: #fbbf24;
    }
  `;
  document.documentElement.appendChild(style);
}

function hideRow(row) {
  row.classList.add(HIDDEN_CLASS);
}

function showRow(row) {
  row.classList.remove(HIDDEN_CLASS);
}

function processUserTag(userTag) {
  const username = getUsernameFromTag(userTag);
  if (!username) {
    return;
  }

  const row = getRowFromUserTag(userTag);
  if (!row) {
    return;
  }

  ensureBlockButton(userTag, username);

  if (blockedUsers.has(normalizeUsername(username))) {
    hideRow(row);
  } else {
    showRow(row);
  }
}

function processNode(node) {
  if (!(node instanceof Element)) {
    return;
  }

  if (node.matches(USER_TAG_SELECTOR)) {
    processUserTag(node);
  }

  const userTags = node.querySelectorAll(USER_TAG_SELECTOR);
  for (const userTag of userTags) {
    processUserTag(userTag);
  }
}

function processDocument() {
  processNode(document.documentElement);
}

async function loadBlockedUsers() {
  const stored = await browser.storage.local.get(STORAGE_KEY);
  const list = Array.isArray(stored[STORAGE_KEY]) ? stored[STORAGE_KEY] : [];

  blockedUsers = new Map();
  for (const username of list) {
    const cleanName = typeof username === "string" ? username.trim() : "";
    if (!cleanName) {
      continue;
    }
    blockedUsers.set(normalizeUsername(cleanName), cleanName);
  }
}

async function saveBlockedUsers() {
  await browser.storage.local.set({
    [STORAGE_KEY]: Array.from(blockedUsers.values()),
  });
}

async function addBlockedUser(username) {
  const cleanName = username.trim();
  if (!cleanName) {
    return { added: false, username: "" };
  }

  const normalized = normalizeUsername(cleanName);
  const alreadyBlocked = blockedUsers.has(normalized);
  blockedUsers.set(normalized, cleanName);
  await saveBlockedUsers();

  return {
    added: !alreadyBlocked,
    username: cleanName,
    filter: buildFilter(cleanName),
  };
}

function createBlockButton(username) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = BLOCK_BUTTON_CLASS;
  button.textContent = "Block";
  button.title = `Block ${username}`;
  button.dataset.usernameKey = normalizeUsername(username);
  button.addEventListener("click", (event) => {
    event.preventDefault();
    event.stopPropagation();

    addBlockedUser(username)
      .then(() => window.location.reload())
      .catch((error) => console.error("Failed to block Rumble chat user:", error));
  });

  return button;
}

function ensureBlockButton(userTag, username) {
  const row = getRowFromUserTag(userTag);
  if (!row) {
    return;
  }

  const usernameKey = normalizeUsername(username);
  const existingButton = row.querySelector(`.${BLOCK_BUTTON_CLASS}[data-username-key="${usernameKey}"]`);
  if (existingButton) {
    return;
  }

  const button = createBlockButton(username);
  if (userTag.nextSibling) {
    row.insertBefore(button, userTag.nextSibling);
  } else {
    row.appendChild(button);
  }
}

function startObserving() {
  if (observer) {
    observer.disconnect();
  }

  observer = new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      for (const node of mutation.addedNodes) {
        processNode(node);
      }
    }
  });

  observer.observe(document.documentElement, {
    childList: true,
    subtree: true,
  });
}

browser.storage.onChanged.addListener((changes, areaName) => {
  if (areaName !== "local" || !changes[STORAGE_KEY]) {
    return;
  }

  loadBlockedUsers()
    .then(processDocument)
    .catch((error) => console.error("Failed to refresh blocked users:", error));
});

(async () => {
  ensureStyle();
  await loadBlockedUsers();
  processDocument();
  startObserving();
})();
