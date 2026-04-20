const STORAGE_KEY = "bookmarkTags";

const state = {
  query: "",
  activeTag: null,
  bookmarks: [],
  tagMap: {}
};

const els = {
  searchInput: document.getElementById("searchInput"),
  addCurrentBtn: document.getElementById("addCurrentBtn"),
  tagList: document.getElementById("tagList"),
  bookmarkList: document.getElementById("bookmarkList"),
  totalCount: document.getElementById("totalCount"),
  resultCount: document.getElementById("resultCount"),
  cardTpl: document.getElementById("bookmarkCardTemplate")
};

init();

async function init() {
  bindEvents();
  await loadData();
  render();
}

function bindEvents() {
  els.searchInput.addEventListener("input", (event) => {
    state.query = event.target.value.trim().toLowerCase();
    render();
  });

  els.addCurrentBtn.addEventListener("click", addCurrentTabAsBookmark);
}

async function loadData() {
  const [tree, stored] = await Promise.all([
    chrome.bookmarks.getTree(),
    chrome.storage.local.get(STORAGE_KEY)
  ]);
  state.tagMap = stored[STORAGE_KEY] || {};
  state.bookmarks = flattenBookmarks(tree);
}

function flattenBookmarks(nodes, acc = []) {
  for (const node of nodes) {
    if (node.url) {
      acc.push(node);
    }
    if (node.children?.length) {
      flattenBookmarks(node.children, acc);
    }
  }
  return acc;
}

function getFilteredBookmarks() {
  return state.bookmarks.filter((item) => {
    const tags = state.tagMap[item.id] || [];
    const hitQuery =
      !state.query ||
      (item.title || "").toLowerCase().includes(state.query) ||
      item.url.toLowerCase().includes(state.query) ||
      tags.some((tag) => tag.toLowerCase().includes(state.query));

    const hitTag = !state.activeTag || tags.includes(state.activeTag);
    return hitQuery && hitTag;
  });
}

function render() {
  const filtered = getFilteredBookmarks();
  renderTagSidebar();
  renderBookmarks(filtered);
  els.totalCount.textContent = String(state.bookmarks.length);
  els.resultCount.textContent = `显示 ${filtered.length} / ${state.bookmarks.length}`;
}

function renderTagSidebar() {
  const map = new Map();
  Object.values(state.tagMap).flat().forEach((tag) => {
    map.set(tag, (map.get(tag) || 0) + 1);
  });

  els.tagList.innerHTML = "";
  if (map.size === 0) {
    const li = document.createElement("li");
    li.className = "empty";
    li.textContent = "暂无标签";
    els.tagList.appendChild(li);
    return;
  }

  [...map.entries()]
    .sort((a, b) => b[1] - a[1])
    .forEach(([tag, count]) => {
      const li = document.createElement("li");
      li.className = `tag-row ${state.activeTag === tag ? "active" : ""}`;
      li.innerHTML = `<span>${tag}</span><span class="count">${count}</span>`;
      li.addEventListener("click", () => {
        state.activeTag = state.activeTag === tag ? null : tag;
        render();
      });
      els.tagList.appendChild(li);
    });
}

function renderBookmarks(items) {
  els.bookmarkList.innerHTML = "";
  if (items.length === 0) {
    const div = document.createElement("div");
    div.className = "empty";
    div.textContent = "没有符合条件的书签";
    els.bookmarkList.appendChild(div);
    return;
  }

  items.forEach((bookmark) => {
    const card = els.cardTpl.content.firstElementChild.cloneNode(true);
    const title = card.querySelector(".bookmark-title");
    const url = card.querySelector(".bookmark-url");
    const tagWrap = card.querySelector(".bookmark-tags");
    const tagForm = card.querySelector(".tag-form");
    const tagInput = card.querySelector(".tag-input");
    const deleteBtn = card.querySelector(".delete-btn");

    title.textContent = bookmark.title || "(无标题)";
    url.textContent = toShortDomain(bookmark.url);
    url.href = bookmark.url;

    const tags = state.tagMap[bookmark.id] || [];
    tags.forEach((tag) => {
      const span = document.createElement("span");
      span.className = "tag-pill";
      span.textContent = tag;
      tagWrap.appendChild(span);
    });

    tagForm.addEventListener("submit", async (event) => {
      event.preventDefault();
      const inputTags = tagInput.value
        .split(",")
        .map((v) => v.trim())
        .filter(Boolean);
      state.tagMap[bookmark.id] = [...new Set(inputTags)];
      await chrome.storage.local.set({ [STORAGE_KEY]: state.tagMap });
      render();
    });

    deleteBtn.addEventListener("click", async () => {
      await chrome.bookmarks.remove(bookmark.id);
      delete state.tagMap[bookmark.id];
      await chrome.storage.local.set({ [STORAGE_KEY]: state.tagMap });
      await loadData();
      render();
    });

    els.bookmarkList.appendChild(card);
  });
}

async function addCurrentTabAsBookmark() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab || !tab.url) {
    return;
  }
  await chrome.bookmarks.create({ title: tab.title || tab.url, url: tab.url });
  await loadData();
  render();
}

function toShortDomain(url) {
  try {
    return new URL(url).host;
  } catch {
    return url;
  }
}
