// ==UserScript==
// @name         ChatGPT Message Navigator
// @namespace    http://tampermonkey.net/
// @version      2026-03-22
// @description  ChatGPT Message Navigator
// @match        https://chatgpt.com/*
// @icon         https://www.google.com/s2/favicons?sz=64&domain=chatgpt.com
// @grant        none
// ==/UserScript==

(function () {
  const SIDEBAR_ID = "__chat_nav_sidebar__";
  const STYLE_ID = "__chat_nav_sidebar_style__";
  const WIDTH = 320;

  let sidebar = null;
  let list = null;
  let observer = null;
  let lastHash = null;
  let currentActive = null;
  let collapsed = false;
  let reopenTab = null;
  let messageItems = [];
  let scrollTrackTimer = null;
  let scrollTrackContainer = null;

  function isConversation() {
    return /^\/c\//.test(location.pathname);
  }

  function getMain() {
    return (
      document.querySelector("main") ||
      document.querySelector('[role="main"]') ||
      document.body
    );
  }

  function getScrollbarWidth() {
    const div = document.createElement("div");
    div.style.cssText =
      "width:100px;height:100px;overflow:scroll;position:absolute;top:-9999px;visibility:hidden";
    document.body.appendChild(div);
    const width = div.offsetWidth - div.clientWidth;
    document.body.removeChild(div);
    return width;
  }

  function applyMargin(enable) {
    const main = getMain();
    if (!main) return;

    if (enable) {
      main.style.transition = "margin-right 0.25s ease";
      main.style.marginRight = WIDTH + getScrollbarWidth() + "px";
    } else {
      main.style.marginRight = "";
    }
  }

  function createStyle() {
    if (document.getElementById(STYLE_ID)) return;

    const style = document.createElement("style");
    style.id = STYLE_ID;
    style.textContent = `
      #${SIDEBAR_ID}{
        position:fixed;
        top:0;
        right:0;
        width:${WIDTH}px;
        height:100vh;
        background:rgb(24, 24, 24);
        border-left:1px solid rgba(255, 255, 255, 0.1);
        z-index:9999;
        display:flex;
        flex-direction:column;
        font-family:system-ui, sans-serif;
        transform:translateX(100%);
        transition:transform .25s ease;
      }
      #${SIDEBAR_ID}.open{
        transform:translateX(0);
      }
      #${SIDEBAR_ID} header{
        display:flex;
        align-items:center;
        justify-content:space-between;
        padding:12px 14px;
        font-size:13px;
        color:rgb(255, 255, 255);
        border-bottom:1px solid rgba(255, 255, 255, 0.1);
      }
      .__chat_nav_load_btn{
        font-size:11px;
        padding:3px 8px;
        border-radius:5px;
        border:1px solid rgba(255, 255, 255, 0.05);
        background:#ffffff0d;
        color:rgb(255, 255, 255);
        cursor:pointer;
        white-space:nowrap;
      }
      .__chat_nav_load_btn:disabled{
        opacity:0.5;
        cursor:not-allowed;
      }
      .__chat_nav_load_btn:hover:not(:disabled){
        background:rgba(255, 255, 255, 0.1);
        color:#e5e7eb;
      }
      #${SIDEBAR_ID} .list{
        overflow:auto;
        flex:1;
        padding:8px;
      }
      .__chat_nav_item{
        padding:8px 10px;
        margin-bottom:6px;
        border-radius:8px;
        font-size:12px;
        line-height:1.4;
        cursor:pointer;
        color:#e5e7eb;
        transition:background .15s;
        word-break:break-word;
      }
      .__chat_nav_user{
        background:#ffffff0d;
        font-weight:600;
      }
      .__chat_nav_assistant{
        background:transparent;
      }
      .__chat_nav_item:hover{
        background:rgba(255, 255, 255, 0.1);
      }
      .__chat_nav_item.active{
        outline:1px solid var(--theme-user-msg-bg);
      }
      .__chat_nav_toggle_btn{
        font-size:14px;
        line-height:1;
        padding:2px 6px;
        border-radius:5px;
        border:1px solid transparent;
        background:transparent;
        color:#ffffff;
        cursor:pointer;
        margin-left:4px;
      }
      .__chat_nav_toggle_btn:hover{
        background:rgba(255, 255, 255, 0.1);
        color:#e5e7eb;
      }
      .__chat_nav_reopen_tab{
        position:fixed;
        top:50%;
        transform:translateY(-50%);
        width:20px;
        height:56px;
        background:rgb(24,24,24);
        border:1px solid rgba(255, 255, 255, 0.1);
        border-right:none;
        border-radius:6px 0 0 6px;
        display:flex;
        align-items:center;
        justify-content:center;
        font-size:12px;
        color:#9ca3af;
        cursor:pointer;
        z-index:9998;
        transition:background .15s;
      }
      .__chat_nav_reopen_tab:hover{
        background:rgba(255, 255, 255, 0.1);
        color:#e5e7eb;
      }
      @keyframes __chat_nav_shimmer{
        0%  { opacity:0.35; }
        50% { opacity:0.7; }
        100%{ opacity:0.35; }
      }
      .__chat_nav_skeleton{
        border-radius:8px;
        background:rgba(255, 255, 255, 0.1);
        margin-bottom:6px;
        animation:__chat_nav_shimmer 1.4s ease-in-out infinite;
      }

      html.light #${SIDEBAR_ID},
      html[style*="color-scheme: light"] #${SIDEBAR_ID}{
        background:rgb(249,249,249);
        border-left-color:rgba(0,0,0,0.1);
      }
      html.light #${SIDEBAR_ID} header,
      html[style*="color-scheme: light"] #${SIDEBAR_ID} header{
        color:rgb(13,13,13);
        border-bottom-color:rgba(0,0,0,0.1);
      }
      html.light .__chat_nav_load_btn,
      html[style*="color-scheme: light"] .__chat_nav_load_btn{
        border-color:rgba(0,0,0,0.08);
        background:rgba(0,0,0,0.04);
        color:rgb(13,13,13);
      }
      html.light .__chat_nav_load_btn:hover:not(:disabled),
      html[style*="color-scheme: light"] .__chat_nav_load_btn:hover:not(:disabled){
        background:rgba(0,0,0,0.08);
        color:#374151;
      }
      html.light .__chat_nav_item,
      html[style*="color-scheme: light"] .__chat_nav_item{ color:#374151; }
      html.light .__chat_nav_user,
      html[style*="color-scheme: light"] .__chat_nav_user{ background:rgba(0,0,0,0.04); }
      html.light .__chat_nav_assistant,
      html[style*="color-scheme: light"] .__chat_nav_assistant{ background:transparent; }
      html.light .__chat_nav_item:hover,
      html[style*="color-scheme: light"] .__chat_nav_item:hover{ background:rgba(0,0,0,0.08); }
      html.light .__chat_nav_item.active,
      html[style*="color-scheme: light"] .__chat_nav_item.active{ outline-color:#2563eb; }
      html.light .__chat_nav_toggle_btn,
      html[style*="color-scheme: light"] .__chat_nav_toggle_btn{ color:rgb(13,13,13); }
      html.light .__chat_nav_toggle_btn:hover,
      html[style*="color-scheme: light"] .__chat_nav_toggle_btn:hover{
        background:rgba(0,0,0,0.08);
        color:#374151;
      }
      html.light .__chat_nav_reopen_tab,
      html[style*="color-scheme: light"] .__chat_nav_reopen_tab{
        background:rgb(249,249,249);
        border-color:rgba(0,0,0,0.1);
        color:#6b7280;
      }
      html.light .__chat_nav_reopen_tab:hover,
      html[style*="color-scheme: light"] .__chat_nav_reopen_tab:hover{
        background:rgba(0,0,0,0.08);
        color:#374151;
      }
      html.light .__chat_nav_skeleton,
      html[style*="color-scheme: light"] .__chat_nav_skeleton{ background:rgba(0,0,0,0.08); }
    `;
    document.head.appendChild(style);
  }

  function toggleCollapse() {
    collapsed = !collapsed;
    if (collapsed) {
      sidebar.classList.remove("open");
      applyMargin(false);
      if (reopenTab) reopenTab.style.display = "flex";
    } else {
      sidebar.style.right = "0" + "px";
      sidebar.classList.add("open");
      applyMargin(true);
      if (reopenTab) reopenTab.style.display = "none";
    }
  }

  function createSidebar() {
    if (sidebar) return;

    sidebar = document.createElement("div");
    sidebar.id = SIDEBAR_ID;
    sidebar.style.right = "0" + "px";

    const header = document.createElement("header");

    const title = document.createElement("span");
    title.textContent = "List Messages";

    const headerRight = document.createElement("div");
    headerRight.style.cssText = "display:flex;align-items:center;gap:4px;";

    const loadBtn = document.createElement("button");
    loadBtn.className = "__chat_nav_load_btn";
    loadBtn.textContent = "Load All";
    loadBtn.onclick = () => loadAll(loadBtn);

    const toggleBtn = document.createElement("button");
    toggleBtn.className = "__chat_nav_toggle_btn";
    toggleBtn.textContent = "›";
    toggleBtn.title = "Collapse";
    toggleBtn.onclick = toggleCollapse;

    headerRight.appendChild(loadBtn);
    headerRight.appendChild(toggleBtn);

    header.appendChild(title);
    header.appendChild(headerRight);

    list = document.createElement("div");
    list.className = "list";

    sidebar.appendChild(header);
    sidebar.appendChild(list);

    reopenTab = document.createElement("div");
    reopenTab.className = "__chat_nav_reopen_tab";
    reopenTab.textContent = "‹";
    reopenTab.title = "Open panel";
    reopenTab.style.display = "none";
    reopenTab.style.right = getScrollbarWidth() + "px";
    reopenTab.onclick = toggleCollapse;

    document.body.appendChild(sidebar);
    document.body.appendChild(reopenTab);

    requestAnimationFrame(() => {
      sidebar.classList.add("open");
    });
  }

  function destroySidebar() {
    if (!sidebar) return;
    sidebar.remove();
    sidebar = null;
    list = null;
    collapsed = false;
    messageItems = [];

    if (reopenTab) {
      reopenTab.remove();
      reopenTab = null;
    }

    applyMargin(false);
    stopScrollTracking();

    if (observer) {
      observer.disconnect();
      observer = null;
    }
  }

  function getMessages() {
    return Array.from(document.querySelectorAll("[data-message-author-role]"));
  }

  function preview(text) {
    const t = text.replace(/\n/g, " ").trim();
    if (t.length <= 120) return t;
    return t.slice(0, 120) + "…";
  }

  function hashMessages(msgs) {
    return msgs.map((m) => m.innerText.length).join(",");
  }

  function scrollToMessage(el, item) {
    if (currentActive) currentActive.classList.remove("active");
    item.classList.add("active");
    currentActive = item;

    el.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function findScrollContainer() {
    const firstMsg = document.querySelector("[data-message-author-role]");
    if (!firstMsg) return null;
    let el = firstMsg.parentElement;
    while (el && el !== document.body) {
      const ov = window.getComputedStyle(el).overflowY;
      if (/auto|scroll/.test(ov) && el.scrollHeight > el.clientHeight)
        return el;
      el = el.parentElement;
    }
    return document.documentElement;
  }

  async function loadAll(btn) {
    btn.disabled = true;
    btn.textContent = "Loading…";
    showSkeleton();
    lastHash = null;

    const container = findScrollContainer();
    if (!container) {
      btn.disabled = false;
      btn.textContent = "Load All";
      return;
    }

    let stableCount = 0;
    while (stableCount < 3) {
      const before = getMessages().length;
      container.scrollTop = 0;
      await new Promise((r) => setTimeout(r, 800));
      const after = getMessages().length;
      if (after === before) {
        stableCount++;
      } else {
        stableCount = 0;
      }
    }

    buildList();
    container.scrollTop = container.scrollHeight;

    btn.disabled = false;
    btn.textContent = "Load All";
  }

  function showSkeleton() {
    if (!list) return;
    list.innerHTML = "";
    const heights = [40, 64, 40, 80, 40, 56, 40, 72];
    heights.forEach((h, i) => {
      const sk = document.createElement("div");
      sk.className = "__chat_nav_skeleton";
      sk.style.height = h + "px";
      sk.style.animationDelay = i * 0.1 + "s";
      list.appendChild(sk);
    });
  }

  function updateActiveByScroll() {
    if (!messageItems.length) return;
    let best = null;
    let bestTop = -Infinity;
    messageItems.forEach(({ msgEl, panelItem }) => {
      const top = msgEl.getBoundingClientRect().top;
      if (top <= 80 && top > bestTop) {
        bestTop = top;
        best = panelItem;
      }
    });
    if (!best) best = messageItems[messageItems.length - 1].panelItem;
    if (best && best !== currentActive) {
      if (currentActive) currentActive.classList.remove("active");
      best.classList.add("active");
      currentActive = best;
      best.scrollIntoView({ block: "nearest" });
    }
  }

  function startScrollTracking() {
    stopScrollTracking();
    scrollTrackContainer = findScrollContainer();
    if (!scrollTrackContainer) return;
    const handler = () => {
      clearTimeout(scrollTrackTimer);
      scrollTrackTimer = setTimeout(updateActiveByScroll, 50);
    };
    scrollTrackContainer._chatNavScrollHandler = handler;
    scrollTrackContainer.addEventListener("scroll", handler, { passive: true });
  }

  function stopScrollTracking() {
    if (scrollTrackContainer && scrollTrackContainer._chatNavScrollHandler) {
      scrollTrackContainer.removeEventListener(
        "scroll",
        scrollTrackContainer._chatNavScrollHandler,
      );
      delete scrollTrackContainer._chatNavScrollHandler;
    }
    scrollTrackContainer = null;
    clearTimeout(scrollTrackTimer);
  }

  function buildList() {
    if (!list) return;

    const messages = getMessages();
    const hash = hashMessages(messages);
    if (hash === lastHash) return;
    lastHash = hash;

    if (!messages.length) {
      showSkeleton();
      return;
    }

    list.innerHTML = "";
    messageItems = [];

    const reversed = [...messages].reverse();

    reversed.forEach((m) => {
      const role = m.getAttribute("data-message-author-role");
      const text = preview(m.innerText || "");

      const item = document.createElement("div");
      item.className =
        "__chat_nav_item " +
        (role === "user" ? "__chat_nav_user" : "__chat_nav_assistant");

      const icon = role === "user" ? "👤 " : "🤖 ";
      item.textContent = icon + text;

      item.onclick = () => scrollToMessage(m, item);

      list.appendChild(item);
      messageItems.push({ msgEl: m, panelItem: item });
    });

    messageItems.reverse();
    startScrollTracking();
  }

  function observe() {
    const target = getMain();
    if (!target) return;

    if (observer) observer.disconnect();

    let debounceTimer = null;
    observer = new MutationObserver(() => {
      clearTimeout(debounceTimer);
      debounceTimer = setTimeout(buildList, 500);
    });

    observer.observe(target, {
      childList: true,
      subtree: true,
    });
  }

  function activate() {
    if (!isConversation()) {
      destroySidebar();
      return;
    }

    createStyle();
    createSidebar();
    applyMargin(true);
    buildList();
    observe();
  }

  function patchHistory() {
    const push = history.pushState;
    const replace = history.replaceState;

    history.pushState = function () {
      push.apply(this, arguments);
      setTimeout(activate, 50);
    };

    history.replaceState = function () {
      replace.apply(this, arguments);
      setTimeout(activate, 50);
    };

    window.addEventListener("popstate", () => {
      setTimeout(activate, 50);
    });
  }

  function init() {
    patchHistory();
    activate();
  }

  init();
})();
