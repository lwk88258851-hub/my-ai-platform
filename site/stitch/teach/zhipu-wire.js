const FN_CANDIDATES = ["zhipu-ai-service", "dynamic-service"];
const _originalFetch = globalThis.fetch ? globalThis.fetch.bind(globalThis) : null;

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function elFromHtml(html) {
  const t = document.createElement("template");
  t.innerHTML = html.trim();
  return t.content.firstElementChild;
}

function ensureOverlay() {
  let root = document.getElementById("zhipu-wire-root");
  if (root) return root;

  root = elFromHtml(`
    <div id="zhipu-wire-root" style="position:fixed;inset:0;pointer-events:none;z-index:2147483647;">
      <div id="zhipu-wire-toast" style="position:fixed;left:50%;top:18px;transform:translateX(-50%);background:rgba(15,23,42,0.92);color:#fff;border:1px solid rgba(255,255,255,0.12);padding:10px 14px;border-radius:12px;font:600 13px/1.2 system-ui, -apple-system, Segoe UI, Roboto, Noto Sans SC, Arial;display:none;pointer-events:none;max-width:min(92vw,760px);"></div>
      <div id="zhipu-wire-panel" style="position:fixed;right:18px;bottom:18px;width:min(560px,92vw);max-height:min(70vh,720px);display:none;flex-direction:column;background:#ffffff;border:1px solid rgba(15,23,42,0.12);border-radius:18px;box-shadow:0 18px 60px rgba(15,23,42,0.18);overflow:hidden;pointer-events:auto;">
        <div style="display:flex;align-items:center;justify-content:space-between;padding:12px 14px;background:linear-gradient(180deg,#ffffff,#f8fafc);border-bottom:1px solid rgba(15,23,42,0.08);">
          <div>
            <div id="zhipu-wire-title" style="font:900 14px/1.2 system-ui, -apple-system, Segoe UI, Roboto, Noto Sans SC, Arial;color:#0f172a;">AI 生成结果</div>
            <div id="zhipu-wire-subtitle" style="font:600 12px/1.2 system-ui, -apple-system, Segoe UI, Roboto, Noto Sans SC, Arial;color:rgba(15,23,42,0.6);margin-top:4px;">由 Supabase Edge Function 生成</div>
          </div>
          <div style="display:flex;gap:8px;">
            <button id="zhipu-wire-copy" type="button" style="height:34px;padding:0 12px;border-radius:12px;border:1px solid rgba(15,23,42,0.16);background:#fff;font:800 12px/1 system-ui, -apple-system, Segoe UI, Roboto, Noto Sans SC, Arial;color:#0f172a;cursor:pointer;">复制</button>
            <button id="zhipu-wire-close" type="button" style="height:34px;width:34px;border-radius:12px;border:1px solid rgba(15,23,42,0.16);background:#fff;font:900 14px/1 system-ui, -apple-system, Segoe UI, Roboto, Noto Sans SC, Arial;color:#0f172a;cursor:pointer;">×</button>
          </div>
        </div>
        <div id="zhipu-wire-body" style="padding:14px;overflow:auto;background:#fff;">
          <pre id="zhipu-wire-text" style="margin:0;white-space:pre-wrap;word-break:break-word;font:600 13px/1.7 ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace;color:#0f172a;"></pre>
          <div id="zhipu-wire-media" style="display:none;gap:10px;flex-direction:column;"></div>
        </div>
        <div id="zhipu-wire-footer" style="padding:10px 14px;border-top:1px solid rgba(15,23,42,0.08);display:flex;gap:10px;align-items:center;justify-content:space-between;background:#fff;">
          <div id="zhipu-wire-status" style="font:700 12px/1.2 system-ui, -apple-system, Segoe UI, Roboto, Noto Sans SC, Arial;color:rgba(15,23,42,0.62);">就绪</div>
          <div style="display:flex;gap:10px;align-items:center;">
            <button id="zhipu-wire-open-in-new" type="button" style="height:34px;padding:0 12px;border-radius:12px;border:1px solid rgba(15,23,42,0.16);background:#fff;font:800 12px/1 system-ui, -apple-system, Segoe UI, Roboto, Noto Sans SC, Arial;color:#0f172a;cursor:pointer;">打开接口结果</button>
          </div>
        </div>
      </div>
    </div>
  `);
  document.body.appendChild(root);

  const panel = document.getElementById("zhipu-wire-panel");
  const close = document.getElementById("zhipu-wire-close");
  close?.addEventListener("click", () => {
    if (panel) panel.style.display = "none";
  });

  document.getElementById("zhipu-wire-copy")?.addEventListener("click", async () => {
    const t = document.getElementById("zhipu-wire-text")?.textContent || "";
    if (!t.trim()) return;
    try {
      await navigator.clipboard.writeText(t);
      toast("已复制到剪贴板");
    } catch {
      toast("复制失败（浏览器权限限制）");
    }
  });

  document.getElementById("zhipu-wire-open-in-new")?.addEventListener("click", () => {
    const u = document.getElementById("zhipu-wire-open-in-new")?.getAttribute("data-url") || "";
    if (u) window.open(u, "_blank", "noopener,noreferrer");
  });

  return root;
}

