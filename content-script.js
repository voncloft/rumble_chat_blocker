const USER_TAG_SELECTOR = "button.js-user-tag";
const STORAGE_KEY = "blockedUsers";
const HIDDEN_CLASS = "rumble-chat-blocker-hidden";
const BLOCK_BUTTON_CLASS = "rumble-chat-blocker-button";
const ROW_SELECTOR = ".chat-history--row, .chat-history--rant, .chat-history--notification";

let blockedUsers = new Map();
let observer = null;

function normalizeUsername(username) {
  return username.trim().toLowerCase();
}

function buildFilter(username) {
  return `rumble.com##button.js-user-tag:has-text(${username}):upward(.chat-history--row)`;
}

function getRowFromUserTag(userTag) {
  return userTag?.closest(ROW_SELECTOR) ?? userTag?.parentElement ?? null;
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
      display: inline-flex;
      align-items: center;
      margin-left: 6px;
      margin-right: 6px;
      border: 0;
      border-radius: 999px;
      padding: 2px 8px;
      font: inherit;
      font-size: 11px;
      line-height: 1.6;
      cursor: pointer;
      white-space: nowrap;
      flex: 0 0 auto;
      vertical-align: middle;
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
      .then(() => {
        processDocument();
      })
      .catch((error) => console.error("Failed to block Rumble chat user:", error));
  });

  return button;
}

function ensureLiteralSpace(button, shouldExist) {
  const nextSibling = button.nextSibling;
  const existingSpace =
    nextSibling instanceof Text && nextSibling.nodeValue === " " ? nextSibling : null;

  if (!shouldExist) {
    existingSpace?.remove();
    return;
  }

  if (existingSpace) {
    return;
  }

  button.after(document.createTextNode(" "));
}

function ensureBlockButton(userTag, username) {
  const row = getRowFromUserTag(userTag);
  if (!row) {
    return;
  }

  const container = userTag.parentElement;
  if (!container) {
    return;
  }

  const usernameKey = normalizeUsername(username);
  const badgesWrapper = Array.from(container.children).find((child) =>
    child instanceof Element && child.classList.contains("chat-history--badges-wrapper")
  );
  const hasBadges = badgesWrapper instanceof Element && badgesWrapper.children.length > 0;
  const existingButton = Array.from(container.querySelectorAll(`.${BLOCK_BUTTON_CLASS}`)).find(
    (button) => button.dataset.usernameKey === usernameKey
  );
  if (existingButton) {
    ensureLiteralSpace(existingButton, !hasBadges);
    return;
  }

  const button = createBlockButton(username);
  userTag.insertAdjacentElement("afterend", button);
  ensureLiteralSpace(button, !hasBadges);
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

  window.setInterval(() => {
    processDocument();
  }, 1500);
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