function toast(msg) {
  ensureOverlay();
  const t = document.getElementById("zhipu-wire-toast");
  if (!t) return;
  t.textContent = msg;
  t.style.display = "block";
  window.clearTimeout((toast)._t);
  (toast)._t = window.setTimeout(() => {
    t.style.display = "none";
  }, 1800);
}

async function getSupabaseInfo() {
  if (getSupabaseInfo._cache) return getSupabaseInfo._cache;

  const candidates = [
    "/stitch/teach/assets/index.js",
    "/stitch/ai-home/assets/index-DkoDiGSs.js",
  ];
  let text = "";
  for (const jsUrl of candidates) {
    try {
      const r = await fetch(jsUrl, { cache: "no-store" });
      if (r.ok) {
        text = await r.text();
        if (text) break;
      }
    } catch {}
  }
  if (!text) throw new Error("未找到 Supabase 配置信息（页面资源）");

  const urlMatch = text.match(/https:\/\/([a-z0-9]+)\.supabase\.co/i);
  const keyMatch = text.match(/sb_publishable_[A-Za-z0-9_]+/);

  if (!urlMatch) throw new Error("未找到 Supabase URL（teach 资源）");
  if (!keyMatch) throw new Error("未找到 Supabase anon key（teach 资源）");

  const projectRef = urlMatch[1];
  const supabaseUrl = `https://${projectRef}.supabase.co`;
  const anonKey = keyMatch[0];
  const functionsBase = `${supabaseUrl}/functions/v1`;

  getSupabaseInfo._cache = { projectRef, supabaseUrl, anonKey, functionsBase };
  return getSupabaseInfo._cache;
}

function getAccessToken(projectRef) {
  const directKey = `sb-${projectRef}-auth-token`;
  const candidates = [];
  try {
    candidates.push(directKey);
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && k.startsWith("sb-") && k.endsWith("-auth-token")) candidates.push(k);
    }
  } catch {}

  for (const k of candidates) {
    try {
      const raw = localStorage.getItem(k);
      if (!raw) continue;
      const v = JSON.parse(raw);
      const token =
        v?.access_token ||
        v?.currentSession?.access_token ||
        v?.session?.access_token ||
        v?.data?.session?.access_token ||
        null;
      if (typeof token === "string" && token) return token;
    } catch {}
  }
  return "";
}

function getSessionEntry(projectRef) {
  const directKey = `sb-${projectRef}-auth-token`;
  const candidates = [];
  try {
    candidates.push(directKey);
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && k.startsWith("sb-") && k.endsWith("-auth-token")) candidates.push(k);
    }
  } catch {}

  for (const k of candidates) {
    try {
      const raw = localStorage.getItem(k);
      if (!raw) continue;
      const v = JSON.parse(raw);
      const refresh =
        v?.refresh_token ||
        v?.currentSession?.refresh_token ||
        v?.session?.refresh_token ||
        v?.data?.session?.refresh_token ||
        null;
      if (typeof refresh === "string" && refresh) return { storageKey: k, value: v, refreshToken: refresh };
    } catch {}
  }
  return null;
}

async function refreshSupabaseSession() {
  const { projectRef, supabaseUrl, anonKey } = await getSupabaseInfo();
  const entry = getSessionEntry(projectRef);
  if (!entry) throw new Error("未找到 refresh_token");

  const url = `${supabaseUrl.replace(/\/+$/, "")}/auth/v1/token?grant_type=refresh_token`;
  const res = await _originalFetch(url, {
    method: "POST",
    headers: {
      apikey: anonKey,
      authorization: `Bearer ${anonKey}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({ refresh_token: entry.refreshToken }),
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg = data?.error_description || data?.msg || data?.message || "刷新会话失败";
    throw new Error(msg);
  }

  const nextAccess = String(data?.access_token || "").trim();
  const nextRefresh = String(data?.refresh_token || "").trim();
  if (!nextAccess || !nextRefresh) throw new Error("刷新会话返回缺少 token");

  const merged = { ...(entry.value || {}), ...data };
  try {
    localStorage.setItem(entry.storageKey, JSON.stringify(merged));
  } catch {}
  return nextAccess;
}

let __zhipuInFlight = null;
let __zhipuLastStartAt = 0;

function isConcurrencyError(err) {
  const msg = err instanceof Error ? err.message : String(err || "");
  if (msg.includes("\"code\":\"1302\"") || msg.includes("\"code\":1302")) return true;
  if (msg.includes("1302") && msg.includes("并发")) return true;
  if (msg.includes("concurrency") && msg.includes("1302")) return true;
  return false;
}

async function withSingleFlight(fn) {
  const now = Date.now();
  if (__zhipuInFlight) return __zhipuInFlight;
  if (now - __zhipuLastStartAt < 600) {
    await new Promise((r) => setTimeout(r, 600 - (now - __zhipuLastStartAt)));
  }
  __zhipuLastStartAt = Date.now();
  __zhipuInFlight = (async () => {
    try {
      return await fn();
    } finally {
      __zhipuInFlight = null;
    }
  })();
  return __zhipuInFlight;
}

async function callEdgeWithRetry(path, method, body) {
  const delays = [800, 1600, 3200];
  let lastErr = null;
  for (let i = 0; i <= delays.length; i++) {
    try {
      return await callEdge(path, method, body);
    } catch (err) {
      lastErr = err;
      if (!isConcurrencyError(err) || i === delays.length) break;
      toast(`并发受限，自动重试（${i + 1}/${delays.length}）…`);
      await new Promise((r) => setTimeout(r, delays[i]));
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error("请求失败");
}

async function callEdge(path, method, body) {
  const { projectRef, anonKey, functionsBase } = await getSupabaseInfo();
  let accessToken = getAccessToken(projectRef);
  if (!accessToken) {
    window.location.replace("/stitch/login/index.html");
    throw new Error("未登录");
  }

  let lastErr = null;
  for (const fnName of FN_CANDIDATES) {
    const url = `${functionsBase}/${fnName}${path.startsWith("/") ? "" : "/"}${path}`;
    try {
      const doFetch = async () =>
        fetch(url, {
        method,
        headers: {
          apikey: anonKey,
          authorization: `Bearer ${accessToken}`,
          "content-type": "application/json",
        },
        body: body ? JSON.stringify(body) : undefined,
        });

      let res = await doFetch();
      if (res.status === 401) {
        const t = await res.text().catch(() => "");
        if (t.includes("Invalid JWT") || t.includes("invalid jwt") || t.includes("invalid_jwt")) {
          accessToken = await refreshSupabaseSession();
          res = await doFetch();
        } else {
          res = new Response(t, { status: 401, headers: res.headers });
        }
      }

      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        const code = data?.code || data?.error?.code || "";
        const msg = data?.message || data?.error || `请求失败（${res.status}）`;
        if (String(code) === "NOT_FOUND" || String(msg).includes("Requested function was not found")) {
          lastErr = new Error("NOT_FOUND");
          continue;
        }
        const detail = data?.detail ? JSON.stringify(data.detail).slice(0, 2000) : "";
        const e = new Error(detail ? `${msg}\n${detail}` : msg);
        e._code = String(code || "");
        throw e;
      }
      return { url, data };
    } catch (err) {
      lastErr = err;
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error("请求失败");
}

function extractGeminiPrompt(body) {
  if (!body || typeof body !== "object") return "";
  const contents = Array.isArray(body.contents) ? body.contents : [];
  const texts = [];
  for (const c of contents) {
    const parts = Array.isArray(c?.parts) ? c.parts : [];
    for (const p of parts) {
      if (typeof p?.text === "string" && p.text.trim()) texts.push(p.text.trim());
    }
  }
  if (texts.length) return texts.join("\n\n");
  if (typeof body.prompt === "string") return body.prompt.trim();
  if (typeof body.text === "string") return body.text.trim();
  return "";
}

function installGeminiFetchShim() {
  if (!_originalFetch) return;
  if (globalThis.__zhipuGeminiShimInstalled) return;
  globalThis.__zhipuGeminiShimInstalled = true;

  globalThis.fetch = async (input, init) => {
    try {
      const url = typeof input === "string" ? input : input?.url || "";
      const isGemini =
        typeof url === "string" &&
        url.includes("generativelanguage.googleapis.com") &&
        url.includes(":generateContent");
      if (!isGemini) return _originalFetch(input, init);

      let payload = null;
      try {
        const raw = init?.body;
        if (typeof raw === "string") payload = JSON.parse(raw);
      } catch {
        payload = null;
      }

      const instruction = extractGeminiPrompt(payload) || "请生成内容。";
      const { data } = await withSingleFlight(() => callEdgeWithRetry("text", "POST", { instruction }));
      const text = String(data?.text || "").trim();
      const respBody = {
        candidates: [
          {
            content: {
              parts: [{ text }],
            },
          },
        ],
      };
      return new Response(JSON.stringify(respBody), {
        status: 200,
        headers: { "content-type": "application/json; charset=utf-8" },
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      const respBody = { error: { message: msg, status: "ZHIPU_EDGE_ERROR" } };
      return new Response(JSON.stringify(respBody), {
        status: 500,
        headers: { "content-type": "application/json; charset=utf-8" },
      });
    }
  };
}

function findMainInput() {
  const inputs = Array.from(document.querySelectorAll("input, textarea"));
  for (const n of inputs) {
    const ph = (n.getAttribute("placeholder") || "").trim();
    if (!ph) continue;
    if (ph.includes("例如") || ph.includes("小学") || ph.includes("请输入")) return n;
  }
  return null;
}

function getActiveTitle() {
  const headers = Array.from(document.querySelectorAll("h1,h2,h3"));
  for (const h of headers) {
    const t = (h.textContent || "").trim();
    if (!t) continue;
    if (t.length >= 2 && t.length <= 18) return t;
  }
  return "";
}

function showPanel({ title, subtitle, text, mediaHtml, status, openUrl }) {
  ensureOverlay();
  const panel = document.getElementById("zhipu-wire-panel");
  const titleEl = document.getElementById("zhipu-wire-title");
  const subEl = document.getElementById("zhipu-wire-subtitle");
  const txt = document.getElementById("zhipu-wire-text");
  const media = document.getElementById("zhipu-wire-media");
  const st = document.getElementById("zhipu-wire-status");
  const openBtn = document.getElementById("zhipu-wire-open-in-new");

  if (titleEl) titleEl.textContent = title || "AI 生成结果";
  if (subEl) subEl.textContent = subtitle || "";
  if (txt) txt.textContent = text || "";
  if (st) st.textContent = status || "完成";
  if (openBtn) openBtn.setAttribute("data-url", openUrl || "");

  if (media) {
    if (mediaHtml) {
      media.style.display = "flex";
      media.innerHTML = mediaHtml;
    } else {
      media.style.display = "none";
      media.innerHTML = "";
    }
  }

  if (panel) panel.style.display = "flex";
}

async function runGenerate() {
  if (__zhipuInFlight) {
    toast("正在生成中，请稍候…");
    return;
  }
  const inputEl = findMainInput();
  const prompt = String(inputEl?.value || "").trim();
  if (!prompt) {
    toast("请输入内容后再生成");
    return;
  }

  const title = getActiveTitle();

  if (title.includes("图") && title.includes("视频")) {
    toast("图生视频需要上传图片：此版本先支持文生视频");
    return;
  }

  if (title.includes("视频")) {
    showPanel({
      title: "视频生成任务",
      subtitle: "正在提交任务…",
      text: "",
      status: "提交中",
      openUrl: "",
    });

    const { url, data } = await withSingleFlight(() => callEdgeWithRetry("video", "POST", { prompt }));
    const taskId = data.task_id;
    showPanel({
      title: "视频生成任务",
      subtitle: `task_id: ${taskId}`,
      text: `任务已创建：${taskId}\n正在查询状态…`,
      status: "排队/生成中",
      openUrl: url,
    });

    const startedAt = Date.now();
    for (;;) {
      await sleep(2000);
      const { data: st } = await callEdgeWithRetry(`video?task_id=${encodeURIComponent(taskId)}`, "GET");
      const result = st?.result || {};
      const videos = Array.isArray(result?.video_result) ? result.video_result : [];
      const videoUrl = videos?.[0]?.url || "";
      if (videoUrl) {
        showPanel({
          title: "视频生成完成",
          subtitle: `task_id: ${taskId}`,
          text: videoUrl,
          mediaHtml:
            `<video controls style="width:100%;border-radius:14px;border:1px solid rgba(15,23,42,0.12);background:#000;" src="${videoUrl}"></video>`,
          status: "完成",
          openUrl: videoUrl,
        });
        return;
      }
      const age = Date.now() - startedAt;
      showPanel({
        title: "视频生成中",
        subtitle: `task_id: ${taskId}`,
        text: `仍在生成中…\n已等待：${Math.round(age / 1000)} 秒`,
        status: "生成中",
        openUrl: "",
      });
      if (age > 6 * 60 * 1000) {
        throw new Error("视频生成超时（超过 6 分钟）");
      }
    }
  }

  if (title.includes("图")) {
    showPanel({
      title: "图片生成中",
      subtitle: "正在生成 1024×1024",
      text: "",
      status: "生成中",
      openUrl: "",
    });
    const { url, data } = await withSingleFlight(() => callEdgeWithRetry("image", "POST", { prompt }));
    const imgUrl = data.image_url || "";
    if (!imgUrl) throw new Error("图片生成未返回 image_url");
    showPanel({
      title: "图片生成完成",
      subtitle: "点击右下角按钮可在新窗口打开",
      text: imgUrl,
      mediaHtml:
        `<img alt="generated" src="${imgUrl}" style="width:100%;border-radius:14px;border:1px solid rgba(15,23,42,0.12);" />`,
      status: "完成",
      openUrl: imgUrl,
    });
    return;
  }

  showPanel({
    title: "教案生成中",
    subtitle: "glm-4.7（数学教学）",
    text: "",
    status: "生成中",
    openUrl: "",
  });
  const { url, data } = await withSingleFlight(() => callEdgeWithRetry("text", "POST", { instruction: prompt }));
  const text = data.text || "";
  showPanel({
    title: "教案生成完成",
    subtitle: "可直接复制到 Word",
    text,
    status: "完成",
    openUrl: url,
  });
}

function attachHandlers() {
  document.addEventListener(
    "click",
    (e) => {
      const target = e.target instanceof Element ? e.target : null;
      if (!target) return;
      const btn = target.closest("button");
      if (!btn) return;
      const label = (btn.textContent || "").replace(/\s+/g, " ").trim();
      if (!label) return;
      if (!label.includes("生成")) return;
      if (!(label.includes("生成内容") || label === "生成")) return;
      e.preventDefault();
      e.stopPropagation();
      try {
        e.stopImmediatePropagation();
      } catch {}
      runGenerate().catch((err) => {
        const msg = err instanceof Error ? err.message : String(err);
        showPanel({
          title: "生成失败",
          subtitle: "请检查 Edge Function / 环境变量 / 网络",
          text: msg,
          status: "失败",
          openUrl: "",
        });
        console.error(err);
      });
    },
    true,
  );

  document.addEventListener(
    "keydown",
    (e) => {
      const target = e.target instanceof Element ? e.target : null;
      if (!target) return;
      if (e.key !== "Enter") return;
      if (!(target.matches("input") || target.matches("textarea"))) return;
      const btns = Array.from(document.querySelectorAll("button"));
      const hasGenerate = btns.some((b) => (b.textContent || "").includes("生成内容"));
      if (!hasGenerate) return;
      if (target.matches("textarea")) return;
      e.preventDefault();
      runGenerate().catch((err) => console.error(err));
    },
    true,
  );
}

attachHandlers();
installGeminiFetchShim();
toast("已接入智谱 AI：点击“生成内容”即可调用 Edge Function");
